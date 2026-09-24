// A resolved v3 project → a SPICE netlist, plus a map of what its outputs mean.

import { createNetlist, fmt } from './netlist.js'
import { RHO } from './physics.js'
import { PROBE_KINDS } from '../schema/version.js'
import { buildNets } from './nets.js'
import { fitBand } from './networks.js'
import { compileWiring } from './wiring.js'
import { compileDriver, compileChamber, compileWaveguide, compilePR, compileRadiation } from './elements.js'

/**
 * Points per decade for an `.ac dec` sweep that comes closest to `npts` points.
 *
 * ngspice's decade sweep includes both ends, so it yields ppd·decades + 1
 * points.
 *
 * @param {number} fmin - Lowest frequency, Hz.
 * @param {number} fmax - Highest frequency, Hz.
 * @param {number} npts - Points wanted.
 * @returns {number} Points per decade, at least 1.
 * @pure
 */
export function pointsPerDecade(fmin, fmax, npts) {
  const decades = Math.log10(fmax / fmin)
  return Math.max(1, Math.round((npts - 1) / Math.max(decades, 1e-6)))
}

/**
 * Add the far-field pressure and cone excursion to a transient netlist.
 *
 * In the sweep these are worked out from the saved flows afterwards. In a
 * transient run they are circuit nodes instead, so they are integrated by the
 * same solver, at the same steps, as everything else:
 *
 * - pressure at 1 m from every counted radiator, p = ρ/(Ω·r) · dU/dt, is the
 *   voltage across a ρ-henry inductor carrying Σ U/Ω — once for all of them
 *   and once for the driver faces alone;
 * - each driver's excursion x = ∫u dt is the voltage on a 1 F capacitor fed
 *   its cone velocity. The nonlinear driver model reads this node too.
 *
 * @param {object} ctx - Compile context.
 * @returns {void}
 * @mutates ctx.nl and ctx.map.
 */
function transientOutputs(ctx) {
  const { nl, map } = ctx
  for (const [key, pick] of [['pressure', () => true], ['driverPressure', (r) => r.driver]]) {
    const rads = map.radiators.filter((r) => r.counts && r.omega && pick(r))
    if (!rads.length) continue
    const node = nl.node()
    nl.add('L', [node, '0'], fmt(RHO), `far-field ${key} at 1 m`)
    for (const r of rads) nl.add('F', ['0', node, r.sense], fmt(1 / r.omega))
    map[key] = node
  }
}

/**
 * Compile a project into a netlist: its frequency sweep, or a transient run.
 *
 * The circuit is the same either way; only the sources and the analysis
 * line differ, plus — in a transient run — the far-field pressure and
 * excursion nodes, and the nonlinear elements when they are switched on.
 *
 * @param {object} proj - A resolved, validated v3 project.
 * @param {object} analysis - The `ac` analysis whose band, model settings and points to use. `scale: 'lin'` makes a linear sweep of `npts` points from `fmin` to `fmax`, as the linear time responses need.
 * @param {object} [opts] - Options.
 * @param {object} [opts.tran] - Compile a transient run instead: `{signal, levelDb, fs, tstop, nonlinear}` — a normalised signal (see `dsp.js`), a level offset in dB, the sample rate, the run length in s, and whether to switch on the nonlinear elements.
 * @returns {{netlist: string, map: object, saves: string[]}} The netlist text; the map of drivers, channels, waveguides, radiators and probes to the SPICE vectors that carry them; and the vectors to read back.
 * @throws {Error} When the project uses something this compiler cannot build yet.
 * @pure
 */
export function compileProject(proj, analysis, opts = {}) {
  const nl = createNetlist(`AcouSim: ${proj.name || 'project'}`)
  const nets = buildNets(proj, nl)
  const tran = opts.tran || null
  const ctx = {
    nl,
    nets,
    tran,
    nonlinear: !!tran?.nonlinear,
    band: fitBand(tran ? Math.min(analysis.fmin, 5) : analysis.fmin, analysis.fmax),
    fmax: analysis.fmax,
    masking: !!analysis.masking,
    probes: [],
    endFlowProbes: [],
    map: { channels: [], drivers: [], waveguides: [], radiators: [], probes: [], flowProbes: [], handleFlows: {} },
  }
  const handleProbes = []
  for (const p of proj.probes || []) {
    if (!PROBE_KINDS.includes(p.kind)) throw new Error(`Probe ${p.label || p.id}: unknown kind "${p.kind}"`)
    if (p.at?.position != null) ctx.probes.push(p)
    else if (p.at?.handle && nets.netOf(p.at.node, p.at.handle)) {
      if (p.kind === 'pressure') ctx.map.probes.push({ key: p.id, node: nets.netOf(p.at.node, p.at.handle) })
      else handleProbes.push(p)
    }
  }
  nl.lines.push('.options rshunt=1e12')
  const terms = compileWiring(ctx, proj)
  for (const node of proj.nodes || []) {
    if (node.type === 'driver') compileDriver(ctx, node, terms.get(node.id))
    else if (node.type === 'chamber') compileChamber(ctx, node)
    else if (node.type === 'waveguide') compileWaveguide(ctx, node)
    else if (node.type === 'pr') compilePR(ctx, node)
    else if (node.type === 'radiation') compileRadiation(ctx, node)
  }
  // Flow through a handle is known only once every element has placed its
  // sense sources. A handle with nothing through it — a closed end, an
  // unconnected tap — has no flow, and reads as silence.
  for (const p of [...handleProbes, ...ctx.endFlowProbes]) {
    const f = ctx.map.handleFlows[`${p.at.node}:${p.at.handle}`]
    ctx.map.flowProbes.push(f ? { key: p.id, kind: p.kind, ...f } : { key: p.id, kind: p.kind, sense: null })
  }
  if (tran) transientOutputs(ctx)
  const m = ctx.map
  const saves = [
    ...m.channels.flatMap((c) => [`i(${c.sense})`, `v(${c.load})`]),
    ...m.drivers.map((d) => `i(${d.velocity})`),
    ...m.waveguides.flatMap((w) => Object.values(w.ends).map((e) => `i(${e.sense})`)),
    ...m.radiators.flatMap((r) => [`i(${r.sense})`, `v(${r.node})`]),
    ...m.probes.map((p) => `v(${p.node})`),
    ...m.flowProbes.filter((p) => p.sense).map((p) => `i(${p.sense})`),
    ...(tran ? [m.pressure, m.driverPressure, ...m.drivers.map((d) => d.x)].filter(Boolean).map((n) => `v(${n})`) : []),
  ].map((s) => s.toLowerCase())
  const unique = [...new Set(saves)]
  nl.lines.push(`.save ${unique.join(' ')}`)
  if (tran) {
    // Output on the sample grid exactly. The internal step never passes a
    // sample, nor the shortest transmission-line delay: ngspice's lossless
    // line cannot be stepped across its own delay, and gives up instead.
    const step = 1 / tran.fs
    let maxStep = step
    for (const l of nl.lines) {
      const m = /^T\S* .* TD=(\S+)/.exec(l)
      if (m) maxStep = Math.min(maxStep, 0.9 * Number(m[1]))
    }
    nl.lines.push('.options interp')
    nl.lines.push(`.tran ${fmt(step)} ${fmt(tran.tstop)} 0 ${fmt(maxStep)}`)
  } else if (analysis.scale === 'lin') {
    nl.lines.push(`.ac lin ${Math.round(analysis.npts)} ${analysis.fmin} ${analysis.fmax}`)
  } else {
    nl.lines.push(`.ac dec ${pointsPerDecade(analysis.fmin, analysis.fmax, analysis.npts)} ${analysis.fmin} ${analysis.fmax}`)
  }
  nl.lines.push('.end')
  return { netlist: nl.text(), map: m, saves: unique }
}
