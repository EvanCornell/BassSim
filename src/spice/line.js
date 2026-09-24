// A duct or chamber as a sliced transmission line.
//
// Chambers and waveguides compile to the same element: a line along its
// length, cut at every tap and probe so those land on real nodes. A uniform
// lossless piece is one exact SPICE transmission line. A flared piece is
// stepped into slices along its area profile. Wall loss is distributed:
// each slice gets a series √(jω) viscous element at its middle and a shunt
// √(jω) thermal element at its ends, so the loss follows the geometry and
// scales with length the way friction and heat exchange do.

import { RHO, perimeter, viscousCoeff, thermalCoeff } from './physics.js'
import { fmt, resistor, sense } from './netlist.js'
import { fractionalSeries, fractionalShunt } from './networks.js'

/**
 * L-C sections per unit of delay × model bandwidth in a transient run.
 *
 * A ladder of n sections standing in for a delay τ behaves as the line up to
 * about n/(πτ); 25·τ·fmax sections put that eight times above the model
 * bandwidth, where the phase-velocity error is well under 1%.
 */
const LC_PER = 25

/**
 * One uniform piece of line, between two nodes.
 *
 * In the frequency sweep it is SPICE's exact lossless line. In a transient
 * run it is a ladder of L-C sections instead: an ideal line re-launches
 * every sharp edge in its input as reflections at its delay, and with many
 * short lines those pile up until ngspice cannot find a step small enough
 * ("timestep too small"). The ladder has no delays to schedule, so the step
 * follows the signal, not the geometry.
 *
 * @param {object} ctx - Compile context: `{nl, tran, fmax}`.
 * @param {string} a - One end.
 * @param {string} b - The other end.
 * @param {number} Z0 - Characteristic impedance, ρc/S.
 * @param {number} td - Delay, s.
 * @param {string} [note] - Comment.
 * @returns {void}
 * @mutates ctx.nl.
 */
function segment(ctx, a, b, Z0, td, note) {
  const { nl } = ctx
  if (!ctx.tran) {
    nl.add('T', [a, '0', b, '0'], `Z0=${fmt(Z0)} TD=${fmt(td)}`, note)
    return
  }
  // T-sections: L/2, then C and L alternating, then L/2 — adjacent halves merged.
  const n = Math.max(1, Math.ceil(LC_PER * td * ctx.fmax))
  const L = (Z0 * td) / n
  const C = td / (Z0 * n)
  let at = a
  for (let k = 0; k < n; k++) {
    const mid = nl.node()
    nl.add('L', [at, mid], fmt(k === 0 ? L / 2 : L), k === 0 ? note : undefined)
    nl.add('C', [mid, '0'], fmt(C))
    at = mid
  }
  nl.add('L', [at, b], fmt(L / 2))
}

/** Most slices one line may be cut into, however long or lossy. */
const MAX_SLICES = 48

/**
 * Compile one line into the netlist.
 *
 * @param {object} ctx - Compile context: `{nl, band, fmax}`.
 * @param {object} spec - The line.
 * @param {string} spec.note - Comment naming the graph node.
 * @param {number} spec.L - Length, m.
 * @param {Function} spec.area - Cross-section at distance x from the start, m² → m².
 * @param {number} spec.c - Speed of sound in the line, m/s.
 * @param {string} spec.shape - Cross-section shape, for the perimeter.
 * @param {number} spec.viscous - Multiplier on viscous wall loss; 0 for none.
 * @param {number} spec.thermal - Multiplier on thermal wall loss; 0 for none.
 * @param {number} spec.flowResistance - Series resistance per metre from stuffing, as σ (Pa·s/m²); divided by the local area.
 * @param {boolean} spec.stepped - Whether the area varies, so the line must be sliced along its profile.
 * @param {boolean} spec.lumped - Collapse the whole line to one node and a compliance.
 * @param {number} spec.volume - Air volume, m³, for the lumped form.
 * @param {number[]} spec.points - Distances, m, where nodes are needed (taps and probes).
 * @param {number[]} [spec.flowPoints] - Distances, m, strictly inside the line, where the flow along it is to be read.
 * @returns {{start: string, end: string, at: Function, flowAt: Function}} The end nodes; `at(x)` → the node at one of `points`; `flowAt(x)` → the sense source carrying the flow past one of `flowPoints`, toward the end, or `null` where there is none.
 * @mutates ctx.nl.
 */
export function compileLine(ctx, spec) {
  const { nl } = ctx
  const L = Math.max(spec.L, 1e-6)
  if (spec.lumped) {
    const n = nl.node()
    const S = spec.volume / L
    nl.add('C', [n, '0'], fmt(spec.volume / (RHO * spec.c * spec.c)), `${spec.note} (lumped)`)
    if (spec.thermal > 0) {
      fractionalShunt(nl, n, 0.5, spec.thermal * thermalCoeff(perimeter(S, spec.shape)) * L, ctx.band, `${spec.note} thermal`)
    }
    /**
     * The one node of a lumped chamber, wherever along it is asked for.
     *
     * @returns {string} The node name.
     * @reads the enclosing node.
     */
    const at = () => n
    /**
     * A lumped chamber has no flow along it.
     *
     * @returns {null} Always.
     * @pure
     */
    const flowAt = () => null
    return { start: n, end: n, at, flowAt }
  }

  /**
   * Clamp a distance onto the line.
   *
   * @param {number} x - Distance, m.
   * @returns {number} The distance within [0, L].
   * @pure
   */
  const clamp = (x) => Math.min(Math.max(x, 0), L)
  const flowXs = new Set((spec.flowPoints || []).map(clamp).filter((x) => x > 0 && x < L))
  const xs = [...new Set([0, L, ...spec.points.map(clamp), ...flowXs])].sort((a, b) => a - b)
  const bp = new Map(xs.map((x) => [x, nl.node()]))
  // Where flow is read, the line is cut and a sense source bridges the cut:
  // `bp` is the near side, `onward` the far side the next piece starts from.
  const onward = new Map()
  const flowSense = new Map()
  for (const x of flowXs) {
    const s = sense(nl, bp.get(x), `${spec.note} flow at ${fmt(x * 100)} cm`)
    onward.set(x, s.out)
    flowSense.set(x, s.name)
  }
  const series = spec.viscous > 0 || spec.flowResistance > 0
  const lossy = series || spec.thermal > 0
  let dxMax = Infinity
  if (spec.stepped) dxMax = L / 24
  if (lossy) dxMax = Math.min(dxMax, spec.c / (4 * ctx.fmax))
  dxMax = Math.max(dxMax, L / MAX_SLICES)
  const shunt = new Map() // node -> [length share, area]
  /**
   * Record a share of line length whose thermal loss belongs at a node.
   *
   * @param {string} node - The node.
   * @param {number} len - Length share, m.
   * @param {number} S - Local area, m².
   * @returns {void}
   * @mutates the enclosing `shunt` map.
   */
  const addShunt = (node, len, S) => {
    const cur = shunt.get(node) || [0, S]
    shunt.set(node, [cur[0] + len, S])
  }

  for (let i = 0; i < xs.length - 1; i++) {
    const x0 = xs[i]
    const x1 = xs[i + 1]
    const n = Math.max(1, Math.ceil((x1 - x0) / dxMax - 1e-9))
    const dx = (x1 - x0) / n
    let at = onward.get(x0) || bp.get(x0)
    for (let k = 0; k < n; k++) {
      const next = k === n - 1 ? bp.get(x1) : nl.node()
      const S = spec.area(x0 + (k + 0.5) * dx)
      const Z0 = (RHO * spec.c) / S
      if (series) {
        const a = nl.node()
        const b = nl.node()
        segment(ctx, at, a, Z0, dx / 2 / spec.c, spec.note)
        if (spec.viscous > 0) {
          let into = a
          if (spec.flowResistance > 0) {
            into = nl.node()
            resistor(nl, a, into, (spec.flowResistance / S) * dx, `${spec.note} stuffing`)
          }
          fractionalSeries(nl, into, b, 0.5, spec.viscous * viscousCoeff(S, perimeter(S, spec.shape)) * dx, ctx.band, `${spec.note} viscous`)
        } else {
          resistor(nl, a, b, (spec.flowResistance / S) * dx, `${spec.note} stuffing`)
        }
        segment(ctx, b, next, Z0, dx / 2 / spec.c)
      } else {
        segment(ctx, at, next, Z0, dx / spec.c, spec.note)
      }
      if (spec.thermal > 0) {
        addShunt(at, dx / 2, S)
        addShunt(next, dx / 2, S)
      }
      at = next
    }
  }
  for (const [node, [len, S]] of shunt) {
    fractionalShunt(nl, node, 0.5, spec.thermal * thermalCoeff(perimeter(S, spec.shape)) * len, ctx.band, `${spec.note} thermal`)
  }
  return {
    start: bp.get(0),
    end: bp.get(L),
    /**
     * The node at one of the requested points.
     *
     * @param {number} x - Distance from the start, m — one of `spec.points`.
     * @returns {string} The node name.
     * @reads the breakpoint map.
     */
    at: (x) => bp.get(clamp(x)),
    /**
     * The sense source carrying the flow past a point, toward the end.
     *
     * @param {number} x - Distance from the start, m — one of `spec.flowPoints`.
     * @returns {string|null} The source name, or `null` for a point that was not cut.
     * @reads the flow-sense map.
     */
    flowAt: (x) => flowSense.get(clamp(x)) || null,
  }
}
