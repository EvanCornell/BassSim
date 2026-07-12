import React, { useRef, useState } from 'react'
import { useStore, SCHEMA_VERSION } from '../store'
import { exportProjectJSON, exportCSV, exportSchematicPNG, exportMetricsTxt } from '../utils/export'

export default function Toolbar() {
  const store = useStore()
  const fileRef = useRef(null)
  const [showExpWarning, setShowExpWarning] = useState(false)
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
      <div className="toolbar-right">
        <button title="Account & application settings" onClick={() => store.openTab('settings')}>
          ⚙ Settings
        </button>
        <button
          disabled={!settings.nlEnabled}
          title={settings.nlEnabled ? 'Open the large-signal curve editor in a tab' : 'Enable Experimental features to unlock'}
          style={settings.nlEnabled ? { borderColor: 'var(--amber)', color: 'var(--amber)' } : {}}
          onClick={() => store.openTab('nllab')}
        >
          ⚗ Nonlinear Lab
        </button>
        <label className="tb-group" title="Enable experimental features (large-signal T/S nonlinearity)" style={{ cursor: 'pointer' }}>
          <input
            type="checkbox" checked={!!settings.nlEnabled}
            onChange={(e) => {
              if (e.target.checked) setShowExpWarning(true)
              else {
                updateSettings({ nlEnabled: false })
                store.closeTab('nllab')
              }
            }}
          />
          <span style={{ fontSize: 11, color: settings.nlEnabled ? 'var(--amber)' : 'var(--text-2)' }}>Experimental features</span>
        </label>
      </div>
      {showExpWarning && (
        <div className="modal-backdrop" onClick={() => setShowExpWarning(false)}>
          <div className="modal" style={{ maxWidth: 480, minWidth: 380 }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ color: 'var(--amber)' }}>⚗ Experimental features</h3>
            <p style={{ fontSize: 13, lineHeight: 1.55 }}>
              You are enabling <b>large-signal T/S nonlinearity</b> simulation.
            </p>
            <p style={{ fontSize: 12.5, lineHeight: 1.55, color: 'var(--text-2)' }}>
              This feature is experimental. Its accuracy depends entirely on the accuracy
              of the Bl(x), Cms(x) and Le(x) curves you provide — without measured data,
              results are plausible-looking guesses. The solver models power compression
              and resonance drift only; it does not produce harmonic distortion. It may
              interact unexpectedly with complex circuits.
            </p>
            <p style={{ fontSize: 12.5, color: 'var(--text-2)' }}>
              A flat curve at 1.0 reproduces the standard engine exactly.
            </p>
            <div className="close-row">
              <button onClick={() => setShowExpWarning(false)}>Cancel</button>
              <button className="primary" onClick={() => {
                updateSettings({ nlEnabled: true })
                setShowExpWarning(false)
                store.openTab('nllab')
              }}>I understand — continue</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
