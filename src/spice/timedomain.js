// Time-domain analyses, on the same circuit the frequency sweep solves.
//
// - Linear responses — impulse, step, tone burst, cumulative spectral decay —
//   by inverse FFT of a fine linear frequency sweep. Exact for the linear
//   model, and quick.
// - Transient runs — any test signal through the circuit in time, with the
//   nonlinear elements (driver curves, port exit loss) switched on or off.
// - Distortion — harmonics of a steady tone, THD across frequency,
//   compression across level, and a CEA-2010-style burst maximum SPL — each
//   a series of transient runs, measured.
//
// Every analysis takes a resolved, validated project (see `prepareProject`)
// and reports progress through an optional callback, so a worker can show it
// and the caller can abandon the run.

import { compileProject } from './compile.js'
import { runNetlist, runTransient } from './run.js'
import { RHO } from './physics.js'
import { normalizeSignal, signalLength, irfft, rfft, harmonics, thd, nextPow2, signalFunction } from './dsp.js'

const P_REF = 20e-6

/**
 * dB SPL of an RMS pressure.
 *
 * @param {number} p - RMS pressure, Pa.
 * @returns {number} dB re 20 µPa, floored at 1e-12 Pa.
 * @pure
 */
export const splOf = (p) => 20 * Math.log10(Math.max(p, 1e-12) / P_REF)

/**
 * The frequency sweep a project carries, for its model settings.
 *
 * @param {object} project - A resolved project.
 * @returns {object} Its first `ac` analysis.
 * @pure
 */
function sweepOf(project) {
  return (project.analyses || []).find((a) => a.type === 'ac') || { fmin: 10, fmax: 1000, npts: 512 }
}

/**
 * Complex outputs of an AC run: far-field pressure, driver-only pressure, excursion and channel current.
 *
 * The same quantities the transient run makes as circuit nodes, so the two
 * can be compared sample for sample.
 *
 * @param {object} raw - From `runNetlist`.
 * @param {object} map - From `compileProject`.
 * @returns {{freqs: number[], pressure: object, driverPressure: object, excursion: Object<string, object>, current: object|null}} `{re, im}` arrays per quantity; pressure in Pa at 1 m, excursion in m, current in A (first channel).
 * @pure
 */
export function complexOutputs(raw, map) {
  const n = raw.freqs.length
  /**
   * A zeroed complex array.
   *
   * @returns {{re: Float64Array, im: Float64Array}} The array.
   * @pure
   */
  const z = () => ({ re: new Float64Array(n), im: new Float64Array(n) })
  const pressure = z()
  const driverPressure = z()
  for (const r of map.radiators) {
    if (!r.counts || !r.omega) continue
    const U = raw.vec(`i(${r.sense})`)
    for (let i = 0; i < n; i++) {
      // p = jωρU/Ω at 1 m
      const k = (2 * Math.PI * raw.freqs[i] * RHO) / r.omega
      const re = -k * U.im[i]
      const im = k * U.re[i]
      pressure.re[i] += re; pressure.im[i] += im
      if (r.driver) { driverPressure.re[i] += re; driverPressure.im[i] += im }
    }
  }
  const excursion = {}
  for (const d of map.drivers) {
    const u = raw.vec(`i(${d.velocity})`)
    const x = z()
    for (let i = 0; i < n; i++) {
      // x = u / jω
      const w = 2 * Math.PI * raw.freqs[i]
      x.re[i] = u.im[i] / w
      x.im[i] = -u.re[i] / w
    }
    excursion[d.id] = x
  }
  const c = map.channels[0]
  const current = c ? raw.vec(`i(${c.sense})`) : null
  return { freqs: raw.freqs, pressure, driverPressure, excursion, current }
}

/**
 * Defaults for the linear time responses.
 *
 * `bandwidth` is the highest frequency simulated (and half the sample rate
 * of the responses); `resolution` the frequency step, whose inverse is the
 * length of the responses in seconds.
 */
export const LINEAR_DEFAULTS = { bandwidth: 2000, resolution: 0.5, burstHz: 40, burstCycles: 6.5, csdSlices: 8, csdStepMs: 5 }

/**
 * Impulse, step, tone burst and cumulative spectral decay from a fine sweep.
 *
 * The response at DC is taken as zero for pressure (a box cannot hold a
 * steady pressure at a distance) and as the lowest bin's value for
 * excursion and current. The top tenth of the band is tapered with a
 * half-Hann to keep the band edge from ringing. Pressure is at 1 m, with
 * every radiator 1 m from the listener; time zero is when the signal starts.
 *
 * @param {object} project - A resolved, validated project.
 * @param {object} [opts] - Settings; see `LINEAR_DEFAULTS`.
 * @param {Function} [onProgress] - Called with `(fraction, message)`.
 * @returns {Promise<object>} `{fs, t, impulse: {pressure, driverPressure, excursion}, step: {…}, burst: {signal, pressure, driverPressure, excursion}, csd: {freqs, slices: [{ms, db}]}, spectrum: {freqs, pressure}}` — pressure in Pa, excursion in mm (per driver id), time in s. Impulse and step are per volt of the first channel (every channel keeping its relative level); the burst is at the channels' own level, as a transient run would play it.
 * @throws {Error} When SPICE cannot solve the circuit.
 * @sideEffect Runs the engine.
 */
export async function linearResponses(project, opts = {}, onProgress = () => {}) {
  const o = { ...LINEAR_DEFAULTS, ...opts }
  const df = o.resolution
  const bins = Math.max(8, nextPow2(Math.ceil(o.bandwidth / df)))
  const fmax = bins * df
  onProgress(0.05, 'Solving the fine frequency sweep')
  const sweep = sweepOf(project)
  const { netlist, map } = compileProject(project, { ...sweep, type: 'ac', scale: 'lin', fmin: df, fmax, npts: bins })
  const raw = await runNetlist(netlist)
  onProgress(0.7, 'Transforming to time')
  const out = complexOutputs(raw, map)
  const n = bins * 2
  const fs = 2 * fmax
  const dt = 1 / fs
  /**
   * The taper applied at bin k (1-based), easing the top tenth of the band to zero.
   *
   * @param {number} k - Bin.
   * @returns {number} Weight 0–1.
   * @pure
   */
  const taper = (k) => {
    const f0 = 0.9 * bins
    return k <= f0 ? 1 : 0.5 * (1 + Math.cos((Math.PI * (k - f0)) / (bins - f0)))
  }
  /**
   * A one-sided spectrum with its DC bin set, from the sweep's bins 1…N.
   *
   * @param {{re: ArrayLike<number>, im: ArrayLike<number>}} H - Complex values at df … fmax.
   * @param {boolean} dcFromLowest - Take DC as the lowest bin's real part rather than zero.
   * @returns {{re: Float64Array, im: Float64Array}} Bins 0 … N.
   * @pure
   */
  const spectrum = (H, dcFromLowest) => {
    const re = new Float64Array(bins + 1)
    const im = new Float64Array(bins + 1)
    re[0] = dcFromLowest ? H.re[0] : 0
    for (let k = 1; k <= bins; k++) {
      const w = taper(k)
      re[k] = H.re[k - 1] * w
      im[k] = H.im[k - 1] * w
    }
    return { re, im }
  }
  /**
   * Impulse response: the inverse transform, scaled from a DFT of unit impulse to a continuous-time response.
   *
   * @param {object} S - One-sided spectrum.
   * @returns {Float64Array} h[n]·(1/dt) so that Σ h·dt is the DC gain.
   * @pure
   */
  const impulse = (S) => irfft(S.re, S.im).map((v) => (v * fs) / v0)
  /**
   * Running integral of an impulse response.
   *
   * @param {Float64Array} h - Impulse response.
   * @returns {Float64Array} The step response.
   * @pure
   */
  const stepOf = (h) => { let s = 0; return h.map((v) => (s += v * dt)) }
  /**
   * Response to the tone burst, by multiplying spectra.
   *
   * @param {object} S - One-sided spectrum of the system.
   * @param {object} B - One-sided spectrum of the burst.
   * @returns {Float64Array} The response samples.
   * @pure
   */
  const burstOf = (S, B) => {
    const re = new Float64Array(bins + 1)
    const im = new Float64Array(bins + 1)
    for (let k = 0; k <= bins; k++) {
      re[k] = S.re[k] * B.re[k] - S.im[k] * B.im[k]
      im[k] = S.re[k] * B.im[k] + S.im[k] * B.re[k]
    }
    return irfft(re, im).map((v) => v * Math.SQRT2)
  }
  // The sweep drives every channel at its level (volts RMS as the phasor).
  // Impulse and step are per volt of the first channel; the burst is at the
  // channels' level, its peak √2 times their RMS volts, as a transient run.
  const v0 = Math.abs(map.channels[0]?.volts) || 1
  const Sp = spectrum(out.pressure, false)
  const Sd = spectrum(out.driverPressure, false)
  const Sx = Object.fromEntries(Object.entries(out.excursion).map(([id, x]) => [id, spectrum(x, true)]))
  const hp = impulse(Sp)
  const hd = impulse(Sd)
  const hx = Object.fromEntries(Object.entries(Sx).map(([id, S]) => [id, impulse(S)]))
  // the burst at 1 V peak, sampled on the same grid, as a spectrum
  const burstSig = normalizeSignal({ type: 'burst', hz: o.burstHz, cycles: o.burstCycles })
  const bf = signalFunction(burstSig, fs)
  const bs = new Float64Array(n)
  for (let i = 0; i < n; i++) bs[i] = bf(i * dt)
  const B = rfft(bs, n)
  // scale excursion to mm, and apply the drive: the sweep ran at each channel's level
  /**
   * Metres to millimetres.
   *
   * @param {ArrayLike<number>} a - Samples, m.
   * @returns {Float64Array|number[]} Samples, mm.
   * @pure
   */
  const mm = (a) => a.map((v) => v * 1000)
  const t = Array.from({ length: n }, (_, i) => i * dt)
  // Cumulative spectral decay: the spectrum of the impulse response from
  // successively later start times, each windowed off with a half-Hann tail.
  onProgress(0.85, 'Cumulative spectral decay')
  const slices = []
  const win = Math.min(n, Math.round(0.3 * fs))
  for (let s = 0; s < o.csdSlices; s++) {
    const start = Math.round((s * o.csdStepMs * fs) / 1000)
    const seg = new Float64Array(nextPow2(win))
    for (let i = 0; i < win && start + i < n; i++) {
      const w = i < win / 2 ? 1 : 0.5 * (1 + Math.cos((Math.PI * (i - win / 2)) / (win / 2)))
      seg[i] = hp[start + i] * w * dt
    }
    const S = rfft(seg)
    const db = Array.from(S.re, (re, k) => splOf(Math.hypot(re, S.im[k])))
    slices.push({ ms: s * o.csdStepMs, db, df: fs / seg.length })
  }
  onProgress(1, 'Done')
  return {
    fs, t,
    impulse: { pressure: hp, driverPressure: hd, excursion: Object.fromEntries(Object.entries(hx).map(([id, h]) => [id, mm(h)])) },
    step: { pressure: stepOf(hp), driverPressure: stepOf(hd), excursion: Object.fromEntries(Object.entries(hx).map(([id, h]) => [id, mm(stepOf(h))])) },
    burst: {
      hz: o.burstHz, cycles: o.burstCycles,
      signal: bs,
      pressure: burstOf(Sp, B), driverPressure: burstOf(Sd, B),
      excursion: Object.fromEntries(Object.entries(Sx).map(([id, S]) => [id, mm(burstOf(S, B))])),
    },
    csd: { slices },
    spectrum: { freqs: out.freqs, pressure: out.pressure },
  }
}

/** Defaults for a transient run. */
export const TRANSIENT_DEFAULTS = {
  signal: { type: 'burst', hz: 40, cycles: 6.5 }, levelDb: 0, fs: 8000, duration: 0.5, bandwidth: 1000, nonlinear: true,
}

/**
 * The sweep settings a transient run compiles its model from.
 *
 * The line slicing and loss-network fits follow the model bandwidth, not
 * the sample rate, so a higher sample rate does not multiply the circuit.
 *
 * @param {object} project - A resolved project.
 * @param {number} bandwidth - Highest frequency the model must represent, Hz.
 * @returns {object} An `ac`-shaped analysis for `compileProject`.
 * @pure
 */
function modelFor(project, bandwidth) {
  return { ...sweepOf(project), fmin: 5, fmax: bandwidth }
}

/**
 * Run one transient simulation and collect its waveforms.
 *
 * @param {object} project - A resolved, validated project.
 * @param {object} run - `{signal, levelDb, fs, tstop, bandwidth, nonlinear}`.
 * @returns {Promise<object>} `{t, pressure, driverPressure, excursion: {id: mm[]}, current: {ch: A[]}, voltage: {ch: V[]}, velocity: {wg: m/s[]}, probes: {id: {kind, values}}}` — pressure in Pa at 1 m.
 * @throws {Error} When SPICE cannot solve the circuit.
 * @sideEffect Runs the engine.
 */
export async function transientRun(project, run) {
  const signal = normalizeSignal(run.signal)
  const { netlist, map } = compileProject(project, modelFor(project, run.bandwidth || 1000), {
    tran: { signal, levelDb: run.levelDb || 0, fs: run.fs, tstop: run.tstop, nonlinear: !!run.nonlinear },
  })
  const raw = await runTransient(netlist)
  const n = raw.time.length
  /**
   * A silent series, one sample per time step.
   *
   * @returns {Float64Array} Zeros.
   * @pure
   */
  const zeros = () => new Float64Array(n)
  const res = {
    t: raw.time,
    pressure: map.pressure ? raw.vec(`v(${map.pressure})`) : zeros(),
    driverPressure: map.driverPressure ? raw.vec(`v(${map.driverPressure})`) : zeros(),
    excursion: {}, current: {}, voltage: {}, velocity: {}, probes: {},
    nonlinearDrivers: map.drivers.filter((d) => d.nonlinear).map((d) => d.id),
  }
  for (const d of map.drivers) res.excursion[d.id] = raw.vec(`v(${d.x})`).map((v) => v * 1000)
  for (const c of map.channels) {
    res.current[c.id] = raw.vec(`i(${c.sense})`)
    res.voltage[c.id] = raw.vec(`v(${c.load})`)
  }
  for (const w of map.waveguides) {
    // the faster of the two ends, as the velocity chart reads it
    let best = null
    let bestE = -1
    for (const e of Object.values(w.ends)) {
      const U = raw.vec(`i(${e.sense})`)
      let s = 0
      for (const v of U) s += v * v
      if (s > bestE) { bestE = s; best = U.map((v) => v / e.S) }
    }
    if (best) res.velocity[w.id] = best
  }
  for (const p of map.probes) res.probes[p.key] = { kind: 'pressure', values: raw.vec(`v(${p.node})`) }
  for (const p of map.flowProbes) {
    if (!p.sense) { res.probes[p.key] = { kind: p.kind, values: zeros() }; continue }
    const U = raw.vec(`i(${p.sense})`)
    res.probes[p.key] = { kind: p.kind, values: U.map((v) => (v * p.scale) / (p.kind === 'velocity' ? p.S : 1)) }
  }
  return res
}

/**
 * Summary figures of a waveform.
 *
 * @param {ArrayLike<number>} x - Samples.
 * @returns {{peak: number, rms: number}} Largest magnitude and RMS.
 * @pure
 */
export function levels(x) {
  let peak = 0
  let e = 0
  for (const v of x) { const a = Math.abs(v); if (a > peak) peak = a; e += v * v }
  return { peak, rms: Math.sqrt(e / Math.max(x.length, 1)) }
}

/**
 * A transient analysis: one signal through the circuit, and optionally the same run with the nonlinear elements off, for comparison.
 *
 * @param {object} project - A resolved, validated project.
 * @param {object} [opts] - See `TRANSIENT_DEFAULTS`; `duration` s is the run length, `compareLinear` adds the linear run.
 * @param {Function} [onProgress] - Called with `(fraction, message)`.
 * @returns {Promise<{run: object, linear: object|null, signal: object, fs: number}>} The run, the linear run when asked for and different, the signal used and the sample rate.
 * @throws {Error} When SPICE cannot solve the circuit.
 * @sideEffect Runs the engine.
 */
export async function transientAnalysis(project, opts = {}, onProgress = () => {}) {
  const o = { ...TRANSIENT_DEFAULTS, ...opts }
  const signal = normalizeSignal(o.signal)
  const tstop = Math.max(o.duration, 1 / o.fs * 16)
  const base = { signal, levelDb: o.levelDb, fs: o.fs, tstop, bandwidth: o.bandwidth }
  onProgress(0.05, o.nonlinear ? 'Nonlinear run' : 'Linear run')
  const run = await transientRun(project, { ...base, nonlinear: o.nonlinear })
  let linear = null
  if (o.compareLinear && o.nonlinear && (run.nonlinearDrivers.length || hasExitLoss(project))) {
    onProgress(0.5, 'Linear run, for comparison')
    linear = await transientRun(project, { ...base, nonlinear: false })
  }
  onProgress(1, 'Done')
  return { run, linear, signal, fs: o.fs }
}

/**
 * Whether any waveguide end carries a flow loss.
 *
 * @param {object} project - A resolved project.
 * @returns {boolean} True when some waveguide has a positive `throatK` or `mouthK`.
 * @pure
 */
function hasExitLoss(project) {
  return (project.nodes || []).some((n) => n.type === 'waveguide' && (Number(n.params.throatK) > 0 || Number(n.params.mouthK) > 0))
}

/** CEA-2010 distortion limits: harmonic → allowed level relative to the fundamental, dB. */
export const CEA2010_LIMITS = { 2: -10, 3: -15, 4: -20, 5: -20, 6: -30, 7: -30, 8: -40, 9: -40, 10: -40 }

/** Defaults for the distortion analyses. */
export const DISTORTION_DEFAULTS = {
  hz: 40, levelDb: 0, harmonics: 10, bandwidth: 1000,
  f1: 15, f2: 200, points: 12,
  levels: [-12, -6, 0, 6, 12],
  bands: [20, 25, 31.5, 40, 50, 63], xLimit: 1.5, maxBoostDb: 30,
}

/**
 * One steady tone through the circuit, measured.
 *
 * The run lasts long enough for the box to settle — the longer of 0.3 s and
 * ten periods — then a whole number of periods is analysed. The sample rate
 * is a whole multiple of the tone, so every analysed period has the same
 * samples and there is no leakage.
 *
 * @param {object} project - A resolved, validated project.
 * @param {number} hz - Frequency, Hz.
 * @param {number} levelDb - Level offset, dB, over every channel's level.
 * @param {object} o - Distortion options: `harmonics`, `bandwidth`, `nonlinear`.
 * @returns {Promise<object>} `{hz, levelDb, harmonics: [{n, hz, amp, db}], thd, spl, xPeak: {id: mm}, currentPeak, voltagePeak}` — `amp` in Pa at 1 m, `db` relative to the fundamental, `spl` the fundamental's level.
 * @throws {Error} When SPICE cannot solve the circuit.
 * @sideEffect Runs the engine.
 */
export async function measureTone(project, hz, levelDb, o) {
  const perPeriod = Math.max(40, Math.ceil((4 * o.bandwidth) / hz), 2 * (o.harmonics + 2))
  const fs = hz * perPeriod
  const periods = Math.max(4, Math.ceil(0.1 * hz))
  const settle = Math.max(0.3, 10 / hz)
  const tstop = Math.ceil(settle * hz) / hz + periods / hz
  const run = await transientRun(project, {
    signal: { type: 'sine', hz }, levelDb, fs, tstop, bandwidth: o.bandwidth, nonlinear: o.nonlinear !== false,
  })
  const h = harmonics(run.pressure, fs, hz, o.harmonics, periods)
  const f = h[0].amp
  const tail = Math.round((periods * fs) / hz)
  /**
   * Largest magnitude over the analysed periods.
   *
   * @param {ArrayLike<number>} x - Samples.
   * @returns {number} The peak.
   * @pure
   */
  const peakOf = (x) => levels(Array.prototype.slice.call(x, x.length - tail)).peak
  const firstCh = Object.keys(run.current)[0]
  return {
    hz, levelDb,
    harmonics: h.map((x) => ({ ...x, db: 20 * Math.log10(Math.max(x.amp, 1e-15) / Math.max(f, 1e-15)) })),
    thd: thd(h),
    spl: splOf(f / Math.SQRT2),
    xPeak: Object.fromEntries(Object.entries(run.excursion).map(([id, x]) => [id, peakOf(x)])),
    currentPeak: firstCh ? peakOf(run.current[firstCh]) : 0,
    voltagePeak: firstCh ? peakOf(run.voltage[firstCh]) : 0,
    waveform: { fs, t: Array.prototype.slice.call(run.t, run.t.length - tail), pressure: Array.prototype.slice.call(run.pressure, run.pressure.length - tail) },
  }
}

/**
 * The linear model's fundamental level at one frequency, for compression.
 *
 * @param {object} project - A resolved project.
 * @param {number} hz - Frequency, Hz.
 * @param {number} levelDb - Level offset, dB.
 * @returns {Promise<number>} dB SPL at 1 m.
 * @throws {Error} When SPICE cannot solve the circuit.
 * @sideEffect Runs the engine.
 */
export async function linearLevel(project, hz, levelDb) {
  const { netlist, map } = compileProject(project, { ...sweepOf(project), type: 'ac', scale: 'lin', fmin: hz, fmax: hz, npts: 1 })
  const out = complexOutputs(await runNetlist(netlist), map)
  return splOf(Math.hypot(out.pressure.re[0], out.pressure.im[0])) + levelDb
}

/**
 * Logarithmically spaced frequencies.
 *
 * @param {number} f1 - Lowest, Hz.
 * @param {number} f2 - Highest, Hz.
 * @param {number} n - Count, at least 1.
 * @returns {number[]} The frequencies, rounded to 0.1 Hz.
 * @pure
 */
export function logFreqs(f1, f2, n) {
  if (n <= 1) return [f1]
  return Array.from({ length: n }, (_, i) => Math.round(f1 * Math.pow(f2 / f1, i / (n - 1)) * 10) / 10)
}

/**
 * Whether a burst measurement breaks a limit, and which.
 *
 * @param {object} m - From `measureBurst`.
 * @param {number} xLimitMm - Excursion limit, mm per driver id, or a number for all.
 * @returns {string|null} The limit broken — `H<n>` or `excursion` — or `null`.
 * @pure
 */
export function brokenLimit(m, xLimitMm) {
  for (const h of m.harmonics.slice(1)) {
    const lim = CEA2010_LIMITS[h.n]
    if (lim != null && h.db > lim) return `H${h.n}`
  }
  for (const [id, x] of Object.entries(m.xPeak)) {
    const lim = typeof xLimitMm === 'number' ? xLimitMm : xLimitMm?.[id]
    if (lim > 0 && x > lim) return 'excursion'
  }
  return null
}

/**
 * A Hann-windowed 6.5-cycle burst through the circuit, measured as CEA-2010 does in spirit.
 *
 * Harmonic levels are the response spectrum's magnitude at each multiple
 * of the burst frequency, relative to the fundamental's; the level reported
 * is the peak pressure of the response as an RMS-equivalent (peak/√2).
 *
 * @param {object} project - A resolved, validated project.
 * @param {number} hz - Burst frequency, Hz.
 * @param {number} levelDb - Level offset, dB.
 * @param {object} o - Distortion options.
 * @returns {Promise<{hz: number, levelDb: number, spl: number, harmonics: object[], xPeak: object}>} The measurement.
 * @throws {Error} When SPICE cannot solve the circuit.
 * @sideEffect Runs the engine.
 */
export async function measureBurst(project, hz, levelDb, o) {
  const sig = normalizeSignal({ type: 'burst', hz, cycles: 6.5 })
  const fs = Math.max(4 * o.bandwidth, 40 * hz * 2)
  const tstop = signalLength(sig) + 4 / hz
  const run = await transientRun(project, { signal: sig, levelDb, fs, tstop, bandwidth: o.bandwidth, nonlinear: o.nonlinear !== false })
  const p = run.pressure
  const N = p.length
  /**
   * The response's spectral magnitude at one frequency (a direct Fourier sum).
   *
   * @param {number} f - Frequency, Hz.
   * @returns {number} |P(f)|.
   * @pure
   */
  const mag = (f) => {
    let c = 0
    let s = 0
    const w = (2 * Math.PI * f) / fs
    for (let i = 0; i < N; i++) { c += p[i] * Math.cos(w * i); s += p[i] * Math.sin(w * i) }
    return Math.hypot(c, s)
  }
  const f1 = mag(hz)
  const hs = []
  for (let n = 1; n <= 10; n++) {
    const a = n === 1 ? f1 : mag(n * hz)
    hs.push({ n, hz: n * hz, db: 20 * Math.log10(Math.max(a, 1e-15) / Math.max(f1, 1e-15)) })
  }
  return {
    hz, levelDb,
    spl: splOf(levels(p).peak / Math.SQRT2),
    harmonics: hs,
    xPeak: Object.fromEntries(Object.entries(run.excursion).map(([id, x]) => [id, levels(x).peak])),
  }
}

/**
 * Distortion analyses.
 *
 * - `harmonics`: one tone at `hz`, `levelDb` — its harmonic levels, THD and
 *   the last periods of its waveform.
 * - `thd`: tones at `points` log-spaced frequencies from `f1` to `f2` — THD,
 *   H2 and H3 against frequency.
 * - `compression`: tones at the same frequencies at each of `levels` (dB
 *   over the channels' level) — the fundamental's level against the linear
 *   model's, as compression in dB.
 * - `maxspl`: for each band frequency, the highest burst level that breaks
 *   neither the CEA-2010 distortion limits nor `xLimit` × Xmax of excursion,
 *   found by stepping up 3 dB then halving to 0.25 dB.
 *
 * @param {object} project - A resolved, validated project.
 * @param {string} mode - `harmonics`, `thd`, `compression` or `maxspl`.
 * @param {object} [opts] - See `DISTORTION_DEFAULTS`.
 * @param {Function} [onProgress] - Called with `(fraction, message)`.
 * @returns {Promise<object>} The mode's results, with `mode` set.
 * @throws {Error} For an unknown mode, or when SPICE cannot solve the circuit.
 * @sideEffect Runs the engine, many times.
 */
export async function distortionAnalysis(project, mode, opts = {}, onProgress = () => {}) {
  const o = { ...DISTORTION_DEFAULTS, ...opts }
  if (mode === 'harmonics') {
    onProgress(0.1, `Tone at ${o.hz} Hz`)
    const m = await measureTone(project, o.hz, o.levelDb, o)
    onProgress(1, 'Done')
    return { mode, ...m }
  }
  const freqs = logFreqs(o.f1, o.f2, o.points)
  if (mode === 'thd') {
    const rows = []
    for (const [i, f] of freqs.entries()) {
      onProgress(i / freqs.length, `${f} Hz (${i + 1} of ${freqs.length})`)
      const m = await measureTone(project, f, o.levelDb, o)
      rows.push({ hz: f, thd: m.thd, h2: m.harmonics[1]?.db, h3: m.harmonics[2]?.db, spl: m.spl, xPeak: m.xPeak })
    }
    onProgress(1, 'Done')
    return { mode, levelDb: o.levelDb, rows }
  }
  if (mode === 'compression') {
    const rows = freqs.map((hz) => ({ hz }))
    const total = freqs.length * o.levels.length
    let k = 0
    for (const L of o.levels) {
      for (const row of rows) {
        onProgress(k / total, `${row.hz} Hz at ${L >= 0 ? '+' : ''}${L} dB (${k + 1} of ${total})`)
        const m = await measureTone(project, row.hz, L, o)
        const lin = await linearLevel(project, row.hz, L)
        row[`spl${L}`] = m.spl
        row[`cmp${L}`] = m.spl - lin
        k++
      }
    }
    onProgress(1, 'Done')
    return { mode, levels: o.levels, rows }
  }
  if (mode === 'maxspl') {
    const xmax = Object.fromEntries((project.nodes || []).filter((n) => n.type === 'driver').map((n) => [n.id, (Number(n.params.Xmax) || 0) * o.xLimit]))
    const rows = []
    for (const [i, f] of o.bands.entries()) {
      const frac = i / o.bands.length
      const step = 1 / o.bands.length
      let lo = null
      let hi = null
      let last = null
      let L = o.levelDb
      let tries = 0
      // step up until a limit breaks, or down until none does
      let m = await measureBurst(project, f, L, o)
      let broke = brokenLimit(m, xmax)
      if (!broke) { lo = { L, m } } else { hi = { L, m, broke } }
      while (tries < 16 && (lo == null || hi == null)) {
        tries++
        onProgress(frac + step * Math.min(0.5, tries / 20), `${f} Hz: trying ${L >= 0 ? '+' : ''}${L} dB`)
        L += lo ? 3 : -3
        if (L - o.levelDb > o.maxBoostDb) break
        m = await measureBurst(project, f, L, o)
        broke = brokenLimit(m, xmax)
        if (!broke) lo = { L, m }
        else hi = { L, m, broke }
      }
      while (lo && hi && hi.L - lo.L > 0.25 && tries < 30) {
        tries++
        onProgress(frac + step * Math.min(0.95, 0.5 + tries / 60), `${f} Hz: narrowing`)
        const mid = (lo.L + hi.L) / 2
        m = await measureBurst(project, f, mid, o)
        broke = brokenLimit(m, xmax)
        if (!broke) lo = { L: mid, m }
        else hi = { L: mid, m, broke }
      }
      last = lo
      rows.push({
        hz: f,
        spl: last ? last.m.spl : null,
        levelDb: last ? last.L : null,
        limit: hi ? hi.broke : 'none within range',
        xPeak: last ? last.m.xPeak : null,
      })
    }
    onProgress(1, 'Done')
    return { mode, rows }
  }
  throw new Error(`unknown distortion analysis "${mode}"`)
}
