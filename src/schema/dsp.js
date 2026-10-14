// A channel's DSP, as data.
//
// Every channel may carry a `dsp` block in the order a real processor runs
// it: input gain, mute and polarity, delay, a high-pass and a low-pass, a
// Linkwitz transform, then any number of parametric EQ bands. All of it is
// linear, so it is compiled into the simulation as ordinary circuit parts
// (`spice/filters.js`) and holds in the frequency sweep and a transient run
// alike; the transfer function drawn in the DSP window is the same cascade
// evaluated directly.

import { filterSections, sectionsResponse } from '../spice/filters.js'

/** Alignments a high- or low-pass may take, with the slopes each allows, dB/octave. */
export const PASS_SLOPES = {
  butterworth: [6, 12, 18, 24, 30, 36, 42, 48],
  'linkwitz-riley': [12, 24, 36, 48],
  bessel: [6, 12, 18, 24, 30, 36, 42, 48],
}

/** Labels for the alignments. */
export const PASS_LABELS = { butterworth: 'Butterworth', 'linkwitz-riley': 'Linkwitz-Riley', bessel: 'Bessel' }

/** Parametric band types, in menu order, with their labels. */
export const BAND_TYPES = [
  ['peak', 'Peak'], ['lowshelf', 'Low shelf'], ['highshelf', 'High shelf'], ['notch', 'Notch'], ['allpass', 'All-pass'],
]

/** Band types that have a gain. */
export const GAINED = new Set(['peak', 'lowshelf', 'highshelf'])

/** A channel's DSP with nothing switched on: flat, in phase, undelayed. */
export const DEFAULT_DSP = {
  gainDb: 0, mute: false, invert: false, delayMs: 0,
  hpf: { on: false, shape: 'butterworth', slope: 24, hz: 25 },
  lpf: { on: false, shape: 'linkwitz-riley', slope: 24, hz: 80 },
  lt: { on: false, f0: 40, q0: 0.9, fp: 25, qp: 0.6 },
  peq: [],
}

/** How far below the source a muted channel sits: silent, but its impedance still reads. */
export const MUTE_SCALE = 1e-9

/**
 * A plain deep copy.
 *
 * @param {*} v - JSON-safe data.
 * @returns {*} The copy.
 * @pure
 */
const clone = (v) => JSON.parse(JSON.stringify(v))

/**
 * A slope an alignment allows: the nearest at or above the one asked for.
 *
 * @param {string} shape - The alignment.
 * @param {number} slope - dB/octave asked for.
 * @returns {number} dB/octave.
 * @pure
 */
export function fitSlope(shape, slope) {
  const ok = PASS_SLOPES[shape] || PASS_SLOPES.butterworth
  const s = Number(slope) || 12
  return ok.find((x) => x >= s) ?? ok[ok.length - 1]
}

/**
 * Bring a stored DSP block to the full current shape.
 *
 * Missing fields take the defaults. The DSP an earlier version stored —
 * `{polarity, delayMs, filters: [{type, shape, order, hz, q, db, bypass}]}` —
 * becomes the same processing in this shape: its first high- and low-pass the
 * crossovers, its EQ filters bands.
 *
 * @param {object} [d] - A stored block, any version, or nothing.
 * @returns {object} A complete block.
 * @post d is not modified.
 * @pure
 */
export function normalizeDsp(d) {
  const out = clone(DEFAULT_DSP)
  if (!d || typeof d !== 'object') return out
  if (Array.isArray(d.filters) || 'polarity' in d) {
    out.invert = d.polarity === -1
    out.delayMs = Number(d.delayMs) || 0
    for (const f of d.filters || []) {
      const on = !f.bypass
      if ((f.type === 'highpass' || f.type === 'lowpass') && !out[f.type === 'highpass' ? 'hpf' : 'lpf'].on) {
        const shape = PASS_SLOPES[f.shape] ? f.shape : 'butterworth'
        out[f.type === 'highpass' ? 'hpf' : 'lpf'] = { on, shape, slope: fitSlope(shape, 6 * (Number(f.order) || 2)), hz: Number(f.hz) }
      } else if (['peq', 'lowshelf', 'highshelf'].includes(f.type)) {
        out.peq.push({ id: `b${out.peq.length + 1}`, on, type: f.type === 'peq' ? 'peak' : f.type, hz: Number(f.hz), db: Number(f.db) || 0, q: Number(f.q ?? 0.707) })
      }
    }
    return out
  }
  for (const k of ['gainDb', 'mute', 'invert', 'delayMs']) if (d[k] != null) out[k] = d[k]
  for (const k of ['hpf', 'lpf', 'lt']) out[k] = { ...out[k], ...(d[k] || {}) }
  for (const k of ['hpf', 'lpf']) out[k].slope = fitSlope(out[k].shape, out[k].slope)
  out.peq = (Array.isArray(d.peq) ? d.peq : []).map((b, i) => ({ id: b.id || `b${i + 1}`, on: b.on !== false, type: b.type || 'peak', hz: Number(b.hz) || 100, db: Number(b.db) || 0, q: Number(b.q) || 1 }))
  return out
}

/**
 * The filters a block switches on, in the order they run, as `filterSections` takes them.
 *
 * @param {object} d - A complete block (`normalizeDsp`).
 * @param {object} [only] - Limit to some stages: `{pass: false}` drops the high- and low-pass, `{bands: false}` the EQ and transform.
 * @returns {Array<object>} Filters.
 * @pure
 */
export function dspFilters(d, only = {}) {
  const out = []
  if (only.pass !== false) {
    if (d.hpf?.on) out.push({ type: 'highpass', shape: d.hpf.shape, order: d.hpf.slope / 6, hz: d.hpf.hz })
    if (d.lpf?.on) out.push({ type: 'lowpass', shape: d.lpf.shape, order: d.lpf.slope / 6, hz: d.lpf.hz })
  }
  if (only.bands !== false) {
    if (d.lt?.on) out.push({ type: 'transform', f0: d.lt.f0, q0: d.lt.q0, fp: d.lt.fp, qp: d.lt.qp })
    for (const b of d.peq || []) if (b.on) out.push({ type: b.type === 'peak' ? 'peq' : b.type, hz: b.hz, q: b.q, db: b.db })
  }
  return out
}

/**
 * The block's gain, mute and polarity as one factor on the channel's volts.
 *
 * @param {object} d - A complete block.
 * @returns {number} The factor: negative when inverted, `MUTE_SCALE` small when muted.
 * @pure
 */
export function dspScale(d) {
  const g = Math.pow(10, (Number(d.gainDb) || 0) / 20) * (d.invert ? -1 : 1)
  return d.mute ? g * MUTE_SCALE : g
}

/**
 * Every section a block compiles to, with the stage each came from.
 *
 * @param {object} d - A complete block.
 * @returns {Array<object>} Sections.
 * @throws {Error} Naming the stage, when one is out of range.
 * @pure
 */
export function dspSections(d) {
  const out = []
  for (const f of dspFilters(d)) {
    const name = f.type === 'highpass' ? 'high-pass' : f.type === 'lowpass' ? 'low-pass' : f.type === 'transform' ? 'Linkwitz transform' : 'EQ band'
    try { out.push(...filterSections(f)) } catch (err) { throw new Error(`${name}: ${err.message}`) }
  }
  return out
}

/**
 * Whether a block changes nothing: the channel compiles as if it had none.
 *
 * @param {object} d - A complete block.
 * @returns {boolean} True when flat.
 * @pure
 */
export function isFlat(d) {
  return !d.mute && !d.invert && !(Number(d.gainDb)) && !(Number(d.delayMs) > 0) && dspFilters(d).length === 0
}

/**
 * A block's transfer function at some frequencies: what the processor does to the signal.
 *
 * @param {object} d - A complete block.
 * @param {number[]} freqs - Frequencies, Hz.
 * @param {object} [only] - Stages to include, as for `dspFilters`; gain and delay only with everything.
 * @returns {{db: number[], phase: number[]}} Magnitude, dB, and phase, degrees wrapped to ±180.
 * @pure
 */
export function dspResponse(d, freqs, only = {}) {
  const secs = []
  // A stage out of range draws as nothing; compiling it reports why.
  for (const f of dspFilters(d, only)) { try { secs.push(...filterSections(f)) } catch { /* skipped */ } }
  const whole = only.pass !== false && only.bands !== false
  const k = whole ? dspScale(d) : 1
  const tau = whole ? (Number(d.delayMs) || 0) * 1e-3 : 0
  const db = []
  const phase = []
  for (const hz of freqs) {
    const h = sectionsResponse(secs, hz)
    const th = -2 * Math.PI * hz * tau
    const re = k * (h.re * Math.cos(th) - h.im * Math.sin(th))
    const im = k * (h.re * Math.sin(th) + h.im * Math.cos(th))
    db.push(20 * Math.log10(Math.max(Math.hypot(re, im), 1e-12)))
    phase.push((Math.atan2(im, re) * 180) / Math.PI)
  }
  return { db, phase }
}
