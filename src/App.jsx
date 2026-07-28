import React, { useEffect } from 'react'
import { useStore, SCHEMA_VERSION } from './store'
import MenuBar from './components/MenuBar'
import Toolbar from './components/Toolbar'
import DockLayout from './components/dock/DockLayout'
import DriverDB from './components/DriverDB'
import TSCalc from './components/TSCalc'
import ProjectManager from './components/ProjectManager'
import SettingsWindow, { ResetPasswordPage } from './components/SettingsWindow'

// Starter example: a ported box (driver front → radiation, rear → chamber → port → radiation)
const DEMO = {
  schemaVersion: SCHEMA_VERSION,
  name: 'Ported box example',
  nodes: [
    { id: 'drv1', type: 'driver', position: { x: 260, y: 40 }, params: { label: 'Driver' } },
    { id: 'rad1', type: 'radiation', position: { x: 520, y: 40 }, params: { space: 'half', label: 'Front radiation' } },
    { id: 'ch1', type: 'chamber', position: { x: 40, y: 170 }, params: { volume: 60, length: 50, Q: 30, label: 'Box 60 L' } },
    { id: 'wg1', type: 'waveguide', position: { x: 40, y: 330 }, params: { S1: 100, S2: 100, length: 25, flare: 'conical', label: 'Port' } },
    { id: 'rad2', type: 'radiation', position: { x: 40, y: 500 }, params: { space: 'half', label: 'Port radiation' } },
  ],
  edges: [
    { id: 'e1', source: 'drv1', sourceHandle: 'front', target: 'rad1', targetHandle: 'in' },
    { id: 'e2', source: 'drv1', sourceHandle: 'rear', target: 'ch1', targetHandle: 'in' },
    { id: 'e3', source: 'ch1', sourceHandle: 'out', target: 'wg1', targetHandle: 'throat' },
    { id: 'e4', source: 'wg1', sourceHandle: 'mouth', target: 'rad2', targetHandle: 'in' },
  ],
}

function RestoreBanner() {
  const restorePrompt = useStore((s) => s.restorePrompt)
  const setRestorePrompt = useStore((s) => s.setRestorePrompt)
  const loadSerialized = useStore((s) => s.loadSerialized)
  if (!restorePrompt) return null
  return (
    <div className="restore-banner">
      <span>Restore last session — <b>{restorePrompt.name}</b> ({(restorePrompt.nodes || []).length} nodes, saved {restorePrompt.modified ? new Date(restorePrompt.modified).toLocaleString() : 'earlier'})?</span>
      <button className="primary" onClick={() => { loadSerialized(restorePrompt); setRestorePrompt(null) }}>Restore</button>
      <button onClick={() => setRestorePrompt(null)}>Dismiss</button>
    </div>
  )
}

function ErrorBanner() {
  const errors = useStore((s) => s.results?.validation?.errors)
  if (!errors || !errors.length) return null
  return <div className="err-banner">{errors.join(' · ')}</div>
}

export default function App() {
  const loadSerialized = useStore((s) => s.loadSerialized)
  const setRestorePrompt = useStore((s) => s.setRestorePrompt)

  // initial load: offer to restore the last auto-saved project, else demo
  useEffect(() => {
    const last = localStorage.getItem('acousim:lastProject')
    let restored = null
    if (last) {
      try { restored = JSON.parse(localStorage.getItem(`acousim:project:${last}`)) } catch { /* ignore */ }
    }
    loadSerialized(DEMO)
    if (restored && restored.nodes?.length && restored.name !== DEMO.name) setRestorePrompt(restored)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // keyboard shortcuts
  useEffect(() => {
    const onKey = (e) => {
      const tag = e.target.tagName
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return
      const st = useStore.getState()
      const mod = e.ctrlKey || e.metaKey
      const key = e.key.toLowerCase()

      // project-level shortcuts work wherever the focus is
      if (mod && key === 'n') { e.preventDefault(); st.newProject(); return }
      if (mod && key === 's') { e.preventDefault(); st.saveProjectJSON(); return }

      // graph shortcuts belong to the Node Editor — other panels (the
      // Nonlinear Lab in particular) bind the same keys for their own use
      if (st.focusedPanel !== 'canvas') return
      if (mod && key === 'z' && !e.shiftKey) { e.preventDefault(); st.undo() }
      else if (mod && (key === 'y' || (key === 'z' && e.shiftKey))) { e.preventDefault(); st.redo() }
      else if (mod && key === 'd') { e.preventDefault(); st.duplicateSelected() }
      else if (mod && key === 'a') { e.preventDefault(); st.selectAll() }
      else if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); st.deleteSelected() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  if (window.location.pathname === '/reset-password') return <ResetPasswordPage />

  return (
    <div className="app">
      <MenuBar />
      <Toolbar />
      <RestoreBanner />
      <ErrorBanner />
      <DockLayout />
      <DriverDB />
      <TSCalc />
      <ProjectManager />
      <SettingsWindow />
    </div>
  )
}
