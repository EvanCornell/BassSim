// A resolved v3 project → a SPICE netlist, plus a map of what its outputs mean.

import { createNetlist } from './netlist.js'
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
 * Compile a project's frequency sweep into a netlist.
 *
 * @param {object} proj - A resolved, validated v3 project.
 * @param {object} analysis - The `ac` analysis to run.
 * @returns {{netlist: string, map: object, saves: string[]}} The netlist text; the map of drivers, channels, waveguides, radiators and probes to the SPICE vectors that carry them; and the vectors to read back.
 * @throws {Error} When the project uses something this compiler cannot build yet.
 * @pure
 */
export function compileProject(proj, analysis) {
  const nl = createNetlist(`AcouSim: ${proj.name || 'project'}`)
  const nets = buildNets(proj, nl)
  const ctx = {
    nl,
    nets,
    band: fitBand(analysis.fmin, analysis.fmax),
    fmax: analysis.fmax,
    masking: !!analysis.masking,
    probes: [],
    map: { channels: [], drivers: [], waveguides: [], radiators: [], probes: [] },
  }
  for (const p of proj.probes || []) {
    if (p.kind !== 'pressure') throw new Error(`Probe ${p.label || p.id}: only pressure probes are supported by the SPICE engine so far`)
    if (p.at?.position != null) ctx.probes.push(p)
    else if (p.at?.handle) ctx.map.probes.push({ key: p.id, node: nets.netOf(p.at.node, p.at.handle) })
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
  const m = ctx.map
  const saves = [
    ...m.channels.flatMap((c) => [`i(${c.sense})`, `v(${c.load})`]),
    ...m.drivers.map((d) => `i(${d.velocity})`),
    ...m.waveguides.flatMap((w) => Object.values(w.ends).map((e) => `i(${e.sense})`)),
    ...m.radiators.flatMap((r) => [`i(${r.sense})`, `v(${r.node})`]),
    ...m.probes.map((p) => `v(${p.node})`),
  ].map((s) => s.toLowerCase())
  const unique = [...new Set(saves)]
  nl.lines.push(`.save ${unique.join(' ')}`)
  nl.lines.push(`.ac dec ${pointsPerDecade(analysis.fmin, analysis.fmax, analysis.npts)} ${analysis.fmin} ${analysis.fmax}`)
  nl.lines.push('.end')
  return { netlist: nl.text(), map: m, saves: unique }
}
