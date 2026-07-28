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

function ProjectName() {
  const projectName = useStore((s) => s.projectName)
  const setProjectName = useStore((s) => s.setProjectName)
  return (
    <input className="proj-name" value={projectName}
      onChange={(e) => setProjectName(e.target.value)}
      title="Project name (auto-saves under this name)" />
  )
}

function UndoRedo() {
  const store = useStore()
  return (
    <>
      <button className="icon-btn" title="Undo (Ctrl+Z)" disabled={!store.history.length} onClick={store.undo}>↶</button>
      <button className="icon-btn" title="Redo (Ctrl+Y)" disabled={!store.future.length} onClick={store.redo}>↷</button>
    </>
  )
}

// Drive level, adjustable on the fly. Goes through setAmp so P = V²/Z stays
// linked with the amplifier solver in the Parameters panel.
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
  project: ProjectName,
  undo: UndoRedo,
  voltage: VoltageControl,
  sweep: SweepRange,
  masking: MaskingToggle,
  snapshot: SnapshotControl,
}

// ---------- metric readout ----------

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

export default function Toolbar() {
  const toolbar = useStore((s) => s.toolbar)

  // Consecutive metrics are collected into one block that wraps internally,
  // so a long readout does not force the controls onto a second row.
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
