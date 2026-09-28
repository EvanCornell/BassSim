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
//
// Runs that do not depend on each other are started together: where the
// engine sits behind a thread pool (see `run.js`), they go side by side, one
// per thread; in a single process they simply queue.

import { compileProject } from './compile.js'
import { runNetlist, runTransient, threadCount } from './run.js'
import { RHO } from './physics.js'
import { adaptResults } from './adapt.js'
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
 * Solver settings a transient run tries in turn, until one finishes.
 *
 * KLU from rest first, the fastest; then ngspice's default solver from its
 * operating point; then each with Gear integration. See `compileProject`.
 */
export const SOLVER_SETTINGS = [
  { solver: 'klu', robust: false },
  { solver: 'sparse', robust: false },
  { solver: 'sparse', robust: true },
  { solver: 'klu', robust: true },
]

/**
 * Run one transient simulation and collect its waveforms.
 *
 * A run that fails is tried again with each of `SOLVER_SETTINGS` in turn;
 * only when every one fails does the run fail, with ngspice's own message
 * from the first.
 *
 * @param {object} project - A resolved, validated project.
 * @param {object} run - `{signal, levelDb, fs, tstop, bandwidth, nonlinear}`.
 * @returns {Promise<object>} `{t, pressure, driverPressure, excursion: {id: mm[]}, current: {ch: A[]}, voltage: {ch: V[]}, velocity: {wg: m/s[]}, acousticPower: W[], probes: {id: {kind, values}}}` — pressure in Pa at 1 m; `acousticPower` the instantaneous power into every counted radiator's load.
 * @throws {Error} When SPICE cannot solve the circuit with any of the settings, or the run is cancelled.
 * @sideEffect Runs the engine, up to once per setting.
 */
export async function transientRun(project, run) {
  const signal = normalizeSignal(run.signal)
  const tran = { signal, levelDb: run.levelDb || 0, fs: run.fs, tstop: run.tstop, nonlinear: !!run.nonlinear }
  // Compiling can fail only for a project the compiler cannot build; that
  // is reported at once, not retried.
  const { map } = compileProject(project, modelFor(project, run.bandwidth || 1000), { tran })
  let out = null
  let first = null
  for (const settings of SOLVER_SETTINGS) {
    const { netlist } = compileProject(project, modelFor(project, run.bandwidth || 1000), { tran: { ...tran, ...settings } })
    try {
      out = { raw: await runTransient(netlist), map }
      break
    } catch (err) {
      if (err.name === 'Cancelled') throw err
      first = first || err
    }
  }
  if (!out) throw first
  const { raw } = out
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
  // Power radiated: p·U at every radiator that counts, as the sweep sums it.
  res.acousticPower = zeros()
  for (const r of map.radiators) {
    if (!r.counts) continue
    const U = raw.vec(`i(${r.sense})`)
    const P = raw.vec(`v(${r.node})`)
    for (let i = 0; i < n; i++) res.acousticPower[i] += P[i] * U[i]
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
  // The linear run for comparison goes alongside the nonlinear one, when
  // there is anything nonlinear for it to differ from.
  const compare = o.compareLinear && o.nonlinear && (hasExitLoss(project) || hasCurves(project, o.bandwidth))
  onProgress(0.05, compare ? 'Nonlinear run, and a linear one for comparison' : o.nonlinear ? 'Nonlinear run' : 'Linear run')
  const [run, linear] = await Promise.all([
    transientRun(project, { ...base, nonlinear: o.nonlinear }),
    compare ? transientRun(project, { ...base, nonlinear: false }) : null,
  ])
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

/**
 * Whether any driver in the project carries a large-signal curve.
 *
 * @param {object} project - A resolved project.
 * @param {number} bandwidth - The model bandwidth, Hz, as the run compiles it.
 * @returns {boolean} True when some driver compiles as nonlinear.
 * @pure
 */
function hasCurves(project, bandwidth) {
  const signal = normalizeSignal({ type: 'sine', hz: 50 })
  const { map } = compileProject(project, modelFor(project, bandwidth || 1000), { tran: { signal, levelDb: 0, fs: 1000, tstop: 0.01, nonlinear: true } })
  return map.drivers.some((d) => d.nonlinear)
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
 * @returns {Promise<object>} `{hz, levelDb, harmonics: [{n, hz, amp, db}], thd, spl, xPeak: {id: mm}, vPeak: {wg: m/s}, z: {ch: {mag, phase}}, pe, pa, efficiency, currentPeak, voltagePeak}` — `amp` in Pa at 1 m, `db` relative to the fundamental, `spl` the fundamental's level; `z` each channel's load impedance at the fundamental (Ω, degrees); `pe` the electrical power delivered to the loads and `pa` the acoustic power radiated, W, averaged over the analysed periods, harmonics and all; `efficiency` their ratio.
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
  /**
   * Mean of a product over the analysed periods: the average power of a flow and its pressure, or a current and its voltage.
   *
   * @param {ArrayLike<number>} a - Samples.
   * @param {ArrayLike<number>} [b] - Samples; all ones when omitted.
   * @returns {number} The mean.
   * @pure
   */
  const meanOf = (a, b) => {
    let s = 0
    for (let i = a.length - tail; i < a.length; i++) s += a[i] * (b ? b[i] : 1)
    return s / tail
  }
  const firstCh = Object.keys(run.current)[0]
  // Impedance at the fundamental: the voltage's fundamental over the current's.
  const z = {}
  let pe = 0
  for (const ch of Object.keys(run.current)) {
    const [v] = harmonics(run.voltage[ch], fs, hz, 1, periods)
    const [i] = harmonics(run.current[ch], fs, hz, 1, periods)
    let ph = ((v.phase - i.phase) * 180) / Math.PI
    while (ph > 180) ph -= 360
    while (ph <= -180) ph += 360
    z[ch] = { mag: v.amp / Math.max(i.amp, 1e-15), phase: ph }
    pe += meanOf(run.voltage[ch], run.current[ch])
  }
  const pa = meanOf(run.acousticPower)
  return {
    hz, levelDb,
    harmonics: h.map((x) => ({ ...x, db: 20 * Math.log10(Math.max(x.amp, 1e-15) / Math.max(f, 1e-15)) })),
    thd: thd(h),
    spl: splOf(f / Math.SQRT2),
    xPeak: Object.fromEntries(Object.entries(run.excursion).map(([id, x]) => [id, peakOf(x)])),
    vPeak: Object.fromEntries(Object.entries(run.velocity).map(([id, v]) => [id, peakOf(v)])),
    z,
    pe,
    pa,
    efficiency: pe > 0 ? pa / pe : null,
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
  return (await linearPoint(project, hz, levelDb)).spl
}

/**
 * The linear model at one frequency, in the figures `measureTone` gives.
 *
 * Solved once, by the same small AC run as the sweep's; excursion, velocity
 * and power are then scaled to the level, as the linear model scales them.
 *
 * @param {object} project - A resolved project.
 * @param {number} hz - Frequency, Hz.
 * @param {number} levelDb - Level offset, dB.
 * @returns {Promise<object>} `{spl, xPeak: {id: mm}, vPeak: {wg: m/s}, z: {ch: {mag, phase}}, pe, pa, efficiency}`, as `measureTone` defines them.
 * @throws {Error} When SPICE cannot solve the circuit.
 * @sideEffect Runs the engine.
 */
export async function linearPoint(project, hz, levelDb) {
  const { netlist, map } = compileProject(project, { ...sweepOf(project), type: 'ac', scale: 'lin', fmin: hz, fmax: hz, npts: 1 })
  const raw = await runNetlist(netlist)
  const out = complexOutputs(raw, map)
  const r = adaptResults(raw, map)
  const pe = r.peReal[0]
  const pa = r.power[0]
  return scaleLinear({
    spl: splOf(Math.hypot(out.pressure.re[0], out.pressure.im[0])),
    xPeak: Object.fromEntries(Object.entries(r.excursionByDriver).map(([id, x]) => [id, x[0]])),
    vPeak: Object.fromEntries(Object.entries(r.velocity).map(([id, v]) => [id, v[0]])),
    z: Object.fromEntries(Object.entries(r.zinByChannel).map(([id, c]) => [id, { mag: c.mag[0], phase: c.phase[0] }])),
    pe, pa,
    efficiency: pe > 0 ? pa / pe : null,
  }, levelDb)
}

/**
 * A power ratio in dB.
 *
 * @param {number|null} a - Power, or a ratio of powers.
 * @param {number|null} b - The reference.
 * @returns {number|null} 10·log10(a/b); null unless both are positive.
 * @pure
 */
export function ratioDb(a, b) {
  return a > 0 && b > 0 ? 10 * Math.log10(a / b) : null
}

/**
 * The linear model's figures at another level.
 *
 * Levels, excursion and velocity scale with the drive, powers with its
 * square; impedance and efficiency do not change.
 *
 * @param {object} lin - From `linearPoint` at 0 dB.
 * @param {number} levelDb - Level offset, dB.
 * @returns {object} The same figures at `levelDb`.
 * @pure
 */
export function scaleLinear(lin, levelDb) {
  const g = Math.pow(10, levelDb / 20)
  /**
   * Scale every value of a map.
   *
   * @param {object} m - `{id: number}`.
   * @returns {object} Each value times the gain.
   * @pure
   */
  const each = (m) => Object.fromEntries(Object.entries(m).map(([k, v]) => [k, v * g]))
  return {
    ...lin,
    spl: lin.spl + levelDb,
    xPeak: each(lin.xPeak),
    vPeak: each(lin.vPeak),
    pe: lin.pe * g * g,
    pa: lin.pa * g * g,
  }
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
 * The highest level that breaks no limit, searched with several levels tested at once.
 *
 * Levels are assumed to break limits from some threshold up. Until a level
 * that passes and one that breaks are both known, the search steps 3 dB
 * at a time from `start` — upward from a pass, downward from a failure,
 * `width()` steps per round; then it tests `width()` evenly spaced levels
 * inside the bracket each round, narrowing it by that many plus one, until
 * it is 0.25 dB wide. With a width of 1 this is a plain step-then-halve search.
 *
 * @param {object} s - The search.
 * @param {number} s.start - First level, dB.
 * @param {number} s.top - Highest level to try, dB.
 * @param {number} s.bottom - Lowest level to try, dB.
 * @param {Function} s.test - `(L) → Promise<{broke: string|null, …}>`.
 * @param {Function} s.width - `() → number`: levels to test per round, now.
 * @param {Function} [s.onRound] - Called with the search's progress, 0–1, after each round.
 * @returns {Promise<{lo: object|null, hi: object|null, tried: number}>} The highest passing level below the lowest breaking one — each `{L, …test's result}` — and the number of levels tested.
 * @sideEffect Calls `test`, several at a time.
 */
export async function maxLevel(s) {
  const tried = []
  /**
   * The current bracket: the lowest breaking level, and the highest passing one below it.
   *
   * @returns {{lo: object|null, hi: object|null}} Either may be missing.
   * @reads the levels tried.
   */
  const bracket = () => {
    let hi = null
    for (const r of tried) if (r.broke && (!hi || r.L < hi.L)) hi = r
    let lo = null
    for (const r of tried) if (!r.broke && (!hi || r.L < hi.L) && (!lo || r.L > lo.L)) lo = r
    return { lo, hi }
  }
  const TOL = 0.25
  for (let round = 0; round < 40; round++) {
    const { lo, hi } = bracket()
    if (lo && hi && hi.L - lo.L <= TOL) break
    const k = Math.max(1, Math.floor(s.width()))
    let levels
    if (lo && hi) {
      levels = Array.from({ length: k }, (_, j) => lo.L + ((hi.L - lo.L) * (j + 1)) / (k + 1))
    } else if (lo) {
      levels = Array.from({ length: k }, (_, j) => lo.L + 3 * (j + 1)).filter((L) => L <= s.top + 1e-9)
    } else if (hi) {
      levels = Array.from({ length: k }, (_, j) => hi.L - 3 * (j + 1)).filter((L) => L >= s.bottom - 1e-9)
    } else {
      // first round: the start, then upward twice as far as downward
      const steps = [0]
      let up = 0
      let down = 0
      while (steps.length < k) steps.push(steps.length % 3 === 0 ? -3 * ++down : 3 * ++up)
      levels = steps.map((d) => s.start + d).filter((L) => L <= s.top + 1e-9 && L >= s.bottom - 1e-9)
    }
    if (!levels.length) break
    const results = await Promise.all(levels.map(async (L) => ({ L, ...(await s.test(L)) })))
    tried.push(...results)
    if (s.onRound) {
      const b = bracket()
      s.onRound(b.lo && b.hi ? 0.5 + 0.5 * Math.min(1, Math.log(3 / Math.max(b.hi.L - b.lo.L, TOL)) / Math.log(3 / TOL)) : 0.25)
    }
  }
  return { ...bracket(), tried: tried.length }
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
 *   model's, as compression in dB; and, per point, the figures of
 *   `measureTone` (`row.at[L]`: THD, excursion, port velocity, impedance,
 *   electrical and acoustic power, efficiency) beside the linear model's at
 *   the same level (`row.linear[L]`, from `linearPoint`). The compression
 *   is split in two: `effLoss`, 10·log10 of the efficiency over the linear
 *   model's — output lost as the power drawn is turned into sound less
 *   well — and `powerChange`, 10·log10 of the electrical power over the
 *   linear model's — output lost because less power is drawn.
 * - `maxspl`: for each band frequency, the highest burst level that breaks
 *   neither the CEA-2010 distortion limits nor `xLimit` × Xmax of excursion,
 *   found by stepping 3 dB then narrowing to 0.25 dB (see `maxLevel`),
 *   every band at once.
 *
 * @param {object} project - A resolved, validated project.
 * @param {string} mode - `harmonics`, `thd`, `compression` or `maxspl`.
 * @param {object} [opts] - See `DISTORTION_DEFAULTS`.
 * @param {Function} [onProgress] - Called with `(fraction, message)`.
 * @returns {Promise<object>} The mode's results, with `mode` set; for `thd`, `compression` and `maxspl`, `failed` lists the points no solver setting could solve — `{label, error}` — whose values are `null` (for max SPL, a level that cannot be solved counts as past the limit, `no solution`).
 * @throws {Error} For an unknown mode, or when SPICE cannot solve the circuit at any point.
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
  // A point that cannot be solved with any solver settings is left out and
  // listed in `failed`, rather than losing the rest; only when every point
  // fails does the analysis fail.
  const failed = []
  /**
   * Note a point that could not be solved.
   *
   * @param {string} label - Which point, e.g. `40 Hz at +6 dB`.
   * @param {Error} err - Why.
   * @returns {null} Always, to stand in for the point's result.
   * @throws {Error} A cancellation, passed straight on.
   * @mutates the enclosing `failed` list.
   */
  const fail = (label, err) => {
    if (err.name === 'Cancelled') throw err
    failed.push({ label, error: err.message })
    return null
  }
  /**
   * Fail the analysis when no point could be solved.
   *
   * @param {number} total - Points attempted.
   * @returns {void}
   * @throws {Error} The first point's error, when all of them failed.
   * @reads the enclosing `failed` list.
   */
  const allFailed = (total) => {
    if (failed.length && failed.length >= total) throw new Error(`No point could be solved. ${failed[0].label}: ${failed[0].error}`)
  }
  /**
   * A level offset written for a label.
   *
   * @param {number} L - dB.
   * @returns {string} `+6 dB`, `-3 dB`.
   * @pure
   */
  const dB = (L) => `${L >= 0 ? '+' : ''}${L} dB`
  if (mode === 'thd') {
    // every frequency at once, the lowest (longest) first
    let done = 0
    onProgress(0, `${freqs.length} tones`)
    const rows = await Promise.all(freqs.map(async (f) => {
      const m = await measureTone(project, f, o.levelDb, o).catch((err) => fail(`${f} Hz`, err))
      done++
      onProgress(done / freqs.length, `${done} of ${freqs.length} tones done`)
      if (!m) return { hz: f, thd: null, h2: null, h3: null, spl: null, xPeak: null }
      return { hz: f, thd: m.thd, h2: m.harmonics[1]?.db, h3: m.harmonics[2]?.db, spl: m.spl, xPeak: m.xPeak }
    }))
    allFailed(freqs.length)
    onProgress(1, 'Done')
    return { mode, levelDb: o.levelDb, rows, failed }
  }
  if (mode === 'compression') {
    // The linear model's level scales with the drive, so one small AC run
    // per frequency serves every level; the tones all go at once.
    const total = freqs.length * o.levels.length
    let done = 0
    onProgress(0, `${total} tones`)
    const [lins, tones] = await Promise.all([
      Promise.all(freqs.map((hz) => linearPoint(project, hz, 0).catch((err) => fail(`${hz} Hz, linear level`, err)))),
      Promise.all(o.levels.flatMap((L) => freqs.map(async (hz) => {
        const m = await measureTone(project, hz, L, o).catch((err) => fail(`${hz} Hz at ${dB(L)}`, err))
        done++
        onProgress(done / total, `${done} of ${total} tones done`)
        return { hz, L, m }
      }))),
    ])
    allFailed(total)
    const rows = freqs.map((hz, i) => {
      const row = { hz, at: {}, linear: {} }
      for (const { L, m } of tones.filter((x) => x.hz === hz)) {
        const lin = lins[i] ? scaleLinear(lins[i], L) : null
        row[`spl${L}`] = m ? m.spl : null
        row[`cmp${L}`] = m && lin ? m.spl - lin.spl : null
        // Compression splits into the power drawn and what becomes of it:
        // `effLoss` is the change in efficiency, `powerChange` the change in
        // electrical power, both dB against the linear model.
        row.at[L] = m ? {
          effLoss: ratioDb(m.efficiency, lin?.efficiency),
          powerChange: ratioDb(m.pe, lin?.pe),
          spl: m.spl, cmp: row[`cmp${L}`], thd: m.thd, xPeak: m.xPeak, vPeak: m.vPeak, z: m.z, pe: m.pe, pa: m.pa, efficiency: m.efficiency } : null
        row.linear[L] = lin
      }
      return row
    })
    onProgress(1, 'Done')
    return { mode, levels: o.levels, rows, failed }
  }
  if (mode === 'maxspl') {
    const xmax = Object.fromEntries((project.nodes || []).filter((n) => n.type === 'driver').map((n) => [n.id, (Number(n.params.Xmax) || 0) * o.xLimit]))
    const bands = o.bands
    let active = bands.length
    const partial = new Array(bands.length).fill(0)
    /**
     * Report the search's progress: bands finished, and how far along the rest are.
     *
     * @param {string} message - What is running.
     * @returns {void}
     * @sideEffect Calls `onProgress`.
     */
    const report = (message) => onProgress(partial.reduce((a, b) => a + b, 0) / bands.length, message)
    const rows = await Promise.all(bands.map(async (f, bi) => {
      const found = await maxLevel({
        start: o.levelDb,
        top: o.levelDb + o.maxBoostDb,
        bottom: o.levelDb - 48,
        /**
         * Test one level at this band.
         *
         * @param {number} L - Level offset, dB.
         * @returns {Promise<{m: object, broke: string|null}>} The measurement and the limit it breaks.
         * @sideEffect Runs the engine.
         */
        test: async (L) => {
          try {
            const m = await measureBurst(project, f, L, o)
            return { m, broke: brokenLimit(m, xmax) }
          } catch (err) {
            // a level the circuit cannot be solved at counts as past the limit
            fail(`${f} Hz at ${dB(Math.round(L * 100) / 100)}`, err)
            return { m: null, broke: 'no solution' }
          }
        },
        /**
         * How many levels this band may test at once: its share of the threads.
         *
         * @returns {number} At least 1.
         * @reads the thread count and the bands still searching.
         */
        width: () => Math.max(1, Math.ceil(threadCount() / Math.max(active, 1))),
        /**
         * Note a round's end.
         *
         * @param {number} fraction - How far this band's search has come, 0–1.
         * @returns {void}
         * @sideEffect Reports progress.
         */
        onRound: (fraction) => {
          partial[bi] = Math.min(0.95, fraction)
          report(`${bands.length - active} of ${bands.length} bands done`)
        },
      })
      active--
      partial[bi] = 1
      report(`${bands.length - active} of ${bands.length} bands done`)
      const lo = found.lo
      return {
        hz: f,
        spl: lo ? lo.m.spl : null,
        levelDb: lo ? lo.L : null,
        limit: found.hi ? found.hi.broke : 'none within range',
        xPeak: lo ? lo.m.xPeak : null,
      }
    }))
    if (rows.every((r) => r.levelDb == null && r.limit === 'no solution')) allFailed(failed.length)
    onProgress(1, 'Done')
    return { mode, rows, failed }
  }
  throw new Error(`unknown distortion analysis "${mode}"`)
}
