// Quick-access bar registry.
//
// The bar under the menu is a list of small widgets chosen and ordered by the
// user (Settings ▸ Quick bar). Two kinds live here:
//
//   control — an interactive widget (drive voltage, sweep range …)
//   metric  — a read-only number derived from the current simulation
//
// Adding an item means one entry in TOOLBAR_ITEMS plus, for controls, one case
// in Toolbar.jsx's renderer. Metrics need nothing else: `metricValue` below is
// the single place that knows how to compute and format them.
import { waveguideVolume } from './engine/geometry'

/**
 * Every widget the quick bar can show, keyed by id.
 *
 * `controls` are interactive and need a matching case in Toolbar.jsx's
 * renderer; `metrics` are read-only and need nothing else, because
 * `metricValue` is the single place that knows how to compute and format them.
 */
export const TOOLBAR_ITEMS = {
  // --- controls ---
  undo: { label: 'Undo / redo', group: 'controls' },
  voltage: { label: 'Drive voltage', group: 'controls' },
  sweep: { label: 'Sweep range', group: 'controls' },
  masking: { label: 'Mask resonances', group: 'controls' },
  snapshot: { label: 'Snapshot + overlays', group: 'controls' },

  // --- metrics (mirrors what the Results panel used to show) ---
  // `cluster` is the pill a metric shares on the bar with its neighbours:
  // what the response does, the impedance, the limits, the size.
  m_f3: { label: 'F3', group: 'metrics', cluster: 'response' },
  m_f10: { label: 'F10', group: 'metrics', cluster: 'response' },
  m_fb: { label: 'Fb', group: 'metrics', cluster: 'response' },
  m_qtc: { label: 'Qtc', group: 'metrics', cluster: 'response' },
  m_bw: { label: 'BW', group: 'metrics', cluster: 'response' },
  m_zpeaks: { label: 'Z peaks (Hz/Ω)', group: 'metrics', cluster: 'impedance' },
  m_peakspl: { label: 'Peak SPL', group: 'metrics', cluster: 'limits' },
  m_xf3: { label: 'X @ F3', group: 'metrics', cluster: 'limits' },
  m_xfb: { label: 'X @ Fb', group: 'metrics', cluster: 'limits' },
  m_maxpower: { label: 'Max power', group: 'metrics', cluster: 'limits' },
  m_volume: { label: 'Volume', group: 'metrics', cluster: 'volume' },
  m_solve: { label: 'Solve time', group: 'metrics', cluster: 'solve' },
}

/** Quick-bar groups as `[id, heading]`, in the order Settings lists them. */
export const TOOLBAR_GROUPS = [
  ['controls', 'Controls'],
  ['metrics', 'Metrics readout'],
]

/** Every quick-bar item id, used to offer the full list in Settings. */
export const ALL_ITEM_IDS = Object.keys(TOOLBAR_ITEMS)

/**
 * The quick bar as it ships.
 *
 * Sweep range and resonance masking are deliberately absent: both are set-once
 * controls reachable from Settings ▸ Application and the Simulate menu, so they
 * earn a permanent slot only for someone who actually tweaks them often. The
 * solve time is shown above every chart instead, where it is about the
 * result being looked at.
 */
export const DEFAULT_TOOLBAR = [
  'undo', 'voltage', 'snapshot',
  'm_f3', 'm_f10', 'm_fb', 'm_qtc', 'm_bw', 'm_zpeaks',
  'm_peakspl', 'm_xf3', 'm_xfb', 'm_maxpower', 'm_volume',
]

/**
 * Format a metric number, or an em dash when there is nothing to show.
 *
 * @param {number|null|undefined} v - The value.
 * @param {number} [d=1] - Decimal places.
 * @returns {string} The formatted number, or `'—'` for absent and non-finite values.
 * @pure
 */
const fmt = (v, d = 1) => (v == null || !isFinite(v) ? '—' : v.toFixed(d))

/**
 * Total enclosed air in the design.
 *
 * Chambers contribute their stated volume; waveguides contribute the true
 * integral of their area profile, so a flared horn counts its own internal
 * volume rather than being treated as a straight duct.
 *
 * @param {Array<object>} nodes - Graph nodes.
 * @returns {number} Volume in litres. 0 when nothing encloses air.
 * @post nodes is not modified
 * @pure
 */
export function systemVolume(nodes) {
  let v = 0
  for (const n of nodes) {
    const p = n.data.params
    if (n.type === 'chamber') v += p.volume || 0
    else if (n.type === 'waveguide') v += waveguideVolume(p.flare, p.S1 * 1e-4, p.S2 * 1e-4, p.length / 100) * 1000
  }
  return v
}

/**
 * Compute and format one quick-bar metric.
 *
 * The single place that knows how to turn a metric id into display text, which
 * is why adding a metric needs no renderer change.
 *
 * Excursion figures are shown as a percentage of Xmax and flagged with `bad`
 * once they exceed it. Note that Xmax comes from the *first* driver node, so the
 * percentage is misleading for a design mixing drivers with different limits —
 * the per-driver headroom in `computeMetrics` is the accurate view.
 *
 * @param {string} id - A quick-bar item id.
 * @param {object} ctx - Current app state.
 * @param {object|null} ctx.metrics - Metrics from `computeMetrics`.
 * @param {object|null} ctx.results - The raw simulation result, for solve time.
 * @param {Array<object>} ctx.nodes - Graph nodes, for system volume and Xmax.
 * @returns {{label: string, value: string, bad?: boolean}|null} The formatted readout, or `null` when `id` is a control rather than a metric.
 * @pure
 */
export function metricValue(id, { metrics, results, nodes }) {
  const m = metrics || {}
  const xmax = nodes.find((n) => n.type === 'driver')?.data.params.Xmax
  const label = TOOLBAR_ITEMS[id]?.label
  /**
   * An excursion as a percentage of Xmax.
   * @param {number|null|undefined} x - Excursion, mm.
   * @returns {string} A percentage, or `'—'` when either value is missing.
   * @reads the enclosing `xmax`, taken from the first driver node.
   */
  const frac = (x) => (x != null && xmax ? `${((x / xmax) * 100).toFixed(0)}%` : '—')
  /**
   * Whether an excursion exceeds Xmax, for the warning style.
   * @param {number|null|undefined} x - Excursion, mm.
   * @returns {boolean|undefined} True when over Xmax; falsy when it is not, or cannot be judged.
   * @reads the enclosing `xmax`, taken from the first driver node.
   */
  const over = (x) => x != null && xmax && x > xmax

  switch (id) {
    case 'm_f3': return { label, value: m.f3 ? `${fmt(m.f3)} Hz` : '—' }
    case 'm_f10': return { label, value: m.f10 ? `${fmt(m.f10)} Hz` : '—' }
    case 'm_fb': return { label, value: m.fb ? `${fmt(m.fb)} Hz` : '—' }
    case 'm_qtc': return { label, value: m.qtc ? fmt(m.qtc, 2) : '—' }
    case 'm_zpeaks': return {
      label,
      value: (m.zPeaks || []).slice(0, 3).map((p) => `${p.f.toFixed(0)}/${p.v.toFixed(0)}Ω`).join(' · ') || '—',
    }
    case 'm_peakspl': return { label, value: m.peakSPL ? `${fmt(m.peakSPL)} dB` : '—' }
    case 'm_xfb': return { label, value: frac(m.xAtFb), bad: over(m.xAtFb) }
    case 'm_xf3': return { label, value: frac(m.xAtF3), bad: over(m.xAtF3) }
    case 'm_bw': return { label, value: m.bwHz ? `${fmt(m.bwHz, 0)} Hz / ${fmt(m.bwOct, 1)} oct` : '—' }
    case 'm_maxpower': return { label, value: m.maxPower ? `${fmt(m.maxPower, 0)} W @ ${fmt(m.vMax, 1)} V` : '—' }
    case 'm_volume': {
      const v = systemVolume(nodes)
      return { label, value: v > 0 ? `${v >= 100 ? v.toFixed(0) : v.toFixed(1)} L` : '—' }
    }
    case 'm_solve': return { label, value: results?.elapsedMs != null ? `${results.elapsedMs.toFixed(0)} ms` : '—' }
    default: return null
  }
}

/**
 * Clean a persisted quick-bar arrangement.
 *
 * The trust boundary for the stored bar: unknown ids — from an older build or a
 * renamed item — are dropped and duplicates removed, so a stale preference
 * cannot render a broken bar.
 *
 * @param {any} ids - Untrusted item id list, typically from LocalStorage.
 * @returns {string[]|null} The surviving ids in order, or `null` when the input was not an array.
 * @pure
 */
export function sanitizeToolbar(ids) {
  if (!Array.isArray(ids)) return null
  const seen = new Set()
  const out = ids.filter((id) => TOOLBAR_ITEMS[id] && !seen.has(id) && seen.add(id))
  return out
}

// Module-private functions, exposed for the contract test suite only
// (test/contract/*). Not part of this module's public API — application code
// must not import from here, and nothing outside the tests does.
export const __internals = { fmt }
