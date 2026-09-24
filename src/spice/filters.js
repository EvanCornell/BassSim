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
export const FILTER_TYPES = ['highpass', 'lowpass', 'peq', 'lowshelf', 'highshelf']

/** Alignments for high- and low-pass filters. */
export const FILTER_SHAPES = ['butterworth', 'linkwitz-riley']

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
 * Break one filter into first- and second-order sections.
 *
 * Coefficients are for H(s) with s in rad/s; each section is normalised so
 * its denominator is monic. Linkwitz-Riley of order 2n is two Butterworth
 * filters of order n in cascade, so an odd Linkwitz-Riley order is rounded up
 * to the next even one. Gains for the parametric and shelving filters are in
 * dB and follow the analogue prototypes behind the common audio "cookbook"
 * biquads.
 *
 * @param {object} f - A filter: `{type, shape, order, hz}` for high/low pass; `{type, hz, q, db}` for `peq`, `lowshelf`, `highshelf`.
 * @returns {Array<{order: 1|2, b: number[], a: number[]}>} Sections in cascade. Second order: `b = [b2, b1, b0]`, `a = [a1, a0]`. First order: `b = [b1, b0]`, `a = [a0]`.
 * @throws {Error} When the filter type is unknown or a value is out of range.
 * @pure
 */
export function filterSections(f) {
  const hz = Number(f.hz)
  if (!(hz > 0)) throw new Error('a filter needs a frequency above zero')
  const w = 2 * Math.PI * hz
  if (f.type === 'highpass' || f.type === 'lowpass') {
    const hp = f.type === 'highpass'
    let order = Math.max(1, Math.round(Number(f.order) || 2))
    let passes = 1
    if (f.shape === 'linkwitz-riley') {
      order = Math.max(1, Math.ceil(order / 2))
      passes = 2
    } else if (f.shape && f.shape !== 'butterworth') {
      throw new Error(`unknown filter shape "${f.shape}"`)
    }
    const { qs, first } = butterworthStages(order)
    const out = []
    for (let p = 0; p < passes; p++) {
      for (const q of qs) out.push({ order: 2, b: hp ? [1, 0, 0] : [0, 0, w * w], a: [w / q, w * w] })
      if (first) out.push({ order: 1, b: hp ? [1, 0] : [0, w], a: [w] })
    }
    return out
  }
  const q = Number(f.q ?? 0.707)
  if (!(q > 0)) throw new Error('a filter needs a Q above zero')
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
