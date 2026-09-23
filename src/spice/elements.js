// Node types as netlist elements.
//
// Each function adds one graph node's circuit and records, in `ctx.map`, which
// SPICE outputs mean what — which sense source carries a cone's velocity, a
// port's flow, a radiator's output — so the adapter can turn raw vectors into
// speaker quantities without knowing how the netlist was built.

import { areaProfile } from '../engine/geometry.js'
import { driverSI } from '../engine/solver.js'
import { RHO, C_AIR, SOLID_ANGLE, perimeter, viscousCoeff, flowResistivity, stuffedSoundSpeed } from './physics.js'
import { fmt, resistor, sense, DC_TIE } from './netlist.js'
import { radiationLoad, fractionalSeries } from './networks.js'
import { compileLine } from './line.js'
import { endCorrection, faceArea } from './nets.js'

/**
 * A readable name for a graph node in netlist comments.
 *
 * @param {object} node - A v3 node.
 * @returns {string} Its label and id.
 * @pure
 */
const noteOf = (node) => `${node.params?.label || node.type} [${node.id}]`

/**
 * Join an element's internal node to its netlist node through an end mass.
 *
 * The end correction is a series acoustic mass ρ·Δ/S, and — scaled by the
 * element's loss multiplier — the same viscous wall loss a Δ-long extension of
 * the duct would have, so the air at the end is lossy at the same rate as the
 * air inside.
 *
 * Callers join the nodes directly when there is no correction — a wire, not a
 * near-zero resistor, whose enormous conductance would cost the solver most of
 * its precision.
 *
 * @param {object} ctx - Compile context.
 * @param {string} from - Node on the junction side.
 * @param {string} to - The element's end node.
 * @param {number} dl - Added length, m; must be positive.
 * @param {number} S - Area at this end, m².
 * @param {number} viscous - Loss multiplier; 0 for none.
 * @param {string} note - Comment.
 * @returns {void}
 * @mutates ctx.nl.
 */
function endMass(ctx, from, to, dl, S, viscous, note) {
  const { nl } = ctx
  const mid = viscous > 0 ? nl.node() : to
  nl.add('L', [from, mid], fmt((RHO * dl) / S), `${note} end correction`)
  if (viscous > 0) fractionalSeries(nl, mid, to, 0.5, viscous * viscousCoeff(S, perimeter(S)) * dl, ctx.band, `${note} end loss`)
}

/**
 * Probe positions requested on a node, m from its start.
 *
 * @param {object} ctx - Compile context, carrying the project's probes.
 * @param {object} node - A chamber or waveguide.
 * @returns {Array<{probe: object, x: number}>} Pressure probes placed along it.
 * @pure
 */
function probesOn(ctx, node) {
  return (ctx.probes || [])
    .filter((p) => p.at?.node === node.id && p.at.position != null)
    .map((p) => ({ probe: p, x: Number(p.at.position) * 1e-2 }))
}

/**
 * Record where a pressure probe landed.
 *
 * A probe that migrated from a chamber's own probe is reported under the
 * chamber's id, where the editor looks for it; any other under its own id.
 *
 * @param {object} ctx - Compile context.
 * @param {object} probe - The probe.
 * @param {string} node - The netlist node its pressure is read from.
 * @returns {void}
 * @mutates ctx.map.probes.
 */
function recordProbe(ctx, probe, node) {
  const key = probe.id === `probe_${probe.at.node}` ? probe.at.node : probe.id
  ctx.map.probes.push({ key, node })
}

/**
 * Connect a node's taps to the nets joined to them.
 *
 * @param {object} ctx - Compile context.
 * @param {object} node - A chamber or waveguide.
 * @param {object} line - The compiled line.
 * @returns {void}
 * @mutates ctx.nl.
 */
function connectTaps(ctx, node, line) {
  for (const t of node.params.taps || []) {
    const net = ctx.nets.netOf(node.id, `tap:${t.id}`)
    if (ctx.nets.connected(node.id, `tap:${t.id}`)) resistor(ctx.nl, net, line.at(Number(t.position) * 1e-2), DC_TIE, `${noteOf(node)} tap ${t.id}`)
  }
}

/**
 * Compile a waveguide — port, duct or horn segment.
 *
 * Every end gets a flow sense. A connected end joins its junction through the
 * end correction it owns. An unconnected end radiates into its own solid
 * angle, or is closed when that is `rigid`; the air the radiation carries is
 * given the duct's wall loss over its equivalent length.
 *
 * @param {object} ctx - Compile context.
 * @param {object} node - The waveguide node.
 * @returns {void}
 * @mutates ctx.nl and ctx.map.
 */
export function compileWaveguide(ctx, node) {
  const p = node.params
  const note = noteOf(node)
  const S1 = Math.max(p.S1 * 1e-4, 1e-8)
  const S2 = Math.max(p.S2 * 1e-4, 1e-8)
  const L = Math.max(p.length * 1e-2, 1e-4)
  const loss = Math.max(Number(p.loss) || 0, 0)
  const probes = probesOn(ctx, node)
  const line = compileLine(ctx, {
    note, L, area: areaProfile(p.flare || 'conical', S1, S2, L), c: C_AIR, shape: 'round',
    viscous: loss, thermal: 0, flowResistance: 0,
    stepped: Math.abs(S1 - S2) > 1e-12, lumped: false, volume: 0,
    points: [...(p.taps || []).map((t) => Number(t.position) * 1e-2), ...probes.map((q) => q.x)],
  })
  connectTaps(ctx, node, line)
  for (const q of probes) recordProbe(ctx, q.probe, line.at(q.x))
  const k = p.ecFactor ?? 1
  const ends = {}
  for (const [h, endNode, S, space] of [['throat', line.start, S1, p.throatSpace], ['mouth', line.end, S2, p.mouthSpace]]) {
    if (ctx.nets.connected(node.id, h)) {
      const dl = k * endCorrection(ctx.nets, node, h)
      const s = sense(ctx.nl, ctx.nets.netOf(node.id, h), `${note} ${h} flow`, dl > 0 ? undefined : endNode)
      if (dl > 0) endMass(ctx, s.out, endNode, dl, S, loss, `${note} ${h}`)
      ends[h] = { sense: s.name, S }
    } else if ((space || 'half') !== 'rigid') {
      const s = sense(ctx.nl, endNode, `${note} ${h} radiates`)
      const n = (2 * Math.PI) / (SOLID_ANGLE[space] ?? SOLID_ANGLE.half)
      const radLen = (8 / (3 * Math.PI)) * Math.sqrt(S / Math.PI) * Math.sqrt(n)
      let radIn = s.out
      if (loss > 0) {
        radIn = ctx.nl.node()
        fractionalSeries(ctx.nl, s.out, radIn, 0.5, loss * viscousCoeff(S, perimeter(S)) * radLen, ctx.band, `${note} ${h} radiation-air loss`)
      }
      const omega = radiationLoad(ctx.nl, radIn, S, space || 'half', `${note} ${h} radiation`)
      ends[h] = { sense: s.name, S }
      ctx.map.radiators.push({ key: h === 'mouth' ? node.id : `${node.id}:throat`, sense: s.name, node: radIn, omega, counts: true, driver: false })
    }
  }
  ctx.map.waveguides.push({ id: node.id, ends })
}

/**
 * Compile a chamber.
 *
 * A line of area volume/length, slowed and made lossy by stuffing, with
 * viscous and thermal wall loss from its geometry, and leakage as a resistance
 * to outside split between its two ends. An unconnected end is a closed wall.
 *
 * @param {object} ctx - Compile context.
 * @param {object} node - The chamber node.
 * @returns {void}
 * @mutates ctx.nl and ctx.map.
 */
export function compileChamber(ctx, node) {
  const p = node.params
  const note = noteOf(node)
  const V = Math.max(p.volume * 1e-3, 1e-8)
  const L = Math.max(p.length * 1e-2, 1e-4)
  const S = V / L
  const c = stuffedSoundSpeed(p.stuffing)
  const probes = probesOn(ctx, node)
  const shape = p.shape === 'cylindrical' ? 'round' : 'rectangular'
  /**
   * The chamber's cross-section, the same all along it.
   *
   * @returns {number} Area, m².
   * @reads the enclosing chamber area.
   */
  const area = () => S
  const line = compileLine(ctx, {
    note, L, area, c, shape,
    viscous: 1, thermal: 1, flowResistance: flowResistivity(p.stuffing),
    stepped: false, lumped: ctx.masking, volume: V,
    points: [...(p.taps || []).map((t) => Number(t.position) * 1e-2), ...probes.map((q) => q.x)],
  })
  connectTaps(ctx, node, line)
  for (const q of probes) recordProbe(ctx, q.probe, line.at(q.x))
  if (Number(p.leakQL) > 0) {
    const Cbox = V / (RHO * c * c)
    const R = Number(p.leakQL) / (2 * Math.PI * Math.max(Number(p.leakHz) || 30, 0.1) * Cbox)
    if (line.start === line.end) resistor(ctx.nl, line.start, '0', R, `${note} leak`)
    else { resistor(ctx.nl, line.start, '0', 2 * R, `${note} leak`); resistor(ctx.nl, line.end, '0', 2 * R, `${note} leak`) }
  }
  for (const [h, endNode] of [['in', line.start], ['out', line.end]]) {
    if (!ctx.nets.connected(node.id, h)) continue
    const dl = endCorrection(ctx.nets, node, h)
    const tie = dl > 0 ? ctx.nl.node() : endNode
    resistor(ctx.nl, ctx.nets.netOf(node.id, h), tie, DC_TIE)
    if (dl > 0) endMass(ctx, tie, endNode, dl, S, 0, `${note} ${h}`)
  }
}

/**
 * Apply a driver's dual voice coil wiring to its catalogue parameters.
 *
 * Catalogue data for a dual-coil driver is its both-coils-in-series figures.
 * Parallel quarters Re and Le and halves Bl, leaving Bl²/Re — and so Qes and
 * the response shape — unchanged. One coil alone halves Re and Bl, doubling Qes.
 *
 * @param {object} p - Driver params, display units.
 * @returns {object} The params with Re, Bl and Le adjusted.
 * @pure
 */
export function applyDvc(p) {
  const coils = p.dvc?.coils
  if (coils === 'parallel') return { ...p, Re: p.Re / 4, Bl: p.Bl / 2, Le: p.Le / 4 }
  if (coils === 'one') return { ...p, Re: p.Re / 2, Bl: p.Bl / 2, Le: p.Le / 4 }
  return p
}

/**
 * Compile the radiation from an exposed moving face.
 *
 * An unconnected face radiates as if mounted in an infinite baffle. With one
 * face exposed its output counts; with both exposed, only the front counts —
 * the rear is on the far side of the baffle — though both load the cone.
 *
 * @param {object} ctx - Compile context.
 * @param {object} node - A driver or passive radiator.
 * @param {number} Sd - Moving area, m².
 * @param {boolean} isDriver - Whether the output is driver output.
 * @returns {void}
 * @mutates ctx.nl and ctx.map.
 */
function exposedFaces(ctx, node, Sd, isDriver) {
  const note = noteOf(node)
  const frontOpen = !ctx.nets.connected(node.id, 'front')
  for (const face of ['front', 'rear']) {
    if (ctx.nets.connected(node.id, face)) continue
    const s = sense(ctx.nl, ctx.nets.netOf(node.id, face), `${note} ${face} radiates`)
    const omega = radiationLoad(ctx.nl, s.out, Sd, 'half', `${note} ${face} radiation`)
    const counts = face === 'front' || !frontOpen
    const key = isDriver ? `${node.id}:${face}` : (face === 'front' ? node.id : `${node.id}:rear`)
    ctx.map.radiators.push({ key, sense: s.name, node: s.out, omega, counts, driver: isDriver })
  }
}

/**
 * Compile a driver.
 *
 * Electrical side: Re, the voice coil inductance (a fitted ladder when LeExp
 * is below 1), and the back EMF Bl·u, between the terminals the wiring gave
 * it. Mechanical side: the force Bl·i driving Rms, Mms and Cms against the
 * acoustic reaction Sd·(p_front − p_rear). Acoustic side: a flow Sd·u out of
 * the front net and into the rear. Several identical drivers in one node, and
 * their wiring, collapse to one equivalent via `driverSI`.
 *
 * @param {object} ctx - Compile context.
 * @param {object} node - The driver node.
 * @param {{ep: string, em: string}} terms - The driver's electrical terminals.
 * @returns {void}
 * @mutates ctx.nl and ctx.map.
 */
export function compileDriver(ctx, node, terms) {
  const { nl } = ctx
  const note = noteOf(node)
  const d = driverSI(applyDvc(node.params))
  const front = ctx.nets.netOf(node.id, 'front')
  const rear = ctx.nets.netOf(node.id, 'rear')
  const x1 = nl.node(); const x2 = nl.node(); const x3 = nl.node()
  const m1 = nl.node(); const m2 = nl.node(); const m3 = nl.node(); const m4 = nl.node(); const m5 = nl.node()
  nl.comment(`driver ${note}`)
  resistor(nl, terms.ep, x1, d.Re, `${note} Re`)
  if (d.LeExp >= 0.999 || !(d.Le > 0)) nl.add('L', [x1, x2], fmt(Math.max(d.Le, 1e-9)), `${note} Le`)
  else fractionalSeries(nl, x1, x2, d.LeExp, d.Le, ctx.band, `${note} Le^${d.LeExp}`, 3)
  // Controlling sources are named before they are defined; SPICE resolves them after parsing.
  const vm = `V_${m5}`
  const ve = `V_${x3}`
  nl.add('H', [x2, x3, vm], fmt(d.Bl), `${note} back EMF`)
  nl.lines.push(`${ve} ${x3} ${terms.em} DC 0 ; ${note} coil current`)
  nl.add('H', [m1, '0', ve], fmt(d.Bl), `${note} motor force`)
  resistor(nl, m1, m2, d.Rms, `${note} Rms`)
  nl.add('L', [m2, m3], fmt(d.Mms), `${note} Mms`)
  nl.add('C', [m3, m4], fmt(d.Cms), `${note} Cms`)
  nl.add('E', [m4, m5, front, rear], fmt(d.Sd), `${note} acoustic reaction`)
  nl.lines.push(`${vm} ${m5} 0 DC 0 ; ${note} cone velocity`)
  nl.add('F', [rear, front, vm], fmt(d.Sd), `${note} cone flow`)
  ctx.map.drivers.push({ id: node.id, velocity: vm, Xmax: d.Xmax })
  exposedFaces(ctx, node, d.Sd, true)
}

/**
 * Compile a passive radiator: a driver without a motor.
 *
 * @param {object} ctx - Compile context.
 * @param {object} node - The passive radiator node.
 * @returns {void}
 * @mutates ctx.nl and ctx.map.
 */
export function compilePR(ctx, node) {
  const { nl } = ctx
  const p = node.params
  const note = noteOf(node)
  const n = Math.max(1, Math.round(p.count || 1))
  const Sd = Math.max(p.Sd * 1e-4, 1e-8) * n
  const Mm = ((p.Mmd || 0) + (p.addedMass || 0)) * 1e-3 * n
  const Cm = Math.max(p.Cms * 1e-3, 1e-9) / n
  const Rm = Math.max(p.Rms || 0, 0) * n
  const front = ctx.nets.netOf(node.id, 'front')
  const rear = ctx.nets.netOf(node.id, 'rear')
  const m2 = Rm > 0 ? nl.node() : '0'
  const m3 = nl.node(); const m4 = nl.node(); const m5 = nl.node()
  const vm = `V_${m5}`
  nl.comment(`passive radiator ${note}`)
  if (Rm > 0) resistor(nl, '0', m2, Rm, `${note} Rms`)
  nl.add('L', [m2, m3], fmt(Math.max(Mm, 1e-9)), `${note} mass`)
  nl.add('C', [m3, m4], fmt(Cm), `${note} compliance`)
  nl.add('E', [m4, m5, front, rear], fmt(Sd), `${note} acoustic reaction`)
  nl.lines.push(`${vm} ${m5} 0 DC 0 ; ${note} velocity`)
  nl.add('F', [rear, front, vm], fmt(Sd), `${note} flow`)
  exposedFaces(ctx, node, Sd, false)
}

/**
 * Compile a radiation node — one shared opening to open air.
 *
 * Everything joined to it radiates through one load, whose area is the
 * node's override or the combined area of the faces joined to it. When only
 * driver faces are joined to it, its output is driver output.
 *
 * @param {object} ctx - Compile context.
 * @param {object} node - The radiation node.
 * @returns {void}
 * @mutates ctx.nl and ctx.map.
 */
export function compileRadiation(ctx, node) {
  if (!ctx.nets.connected(node.id, 'in')) return
  const p = node.params
  const note = noteOf(node)
  let S = Number(p.areaOverride) > 0 ? p.areaOverride * 1e-4 : 0
  if (!S) for (const o of ctx.nets.neighbours(node.id, 'in')) S += faceArea(o.node, o.handle) || 0
  if (!S) S = 1e-2
  const s = sense(ctx.nl, ctx.nets.netOf(node.id, 'in'), `${note} radiates`)
  const omega = radiationLoad(ctx.nl, s.out, S, p.space || 'half', `${note} radiation`)
  // A radiation node fed only by driver faces is those faces radiating: its
  // output is driver output, not a port's.
  const driver = ctx.nets.neighbours(node.id, 'in').every((o) => o.node.type === 'driver')
  if (omega) ctx.map.radiators.push({ key: node.id, sense: s.name, node: s.out, omega, counts: true, driver })
}
