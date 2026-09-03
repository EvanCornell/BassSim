// Quick-access bar under the menu bar.
//
// Contents are user-configurable (Settings ▸ Quick bar): `store.toolbar` is an
// ordered list of item ids from src/toolbarItems.js, and this renders them in
// that order. Metric items are data-driven and need no case here; controls get
// one each. Application-level switches (Settings, experimental features) belong
// to the menu bar, not here — this strip is for per-design adjustments.
import React from 'react'
import { useStore } from '../store'
import { TOOLBAR_ITEMS, metricValue } from '../toolbarItems'

// ---------- individual controls ----------

/**
 * Undo and redo buttons, disabled when their stacks are empty.
 *
 * Subscribes to the whole store rather than a slice, since it needs both
 * history stacks and both actions.
 *
 * @returns {React.ReactElement} The button pair.
 * @sideEffect Subscribes to the store.
 */
function UndoRedo() {
  const store = useStore()
  return (
    <>
      <button className="icon-btn" title="Undo (Ctrl+Z)" disabled={!store.history.length} onClick={store.undo}>↶</button>
      <button className="icon-btn" title="Redo (Ctrl+Y)" disabled={!store.future.length} onClick={store.redo}>↷</button>
    </>
  )
}

/**
 * Drive-level control, with the resulting wattage beside it.
 *
 * Goes through `setAmp` rather than `updateSettings` so P = V²/Z stays
 * linked with the amplifier solver in the Parameters panel.
 *
 * @returns {React.ReactElement} The drive control.
 * @sideEffect Subscribes to the store.
 */
function VoltageControl() {
  const settings = useStore((s) => s.settings)
  const setAmp = useStore((s) => s.setAmp)
  return (
    <div className="tb-group tb-voltage" title="Amplifier drive voltage — power follows as V²/Z">
      <label>Drive</label>
      <input
        type="number" step="0.01" min="0" value={settings.voltage}
        onChange={(e) => { const x = parseFloat(e.target.value); if (x >= 0) setAmp('voltage', x) }}
      />
      <label>V</label>
      <span className="tb-derived">{settings.power >= 100 ? settings.power.toFixed(0) : settings.power.toFixed(1)} W</span>
    </div>
  )
}

/**
 * Sweep start and end frequency. Off by default — it is a set-once control.
 *
 * @returns {React.ReactElement} The sweep range control.
 * @sideEffect Subscribes to the store.
 */
function SweepRange() {
  const settings = useStore((s) => s.settings)
  const updateSettings = useStore((s) => s.updateSettings)
  return (
    <div className="tb-group" title="Frequency sweep range">
      <label>Sweep</label>
      <input type="number" value={settings.fmin} min="1"
        onChange={(e) => { const v = parseFloat(e.target.value); if (v > 0) updateSettings({ fmin: v }) }} />
      <label>–</label>
      <input type="number" value={settings.fmax}
        onChange={(e) => { const v = parseFloat(e.target.value); if (v > settings.fmin) updateSettings({ fmax: v }) }} />
      <label>Hz</label>
    </div>
  )
}

/**
 * Toggle resonance masking, which lumps chambers to hide standing-wave artifacts.
 *
 * @returns {React.ReactElement} The masking toggle.
 * @sideEffect Subscribes to the store.
 */
function MaskingToggle() {
  const masking = useStore((s) => s.settings.masking)
  const updateSettings = useStore((s) => s.updateSettings)
  return (
    <label className="tb-group" title="Suppress chamber standing-wave resonances (lumped-compliance chambers)" style={{ cursor: 'pointer' }}>
      <input type="checkbox" checked={masking} onChange={(e) => updateSettings({ masking: e.target.checked })} />
      <span style={{ fontSize: 11, color: 'var(--text-2)' }}>Mask resonances</span>
    </label>
  )
}

/**
 * Take a snapshot and manage the reference overlays already taken.
 *
 * @returns {React.ReactElement} The snapshot control.
 * @sideEffect Subscribes to the store.
 */
function SnapshotControl() {
  const store = useStore()
  return (
    <>
      <button className="snap-btn" onClick={store.takeSnapshot} disabled={store.snapshots.length >= 3}
        title="Freeze the current result as a reference overlay (max 3)">Snap</button>
      {store.snapshots.map((s) => (
        <span key={s.id} className="snapshot-chip" style={{ borderColor: s.color }}>
          <span className="pi-dot" style={{ background: s.color }} />
          <input value={s.label} onChange={(e) => store.renameSnapshot(s.id, e.target.value)} />
          <span className="x" onClick={() => store.removeSnapshot(s.id)}>✕</span>
        </span>
      ))}
    </>
  )
}

const CONTROLS = {
  undo: UndoRedo,
  voltage: VoltageControl,
  sweep: SweepRange,
  masking: MaskingToggle,
  snapshot: SnapshotControl,
}

// ---------- metric readout ----------

/**
 * One read-only metric readout, flagged when it exceeds a limit.
 *
 * Entirely data-driven: `metricValue` decides the label, the text and
 * whether it is out of range, which is why adding a metric needs no change
 * here.
 *
 * @param {object} props - Component props.
 * @param {string} props.id - Quick-bar metric item id.
 * @returns {React.ReactElement|null} The readout, or `null` when the id is not a metric.
 * @sideEffect Subscribes to the store.
 */
function Metric({ id }) {
  const metrics = useStore((s) => s.metrics)
  const results = useStore((s) => s.results)
  const nodes = useStore((s) => s.nodes)
  const m = metricValue(id, { metrics, results, nodes })
  if (!m) return null
  return (
    <div className="tb-metric" title={m.label}>
      <span className="m-label">{m.label}</span>
      <span className={`m-value ${m.bad ? 'bad' : ''}`}>{m.value}</span>
    </div>
  )
}

// ---------- the bar ----------

/**
 * The quick-access bar under the menu.
 *
 * Contents and order come from `store.toolbar`, configured in Settings ▸
 * Quick bar. Consecutive items of the same kind are collected into one
 * block that wraps internally, so a long metrics readout does not push the
 * controls onto a second row.
 *
 * @returns {React.ReactElement} The quick bar.
 * @sideEffect Subscribes to the store.
 */
export default function Toolbar() {
  const toolbar = useStore((s) => s.toolbar)

  const runs = []
  for (const id of toolbar) {
    const group = TOOLBAR_ITEMS[id]?.group
    const last = runs[runs.length - 1]
    if (last && last.group === group) last.ids.push(id)
    else runs.push({ group, ids: [id] })
  }

  return (
    <div className="toolbar">
      {runs.map((run, i) => (
        <React.Fragment key={run.ids[0]}>
          {i > 0 && <span className="tb-sep" />}
          {run.group === 'metrics' ? (
            <div className="tb-metrics">
              {run.ids.map((id) => <Metric key={id} id={id} />)}
            </div>
          ) : run.ids.map((id) => {
            const Control = CONTROLS[id]
            return Control ? <Control key={id} /> : null
          })}
        </React.Fragment>
      ))}

    </div>
  )
}
