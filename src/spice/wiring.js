// Amplifier channels as netlist sources.
//
// Each channel is an AC voltage source at its level (volts at master 0 dB,
// scaled by the master), then its DSP, then its output resistance, then a
// current sense, then its load: a series/parallel tree whose leaves are
// driver nodes. The tree is compiled into terminal nodes for each driver, so
// the drivers themselves never need to know how they are wired.

import { loadLeaves } from '../schema/validate.js'
import { fmt, resistor } from './netlist.js'
import { filterSections, compileSections } from './filters.js'
import { signalExpression, signalPoints } from './dsp.js'

/**
 * A channel's source for a transient run: the test signal at the channel's level.
 *
 * The channel's volts are RMS, as in the sweep: a tone's peak is √2 times
 * them, and noise has them as its RMS. The run's `levelDb` moves every
 * channel together, like the master.
 *
 * @param {object} ctx - Compile context carrying `tran: {signal, levelDb, fs}`.
 * @param {string} node - The source node.
 * @param {number} volts - The channel's RMS volts at the master level, negative for inverted polarity.
 * @param {string} label - Channel label, for the comment.
 * @returns {void}
 * @mutates ctx.nl.
 */
function transientSource(ctx, node, volts, label) {
  const { signal, levelDb = 0, fs } = ctx.tran
  const rms = volts * Math.pow(10, levelDb / 20)
  if (signal.type === 'noise') {
    // Every point of a PWL source is a breakpoint the solver must stop at, so
    // the noise is sampled at eight times its top frequency, not at the
    // output rate — it has nothing above that to carry.
    const pts = signalPoints(signal, rms, Math.min(fs, Math.max(8 * signal.f2, 1000))).map((v) => fmt(v))
    const rows = []
    for (let i = 0; i < pts.length; i += 16) rows.push(`+ ${pts.slice(i, i + 16).join(' ')}`)
    ctx.nl.add('V', [node, '0'], `DC 0 PWL(\n${rows.join('\n')}\n+ )`, `${label} source`)
    return
  }
  ctx.nl.add('B', [node, '0'], `V=${signalExpression(signal, rms * Math.SQRT2)}`, `${label} source`)
}

/**
 * Compile every channel, and assign each driver its electrical terminals.
 *
 * A channel whose `load` is `null` drives, in parallel, every driver that no
 * explicit tree claims. A driver no channel reaches gets terminals of its own
 * that connect to nothing — an open coil.
 *
 * @param {object} ctx - Compile context.
 * @param {object} proj - The resolved project.
 * @returns {Map<string, {ep: string, em: string}>} Driver id → its + and − terminal nodes.
 * @throws {Error} When a channel's DSP filter is malformed.
 * @mutates ctx.nl and ctx.map.channels.
 */
export function compileWiring(ctx, proj) {
  const { nl } = ctx
  const terms = new Map()
  const drivers = (proj.nodes || []).filter((n) => n.type === 'driver').map((n) => n.id)
  const channels = proj.wiring?.channels || []
  const claimed = new Set(channels.flatMap((c) => loadLeaves(c.load)))
  const master = Math.pow(10, (Number(proj.wiring?.masterDb) || 0) / 20)
  /**
   * Wire a load tree between two nodes.
   *
   * @param {object} tree - `{driver}`, `{parallel: [...]}` or `{series: [...]}`.
   * @param {string} a - The + side.
   * @param {string} b - The − side.
   * @returns {void}
   * @mutates the enclosing `terms` map and the netlist.
   */
  const wire = (tree, a, b) => {
    if (tree.driver) {
      if (!terms.has(tree.driver)) terms.set(tree.driver, { ep: a, em: b })
      return
    }
    if (Array.isArray(tree.parallel)) for (const t of tree.parallel) wire(t, a, b)
    if (Array.isArray(tree.series)) {
      let at = a
      tree.series.forEach((t, i) => {
        const next = i === tree.series.length - 1 ? b : nl.node()
        wire(t, at, next)
        at = next
      })
    }
  }
  for (const c of channels) {
    const tree = c.load ?? { parallel: drivers.filter((id) => !claimed.has(id)).map((id) => ({ driver: id })) }
    if (!loadLeaves(tree).length) continue
    const dsp = c.dsp || {}
    const label = c.label || c.id
    nl.comment(`channel ${label}`)
    const src = nl.node()
    const phase = dsp.polarity === -1 ? 180 : 0
    if (ctx.tran) transientSource(ctx, src, Number(c.volts) * master * (phase ? -1 : 1), label)
    else nl.add('V', [src, '0'], `DC 0 AC ${fmt(Number(c.volts) * master)} ${phase}`, `${label} source`)
    let drive = src
    const delay = Number(dsp.delayMs) * 1e-3
    if (delay > 0) {
      const d = nl.node()
      const out = nl.node()
      nl.add('T', [src, '0', d, '0'], `Z0=1 TD=${fmt(delay)}`, `${label} delay`)
      resistor(nl, d, '0', 1)
      nl.add('E', [out, '0', d, '0'], '1')
      drive = out
    }
    const sections = []
    for (const [i, f] of (dsp.filters || []).entries()) {
      if (f.bypass) continue
      try { sections.push(...filterSections(f)) } catch (err) { throw new Error(`${label} › filter ${i + 1}: ${err.message}`) }
    }
    if (sections.length) drive = compileSections(nl, drive, sections, label)
    if (Number(c.outputOhms) > 0) {
      const r = nl.node()
      resistor(nl, drive, r, Number(c.outputOhms), `${label} output resistance`)
      drive = r
    }
    const load = nl.node()
    const sense = nl.add('V', [drive, load], 'DC 0', `${label} current`)
    wire(tree, load, '0')
    ctx.map.channels.push({ id: c.id, label, sense, load, volts: Number(c.volts) * master })
  }
  for (const id of drivers) if (!terms.has(id)) terms.set(id, { ep: nl.node(), em: nl.node() })
  return terms
}
