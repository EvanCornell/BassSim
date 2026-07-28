// Quick-access strip under the menu bar.
//
// Everything here is also reachable from a menu — this row exists only for the
// controls you touch constantly while iterating on a design: the project name,
// undo/redo, the sweep range, resonance masking and the snapshot overlays.
import React, { useState } from 'react'
import { useStore } from '../store'

export default function Toolbar() {
  const store = useStore()
  const [showExpWarning, setShowExpWarning] = useState(false)
  const { settings, updateSettings, snapshots } = store

  return (
    <div className="toolbar">
      <input className="proj-name" value={store.projectName}
        onChange={(e) => store.setProjectName(e.target.value)} title="Project name (auto-saves under this name)" />

      <span className="tb-sep" />
      <button className="icon-btn" title="Undo (Ctrl+Z)" disabled={!store.history.length} onClick={store.undo}>↶</button>
      <button className="icon-btn" title="Redo (Ctrl+Y)" disabled={!store.future.length} onClick={store.redo}>↷</button>

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

      <span className="tb-sep" />
      <button onClick={store.takeSnapshot} disabled={snapshots.length >= 3}
        title="Freeze the current result as a reference overlay (max 3)">📌 Snapshot</button>
      {snapshots.map((s) => (
        <span key={s.id} className="snapshot-chip" style={{ borderColor: s.color }}>
          <span className="pi-dot" style={{ background: s.color }} />
          <input value={s.label} onChange={(e) => store.renameSnapshot(s.id, e.target.value)} />
          <span className="x" onClick={() => store.removeSnapshot(s.id)}>✕</span>
        </span>
      ))}

      <div className="toolbar-right">
        <label className="tb-group" title="Enable experimental features (large-signal T/S nonlinearity)" style={{ cursor: 'pointer' }}>
          <input
            type="checkbox" checked={!!settings.nlEnabled}
            onChange={(e) => {
              if (e.target.checked) setShowExpWarning(true)
              else {
                updateSettings({ nlEnabled: false })
                store.layoutOps.close('nllab')
              }
            }}
          />
          <span style={{ fontSize: 11, color: settings.nlEnabled ? 'var(--amber)' : 'var(--text-2)' }}>Experimental</span>
        </label>
        <button className="icon-btn" title="Settings" onClick={() => store.setShowSettings(true)}>⚙</button>
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
                store.layoutOps.open('nllab')
              }}>I understand — continue</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
