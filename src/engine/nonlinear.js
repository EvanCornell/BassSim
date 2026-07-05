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

export const NL_PARAMS = ['Bl', 'Cms', 'Le']

export function emptyCurve() {
  return { points: [], table: null }
}

export function defaultNL() {
  return { Bl: emptyCurve(), Cms: emptyCurve(), Le: emptyCurve() }
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

// ratio at a static displacement x (mm)
export function evalCurve(curve, x) {
  let r = baseValue(curve, x)
  for (const p of curve?.points || []) {
    const w = Math.max(p.w, 0.1)
    r += p.g * Math.exp(-0.5 * Math.pow((x - p.x) / w, 2))
  }
  return Math.min(Math.max(r, 0.05), 3)
}

// average ratio over one sinusoidal cycle of peak excursion X (mm).
// This is the quasi-linear "effective" parameter at that drive level.
export function cycleAverage(curve, X) {
  if ((!curve?.points || curve.points.length === 0) && !curve?.table) return 1
  const N = 24
  let s = 0
  for (let k = 0; k < N; k++) {
    s += evalCurve(curve, X * Math.sin((2 * Math.PI * k) / N))
  }
  return s / N
}

export function hasNL(nl) {
  if (!nl) return false
  return NL_PARAMS.some((p) => (nl[p]?.points?.length || 0) > 0 || (nl[p]?.table?.length || 0) > 0)
}

// Derived small-signal ratios at excursion X, for display in the Lab:
// Fs ∝ 1/√Cms, Qes ∝ 1/Bl² · √(M/C)... expressed as ratios:
export function derivedRatios(nl, X) {
  const rBl = cycleAverage(nl.Bl, X)
  const rC = cycleAverage(nl.Cms, X)
  return {
    Bl: rBl,
    Cms: rC,
    Le: cycleAverage(nl.Le, X),
    Fs: 1 / Math.sqrt(rC),
    Qes: Math.sqrt(1 / rC) / (rBl * rBl),
    Vas: rC,
  }
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
