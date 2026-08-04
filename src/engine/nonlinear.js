// EXPERIMENTAL: large-signal T/S nonlinearity (quasi-linear method).
//
// Each driver may carry three ratio curves — Bl(x), Cms(x), Le(x) — expressed
// relative to the small-signal value (1.0 = datasheet number). A curve is a
// flat 1.0 baseline (or an imported table), deformed by parametric-EQ style
// control points: gaussian bumps {x mm, g gain, w width mm}.
//
// The solver iterates: linear sweep → per-frequency excursion → cycle-averaged
// ratio at that excursion → scale Bl/Cms/Le → re-solve. Captures power
// compression and resonance drift; does NOT produce harmonic distortion
// products (that needs a time-domain engine).

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
 * A curve has content once it has either control points or an imported table.
 * This is what decides whether the experimental large-signal path runs at all,
 * so an untouched driver costs nothing.
 *
 * @param {object|null|undefined} curve - A curve, or nothing.
 * @returns {boolean} True when the curve would evaluate to anything other than a constant 1.0.
 * @pure
 */
export function curveHasContent(curve) {
  return (curve?.points?.length || 0) > 0 || (curve?.table?.length || 0) > 0
}

// Effective compliance ratio at excursion X: from Kms if defined, else Cms.
// Stiffness averages physically over the cycle, so Cms_eff = 1/avg(Kms).
/**
 * Effective compliance ratio at peak excursion X.
 *
 * Klippel reports publish suspension stiffness Kms(x); the solver wants
 * compliance. They are reciprocals of each other, but the averaging does not
 * commute with the inversion — stiffness is what averages physically over a
 * cycle, so the correct result is `1/avg(Kms)`, not `avg(1/Kms)`. A Kms curve
 * therefore takes precedence over a Cms curve when both are present.
 *
 * @param {object|null|undefined} nl - A driver's nonlinear parameter set.
 * @param {number} X - Peak excursion, mm.
 * @param {number} [xmax=0] - The driver's Xmax, mm, used only for extrapolation. 0 disables it.
 * @returns {number} Compliance as a ratio of the small-signal value; 1 when neither curve has content.
 * @post result > 0 — the averaged stiffness is floored at 0.05 so a curve driven to zero stiffness cannot produce an infinite compliance
 * @pure
 */
export function complianceRatio(nl, X, xmax = 0) {
  if (curveHasContent(nl?.Kms)) return 1 / Math.max(cycleAverage(nl.Kms, X, xmax), 0.05)
  return cycleAverage(nl?.Cms, X, xmax)
}

// baseline: imported table (linear interp, clamped ends) or flat 1.0
/**
 * The curve's baseline at displacement x, before control points are applied.
 *
 * An imported table is interpolated linearly and clamped at both ends —
 * measured data should not extrapolate itself. With no table the baseline is a
 * flat 1.0.
 *
 * @param {object|null|undefined} curve - The curve to evaluate.
 * @param {number} x - Displacement, mm. Signed: positive is outward.
 * @returns {number} Baseline ratio at x.
 * @pre curve.table, when present, is sorted ascending by x
 * @pure
 */
function baseValue(curve, x) {
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
 * parametric EQ. In symmetric mode each point is mirrored to the opposite
 * stroke direction, which is how a motor with a symmetric gap is described with
 * half the points.
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
 * @post result >= 0.01 — a ratio must stay physically positive, since the solver multiplies Bl, Cms and Le by it
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

// average ratio over one sinusoidal cycle of peak excursion X (mm).
// This is the quasi-linear "effective" parameter at that drive level.
/**
 * Average ratio over one sinusoidal cycle of peak excursion X.
 *
 * This is the quasi-linear approximation at the heart of the large-signal mode:
 * a cone swinging to ±X spends its cycle sampling the whole curve, so the
 * parameter the solver should use is the average over that swing, not the value
 * at the peak. Sampled uniformly in phase at 24 points, which is well past the
 * point where the average stops moving for smooth curves.
 *
 * @param {object|null|undefined} curve - The curve to average.
 * @param {number} X - Peak excursion, mm.
 * @param {number} [xmax=0] - Xmax, mm, passed through for extrapolation.
 * @returns {number} The cycle-averaged ratio; exactly 1 for a curve with no content, short-circuited before any sampling.
 * @pure
 */
export function cycleAverage(curve, X, xmax = 0) {
  if ((!curve?.points || curve.points.length === 0) && !curve?.table) return 1
  const N = 24
  let s = 0
  for (let k = 0; k < N; k++) {
    s += evalCurve(curve, X * Math.sin((2 * Math.PI * k) / N), xmax)
  }
  return s / N
}

/**
 * Whether a driver has any nonlinear content at all.
 *
 * The solver's gate for the experimental path: without this returning true, the
 * sweep runs once instead of four times.
 *
 * @param {object|null|undefined} nl - A driver's nonlinear parameter set.
 * @returns {boolean} True when at least one of Bl, Cms, Kms or Le has content.
 * @pure
 */
export function hasNL(nl) {
  if (!nl) return false
  return NL_PARAMS.some((p) => curveHasContent(nl[p]))
}

// Derived small-signal ratios at excursion X, for display in the Lab:
// Fs ∝ 1/√Cms, Qes ∝ 1/Bl² · √(M/C)... expressed as ratios:
/**
 * Small-signal T/S parameters at excursion X, expressed as ratios.
 *
 * For display in the Nonlinear Lab: it answers "what does this driver look like
 * once it is moving this far?". The derived figures follow from the standard
 * relations — Fs varies as 1/sqrt(Cms), Vas directly with Cms, and Qes as
 * sqrt(1/Cms)/Bl².
 *
 * @param {object} nl - A driver's nonlinear parameter set.
 * @param {number} X - Peak excursion, mm.
 * @param {number} [xmax=0] - Xmax, mm, passed through for extrapolation.
 * @returns {{Bl: number, Cms: number, Le: number, Fs: number, Qes: number, Vas: number}} Each parameter as a ratio of its small-signal value, where 1 means unchanged.
 * @pure
 */
export function derivedRatios(nl, X, xmax = 0) {
  const rBl = cycleAverage(nl.Bl, X, xmax)
  const rC = complianceRatio(nl, X, xmax)
  return {
    Bl: rBl,
    Cms: rC,
    Le: cycleAverage(nl.Le, X, xmax),
    Fs: 1 / Math.sqrt(rC),
    Qes: Math.sqrt(1 / rC) / (rBl * rBl),
    Vas: rC,
  }
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
