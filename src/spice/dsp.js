// Signal processing for the time-domain analyses: test signals, FFTs,
// harmonic measurement and display decimation.
//
// Each test signal exists twice, as the same formula: a behavioural-source
// expression over `time` that drives the circuit, and a JavaScript function
// that samples it for the linear (FFT) path and for measurement. Keeping them
// side by side is what lets a transient run be checked against the linear
// response of the same model.

/** Signal types a transient analysis may use. */
export const SIGNAL_TYPES = ['sine', 'burst', 'sweep', 'noise']

/**
 * Fill in a signal's defaults.
 *
 * - `sine`: `hz`, faded in over `fade` cycles (default 2) so the start does
 *   not ring the box.
 * - `burst`: `hz`, `cycles` (default 6.5), Hann-windowed — the CEA-2010 shape.
 * - `sweep`: exponential from `f1` to `f2` over `length` s, faded out over
 *   its last few cycles (see `sweepFade`) so it does not stop on a step.
 * - `noise`: pink, `f1`–`f2` band, `length` s, seeded so a run repeats.
 *
 * @param {object} sig - A signal, possibly sparse.
 * @returns {object} The complete signal.
 * @throws {Error} For an unknown type or a non-positive frequency.
 * @pure
 */
export function normalizeSignal(sig) {
  const s = { type: 'sine', ...sig }
  if (!SIGNAL_TYPES.includes(s.type)) throw new Error(`unknown signal "${s.type}"`)
  if (s.type === 'sine') return { fade: 2, hz: 40, ...s }
  if (s.type === 'burst') return { cycles: 6.5, hz: 40, ...s }
  if (s.type === 'sweep') return { f1: 10, f2: 500, length: 1, ...s }
  return { f1: 10, f2: 500, length: 1, seed: 1, ...s }
}

/**
 * How long a sweep fades out over at its end, s.
 *
 * Three periods of the top frequency, or a tenth of the sweep if shorter —
 * enough that the signal ends at zero without a step, which the circuit
 * would otherwise ring at.
 *
 * @param {object} sig - A normalised sweep.
 * @returns {number} The fade length, s.
 * @pure
 */
export function sweepFade(sig) {
  return Math.min(3 / sig.f2, sig.length / 10)
}

/**
 * How long a signal lasts before it is silent, s.
 *
 * @param {object} sig - A normalised signal.
 * @returns {number} The active length; `Infinity` for a sine.
 * @pure
 */
export function signalLength(sig) {
  if (sig.type === 'sine') return Infinity
  if (sig.type === 'burst') return sig.cycles / sig.hz
  return sig.length
}

/**
 * The signal as a function of time, peak amplitude 1 (noise: RMS 1).
 *
 * @param {object} sig - A normalised signal.
 * @param {number} [fs] - Sample rate, Hz — needed for noise only.
 * @returns {Function} `t → value`.
 * @pure
 */
export function signalFunction(sig, fs = 48000) {
  const w = 2 * Math.PI * (sig.hz || 0)
  if (sig.type === 'sine') {
    const tf = sig.fade / sig.hz
    return (t) => (t < 0 ? 0 : Math.sin(w * t) * (t < tf ? 0.5 * (1 - Math.cos((Math.PI * t) / tf)) : 1))
  }
  if (sig.type === 'burst') {
    const T = sig.cycles / sig.hz
    return (t) => (t < 0 || t >= T ? 0 : Math.sin(w * t) * 0.5 * (1 - Math.cos((2 * Math.PI * t) / T)))
  }
  if (sig.type === 'sweep') {
    const L = Math.log(sig.f2 / sig.f1)
    const k = (2 * Math.PI * sig.f1 * sig.length) / L
    const tf = sweepFade(sig)
    const t0 = sig.length - tf
    return (t) => (t < 0 || t >= sig.length ? 0
      : Math.sin(k * (Math.exp((t * L) / sig.length) - 1)) * (t > t0 ? 0.5 * (1 + Math.cos((Math.PI * (t - t0)) / tf)) : 1))
  }
  const samples = pinkNoise(sig, fs)
  return (t) => {
    const x = t * fs
    const i = Math.floor(x)
    if (i < 0 || i >= samples.length - 1) return 0
    return samples[i] + (samples[i + 1] - samples[i]) * (x - i)
  }
}

/**
 * The signal as a behavioural-source expression over `time`.
 *
 * Only functions verified in this ngspice build appear: `sin`, `cos`, `exp`,
 * comparisons and the conditional. Noise is not an expression; it is given
 * as sampled points instead (see `signalPoints`).
 *
 * @param {object} sig - A normalised signal, not noise.
 * @param {number} amp - Peak amplitude, V.
 * @returns {string} The expression.
 * @pure
 */
export function signalExpression(sig, amp) {
  /**
   * A number written for the netlist.
   *
   * @param {number} v - The value.
   * @returns {string} Twelve significant figures.
   * @pure
   */
  const n = (v) => Number(v).toPrecision(12)
  const w = n(2 * Math.PI * sig.hz)
  if (sig.type === 'sine') {
    const tf = n(sig.fade / sig.hz)
    return `${n(amp)}*sin(${w}*time)*(time<${tf}?0.5*(1-cos(${n(Math.PI)}*time/${tf})):1)`
  }
  if (sig.type === 'burst') {
    const T = n(sig.cycles / sig.hz)
    return `(time<${T}?${n(amp)}*sin(${w}*time)*0.5*(1-cos(${n(2 * Math.PI)}*time/${T})):0)`
  }
  if (sig.type === 'sweep') {
    const L = Math.log(sig.f2 / sig.f1)
    const tf = sweepFade(sig)
    const t0 = sig.length - tf
    return `(time<${n(sig.length)}?${n(amp)}*sin(${n((2 * Math.PI * sig.f1 * sig.length) / L)}*(exp(time*${n(L / sig.length)})-1))`
      + `*(time>${n(t0)}?0.5*(1+cos(${n(Math.PI / tf)}*(time-${n(t0)}))):1):0)`
  }
  throw new Error('noise has no expression; use signalPoints')
}

/**
 * Sampled points of a signal, for a PWL source.
 *
 * @param {object} sig - A normalised signal.
 * @param {number} amp - Scale, V (peak for tones, RMS for noise).
 * @param {number} fs - Sample rate, Hz.
 * @returns {number[]} Alternating time, value pairs, ending in silence.
 * @pure
 */
export function signalPoints(sig, amp, fs) {
  const f = signalFunction(sig, fs)
  const n = Math.ceil(signalLength(sig) * fs)
  const out = []
  for (let i = 0; i <= n; i++) out.push(i / fs, amp * f(i / fs))
  out.push((n + 1) / fs, 0)
  return out
}

/**
 * A small seeded random generator (mulberry32).
 *
 * @param {number} seed - Seed.
 * @returns {Function} `() → [0, 1)`.
 * @pure
 */
function rng(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * Band-limited pink noise, RMS 1, repeatable from its seed.
 *
 * Built in the frequency domain: random phases, amplitude ∝ 1/√f inside
 * f1–f2 and zero outside, so the band edges are exact.
 *
 * @param {object} sig - A normalised noise signal.
 * @param {number} fs - Sample rate, Hz.
 * @returns {Float64Array} The samples.
 * @pure
 */
export function pinkNoise(sig, fs) {
  const n = nextPow2(Math.ceil(sig.length * fs))
  const re = new Float64Array(n)
  const im = new Float64Array(n)
  const rand = rng(sig.seed || 1)
  for (let k = 1; k < n / 2; k++) {
    const f = (k * fs) / n
    if (f < sig.f1 || f > sig.f2) continue
    const a = 1 / Math.sqrt(f)
    const ph = 2 * Math.PI * rand()
    re[k] = a * Math.cos(ph); im[k] = a * Math.sin(ph)
    re[n - k] = re[k]; im[n - k] = -im[k]
  }
  fft(re, im, true)
  const len = Math.ceil(sig.length * fs)
  const out = re.slice(0, len)
  let e = 0
  for (const v of out) e += v * v
  const rms = Math.sqrt(e / Math.max(len, 1)) || 1
  // fade the ends over 10 ms so the loop does not click
  const fade = Math.min(Math.round(0.01 * fs), Math.floor(len / 4))
  for (let i = 0; i < len; i++) {
    let g = 1 / rms
    if (i < fade) g *= i / fade
    if (len - 1 - i < fade) g *= (len - 1 - i) / fade
    out[i] *= g
  }
  return out
}

/**
 * The smallest power of two at least n.
 *
 * @param {number} n - A count.
 * @returns {number} The power of two.
 * @pure
 */
export function nextPow2(n) {
  let p = 1
  while (p < n) p *= 2
  return p
}

/**
 * In-place radix-2 FFT.
 *
 * @param {Float64Array} re - Real parts; length a power of two.
 * @param {Float64Array} im - Imaginary parts.
 * @param {boolean} [inverse] - Inverse transform, scaled by 1/n.
 * @returns {void}
 * @mutates re and im.
 */
export function fft(re, im, inverse = false) {
  const n = re.length
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1
    for (; j & bit; bit >>= 1) j ^= bit
    j ^= bit
    if (i < j) {
      let t = re[i]; re[i] = re[j]; re[j] = t
      t = im[i]; im[i] = im[j]; im[j] = t
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = ((inverse ? 2 : -2) * Math.PI) / len
    const wr = Math.cos(ang)
    const wi = Math.sin(ang)
    for (let i = 0; i < n; i += len) {
      let cr = 1
      let ci = 0
      for (let k = 0; k < len / 2; k++) {
        const a = i + k
        const b = a + len / 2
        const xr = re[b] * cr - im[b] * ci
        const xi = re[b] * ci + im[b] * cr
        re[b] = re[a] - xr; im[b] = im[a] - xi
        re[a] += xr; im[a] += xi
        const t = cr * wr - ci * wi
        ci = cr * wi + ci * wr
        cr = t
      }
    }
  }
  if (inverse) for (let i = 0; i < n; i++) { re[i] /= n; im[i] /= n }
}

/**
 * A real signal from its one-sided spectrum.
 *
 * @param {Float64Array} re - Real parts at bins 0 … n/2.
 * @param {Float64Array} im - Imaginary parts at bins 0 … n/2.
 * @returns {Float64Array} The n real samples.
 * @pure
 */
export function irfft(re, im) {
  const half = re.length - 1
  const n = half * 2
  const R = new Float64Array(n)
  const I = new Float64Array(n)
  for (let k = 0; k <= half; k++) { R[k] = re[k]; I[k] = im[k] }
  I[0] = 0; I[half] = 0
  for (let k = 1; k < half; k++) { R[n - k] = re[k]; I[n - k] = -im[k] }
  fft(R, I, true)
  return R
}

/**
 * The one-sided spectrum of real samples, zero-padded to a power of two.
 *
 * @param {ArrayLike<number>} x - Samples.
 * @param {number} [n] - Transform length; the next power of two by default.
 * @returns {{re: Float64Array, im: Float64Array}} Bins 0 … n/2.
 * @pure
 */
export function rfft(x, n = nextPow2(x.length)) {
  const re = new Float64Array(n)
  const im = new Float64Array(n)
  for (let i = 0; i < Math.min(x.length, n); i++) re[i] = x[i]
  fft(re, im)
  return { re: re.slice(0, n / 2 + 1), im: im.slice(0, n / 2 + 1) }
}

/**
 * The amplitude of each harmonic of f in a steady-state stretch of signal.
 *
 * A direct Fourier sum at each harmonic over a whole number of fundamental
 * periods, so there is no leakage from the window as long as the stretch
 * really is periodic.
 *
 * @param {ArrayLike<number>} x - Samples.
 * @param {number} fs - Sample rate, Hz.
 * @param {number} f - Fundamental, Hz.
 * @param {number} count - Harmonics to measure, from the fundamental.
 * @param {number} periods - Whole periods to analyse, taken from the end of `x`.
 * @returns {Array<{n: number, hz: number, amp: number, phase: number}>} Peak amplitude and phase of each harmonic.
 * @pure
 */
export function harmonics(x, fs, f, count, periods) {
  const len = Math.min(x.length, Math.round((periods * fs) / f))
  const start = x.length - len
  const out = []
  for (let n = 1; n <= count; n++) {
    const w = (2 * Math.PI * n * f) / fs
    let c = 0
    let s = 0
    for (let i = 0; i < len; i++) {
      c += x[start + i] * Math.cos(w * (start + i))
      s += x[start + i] * Math.sin(w * (start + i))
    }
    out.push({ n, hz: n * f, amp: (2 * Math.hypot(c, s)) / len, phase: Math.atan2(-s, c) })
  }
  return out
}

/**
 * Total harmonic distortion from harmonic amplitudes.
 *
 * @param {Array<{amp: number}>} h - From `harmonics`; the first is the fundamental.
 * @returns {number} THD as a fraction of the fundamental.
 * @pure
 */
export function thd(h) {
  const f = h[0]?.amp || 0
  if (!(f > 0)) return 0
  let e = 0
  for (let i = 1; i < h.length; i++) e += h[i].amp * h[i].amp
  return Math.sqrt(e) / f
}

/**
 * Thin a long series for drawing, keeping each bucket's extremes.
 *
 * @param {ArrayLike<number>} t - Sample times.
 * @param {Array<ArrayLike<number>>} ys - Series sharing those times.
 * @param {number} max - Most points to keep.
 * @returns {{t: number[], ys: number[][]}} The thinned times and series. With more samples than `max`, each bucket keeps two points — its first series' minimum and maximum, in time order — so peaks survive.
 * @pure
 */
export function decimate(t, ys, max) {
  if (t.length <= max) return { t: Array.from(t), ys: ys.map((y) => Array.from(y)) }
  const buckets = Math.floor(max / 2)
  const size = t.length / buckets
  const outT = []
  const outY = ys.map(() => [])
  for (let b = 0; b < buckets; b++) {
    const i0 = Math.floor(b * size)
    const i1 = Math.min(t.length, Math.floor((b + 1) * size))
    let lo = i0
    let hi = i0
    const y0 = ys[0]
    for (let i = i0; i < i1; i++) { if (y0[i] < y0[lo]) lo = i; if (y0[i] > y0[hi]) hi = i }
    for (const i of lo === hi ? [lo] : lo < hi ? [lo, hi] : [hi, lo]) {
      outT.push(t[i])
      ys.forEach((y, k) => outY[k].push(y[i]))
    }
  }
  return { t: outT, ys: outY }
}
