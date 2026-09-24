import React, { useEffect } from 'react'
import { useStore, SCHEMA_VERSION } from './store'
import MenuBar from './components/MenuBar'
import Toolbar from './components/Toolbar'
import DockLayout from './components/dock/DockLayout'
import DriverDB from './components/DriverDB'
import TSCalc from './components/TSCalc'
import SaveDriverPrompt from './components/SaveDriverPrompt'
import SettingsWindow from './components/SettingsWindow'
import PopoutView from './components/PopoutView'
import WorkspacePrompt from './components/WorkspacePrompt'
import ContextMenu from './components/ContextMenu'
import TimeDomainWindow from './components/TimeDomainWindow'
import { isPopout } from './popout'
import { COMMANDS, comboFromEvent, resolve } from './keymap'

/**
 * The starter project loaded on first run.
 *
 * A ported box, which exercises every element type worth seeing on arrival:
 * driver front to radiation, rear through a chamber and a port. It is written
 * into the workspace's first project rather than opened loose, so even the
 * demo is a file the user can rename, copy or throw away.
 */
const DEMO = {
  schemaVersion: SCHEMA_VERSION,
  name: 'Ported box example',
  nodes: [
    { id: 'drv1', type: 'driver', position: { x: 260, y: 40 }, params: { label: 'Driver' } },
    { id: 'rad1', type: 'radiation', position: { x: 520, y: 40 }, params: { space: 'half', label: 'Front radiation' } },
    { id: 'ch1', type: 'chamber', position: { x: 40, y: 170 }, params: { volume: 60, length: 50, label: 'Box 60 L' } },
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
 * Report that the simulation could not be run.
 *
 * An app-level banner rather than a per-chart message, because the charts
 * are separate panels and any of them may be closed — the user would
 * otherwise get no indication at all.
 *
 * @returns {React.ReactElement|null} The banner, or `null` when the last run succeeded.
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
 * Routes before rendering anything: a popped-out panel is a whole-page mode
 * that shares none of the workspace chrome.
 *
 * Two effects run once on mount. The first opens whichever workspace file was
 * last active, seeding a first run with the demo graph — skipped entirely in a
 * popped-out tab, which owns no project and would otherwise broadcast one over
 * whatever the main window has open. The second installs the global
 * key handler, which resolves every combo through `src/keymap.js` so the
 * menus, the rebinding UI and this handler can never disagree, and which
 * ignores keys while a text field has focus.
 *
 * @returns {React.ReactElement} The workspace, or a whole-page route.
 * @sideEffect Subscribes to the store, reads `window.location`, and registers a window keydown listener that is removed on unmount.
 */
export default function App() {
  const loadSerialized = useStore((s) => s.loadSerialized)
  const tdOpen = useStore((s) => s.tdOpen)

  // Initial load: open the workspace's active project. On a genuine first run
  // that file exists but is empty, so the demo graph goes into it — a new user
  // lands in a workspace called "workspace", in a project called "project",
  // with something on the canvas to take apart.
  //
  // A popped-out tab owns no project — loading one here would broadcast it
  // over whatever the main window already has open.
  useEffect(() => {
    if (isPopout()) return
    const st = useStore.getState()
    const entry = st.activeFile ? st.workspace.files[st.activeFile] : null
    if (!entry) return
    const project = entry.data
    if (project?.nodes?.length) loadSerialized(project)
    else loadSerialized({ ...DEMO, name: project?.name || DEMO.name })
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

  if (isPopout()) return <PopoutView />

  return (
    <div className="app">
      <MenuBar />
      <Toolbar />
      <SimErrorBanner />
      <ErrorBanner />
      {/* The time-domain workspace replaces the dock rather than docking in
          it. The dock stays mounted underneath, hidden, so the canvas and
          charts come back exactly as they were. */}
      <div className="dock-host" style={tdOpen ? { display: 'none' } : undefined}><DockLayout /></div>
      {tdOpen && <TimeDomainWindow />}
      <DriverDB />
      <TSCalc />
      <SaveDriverPrompt />
      <SettingsWindow />
      <WorkspacePrompt />
      <ContextMenu />
    </div>
  )
}
