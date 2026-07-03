import React, { useRef } from 'react'
import { useStore, SCHEMA_VERSION } from '../store'
import { exportProjectJSON, exportCSV, exportSchematicPNG, exportMetricsTxt } from '../utils/export'

export default function Toolbar() {
  const store = useStore()
  const fileRef = useRef(null)
  const { settings, updateSettings, snapshots } = store

  const onNew = () => {
    if (store.nodes.length && !confirm('Start a new project? Current graph is auto-saved under its project name.')) return
    store.loadSerialized({ name: `Untitled ${new Date().toLocaleTimeString()}`, nodes: [], edges: [] })
  }

  const onLoadFile = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const proj = JSON.parse(reader.result)
        if (proj.schemaVersion !== SCHEMA_VERSION) {
          if (!confirm(`This file uses schema v${proj.schemaVersion ?? '?'} but the app expects v${SCHEMA_VERSION}. Attempt to load anyway?`)) return
        }
        store.loadSerialized(proj)
      } catch {
        alert('Could not parse that file as an AcouSim project.')
      }
    }
    reader.readAsText(file)
    e.target.value = ''
  }

  return (
    <div className="toolbar">
      <span className="logo">Acou<span>Sim</span></span>
      <input className="proj-name" value={store.projectName}
        onChange={(e) => store.setProjectName(e.target.value)} title="Project name (auto-saves under this name)" />
      <button onClick={onNew}>New</button>
      <button onClick={() => { store.autoSave(); exportProjectJSON(store.serialize()) }}>Save JSON</button>
      <button onClick={() => fileRef.current?.click()}>Load JSON</button>
      <input ref={fileRef} type="file" accept=".json,application/json" style={{ display: 'none' }} onChange={onLoadFile} />
      <button onClick={() => store.setShowProjectManager(true)}>Projects…</button>
      <span className="tb-sep" />
      <button onClick={store.takeSnapshot} disabled={snapshots.length >= 3} title="Freeze the current result as a reference overlay (max 3)">
        📌 Snapshot
      </button>
      {snapshots.map((s) => (
        <span key={s.id} className="snapshot-chip" style={{ borderColor: s.color }}>
          <span className="pi-dot" style={{ background: s.color }} />
          <input value={s.label} onChange={(e) => store.renameSnapshot(s.id, e.target.value)} />
          <span className="x" onClick={() => store.removeSnapshot(s.id)}>✕</span>
        </span>
      ))}
      <span className="tb-sep" />
      <button onClick={() => exportCSV(store.results, store.nodes, store.projectName)}>CSV</button>
      <button onClick={() => exportSchematicPNG(store.projectName)}>PNG</button>
      <button onClick={() => exportMetricsTxt(store.metrics, settings, store.projectName)}>Metrics</button>
      <span className="tb-sep" />
      <div className="tb-group" title="Frequency sweep range">
        <label>Sweep</label>
        <input type="number" value={settings.fmin} min="1"
          onChange={(e) => { const v = parseFloat(e.target.value); if (v > 0) updateSettings({ fmin: v }) }} />
        <label>–</label>
        <input type="number" value={settings.fmax}
          onChange={(e) => { const v = parseFloat(e.target.value); if (v > settings.fmin) updateSettings({ fmax: v }) }} />
        <label>Hz</label>
      </div>
      <label className="tb-group" title="Suppress chamber standing-wave resonances (lumped-compliance chambers)" style={{ cursor: 'pointer' }}>
        <input type="checkbox" checked={settings.masking} onChange={(e) => updateSettings({ masking: e.target.checked })} />
        <span style={{ fontSize: 11, color: 'var(--text-2)' }}>Mask resonances</span>
      </label>
    </div>
  )
}
