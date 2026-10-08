// Stored time-domain runs.
//
// There is one kind of run: stepped tones across a frequency range at one
// drive level (see `levelRun` in src/spice/timedomain.js). Every figure the
// time-domain views show — output, compression, distortion, excursion, port
// velocity, impedance, power, the 10% THD Max SPL and each tone's start-up —
// comes from it. Queuing several levels makes one run per level.
//
// Each run is a branch off the record it was queued from (see
// src/records.js): its commit holds the project as it was run and the
// result. The run list in the project file carries a summary of each, so the
// library lists runs without reading any result.
//
// Everything here is pure.

/** The range a new run covers, and how many tones across it. */
export const RUN_DEFAULTS = { f1: 15, f2: 200, points: 24 }

/** The THD that defines the Max SPL. */
export const MAX_SPL_THD = 0.1

/**
 * Whether a stored run is of the current kind.
 *
 * Runs stored before there was one kind of run are not; they are deleted
 * when their project is read.
 *
 * @param {object} r - A run's summary.
 * @returns {boolean} Whether it can be shown.
 * @pure
 */
export const isLevelRun = (r) => r?.analysis === 'level'

/**
 * A level offset as text, with a true minus sign.
 *
 * @param {number} L - dB.
 * @returns {string} `+6 dB`, `0 dB`, `−3 dB`.
 * @pure
 */
export const dbText = (L) => `${L > 0 ? '+' : L < 0 ? '−' : ''}${Math.abs(Number(Number(L).toFixed(2)))} dB`

/**
 * How a record is named in run names and the library: its name, or "Record n" when it goes by its number.
 *
 * @param {string} name - From `recordName`.
 * @returns {string} e.g. `Tuned`, `Record 3`.
 * @pure
 */
export const recordLabel = (name) => (/^\d+$/.test(String(name)) ? `Record ${name}` : String(name))

/**
 * A new run's name when none is typed: the project's name and the record's.
 *
 * @param {string} project - The project's name.
 * @param {string} record - The record's name or number, from `recordName`.
 * @returns {string} e.g. `Ported 60 L · Record 3`.
 * @pure
 */
export function defaultRunName(project, record) {
  return `${project || 'Untitled'} · ${recordLabel(record)}`
}

/**
 * The levels a run list asks for: numbers, each once, in the order given.
 *
 * @param {Array<number|string>} levels - As typed.
 * @returns {number[]} The levels, dB.
 * @pure
 */
export function cleanLevels(levels) {
  const out = []
  for (const v of levels || []) {
    const n = typeof v === 'number' ? v : parseFloat(String(v).replace('−', '-'))
    if (Number.isFinite(n) && !out.includes(n)) out.push(n)
  }
  return out
}

/** Significant figures a stored result keeps. */
const DIGITS = 5

/**
 * A result made ready to store: typed arrays become plain arrays, and every number is cut to five significant figures.
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

// ---------------------------------------------------------- the views ---

/**
 * The viewer's tabs, `[id, label]`, in order.
 *
 * Each shows one category of figure across frequency, except Waveforms,
 * which shows each tone's start-up in time.
 */
export const TABS = [
  ['output', 'Output'],
  ['compression', 'Compression'],
  ['distortion', 'Distortion'],
  ['excursion', 'Excursion'],
  ['velocity', 'Port velocity'],
  ['impedance', 'Impedance'],
  ['power', 'Power'],
  ['maxspl', 'Max SPL (10% THD)'],
  ['waveforms', 'Waveforms'],
]

/** The choices inside a tab, `[id, label, unit]`; the first is shown first. */
export const TAB_VIEWS = {
  output: [['spl', 'Output', 'dB SPL']],
  compression: [['cmp', 'Compression', 'dB'], ['effLoss', 'Efficiency loss', 'dB'], ['powerChange', 'Power drawn', 'dB']],
  distortion: [['thd', 'THD', '%'], ['h2', '2nd harmonic', 'dB re fundamental'], ['h3', '3rd harmonic', 'dB re fundamental']],
  excursion: [['xPeak', 'Peak excursion', 'mm']],
  velocity: [['vPeak', 'Peak port velocity', 'm/s']],
  impedance: [['zMag', 'Impedance', 'Ω']],
  power: [['pe', 'Electrical power', 'W'], ['efficiency', 'Efficiency', '%']],
  maxspl: [['spl', 'Max SPL at 10% THD', 'dB SPL'], ['levelDb', 'Drive at 10% THD', 'dB']],
  waveforms: [['pressure', 'Pressure', 'Pa'], ['excursion', 'Excursion', 'mm'], ['velocity', 'Port velocity', 'm/s']],
}

/**
 * The ids a map-valued figure carries across a result's rows: drivers, waveguides or channels.
 *
 * @param {Array<object>} rows - The result's rows.
 * @param {string} field - `xPeak`, `vPeak` or `z`.
 * @returns {string[]} The ids, in first-seen order.
 * @pure
 */
function idsOf(rows, field) {
  const out = []
  for (const r of rows || []) for (const k of Object.keys(r?.[field] || {})) if (!out.includes(k)) out.push(k)
  return out
}

/**
 * Whether a run's result has anything for a tab.
 *
 * @param {string} tab - A `TABS` id.
 * @param {object} result - The run's result.
 * @returns {boolean} Whether the tab has something to show.
 * @pure
 */
export function hasTab(tab, result) {
  if (!result?.rows) return false
  if (tab === 'excursion') return idsOf(result.rows, 'xPeak').length > 0
  if (tab === 'velocity') return idsOf(result.rows, 'vPeak').length > 0
  if (tab === 'impedance') return idsOf(result.rows, 'z').length > 0
  if (tab === 'maxspl') return Array.isArray(result.maxSpl) && result.maxSpl.some((m) => m && m.levelDb != null)
  if (tab === 'waveforms') return Array.isArray(result.start) && result.start.some((s) => s && !s.failed)
  return true
}

/**
 * The tabs a set of runs share: those every one of them has something for.
 *
 * @param {Array<object>} results - The runs' results.
 * @returns {string[]} Tab ids, in `TABS` order.
 * @pure
 */
export function sharedTabs(results) {
  if (!results.length) return []
  return TABS.map((t) => t[0]).filter((t) => results.every((r) => hasTab(t, r)))
}

/**
 * One run's traces for a tab: `{key, label, x, y, dash?, marker?}`, x in Hz (or ms for waveforms).
 *
 * Where a project has several drivers, ports or channels, each is a trace,
 * labelled with its node's name. Linear-model traces are dashed.
 *
 * @param {string} tab - A `TABS` id.
 * @param {string} view - One of the tab's `TAB_VIEWS` ids.
 * @param {object} result - The run's result.
 * @param {Object<string, string>} [names] - Node labels by id.
 * @param {number} [hz] - For waveforms: the tone, the nearest one run is used.
 * @returns {Array<object>} The traces; points that could not be solved are left out.
 * @pure
 */
export function tabTraces(tab, view, result, names = {}, hz) {
  const rows = (result?.rows || []).filter((r) => r && !r.failed)
  /**
   * A trace across frequency.
   *
   * @param {string} key - Its key.
   * @param {string} label - Its label.
   * @param {Function} get - The value from a row, or null.
   * @param {object} [extra] - Fields to add, e.g. `dash`.
   * @returns {object} The trace.
   * @pure
   */
  const line = (key, label, get, extra = {}) => {
    const pts = rows.map((r) => [r.hz, get(r)]).filter(([, y]) => Number.isFinite(y))
    return { key, label, x: pts.map((p) => p[0]), y: pts.map((p) => p[1]), ...extra }
  }
  /**
   * Traces of a map-valued figure, one per id, with the linear model's beside each when it has one.
   *
   * @param {string} field - `xPeak`, `vPeak` or `z`.
   * @param {Function} [pick] - Turns a map value into a number.
   * @returns {Array<object>} The traces.
   * @pure
   */
  const perId = (field, pick = (v) => v) => {
    const ids = idsOf(rows, field)
    return ids.flatMap((id) => {
      const lab = ids.length > 1 ? (names[id] || id) : ''
      const out = [line(id, lab, (r) => pick(r[field]?.[id]))]
      if (field !== 'z' && rows.some((r) => Number.isFinite(r.linear?.[field]?.[id]))) {
        out.push(line(`${id}:lin`, lab ? `${lab}, linear` : 'Linear', (r) => r.linear?.[field]?.[id], { dash: true }))
      }
      return out
    })
  }
  if (tab === 'output') return [line('spl', '', (r) => r.spl), line('lin', 'Linear', (r) => r.linSpl, { dash: true })]
  if (tab === 'compression') return [line(view, '', (r) => r[view])]
  if (tab === 'distortion') {
    if (view === 'thd') return [line('thd', '', (r) => (Number.isFinite(r.thd) ? r.thd * 100 : null))]
    const n = view === 'h2' ? 0 : 1
    return [line(view, '', (r) => r.h?.[n])]
  }
  if (tab === 'excursion') return perId('xPeak')
  if (tab === 'velocity') return perId('vPeak')
  if (tab === 'impedance') return perId('z', (v) => v?.mag)
  if (tab === 'power') {
    if (view === 'efficiency') return [line('eff', '', (r) => (Number.isFinite(r.efficiency) ? r.efficiency * 100 : null))]
    return [line('pe', '', (r) => r.pe)]
  }
  if (tab === 'maxspl') {
    const m = (result?.maxSpl || []).filter((x) => x && x.levelDb != null)
    const pts = m.map((x) => [x.hz, x[view]]).filter(([, y]) => Number.isFinite(y))
    return [{ key: view, label: '', x: pts.map((p) => p[0]), y: pts.map((p) => p[1]), marker: true }]
  }
  if (tab === 'waveforms') {
    const s = nearestStart(result, hz)
    if (!s) return []
    /**
     * A start-up series as a trace in ms.
     *
     * @param {string} key - Its key.
     * @param {string} label - Its label.
     * @param {number[]} y - The samples.
     * @returns {object} The trace.
     * @pure
     */
    const wave = (key, label, y) => ({ key, label, x: y.map((_, i) => i * s.dt * 1000), y })
    if (view === 'pressure') return [wave('p', '', s.pressure || [])]
    const m = (view === 'excursion' ? s.excursion : s.velocity) || {}
    const ids = Object.keys(m)
    return ids.map((id) => wave(id, ids.length > 1 ? (names[id] || id) : '', m[id]))
  }
  return []
}

/**
 * The start-up of the tone nearest a frequency.
 *
 * @param {object} result - A run's result.
 * @param {number} [hz] - The frequency; the run's lowest when omitted.
 * @returns {object|null} `{hz, dt, pressure, excursion, velocity}`, or null when none was kept.
 * @pure
 */
export function nearestStart(result, hz) {
  const all = (result?.start || []).filter((s) => s && !s.failed)
  if (!all.length) return null
  if (!(hz > 0)) return all[0]
  return all.reduce((a, b) => (Math.abs(Math.log(b.hz / hz)) < Math.abs(Math.log(a.hz / hz)) ? b : a))
}

/**
 * The 10% THD search's frequencies where THD stayed under the limit at the top of the range searched.
 *
 * @param {object} result - A run's result.
 * @returns {number[]} Those frequencies, Hz: the Max SPL shown there is a floor, not the limit.
 * @pure
 */
export function unreachedAt(result) {
  return (result?.maxSpl || []).filter((m) => m?.unreached).map((m) => m.hz)
}
