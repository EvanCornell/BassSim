// Large-signal driver curves as behavioural-source expressions.
//
// A driver's Bl(x), Kms(x)/Cms(x) and Le(x) curves are the Nonlinear Lab's
// ratio curves (see src/engine/nonlinear.js): baseline table or polynomial,
// Gaussian control points, symmetry and extrapolation past Xmax. Rather than
// re-express each of those as a formula, the curve is sampled finely in
// JavaScript — with exactly the function the Lab draws — and handed to SPICE
// as a piecewise-linear function of the excursion node. What the Lab shows is
// what the circuit uses.

import { evalCurve, curveHasContent } from '../engine/nonlinear.js'

/** Samples across the curve's range. */
const SAMPLES = 160

/**
 * The excursion range a curve is sampled over, mm either side of rest.
 *
 * @param {number} xmax - The driver's Xmax, mm.
 * @returns {number} Four times Xmax, at least 20 mm.
 * @pure
 */
export function curveSpan(xmax) {
  return Math.max(4 * (Number(xmax) || 0), 20)
}

/**
 * A `pwl` expression of a function of excursion, flat beyond the sampled span.
 *
 * ngspice extends a `pwl` along its end slopes, so each end is pinned by a
 * far-away point at the same value.
 *
 * @param {Function} f - mm → value.
 * @param {number} span - Sampled half-range, mm.
 * @param {string} x - The expression for excursion in metres, e.g. `v(n12)`.
 * @returns {string} The expression.
 * @pure
 */
export function pwlOf(f, span, x) {
  const pts = []
  /**
   * A number written for the netlist.
   *
   * @param {number} v - The value.
   * @returns {string} Eight significant figures.
   * @pure
   */
  const n = (v) => Number(v).toPrecision(8)
  pts.push(n(-1e6), n(f(-span)))
  for (let i = 0; i <= SAMPLES; i++) {
    const xm = -span + (2 * span * i) / SAMPLES
    pts.push(n(xm), n(f(xm)))
  }
  pts.push(n(1e6), n(f(span)))
  return `pwl(${x}*1000,${pts.join(',')})`
}

/**
 * Stiffness as a ratio of the small-signal value, from whichever suspension curve has content.
 *
 * A Kms curve is stiffness already; a Cms curve is its reciprocal.
 *
 * @param {object|null|undefined} nl - A driver's curve set.
 * @param {number} xmax - Xmax, mm, for extrapolation.
 * @returns {Function|null} mm → stiffness ratio, or `null` when the suspension is linear.
 * @pure
 */
export function stiffnessRatio(nl, xmax) {
  if (curveHasContent(nl?.Kms)) return (x) => evalCurve(nl.Kms, x, xmax)
  if (curveHasContent(nl?.Cms)) return (x) => 1 / evalCurve(nl.Cms, x, xmax)
  return null
}

/**
 * A curve's ratio as a function of excursion, or `null` when it has no content.
 *
 * @param {object|null|undefined} curve - A Lab curve.
 * @param {number} xmax - Xmax, mm.
 * @returns {Function|null} mm → ratio.
 * @pure
 */
export function ratioOf(curve, xmax) {
  return curveHasContent(curve) ? (x) => evalCurve(curve, x, xmax) : null
}

/**
 * The slope of a function of excursion, per metre, by central difference.
 *
 * @param {Function} f - mm → value.
 * @returns {Function} mm → d(value)/dx in 1/m.
 * @pure
 */
export function slopeOf(f) {
  const h = 0.05
  return (x) => ((f(x + h) - f(x - h)) / (2 * h)) * 1000
}
