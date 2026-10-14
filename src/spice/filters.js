// DSP filters as ordinary circuit parts.
//
// The ngspice build has no transfer-function block, so every filter is a
// cascade of first- and second-order sections, each one a real R-L-C network
// read out through controlled sources. That keeps the filter an ordinary
// circuit, valid in the frequency sweep and in a later transient run alike.
//
// A second-order section H(s) = (b2·s² + b1·s + b0) / (s² + a1·s + a0) is a
// series L-R-C driven by the section's input: the voltage across L is
// s²/D(s), across R a1·s/D(s) and across C a0/D(s), so any numerator is a sum
// of those three voltages with fixed gains. A first-order section
// (b1·s + b0) / (s + a0) is the same with an R-C divider.

import { fmt } from './netlist.js'

/** Filter types a channel's DSP may hold. */
export const FILTER_TYPES = ['highpass', 'lowpass', 'peq', 'lowshelf', 'highshelf', 'notch', 'allpass', 'transform']

/** Alignments for high- and low-pass filters. */
export const FILTER_SHAPES = ['butterworth', 'linkwitz-riley', 'bessel']

/**
 * The Q of each second-order stage of a Butterworth filter, and whether it has a first-order stage.
 *
 * @param {number} order - Filter order, 1 or more.
 * @returns {{qs: number[], first: boolean}} Stage Qs, and whether a first-order stage completes an odd order.
 * @pure
 */
export function butterworthStages(order) {
  const n = Math.max(1, Math.round(order))
  const qs = []
  for (let k = 1; k <= Math.floor(n / 2); k++) qs.push(1 / (2 * Math.sin(((2 * k - 1) * Math.PI) / (2 * n))))
  return { qs, first: n % 2 === 1 }
}

/**
 * The poles of a Bessel low-pass prototype, scaled to be −3 dB at 1 rad/s.
 *
 * The poles are the roots of the reverse Bessel polynomial, found together by
 * Durand–Kerner iteration; then the frequency the magnitude crosses 1/√2 is
 * found by bisection and every pole divided by it, the usual normalisation
 * for audio crossovers.
 *
 * @param {number} order - Filter order, 1 or more.
 * @returns {Array<{re: number, im: number}>} The poles, one of each conjugate pair (im ≥ 0) plus any real one.
 * @pure
 */
export function besselPoles(order) {
  const n = Math.max(1, Math.round(order))
  // θn(s) = Σ a_k s^k, a_k = (2n−k)! / (2^(n−k) k! (n−k)!)
  /**
   * k factorial.
   *
   * @param {number} k - A whole number.
   * @returns {number} k!.
   * @pure
   */
  const fact = (k) => { let f = 1; for (let i = 2; i <= k; i++) f *= i; return f }
  const a = []
  for (let k = 0; k <= n; k++) a.push(fact(2 * n - k) / (2 ** (n - k) * fact(k) * fact(n - k)))
  const monic = a.map((c) => c / a[n])
  /**
   * The monic polynomial at a complex point.
   *
   * @param {number} zr - Real part.
   * @param {number} zi - Imaginary part.
   * @returns {number[]} `[re, im]`.
   * @pure
   */
  const poly = (zr, zi) => {
    let r = 0, i = 0
    for (let k = n; k >= 0; k--) { const t = r * zr - i * zi + monic[k]; i = r * zi + i * zr; r = t }
    return [r, i]
  }
  let roots = Array.from({ length: n }, (_, k) => ({ re: 0.4 * Math.cos(2.1 * k + 0.4) - 1, im: 0.9 * Math.sin(2.1 * k + 0.4) * n / 2 }))
  for (let it = 0; it < 500; it++) {
    let moved = 0
    roots = roots.map((z, k) => {
      const [pr, pi] = poly(z.re, z.im)
      let dr = 1, di = 0
      roots.forEach((w, j) => { if (j !== k) { const xr = z.re - w.re, xi = z.im - w.im; const t = dr * xr - di * xi; di = dr * xi + di * xr; dr = t } })
      const d = dr * dr + di * di
      const qr = (pr * dr + pi * di) / d, qi = (pi * dr - pr * di) / d
      moved = Math.max(moved, Math.hypot(qr, qi))
      return { re: z.re - qr, im: z.im - qi }
    })
    if (moved < 1e-14) break
  }
  /**
   * |H(jω)|² of the all-pole prototype, with unit gain at DC.
   *
   * @param {number} w - Frequency, rad/s.
   * @returns {number} The power gain.
   * @pure
   */
  const mag2 = (w) => roots.reduce((g, p) => g * (p.re * p.re + p.im * p.im) / (p.re * p.re + (w - p.im) ** 2), 1)
  let lo = 0.01, hi = 100
  for (let i = 0; i < 200; i++) { const mid = Math.sqrt(lo * hi); if (mag2(mid) > 0.5) lo = mid; else hi = mid }
  const w3 = Math.sqrt(lo * hi)
  return roots.filter((p) => p.im > -1e-9).map((p) => ({ re: p.re / w3, im: Math.abs(p.im) < 1e-9 ? 0 : p.im / w3 }))
}

/**
 * The prototype poles of an alignment at 1 rad/s, one of each conjugate pair.
 *
 * @param {string} shape - `butterworth` or `bessel`.
 * @param {number} order - Filter order.
 * @returns {Array<{re: number, im: number}>} The poles.
 * @pure
 */
function prototypePoles(shape, order) {
  if (shape === 'bessel') return besselPoles(order)
  const n = Math.max(1, Math.round(order))
  const out = []
  for (let k = 1; k <= Math.ceil(n / 2); k++) {
    const t = (Math.PI * (2 * k + n - 1)) / (2 * n)
    out.push({ re: Math.cos(t), im: Math.abs(Math.sin(t)) < 1e-12 ? 0 : -Math.sin(t) })
  }
  return out.map((p) => ({ re: p.re, im: Math.abs(p.im) }))
}

/**
 * A high- or low-pass filter as sections, from its prototype poles.
 *
 * A low-pass at ω has the prototype's poles times ω; a high-pass, ω over
 * them. A conjugate pair is one second-order section, a real pole one
 * first-order section.
 *
 * @param {boolean} hp - High-pass rather than low-pass.
 * @param {Array<{re: number, im: number}>} poles - Prototype poles.
 * @param {number} w - Corner, rad/s.
 * @returns {Array<object>} Sections, each with unit gain in its passband.
 * @pure
 */
function passSections(hp, poles, w) {
  return poles.map((p) => {
    const m2 = p.re * p.re + p.im * p.im
    // ω/p = ω·conj(p)/|p|²
    const q = hp ? { re: (w * p.re) / m2, im: (-w * p.im) / m2 } : { re: w * p.re, im: w * p.im }
    if (p.im === 0) {
      const a0 = -q.re
      return { order: 1, b: hp ? [1, 0] : [0, a0], a: [a0] }
    }
    const a1 = -2 * q.re
    const a0 = q.re * q.re + q.im * q.im
    return { order: 2, b: hp ? [1, 0, 0] : [0, 0, a0], a: [a1, a0] }
  })
}

/**
 * Break one filter into first- and second-order sections.
 *
 * Coefficients are for H(s) with s in rad/s; each section is normalised so
 * its denominator is monic. Butterworth and Bessel come from their prototype
 * poles; Bessel is normalised to −3 dB at its frequency. Linkwitz-Riley of
 * order 2n is two Butterworth filters of order n in cascade, so an odd
 * Linkwitz-Riley order is rounded up to the next even one. Gains for the
 * parametric and shelving filters are in dB and follow the analogue
 * prototypes behind the common audio "cookbook" biquads. A notch has zeros on
 * the axis at its frequency; an all-pass has unit gain and turns the phase
 * through 360° about its frequency. A Linkwitz transform moves a sealed
 * box's resonance from `f0`, `q0` to `fp`, `qp`.
 *
 * @param {object} f - A filter: `{type, shape, order, hz}` for high/low pass; `{type, hz, q, db}` for `peq`, `lowshelf`, `highshelf`; `{type, hz, q}` for `notch`, `allpass`; `{type, f0, q0, fp, qp}` for `transform`.
 * @returns {Array<{order: 1|2, b: number[], a: number[]}>} Sections in cascade. Second order: `b = [b2, b1, b0]`, `a = [a1, a0]`. First order: `b = [b1, b0]`, `a = [a0]`.
 * @throws {Error} When the filter type is unknown or a value is out of range.
 * @pure
 */
export function filterSections(f) {
  if (f.type === 'transform') {
    const [f0, q0, fp, qp] = [f.f0, f.q0, f.fp, f.qp].map(Number)
    if (!(f0 > 0 && fp > 0)) throw new Error('a Linkwitz transform needs frequencies above zero')
    if (!(q0 > 0 && qp > 0)) throw new Error('a Linkwitz transform needs a Q above zero')
    const w0 = 2 * Math.PI * f0
    const wp = 2 * Math.PI * fp
    return [{ order: 2, b: [1, w0 / q0, w0 * w0], a: [wp / qp, wp * wp] }]
  }
  const hz = Number(f.hz)
  if (!(hz > 0)) throw new Error('a filter needs a frequency above zero')
  const w = 2 * Math.PI * hz
  if (f.type === 'highpass' || f.type === 'lowpass') {
    const hp = f.type === 'highpass'
    let order = Math.max(1, Math.round(Number(f.order) || 2))
    let passes = 1
    let shape = f.shape || 'butterworth'
    if (shape === 'linkwitz-riley') {
      order = Math.max(1, Math.ceil(order / 2))
      passes = 2
      shape = 'butterworth'
    } else if (!FILTER_SHAPES.includes(shape)) {
      throw new Error(`unknown filter shape "${f.shape}"`)
    }
    const one = passSections(hp, prototypePoles(shape, order), w)
    return passes === 2 ? [...one, ...one] : one
  }
  const q = Number(f.q ?? 0.707)
  if (!(q > 0)) throw new Error('a filter needs a Q above zero')
  if (f.type === 'notch') return [{ order: 2, b: [1, 0, w * w], a: [w / q, w * w] }]
  if (f.type === 'allpass') return [{ order: 2, b: [1, -w / q, w * w], a: [w / q, w * w] }]
  const A = Math.pow(10, (Number(f.db) || 0) / 40)
  if (f.type === 'peq') {
    return [{ order: 2, b: [1, (w * A) / q, w * w], a: [w / (A * q), w * w] }]
  }
  const r = Math.sqrt(A)
  if (f.type === 'lowshelf') {
    // A·(s² + (√A/Q)ω s + Aω²) / (A s² + (√A/Q)ω s + ω²), made monic
    return [{ order: 2, b: [1, (r * w) / q, A * w * w], a: [w / (r * q), (w * w) / A] }]
  }
  if (f.type === 'highshelf') {
    // A·(A s² + (√A/Q)ω s + ω²) / (s² + (√A/Q)ω s + Aω²)
    return [{ order: 2, b: [A * A, (A * r * w) / q, A * w * w], a: [(r * w) / q, A * w * w] }]
  }
  throw new Error(`unknown filter type "${f.type}"`)
}

/**
 * Evaluate a cascade of sections at one frequency.
 *
 * @param {Array<object>} sections - From `filterSections`.
 * @param {number} hz - Frequency, Hz.
 * @returns {{re: number, im: number}} The complex response.
 * @pure
 */
export function sectionsResponse(sections, hz) {
  const w = 2 * Math.PI * hz
  let re = 1
  let im = 0
  for (const s of sections) {
    let nr, ni, dr, di
    if (s.order === 2) {
      // s = jw: s² = −w²
      nr = s.b[2] - s.b[0] * w * w; ni = s.b[1] * w
      dr = s.a[1] - w * w; di = s.a[0] * w
    } else {
      nr = s.b[1]; ni = s.b[0] * w
      dr = s.a[0]; di = w
    }
    const d = dr * dr + di * di
    const hr = (nr * dr + ni * di) / d
    const hi = (ni * dr - nr * di) / d
    const r2 = re * hr - im * hi
    im = re * hi + im * hr
    re = r2
  }
  return { re, im }
}

/**
 * Add a cascade of sections to a netlist, from a driven node to a new one.
 *
 * Each section reads its input as a node voltage and drives its output from
 * an ideal controlled source, so sections never load one another. Element
 * values are scaled to the section's natural frequency to stay near unity.
 *
 * @param {object} nl - The netlist builder.
 * @param {string} input - A node driven by an ideal source.
 * @param {Array<object>} sections - From `filterSections`.
 * @param {string} note - Comment naming the channel.
 * @returns {string} The node carrying the filtered signal.
 * @mutates nl.
 */
export function compileSections(nl, input, sections, note) {
  let at = input
  for (const s of sections) {
    const out = [] // [gain, plus node, minus node]
    if (s.order === 2) {
      const [a1, a0] = s.a
      const L = 1 / Math.sqrt(a0)
      const a = nl.node()
      const b = nl.node()
      nl.add('L', [at, a], fmt(L), `${note} filter section`)
      nl.add('R', [a, b], fmt(a1 * L))
      nl.add('C', [b, '0'], fmt(1 / (a0 * L)))
      out.push([s.b[0], at, a], [s.b[1] / a1, a, b], [s.b[2] / a0, b, '0'])
    } else {
      const [a0] = s.a
      const b = nl.node()
      nl.add('C', [at, b], fmt(1 / a0), `${note} filter section`)
      nl.add('R', [b, '0'], '1')
      // across R: s/(s + a0); across C: a0/(s + a0)
      out.push([s.b[0], b, '0'], [s.b[1] / a0, at, b])
    }
    // Stack one controlled source per term in series: their voltages add.
    let base = '0'
    for (const [g, p, m] of out.filter(([g]) => g !== 0)) {
      const next = nl.node()
      nl.add('E', [next, base, p, m], fmt(g))
      base = next
    }
    if (base === '0') { base = nl.node(); nl.add('R', [base, '0'], '1') }
    at = base
  }
  return at
}
