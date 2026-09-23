// Fitted networks as netlist elements.
//
// `fit.js` finds non-negative weights for passive building blocks; this module
// turns a fit into resistors, inductors and capacitors between netlist nodes,
// scaled to a physical impedance level and frequency.

import { fitAtoms, fitFractional, logspace } from './fit.js'
import { radiationImpedance } from '../engine/acoustics.js'
import { RHO, C_AIR, SOLID_ANGLE } from './physics.js'
import { fmt, resistor } from './netlist.js'

/**
 * Add a fitted series impedance between two nodes.
 *
 * Each atom becomes one section in a series chain: R‖L for a corner, R‖L‖C
 * for a resonance. Normalized frequency q maps to ω = q·ωs.
 *
 * @param {object} nl - A netlist builder.
 * @param {string} a - Start node.
 * @param {string} b - End node.
 * @param {Array<object>} fit - Atoms with weights.
 * @param {number} zScale - Impedance a unit weight stands for.
 * @param {number} omegaScale - ωs, rad/s per unit of q.
 * @param {string} [note] - Comment on each element.
 * @returns {void}
 * @throws {Error} When the fit has no sections, which a successful fit never produces.
 * @mutates nl.
 */
export function seriesNetwork(nl, a, b, fit, zScale, omegaScale, note) {
  let at = a
  fit.forEach((atom, k) => {
    const next = k === fit.length - 1 ? b : nl.node()
    const R = atom.weight * zScale
    const w0 = atom.q0 * omegaScale
    resistor(nl, at, next, R, note)
    if (atom.kind === 'corner') {
      nl.add('L', [at, next], fmt(R / w0))
    } else {
      nl.add('L', [at, next], fmt(R / (atom.Q * w0)))
      nl.add('C', [at, next], fmt(atom.Q / (R * w0)))
    }
    at = next
  })
  if (!fit.length) throw new Error('empty fitted network')
}

/**
 * Add a fitted shunt admittance from a node to the reference.
 *
 * Each corner atom becomes one series R–C branch, whose admittance is
 * G·jq/(jq + q0): the dual of an R‖L section.
 *
 * @param {object} nl - A netlist builder.
 * @param {string} node - The node.
 * @param {Array<object>} fit - Corner atoms with weights.
 * @param {number} yScale - Admittance a unit weight stands for.
 * @param {number} omegaScale - ωs, rad/s per unit of q.
 * @param {string} [note] - Comment on each element.
 * @returns {void}
 * @mutates nl.
 */
export function shuntNetwork(nl, node, fit, yScale, omegaScale, note) {
  for (const atom of fit) {
    const G = atom.weight * yScale
    if (!(G > 0)) continue
    const mid = nl.node()
    resistor(nl, node, mid, 1 / G, note)
    nl.add('C', [mid, '0'], fmt(G / (atom.q0 * omegaScale)))
  }
}

/**
 * The band a fractional element must be accurate over, for an analysis.
 *
 * Half an octave-and-a-bit beyond the sweep on each side, never below 0.5 Hz.
 *
 * @param {number} fmin - Lowest analysed frequency, Hz.
 * @param {number} fmax - Highest analysed frequency, Hz.
 * @returns {{f1: number, f2: number}} The band, Hz.
 * @pure
 */
export function fitBand(fmin, fmax) {
  return { f1: Math.max(0.5, fmin / 2), f2: Math.max(fmax * 2, fmin * 4) }
}

/**
 * Add a series impedance `coeff·(jω)^α` between two nodes.
 *
 * @param {object} nl - A netlist builder.
 * @param {string} a - Start node.
 * @param {string} b - End node.
 * @param {number} alpha - Exponent, 0 < α < 1.
 * @param {number} coeff - Coefficient, in the units of the impedance per (rad/s)^α.
 * @param {{f1: number, f2: number}} band - Where the approximation must hold, Hz.
 * @param {string} [note] - Comment.
 * @param {number} [perDecade=1.5] - Fit density; 1.5 fits √(jω) to about 0.3%, ample for a loss term.
 * @returns {void}
 * @mutates nl.
 */
export function fractionalSeries(nl, a, b, alpha, coeff, band, note, perDecade = 1.5) {
  const w1 = 2 * Math.PI * band.f1
  const fit = fitFractional(alpha, band.f2 / band.f1, perDecade)
  seriesNetwork(nl, a, b, fit, coeff * Math.pow(w1, alpha), w1, note)
}

/**
 * Add a shunt admittance `coeff·(jω)^α` from a node to the reference.
 *
 * @param {object} nl - A netlist builder.
 * @param {string} node - The node.
 * @param {number} alpha - Exponent, 0 < α < 1.
 * @param {number} coeff - Coefficient, admittance per (rad/s)^α.
 * @param {{f1: number, f2: number}} band - Where the approximation must hold, Hz.
 * @param {string} [note] - Comment.
 * @param {number} [perDecade=1.5] - Fit density; 1.5 fits √(jω) to about 0.3%, ample for a loss term.
 * @returns {void}
 * @mutates nl.
 */
export function fractionalShunt(nl, node, alpha, coeff, band, note, perDecade = 1.5) {
  const w1 = 2 * Math.PI * band.f1
  const fit = fitFractional(alpha, band.f2 / band.f1, perDecade)
  shuntNetwork(nl, node, fit, coeff * Math.pow(w1, alpha), w1, note)
}

let radiationFit = null

/**
 * The fitted normalized radiation impedance of a flanged piston.
 *
 * `z(q) = Z/(ρc/S)` as a function of q = ka, fitted over 0.003 ≤ ka ≤ 12 with
 * both parts weighted by their own size, so the tiny low-frequency radiation
 * resistance — which sets the radiated power — is fitted as tightly as the
 * reactance.
 *
 * @returns {Array<object>} Atoms with weights.
 * @reads A module-level cache.
 */
export function halfSpaceRadiationFit() {
  if (radiationFit) return radiationFit
  const S = Math.PI // a = 1 m
  const z0 = (RHO * C_AIR) / S
  const samples = logspace(0.003, 12, 240).map((q) => {
    const z = radiationImpedance(S, 'half', q * C_AIR)
    return { q, z: { re: z.re / z0, im: z.im / z0 }, w: q < 3 ? 1 : 0.3 }
  })
  const atoms = [
    ...logspace(0.01, 100, 20).map((q0) => ({ kind: 'corner', q0 })),
    ...logspace(0.4, 10, 20).flatMap((q0) => [0.5, 1, 2].map((Q) => ({ kind: 'resonance', q0, Q }))),
  ]
  radiationFit = fitAtoms(atoms, samples, true)
  return radiationFit
}

/**
 * The radiation impedance an opening sees in a solid angle, as a network.
 *
 * Image-source model: an opening flush at the junction of the boundaries that
 * bound a solid angle Ω radiates like itself plus its images — a piston of n
 * times the area in half space, n = 2π/Ω — so `Z_Ω(S) = n·Z_half(n·S)`. At low
 * ka that multiplies the radiation resistance by n and the mass by √n; at high
 * ka every case tends to ρc/S. Because it is a rescaled half-space impedance
 * it is causal and passive, and one fit serves every solid angle.
 *
 * @param {number} S - Opening area, m².
 * @param {string} space - `free`, `half`, `quarter` or `eighth`; anything else is treated as half space.
 * @returns {{zScale: number, omegaScale: number, omega: number}} The scale factors for `halfSpaceRadiationFit`, and Ω for the far-field pressure.
 * @pure
 */
export function radiationScale(S, space) {
  const omega = SOLID_ANGLE[space] ?? SOLID_ANGLE.half
  const n = (2 * Math.PI) / omega
  const aEff = Math.sqrt((n * S) / Math.PI)
  return { zScale: (RHO * C_AIR) / S, omegaScale: C_AIR / aEff, omega }
}

/**
 * Add a radiation load from a node to the reference.
 *
 * `rigid` adds nothing — a closed end. `anechoic` is the resistance ρc/S.
 * Anything else is the fitted piston network for that solid angle.
 *
 * @param {object} nl - A netlist builder.
 * @param {string} node - The node the flow radiates from.
 * @param {number} S - Opening area, m².
 * @param {string} space - Solid angle name, `rigid` or `anechoic`.
 * @param {string} [note] - Comment.
 * @returns {number|null} Ω for the far-field pressure, or `null` when nothing radiates.
 * @mutates nl.
 */
export function radiationLoad(nl, node, S, space, note) {
  if (space === 'rigid') return null
  if (space === 'anechoic') {
    resistor(nl, node, '0', (RHO * C_AIR) / S, note)
    return SOLID_ANGLE.half
  }
  const { zScale, omegaScale, omega } = radiationScale(S, space)
  seriesNetwork(nl, node, '0', halfSpaceRadiationFit(), zScale, omegaScale, note)
  return omega
}
