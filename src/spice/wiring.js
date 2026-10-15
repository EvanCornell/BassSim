// Channels as netlist sources, and the cables that join them to the drivers.
//
// Each channel is an AC voltage source at its level (volts at master 0 dB,
// scaled by the master, then by its DSP's gain, mute and polarity), then its
// DSP's delay and filters, then its Rg, then a current sense, then its output
// terminal. Every channel's return is the ground. Cables join terminals into
// nets (`schema/wires.js`); each net is one netlist node, so the drivers
// themselves never need to know how they are wired. A terminal no cable
// reaches gets a node of its own — an open coil.

import { fmt, resistor } from './netlist.js'
import { signalExpression, signalPoints } from './dsp.js'
import { compileSections } from './filters.js'
import { normalizeDsp, dspScale, dspSections, isFlat } from '../schema/dsp.js'
import { allTerminals, liveWires, netsOf, chTerm, toolbarChannel, driverStatus, GROUND } from '../schema/wires.js'
import { channelNames } from '../nodeNames.js'

/**
 * A channel's source for a transient run: the test signal at the channel's level.
 *
 * The channel's volts are RMS, as in the sweep: a tone's peak is √2 times
 * them, and noise has them as its RMS. The run's `levelDb` moves every
 * channel together, like the master.
 *
 * @param {object} ctx - Compile context carrying `tran: {signal, levelDb, fs}`.
 * @param {string} node - The source node.
 * @param {number} volts - The channel's RMS volts at the master level.
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
 * Compile every channel, and give every terminal its netlist node.
 *
 * The toolbar channel is compiled first, so it is the first in the map — the
 * one whose level the results are reported against.
 *
 * @param {object} ctx - Compile context.
 * @param {object} proj - The resolved project.
 * @returns {Function} Terminal id → its netlist node.
 * @throws {Error} When a channel's output is wired to the ground or to another channel's output, or a DSP stage is out of range.
 * @mutates ctx.nl and ctx.map.channels.
 */
export function compileWiring(ctx, proj) {
  const { nl } = ctx
  const wiring = proj.wiring || {}
  const terms = allTerminals(wiring, proj.nodes)
  const nets = netsOf(liveWires(wiring.wires, terms), terms)
  const nodeOf = new Map([[GROUND, '0']])
  const members = new Map()
  for (const net of nets.values()) members.set(net, (members.get(net) || 0) + 1)
  /**
   * A terminal's netlist node, made the first time its net is asked for.
   *
   * A terminal nothing reaches is an open end. Its node is tied to the ground
   * through 1 GΩ — open for every purpose, but it gives an unconnected coil,
   * a chain of sources between two loose ends, a voltage to sit at.
   *
   * @param {string} t - Terminal id.
   * @returns {string} The node.
   * @mutates the enclosing node map, the netlist and its node counter.
   */
  const termOf = (t) => {
    const net = nets.get(t) ?? t
    if (!nodeOf.has(net)) {
      const n = nl.node()
      nodeOf.set(net, n)
      if ((members.get(net) || 1) === 1) resistor(nl, n, '0', 1e9, 'open terminal')
    }
    return nodeOf.get(net)
  }
  const master = Math.pow(10, (Number(wiring.masterDb) || 0) / 20)
  const first = toolbarChannel(wiring)
  const channels = [first, ...(wiring.channels || []).filter((c) => c !== first)].filter(Boolean)
  const used = new Set()
  const names = channelNames(wiring.channels)
  // A channel that reaches no driver has no load: its impedance is the open terminal's.
  const loaded = new Set([...driverStatus(wiring, proj.nodes).values()].flatMap((s) => s.channels))
  for (const c of channels) {
    const label = names[c.id] || c.id
    const net = nets.get(chTerm(c.id, '+'))
    if (net === GROUND) throw new Error(`${label} is shorted: its + is wired to the ground.`)
    if (used.has(net)) throw new Error(`${label} is wired directly to another channel's output.`)
    used.add(net)
    nl.comment(`channel ${label}`)
    const src = nl.node()
    const volts = Number(c.volts) * master
    const dsp = normalizeDsp(c.dsp)
    // A DSP switched off passes the signal untouched; its settings stay.
    const flat = dsp.on === false || isFlat(dsp)
    const k = flat ? 1 : dspScale(dsp)
    if (ctx.tran) transientSource(ctx, src, volts * k, label)
    else nl.add('V', [src, '0'], `DC 0 AC ${fmt(volts * Math.abs(k))} ${k < 0 ? 180 : 0}`, `${label} source`)
    let drive = src
    const delay = (Number(dsp.delayMs) || 0) * 1e-3
    if (!flat && delay > 0) {
      // A lossless line matched at its far end is a pure delay.
      const d = nl.node()
      const out = nl.node()
      nl.add('T', [src, '0', d, '0'], `Z0=1 TD=${fmt(delay)}`, `${label} DSP delay`)
      resistor(nl, d, '0', 1)
      nl.add('E', [out, '0', d, '0'], '1')
      drive = out
    }
    if (!flat) {
      let sections
      try { sections = dspSections(dsp) } catch (err) { throw new Error(`${label} › DSP ${err.message}`) }
      if (sections.length) drive = compileSections(nl, drive, sections, `${label} DSP`)
    }
    if (Number(c.outputOhms) > 0) {
      const r = nl.node()
      resistor(nl, drive, r, Number(c.outputOhms), `${label} Rg`)
      drive = r
    }
    const load = termOf(chTerm(c.id, '+'))
    const sense = nl.add('V', [drive, load], 'DC 0', `${label} current`)
    ctx.map.channels.push({ id: c.id, label, sense, load, volts, loaded: loaded.has(c.id) })
  }
  return termOf
}
