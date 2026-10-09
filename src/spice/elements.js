// Node types as netlist elements.
//
// Each function adds one graph node's circuit and records, in `ctx.map`, which
// SPICE outputs mean what — which sense source carries a cone's velocity, a
// port's flow, a radiator's output — so the adapter can turn raw vectors into
// speaker quantities without knowing how the netlist was built.

import { areaProfile } from '../engine/geometry.js'
import { RHO, C_AIR, SOLID_ANGLE, perimeter, viscousCoeff, flowResistivity, stuffedSoundSpeed, driverSI } from './physics.js'
import { fmt, resistor, sense } from './netlist.js'
import { radiationLoad, fractionalSeries } from './networks.js'
import { compileLine } from './line.js'
import { endCorrection, faceArea } from './nets.js'
import { curveSpan, pwlOf, stiffnessRatio, ratioOf, slopeOf } from './nonlinear.js'

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
 * Probes placed at a distance along a node.
 *
 * @param {object} ctx - Compile context, carrying the project's positioned probes.
 * @param {object} node - A chamber or waveguide.
 * @returns {Array<{probe: object, x: number, flow: boolean}>} Its probes, their distance in m from the start, and whether they read flow rather than pressure.
 * @pure
 */
function probesOn(ctx, node) {
  return (ctx.probes || [])
    .filter((p) => p.at?.node === node.id && p.at.position != null)
    .map((p) => ({ probe: p, x: Number(p.at.position) * 1e-2, flow: p.kind === 'flow' || p.kind === 'velocity' }))
}

/**
 * The distances along a node where its line must have a node or a cut.
 *
 * @param {object} node - A chamber or waveguide.
 * @param {Array<object>} probes - From `probesOn`.
 * @returns {{points: number[], flowPoints: number[]}} Tap and pressure-probe distances, and flow-probe distances, m.
 * @pure
 */
function linePoints(node, probes) {
  return {
    points: [...(node.params.taps || []).map((t) => Number(t.position) * 1e-2), ...probes.filter((q) => !q.flow).map((q) => q.x)],
    flowPoints: probes.filter((q) => q.flow).map((q) => q.x),
  }
}

/**
 * Record where each probe on a line landed.
 *
 * A pressure probe reads the node at its distance. A flow or velocity probe
 * reads the sense source cut into the line there; one at either end reads
 * that end's flow instead, which the compiler resolves once every element is
 * built. A probe that migrated from a chamber's own probe is reported under
 * the chamber's id, where the editor looks for it; any other under its own id.
 *
 * @param {object} ctx - Compile context.
 * @param {object} node - The chamber or waveguide.
 * @param {object} line - The compiled line.
 * @param {Array<object>} probes - From `probesOn`.
 * @param {Function} areaAt - Cross-section at a distance, m → m².
 * @param {string[]} ends - The node's start and end handle names.
 * @returns {void}
 * @mutates ctx.map.probes, ctx.map.flowProbes and ctx.endFlowProbes.
 */
function placeProbes(ctx, node, line, probes, areaAt, ends) {
  const L = Number(node.params.length) * 1e-2
  for (const q of probes) {
    const p = q.probe
    if (!q.flow) {
      const key = p.id === `probe_${p.at.node}` ? p.at.node : p.id
      ctx.map.probes.push({ key, node: line.at(q.x) })
      continue
    }
    const name = line.flowAt(q.x)
    if (name) ctx.map.flowProbes.push({ key: p.id, kind: p.kind, sense: name, scale: 1, S: areaAt(q.x) })
    else if (q.x <= 0 || q.x >= L) ctx.endFlowProbes.push({ ...p, at: { node: node.id, handle: q.x <= 0 ? ends[0] : ends[1] } })
    else ctx.map.flowProbes.push({ key: p.id, kind: p.kind, sense: null })
  }
}

/**
 * Record which sense source carries the flow through a handle.
 *
 * @param {object} ctx - Compile context.
 * @param {string} id - Node id.
 * @param {string} handle - Handle name.
 * @param {string} name - The sense source (or cone velocity source).
 * @param {number} scale - Factor from the source's current to volume flow — Sd for a cone, 1 otherwise.
 * @param {number} S - Area for velocity, m².
 * @returns {void}
 * @mutates ctx.map.handleFlows.
 */
function recordFlow(ctx, id, handle, name, scale, S) {
  ctx.map.handleFlows[`${id}:${handle}`] = { sense: name, scale, S }
}

/**
 * Connect a node's taps to the nets joined to them.
 *
 * @param {object} ctx - Compile context.
 * @param {object} node - A chamber or waveguide.
 * @param {object} line - The compiled line.
 * @param {Function} areaAt - Cross-section at a distance, m → m².
 * @returns {void}
 * @mutates ctx.nl and ctx.map.handleFlows.
 */
function connectTaps(ctx, node, line, areaAt) {
  for (const t of node.params.taps || []) {
    const h = `tap:${t.id}`
    if (!ctx.nets.connected(node.id, h)) continue
    const x = Number(t.position) * 1e-2
    const s = sense(ctx.nl, ctx.nets.netOf(node.id, h), `${noteOf(node)} tap ${t.id}`, line.at(x))
    recordFlow(ctx, node.id, h, s.name, 1, areaAt(x))
  }
}

/**
 * Add the flow-dependent loss at a duct end: Δp = K·½ρ·v|v|.
 *
 * Jetting and separation where a duct opens into a larger space dissipate
 * the dynamic pressure of the flow. It is a series behavioural source,
 * opposing the flow through the end's sense source. The small-signal
 * linearisation of v|v| at rest is zero, so it is only ever added to
 * nonlinear transient runs.
 *
 * @param {object} ctx - Compile context.
 * @param {string} from - Node the flow arrives on.
 * @param {string|undefined} to - Node to end on; a new one by default.
 * @param {string} senseName - The sense source carrying the flow from `from` onward.
 * @param {number} K - Loss coefficient: about 1 for a sharp edge, 0.2 for a generous radius.
 * @param {number} S - End area, m².
 * @param {string} note - Comment.
 * @returns {string} The node beyond the loss.
 * @mutates ctx.nl.
 */
function exitLoss(ctx, from, to, senseName, K, S, note) {
  const out = to || ctx.nl.node()
  ctx.nl.add('B', [from, out], `V=${fmt((K * RHO) / (2 * S * S))}*i(${senseName})*abs(i(${senseName}))`, `${note} exit loss`)
  return out
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
  const area = areaProfile(p.flare || 'conical', S1, S2, L)
  const line = compileLine(ctx, {
    note, L, area, c: C_AIR, shape: 'round',
    viscous: loss, thermal: 0, flowResistance: 0,
    stepped: Math.abs(S1 - S2) > 1e-12, lumped: false, volume: 0,
    ...linePoints(node, probes),
  })
  connectTaps(ctx, node, line, area)
  placeProbes(ctx, node, line, probes, area, ['throat', 'mouth'])
  const k = p.ecFactor ?? 1
  const ends = {}
  for (const [h, endNode, S, space] of [['throat', line.start, S1, p.throatSpace], ['mouth', line.end, S2, p.mouthSpace]]) {
    const K = Number(h === 'throat' ? p.throatK : p.mouthK) || 0
    if (ctx.nets.connected(node.id, h)) {
      const step = endCorrection(ctx.nets, node, h) > 0
      const dl = k * endCorrection(ctx.nets, node, h)
      const jet = ctx.nonlinear && step && K > 0
      const s = sense(ctx.nl, ctx.nets.netOf(node.id, h), `${note} ${h} flow`, dl > 0 || jet ? undefined : endNode)
      let at = s.out
      if (jet) at = exitLoss(ctx, at, dl > 0 ? undefined : endNode, s.name, K, S, `${note} ${h}`)
      if (dl > 0) endMass(ctx, at, endNode, dl, S, loss, `${note} ${h}`)
      ends[h] = { sense: s.name, S }
      recordFlow(ctx, node.id, h, s.name, 1, S)
    } else if ((space || 'half') !== 'rigid') {
      const s = sense(ctx.nl, endNode, `${note} ${h} radiates`)
      const n = (2 * Math.PI) / (SOLID_ANGLE[space] ?? SOLID_ANGLE.half)
      const radLen = (8 / (3 * Math.PI)) * Math.sqrt(S / Math.PI) * Math.sqrt(n)
      let radIn = ctx.nonlinear && K > 0 ? exitLoss(ctx, s.out, undefined, s.name, K, S, `${note} ${h}`) : s.out
      if (loss > 0) {
        const from = radIn
        radIn = ctx.nl.node()
        fractionalSeries(ctx.nl, from, radIn, 0.5, loss * viscousCoeff(S, perimeter(S)) * radLen, ctx.band, `${note} ${h} radiation-air loss`)
      }
      const omega = radiationLoad(ctx.nl, radIn, S, space || 'half', `${note} ${h} radiation`)
      ends[h] = { sense: s.name, S }
      recordFlow(ctx, node.id, h, s.name, 1, S)
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
    ...linePoints(node, probes),
  })
  connectTaps(ctx, node, line, area)
  placeProbes(ctx, node, line, probes, area, ['in', 'out'])
  if (Number(p.leakQL) > 0) {
    const Cbox = V / (RHO * c * c)
    const R = Number(p.leakQL) / (2 * Math.PI * Math.max(Number(p.leakHz) || 30, 0.1) * Cbox)
    if (line.start === line.end) resistor(ctx.nl, line.start, '0', R, `${note} leak`)
    else { resistor(ctx.nl, line.start, '0', 2 * R, `${note} leak`); resistor(ctx.nl, line.end, '0', 2 * R, `${note} leak`) }
  }
  for (const [h, endNode] of [['in', line.start], ['out', line.end]]) {
    if (!ctx.nets.connected(node.id, h)) continue
    const dl = endCorrection(ctx.nets, node, h)
    const s = sense(ctx.nl, ctx.nets.netOf(node.id, h), `${note} ${h} flow`, dl > 0 ? undefined : endNode)
    recordFlow(ctx, node.id, h, s.name, 1, S)
    if (dl > 0) endMass(ctx, s.out, endNode, dl, S, 0, `${note} ${h}`)
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
 * A driver's large-signal curves as expression builders, or `null` when it has none.
 *
 * @param {object} p - Driver params, with `nl` curves.
 * @param {number} xmax - Xmax, mm.
 * @returns {{bl: Function|null, k: Function|null, le: Function|null, leSlope: Function|null}|null} Each takes the excursion expression (m) and returns the ratio expression; `leSlope` the slope of the Le ratio per metre.
 * @pure
 */
function driverCurves(p, xmax) {
  const span = curveSpan(xmax)
  const bl = ratioOf(p.nl?.Bl, xmax)
  const k = stiffnessRatio(p.nl, xmax)
  const le = ratioOf(p.nl?.Le, xmax)
  if (!bl && !k && !le) return null
  /**
   * An expression builder for a function of excursion.
   *
   * @param {Function|null} f - mm → value.
   * @returns {Function|null} Excursion expression → value expression.
   * @pure
   */
  const expr = (f) => (f ? (x) => pwlOf(f, span, x) : null)
  return { bl: expr(bl), k: expr(k), le: expr(le), leSlope: expr(le && slopeOf(le)) }
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
  // Controlling sources are named before they are defined; SPICE resolves them after parsing.
  const vm = `V_${m5}`
  const ve = `V_${x3}`
  nl.comment(`driver ${note}`)
  // Excursion, x = ∫u dt, as a node — the transient outputs and the
  // nonlinear elements both read it. Not needed in the sweep.
  let xn = null
  if (ctx.tran) {
    xn = nl.node()
    nl.add('F', ['0', xn, vm], '1', `${note} excursion`)
    nl.add('C', [xn, '0'], '1')
    resistor(nl, xn, '0', 1e12)
  }
  const curves = ctx.nonlinear && xn ? driverCurves(node.params, d.Xmax * 1000) : null
  const x = xn && `v(${xn})`
  resistor(nl, terms.ep, x1, d.Re, `${note} Re`)
  if (curves?.le) {
    // Le(x): the coil's own inductance network, driven by a copy of the coil
    // current, scaled by the curve — plus the motional term i·dLe/dx·u.
    const sh = nl.node()
    nl.add('F', ['0', sh, ve], '1', `${note} Le(x) reference`)
    if (d.LeExp >= 0.999 || !(d.Le > 0)) nl.add('L', [sh, '0'], fmt(Math.max(d.Le, 1e-9)))
    else fractionalSeries(nl, sh, '0', d.LeExp, d.Le, ctx.band, `${note} Le^${d.LeExp}`, 3)
    nl.add('B', [x1, x2], `V=${curves.le(x)}*v(${sh})+${fmt(d.Le)}*${curves.leSlope(x)}*i(${ve})*i(${vm})`, `${note} Le(x)`)
  } else if (d.LeExp >= 0.999 || !(d.Le > 0)) nl.add('L', [x1, x2], fmt(Math.max(d.Le, 1e-9)), `${note} Le`)
  else fractionalSeries(nl, x1, x2, d.LeExp, d.Le, ctx.band, `${note} Le^${d.LeExp}`, 3)
  const bl = curves?.bl ? `${fmt(d.Bl)}*${curves.bl(x)}` : null
  if (bl) nl.add('B', [x2, x3], `V=${bl}*i(${vm})`, `${note} back EMF, Bl(x)`)
  else nl.add('H', [x2, x3, vm], fmt(d.Bl), `${note} back EMF`)
  nl.lines.push(`${ve} ${x3} ${terms.em} DC 0 ; ${note} coil current`)
  let force = m1
  if (curves?.le) {
    // reluctance force ½·i²·dLe/dx, in series with the motor force
    force = nl.node()
    nl.add('B', [m1, force], `V=${fmt(0.5 * d.Le)}*${curves.leSlope(x)}*i(${ve})*i(${ve})`, `${note} reluctance force`)
  }
  if (bl) nl.add('B', [force, '0'], `V=${bl}*i(${ve})`, `${note} motor force, Bl(x)`)
  else nl.add('H', [force, '0', ve], fmt(d.Bl), `${note} motor force`)
  resistor(nl, m1, m2, d.Rms, `${note} Rms`)
  nl.add('L', [m2, m3], fmt(d.Mms), `${note} Mms`)
  if (curves?.k) nl.add('B', [m3, m4], `V=${fmt(1 / d.Cms)}*${curves.k(x)}*${x}`, `${note} Kms(x)`)
  else nl.add('C', [m3, m4], fmt(d.Cms), `${note} Cms`)
  nl.add('E', [m4, m5, front, rear], fmt(d.Sd), `${note} acoustic reaction`)
  nl.lines.push(`${vm} ${m5} 0 DC 0 ; ${note} cone velocity`)
  nl.add('F', [rear, front, vm], fmt(d.Sd), `${note} cone flow`)
  ctx.map.drivers.push({ id: node.id, velocity: vm, Xmax: d.Xmax, x: xn, nonlinear: !!curves })
  for (const face of ['front', 'rear']) recordFlow(ctx, node.id, face, vm, d.Sd, d.Sd)
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
  for (const face of ['front', 'rear']) recordFlow(ctx, node.id, face, vm, Sd, Sd)
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
  recordFlow(ctx, node.id, 'in', s.name, 1, S)
  const omega = radiationLoad(ctx.nl, s.out, S, p.space || 'half', `${note} radiation`)
  // A radiation node fed only by driver faces is those faces radiating: its
  // output is driver output, not a port's.
  const driver = ctx.nets.neighbours(node.id, 'in').every((o) => o.node.type === 'driver')
  if (omega) ctx.map.radiators.push({ key: node.id, sense: s.name, node: s.out, omega, counts: true, driver })
}
