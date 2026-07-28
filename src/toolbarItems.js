// Quick-access bar registry.
//
// The bar under the menu is a list of small widgets chosen and ordered by the
// user (Settings ▸ Quick bar). Two kinds live here:
//
//   control — an interactive widget (project name, drive voltage, sweep …)
//   metric  — a read-only number derived from the current simulation
//
// Adding an item means one entry in TOOLBAR_ITEMS plus, for controls, one case
// in Toolbar.jsx's renderer. Metrics need nothing else: `metricValue` below is
// the single place that knows how to compute and format them.
import { waveguideVolume } from './engine/geometry'

export const TOOLBAR_ITEMS = {
  // --- controls ---
  project: { label: 'Project name', group: 'controls' },
  undo: { label: 'Undo / redo', group: 'controls' },
  voltage: { label: 'Drive voltage', group: 'controls' },
  sweep: { label: 'Sweep range', group: 'controls' },
  masking: { label: 'Mask resonances', group: 'controls' },
  snapshot: { label: 'Snapshot + overlays', group: 'controls' },

  // --- metrics (mirrors what the Results panel used to show) ---
  m_f3: { label: 'F3', group: 'metrics' },
  m_f10: { label: 'F10', group: 'metrics' },
  m_fb: { label: 'Fb', group: 'metrics' },
  m_qtc: { label: 'Qtc', group: 'metrics' },
  m_zpeaks: { label: 'Z peaks', group: 'metrics' },
  m_peakspl: { label: 'Peak SPL', group: 'metrics' },
  m_xfb: { label: 'X @ Fb', group: 'metrics' },
  m_xf3: { label: 'X @ F3', group: 'metrics' },
  m_bw: { label: 'BW (−3 dB)', group: 'metrics' },
  m_maxpower: { label: 'Max power (Xmax)', group: 'metrics' },
  m_volume: { label: 'System volume', group: 'metrics' },
  m_solve: { label: 'Solve time', group: 'metrics' },
}

export const TOOLBAR_GROUPS = [
  ['controls', 'Controls'],
  ['metrics', 'Metrics readout'],
]

export const ALL_ITEM_IDS = Object.keys(TOOLBAR_ITEMS)

// Sweep range and resonance masking are off by default: both are set-once
// controls reachable from Settings ▸ Application and the Simulate menu, so
// they earn their place in the bar only if you actually tweak them often.
export const DEFAULT_TOOLBAR = [
  'project', 'undo', 'voltage', 'snapshot',
  'm_f3', 'm_f10', 'm_fb', 'm_qtc', 'm_zpeaks', 'm_peakspl',
  'm_xfb', 'm_xf3', 'm_bw', 'm_maxpower', 'm_volume', 'm_solve',
]

const fmt = (v, d = 1) => (v == null || !isFinite(v) ? '—' : v.toFixed(d))

// Total enclosed air: chambers plus the swept volume of every duct segment.
export function systemVolume(nodes) {
  let v = 0
  for (const n of nodes) {
    const p = n.data.params
    if (n.type === 'chamber') v += p.volume || 0
    else if (n.type === 'waveguide') v += waveguideVolume(p.flare, p.S1 * 1e-4, p.S2 * 1e-4, p.length / 100) * 1000
  }
  return v
}

// → { label, value, bad } for a metric item id, or null if it isn't one.
export function metricValue(id, { metrics, results, nodes }) {
  const m = metrics || {}
  const xmax = nodes.find((n) => n.type === 'driver')?.data.params.Xmax
  const label = TOOLBAR_ITEMS[id]?.label
  const frac = (x) => (x != null && xmax ? `${((x / xmax) * 100).toFixed(0)}%` : '—')
  const over = (x) => x != null && xmax && x > xmax

  switch (id) {
    case 'm_f3': return { label, value: m.f3 ? `${fmt(m.f3)} Hz` : '—' }
    case 'm_f10': return { label, value: m.f10 ? `${fmt(m.f10)} Hz` : '—' }
    case 'm_fb': return { label, value: m.fb ? `${fmt(m.fb)} Hz` : '—' }
    case 'm_qtc': return { label, value: m.qtc ? fmt(m.qtc, 2) : '—' }
    case 'm_zpeaks': return {
      label,
      value: (m.zPeaks || []).slice(0, 3).map((p) => `${p.f.toFixed(0)}Hz/${p.v.toFixed(0)}Ω`).join('  ') || '—',
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

// Drop unknown ids (an older saved bar, a renamed item) and de-duplicate.
export function sanitizeToolbar(ids) {
  if (!Array.isArray(ids)) return null
  const seen = new Set()
  const out = ids.filter((id) => TOOLBAR_ITEMS[id] && !seen.has(id) && seen.add(id))
  return out
}
