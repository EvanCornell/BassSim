import React, { useEffect } from 'react'
import { useStore, SCHEMA_VERSION } from './store'
import MenuBar from './components/MenuBar'
import Toolbar from './components/Toolbar'
import DockLayout from './components/dock/DockLayout'
import DriverDB from './components/DriverDB'
import TSCalc from './components/TSCalc'
import ProjectManager from './components/ProjectManager'
import SettingsWindow, { ResetPasswordPage } from './components/SettingsWindow'
import PopoutView from './components/PopoutView'
import { isPopout } from './popout'
import { COMMANDS, comboFromEvent, resolve } from './keymap'

/**
 * The starter project loaded on first run.
 *
 * A ported box, which exercises every element type worth seeing on arrival:
 * driver front to radiation, rear through a chamber and a port.
 */
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

/**
 * Offer to restore the previous session's auto-saved project.
 *
 * @returns {React.ReactElement|null} The banner, or `null` when there is nothing to restore.
 * @sideEffect Subscribes to the store; the buttons replace the project or dismiss the prompt.
 */
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

/**
 * Report that the server-side simulation service is unreachable.
 *
 * An app-level banner rather than a per-chart message, because the charts
 * are separate panels and any of them may be closed — the user would
 * otherwise get no indication at all.
 *
 * @returns {React.ReactElement|null} The banner, or `null` when the service is reachable.
 * @sideEffect Subscribes to the store.
 */
function SimErrorBanner() {
  const simError = useStore((s) => s.simError)
  if (!simError) return null
  return <div className="err-banner">{simError}</div>
}

/**
 * Report graph errors that prevent the simulation from running.
 *
 * @returns {React.ReactElement|null} The banner, or `null` when the graph is valid.
 * @sideEffect Subscribes to the store.
 */
function ErrorBanner() {
  const errors = useStore((s) => s.results?.validation?.errors)
  if (!errors || !errors.length) return null
  return <div className="err-banner">{errors.join(' · ')}</div>
}

/**
 * The application root.
 *
 * Routes before rendering anything: the password-reset page and a
 * popped-out panel are whole-page modes that share none of the workspace
 * chrome.
 *
 * Two effects run once on mount. The first loads the demo project and, if a
 * different auto-save exists, offers to restore it — skipped entirely in a
 * popped-out tab, which owns no project and would otherwise broadcast one
 * over whatever the main window has open. The second installs the global
 * key handler, which resolves every combo through `src/keymap.js` so the
 * menus, the rebinding UI and this handler can never disagree, and which
 * ignores keys while a text field has focus.
 *
 * @returns {React.ReactElement} The workspace, or a whole-page route.
 * @sideEffect Subscribes to the store, reads LocalStorage and `window.location`, and registers a window keydown listener that is removed on unmount.
 */
export default function App() {
  const loadSerialized = useStore((s) => s.loadSerialized)
  const setRestorePrompt = useStore((s) => s.setRestorePrompt)

  // initial load: offer to restore the last auto-saved project, else demo.
  // A popped-out tab owns no project — loading one here would broadcast it
  // over whatever the main window already has open.
  useEffect(() => {
    if (isPopout()) return
    const last = localStorage.getItem('acousim:lastProject')
    let restored = null
    if (last) {
      try { restored = JSON.parse(localStorage.getItem(`acousim:project:${last}`)) } catch { /* ignore */ }
    }
    loadSerialized(DEMO)
    if (restored && restored.nodes?.length && restored.name !== DEMO.name) setRestorePrompt(restored)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Keyboard commands. Every binding is resolved through src/keymap.js, so
  // the menus, Settings ▸ Keyboard and this handler can never disagree.
  useEffect(() => {
    /**
     * Global keydown handler: resolve the combo and run its command.
     *
     * Text fields keep their own keys — including the editing shortcuts — so
     * typing in a parameter box never triggers a canvas command.
     *
     * @param {KeyboardEvent} e - The event.
     * @returns {void}
     * @sideEffect Reads current store state and runs a command, which mutates the graph or the workspace. Prevents the browser default only when a command actually matched.
     */
    const onKey = (e) => {
      const el = e.target
      const tag = el?.tagName
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA' || el?.isContentEditable) return

      const combo = comboFromEvent(e)
      if (!combo) return
      const st = useStore.getState()
      const id = resolve(st.bindings, combo, st.focusedPanel)
      if (!id) return
      e.preventDefault()
      COMMANDS[id].run(st)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  if (window.location.pathname === '/reset-password') return <ResetPasswordPage />
  if (isPopout()) return <PopoutView />

  return (
    <div className="app">
      <MenuBar />
      <Toolbar />
      <RestoreBanner />
      <SimErrorBanner />
      <ErrorBanner />
      <DockLayout />
      <DriverDB />
      <TSCalc />
      <ProjectManager />
      <SettingsWindow />
    </div>
  )
}
