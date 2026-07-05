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
export const NL_PARAMS = ['Bl', 'Cms', 'Kms', 'Le']

export function emptyCurve() {
  return { points: [], table: null }
}

export function defaultNL() {
  return { Bl: emptyCurve(), Cms: emptyCurve(), Kms: emptyCurve(), Le: emptyCurve() }
}

export function curveHasContent(curve) {
  return (curve?.points?.length || 0) > 0 || (curve?.table?.length || 0) > 0
}

// Effective compliance ratio at excursion X: from Kms if defined, else Cms.
// Stiffness averages physically over the cycle, so Cms_eff = 1/avg(Kms).
export function complianceRatio(nl, X, xmax = 0) {
  if (curveHasContent(nl?.Kms)) return 1 / Math.max(cycleAverage(nl.Kms, X, xmax), 0.05)
  return cycleAverage(nl?.Cms, X, xmax)
}

// baseline: imported table (linear interp, clamped ends) or flat 1.0
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
  return Math.min(Math.max(r, 0.05), 3)
}

// average ratio over one sinusoidal cycle of peak excursion X (mm).
// This is the quasi-linear "effective" parameter at that drive level.
export function cycleAverage(curve, X, xmax = 0) {
  if ((!curve?.points || curve.points.length === 0) && !curve?.table) return 1
  const N = 24
  let s = 0
  for (let k = 0; k < N; k++) {
    s += evalCurve(curve, X * Math.sin((2 * Math.PI * k) / N), xmax)
  }
  return s / N
}

export function hasNL(nl) {
  if (!nl) return false
  return NL_PARAMS.some((p) => curveHasContent(nl[p]))
}

// Derived small-signal ratios at excursion X, for display in the Lab:
// Fs ∝ 1/√Cms, Qes ∝ 1/Bl² · √(M/C)... expressed as ratios:
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
