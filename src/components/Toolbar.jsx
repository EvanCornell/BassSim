// Quick-access bar under the menu bar.
//
// Contents are user-configurable (Settings ▸ Quick bar): `store.toolbar` is an
// ordered list of item ids from src/toolbarItems.js, and this renders them in
// that order. Metric items are data-driven and need no case here; controls get
// one each. Application-level switches (Settings, experimental features) belong
// to the menu bar, not here — this strip is for per-design adjustments.
import React from 'react'
import { useStore, SNAPSHOT_LIMIT, isLocked } from '../store'
import { readSnapshots } from '../workspace'
import { TOOLBAR_ITEMS, metricValue } from '../toolbarItems'
import NumInput from './NumInput'

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
  const locked = isLocked(store)
  return (
    <div className="tb-pill tb-undo">
      <button className="tb-icon" title="Undo (Ctrl+Z)" disabled={locked || !store.history.length} onClick={store.undo}>↶</button>
      <button className="tb-icon" title="Redo (Ctrl+Y)" disabled={locked || !store.future.length} onClick={store.redo}>↷</button>
    </div>
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
  const locked = useStore(isLocked)
  return (
    <div className="tb-pill tb-voltage" title="Amplifier drive voltage — power follows as V²/Z">
      <label>Drive</label>
      <NumInput step="0.01" min="0" value={settings.voltage} disabled={locked}
        onCommit={(x) => setAmp('voltage', x)} />
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
  const locked = useStore(isLocked)
  return (
    <div className="tb-pill tb-group" title="Frequency sweep range">
      <label>Sweep</label>
      <NumInput value={settings.fmin} above="0" disabled={locked}
        validate={(v) => (v < settings.fmax ? null : 'Must be below the end frequency')}
        onCommit={(v) => updateSettings({ fmin: v })} />
      <label>–</label>
      <NumInput value={settings.fmax} above={settings.fmin} disabled={locked}
        onCommit={(v) => updateSettings({ fmax: v })} />
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
  const locked = useStore(isLocked)
  return (
    <label className="tb-pill tb-group" title="Suppress chamber standing-wave resonances (lumped-compliance chambers)" style={{ cursor: 'pointer' }}>
      <input type="checkbox" checked={masking} disabled={locked} onChange={(e) => updateSettings({ masking: e.target.checked })} />
      <span style={{ fontSize: 11, color: 'var(--text-2)' }}>Mask resonances</span>
    </label>
  )
}

/**
 * Take a snapshot and manage the reference overlays already taken.
 *
 * The overlays belong to the workspace rather than the open project, so this
 * strip keeps showing them across a project switch — which is the point of
 * them.
 *
 * @returns {React.ReactElement} The snapshot control.
 * @sideEffect Subscribes to the store.
 */
function SnapshotControl() {
  const store = useStore()
  const snapshots = readSnapshots(store.workspace)
  return (
    <div className="tb-pill">
      <button
        className="snap-btn"
        onClick={store.takeSnapshot}
        disabled={snapshots.length >= SNAPSHOT_LIMIT || !store.results?.ok}
        title={`Freeze the current result as a reference overlay, kept until you remove it (max ${SNAPSHOT_LIMIT})`}
      >Snapshot</button>
      {snapshots.map((s) => (
        <span key={s.id} className="snapshot-chip" title={s.project ? `From ${s.project}` : ''}>
          <span className="pi-dot" style={{ background: s.color }} />
          <input value={s.label} size={Math.max(4, s.label.length)} style={{ width: 'auto' }}
            onChange={(e) => store.renameSnapshot(s.id, e.target.value)} />
          <span className="x" title="Remove this snapshot" onClick={() => store.removeSnapshot(s.id)}>✕</span>
        </span>
      ))}
    </div>
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

/** Fuller names for the readouts whose labels are abbreviated on the bar. */
const TITLES = {
  m_bw: 'Bandwidth between the −3 dB points',
  m_maxpower: 'Largest input before the cone reaches Xmax, and the voltage it takes',
  m_volume: 'Air enclosed by every chamber and duct',
  m_xf3: 'Cone excursion at F3, as a share of Xmax',
  m_xfb: 'Cone excursion at Fb, as a share of Xmax',
  m_zpeaks: 'Impedance peaks: frequency / magnitude',
}

/**
 * One read-only metric readout, flagged when it exceeds a limit.
 *
 * Entirely data-driven: `metricValue` decides the label, the text and
 * whether it is out of range, which is why adding a metric needs no change
 * here.
 *
 * @param {object} props - Component props.
 * @param {string} props.id - Quick-bar metric item id.
 * @returns {React.ReactElement|null} The readout, or `null` when the id is not a metric or has no value for this design.
 * @sideEffect Subscribes to the store.
 */
function Metric({ id }) {
  const metrics = useStore((s) => s.metrics)
  const results = useStore((s) => s.results)
  const nodes = useStore((s) => s.nodes)
  const m = metricValue(id, { metrics, results, nodes })
  // A figure that does not apply to this design — Qtc of a vented box, a
  // limit with no Xmax — takes no room on the bar.
  if (!m || m.value === '—') return null
  return (
    <div className="tb-metric" title={TITLES[id] || m.label}>
      <span className="m-label">{m.label}</span>
      <span className={`m-value ${m.bad ? 'bad' : ''}`}>{m.value}</span>
    </div>
  )
}

/**
 * One cluster of readouts in a pill, or nothing when none of them has a value.
 *
 * @param {object} props - Component props.
 * @param {string[]} props.ids - Metric ids in the cluster.
 * @returns {React.ReactElement|null} The pill.
 * @sideEffect Subscribes to the store.
 */
function MetricPill({ ids }) {
  const metrics = useStore((s) => s.metrics)
  const results = useStore((s) => s.results)
  const nodes = useStore((s) => s.nodes)
  const shown = ids.filter((id) => metricValue(id, { metrics, results, nodes })?.value !== '—')
  if (!shown.length) return null
  return <div className="tb-pill">{shown.map((id) => <Metric key={id} id={id} />)}</div>
}

/**
 * The switch between the editor and the time-domain workspace.
 *
 * Always on the bar rather than one of its configurable items: it changes
 * the whole window, so it should always be where the user left it.
 *
 * @returns {React.ReactElement} The button.
 * @sideEffect Subscribes to the store.
 */
function TimeDomainButton() {
  const open = useStore((s) => s.tdOpen)
  const job = useStore((s) => s.tdJob)
  const openTd = useStore((s) => s.openTimeDomain)
  const close = useStore((s) => s.closeTimeDomain)
  return (
    <button
      className={`tb-pill td-toggle${open ? ' active' : ''}`}
      onClick={() => (open ? close() : openTd())}
      title={open ? 'Back to the editor (Alt+T)' : 'Time-domain responses, transient runs and distortion (Alt+T)'}
    >
      {open ? '← Editor' : 'Time Domain'}{job && !open ? ` · ${Math.round(job.fraction * 100)}%` : ''}
    </button>
  )
}

// ---------- the bar ----------

/**
 * The quick-access bar under the menu.
 *
 * Contents and order come from `store.toolbar`, configured in Settings ▸
 * Quick bar. Every control is a pill of its own; the metrics collect into
 * one block that wraps, a pill per cluster of neighbours that describe the
 * same thing (see `cluster` in `TOOLBAR_ITEMS`), so the response, the
 * impedance, the limits and the size each read as a group.
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
      <TimeDomainButton />
      {runs.map((run) => (
        run.group === 'metrics' ? (
          <div className="tb-metrics" key={run.ids[0]}>
            {clusters(run.ids).map((ids) => <MetricPill key={ids[0]} ids={ids} />)}
          </div>
        ) : run.ids.map((id) => {
          const Control = CONTROLS[id]
          return Control ? <Control key={id} /> : null
        })
      ))}
    </div>
  )
}

/**
 * Metric ids split into runs of neighbours that share a cluster.
 *
 * @param {string[]} ids - Metric ids, in bar order.
 * @returns {string[][]} The runs, in order.
 * @pure
 */
export function clusters(ids) {
  const out = []
  for (const id of ids) {
    const c = TOOLBAR_ITEMS[id]?.cluster || id
    const last = out[out.length - 1]
    if (last && (TOOLBAR_ITEMS[last[0]]?.cluster || last[0]) === c) last.push(id)
    else out.push([id])
  }
  return out
}
