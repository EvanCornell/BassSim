// Large-signal driver curves.
//
// Each driver may carry three ratio curves — Bl(x), Cms(x), Le(x) — expressed
// relative to the small-signal value (1.0 = datasheet number). A curve is a
// flat 1.0 baseline (or an imported table), deformed by parametric-EQ style
// control points: gaussian bumps {x mm, g gain, w width mm}. Time-domain runs
// build the driver's motor and suspension from them.

// Kms(x) (suspension stiffness, as published by Klippel reports) is the
// reciprocal representation of Cms(x): they describe the same suspension.
// When the Kms curve has content it takes precedence over Cms.
/**
 * The nonlinear parameter names a driver may carry curves for.
 *
 * `Cms` and `Kms` are two descriptions of the same suspension, so a driver
 * normally has one or the other rather than both.
 */
export const NL_PARAMS = ['Bl', 'Cms', 'Kms', 'Le']

/**
 * A curve with no content — a flat 1.0 ratio at every excursion.
 *
 * @returns {{points: Array<{x: number, g: number, w: number}>, table: null}} A fresh empty curve; callers own it and may mutate it.
 * @pure
 */
export function emptyCurve() {
  return { points: [], table: null }
}

/**
 * A complete, empty nonlinear parameter set for a new driver.
 *
 * @returns {{Bl: object, Cms: object, Kms: object, Le: object}} One empty curve per nonlinear parameter, freshly allocated.
 * @pure
 */
export function defaultNL() {
  return { Bl: emptyCurve(), Cms: emptyCurve(), Kms: emptyCurve(), Le: emptyCurve() }
}

/**
 * Whether a curve deviates from the flat 1.0 baseline.
 *
 * A curve has content once it has either control points, an imported table or
 * a polynomial. An untouched driver is linear, and costs nothing.
 *
 * @param {object|null|undefined} curve - A curve, or nothing.
 * @returns {boolean} True when the curve would evaluate to anything other than a constant 1.0.
 * @pure
 */
export function curveHasContent(curve) {
  return (curve?.points?.length || 0) > 0 || (curve?.table?.length || 0) > 0 || (curve?.poly?.coeffs?.length || 0) > 1
}

/**
 * A polynomial curve's ratio at x: P(x)/P(0), held at its end values outside its range.
 *
 * Measurement reports (Klippel's among them) publish Bl(x), Kms(x) and
 * Le(x) as polynomial coefficients in absolute units over a stated range —
 * Bl(x) = b0 + b1·x + b2·x² … with x in mm. Dividing by b0 makes it a ratio
 * like every other curve; outside the range the fit means nothing, so the
 * end values hold.
 *
 * @param {{coeffs: number[], min?: number, max?: number}} poly - Coefficients from the constant term up, x in mm, and the range they were fitted over.
 * @param {number} x - Displacement, mm.
 * @returns {number} The ratio.
 * @pure
 */
export function polyRatio(poly, x) {
  const c = poly.coeffs
  const lo = Number.isFinite(poly.min) ? poly.min : -Infinity
  const hi = Number.isFinite(poly.max) ? poly.max : Infinity
  const xc = Math.min(Math.max(x, lo), hi)
  let v = 0
  for (let i = c.length - 1; i >= 0; i--) v = v * xc + c[i]
  return c[0] ? v / c[0] : 1
}

// baseline: imported table (linear interp, clamped ends) or flat 1.0
/**
 * The curve's baseline at displacement x, before control points are applied.
 *
 * A polynomial takes precedence (see `polyRatio`). An imported table is
 * interpolated linearly and clamped at both ends — measured data should not
 * extrapolate itself. With neither the baseline is a flat 1.0.
 *
 * @param {object|null|undefined} curve - The curve to evaluate.
 * @param {number} x - Displacement, mm. Signed: positive is outward.
 * @returns {number} Baseline ratio at x.
 * @pre curve.table, when present, is sorted ascending by x
 * @pure
 */
function baseValue(curve, x) {
  if ((curve?.poly?.coeffs?.length || 0) > 1) return polyRatio(curve.poly, x)
  const t = curve?.table
  if (!t || t.length === 0) return 1
  if (x <= t[0][0]) return t[0][1]
  if (x >= t[t.length - 1][0]) return t[t.length - 1][1]
  for (let i = 1; i < t.length; i++) {
    if (x <= t[i][0]) {
      const [x0, y0] = t[i - 1]
      const [x1, y1] = t[i]
      return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0)
    }
  }
  return 1
}

/**
 * Evaluate a curve at displacement x, baseline plus control points, unclamped.
 *
 * Control points are gaussian bumps added onto the baseline, in the manner of a
 * parametric EQ. When the curve sets `sym`, each point is mirrored to the
 * opposite stroke direction — a point at +3 mm also acts at −3 mm — which is how
 * a motor with a symmetric gap is described with half the points. Points within
 * 0.01 mm of centre are not mirrored, since they already straddle it.
 *
 * The result is deliberately not floored here: `evalCurve` needs the raw slope
 * to extrapolate beyond Xmax.
 *
 * @param {object|null|undefined} curve - The curve to evaluate.
 * @param {number} x - Displacement, mm.
 * @returns {number} Unclamped ratio at x, which may be zero or negative for an aggressive curve.
 * @pure
 */
function rawEval(curve, x) {
  let r = baseValue(curve, x)
  for (const p of curve?.points || []) {
    const w = Math.max(p.w, 0.1)
    r += p.g * Math.exp(-0.5 * Math.pow((x - p.x) / w, 2))
    // symmetric mode: every point acts on both stroke directions
    if (curve?.sym && Math.abs(p.x) > 0.01) {
      r += p.g * Math.exp(-0.5 * Math.pow((x + p.x) / w, 2))
    }
  }
  return r
}

// ratio at a static displacement x (mm). If curve.extrap and |x| > xmax,
// the curve continues past xmax along its slope AT xmax instead of the
// gaussians decaying back to baseline (Bl doesn't recover past Xmax).
/**
 * Ratio at a static displacement x, with optional extrapolation past Xmax.
 *
 * Gaussian control points decay back toward the baseline far from their centre,
 * which is wrong past Xmax: a coil leaving the gap does not recover its Bl. With
 * `curve.extrap` set, the curve instead continues past ±Xmax along the slope it
 * had *at* Xmax, estimated from a 0.25 mm finite difference.
 *
 * @param {object|null|undefined} curve - The curve to evaluate.
 * @param {number} x - Displacement, mm.
 * @param {number} [xmax=0] - Xmax, mm. Extrapolation is skipped when this is 0.
 * @returns {number} Ratio at x, floored at 0.01.
 * @post result >= 0.01 — a ratio must stay physically positive, since Bl, Cms and Le are multiplied by it
 * @pure
 */
export function evalCurve(curve, x, xmax = 0) {
  let r
  if (curve?.extrap && xmax > 0 && Math.abs(x) > xmax) {
    const s = Math.sign(x)
    const xe = s * xmax
    const d = 0.25
    const slope = (rawEval(curve, xe) - rawEval(curve, xe - s * d)) / (s * d)
    r = rawEval(curve, xe) + slope * (x - xe)
  } else {
    r = rawEval(curve, x)
  }
  // no upper limit — only keep the ratio physically positive
  return Math.max(r, 0.01)
}

// Normalize an imported table to ratios. Published curves are usually
// absolute values (e.g. Kms in N/mm); if the value at x=0 is far from 1 we
// treat the table as absolute and divide by its x=0 value.
/**
 * Convert an imported curve table to ratios, detecting absolute units.
 *
 * Published curves are usually absolute — Kms in N/mm, Bl in T·m — while the
 * engine works in ratios of the small-signal value. The two are told apart by
 * the value at x = 0: a ratio curve passes through 1 there, so anything outside
 * 0.5–2 is assumed absolute and divided through by its own x = 0 value.
 *
 * That heuristic is reported back in `wasAbsolute` rather than applied silently,
 * so the import UI can say what it decided.
 *
 * @param {Array<[number, number]>} table - Rows of `[x_mm, value]`, sorted ascending by x.
 * @returns {{table: Array<[number, number]>, wasAbsolute: boolean, v0: number}} The normalized table (the original array when no scaling was needed), whether it was treated as absolute, and the detected x = 0 value.
 * @throws {Error} When the value at x = 0 is zero, which no ratio can be derived from.
 * @post The input array is never modified; scaling produces a new array.
 * @pure
 */
export function normalizeTable(table) {
  let v0 = null
  for (let i = 1; i < table.length; i++) {
    const [x0, y0] = table[i - 1]
    const [x1, y1] = table[i]
    if (x0 <= 0 && x1 >= 0) { v0 = y0 + ((y1 - y0) * (0 - x0)) / (x1 - x0); break }
  }
  if (v0 == null) v0 = table[0][1]
  if (Math.abs(v0) < 1e-12) throw new Error('Curve value at x=0 is zero — cannot normalize.')
  const isAbsolute = v0 < 0.5 || v0 > 2
  if (!isAbsolute) return { table, wasAbsolute: false, v0 }
  return { table: table.map(([x, y]) => [x, y / v0]), wasAbsolute: true, v0 }
}

// CSV: lines of "x_mm, ratio". Returns sorted table or throws.
/**
 * Parse a pasted or uploaded curve as CSV.
 *
 * Accepts comma, semicolon or tab separated `x_mm, ratio` rows. Blank lines,
 * `#` comments and header rows — detected by alphabetic characters in the first
 * field — are skipped, so exports that carry a title row import without editing.
 *
 * @param {string} text - Raw file or clipboard contents.
 * @returns {Array<[number, number]>} Rows sorted ascending by x.
 * @throws {Error} When fewer than two usable rows are found, since a single point defines no curve.
 * @pure
 */
export function parseCurveCSV(text) {
  const rows = []
  for (const line of text.split(/\r?\n/)) {
    const s = line.trim()
    if (!s || s.startsWith('#') || /[a-df-z]/i.test(s.split(',')[0])) continue
    const parts = s.split(/[,;\t]+/).map(parseFloat)
    if (parts.length >= 2 && isFinite(parts[0]) && isFinite(parts[1])) rows.push([parts[0], parts[1]])
  }
  if (rows.length < 2) throw new Error('Need at least two "x_mm, ratio" rows.')
  return rows.sort((a, b) => a[0] - b[0])
}

// ---------- curves from published ratings ----------
//
// Datasheets rarely publish curves, but often publish two excursion ratings:
// Xmax, and Xvar — the excursion at which the driver's output has varied by
// 6 dB. Curves are built from them on two assumptions:
//
// - at Xmax, Bl has fallen to 70% of its rest value;
// - the output varies as Bl² (force and back-EMF both scale with Bl) and as
//   1/Kms, so in dB the variation is −20·log10(Bl ratio) + 10·log10(Kms
//   ratio): 70% Bl is 3.1 dB, 200% Kms is 3.0 dB.
//
// Bl is a smooth bell, flat at rest and falling on past Xmax, whose loss in dB
// grows as x². Whatever the 6 dB at Xvar still needs after Bl is given to the
// suspension, as the classic quadratic stiffening Kms(x) = 1 + c·x², which
// spreads it over the whole stroke rather than bunching it at one point.
// Both are symmetric.

/** Bl at Xmax, as a ratio of its rest value. */
export const BL_AT_XMAX = 0.7

/** The output variation that defines Xvar, dB. */
export const XVAR_DB = 6

/**
 * The output variation from a Bl and a Kms ratio, dB.
 *
 * @param {number} bl - Bl, as a ratio of its rest value.
 * @param {number} kms - Kms, as a ratio of its rest value.
 * @returns {number} −20·log10(bl) + 10·log10(kms): positive as Bl falls or Kms rises.
 * @pure
 */
export function variationDb(bl, kms) {
  return -20 * Math.log10(bl) + 10 * Math.log10(kms)
}

/**
 * Bl and Kms curves from a driver's Xmax and Xvar.
 *
 * Bl(x) = exp(−x²/c²), with c set so Bl(Xmax) = 70%. With an Xvar, the
 * variation Bl leaves short of 6 dB there is made up by Kms(x) = 1 + k·x²;
 * when Bl alone already reaches 6 dB before Xvar, the suspension is left
 * linear and `info.blAlone` says so — the two ratings then disagree under
 * these assumptions.
 *
 * Bl is a table sampled over the whole stroke the circuit uses, Kms an exact
 * polynomial over the same range; both stay symmetric past Xmax.
 *
 * @param {number} xmax - Xmax, mm.
 * @param {number} [xvar] - Xvar, mm; without it only Bl is built.
 * @returns {{Bl: object, Kms: object, info: {blSixDbAt: number, blAtXvar: number|null, kmsAtXvar: number|null, blDb: number|null, kmsDb: number|null, blAlone: boolean}}} The two curves, and what they come to: where Bl alone reaches 6 dB, and at Xvar each ratio and its share of the variation.
 * @throws {Error} When Xmax is not a positive number, or Xvar is given but is not.
 * @pure
 */
export function curvesFromRatings(xmax, xvar) {
  if (!(xmax > 0)) throw new Error('Xmax must be a positive number of mm.')
  checkXvar(xvar)
  const c2 = (xmax * xmax) / Math.log(1 / BL_AT_XMAX)
  /**
   * Bl at an excursion.
   *
   * @param {number} x - Excursion, mm.
   * @returns {number} The ratio.
   * @pure
   */
  const bl = (x) => Math.exp((-x * x) / c2)
  const span = Math.max(4 * xmax, xvar > 0 ? 2 * xvar : 0, 20)
  const out = withSuspension(bl, span, xvar)
  out.info.blSixDbAt = Math.sqrt(c2 * Math.log(Math.pow(10, XVAR_DB / 20)))
  return out
}

/**
 * Throw unless an optional Xvar is missing or a positive number.
 *
 * @param {*} xvar - Xvar, mm, or nothing.
 * @returns {void}
 * @throws {Error} When it is given but not positive.
 * @pure
 */
function checkXvar(xvar) {
  if (xvar != null && xvar !== '' && !(xvar > 0)) throw new Error('Xvar must be a positive number of mm.')
}

/**
 * A Bl function sampled into a symmetric table, with the Kms(x) an Xvar calls for.
 *
 * Whatever the 6 dB at Xvar still needs after Bl is given to the suspension
 * as Kms(x) = 1 + k·x²; when Bl alone is already past 6 dB there, the
 * suspension stays linear and `info.blAlone` says so.
 *
 * @param {Function} bl - Bl ratio at an excursion in mm, 1 at rest, even in x.
 * @param {number} span - Half the stroke to tabulate, mm.
 * @param {number|null} [xvar] - Xvar, mm.
 * @returns {{Bl: object, Kms: object, info: object}} The curves, and at Xvar each ratio and its share of the variation.
 * @pure
 */
function withSuspension(bl, span, xvar) {
  const rows = 120
  const table = []
  for (let i = -rows; i <= rows; i++) {
    const x = Number(((span * i) / rows).toFixed(4))
    table.push([x, Number(Math.max(bl(x), 1e-4).toPrecision(6))])
  }
  const Bl = { points: [], table, poly: null, sym: true, extrap: false }
  let Kms = { points: [], table: null, poly: null, sym: true, extrap: false }
  const info = { blSixDbAt: null, blAtXvar: null, kmsAtXvar: null, blDb: null, kmsDb: null, blAlone: false }
  if (xvar > 0) {
    const blDb = variationDb(bl(xvar), 1)
    const kmsDb = XVAR_DB - blDb
    info.blAtXvar = bl(xvar)
    info.blDb = blDb
    if (kmsDb > 0) {
      const K = Math.pow(10, kmsDb / 10)
      Kms = { ...Kms, poly: { coeffs: [1, 0, (K - 1) / (xvar * xvar)], min: -span, max: span } }
      info.kmsAtXvar = K
      info.kmsDb = kmsDb
    } else {
      info.kmsAtXvar = 1
      info.kmsDb = 0
      info.blAlone = true
    }
  }
  return { Bl, Kms, info }
}

// ---------- Bl from the motor's geometry ----------
//
// Bl(x) is the flux density the coil's turns sit in, summed along the coil:
// with N/Hvc turns per mm of winding, Bl(x) ∝ ∫ B(z) dz over the coil's
// height Hvc, centred on x. So its shape comes from where the coil is and
// where the field is, not from a rated excursion.
//
// The field along the gap is flat across the gap height Hg and falls away past
// each plate face over a fringe. The edge is modelled as a tanh step,
//
//   B(z) = ½·[tanh((z + Hg/2)/f) − tanh((z − Hg/2)/f)],
//
// which is half strength at each face: the field the edge loses inside the
// gap is the field it spills outside, so the total flux the gap carries does
// not depend on the fringe. The fringe height is where the spill has fallen to
// 10% of the gap's field; f = 2·h / ln 9. Its integral is closed-form
// (f·ln cosh), so Bl(x) is too.
//
// An overhung coil (Hvc > Hg) holds full Bl until an end reaches a plate face,
// at (Hvc − Hg)/2, and loses it as that end crosses the gap. An underhung coil
// (Hvc < Hg) holds it until it starts to leave the gap, at (Hg − Hvc)/2.

/** The field at the fringe height, as a share of the gap's. */
export const FRINGE_LEVEL = 0.1

/** The fringe height assumed when none is given, as a share of the gap height. */
export const DEFAULT_FRINGE_SHARE = 0.25

/**
 * ln cosh(t), without overflow for large |t|.
 *
 * @param {number} t - Any number.
 * @returns {number} ln cosh t.
 * @pure
 */
function logCosh(t) {
  const a = Math.abs(t)
  return a + Math.log1p(Math.exp(-2 * a)) - Math.LN2
}

/**
 * Bl(x) from the coil height, gap height and fringe height.
 *
 * @param {{coil: number, gap: number, fringe?: number}} g - Coil (winding) height, magnetic gap height and fringe height, mm. The fringe defaults to a quarter of the gap; 0 is a hard-edged field.
 * @returns {Function} `x ↦ Bl(x)/Bl(0)`, x in mm: even, 1 at rest, falling towards 0.
 * @throws {Error} When the coil or gap height is not positive, or the fringe is negative.
 * @pure
 */
export function blFromGeometry({ coil, gap, fringe }) {
  if (!(coil > 0)) throw new Error('Coil height must be a positive number of mm.')
  if (!(gap > 0)) throw new Error('Gap height must be a positive number of mm.')
  const h = fringe == null || fringe === '' ? DEFAULT_FRINGE_SHARE * gap : Number(fringe)
  if (!(h >= 0)) throw new Error('Fringe height must be 0 or more mm.')
  const f = (2 * h) / Math.log((1 - FRINGE_LEVEL) / FRINGE_LEVEL)
  /**
   * ∫ B(z) dz from −∞ to z, up to a constant, in mm of full-strength field.
   *
   * @param {number} z - Position along the gap, mm from its centre.
   * @returns {number} The running integral.
   * @pure
   */
  const F = f > 1e-9
    ? (z) => (f / 2) * (logCosh((z + gap / 2) / f) - logCosh((z - gap / 2) / f))
    : (z) => (Math.min(Math.max(z, -gap / 2), gap / 2))
  /**
   * The field the coil sits in when centred at x, unnormalized.
   *
   * @param {number} x - Coil centre, mm.
   * @returns {number} ∫ B over the coil.
   * @pure
   */
  const linked = (x) => F(x + coil / 2) - F(x - coil / 2)
  const rest = linked(0)
  return (x) => linked(x) / rest
}

/**
 * The excursion at which a falling, even ratio function first reaches a level.
 *
 * @param {Function} fn - The ratio at an excursion, mm; 1 at rest and falling.
 * @param {number} level - The level, below 1.
 * @param {number} limit - The furthest excursion to look, mm.
 * @returns {number|null} The excursion, mm, or `null` when it does not get there within `limit`.
 * @pure
 */
export function excursionAt(fn, level, limit) {
  if (fn(limit) > level) return null
  let lo = 0
  let hi = limit
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2
    if (fn(mid) > level) lo = mid
    else hi = mid
  }
  return (lo + hi) / 2
}

/**
 * Bl and Kms curves from the motor's geometry, and Xvar.
 *
 * Bl follows `blFromGeometry`; Kms takes what the 6 dB at Xvar still needs,
 * as with `curvesFromRatings`. Xmax plays no part in the curves: when given,
 * `info.blAtXmax` reports what Bl comes to at the rated Xmax, as a check.
 *
 * @param {{coil: number, gap: number, fringe?: number, xvar?: number|null, xmax?: number|null}} g - Coil and gap heights, fringe height, Xvar and Xmax, mm.
 * @returns {{Bl: object, Kms: object, info: object}} The curves, and what they come to: the fringe used, where full Bl ends (`flat`), where Bl reaches 82% (`bl82At`), 70% (`bl70At`) and 6 dB (`blSixDbAt`), Bl at Xmax, and the Xvar split.
 * @throws {Error} When a height is not usable, or Xvar is given but not positive.
 * @pure
 */
export function curvesFromGeometry({ coil, gap, fringe, xvar, xmax }) {
  checkXvar(xvar)
  const bl = blFromGeometry({ coil, gap, fringe })
  const h = fringe == null || fringe === '' ? DEFAULT_FRINGE_SHARE * gap : Number(fringe)
  const reach = (coil + gap) / 2 + 4 * h
  const span = Math.max(reach + 2, xvar > 0 ? 2 * xvar : 0, xmax > 0 ? 4 * xmax : 0, 20)
  const out = withSuspension(bl, span, xvar)
  Object.assign(out.info, {
    fringe: h,
    flat: Math.abs(coil - gap) / 2,
    overhung: coil >= gap,
    bl82At: excursionAt(bl, 0.82, span),
    bl70At: excursionAt(bl, BL_AT_XMAX, span),
    blSixDbAt: excursionAt(bl, Math.pow(10, -XVAR_DB / 20), span),
    blAtXmax: xmax > 0 ? bl(xmax) : null,
  })
  return out
}

// Module-private functions, exposed for the contract test suite only
// (test/contract/*). Not part of this module's public API — application code
// must not import from here, and nothing outside the tests does.
export const __internals = { baseValue, rawEval, logCosh }
