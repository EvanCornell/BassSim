// Time-domain runs: what a run is, how it is named, what can be varied
// across a series, and what can be drawn or tabulated from it.
//
// A run is stored as a branch off its record (see records.js): the project
// as it was run, and `run.json` holding the run's settings and results. The
// project's run list carries a summary of each — title, kind, its figures —
// so the library, tables and metric charts never need to open the results;
// only waveform charts do.
//
// Everything here is pure.

import { derive, DEFAULT_BASIS, COUPLED } from './driverParams'
import { normalizeSignal, signalFunction, signalLength, rfft } from './spice/dsp'
import { splOf, levels } from './spice/timedomain'

/** The analyses a run can be, `[id, label, long label]`. */
export const ANALYSES = [
  ['transient', 'Transient', 'Transient'],
  ['harmonics', 'Harmonics', 'Harmonics at one frequency'],
  ['thd', 'THD sweep', 'THD across frequency'],
  ['compression', 'Compression', 'Compression across level'],
  ['maxspl', 'Max SPL', 'Maximum SPL (CEA-2010 style)'],
]

/**
 * The worker job an analysis runs as.
 *
 * @param {string} analysis - An `ANALYSES` id.
 * @returns {{kind: 'transient'|'distortion', mode?: string}} The job's kind, and the distortion mode.
 * @pure
 */
export function jobOf(analysis) {
  return analysis === 'transient' ? { kind: 'transient' } : { kind: 'distortion', mode: analysis }
}

/**
 * The label of an analysis.
 *
 * @param {string} analysis - An `ANALYSES` id.
 * @returns {string} Its short label.
 * @pure
 */
export const analysisLabel = (analysis) => (ANALYSES.find((a) => a[0] === analysis) || [, analysis])[1]

/**
 * A level offset as text.
 *
 * @param {number} L - dB.
 * @returns {string} `0 dB`, `+6 dB`, `−3 dB`.
 * @pure
 */
export const dbText = (L) => `${L > 0 ? '+' : L < 0 ? '−' : ''}${Math.abs(Number(L.toFixed(2)))} dB`

/**
 * A number for a title: short, no trailing zeros.
 *
 * @param {number} v - The value.
 * @returns {string} Up to four significant figures.
 * @pure
 */
const num = (v) => String(Number(Number(v).toPrecision(4)))

/**
 * The settings one run of an analysis uses, from the project's time-domain settings.
 *
 * @param {string} analysis - An `ANALYSES` id.
 * @param {{transient: object, distortion: object}} settings - The project's time-domain settings.
 * @returns {object} The job's options.
 * @pure
 */
export function optsOf(analysis, settings) {
  return analysis === 'transient' ? { ...settings.transient, signal: { ...settings.transient.signal } } : { ...settings.distortion, mode: analysis }
}

/**
 * A run's title from its analysis and options.
 *
 * @param {string} analysis - An `ANALYSES` id.
 * @param {object} o - The run's options.
 * @param {string[]} [varied] - Vary keys to leave out of the title, for a series.
 * @returns {string} e.g. `Burst 40 Hz × 6.5 · +6 dB`.
 * @pure
 */
export function runTitle(analysis, o, varied = []) {
  const lv = varied.includes('level') ? '' : ` · ${dbText(o.levelDb || 0)}`
  /**
   * A frequency for the title, unless the series varies it.
   *
   * @param {number} hz - Frequency.
   * @returns {string} ` 40 Hz`, or nothing.
   * @pure
   */
  const hzOf = (hz) => (varied.includes('hz') ? '' : ` ${num(hz)} Hz`)
  if (analysis === 'transient') {
    const s = o.signal || {}
    if (s.type === 'burst') return `Burst${hzOf(s.hz)} × ${num(s.cycles)}${lv}`
    if (s.type === 'sine') return `Sine${hzOf(s.hz)}${lv}`
    if (s.type === 'sweep') return `Log sweep ${num(s.f1)}–${num(s.f2)} Hz${lv}`
    return `Pink noise ${num(s.f1)}–${num(s.f2)} Hz${lv}`
  }
  if (analysis === 'harmonics') return `Harmonics${hzOf(o.hz)}${lv}`
  if (analysis === 'thd') return `THD ${num(o.f1)}–${num(o.f2)} Hz${lv}`
  if (analysis === 'compression') {
    const ls = o.levels || []
    return `Compression ${dbText(Math.min(...ls))} … ${dbText(Math.max(...ls))}`.replace(/ dB …/, ' …')
  }
  return 'Maximum SPL (CEA-2010)'
}

// ------------------------------------------------------------- vary ---

/**
 * What a series can vary, for a project and analysis.
 *
 * Level and frequency where the analysis has them, every named project
 * parameter, and every number on every node — for a driver, the parameters it
 * is set by rather than those derived from them.
 *
 * @param {object} project - A serialized project.
 * @param {string} analysis - An `ANALYSES` id.
 * @param {object} [opts] - The analysis's options, to tell whether a frequency applies.
 * @returns {Array<{key: string, label: string, unit: string, value: number|null}>} The choices, with the current value.
 * @pure
 */
export function varyChoices(project, analysis, opts = {}) {
  const out = []
  if (analysis !== 'compression') out.push({ key: 'level', label: 'Level', unit: 'dB', value: Number(opts.levelDb) || 0 })
  const tone = analysis === 'transient' ? ['sine', 'burst'].includes(opts.signal?.type) : analysis === 'harmonics'
  if (tone) out.push({ key: 'hz', label: 'Frequency', unit: 'Hz', value: Number(analysis === 'transient' ? opts.signal.hz : opts.hz) || null })
  for (const p of project.params || []) {
    if (p?.name) out.push({ key: `param:${p.name}`, label: p.name, unit: '', value: typeof p.value === 'number' ? p.value : null })
  }
  for (const n of project.nodes || []) {
    const label = n.params?.label || n.id
    for (const [field, v] of Object.entries(n.params || {})) {
      if (typeof v !== 'number' || field === 'probePos') continue
      if (n.type === 'driver' && COUPLED.includes(field) && !DEFAULT_BASIS.includes(field)) continue
      out.push({ key: `node:${n.id}:${field}`, label: `${label} · ${field}`, unit: '', value: v })
    }
  }
  return out
}

/**
 * Every combination of the values of each varied setting.
 *
 * @param {Array<{key: string, values: number[]}>} vary - What varies; an empty list is one run.
 * @returns {Array<Object<string, number>>} One assignment per run, the first setting varying slowest.
 * @pure
 */
export function expandVary(vary = []) {
  let out = [{}]
  for (const v of vary) {
    if (!v?.key || !v.values?.length) continue
    out = out.flatMap((a) => v.values.map((x) => ({ ...a, [v.key]: x })))
  }
  return out
}

/**
 * Apply one run's varied values to a project and its options.
 *
 * A driver's own T/S parameter keeps the driver consistent: the parameters
 * derived from it follow, as they do when it is typed in.
 *
 * @param {object} project - A serialized project; not changed.
 * @param {object} opts - The run's options; not changed.
 * @param {string} analysis - An `ANALYSES` id.
 * @param {Object<string, number>} vars - Key → value.
 * @returns {{project: object, opts: object}} The project and options to run.
 * @pure
 */
export function applyVars(project, opts, analysis, vars) {
  let p = project
  const o = { ...opts, ...(opts.signal ? { signal: { ...opts.signal } } : {}) }
  for (const [key, value] of Object.entries(vars || {})) {
    if (key === 'level') o.levelDb = value
    else if (key === 'hz') { if (analysis === 'transient') o.signal.hz = value; else o.hz = value }
    else if (key.startsWith('param:')) {
      const name = key.slice(6)
      p = { ...p, params: (p.params || []).map((x) => (x.name === name ? { ...x, value } : x)) }
    } else if (key.startsWith('node:')) {
      const [, id, field] = key.split(':')
      p = {
        ...p,
        nodes: (p.nodes || []).map((n) => {
          if (n.id !== id) return n
          let params = { ...n.params, [field]: value }
          if (n.type === 'driver' && COUPLED.includes(field)) {
            const d = derive(params, DEFAULT_BASIS)
            if (d.ok) params = { ...params, ...d.values, [field]: value }
          }
          return { ...n, params }
        }),
      }
    }
  }
  return { project: p, opts: o }
}

/**
 * A varied setting's label and unit.
 *
 * @param {string} key - A vary key.
 * @param {Object<string, string>} [names] - Node labels by id.
 * @returns {{label: string, unit: string}} How to show it.
 * @pure
 */
export function varLabel(key, names = {}) {
  if (key === 'level') return { label: 'Level', unit: 'dB' }
  if (key === 'hz') return { label: 'Frequency', unit: 'Hz' }
  if (key.startsWith('param:')) return { label: key.slice(6), unit: '' }
  if (key.startsWith('node:')) {
    const [, id, field] = key.split(':')
    return { label: `${names[id] || id} · ${field}`, unit: '' }
  }
  return { label: key, unit: '' }
}

/**
 * A varied value as text.
 *
 * @param {string} key - A vary key.
 * @param {number} v - Its value.
 * @returns {string} e.g. `+6 dB`, `40 Hz`, `12.5`.
 * @pure
 */
export function varText(key, v) {
  if (key === 'level') return dbText(v)
  if (key === 'hz') return `${num(v)} Hz`
  return num(v)
}

/**
 * The drive signal of a transient run, for a preview: the first channel's voltage against time.
 *
 * @param {object} opts - The run's options.
 * @param {number} volts - The first channel's RMS voltage at 0 dB.
 * @param {number} [points] - Samples to return.
 * @returns {{ms: number[], v: number[]}} Time, ms, and volts.
 * @pure
 */
export function drivePreview(opts, volts, points = 400) {
  const sig = normalizeSignal(opts.signal)
  const len = Math.min(Number.isFinite(signalLength(sig)) ? signalLength(sig) * 1.2 : 8 / sig.hz, opts.duration || 1)
  const fs = Math.max(points / len, 1000)
  const fn = signalFunction(sig, fs)
  const amp = volts * Math.pow(10, (opts.levelDb || 0) / 20) * (sig.type === 'noise' ? 1 : Math.SQRT2)
  const ms = []
  const v = []
  for (let i = 0; i < points; i++) {
    const t = (i / (points - 1)) * len
    ms.push(t * 1000)
    v.push(amp * fn(t))
  }
  return { ms, v }
}

// --------------------------------------------------------- results ---

/** Significant figures a stored result keeps. */
const DIGITS = 6

/**
 * A result made ready to store: typed arrays become plain arrays, and every number is cut to six significant figures.
 *
 * Six figures keep a spectrum's floor far below anything charted while
 * halving the size of what is stored.
 *
 * @param {*} v - A result, or part of one.
 * @returns {*} The same shape, JSON-safe and compact.
 * @pure
 */
export function packResult(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? Number(v.toPrecision(DIGITS)) : null
  if (ArrayBuffer.isView(v)) return Array.from(v, (x) => (Number.isFinite(x) ? Number(x.toPrecision(DIGITS)) : null))
  if (Array.isArray(v)) return v.map(packResult)
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, packResult(x)]))
  return v
}

/**
 * Node labels and driver Xmax from a project, as a run's summary keeps them.
 *
 * @param {object} project - A serialized project.
 * @returns {{names: Object<string, string>, xmax: Object<string, number>}} Labels by node id, and each driver's Xmax, mm.
 * @pure
 */
export function projectInfo(project) {
  const names = {}
  const xmax = {}
  for (const n of project.nodes || []) {
    names[n.id] = n.params?.label || n.id
    if (n.type === 'driver') xmax[n.id] = Number(n.params?.Xmax) || 0
  }
  return { names, xmax }
}

/**
 * The largest of an object's values.
 *
 * @param {Object<string, number>|null} o - Values by id.
 * @returns {number|null} The largest, or null when there are none.
 * @pure
 */
const maxOf = (o) => {
  const v = Object.values(o || {}).filter(Number.isFinite)
  return v.length ? Math.max(...v) : null
}

/**
 * How far past Xmax a set of excursions goes: the largest ratio.
 *
 * @param {Object<string, number>|null} x - Peak excursion by driver, mm.
 * @param {Object<string, number>} xmax - Xmax by driver, mm.
 * @returns {number|null} The largest excursion over its Xmax.
 * @pure
 */
const overOf = (x, xmax) => {
  let r = null
  for (const [id, v] of Object.entries(x || {})) if (xmax[id] > 0 && Number.isFinite(v)) r = Math.max(r ?? 0, v / xmax[id])
  return r
}

/** The figures a point can carry, `key → {label, unit, scale?, digits}`. */
export const METRICS = {
  spl: { label: 'SPL', unit: 'dB', digits: 1 },
  peakPressure: { label: 'Peak pressure', unit: 'Pa', digits: 2 },
  cmp: { label: 'Compression', unit: 'dB', digits: 2 },
  effLoss: { label: 'Efficiency loss', unit: 'dB', digits: 2 },
  powerChange: { label: 'Power drawn', unit: 'dB', digits: 2 },
  thd: { label: 'THD', unit: '%', digits: 2 },
  h2: { label: 'H2', unit: 'dB', digits: 1 },
  h3: { label: 'H3', unit: 'dB', digits: 1 },
  xPeak: { label: 'Excursion', unit: 'mm', digits: 2 },
  vPeak: { label: 'Port velocity', unit: 'm/s', digits: 1 },
  iPeak: { label: 'Current', unit: 'A', digits: 2 },
  zMag: { label: '|Z|', unit: 'Ω', digits: 2 },
  pe: { label: 'Electrical power', unit: 'W', digits: 2 },
  pa: { label: 'Acoustic power', unit: 'mW', digits: 2 },
  efficiency: { label: 'Efficiency', unit: '%', digits: 2 },
  levelDb: { label: 'Level reached', unit: 'dB', digits: 2 },
}

/**
 * The figures of one tone measurement.
 *
 * @param {object} m - A tone measurement or a compression point.
 * @param {Object<string, number>} xmax - Xmax by driver.
 * @returns {object} Figures, in `METRICS` units.
 * @pure
 */
function toneFigures(m, xmax) {
  const z = Object.values(m.z || {})[0]
  return {
    spl: m.spl, thd: m.thd != null ? m.thd * 100 : null,
    h2: m.harmonics?.[1]?.db ?? m.h2 ?? null, h3: m.harmonics?.[2]?.db ?? m.h3 ?? null,
    xPeak: maxOf(m.xPeak), xOver: overOf(m.xPeak, xmax), vPeak: maxOf(m.vPeak),
    iPeak: m.currentPeak ?? null, zMag: z ? z.mag : null,
    pe: m.pe ?? null, pa: m.pa != null ? m.pa * 1000 : null, efficiency: m.efficiency != null ? m.efficiency * 100 : null,
  }
}

/**
 * The points a run measured: each its settings and its figures.
 *
 * A transient run or a single tone is one point; a sweep is a point per
 * frequency, compression a point per frequency and level. The series'
 * varied values are added to every point, so a table or a metric chart can
 * read across runs.
 *
 * @param {string} analysis - An `ANALYSES` id.
 * @param {object} opts - The run's options.
 * @param {object} result - The run's result, as the analysis returned it.
 * @param {object} info - From `projectInfo`.
 * @param {Object<string, number>} [vars] - The series' values for this run.
 * @returns {Array<{vars: Object<string, number>, m: object}>} The points.
 * @pure
 */
export function runPoints(analysis, opts, result, info, vars = {}) {
  const xmax = info.xmax || {}
  if (analysis === 'transient') {
    const { run, linear } = result
    const pk = levels(run.pressure).peak
    const xPeak = Object.fromEntries(Object.entries(run.excursion).map(([id, x]) => [id, levels(x).peak]))
    const lin = linear ? levels(linear.pressure).peak : null
    const s = opts.signal || {}
    return [{
      vars: { level: opts.levelDb || 0, ...(s.hz && (s.type === 'burst' || s.type === 'sine') ? { hz: s.hz } : {}), ...vars },
      m: {
        spl: splOf(pk / Math.SQRT2), peakPressure: pk,
        cmp: lin ? 20 * Math.log10(pk / lin) : null,
        xPeak: maxOf(xPeak), xOver: overOf(xPeak, xmax),
        vPeak: maxOf(Object.fromEntries(Object.entries(run.velocity).map(([id, v]) => [id, levels(v).peak]))),
        iPeak: maxOf(Object.fromEntries(Object.entries(run.current).map(([id, v]) => [id, levels(v).peak]))),
      },
    }]
  }
  if (analysis === 'harmonics') return [{ vars: { level: result.levelDb, hz: result.hz, ...vars }, m: toneFigures(result, xmax) }]
  if (analysis === 'thd') {
    return result.rows.filter((r) => r.thd != null).map((r) => ({
      vars: { level: result.levelDb, hz: r.hz, ...vars },
      m: { spl: r.spl, thd: r.thd * 100, h2: r.h2, h3: r.h3, xPeak: maxOf(r.xPeak), xOver: overOf(r.xPeak, xmax) },
    }))
  }
  if (analysis === 'compression') {
    return result.rows.flatMap((r) => result.levels.filter((L) => r.at?.[L]).map((L) => ({
      vars: { level: L, hz: r.hz, ...vars },
      m: { ...toneFigures(r.at[L], xmax), cmp: r.at[L].cmp, effLoss: r.at[L].effLoss, powerChange: r.at[L].powerChange },
    })))
  }
  return result.rows.filter((r) => r.spl != null).map((r) => ({
    vars: { hz: r.hz, ...vars },
    m: { spl: r.spl, levelDb: r.levelDb, xPeak: maxOf(r.xPeak), xOver: overOf(r.xPeak, xmax) },
  }))
}

/**
 * The one figure a run is listed with.
 *
 * @param {string} analysis - An `ANALYSES` id.
 * @param {Array<object>} points - From `runPoints`.
 * @returns {{text: string, bad: boolean}} The figure, and whether it breaks a limit (a cone past Xmax).
 * @pure
 */
export function headline(analysis, points) {
  if (!points.length) return { text: '—', bad: false }
  const bad = points.some((p) => p.m.xOver > 1)
  /**
   * The extreme of a figure over the points.
   *
   * @param {string} k - The figure.
   * @param {Function} [fn] - `Math.max` or `Math.min`.
   * @returns {number} The extreme.
   * @pure
   */
  const worst = (k, fn = Math.max) => fn(...points.map((p) => p.m[k]).filter(Number.isFinite))
  if (analysis === 'transient') return { text: points[0].m.xPeak != null ? `${points[0].m.xPeak.toFixed(1)} mm` : `${points[0].m.peakPressure.toFixed(2)} Pa`, bad }
  if (analysis === 'harmonics' || analysis === 'thd') return { text: `${worst('thd').toFixed(1)} %`, bad }
  if (analysis === 'compression') return { text: `${worst('cmp', Math.min).toFixed(1)} dB`.replace('-', '−'), bad }
  return { text: `${worst('spl').toFixed(1)} dB`, bad }
}

// ---------------------------------------------------------- traces ---

/** The quantities a chart card can draw, `[id, label, x kind]`. */
export const QUANTITIES = [
  ['pressure', 'Pressure', 'time'],
  ['excursion', 'Excursion', 'time'],
  ['current', 'Current', 'time'],
  ['velocity', 'Port velocity', 'time'],
  ['spectrum', 'Spectrum', 'hz'],
  ['probes', 'Probes', 'time'],
  ['m:cmp', 'Compression', 'hz'],
  ['m:thd', 'THD', 'hz'],
  ['m:spl', 'SPL', 'hz'],
  ['m:xPeak', 'Peak excursion', 'hz'],
  ['m:efficiency', 'Efficiency', 'hz'],
]

/**
 * The unit of a quantity.
 *
 * @param {string} q - A `QUANTITIES` id.
 * @returns {string} Its unit.
 * @pure
 */
export function quantityUnit(q) {
  if (q.startsWith('m:')) return METRICS[q.slice(2)]?.unit || ''
  return { pressure: 'Pa', excursion: 'mm', current: 'A', velocity: 'm/s', spectrum: 'dB SPL', probes: '' }[q] || ''
}

/**
 * Whether a run can be drawn as a quantity.
 *
 * @param {object} meta - The run's summary.
 * @param {string} q - A `QUANTITIES` id.
 * @returns {boolean} True when it has something to draw.
 * @pure
 */
export function hasQuantity(meta, q) {
  if (q.startsWith('m:')) {
    const k = q.slice(2)
    const hz = new Set((meta.points || []).filter((p) => p.m[k] != null).map((p) => p.vars.hz))
    return hz.size > 1
  }
  if (meta.analysis === 'transient') return true
  return meta.analysis === 'harmonics' && (q === 'pressure' || q === 'spectrum')
}

/**
 * A dB spectrum of a pressure waveform, Hann-windowed, up to 2 kHz.
 *
 * @param {ArrayLike<number>} y - Pressure, Pa.
 * @param {number} fs - Sample rate, Hz.
 * @returns {{x: number[], y: number[]}} Frequency, Hz, and dB SPL.
 * @pure
 */
export function spectrumOf(y, fs) {
  const n = y.length
  const w = Array.from(y, (v, i) => v * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / Math.max(n - 1, 1))))
  const S = rfft(w)
  const bins = S.re.length
  const df = fs / ((bins - 1) * 2)
  const x = []
  const out = []
  for (let k = 1; k < bins && k * df <= Math.min(fs / 2, 2000); k++) {
    x.push(k * df)
    out.push(splOf((Math.hypot(S.re[k], S.im[k]) * 4) / n / Math.SQRT2))
  }
  return { x, y: out }
}

/**
 * The traces a run gives for a quantity.
 *
 * Waveforms come from the results; frequency figures come from the run's
 * points, one trace per level (or other setting) the run measured at.
 *
 * @param {object} meta - The run's summary.
 * @param {object|null} data - Its `run.json`, needed for waveforms and spectra.
 * @param {string} q - A `QUANTITIES` id.
 * @returns {Array<{name: string, x: number[], y: number[], dash?: boolean}>} The traces; x in ms for time, Hz for frequency.
 * @pure
 */
export function runTraces(meta, data, q) {
  const names = meta.info?.names || {}
  if (q.startsWith('m:')) {
    const k = q.slice(2)
    const groups = new Map()
    for (const p of meta.points || []) {
      if (p.m[k] == null || p.vars.hz == null) continue
      const rest = Object.entries(p.vars).filter(([key]) => key !== 'hz' && !(meta.vars && key in meta.vars))
      const label = rest.map(([key, v]) => varText(key, v)).join(' · ')
      if (!groups.has(label)) groups.set(label, [])
      groups.get(label).push([p.vars.hz, p.m[k]])
    }
    return [...groups.entries()].map(([label, pts]) => {
      pts.sort((a, b) => a[0] - b[0])
      return { name: groups.size > 1 ? label : '', x: pts.map((p) => p[0]), y: pts.map((p) => p[1]) }
    })
  }
  if (!data) return []
  const r = data.result
  if (meta.analysis === 'harmonics') {
    const w = r.waveform
    if (q === 'pressure') return [{ name: '', x: w.t.map((t) => (t - w.t[0]) * 1000), y: w.pressure }]
    if (q === 'spectrum') return [{ name: '', ...spectrumOf(w.pressure, w.fs) }]
    return []
  }
  if (meta.analysis !== 'transient' || !r?.run) return []
  const { run, linear } = r
  const ms = run.t.map((t) => t * 1000)
  /**
   * Traces from one per-id series of the run, and of the linear run dashed.
   *
   * @param {string} key - `excursion`, `current` or `velocity`.
   * @returns {Array<object>} The traces.
   * @pure
   */
  const each = (key) => Object.keys(run[key] || {}).flatMap((id) => [
    { name: names[id] || id, x: ms, y: run[key][id] },
    ...(linear?.[key]?.[id] ? [{ name: `${names[id] || id} linear`, x: linear.t.map((t) => t * 1000), y: linear[key][id], dash: true }] : []),
  ])
  if (q === 'pressure') {
    return [{ name: '', x: ms, y: run.pressure }, ...(linear ? [{ name: 'linear', x: linear.t.map((t) => t * 1000), y: linear.pressure, dash: true }] : [])]
  }
  if (q === 'spectrum') {
    return [{ name: '', ...spectrumOf(run.pressure, r.fs) }, ...(linear ? [{ name: 'linear', ...spectrumOf(linear.pressure, r.fs), dash: true }] : [])]
  }
  if (q === 'excursion' || q === 'current' || q === 'velocity') return each(q)
  if (q === 'probes') return Object.entries(run.probes || {}).map(([id, p]) => ({ name: `${id} (${p.kind})`, x: ms, y: p.values }))
  return []
}

/**
 * One trace minus another, on the first one's x.
 *
 * The second is interpolated linearly onto the first's points; outside its
 * range the difference is left out.
 *
 * @param {{x: number[], y: number[]}} a - The reference.
 * @param {{x: number[], y: number[]}} b - The other trace.
 * @returns {{x: number[], y: number[]}} `b − a` where both are defined.
 * @pure
 */
export function differenceOf(a, b) {
  const x = []
  const y = []
  let j = 0
  for (let i = 0; i < a.x.length; i++) {
    const xi = a.x[i]
    while (j < b.x.length - 2 && b.x[j + 1] < xi) j++
    if (xi < b.x[0] || xi > b.x[b.x.length - 1] || b.x.length < 2) continue
    const t = (xi - b.x[j]) / Math.max(b.x[j + 1] - b.x[j], 1e-12)
    const bi = b.y[j] + (b.y[j + 1] - b.y[j]) * Math.min(Math.max(t, 0), 1)
    if (Number.isFinite(bi) && Number.isFinite(a.y[i])) { x.push(xi); y.push(bi - a.y[i]) }
  }
  return { x, y }
}
