// Application state: the project graph, the workspace, and everything the UI
// reads. One Zustand store, deliberately flat.
//
// State fields, since the action contracts below name what changes rather than
// where:
//
//   project    nodes, edges, projectName, selectedNodeId, settings
//   results    results, metrics, simError
//   history    history, future, clipboard
//   workspace  layout, layoutPresets, maximized, focusedPanel, draggingPanel,
//              poppedOut, toolbar, bindings, xZoom
//   modals     showDriverDB, showTSCalc, showSettings, settingsSection,
//              saveDriverFor,
//              workspacePrompt, velocityPopupNodeId
//
// Fields prefixed with an underscore are solver and persistence bookkeeping
// (`_lastSig`, `_simToken`, `_computeTimer`, `_flowApi`) and are not part of
// any action's observable contract.
//
// LocalStorage keys, all prefixed `acousim:` — `acousim:layout`,
// `acousim:layoutPresets`, `acousim:toolbar`, `acousim:keymap`,
// `acousim:workspace` and `acousim:workspaceChosen`.
//
// A subset of the state is mirrored to popped-out panel windows over a
// BroadcastChannel; see src/popout.js for which keys and why.

import { create } from 'zustand'
import { applyNodeChanges, applyEdgeChanges, addEdge } from 'reactflow'
import { SCHEMA_VERSION, DEFAULT_PARAMS } from './schema/version'
import { migrateProject } from './schema/migrate'
import { toEditor, fromEditor } from './schema/editor'
import { pruneExtras, driveOf, masterForVoltage, freshId } from './schema/extras'
import { ENGINES, DEFAULT_ENGINE } from './engine/pipeline'
import { getPool, relay, cancelLane } from './engine/poolHost'
import * as L from './layout'
import * as D from './driverParams'
import { PANEL_META, PANEL_IDS } from './panelMeta'
import { exportProjectJSON, exportWorkspaceZip } from './utils/export'
import * as W from './workspace'
import * as Z from './utils/zip'
import * as F from './utils/folder'
import { DEFAULT_TOOLBAR, sanitizeToolbar } from './toolbarItems'
import { channel, isPopout, openPanelWindow, openPanelGroupWindow, popoutPanelId, popoutPanelIds, SHARED_KEYS, SIM_INPUT_KEYS } from './popout'
import { loadBindings, saveBindings, DEFAULT_BINDINGS, COMMAND_IDS, findConflict } from './keymap'

const POPOUT = isPopout()

// ---- simulation worker ----
// Spawned on first use rather than at module load, so a popped-out panel — or
// any code path that imports the store without ever simulating — does not pay
// for a worker it will not use.
let simWorker = null
let simReqId = 0
const simPending = new Map()

/**
 * Run one sweep in the simulation worker.
 *
 * Each request carries an id and resolves its own promise, so several runs may
 * be in flight without their replies being confused. Replies whose id is no
 * longer pending are dropped, which is what makes a superseded run harmless.
 *
 * @param {object} project - A serialized v3 project.
 * @param {string} engine - Which engine should run it.
 * @returns {Promise<{id: number, ok: boolean, results?: object, metrics?: object|null, warnings?: object, error?: string, projectErrors?: string[]|null}>} The worker's reply.
 * @sideEffect Spawns the worker on first call and posts a message to it.
 */
function simulateInWorker(project, engine) {
  if (!simWorker) {
    simWorker = new Worker(new URL('./engine/worker.js', import.meta.url), { type: 'module' })
    /**
     * Resolve the request a worker reply belongs to.
     *
     * An unrecognised id is dropped rather than treated as an error: it means
     * the request was superseded and its entry already removed.
     *
     * @param {MessageEvent} e - The reply, carrying the `id` of its request.
     * @returns {void}
     * @sideEffect Serves the worker's SPICE runs from the thread pool; removes the request from `simPending` and resolves its promise.
     */
    simWorker.onmessage = (e) => {
      if (relay(simWorker, e.data, 'live')) return
      const resolve = simPending.get(e.data.id)
      if (!resolve) return // superseded and already discarded
      simPending.delete(e.data.id)
      resolve(e.data)
    }
  }
  const id = ++simReqId
  return new Promise((resolve) => {
    simPending.set(id, resolve)
    simWorker.postMessage({ id, project, engine })
  })
}

// ---- time-domain worker ----
// A separate worker, so a distortion sweep does not hold up the live
// frequency response. Cancelling terminates it; the next job spawns another.
let tdWorker = null
let tdReqId = 0

/**
 * Start a time-domain job in its worker.
 *
 * @param {object} msg - `{kind, project, opts, mode}`, as `tdWorker.js` takes it.
 * @param {Function} onMessage - Called with each message the job posts.
 * @returns {number} The job id.
 * @sideEffect Spawns the worker when there is none, and posts to it.
 */
function startTdJob(msg, onMessage) {
  if (!tdWorker) tdWorker = new Worker(new URL('./engine/tdWorker.js', import.meta.url), { type: 'module' })
  const w = tdWorker
  const id = ++tdReqId
  /**
   * Serve the job's SPICE runs from the thread pool, and pass its other messages on; ignore any from a job since abandoned.
   *
   * @param {MessageEvent} e - A message from the worker.
   * @returns {void}
   * @sideEffect Runs netlists in the pool; calls `onMessage`.
   */
  w.onmessage = (e) => {
    if (relay(w, e.data, 'td')) return
    if (e.data.id === id) onMessage(e.data)
  }
  w.postMessage({ id, threads: getPool().size, ...msg })
  return id
}

/**
 * Stop whatever the time-domain worker is doing.
 *
 * @returns {void}
 * @sideEffect Terminates the worker and the pool's time-domain runs; the next job spawns a fresh one.
 */
function stopTdWorker() {
  if (tdWorker) tdWorker.terminate()
  tdWorker = null
  cancelLane('td')
}

/** The time-domain settings a new project starts with, per section. */
export const TD_DEFAULTS = {
  linear: { bandwidth: 2000, resolution: 0.5, burstHz: 40, burstCycles: 6.5, csdSlices: 8, csdStepMs: 5 },
  transient: {
    signal: { type: 'burst', hz: 40, cycles: 6.5, f1: 10, f2: 500, length: 1 },
    levelDb: 0, fs: 8000, duration: 0.5, bandwidth: 1000, nonlinear: true, compareLinear: true,
  },
  distortion: {
    mode: 'harmonics', hz: 40, levelDb: 0, harmonics: 10, bandwidth: 1000,
    f1: 15, f2: 200, points: 12, levels: [-12, -6, 0, 6, 12],
    bands: [20, 25, 31.5, 40, 50, 63], xLimit: 1.5, nonlinear: true,
  },
}

/**
 * The project's time-domain settings, defaults filled in.
 *
 * They live in the project's `analyses` as one entry of type `timedomain`,
 * so a project reopens with the settings it was last run with.
 *
 * @param {object} extras - The editor's extra project sections.
 * @returns {{linear: object, transient: object, distortion: object}} The settings.
 * @pure
 */
export function tdSettingsOf(extras) {
  const a = (extras?.analyses || []).find((x) => x.type === 'timedomain') || {}
  return {
    linear: { ...TD_DEFAULTS.linear, ...(a.linear || {}) },
    transient: { ...TD_DEFAULTS.transient, ...(a.transient || {}), signal: { ...TD_DEFAULTS.transient.signal, ...(a.transient?.signal || {}) } },
    distortion: { ...TD_DEFAULTS.distortion, ...(a.distortion || {}) },
  }
}

/**
 * Rewrite a popped-out tab's own URL to match what it now holds.
 *
 * The URL seeds the tab but does not own it: views can be added and closed
 * once it is open. Keeping the address in step means reloading the tab — or
 * restoring it after a browser restart — brings back the window the user
 * actually built rather than the one they first opened.
 *
 * `replaceState` rather than `pushState`, since adding a view is not somewhere
 * the back button should return from.
 *
 * @param {string[]} ids - Panel ids the tab now holds, in tab order.
 * @param {string|null} active - The view in front.
 * @returns {void}
 * @sideEffect Replaces the current history entry. Silently does nothing where the History API is unavailable.
 */
function syncPopoutUrl(ids, active) {
  if (typeof window === 'undefined' || !window.history?.replaceState || !ids.length) return
  const query = `id=${encodeURIComponent(ids.join(','))}${active ? `&active=${encodeURIComponent(active)}` : ''}`
  window.history.replaceState(null, '', `${window.location.pathname}?${query}`)
}

const LAYOUT_KEY = 'acousim:layout'
const PRESETS_KEY = 'acousim:layoutPresets'
const TOOLBAR_KEY = 'acousim:toolbar'
const WORKSPACE_KEY = 'acousim:workspace'
const LEGACY_DRIVERS_KEY = 'acousim:customDrivers'
const STORAGE_CHOICE_KEY = 'acousim:workspaceChosen'

/**
 * How many reference overlays a chart will carry.
 *
 * Three is what stays legible over a live trace; a fourth turns a comparison
 * into a thicket.
 */
export const SNAPSHOT_LIMIT = 3

/**
 * Overlay colours, chosen to stay apart from the live trace and each other.
 */
export const SNAPSHOT_COLORS = ['#f59e0b', '#10b981', '#8b5cf6']

/**
 * Whether the user has already been asked where their workspace lives.
 *
 * A popped-out tab never asks: it owns no workspace of its own and the
 * question belongs to the window that does.
 *
 * @returns {boolean} True when the prompt should be shown.
 * @sideEffect Reads LocalStorage and the window's own URL.
 */
function needsStorageChoice() {
  if (POPOUT) return false
  try { return !localStorage.getItem(STORAGE_CHOICE_KEY) } catch { return false }
}

/**
 * Whether this window's workspace came back from storage or was invented now.
 *
 * The difference decides what may happen to a connected folder. A restored
 * workspace is the continuation of the user's work and can legitimately be
 * newer than what is on disk. A first-run one is the app's own empty default
 * — it carries a modification stamp of *now*, and every stamp comparison in
 * the world would call it the newer of the two. Letting it win would write an
 * empty workspace over a folder full of projects, which is exactly what
 * clearing browser data would otherwise do.
 */
let workspaceRestored = false

/**
 * Load the persisted workspace, or build a first-run one.
 *
 * A workspace that fails to parse is replaced rather than repaired: the file
 * browser cannot show something it cannot read, and a half-recovered workspace
 * would be harder to reason about than an empty one.
 *
 * Custom drivers saved by a build that predates workspaces are adopted into
 * the new one. That only happens on a genuine first run — an existing
 * workspace is never modified on load, since the system folder is supposed to
 * appear when something writes to it, not when the app starts.
 *
 * @returns {object} A usable workspace.
 * @sideEffect Reads LocalStorage and the current time.
 */
function loadWorkspace() {
  try {
    const raw = localStorage.getItem(WORKSPACE_KEY)
    if (raw) {
      const parsed = W.parseWorkspace(raw)
      if (parsed.ok) { workspaceRestored = true; return parsed.workspace }
    }
  } catch { /* fall through to a fresh workspace */ }

  const fresh = W.newWorkspace()
  try {
    const legacy = JSON.parse(localStorage.getItem(LEGACY_DRIVERS_KEY))
    if (Array.isArray(legacy) && legacy.length) return W.writeDrivers(fresh, legacy)
  } catch { /* no drivers to carry over */ }
  return fresh
}

/**
 * The workspace this window starts with.
 *
 * Read once at module load rather than per store field, so the workspace and
 * the file opened from it cannot disagree about which workspace they came
 * from.
 */
const INITIAL_WORKSPACE = loadWorkspace()

/**
 * Load the persisted dock layout, falling back to the default.
 *
 * Three things can invalidate a stored layout: a version mismatch, a panel
 * this build no longer has, or corrupt JSON. All three land on the default
 * rather than throwing. The canvas check is the last guard — a layout
 * without the Node Editor would leave the workspace with nothing to edit,
 * so it is rejected even if it is otherwise valid.
 *
 * @returns {object} A usable layout tree.
 * @sideEffect Reads LocalStorage.
 */
function loadLayout() {
  try {
    const raw = JSON.parse(localStorage.getItem(LAYOUT_KEY))
    if (raw?.version === L.LAYOUT_VERSION) {
      const clean = L.sanitize(raw.tree, PANEL_IDS)
      // the canvas is the workspace — never let a saved layout lose it
      if (clean && L.isOpen(clean, 'canvas')) return clean
    }
  } catch { /* corrupt or absent — fall through to the default */ }
  return L.defaultLayout()
}

/**
 * Load the user's saved layout arrangements.
 *
 * @returns {Array<{name: string, tree: object}>} Saved presets, or an empty list when absent or corrupt.
 * @sideEffect Reads LocalStorage.
 */
function loadPresets() {
  try {
    const raw = JSON.parse(localStorage.getItem(PRESETS_KEY))
    return Array.isArray(raw) ? raw : []
  } catch { return [] }
}

// The quick bar is a UI preference, so it lives beside the layout in
// LocalStorage rather than in `settings` — settings travel inside a project
// file, and opening someone else's design shouldn't rearrange your toolbar.
/**
 * Load the quick-bar arrangement.
 *
 * It lives in LocalStorage beside the layout rather than in `settings`
 * because settings travel inside a project file, and opening someone
 * else's design should not rearrange your toolbar.
 *
 * @returns {string[]} Quick-bar item ids, falling back to the default arrangement.
 * @sideEffect Reads LocalStorage.
 */
function loadToolbar() {
  try {
    return sanitizeToolbar(JSON.parse(localStorage.getItem(TOOLBAR_KEY))) || DEFAULT_TOOLBAR
  } catch { return DEFAULT_TOOLBAR }
}

// ---- the workspace folder ----
//
// When the user has pointed at a folder on their own disk, that folder is the
// workspace: it is read on startup and written back as they work. See
// src/utils/folder.js for what is written and the two rules that keep it from
// touching anything it did not put there.
//
// The handle and the last-known state of the folder are module state rather
// than store state. Neither is serializable, neither belongs in a popped-out
// window, and neither is anything a component should be able to reach.

/** The connected folder, or `null` when the workspace lives in the browser. */
let folderHandle = null

/** What the folder held the last time this app read or wrote it. */
let folderState = { files: new Map(), folders: [] }

/** Pending debounce timer for the next write. */
let folderTimer = null

/** Whether a write is in flight, and whether another was asked for during it. */
let folderWriting = false
let folderAgain = false

/**
 * How long to wait after a change before writing the folder.
 *
 * The workspace commits on every simulation, and a drag across a slider is
 * many of those. Waiting out the pause coalesces a burst into one write.
 */
const FOLDER_SYNC_MS = 700

/**
 * Queue a folder write.
 *
 * A folder whose permission has lapsed is left alone until the user renews it.
 * Writing to it would fail anyway, and the attempt is what would otherwise
 * report the folder as saved when nothing had been.
 *
 * @returns {void}
 * @sideEffect Schedules a timer that writes to the user's filesystem. Does nothing when no folder is connected, or when the connected one is locked.
 * @mutates The module-level sync timer.
 */
function scheduleFolderSync() {
  if (!folderHandle || useStore.getState().folderStatus === 'locked') return
  clearTimeout(folderTimer)
  folderTimer = setTimeout(() => useStore.getState()._syncFolder(), FOLDER_SYNC_MS)
}

export { SCHEMA_VERSION, DEFAULT_PARAMS }

let idCounter = 1
/**
 * Generate a unique node or edge id.
 *
 * Combines the node type, the clock and a module counter, so ids stay
 * unique across a paste that creates several nodes in the same
 * millisecond, and stay readable in a saved project file.
 *
 * @param {string} type - Node type, used as the id's prefix.
 * @returns {string} A new id, unique within this session.
 * @sideEffect Advances the module-level counter.
 */
export const nextId = (type) => `${type}_${Date.now().toString(36)}_${idCounter++}`

const HISTORY_LIMIT = 80

const ENGINE_KEY = 'acousim:engine'

/**
 * The simulation engine this browser last chose.
 *
 * A preference of the person, not a property of the project, so it lives in
 * LocalStorage rather than in the file.
 *
 * @returns {string} The engine name; the pipeline's default when nothing valid is stored or storage is unavailable.
 * @reads LocalStorage.
 */
function loadEngine() {
  try {
    const v = localStorage.getItem(ENGINE_KEY)
    if (ENGINES.includes(v)) return v
  } catch { /* storage unavailable */ }
  return DEFAULT_ENGINE
}

/**
 * The editor sections of an empty project, for the initial state.
 *
 * @returns {object} The `extras` of a default v3 project.
 * @pure
 */
const defaultExtras = () => toEditor(migrateProject({ schemaVersion: SCHEMA_VERSION })).extras

// Adding several elements without moving the mouse would stack them all on
// one point, so step down-right until the spot is clear.
/**
 * Find an unoccupied canvas position near a preferred spot.
 *
 * Adding several elements without moving the mouse would stack them all on
 * one point, so this steps down-right until the spot is clear.
 *
 * @param {{x: number, y: number}} spot - Preferred position.
 * @param {Array<object>} nodes - Existing nodes, whose positions are avoided.
 * @param {number} [step=34] - Both the collision radius and the offset per attempt.
 * @param {number} [limit=40] - Maximum attempts before giving up and returning the last position tried, which may overlap.
 * @returns {{x: number, y: number}} A position to place the node at.
 * @post spot and nodes are not modified
 * @pure
 */
function freeSpotNear(spot, nodes, step = 34, limit = 40) {
  /**
   * Whether any existing node sits within one step of a point.
   * @param {number} x - Canvas x.
   * @param {number} y - Canvas y.
   * @returns {boolean} True when the spot is occupied.
   * @reads the enclosing `nodes` list and `step` radius.
   */
  const taken = (x, y) => nodes.some((n) => Math.abs(n.position.x - x) < step && Math.abs(n.position.y - y) < step)
  let { x, y } = spot
  for (let i = 0; i < limit && taken(x, y); i++) { x += step; y += step }
  return { x, y }
}

/**
 * A value that changes exactly when the simulation would produce a different result.
 *
 * Used to skip redundant solves. Deliberately excludes everything the
 * solver ignores — node positions, selection, labels — so dragging a node
 * around the canvas does not re-run the sweep.
 *
 * @param {Array<object>} nodes - Graph nodes.
 * @param {Array<object>} edges - Graph edges.
 * @param {object} settings - Sweep settings.
 * @param {object} [extras] - The project sections the editor carries without controls — params, wiring, analyses, probes, components, air.
 * @param {string} [engine] - The engine the result came from.
 * @returns {string} A JSON signature, compared by equality against the last solved one.
 * @pure
 */
function graphSignature(nodes, edges, settings, extras = {}, engine = '') {
  return JSON.stringify([
    nodes.map((n) => [n.id, n.type, n.data.params]),
    edges.map((e) => [e.source, e.sourceHandle, e.target, e.targetHandle]),
    settings.fmin, settings.fmax, settings.npts, settings.voltage, settings.rg, settings.masking,
    settings.nlEnabled,
    extras.params, extras.wiring, extras.analyses, extras.probes, extras.components, extras.air,
    engine,
  ])
}

// Cross-window sync. Every `set` that touches a shared key is mirrored to the
// other windows; `applyingRemote` stops the mirror from echoing back.
//
// A popped-out tab starts muted and only speaks once the main window has sent
// it a snapshot. Without that, its own start-up writes would race across the
// channel and overwrite the project the main window is actually showing.
let applyingRemote = false
let muted = POPOUT

export const useStore = create((rawSet, get) => {
  /**
   * Update state and mirror the shared slice to other windows.
   *
   * Wraps Zustand's setter so cross-window sync happens in exactly one place
   * rather than at every call site. Only keys in `SHARED_KEYS` are broadcast,
   * and only when they were actually touched, so local UI state stays local.
   *
   * `applyingRemote` suppresses the echo when the update *came from* another
   * window, and `muted` keeps a freshly opened popout quiet until the main
   * window has sent it a snapshot — without that, its own start-up writes
   * would race across the channel and overwrite the project the main window
   * is showing.
   *
   * @param {object|Function} partial - State delta, as Zustand accepts it.
   * @param {boolean} [replace] - Replace rather than merge the state.
   * @returns {void}
   * @sideEffect Writes store state and may post a message on the BroadcastChannel.
   * @reads The module-level `applyingRemote` and `muted` flags.
   */
  const set = (partial, replace) => {
    rawSet(partial, replace)
    if (applyingRemote || muted || !channel) return
    // function updaters aren't used in this store, but if one ever is, fall
    // back to mirroring the whole shared slice rather than missing a key
    const touched = typeof partial === 'function' ? SHARED_KEYS : Object.keys(partial)
    const patch = {}
    for (const k of SHARED_KEYS) if (touched.includes(k)) patch[k] = get()[k]
    if (Object.keys(patch).length) channel.postMessage({ type: 'patch', patch })
  }

  return {
  nodes: [],
  edges: [],
  // Derived from whichever workspace file is open — there is no name field to
  // type into any more, because the file's name is the project's name.
  projectName: '',
  // The workspace and which of its files is open in the editor. Both are
  // shared with popped-out windows, so a popped-out file browser shows the
  // same tree the main window does and can act on it.
  workspace: INITIAL_WORKSPACE,
  activeFile: W.listProjects(INITIAL_WORKSPACE)[0] || null,
  // Explorer view state: window-local and unpersisted, deliberately. See the
  // explorer actions below.
  wsSelection: [],
  wsCollapsed: [],
  wsEdit: null,
  fileClipboard: null,
  // Shown once, before the user has anything to lose: where the workspace is
  // kept decides whether it survives the browser being cleared.
  workspacePrompt: needsStorageChoice(),
  // Where the workspace is kept. `folderStatus` is one of:
  //   'off'        in the browser, as it has always been
  //   'connected'  a folder on disk, being written as the user works
  //   'locked'     a folder is remembered, but the browser has not renewed
  //                permission this visit — one click away from connected
  //   'error'      connected, but the last write did not fully land
  // The name is the folder's own, for the explorer to show; `folderSaved` is
  // when the folder last matched the workspace.
  folderStatus: 'off',
  folderName: null,
  folderError: null,
  folderSaved: null,
  selectedNodeId: null,
  results: null,
  metrics: null,
  velocityPopupNodeId: null,
  showDriverDB: false,
  showTSCalc: false,
  saveDriverFor: null,
  settings: {
    fmin: 10, fmax: 1000, npts: 512,
    voltage: 2.83, impedance: 4, power: 2, rg: 0,
    vThreshold: 17, masking: false, unwrapPhase: true, delayOffset: 0,
    nlEnabled: false,
  },
  // The v3 sections outside the node graph — named params, the wiring,
  // analyses, probes, components, air. Edited through `setExtra`; see
  // src/schema/editor.js for how they meet the flat `settings`.
  projectExtras: defaultExtras(),
  // Which engine simulates: a preference of this browser, not of the project.
  engine: loadEngine(),
  // ---- the time-domain workspace ----
  // A full-screen view of its own, replacing the dock while it is open.
  // Results belong to this window and this project; each records the graph
  // signature it was run from, so the view can say when it is out of date.
  tdOpen: false,
  tdTab: 'linear',
  tdJob: null,
  tdError: null,
  tdResults: { linear: null, transient: null, distortion: {} },
  // ---- dockable workspace ----
  // `layout` is the tree from src/layout.js; every mutation goes through
  // layoutOps so persistence happens in exactly one place.
  layout: loadLayout(),
  layoutPresets: loadPresets(),
  maximized: null,          // panel id rendered full-bleed, or null
  focusedPanel: POPOUT ? popoutPanelId() : 'canvas', // which panel owns the keyboard
  draggingPanel: null,      // panel id mid tab-drag (drives the drop targets)
  showSettings: false,      // floating settings window
  settingsSection: 'keyboard',
  clipboard: null,
  // The open context menu, as `{x, y, target}` in viewport coordinates, or
  // null. Only the *target* is recorded — which stack, node or edge was
  // right-clicked — never the menu's contents: what a target offers is a
  // rendering decision, and baking it into state would freeze the menu against
  // any change made while it is open.
  contextMenu: null,

  /**
   * Open the context menu at a point, against whatever was right-clicked.
   *
   * @param {number} x - Viewport x, where the menu's corner goes.
   * @param {number} y - Viewport y.
   * @param {{kind: string}} target - What was right-clicked: `{kind: 'pane'|'node'|'edge'|'stack'|'tab', …}` with the ids that kind needs.
   * @returns {void}
   * @sideEffect Writes store state. The field is local to the window — `SHARED_KEYS` deliberately excludes it, so a right-click does not open a menu in another window.
   */
  openContextMenu: (x, y, target) => set({ contextMenu: { x, y, target } }),
  /**
   * Dismiss the context menu.
   *
   * Guarded against redundant writes: closing is attempted on every click
   * anywhere, and an unconditional write would re-render the workspace on each
   * one.
   *
   * @returns {void}
   * @sideEffect Writes store state, when a menu was open.
   */
  closeContextMenu: () => { if (get().contextMenu) set({ contextMenu: null }) },

  /**
   * Record which panel is mid tab-drag, which drives the drop targets.
   *
   * @param {string|null} id - Panel id, or `null` when the drag ends.
   * @returns {void}
   * @sideEffect Writes store state. The field is local to the window — `SHARED_KEYS` deliberately excludes it, so a popped-out panel keeps its own.
   */
  setDraggingPanel: (id) => set({ draggingPanel: id }),
  /**
   * Give a panel keyboard focus, deciding which scoped commands fire.
   *
   * Guarded against redundant writes because focus changes on every click and
   * an unchanged write would still broadcast.
   *
   * @param {string} id - Panel id.
   * @returns {void}
   * @sideEffect Writes store state. The field is local to the window — `SHARED_KEYS` deliberately excludes it, so a popped-out panel keeps its own.
   */
  focusPanel: (id) => { if (get().focusedPanel !== id) set({ focusedPanel: id }) },
  /**
   * Maximize a panel full-bleed, or restore it if it is already maximized.
   *
   * @param {string|null} id - Panel id to toggle.
   * @returns {void}
   * @sideEffect Writes store state. The field is local to the window — `SHARED_KEYS` deliberately excludes it, so a popped-out panel keeps its own.
   */
  toggleMaximize: (id) => set({ maximized: get().maximized === id ? null : id }),
  /**
   * Open or close the settings window, optionally jumping to a section.
   *
   * @param {boolean} v - Whether to show the window.
   * @param {string} [section] - Section to select. The current section is kept when omitted.
   * @returns {void}
   * @sideEffect Writes store state. The field is local to the window — `SHARED_KEYS` deliberately excludes it, so a popped-out panel keeps its own.
   */
  setShowSettings: (v, section) => set({ showSettings: v, ...(section ? { settingsSection: section } : {}) }),
  /**
   * Switch the settings window to a section.
   *
   * @param {string} id - Section id.
   * @returns {void}
   * @sideEffect Writes store state. The field is local to the window — `SHARED_KEYS` deliberately excludes it, so a popped-out panel keeps its own.
   */
  setSettingsSection: (id) => set({ settingsSection: id }),

  // ---- keyboard bindings ----
  bindings: loadBindings(),
  /**
   * Replace a command's combos wholesale.
   *
   * @param {string} id - Command id.
   * @param {string[]} combos - The command's complete new combo list.
   * @returns {void}
   * @sideEffect Writes store state and persists the bindings to LocalStorage.
   */
  setBinding: (id, combos) => {
    const next = { ...get().bindings, [id]: combos }
    set({ bindings: next })
    saveBindings(next)
  },
  /**
   * Give a command a combo, taking it from whatever held it before.
   *
   * Assigning a combo steals it, the way most editors behave — silently
   * leaving two commands on one key is worse than a visible reassignment, and
   * the caller is told what it took so the UI can say so.
   *
   * @param {string} id - Command receiving the combo.
   * @param {string} combo - The combo being assigned.
   * @returns {string|null} The id of the command the combo was taken from, or `null` when it was free.
   * @sideEffect Writes store state and persists the bindings to LocalStorage.
   */
  assignBinding: (id, combo) => {
    const next = {}
    for (const cid of COMMAND_IDS) next[cid] = [...(get().bindings[cid] || [])]
    const stolenFrom = findConflict(next, combo, id)
    if (stolenFrom) next[stolenFrom] = next[stolenFrom].filter((c) => c !== combo)
    if (!next[id].includes(combo)) next[id] = [...next[id], combo]
    set({ bindings: next })
    saveBindings(next)
    return stolenFrom
  },
  /**
   * Remove one combo from a command, leaving its others in place.
   *
   * @param {string} id - Command id.
   * @param {string} combo - Combo to remove.
   * @returns {void}
   * @sideEffect Writes store state and persists the bindings to LocalStorage.
   */
  removeBinding: (id, combo) => get().setBinding(id, (get().bindings[id] || []).filter((c) => c !== combo)),
  /**
   * Restore every command to its default combos.
   *
   * @returns {void}
   * @sideEffect Writes store state and persists the bindings to LocalStorage, which removes the stored overrides entirely.
   */
  resetBindings: () => {
    const fresh = Object.fromEntries(COMMAND_IDS.map((id) => [id, [...(DEFAULT_BINDINGS[id] || [])]]))
    set({ bindings: fresh })
    saveBindings(fresh)
  },

  /**
   * Adopt a new layout tree and persist it.
   *
   * The single write path for the layout, which is why every operation in
   * `layoutOps` routes through it. A `null` tree — the result of an edit that
   * would have emptied the workspace — is ignored rather than applied.
   *
   * @param {object|null} tree - The new layout tree.
   * @returns {void}
   * @sideEffect Writes store state and LocalStorage. A quota failure is swallowed: the layout simply will not survive a reload.
   */
  _commitLayout: (tree) => {
    if (!tree) return
    set({ layout: tree })
    try {
      localStorage.setItem(LAYOUT_KEY, JSON.stringify({ version: L.LAYOUT_VERSION, tree }))
    } catch { /* quota — the layout just won't survive a reload */ }
  },

  layoutOps: {
    /**
     * Bring a panel to the front of its stack.
     *
     * @param {string} stackId - Stack whose active tab changes.
     * @param {string} panelId - Panel to show.
     * @returns {void}
     * @sideEffect Writes store state and persists the layout.
     */
    activate: (stackId, panelId) => get()._commitLayout(L.setActive(get().layout, stackId, panelId)),
    /**
     * Move a panel onto a target stack.
     *
     * @param {string} panelId - Panel being moved.
     * @param {string} stackId - Stack to dock against.
     * @param {'center'|'left'|'right'|'top'|'bottom'} zone - Where relative to the target.
     * @returns {void}
     * @sideEffect Writes store state and persists the layout.
     */
    dock: (panelId, stackId, zone) => get()._commitLayout(L.dockPanel(get().layout, panelId, stackId, zone)),
    /**
     * Dock a panel against an outer edge of the workspace.
     *
     * @param {string} panelId - Panel being moved.
     * @param {'left'|'right'|'top'|'bottom'} edge - Which edge.
     * @returns {void}
     * @sideEffect Writes store state and persists the layout.
     */
    dockEdge: (panelId, edge) => get()._commitLayout(L.dockToEdge(get().layout, panelId, edge)),
    /**
     * Apply a splitter drag, reweighting two adjacent children.
     *
     * @param {string} splitId - Split being resized.
     * @param {number} index - Index of the child before the splitter.
     * @param {number} a - New weight for that child.
     * @param {number} b - New weight for the next one.
     * @returns {void}
     * @sideEffect Writes store state and persists the layout.
     */
    resize: (splitId, index, a, b) => get()._commitLayout(L.resizeChildren(get().layout, splitId, index, a, b)),
    /**
     * Handle a tab dropped onto another tab.
     *
     * Two different operations share one gesture: dropping within the panel's
     * own stack reorders it, dropping from elsewhere tabs it in. A drop on its
     * own current position does nothing.
     *
     * @param {string} panelId - Panel being dropped.
     * @param {string} stackId - Stack it was dropped on.
     * @param {number} index - Tab position it was dropped at.
     * @returns {void}
     * @sideEffect Writes store state and persists the layout.
     */
    dropOnTab: (panelId, stackId, index) => {
      const tree = get().layout
      const from = L.findPanelStack(tree, panelId)
      if (from?.id === stackId) {
        const cur = from.panels.indexOf(panelId)
        if (cur === index) return
        get()._commitLayout(L.moveTabInStack(tree, stackId, cur, index))
      } else {
        get()._commitLayout(L.dockPanel(tree, panelId, stackId, 'center'))
      }
    },
    /**
     * Close a panel.
     *
     * Panels marked `closable: false` — the canvas, which is the workspace
     * itself — are refused, as is a close that would empty the layout.
     *
     * @param {string} panelId - Panel to close.
     * @returns {void}
     * @sideEffect Writes store state and persists the layout.
     */
    close: (panelId) => {
      if (PANEL_META[panelId]?.closable === false) return
      const next = L.removePanel(get().layout, panelId)
      if (!next) return
      if (get().maximized === panelId) set({ maximized: null })
      get()._commitLayout(next)
    },
    /**
     * Show a panel and give it focus, docking it if it is not already open.
     *
     * Un-maximizes first, since opening a panel behind a maximized one would
     * otherwise appear to do nothing.
     *
     * @param {string} panelId - Panel to show.
     * @returns {void}
     * @sideEffect Writes store state and persists the layout.
     */
    open: (panelId) => {
      set({ maximized: null })
      get()._commitLayout(L.openPanel(get().layout, panelId, PANEL_META[panelId]?.dock))
      get().focusPanel(panelId)
    },
    /**
     * Open a panel, or close it if it is already open. Drives the View menu's checkmarks.
     *
     * @param {string} panelId - Panel to toggle.
     * @returns {void}
     * @sideEffect Writes store state and persists the layout.
     */
    toggle: (panelId) => {
      const ops = get().layoutOps
      if (L.isOpen(get().layout, panelId)) ops.close(panelId)
      else ops.open(panelId)
    },
    /**
     * Restore the default workspace arrangement.
     *
     * @returns {void}
     * @sideEffect Writes store state and persists the layout.
     */
    reset: () => { set({ maximized: null }); get()._commitLayout(L.defaultLayout()) },
  },

  /**
   * Save the current arrangement under a name, replacing any preset with that name.
   *
   * @param {string} name - Preset name.
   * @returns {void}
   * @sideEffect Writes store state and LocalStorage. A quota failure is swallowed.
   */
  saveLayoutPreset: (name) => {
    const presets = [
      ...get().layoutPresets.filter((p) => p.name !== name),
      { name, tree: get().layout },
    ]
    set({ layoutPresets: presets })
    try { localStorage.setItem(PRESETS_KEY, JSON.stringify(presets)) } catch { /* quota */ }
  },
  /**
   * Apply a saved arrangement.
   *
   * The preset is sanitized before use — it may name panels a later build
   * dropped — and the canvas is docked back in if sanitizing removed it, so a
   * stale preset can never leave the workspace without its editor.
   *
   * @param {string} name - Preset name. An unknown name is ignored.
   * @returns {void}
   * @sideEffect Writes store state and persists the layout.
   */
  applyLayoutPreset: (name) => {
    const p = get().layoutPresets.find((x) => x.name === name)
    if (!p) return
    const clean = L.sanitize(p.tree, PANEL_IDS)
    if (!clean) return
    set({ maximized: null })
    get()._commitLayout(L.isOpen(clean, 'canvas') ? clean : L.dockToEdge(clean, 'canvas', 'right'))
  },
  // ---- quick-access bar ----
  toolbar: loadToolbar(),
  /**
   * Replace the quick-bar arrangement.
   *
   * Sanitized on the way in, so an arrangement carrying unknown ids falls
   * back to the default rather than rendering a broken bar. Unknown ids are
   * dropped individually; the fallback fires only when nothing survives, since
   * a non-empty request sanitizing to nothing means the whole arrangement was
   * foreign. An explicitly empty `ids` is honoured — that is a deliberately
   * hidden bar, not corruption.
   *
   * @param {string[]} ids - Item ids in display order. A non-array falls back to the default.
   * @returns {void}
   * @sideEffect Writes store state and LocalStorage. A quota failure is swallowed.
   */
  setToolbar: (ids) => {
    const kept = sanitizeToolbar(ids)
    const clean = !kept || (kept.length === 0 && ids.length > 0) ? DEFAULT_TOOLBAR : kept
    set({ toolbar: clean })
    try { localStorage.setItem(TOOLBAR_KEY, JSON.stringify(clean)) } catch { /* quota */ }
  },
  /**
   * Add an item to the quick bar, or remove it if it is already there.
   *
   * Newly added items go to the end rather than their registry position, so
   * toggling one on does not reshuffle the bar.
   *
   * @param {string} id - Quick-bar item id.
   * @returns {void}
   * @sideEffect Writes store state and persists the toolbar.
   */
  toggleToolbarItem: (id) => {
    const cur = get().toolbar
    get().setToolbar(cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id])
  },
  /**
   * Move an item along the quick bar by swapping it with its neighbour.
   *
   * @param {string} id - Item to move.
   * @param {number} delta - Positions to move by; -1 is left, 1 is right.
   * @returns {void}
   * @sideEffect Writes store state and persists the toolbar. Does nothing when the item is absent or the move would run off either end.
   */
  moveToolbarItem: (id, delta) => {
    const cur = [...get().toolbar]
    const i = cur.indexOf(id)
    const j = i + delta
    if (i < 0 || j < 0 || j >= cur.length) return
    ;[cur[i], cur[j]] = [cur[j], cur[i]]
    get().setToolbar(cur)
  },
  /**
   * Restore the default quick-bar arrangement.
   *
   * @returns {void}
   * @sideEffect Writes store state and persists the toolbar, since it delegates to `setToolbar`. The toolbar is local to the window; `SHARED_KEYS` excludes it.
   */
  resetToolbar: () => get().setToolbar(DEFAULT_TOOLBAR),

  /**
   * Delete a saved arrangement.
   *
   * @param {string} name - Preset name.
   * @returns {void}
   * @sideEffect Writes store state and LocalStorage.
   */
  deleteLayoutPreset: (name) => {
    const presets = get().layoutPresets.filter((p) => p.name !== name)
    set({ layoutPresets: presets })
    try { localStorage.setItem(PRESETS_KEY, JSON.stringify(presets)) } catch { /* quota */ }
  },

  // per-chart X-axis zoom (drag-select on the plots); not persisted
  xZoom: {},
  /**
   * Store one chart's X-axis zoom range, set by drag-selecting on the plot.
   *
   * Not persisted: zoom is a transient view of the current result.
   *
   * @param {string} id - Chart panel id.
   * @param {[number, number]|null} range - Frequency range, or `null` to reset.
   * @returns {void}
   * @sideEffect Writes store state, mirrored to other windows.
   */
  setXZoom: (id, range) => set({ xZoom: { ...get().xZoom, [id]: range } }),
  history: [],
  future: [],

  // ---- history ----
  /**
   * Record the current graph as an undo point.
   *
   * Called before a mutation rather than after, so the entry is the state to
   * return *to*. Deep-copies nodes and edges, since undo must not hand back
   * objects a later edit has since mutated. Pushing clears the redo stack,
   * which is the standard linear-history behaviour.
   *
   * @returns {void}
   * @sideEffect Writes store state. The history is capped at 80 entries, oldest discarded.
   */
  pushHistory: () => {
    const { nodes, edges, history, projectExtras } = get()
    const snap = JSON.parse(JSON.stringify({ nodes, edges, projectExtras }))
    // slice to one *below* the limit: the new entry is about to take the last
    // slot, so trimming to the limit first would leave 81.
    set({ history: [...history.slice(-(HISTORY_LIMIT - 1)), snap], future: [] })
  },
  /**
   * Step back one entry in the history.
   *
   * @returns {void}
   * @sideEffect Writes store state and schedules a resimulation. Does nothing when the history is empty.
   */
  undo: () => {
    const { history, future, nodes, edges, projectExtras } = get()
    if (!history.length) return
    const prev = history[history.length - 1]
    set({
      nodes: prev.nodes, edges: prev.edges,
      history: history.slice(0, -1),
      future: [...future, { nodes, edges, projectExtras }],
    })
    if (prev.projectExtras) get()._setExtras(prev.projectExtras)
    get().scheduleCompute()
  },
  /**
   * Step forward one entry in the history.
   *
   * @returns {void}
   * @sideEffect Writes store state and schedules a resimulation. Does nothing when the redo stack is empty.
   */
  redo: () => {
    const { history, future, nodes, edges, projectExtras } = get()
    if (!future.length) return
    const next = future[future.length - 1]
    set({
      nodes: next.nodes, edges: next.edges,
      future: future.slice(0, -1),
      history: [...history, { nodes, edges, projectExtras }],
    })
    if (next.projectExtras) get()._setExtras(next.projectExtras)
    get().scheduleCompute()
  },

  // ---- react-flow handlers ----
  /**
   * Apply React Flow's node changes — drags, selections, removals.
   *
   * Only removals schedule a resimulation: moving or selecting a node cannot
   * change the result, and re-solving on every frame of a drag would be
   * wasteful. Note that this does not push history, because it fires
   * continuously during a drag.
   *
   * @param {Array<object>} changes - React Flow change descriptors.
   * @returns {void}
   * @sideEffect Writes store state, and schedules a resimulation when a node was removed.
   */
  onNodesChange: (changes) => {
    set({ nodes: applyNodeChanges(changes, get().nodes) })
    if (changes.some((c) => c.type === 'remove')) get().scheduleCompute()
  },
  /**
   * Apply React Flow's edge changes.
   *
   * Removals push history and schedule a resimulation, since deleting an edge
   * changes the topology.
   *
   * @param {Array<object>} changes - React Flow change descriptors.
   * @returns {void}
   * @sideEffect Writes store state, and on removal records history and schedules a resimulation.
   */
  onEdgesChange: (changes) => {
    if (changes.some((c) => c.type === 'remove')) get().pushHistory()
    set({ edges: applyEdgeChanges(changes, get().edges) })
    if (changes.some((c) => c.type === 'remove')) get().scheduleCompute()
  },
  /**
   * Add an edge from a completed port-to-port drag.
   *
   * @param {object} conn - React Flow connection: source, sourceHandle, target, targetHandle.
   * @returns {void}
   * @sideEffect Records history, writes store state and schedules a resimulation. Does nothing when the same two handles are already joined, in either order.
   */
  onConnect: (conn) => {
    // Connections have no direction, so a join already made the other way
    // round is the same join.
    const same = get().edges.some((e) =>
      (e.source === conn.source && e.sourceHandle === conn.sourceHandle && e.target === conn.target && e.targetHandle === conn.targetHandle)
      || (e.source === conn.target && e.sourceHandle === conn.targetHandle && e.target === conn.source && e.targetHandle === conn.sourceHandle))
    if (same) return
    get().pushHistory()
    set({ edges: addEdge({ ...conn, type: 'default' }, get().edges) })
    get().scheduleCompute()
  },
  /**
   * Select a node, which drives what the Parameters panel edits.
   *
   * @param {string|null} id - Node id, or `null` to clear.
   * @returns {void}
   * @sideEffect Writes store state, mirrored to other windows.
   */
  setSelected: (id) => set({ selectedNodeId: id }),

  /**
   * Add a node of the given type at a canvas position.
   *
   * The new node arrives selected — and alone in the selection — so it can be
   * copied, nudged or deleted straight away without clicking it first.
   *
   * @param {string} type - Node type; its entry in `DEFAULT_PARAMS` supplies the initial params.
   * @param {{x: number, y: number}} position - Canvas position.
   * @returns {string} The new node's id, so callers can immediately update its params.
   * @sideEffect Records history, writes store state and schedules a resimulation.
   */
  addNode: (type, position) => {
    get().pushHistory()
    const id = nextId(type)
    const params = JSON.parse(JSON.stringify(DEFAULT_PARAMS[type]))
    // A new node arrives selected — and alone in the selection — so it can be
    // copied, nudged or deleted straight away without clicking it first.
    const node = { id, type, position, data: { params }, selected: true }
    set({
      nodes: [...get().nodes.map((n) => (n.selected ? { ...n, selected: false } : n)), node],
      edges: get().edges.some((e) => e.selected)
        ? get().edges.map((e) => (e.selected ? { ...e, selected: false } : e))
        : get().edges,
      selectedNodeId: id,
    })
    get().scheduleCompute()
    return id
  },

  /**
   * Write a complete parameter set onto a driver and make it the starting point.
   *
   * This is the authoritative path — the database and the T/S solver both
   * hand over a whole consistent set — so it is also where a driver's
   * baseline is recorded. Restoring later comes back to exactly here.
   *
   * @param {string} id - Driver node id. An unknown id is a no-op.
   * @param {object} params - The parameters to write.
   * @returns {void}
   * @sideEffect Writes store state and schedules a resimulation.
   */
  applyDriverParams: (id, params) => {
    const node = get().nodes.find((n) => n.id === id)
    if (!node) return
    const merged = { ...node.data.params, ...params }
    set({
      nodes: get().nodes.map((n) => (n.id === id
        ? { ...n, data: { ...n.data, params: merged, baseline: D.pickTS(merged) } }
        : n)),
    })
    get().scheduleCompute()
  },

  /**
   * Put a driver back to the parameters it started from.
   *
   * The starting point is whatever the database or the solver last wrote,
   * or — for a driver that has only ever been edited by hand — the values it
   * held before the first of those edits.
   *
   * Only the driver's own fields are restored. The node's label, its array
   * count and its loss settings say how the driver is being used rather than
   * what it is, so they survive.
   *
   * @param {string} id - Driver node id. An unknown id, or one with no recorded starting point, is a no-op.
   * @returns {void}
   * @sideEffect Writes store state and schedules a resimulation.
   */
  restoreDriverParams: (id) => {
    const node = get().nodes.find((n) => n.id === id)
    const base = node && D.baselineOf(node)
    if (!base) return
    get().updateParams(id, base)
  },

  /**
   * Store a driver node's parameters in the workspace's custom library.
   *
   * The name is asked for rather than taken from the node's label, because a
   * node is named for its place in a design — "left woofer" — and a library
   * entry is named for the driver. Saving under a name already in the
   * library replaces that entry rather than adding a second one under the
   * same name.
   *
   * @param {string} id - Driver node id. An unknown id, or a node that is not a driver, is a no-op.
   * @param {string} name - Name to file it under. Blank names are a no-op.
   * @returns {void}
   * @sideEffect Writes the workspace, creating its system folder if this is the first thing stored there.
   */
  saveDriverAsCustom: (id, name) => {
    const node = get().nodes.find((n) => n.id === id)
    const model = (name || '').trim()
    if (!node || node.type !== 'driver' || !model) return
    const entry = { brand: 'Custom', model, source: 'custom', ...D.pickTS(node.data.params) }
    const drivers = W.readDrivers(get().workspace)
    const at = drivers.findIndex((d) => d.model === model)
    get().setCustomDrivers(at < 0
      ? [...drivers, entry]
      : drivers.map((d, i) => (i === at ? entry : d)))
  },

  /**
   * Set one coupled T/S parameter on a driver, letting the rest follow.
   *
   * A driver's eleven T/S figures are six free values and five consequences,
   * so writing one on its own would leave the set contradicting itself. The
   * node's basis says which six the user is holding; everything outside it is
   * recomputed here from the edit.
   *
   * A parameter outside the basis is not editable through this path, and an
   * edit that leaves the set unsolvable — a zero or a negative, say — writes
   * the typed value alone rather than a set of NaNs.
   *
   * @param {string} id - Driver node id. An unknown id is a no-op.
   * @param {string} field - Parameter name.
   * @param {number} value - New value in display units.
   * @returns {void}
   * @sideEffect Writes store state and schedules a resimulation.
   */
  setDriverParam: (id, field, value) => {
    const node = get().nodes.find((n) => n.id === id)
    if (!node) return
    get()._markDriverBaseline(id)
    if (!D.COUPLED.includes(field)) { get().updateParams(id, { [field]: value }); return }
    const basis = D.basisOf(node)
    if (!basis.includes(field)) return
    const { ok, values } = D.derive({ ...node.data.params, [field]: value }, basis)
    get().updateParams(id, ok ? { ...values, [field]: value } : { [field]: value })
  },

  /**
   * Record a driver's current parameters as its starting point, once.
   *
   * A driver that arrived from the database or the solver already has one.
   * This covers the other case: a driver being edited by hand for the first
   * time, whose starting point is whatever it held just before that edit.
   * Called before the edit lands, and a no-op every time after.
   *
   * @param {string} id - Driver node id. An unknown id is a no-op.
   * @returns {void}
   * @sideEffect Writes store state. Does not schedule a resimulation — the baseline is not part of the graph.
   */
  _markDriverBaseline: (id) => {
    const node = get().nodes.find((n) => n.id === id)
    if (!node || D.baselineOf(node)) return
    set({
      nodes: get().nodes.map((n) => (n.id === id
        ? { ...n, data: { ...n.data, baseline: D.pickTS(n.data.params) } } : n)),
    })
  },

  /**
   * Hold or release one of a driver's T/S parameters.
   *
   * Exactly six can be held at once, so taking hold of a seventh releases
   * whichever was held longest, and releasing one promotes another to take
   * its place. The swap is chosen so that the six still determine the other
   * five — releasing Qes while Qts and Qms are both held, for instance, has
   * no valid replacement and is refused rather than silently accepted.
   *
   * Held values are left exactly as they are and only the rest are recomputed,
   * so changing which parameters you control leaves the driver as it was — to
   * the six figures derived values are kept to.
   *
   * @param {string} id - Driver node id. An unknown id is a no-op.
   * @param {string} field - Parameter name. One outside the coupled set is a no-op.
   * @param {boolean} held - Whether to hold it.
   * @returns {void}
   * @sideEffect Writes store state and schedules a resimulation. Does nothing when no valid swap exists.
   */
  setDriverLock: (id, field, held) => {
    const node = get().nodes.find((n) => n.id === id)
    if (!node || !D.COUPLED.includes(field)) return
    const basis = D.basisOf(node)
    const next = held ? D.lockParam(basis, field) : D.unlockParam(basis, field)
    if (!next) return
    get()._markDriverBaseline(id)
    const { ok, values } = D.derive(node.data.params, next)
    set({
      nodes: get().nodes.map((n) => (n.id === id
        ? { ...n, data: { ...n.data, locks: next, params: ok ? { ...n.data.params, ...values } : n.data.params } }
        : n)),
    })
    if (ok) get().scheduleCompute()
  },

  /**
   * Merge a patch into one node's parameters.
   *
   * @param {string} id - Node id. An unknown id is a no-op.
   * @param {object} patch - Parameters to merge over the node's existing ones.
   * @returns {void}
   * @sideEffect Writes store state and schedules a resimulation.
   */
  updateParams: (id, patch) => {
    const nodes = get().nodes
    // Return before writing rather than mapping to an identical list: `set`
    // installs a fresh array either way, which re-renders every node and
    // schedules a resimulation for an edit that changed nothing.
    if (!nodes.some((n) => n.id === id)) return
    set({
      nodes: nodes.map((n) =>
        n.id === id ? { ...n, data: { ...n.data, params: { ...n.data.params, ...patch } } } : n),
    })
    get().scheduleCompute()
  },

  /**
   * Delete the selected nodes and edges.
   *
   * Edges attached to a deleted node go with it, whether or not they were
   * themselves selected — leaving a dangling edge would corrupt the graph.
   * So do the deleted drivers' places in the wiring and any probes on the
   * deleted nodes.
   *
   * @returns {void}
   * @sideEffect Records history, writes store state and schedules a resimulation. Does nothing when the selection is empty.
   */
  deleteSelected: () => {
    const { nodes, edges } = get()
    const selNodes = nodes.filter((n) => n.selected).map((n) => n.id)
    const selEdges = edges.filter((e) => e.selected).map((e) => e.id)
    if (!selNodes.length && !selEdges.length) return
    get().pushHistory()
    const kept = nodes.filter((n) => !n.selected)
    set({
      nodes: kept,
      edges: edges.filter((e) => !e.selected && !selNodes.includes(e.source) && !selNodes.includes(e.target)),
      selectedNodeId: null,
    })
    if (selNodes.length) get()._setExtras(pruneExtras(get().projectExtras, kept.map((n) => n.id)))
    get().scheduleCompute()
  },

  /**
   * Copy the selected nodes in place, offset down-right.
   *
   * Deep-copies each node's params so the duplicate is independent, and moves
   * the selection to the copies — matching the usual expectation that what
   * you just created is what you are now holding. Edges are not duplicated;
   * `copySelection` and `pasteClipboard` are the path that preserves them.
   *
   * @returns {void}
   * @sideEffect Records history, writes store state and schedules a resimulation. Does nothing when the selection is empty.
   */
  duplicateSelected: () => {
    const { nodes } = get()
    const sel = nodes.filter((n) => n.selected)
    if (!sel.length) return
    get().pushHistory()
    const copies = sel.map((n) => ({
      ...n,
      id: nextId(n.type),
      position: { x: n.position.x + 40, y: n.position.y + 40 },
      selected: false,
      data: { params: JSON.parse(JSON.stringify(n.data.params)) },
    }))
    set({
      nodes: [...nodes.map((n) => ({ ...n, selected: false })), ...copies.map((c) => ({ ...c, selected: true }))],
      selectedNodeId: copies[copies.length - 1].id,
    })
    get().scheduleCompute()
  },

  /**
   * Select every node on the canvas.
   *
   * @returns {void}
   * @sideEffect Writes store state, mirrored to other windows.
   */
  selectAll: () => set({ nodes: get().nodes.map((n) => ({ ...n, selected: true })) }),

  /**
   * Replace — or extend — the node selection.
   *
   * The write path for the right-drag marquee. `selectedNodeId`, which is what
   * the Parameters panel edits, follows the last node in the new selection, so
   * lassoing a group leaves something concrete to edit rather than an empty
   * panel. An empty selection clears it.
   *
   * @param {string[]} ids - Node ids to select.
   * @param {boolean} [additive=false] - Keep the existing selection and add to it, which is what a modifier-held lasso means.
   * @returns {void}
   * @sideEffect Writes store state, mirrored to other windows. Does not record history — selection is not an edit.
   */
  setSelection: (ids, additive = false) => {
    const want = new Set(ids)
    const nodes = get().nodes.map((n) => {
      const selected = want.has(n.id) || (additive && !!n.selected)
      return n.selected === selected ? n : { ...n, selected }
    })
    const last = nodes.filter((n) => n.selected).pop()
    set({ nodes, selectedNodeId: last ? last.id : null })
  },

  // ---- clipboard ----
  // An in-app clipboard rather than the system one: the graph is a structure,
  // not text, and reading the system clipboard needs a permission prompt on
  // every paste. It rides the sync channel, so you can copy in the main window
  // and paste into a popped-out Node Editor.
  /**
   * Copy the selected nodes and their internal edges to the in-app clipboard.
   *
   * An in-app clipboard rather than the system one: the graph is a structure,
   * not text, and reading the system clipboard needs a permission prompt on
   * every paste. It rides the sync channel, so you can copy in the main
   * window and paste into a popped-out Node Editor.
   *
   * Only edges wholly inside the selection are taken — a dangling half-edge
   * would have nothing to reconnect to on paste.
   *
   * An empty selection leaves the previous clipboard in place rather than
   * clearing it, so a stray copy with nothing selected cannot lose what you
   * copied a moment ago. There is no action that empties the clipboard.
   *
   * @returns {number} How many nodes were copied; 0 when the selection was empty.
   * @sideEffect Writes store state, mirrored to other windows.
   */
  copySelection: () => {
    const { nodes, edges } = get()
    const sel = nodes.filter((n) => n.selected)
    if (!sel.length) return 0
    const ids = new Set(sel.map((n) => n.id))
    set({
      clipboard: {
        nodes: sel.map((n) => ({ type: n.type, id: n.id, position: { ...n.position }, params: JSON.parse(JSON.stringify(n.data.params)) })),
        // only edges wholly inside the selection: a dangling half-edge would
        // have nothing to reconnect to on paste
        edges: edges
          .filter((e) => ids.has(e.source) && ids.has(e.target))
          .map((e) => ({ source: e.source, sourceHandle: e.sourceHandle, target: e.target, targetHandle: e.targetHandle })),
      },
    })
    return sel.length
  },
  /**
   * Copy the selection, then delete it.
   *
   * Deletes only if the copy found something, so an empty selection cannot
   * delete anything.
   *
   * @returns {void}
   * @sideEffect Records history, writes store state and schedules a resimulation.
   */
  cutSelection: () => {
    if (!get().copySelection()) return
    get().deleteSelected()
  },
  /**
   * Paste the clipboard as new nodes, at a point or offset down-right.
   *
   * Every pasted node gets a fresh id, and the copied edges are rewired
   * through a remap table so they connect the copies rather than the
   * originals. Params are merged over the current defaults, so pasting into a
   * newer build fills in any parameter added since the copy was made.
   *
   * With a position — what the canvas's right-click Paste supplies — the whole
   * copied group is translated so its top-left corner lands there, preserving
   * the relative arrangement. Without one it lands offset from the original,
   * which is what a keyboard paste has always done.
   *
   * @param {{x: number, y: number}} [at] - Canvas position for the group's top-left corner.
   * @returns {void}
   * @sideEffect Records history, writes store state and schedules a resimulation. Does nothing when the clipboard is empty.
   */
  pasteClipboard: (at) => {
    const clip = get().clipboard
    if (!clip?.nodes?.length) return
    get().pushHistory()
    // A single offset for the whole group, so pasting keeps the shape of what
    // was copied rather than collapsing every node onto the cursor.
    const dx = at ? at.x - Math.min(...clip.nodes.map((n) => n.position.x)) : 40
    const dy = at ? at.y - Math.min(...clip.nodes.map((n) => n.position.y)) : 40
    const remap = {}
    const fresh = clip.nodes.map((n) => {
      const id = nextId(n.type)
      remap[n.id] = id
      return {
        id,
        type: n.type,
        position: { x: n.position.x + dx, y: n.position.y + dy },
        selected: true,
        data: { params: JSON.parse(JSON.stringify({ ...DEFAULT_PARAMS[n.type], ...n.params })) },
      }
    })
    const freshEdges = clip.edges.map((e) => ({
      id: `e_${remap[e.source]}_${remap[e.target]}_${Math.random().toString(36).slice(2, 7)}`,
      source: remap[e.source], sourceHandle: e.sourceHandle,
      target: remap[e.target], targetHandle: e.targetHandle,
    }))
    set({
      nodes: [...get().nodes.map((n) => ({ ...n, selected: false })), ...fresh],
      edges: [...get().edges, ...freshEdges],
      selectedNodeId: fresh[fresh.length - 1].id,
    })
    get().scheduleCompute()
  },

  // ---- keyboard-driven placement ----
  // Set by FlowCanvas so a keyboard-added node can land under the pointer
  // rather than at a fixed spot.
  _flowApi: null,
  /**
   * Add a node under the pointer, or at a default spot when it is off-canvas.
   *
   * The canvas registers `_flowApi` so a keyboard-added node lands where the
   * user is looking rather than at a fixed position. Overlapping nodes are
   * stepped down-right by `freeSpotNear`.
   *
   * @param {string} type - Node type to add.
   * @returns {string} The new node's id.
   * @sideEffect Reads the live React Flow viewport, records history, writes store state and schedules a resimulation.
   */
  addNodeAtCursor: (type) => {
    const api = get()._flowApi
    const spot = api?.dropPoint?.() || { x: 80, y: 80 }
    return get().addNode(type, freeSpotNear(spot, get().nodes))
  },

  /**
   * Change the drive voltage by a fixed step, for the keyboard shortcuts.
   *
   * Clamped at zero and rounded to two decimals so repeated nudges do not
   * accumulate floating-point drift into the displayed value.
   *
   * @param {number} delta - Change in volts; negative lowers.
   * @returns {void}
   * @sideEffect Writes store state and schedules a resimulation.
   */
  nudgeVoltage: (delta) => {
    const v = Math.max(0, Math.round((get().settings.voltage + delta) * 100) / 100)
    get().setAmp('voltage', v)
  },
  /**
   * Force a resimulation even though nothing has changed.
   *
   * Clears the cached graph signature, which is what normally suppresses a
   * redundant solve.
   *
   * @returns {void}
   * @sideEffect Writes store state and schedules a resimulation.
   */
  recomputeNow: () => {
    useStore.setState({ _lastSig: '' })
    get().scheduleCompute()
  },

  // ---- settings / amplifier ----
  /**
   * Merge a patch into the sweep settings.
   *
   * @param {object} patch - Settings to merge.
   * @returns {void}
   * @sideEffect Writes store state and schedules a resimulation.
   */
  updateSettings: (patch) => {
    set({ settings: { ...get().settings, ...patch } })
    if ('rg' in patch) {
      const w = get().projectExtras.wiring
      const ch = w?.channels?.[0]
      if (ch && typeof ch.outputOhms !== 'string') {
        get()._setExtras({ ...get().projectExtras, wiring: { ...w, channels: [{ ...ch, outputOhms: Number(patch.rg) || 0 }, ...w.channels.slice(1)] } })
      }
    }
    get().scheduleCompute()
  },
  /**
   * Set one amplifier field and re-derive the others from P = V²/Z.
   *
   * Voltage, impedance and power are three views of one setting, so editing
   * any one has to update the rest. Which field was edited decides what is
   * derived: it is the field the user typed in that stays exactly as typed.
   *
   * @param {'voltage'|'impedance'|'power'} field - The field that was edited.
   * @param {number} value - Its new value.
   * @returns {void}
   * @sideEffect Writes store state and schedules a resimulation.
   */
  setAmp: (field, value) => {
    const s = { ...get().settings }
    s[field] = value
    if (field === 'voltage') s.power = (value * value) / s.impedance
    else if (field === 'impedance') s.power = (s.voltage * s.voltage) / value
    else if (field === 'power') s.voltage = Math.sqrt(value * s.impedance)
    // The typed figure stays exactly as typed; the master moves to match it.
    const ex = get().projectExtras
    set(field === 'impedance' ? { settings: s } : { settings: s, projectExtras: { ...ex, wiring: masterForVoltage(ex.wiring, ex.params, s.voltage) } })
    get().scheduleCompute()
  },

  // ---- project sections beyond the graph ----
  /**
   * Install new extra project sections, keeping the flat drive settings in step.
   *
   * The toolbar and keyboard show the first channel's output at the master
   * level; whenever the wiring changes, that figure is re-derived from it.
   *
   * @param {object} extras - The new extras.
   * @returns {void}
   * @sideEffect Writes store state. Does not resimulate; callers do.
   */
  _setExtras: (extras) => {
    const { voltage, rg } = driveOf(extras.wiring, extras.params)
    const s = get().settings
    const settings = Number.isFinite(voltage)
      ? { ...s, voltage, rg, power: (voltage * voltage) / (s.impedance || 4) }
      : s
    set({ projectExtras: extras, settings })
  },
  /**
   * Replace one extra project section — `wiring`, `params`, `probes`.
   *
   * Structural edits are undoable. Value edits typed a keystroke at a time
   * pass `undoable: false`, as node parameter edits do, so one typed number
   * is not twenty undo steps.
   *
   * @param {string} key - The section.
   * @param {*} value - Its new content.
   * @param {boolean} [undoable=true] - Record a history entry first.
   * @returns {void}
   * @sideEffect Records history when undoable, writes store state and schedules a resimulation.
   */
  setExtra: (key, value, undoable = true) => {
    if (undoable) get().pushHistory()
    get()._setExtras({ ...get().projectExtras, [key]: value })
    get().scheduleCompute()
  },
  /**
   * Replace a chamber's or waveguide's taps, removing edges to taps that are gone.
   *
   * @param {string} id - Node id.
   * @param {Array<{id: string, position: number|string}>} taps - The new list.
   * @returns {void}
   * @sideEffect Records history, writes store state and schedules a resimulation.
   */
  setTaps: (id, taps) => {
    get().pushHistory()
    const live = new Set(taps.map((t) => `tap:${t.id}`))
    /**
     * Whether an edge end is a tap on this node that no longer exists.
     *
     * @param {string} node - Node id at that end.
     * @param {string} handle - Handle at that end.
     * @returns {boolean} True when the end has lost its tap.
     * @reads the enclosing node id and live tap set.
     */
    const gone = (node, handle) => node === id && handle?.startsWith('tap:') && !live.has(handle)
    set({
      nodes: get().nodes.map((n) => (n.id === id ? { ...n, data: { ...n.data, params: { ...n.data.params, taps } } } : n)),
      edges: get().edges.filter((e) => !gone(e.source, e.sourceHandle) && !gone(e.target, e.targetHandle)),
    })
    get().scheduleCompute()
  },
  /**
   * Put a chamber between a driver face and the smaller opening it meets.
   *
   * What the throat-chamber warning offers: the new chamber takes over the
   * face's joins, sized by default to the cone area times 3 cm of depth,
   * placed between the two clear of other nodes, and left selected to be
   * refined — by hand or with the calculator.
   *
   * @param {string} driverId - The driver node.
   * @param {'front'|'rear'} face - The face that meets the small opening.
   * @returns {string|null} The new chamber's id, or `null` when the face has nothing joined to it.
   * @sideEffect Records history, writes store state and schedules a resimulation.
   */
  insertThroatChamber: (driverId, face) => {
    const { nodes, edges } = get()
    const drv = nodes.find((n) => n.id === driverId)
    const joined = edges.filter((e) => (e.source === driverId && e.sourceHandle === face) || (e.target === driverId && e.targetHandle === face))
    if (!drv || !joined.length) return null
    get().pushHistory()
    const id = nextId('chamber')
    const p = drv.data.params
    const sd = (Number(p.Sd) || 500) * Math.max(1, Number(p.count) || 1)
    const params = { ...JSON.parse(JSON.stringify(DEFAULT_PARAMS.chamber)), label: 'Throat chamber', volume: Math.round(sd * 3) / 1000, length: 5 }
    // Halfway to what the face met, nudged clear of anything already there.
    const far = nodes.find((n) => n.id === (joined[0].source === driverId ? joined[0].target : joined[0].source))
    const mid = far ? { x: (drv.position.x + far.position.x) / 2, y: (drv.position.y + far.position.y) / 2 + 120 } : { x: drv.position.x + 220, y: drv.position.y + 120 }
    const position = freeSpotNear(mid, nodes, 120)
    const rewired = edges.map((e) => {
      if (!joined.includes(e)) return e
      return e.source === driverId
        ? { ...e, id: `e_${id}_${e.target}`, source: id, sourceHandle: 'out' }
        : { ...e, id: `e_${e.source}_${id}`, target: id, targetHandle: 'out' }
    })
    set({
      nodes: [...nodes.map((n) => ({ ...n, selected: false })), { id, type: 'chamber', position, data: { params }, selected: true }],
      edges: [...rewired, { id: `e_${driverId}_${id}`, source: driverId, sourceHandle: face, target: id, targetHandle: 'in' }],
      selectedNodeId: id,
    })
    get().scheduleCompute()
    return id
  },
  /**
   * Add a probe, with a fresh id.
   *
   * @param {object} probe - `{kind, at, label?}`.
   * @returns {string} The new probe's id.
   * @sideEffect Records history, writes store state and schedules a resimulation.
   */
  addProbe: (probe) => {
    const probes = get().projectExtras.probes || []
    const id = freshId('probe', probes.map((p) => p.id))
    get().setExtra('probes', [...probes, { id, ...probe }])
    return id
  },

  // ---- snapshots (compare mode) ----
  //
  // Snapshots belong to the workspace, not to a project. Comparing a design
  // against a reference is nearly always comparing it against a design in
  // *another file* — the sealed version of the box you are now porting — so a
  // snapshot that vanished when you opened that file would disappear exactly
  // when it became useful. They persist until the user removes them, survive
  // reloads, and travel with a downloaded workspace.

  /**
   * Freeze the current result as a labelled reference overlay.
   *
   * Capped at three, which is as many as the charts can overlay legibly. Only
   * the plotted series are kept, not the whole result — a snapshot is a
   * picture to compare against, not a project you could reopen.
   *
   * The colour is the first one no live snapshot is using rather than one
   * fixed by position, so removing the middle overlay and taking another does
   * not produce two of the same colour.
   *
   * @returns {void}
   * @sideEffect Writes the workspace and persists it. Does nothing without a successful result, or once three snapshots exist.
   */
  takeSnapshot: () => {
    const { results, workspace, projectName } = get()
    if (!results || !results.ok) return
    const snapshots = W.readSnapshots(workspace)
    if (snapshots.length >= SNAPSHOT_LIMIT) return

    const used = new Set(snapshots.map((s) => s.color))
    const taken = new Set(snapshots.map((s) => s.label))
    // Snapshots outlive the project they came from, so the project's name is
    // the label — it is the only thing that says what you are looking at once
    // three of them are on one chart.
    let label = projectName || 'Snapshot'
    for (let n = 2; taken.has(label); n++) label = `${projectName || 'Snapshot'} ${n}`

    get()._commitWorkspace(W.writeSnapshots(workspace, [...snapshots, {
      id: Date.now(),
      label,
      project: projectName,
      taken: new Date().toISOString(),
      color: SNAPSHOT_COLORS.find((c) => !used.has(c)) || SNAPSHOT_COLORS[0],
      freqs: results.freqs,
      splCombined: results.splCombined,
      zinMag: results.zinMag,
      excursion: results.excursion,
      excursionRatio: results.excursionRatio,
      groupDelay: results.groupDelay,
      power: results.power,
    }]))
  },
  /**
   * Discard a reference overlay.
   *
   * @param {number} id - Snapshot id.
   * @returns {void}
   * @sideEffect Writes the workspace and persists it.
   */
  removeSnapshot: (id) => {
    const ws = get().workspace
    get()._commitWorkspace(W.writeSnapshots(ws, W.readSnapshots(ws).filter((s) => s.id !== id)))
  },
  /**
   * Relabel a reference overlay.
   *
   * @param {number} id - Snapshot id.
   * @param {string} label - New label.
   * @returns {void}
   * @sideEffect Writes the workspace and persists it.
   */
  renameSnapshot: (id, label) => {
    const ws = get().workspace
    get()._commitWorkspace(W.writeSnapshots(ws, W.readSnapshots(ws).map((s) => (s.id === id ? { ...s, label } : s))))
  },

  // ---- UI toggles ----
  /**
   * Open or close the port-velocity popup for a waveguide node.
   *
   * @param {string|null} id - Waveguide node id, or `null` to close.
   * @returns {void}
   * @sideEffect Writes store state, mirrored to other windows.
   */
  setVelocityPopup: (id) => set({ velocityPopupNodeId: id }),
  /**
   * Show or hide the driver database modal.
   *
   * @param {boolean} v - Whether to show it.
   * @returns {void}
   * @sideEffect Writes store state. The field is local to the window — `SHARED_KEYS` deliberately excludes it, so a popped-out panel keeps its own.
   */
  setShowDriverDB: (v) => set({ showDriverDB: v }),
  /**
   * Show or hide the Thiele/Small parameter solver.
   *
   * @param {boolean} v - Whether to show it.
   * @returns {void}
   * @sideEffect Writes store state. The field is local to the window — `SHARED_KEYS` deliberately excludes it, so a popped-out panel keeps its own.
   */
  setShowTSCalc: (v) => set({ showTSCalc: v }),
  /**
   * Open the save-to-database prompt for one driver node, or close it.
   *
   * @param {string|null} id - Driver node id, or `null` to close.
   * @returns {void}
   * @sideEffect Writes store state. The field is local to the window — `SHARED_KEYS` deliberately excludes it, so a popped-out panel keeps its own.
   */
  setSaveDriverFor: (id) => set({ saveDriverFor: id }),
  /**
   * Choose which engine simulates, remember it, and resimulate.
   *
   * @param {string} engine - One of the pipeline's `ENGINES`; anything else is ignored.
   * @returns {void}
   * @sideEffect Writes LocalStorage and store state, and schedules a resimulation.
   */
  setEngine: (engine) => {
    if (!ENGINES.includes(engine)) return
    try { localStorage.setItem(ENGINE_KEY, engine) } catch { /* storage unavailable */ }
    set({ engine })
    get().scheduleCompute()
  },

  // ---- time domain ----
  /**
   * Open the time-domain workspace, optionally at a tab.
   *
   * @param {string} [tab] - `linear`, `transient`, `distortion` or `nonlinear`.
   * @returns {void}
   * @sideEffect Starts and warms the simulation thread pool; writes store state.
   */
  openTimeDomain: (tab) => {
    // Load an engine on every thread now, so the first run need not wait.
    if (typeof Worker !== 'undefined') getPool().warm()
    set({ tdOpen: true, ...(tab ? { tdTab: tab } : {}) })
  },
  /**
   * Return to the editor. A running job carries on.
   *
   * @returns {void}
   * @sideEffect Writes store state.
   */
  closeTimeDomain: () => set({ tdOpen: false }),
  /**
   * Show one tab of the time-domain workspace.
   *
   * @param {string} tab - The tab.
   * @returns {void}
   * @sideEffect Writes store state.
   */
  setTdTab: (tab) => set({ tdTab: tab }),
  /**
   * Change the project's time-domain settings for one section.
   *
   * @param {'linear'|'transient'|'distortion'} section - Which.
   * @param {object} patch - Fields to merge.
   * @returns {void}
   * @sideEffect Writes the project's analyses; does not start a run.
   */
  setTdSettings: (section, patch) => {
    const ex = get().projectExtras
    const cur = tdSettingsOf(ex)
    const others = (ex.analyses || []).filter((x) => x.type !== 'timedomain')
    const base = (ex.analyses || []).find((x) => x.type === 'timedomain') || { id: 'timedomain', type: 'timedomain' }
    const next = { ...base, [section]: { ...cur[section], ...patch } }
    set({ projectExtras: { ...ex, analyses: [...others, next] } })
    get().saveActiveFile()
  },
  /**
   * The signature of what a time-domain result depends on — the graph, the extras and the engine.
   *
   * @returns {string} A signature to compare results against.
   * @reads the project state.
   */
  tdSignature: () => {
    const { nodes, edges, settings, projectExtras } = get()
    const ex = { ...projectExtras, analyses: (projectExtras.analyses || []).filter((a) => a.type !== 'timedomain') }
    return graphSignature(nodes, edges, settings, ex, 'td')
  },
  /**
   * Run a time-domain analysis with the project's settings for it.
   *
   * One job at a time: starting another cancels the one running.
   *
   * @param {'linear'|'transient'|'distortion'} kind - Which analysis.
   * @param {string} [mode] - For distortion: `harmonics`, `thd`, `compression` or `maxspl`; the settings' mode by default.
   * @returns {void}
   * @sideEffect Starts a worker job; writes progress, results or an error into store state.
   */
  runTimeDomain: (kind, mode) => {
    const st = get()
    if (!st.nodes.length) return
    if (st.tdJob) stopTdWorker()
    const cfg = tdSettingsOf(st.projectExtras)
    const m = kind === 'distortion' ? (mode || cfg.distortion.mode) : undefined
    const project = fromEditor({ name: st.projectName, nodes: st.nodes, edges: st.edges, settings: st.settings, extras: st.projectExtras })
    const sig = st.tdSignature()
    const opts = cfg[kind]
    const threads = typeof Worker !== 'undefined' ? getPool().size : 1
    set({ tdJob: { kind, mode: m, fraction: 0, message: 'Starting', threads }, tdError: null })
    startTdJob({ kind, project, opts, mode: m }, (msg) => {
      if (msg.type === 'progress') {
        set({ tdJob: { kind, mode: m, fraction: msg.fraction, message: msg.message, threads } })
        return
      }
      if (msg.type === 'error') {
        set({ tdJob: null, tdError: msg.projectErrors?.length ? msg.projectErrors.join('; ') : msg.error })
        return
      }
      const r = get().tdResults
      const entry = { ...msg.result, sig, opts, at: Date.now() }
      set({
        tdJob: null,
        tdResults: kind === 'distortion'
          ? { ...r, distortion: { ...r.distortion, [m]: entry } }
          : { ...r, [kind]: entry },
      })
    })
  },
  /**
   * Stop the running time-domain job.
   *
   * @returns {void}
   * @sideEffect Terminates the worker and clears the job.
   */
  cancelTimeDomain: () => {
    stopTdWorker()
    set({ tdJob: null })
  },

  // ---- compute pipeline (debounced 150 ms) ----
  // Simulation runs in a Web Worker: the engine ships with the app, but off
  // the UI thread. The debounce collapses slider drags; a token identifies
  // the newest request so a slow reply cannot overwrite a newer result.
  _computeTimer: null,
  _lastSig: '',
  _simToken: null,
  simError: null,
  /**
   * Schedule a debounced simulation run.
   *
   * Simulation runs in a Web Worker — see `src/engine/worker.js` — so the
   * canvas stays responsive through a large sweep, and three mechanisms keep
   * the pipeline from thrashing. The 150 ms debounce collapses slider drags
   * into one run. The graph signature skips the run when nothing that affects
   * the result changed. A token marks the newest request, and the reply is
   * checked against it before being applied, so a slow reply cannot overwrite
   * a newer result.
   *
   * A superseded run is left to finish rather than cancelled. Tearing down and
   * respawning a worker costs more than the sweep it would save, and the reply
   * is discarded either way.
   *
   * A popped-out tab returns immediately: results arrive from the main window
   * over the sync channel, and a second sweep would duplicate the work.
   *
   * @returns {void}
   * @sideEffect Sets a timer, posts to the simulation worker, writes store state, and on success triggers an auto-save. A structurally invalid project is recorded in `simError` and retried on the next edit rather than thrown.
   */
  scheduleCompute: () => {
    // Results arrive from the main window over the sync channel; a popped-out
    // tab running its own sweep would just duplicate the work.
    if (POPOUT) return
    const st = get()
    if (st._computeTimer) clearTimeout(st._computeTimer)
    const timer = setTimeout(async () => {
      const { nodes, edges, settings, projectExtras, projectName, engine } = get()
      if (!nodes.length) return
      const sig = graphSignature(nodes, edges, settings, projectExtras, engine)
      if (sig === get()._lastSig && get().results) return
      const token = {}
      set({ _simToken: token })
      const reply = await simulateInWorker(
        fromEditor({ name: projectName, nodes, edges, settings, extras: projectExtras }),
        engine,
      )
      if (get()._simToken !== token) return // a newer request superseded this one
      if (reply.ok) {
        set({ results: reply.results, metrics: reply.metrics, _lastSig: sig, simError: null })
        get().saveActiveFile()
      } else {
        const detail = reply.projectErrors?.length ? reply.projectErrors.join('; ') : reply.error
        set({ simError: `Simulation failed: ${detail}`, _lastSig: '' })
      }
    }, 150)
    set({ _computeTimer: timer })
  },

  // ---- persistence ----
  /**
   * Capture the project as a plain, saveable object.
   *
   * The `.acousim.json` format, shared with the MCP server and the file
   * export. Node positions are included — they are editor state, but losing
   * the layout of a saved graph would be worse than carrying it.
   *
   * @returns {object} The serialized v3 project — see src/schema/version.js for its sections.
   * @sideEffect Reads the current time for the `modified` stamp.
   */
  serialize: () => {
    const { nodes, edges, projectName, settings, projectExtras } = get()
    const proj = fromEditor({ name: projectName, nodes, edges, settings, extras: projectExtras })
    return { ...proj, modified: new Date().toISOString() }
  },
  /**
   * Replace the current project with a deserialized one.
   *
   * The file is first carried to the current schema by `migrateProject`,
   * which also fills every param from the defaults, so a project saved by an
   * older build gains any parameter added since and edges missing an id get
   * one. A bare `{name, nodes, edges}` — a new empty file — keeps the current
   * sweep, drive and display settings rather than resetting them.
   *
   * History, redo and selection are all cleared: they describe the project
   * being replaced and would be meaningless against the new one. Snapshots are
   * not — they belong to the workspace and are the whole point of opening
   * another file.
   *
   * @param {object} proj - A serialized project.
   * @returns {void}
   * @sideEffect Replaces store state and schedules a resimulation.
   */
  loadSerialized: (proj) => {
    const ed = toEditor(migrateProject(proj))
    const bare = !proj.settings && !proj.analyses && !proj.wiring && !proj.display
    const cur = get()
    set({
      nodes: ed.nodes, edges: ed.edges,
      projectName: proj.name || '',
      settings: bare ? cur.settings : { ...cur.settings, ...ed.settings },
      projectExtras: bare
        ? { ...ed.extras, wiring: cur.projectExtras.wiring, analyses: cur.projectExtras.analyses, display: cur.projectExtras.display }
        : ed.extras,
      history: [], future: [], selectedNodeId: null,
      // time-domain results describe the project being replaced
      tdResults: { linear: null, transient: null, distortion: {} }, tdError: null,
    })
    get().scheduleCompute()
  },
  /**
   * Download the open project as a standalone JSON file.
   *
   * An export, not a save: the project already lives in the workspace, and
   * this is for handing one design to someone who is not going to import a
   * whole workspace to read it.
   *
   * @returns {void}
   * @sideEffect Writes the open file into the workspace, then triggers a browser download.
   */
  saveProjectJSON: () => {
    get().saveActiveFile()
    exportProjectJSON(get().serialize())
  },

  /**
   * Import a project file into the workspace as a new file, and open it.
   *
   * Imported *into* the workspace rather than onto the canvas. A project on
   * the canvas that belongs to no file would be the one thing that can be
   * edited and then lost, which is the whole reason the workspace exists.
   *
   * @param {object} proj - A deserialized project.
   * @param {string} filename - The file it came from, used to name the entry.
   * @returns {string} The path of the new workspace file.
   * @sideEffect Writes store state, persists the workspace and replaces what is on the canvas.
   */
  importProject: (proj, filename) => {
    const stem = (proj.name || filename.replace(/\.acousim\.json$/i, '').replace(/\.json$/i, '') || 'Imported').trim()
    const name = W.uniqueName(get().workspace, '', `${stem}${W.PROJECT_EXT}`)
    get().saveActiveFile()
    get()._commitWorkspace(W.writeFile(get().workspace, name, {
      kind: 'project',
      data: { ...proj, name: name.replace(/\.acousim$/, '') },
    }))
    set({ activeFile: name, wsSelection: [name] })
    get().loadSerialized({ ...proj, name: name.replace(/\.acousim$/, '') })
    return name
  },

  // ---- the workspace ----
  //
  // The workspace is the user's filing cabinet: projects, folders, and the app
  // data under `.acousim`. It lives in LocalStorage while it is being worked
  // on and leaves the browser as a single downloaded JSON file, which is the
  // only copy that is actually safe — hence the freshness stamp the file
  // browser shows.
  //
  // Every mutation goes through `_commitWorkspace` so persistence happens in
  // one place. Nothing here creates the system folder for its own sake; the
  // functions in src/workspace.js that write app data do that, at the moment
  // they need it.

  /**
   * Store a modified workspace.
   *
   * @param {object} ws - The new workspace.
   * @returns {void}
   * @sideEffect Writes store state, which the module-level subscription then persists to LocalStorage.
   */
  _commitWorkspace: (ws) => set({ workspace: ws }),

  /**
   * Rename the workspace itself.
   *

   * Stored exactly as typed, including a momentarily empty one — rejecting
   * blanks here would make the field impossible to clear and retype. A blank
   * name falls back to the default when the workspace is downloaded or read
   * back, which is the only point where the name has to mean something.
   *
   * @param {string} name - The new name.
   * @returns {void}
   * @sideEffect Writes store state and persists the workspace.
   */
  setWorkspaceName: (name) => {
    get()._commitWorkspace({ ...W.touch(get().workspace), name })
  },

  /**
   * Write the editor's current project back into its file.
   *
   * Called after every successful simulation, so the open file tracks the
   * graph without the user having to save anything. A workspace whose active file has been deleted or
   * was never a project writes nothing rather than resurrecting it.
   *
   * @returns {void}
   * @sideEffect Writes store state and persists the workspace. Skipped in a popped-out tab, which has no editor of its own to save.
   */
  saveActiveFile: () => {
    if (POPOUT) return
    const { workspace, activeFile } = get()
    if (!activeFile || workspace.files[activeFile]?.kind !== 'project') return
    get()._commitWorkspace(W.writeFile(workspace, activeFile, { kind: 'project', data: get().serialize() }))
  },

  /**
   * Open a project file in the editor.
   *
   * The file on the way out is saved first, so switching files never loses the
   * edits made to the one being left. Non-project files are not openable — a
   * driver library has no graph to put on the canvas — and are ignored.
   *
   * @param {string} path - Path of the file to open.
   * @returns {void}
   * @sideEffect Writes store state, persists the workspace and schedules a resimulation.
   */
  openFile: (path) => {
    const entry = get().workspace.files[path]
    if (!entry || entry.kind !== 'project') return
    if (path === get().activeFile) return
    get().saveActiveFile()
    set({ activeFile: path })
    get().loadSerialized({ ...entry.data, name: entry.data?.name || W.baseName(path).replace(/\.acousim$/, '') })
  },

  /**
   * Create an empty project file.
   *
   * @param {string} [folder] - Folder to create it in; the workspace root by default.
   * @returns {string} The path of the new file.
   * @sideEffect Writes store state, persists the workspace and opens the new file, replacing what is on the canvas.
   */
  newFile: (folder = '') => {
    const name = W.uniqueName(get().workspace, folder, `Untitled${W.PROJECT_EXT}`)
    const path = W.joinPath(folder, name)
    const stem = name.replace(/\.acousim$/, '')
    get().saveActiveFile()
    get()._commitWorkspace(W.writeFile(get().workspace, path, {
      kind: 'project',
      data: { name: stem, nodes: [], edges: [] },
    }))
    set({ activeFile: path })
    get().loadSerialized({ name: stem, nodes: [], edges: [] })
    return path
  },

  /**
   * Create an empty folder.
   *
   * @param {string} [parent] - Folder to create it in; the workspace root by default.
   * @returns {string} The path of the new folder.
   * @sideEffect Writes store state and persists the workspace.
   */
  newFolder: (parent = '') => {
    const name = W.uniqueName(get().workspace, parent, 'New folder')
    const path = W.joinPath(parent, name)
    get()._commitWorkspace(W.addFolder(get().workspace, path))
    return path
  },

  /**
   * Rename or move a file or folder.
   *
   * Renaming a project file renames the project inside it too. The alternative
   * — a file called `Ported box` holding a project called `Untitled` — reads as
   * a bug every time a user meets it.
   *
   * The system folder is not renamable: the app looks for its contents by
   * path, and a moved `.acousim` would silently become a folder of orphaned
   * data plus a fresh empty one.
   *
   * @param {string} from - The existing path.
   * @param {string} to - The new path.
   * @returns {boolean} True when the move happened; false when the name is invalid, taken, or forbidden.
   * @sideEffect Writes store state and persists the workspace. Follows the active file if it was the one moved.
   */
  renamePath: (from, to) => {
    const dest = W.normalizePath(to)
    if (!dest || dest === from) return false
    if (W.isSystemPath(from) || W.isSystemPath(dest)) return false
    const ws = get().workspace
    if (!W.hasEntry(ws, from) || W.hasEntry(ws, dest)) return false

    let next = W.renameEntry(ws, from, dest)
    if (next === ws) return false

    const entry = next.files[dest]
    if (entry?.kind === 'project') {
      const stem = W.baseName(dest).replace(/\.acousim$/, '')
      next = W.writeFile(next, dest, { ...entry, data: { ...entry.data, name: stem } })
      if (get().activeFile === from) set({ projectName: stem })
    }
    get()._commitWorkspace(next)
    if (get().activeFile && W.isUnder(from, get().activeFile)) {
      set({ activeFile: dest + get().activeFile.slice(from.length) })
    }
    return true
  },

  /**
   * Delete a file, or a folder and everything in it.
   *
   * Deleting the open project leaves the editor on whatever project remains,
   * or on an empty canvas when none does — better than holding a file that no
   * longer exists and writing it back on the next auto-save.
   *
   * The confirmation belongs to the caller. This is the operation, not the
   * question.
   *
   * @param {string} path - Path of the entry to delete.
   * @returns {void}
   * @sideEffect Writes store state and persists the workspace. May replace what is on the canvas.
   */
  deletePath: (path) => {
    const ws = get().workspace
    if (!W.hasEntry(ws, path)) return
    const wasActive = get().activeFile && W.isUnder(path, get().activeFile)
    const next = W.deleteEntry(ws, path)
    get()._commitWorkspace(next)
    // The explorer must not keep pointing at what is gone, or the next
    // keystroke would act on a path the workspace no longer has.
    const kept = get().wsSelection.filter((p) => !W.isUnder(path, p))
    if (kept.length !== get().wsSelection.length) set({ wsSelection: kept })
    if (!wasActive) return

    const fallback = W.listProjects(next)[0] || null
    set({ activeFile: fallback })
    if (fallback) {
      const entry = next.files[fallback]
      get().loadSerialized({ ...entry.data, name: entry.data?.name || W.baseName(fallback).replace(/\.acousim$/, '') })
    } else {
      get().loadSerialized({ name: 'Untitled', nodes: [], edges: [] })
    }
  },

  /**
   * Download the whole workspace, and record that it happened.
   *
   * The stamp is the point as much as the file is: browser storage can be
   * cleared without warning, so the file browser shows how long it has been
   * since a copy existed anywhere else.
   *
   * @returns {Promise<void>} Resolves once the archive has been handed to the browser.
   * @sideEffect Saves the open file, builds and downloads an archive, then writes store state and persists the workspace.
   */
  downloadWorkspace: async () => {
    get().saveActiveFile()
    const ws = { ...get().workspace, downloaded: new Date().toISOString() }
    await exportWorkspaceZip(ws)
    get()._commitWorkspace(ws)
  },

  /**
   * Replace the workspace with an imported one.
   *
   * Wholesale replacement rather than a merge. Merging two workspaces raises a
   * question per colliding path that the user has no way to answer usefully in
   * a dialog, and the honest workflow — download the current workspace first —
   * is one click away.
   *
   * The imported workspace is stored exactly as it arrived. If it has no
   * system folder, it does not gain one here; the first write of app data
   * creates it.
   *
   * Both shapes a workspace can arrive in are accepted: the archive of folders
   * and files this build downloads, and the single JSON document an earlier
   * one did. Deciding by signature rather than by file extension, since the
   * picker hands over whatever the user chose and the extension is the least
   * reliable thing about it.
   *
   * @param {File} file - The chosen file.
   * @returns {Promise<{ok: boolean, error?: string, skipped?: string[]}>} Whether the import succeeded, which files were unreadable, and why it failed when it did.
   * @sideEffect Reads the file. On success, writes store state, persists the workspace and replaces what is on the canvas.
   */
  importWorkspaceFile: async (file) => {
    let parsed
    try {
      const buffer = await file.arrayBuffer()
      if (Z.isZip(buffer)) {
        const stem = file.name.replace(/\.zip$/i, '').replace(/\.acousim$/i, '')
        parsed = W.entriesToWorkspace(await Z.readZip(buffer), stem || W.DEFAULT_WORKSPACE_NAME)
      } else {
        parsed = W.parseWorkspace(new TextDecoder().decode(buffer))
      }
    } catch (err) {
      return { ok: false, error: err?.message || 'Could not read that file.' }
    }
    if (!parsed.ok) return { ok: false, error: parsed.error }
    return { ...get()._adoptWorkspace(parsed.workspace), skipped: parsed.skipped }
  },

  /**
   * Make an imported workspace the current one and open something from it.
   *
   * @param {object} ws - The workspace to adopt.
   * @returns {{ok: boolean}} Always a success; the caller has already validated.
   * @sideEffect Writes store state, persists the workspace and replaces what is on the canvas.
   */
  _adoptWorkspace: (ws) => {
    get()._commitWorkspace(ws)
    // Every explorer path just changed. Keeping a selection or a half-typed
    // rename across that would leave both pointing at a workspace that is gone.
    set({ wsSelection: [], wsCollapsed: [], wsEdit: null, fileClipboard: null })

    const first = W.listProjects(ws)[0] || null
    set({ activeFile: first })
    const entry = first ? ws.files[first] : null
    get().loadSerialized(entry
      ? { ...entry.data, name: entry.data?.name || W.baseName(first).replace(/\.acousim$/, '') }
      : { name: 'Untitled', nodes: [], edges: [] })
    return { ok: true }
  },

  // ---- explorer state ----
  //
  // Selection, expansion, the inline editor and the file clipboard are all
  // *views* of the workspace rather than part of it, so none of them are
  // shared with other windows or persisted: two windows showing the same tree
  // should be able to have different things selected, and a downloaded
  // workspace should not carry someone's collapsed folders.
  //
  // They live in the store rather than in the panel because the right-click
  // menu is a separate component that has to know what is selected and be able
  // to start an inline rename in a panel it does not contain.

  /**
   * Replace the explorer's selection.
   *
   * @param {string[]} paths - The paths now selected, in the order they were added.
   * @returns {void}
   * @sideEffect Writes store state.
   */
  setWsSelection: (paths) => set({ wsSelection: paths }),

  /**
   * Expand or collapse a folder in the explorer.
   *
   * @param {string} path - The folder's path.
   * @param {boolean} [open] - Force a state; omitted, the folder toggles.
   * @returns {void}
   * @sideEffect Writes store state.
   */
  toggleWsFolder: (path, open) => {
    const collapsed = get().wsCollapsed
    const isOpen = !collapsed.includes(path)
    const want = open === undefined ? !isOpen : open
    if (want === isOpen) return
    set({ wsCollapsed: want ? collapsed.filter((p) => p !== path) : [...collapsed, path] })
  },

  /**
   * Collapse every folder in the explorer.
   *
   * @returns {void}
   * @sideEffect Writes store state.
   */
  collapseAllWsFolders: () => set({ wsCollapsed: W.listFolders(get().workspace) }),

  /**
   * Start an inline edit in the explorer.
   *
   * The tree draws the text box; this only records that one is wanted, which
   * is what lets the right-click menu — a component that contains no tree —
   * start a rename. A folder gaining a new child is expanded first, so the row
   * being typed into is actually on screen.
   *
   * @param {string} mode - `'rename'`, `'newFile'` or `'newFolder'`.
   * @param {string} path - The entry being renamed, or the folder gaining a child; the empty string means the root.
   * @returns {void}
   * @sideEffect Writes store state.
   */
  beginWsEdit: (mode, path) => {
    if (mode !== 'rename' && path) get().toggleWsFolder(path, true)
    set({ wsEdit: { mode, path } })
  },

  /**
   * Dismiss the explorer's inline editor.
   *
   * @returns {void}
   * @sideEffect Writes store state.
   */
  endWsEdit: () => { if (get().wsEdit) set({ wsEdit: null }) },

  /**
   * Put explorer entries on the file clipboard.
   *
   * A cut is recorded rather than performed: nothing moves until the paste, so
   * a cut the user abandons costs them nothing. This mirrors every file
   * manager and is the opposite of the node clipboard, where cutting removes
   * the nodes immediately because the graph shows the result either way.
   *
   * @param {string[]} paths - Paths to hold.
   * @param {boolean} cut - True for a cut, false for a copy.
   * @returns {void}
   * @sideEffect Writes store state.
   */
  setFileClipboard: (paths, cut) => set({ fileClipboard: paths.length ? { paths, cut } : null }),

  /**
   * Paste the file clipboard into a folder.
   *
   * A cut becomes a move and empties the clipboard, since the entry cannot be
   * moved to a second place. A copy leaves the clipboard loaded, so the same
   * thing can be pasted into several folders.
   *
   * @param {string} folder - Destination folder; the empty string means the root.
   * @returns {void}
   * @sideEffect Writes store state and persists the workspace. Follows the active file when a cut moves it.
   */
  pasteFiles: (folder) => {
    const clip = get().fileClipboard
    if (!clip) return
    let ws = get().workspace
    let active = get().activeFile

    for (const from of clip.paths) {
      if (clip.cut) {
        const moved = W.moveInto(ws, from, folder)
        if (active && W.isUnder(from, active)) active = moved.path + active.slice(from.length)
        ws = moved.ws
      } else {
        ws = W.copyInto(ws, from, folder)
      }
    }
    get()._commitWorkspace(ws)
    if (active !== get().activeFile) set({ activeFile: active })
    if (clip.cut) set({ fileClipboard: null })
  },

  /**
   * Copy an entry alongside itself.
   *
   * @param {string} path - Path of the entry to duplicate.
   * @returns {void}
   * @sideEffect Writes store state and persists the workspace.
   */
  duplicateFile: (path) => {
    get()._commitWorkspace(W.copyInto(get().workspace, path, W.parentOf(path)))
  },

  /**
   * Move an entry into a folder, keeping its name.
   *
   * The drag-and-drop half of the explorer. A move onto the folder an entry is
   * already in, or into itself, is silently nothing rather than an error — a
   * drag that lands where it started is a cancelled drag.
   *
   * @param {string} from - Path of the entry to move.
   * @param {string} folder - Destination folder; the empty string means the root.
   * @returns {void}
   * @sideEffect Writes store state and persists the workspace. Follows the active file if it was the one moved.
   */
  moveFile: (from, folder) => {
    if (W.isSystemPath(from)) return
    const { ws, path } = W.moveInto(get().workspace, from, folder)
    if (ws === get().workspace) return
    get()._commitWorkspace(ws)
    const active = get().activeFile
    if (active && W.isUnder(from, active)) set({ activeFile: path + active.slice(from.length) })
  },

  /**
   * Create a file or folder under a chosen name.
   *
   * The counterpart to `beginWsEdit`: the tree collects the name, this makes
   * the entry. A blank or already-taken name is refused rather than silently
   * adjusted, because the user is looking at the text box and can fix it.
   *
   * @param {string} mode - `'newFile'` or `'newFolder'`.
   * @param {string} parent - Folder to create it in; the empty string means the root.
   * @param {string} name - The name typed by the user.
   * @returns {{ok: boolean, error?: string}} Whether it was created, and why not when it was not.
   * @sideEffect On success, writes store state, persists the workspace, and for a file opens it on the canvas.
   */
  createWsEntry: (mode, parent, name) => {
    const trimmed = name.trim()
    if (!trimmed) return { ok: false, error: 'A name is required.' }
    const path = W.normalizePath(W.joinPath(parent, trimmed))
    if (!path) return { ok: false, error: `“${trimmed}” is not a usable name.` }
    if (W.hasEntry(get().workspace, path)) return { ok: false, error: `“${trimmed}” already exists here.` }

    if (mode === 'newFolder') {
      get()._commitWorkspace(W.addFolder(get().workspace, path))
      return { ok: true }
    }

    const stem = W.baseName(path).replace(/\.acousim$/, '')
    get().saveActiveFile()
    get()._commitWorkspace(W.writeFile(get().workspace, path, {
      kind: 'project',
      data: { name: stem, nodes: [], edges: [] },
    }))
    set({ activeFile: path, wsSelection: [path] })
    get().loadSerialized({ name: stem, nodes: [], edges: [] })
    return { ok: true }
  },

  /**
   * Record where this workspace is kept, and dismiss the startup prompt.
   *
   * Asked out loud because browser storage is the option whose durability the
   * user needs to have been told about before they have work in it. The answer
   * is remembered so the question is asked once, not on every visit.
   *
   * @param {string} kind - Where the workspace lives: `'browser'` or `'folder'`.
   * @returns {void}
   * @sideEffect Writes store state and LocalStorage.
   */
  chooseWorkspaceStorage: (kind) => {
    try { localStorage.setItem(STORAGE_CHOICE_KEY, kind) } catch { /* private mode */ }
    set({ workspacePrompt: false })
  },

  // ---- a folder on the user's computer ----
  //
  // The folder is authoritative: connect one and what is on disk becomes the
  // workspace. The exception is a workspace the browser has carried further
  // than the folder — worked on during a visit where permission had lapsed,
  // say — which is pushed out instead of being thrown away. Stamps decide,
  // and there is no case where the newer of the two loses.
  //
  // Browser storage keeps mirroring throughout. It costs nothing and it is
  // what the app falls back to on the visit where the folder cannot be read.

  /**
   * Put the workspace in a folder the user picks.
   *
   * A folder that already holds a workspace is opened rather than overwritten,
   * which is how a workspace moves between machines: point both at the same
   * synced folder. Because that replaces what is in the browser, the caller is
   * asked to confirm it — the question belongs to the UI, not here.
   *
   * An empty folder, or one with nothing of ours in it, gets the current
   * workspace written into it.
   *
   * @param {Function} [confirmAdopt] - Called with `{name, files}` when the folder already holds a workspace; the folder is opened only if it returns true.
   * @returns {Promise<{ok: boolean, adopted?: boolean, cancelled?: boolean, error?: string}>} What happened, and whether the folder's own workspace was opened.
   * @sideEffect Shows a folder picker, reads and writes the user's filesystem, writes IndexedDB and LocalStorage, writes store state and may replace what is on the canvas. Does nothing in a popped-out tab.
   */
  connectWorkspaceFolder: async (confirmAdopt) => {
    if (POPOUT) return { ok: false }
    if (!F.supportsFolders()) {
      return { ok: false, error: 'This browser cannot keep a workspace in a folder. Chrome and Edge can.' }
    }
    const handle = await F.pickFolder()
    if (!handle) return { ok: false, cancelled: true }

    const read = await F.readFolderWorkspace(handle)
    if (read.ok && confirmAdopt) {
      const proceed = await confirmAdopt({ name: handle.name, files: Object.keys(read.workspace.files).length })
      if (!proceed) return { ok: false, cancelled: true }
    }

    await F.rememberFolder(handle)
    try { localStorage.setItem(STORAGE_CHOICE_KEY, 'folder') } catch { /* private mode */ }
    set({ workspacePrompt: false })
    // A folder chosen by hand is the one the user means, so its workspace wins
    // outright rather than being compared against the browser's.
    await get()._openFolder(handle, read, true)
    return { ok: true, adopted: read.ok }
  },

  /**
   * Renew permission on a remembered folder and open it again.
   *
   * Permission does not survive a reload, and the browser will only re-ask
   * from a user gesture — which is what the explorer's Reconnect button is
   * for. Refusing leaves the workspace in the browser rather than in limbo.
   *
   * @returns {Promise<{ok: boolean, error?: string}>} Whether the folder is connected again.
   * @sideEffect Shows a permission prompt, reads and writes the user's filesystem, and writes store state. Does nothing in a popped-out tab.
   */
  reconnectWorkspaceFolder: async () => {
    if (POPOUT || !folderHandle) return { ok: false }
    const state = await F.folderPermission(folderHandle, true)
    if (state !== 'granted') {
      set({ folderStatus: 'locked', folderError: 'AcouSim needs permission to use that folder.' })
      return { ok: false, error: 'Permission was not granted.' }
    }
    const read = await F.readFolderWorkspace(folderHandle)
    await get()._openFolder(folderHandle, read, false)
    return { ok: true }
  },

  /**
   * Stop keeping the workspace in a folder.
   *
   * The folder is left exactly as it is and the workspace stays in the browser
   * — this disconnects, it does not delete. Whichever copy the user wants to
   * keep, they still have both.
   *
   * @returns {Promise<void>} Resolves once the folder is forgotten.
   * @sideEffect Writes IndexedDB and store state, and cancels any pending write.
   * @mutates The module-level folder handle and its recorded state.
   */
  disconnectWorkspaceFolder: async () => {
    clearTimeout(folderTimer)
    folderHandle = null
    folderState = { files: new Map(), folders: [] }
    set({ folderStatus: 'off', folderName: null, folderError: null, folderSaved: null })
    try { localStorage.setItem(STORAGE_CHOICE_KEY, 'browser') } catch { /* private mode */ }
    await F.forgetFolder()
  },

  /**
   * Adopt a folder as the workspace's home, in whichever direction is newer.
   *
   * The folder wins by default, since that is what "the workspace lives here"
   * has to mean for a folder shared between machines. It loses only to a
   * browser workspace that has been modified more recently than the folder's,
   * which is the one case where reading would discard work — and even then the
   * folder is brought up to date rather than left behind.
   *
   * @param {FileSystemDirectoryHandle} handle - The folder.
   * @param {object} read - The result of `readFolderWorkspace` for it.
   * @param {boolean} prefer - Whether the folder's workspace wins regardless of stamps.
   * @returns {Promise<void>} Resolves once the workspace and the folder agree.
   * @sideEffect Writes the user's filesystem and store state, and may replace what is on the canvas.
   * @mutates The module-level folder handle and its recorded state.
   */
  _openFolder: async (handle, read, prefer) => {
    folderHandle = handle
    set({ folderName: handle.name, folderStatus: 'connected', folderError: null })
    // A connected folder is the answer to where the work is kept, so the
    // startup question is settled — including the case that asks it again
    // because clearing browser data took the previous answer with it.
    set({ workspacePrompt: false })
    try { localStorage.setItem(STORAGE_CHOICE_KEY, 'folder') } catch { /* private mode */ }

    const ours = Date.parse(get().workspace.modified || '') || 0
    const theirs = read.ok ? (Date.parse(read.workspace.modified || '') || 0) : -1

    if (read.ok && (prefer || theirs >= ours)) {
      folderState = read.previous
      get()._adoptWorkspace(read.workspace)
      set({ folderSaved: new Date().toISOString() })
      return
    }

    // Ours is the newer of the two, or the folder holds nothing of ours: write
    // it out — but only write. A file on disk that this workspace does not
    // have has not been deleted by anyone; this browser has simply never heard
    // of it, and the first thing a connection does must never be to tidy the
    // user's folder on that basis. Deletions begin from here.
    folderState = read.ok ? read.previous : { files: new Map(), folders: [] }
    get().saveActiveFile()
    await get()._syncFolder(false)
  },

  /**
   * Write the workspace to the connected folder.
   *
   * Only what changed is written. A write already in flight is not joined but
   * remembered: the next one runs after it, so a burst of edits during a slow
   * save collapses into one more write rather than a queue of them.
   *
   * @param {boolean} [prune] - Whether files the workspace no longer has may be removed; false for the first write after connecting.
   * @returns {Promise<void>} Resolves once the folder matches, or once the failure has been recorded.
   * @sideEffect Writes the user's filesystem and store state. Does nothing when no folder is connected, or when the connected one is locked.
   * @mutates The module-level folder state and the in-flight flags.
   */
  _syncFolder: async (prune = true) => {
    if (!folderHandle || get().folderStatus === 'locked') return
    if (folderWriting) { folderAgain = true; return }
    folderWriting = true
    try {
      const plan = F.planSync(get().workspace, folderState, prune)
      if (!plan.writes.length && !plan.deletes.length && !plan.gone.length) return
      const { failed } = await F.applyPlan(folderHandle, plan)
      folderState = plan.next
      if (!failed.length) {
        set({ folderStatus: 'connected', folderError: null, folderSaved: new Date().toISOString() })
        return
      }
      // Everything failing is almost never forty locked files; it is the
      // folder having gone away or permission having lapsed.
      const state = await F.folderPermission(folderHandle, false)
      if (state !== 'granted') {
        set({ folderStatus: 'locked', folderError: 'Permission for that folder has lapsed.' })
      } else {
        set({ folderStatus: 'error', folderError: `${failed.length} file${failed.length === 1 ? '' : 's'} could not be written.` })
      }
    } catch (err) {
      set({ folderStatus: 'error', folderError: err?.message || 'The folder could not be written.' })
    } finally {
      folderWriting = false
      if (folderAgain) { folderAgain = false; scheduleFolderSync() }
    }
  },

  /**
   * Pick up the folder from a previous visit, if the browser still allows it.
   *
   * Run once at startup. Permission is checked without prompting — a prompt
   * needs a gesture and there is none at load — so a remembered folder either
   * reconnects silently or comes back locked with the explorer offering the
   * click that renews it.
   *
   * @param {string} since - The browser workspace's modification stamp as it was at load, before any auto-save could advance it.
   * @returns {Promise<void>} Resolves once the folder is connected, locked, or found to be gone.
   * @sideEffect Reads IndexedDB and the user's filesystem, writes store state, and may replace what is on the canvas.
   * @mutates The module-level folder handle.
   */
  _resumeFolder: async (since) => {
    const handle = await F.recallFolder()
    if (!handle) return
    folderHandle = handle
    if (await F.folderPermission(handle, false) !== 'granted') {
      set({ folderStatus: 'locked', folderName: handle.name })
      return
    }
    const read = await F.readFolderWorkspace(handle)
    // Compare against the workspace as it was loaded rather than as it is now:
    // the first simulation has probably auto-saved by the time the folder has
    // been read, and that must not make the browser copy look like the newer.
    //
    // And only compare at all when there is something to compare. A workspace
    // the browser invented seconds ago is not a competing version of the
    // folder's; it is the absence of one. Clearing browser data leaves exactly
    // that, and the folder is then the only copy of the user's work there is.
    const stale = Date.parse(since || '') || 0
    const theirs = read.ok ? (Date.parse(read.workspace.modified || '') || 0) : -1
    await get()._openFolder(handle, read, read.ok && (!workspaceRestored || theirs >= stale))
  },

  /**
   * Replace the workspace's custom driver library.
   *
   * The one write that creates the system folder in normal use: saving a
   * driver is a modification, and this is where the workspace discovers it has
   * nowhere to put it yet.
   *
   * @param {Array<object>} drivers - The full driver list to store.
   * @returns {void}
   * @sideEffect Writes store state and persists the workspace.
   */
  setCustomDrivers: (drivers) => {
    get()._commitWorkspace(W.writeDrivers(get().workspace, drivers))
  },

  // ---- popped-out panels ----
  // A panel sent to its own tab leaves the dock; closing that tab brings it
  // back. Tracking which are out keeps the View menu honest.
  poppedOut: [],
  // What a popped-out tab holds, and which of it is in front. Seeded from the
  // URL but not bound to it: a popped-out tab can gain and lose views like any
  // other window, so the list has to be state. Both are local to the window —
  // `SHARED_KEYS` excludes them, so two popouts do not fight over one
  // another's tab strip.
  popoutIds: POPOUT ? popoutPanelIds() : [],
  popoutActive: POPOUT ? popoutPanelId() : null,
  /**
   * Bring a view to the front in a popped-out tab.
   *
   * @param {string} id - Panel id.
   * @returns {void}
   * @sideEffect Writes store state and rewrites this tab's URL. The fields are local to the window — `SHARED_KEYS` deliberately excludes them.
   */
  setPopoutActive: (id) => {
    set({ popoutActive: id })
    syncPopoutUrl(get().popoutIds, id)
  },
  /**
   * Add a view to this popped-out tab, beside the ones already in it.
   *
   * The counterpart of `addViewToStack` for a window that has no dock. The
   * main window is told so it can let go of the panel, exactly as it does when
   * a whole new tab claims one — a panel exists once across every window, and
   * a view showing in two places would be two things to keep in step.
   *
   * @param {string} id - Panel to add. One already here is merely brought to the front.
   * @returns {void}
   * @sideEffect Writes store state, rewrites this tab's URL, and announces the claim to the main window. Does nothing outside a popped-out tab.
   */
  addViewToPopout: (id) => {
    if (!POPOUT) return
    const ids = get().popoutIds
    if (!ids.includes(id)) {
      const next = [...ids, id]
      set({ popoutIds: next, popoutActive: id })
      syncPopoutUrl(next, id)
      channel?.postMessage({ type: 'claim', panels: [id] })
    } else {
      get().setPopoutActive(id)
    }
    get().focusPanel(id)
  },
  /**
   * Remove a view from this popped-out tab, handing it back to the main window.
   *
   * Closing the last one closes the tab rather than leaving an empty window,
   * which is also how every remaining view gets handed back at once.
   *
   * @param {string} id - Panel to close. One this tab does not hold is a no-op.
   * @returns {void}
   * @sideEffect Writes store state, rewrites this tab's URL, and either announces the release to the main window or closes the browser tab. Does nothing outside a popped-out tab.
   */
  closeViewInPopout: (id) => {
    if (!POPOUT) return
    const ids = get().popoutIds
    if (!ids.includes(id)) return
    const next = ids.filter((p) => p !== id)
    // The last view leaving means the tab has nothing to show. Closing sends
    // `bye` on the way out, which hands that view back too, so this does not
    // announce the release itself.
    if (!next.length) { window.close(); return }
    const front = get().popoutActive === id
      ? next[Math.min(ids.indexOf(id), next.length - 1)]
      : get().popoutActive
    set({ popoutIds: next, popoutActive: front })
    syncPopoutUrl(next, front)
    channel?.postMessage({ type: 'release', panels: [id] })
  },
  /**
   * Send a panel to its own browser tab and remove it from the dock.
   *
   * Called from a popped-out tab it only opens the window: that tab has no
   * dock to take the panel out of, and the new window announces itself over
   * the channel anyway, which is what makes the main window let go of it.
   *
   * @param {string} id - Panel id.
   * @returns {void}
   * @sideEffect Opens a browser window, and in the main window writes store state and persists the layout.
   */
  popOutPanel: (id) => {
    openPanelWindow(id)
    if (!POPOUT) get()._detachPanel(id)
  },
  /**
   * Send a whole docked window — every tab in one stack — to a single browser tab.
   *
   * The new tab reproduces the stack: the same panels, the same tab order, the
   * same one in front. Panels that cannot leave the dock stay in it, so popping
   * out the window holding the Node Editor gives you the group in a tab and
   * leaves the editor where it is rather than emptying the workspace.
   *
   * @param {string} stackId - Id of the stack to pop out. An unknown id is a no-op.
   * @returns {void}
   * @sideEffect Opens a browser window, writes store state and persists the layout.
   */
  popOutStack: (stackId) => {
    const node = L.findNode(get().layout, stackId)
    if (node?.type !== 'stack' || !node.panels.length) return
    const panels = [...node.panels]
    openPanelGroupWindow(panels, node.active)
    // Detach after opening, since detaching rebuilds the tree the ids came from.
    for (const id of panels) get()._detachPanel(id)
  },
  /**
   * Add a view as a new tab in one named docked window.
   *
   * This is the injection the right-click menu offers: unlike `layoutOps.open`,
   * which consults the panel's own placement hint, the caller chooses the
   * destination. A panel already open elsewhere moves rather than being
   * duplicated — a panel exists once in the workspace.
   *
   * A panel currently in its own browser tab is taken back first, so it does
   * not end up counted as both docked and popped out.
   *
   * @param {string} panelId - Panel to add.
   * @param {string} stackId - Stack to add it to. An unknown id is a no-op.
   * @returns {void}
   * @sideEffect Writes store state and persists the layout.
   */
  addViewToStack: (panelId, stackId) => {
    if (L.findNode(get().layout, stackId)?.type !== 'stack') return
    if (get().poppedOut.includes(panelId)) {
      set({ poppedOut: get().poppedOut.filter((p) => p !== panelId) })
    }
    set({ maximized: null })
    get()._commitLayout(L.dockPanel(get().layout, panelId, stackId, 'center'))
    get().focusPanel(panelId)
  },
  /**
   * Mark a panel as popped out and close it in this window's dock.
   *
   * Called both when this window pops a panel out and when another window
   * announces that it has. Tracking which panels are out keeps the View menu
   * honest about what is actually visible.
   *
   * @param {string} id - Panel id.
   * @returns {void}
   * @sideEffect Writes store state and persists the layout.
   */
  _detachPanel: (id) => {
    if (!get().poppedOut.includes(id)) set({ poppedOut: [...get().poppedOut, id] })
    if (PANEL_META[id]?.closable !== false) get().layoutOps.close(id)
  },
  /**
   * Take a panel back into the dock when its tab closes.
   *
   * @param {string} id - Panel id. Ignored when the panel was not popped out.
   * @returns {void}
   * @sideEffect Writes store state and persists the layout.
   */
  _reattachPanel: (id) => {
    if (!get().poppedOut.includes(id)) return
    set({ poppedOut: get().poppedOut.filter((p) => p !== id) })
    get().layoutOps.open(id)
  },

  /**
   * Apply state mirrored from another window without echoing it back.
   *
   * Writes through Zustand's raw setter and holds `applyingRemote` for the
   * duration, which is what stops the wrapped `set` from re-broadcasting what
   * it just received and starting a loop. The flag is cleared in a `finally`
   * so a throwing subscriber cannot leave sync permanently muted.
   *
   * @param {object} patch - Shared-state delta from another window.
   * @returns {void}
   * @sideEffect Writes store state.
   * @mutates The module-level `applyingRemote` flag, for the duration of the call.
   */
  _applyRemote: (patch) => {
    applyingRemote = true
    try { rawSet(patch) } finally { applyingRemote = false }
  },
  /**
   * The full shared slice, sent to a popped-out tab when it announces itself.
   *
   * @returns {object} Every key in `SHARED_KEYS` with its current value.
   * @reads Current store state.
   */
  _sharedSnapshot: () => {
    const st = get()
    return Object.fromEntries(SHARED_KEYS.map((k) => [k, st[k]]))
  },
  }
})

// ---------- workspace persistence ----------
//
// Subscribed rather than written inline at each mutation, because the
// workspace also changes when a popped-out file browser edits it and that
// arrives as a remote patch, not as a call to one of the actions above. One
// subscription catches both; a write in every action would catch neither
// reliably.
//
// Only the main window persists. Two windows writing the same key would race,
// and the popout has nothing the main window has not already been told.
if (!POPOUT) {
  let last = useStore.getState().workspace
  useStore.subscribe((st) => {
    if (st.workspace === last) return
    last = st.workspace
    try { localStorage.setItem(WORKSPACE_KEY, JSON.stringify(st.workspace)) } catch { /* quota */ }
    scheduleFolderSync()
  })

  // Pick the folder back up, if there is one. Deliberately not awaited: the
  // app must render and be usable while the browser decides what it will let
  // us do with a handle from last week.
  if (F.supportsFolders()) useStore.getState()._resumeFolder(INITIAL_WORKSPACE.modified)
}

// ---------- cross-window wiring ----------
//
// Protocol, deliberately small:
//   patch   a shared-state delta, mirrored both ways
//   hello   a popped-out tab announcing itself and the panels it took; the main
//           window answers with a full snapshot and lets go of those panels
//   full    that snapshot
//   claim   an open tab taking one more panel; the main window lets go of it
//   release that tab giving one back, without closing
//   bye     the tab closing; the main window takes its remaining panels back
if (channel) {
  /**
   * Handle a message from another window.
   *
   * The protocol is deliberately small: `patch` is a shared-state delta
   * mirrored both ways, `hello` is a popped-out tab announcing itself, `full`
   * is the snapshot the main window answers with, and `bye` is that tab
   * closing.
   *
   * Receiving anything unmutes this window — a fresh popout stays quiet until
   * the main window has spoken, so its start-up writes cannot overwrite the
   * project already open.
   *
   * A popout can edit shared state, but the main window owns the solver, so an
   * incoming edit to a simulation input re-runs the sweep there.
   *
   * @param {MessageEvent} event - The channel message.
   * @param {object} event.data - The message payload; ignored unless it is an object.
   * @returns {void}
   * @sideEffect Writes store state, may post a reply on the channel, and may trigger a resimulation.
   * @mutates The module-level `muted` flag.
   */
  channel.onmessage = ({ data }) => {
    if (!data || typeof data !== 'object') return
    const st = useStore.getState()

    if (data.type === 'patch' || data.type === 'full') {
      st._applyRemote(data.patch)
      muted = false
      // A popout can edit shared state (a parameter, the sweep range). The
      // main window owns the solver, so it re-runs when such an edit lands.
      if (!POPOUT && SIM_INPUT_KEYS.some((k) => k in data.patch)) {
        useStore.setState({ _lastSig: '' })
        useStore.getState().scheduleCompute()
      }
      return
    }

    if (POPOUT) return // the rest is main-window bookkeeping

    if (data.type === 'hello') {
      channel.postMessage({ type: 'full', patch: st._sharedSnapshot() })
      for (const id of data.panels || [data.panel]) st._detachPanel(id)
    } else if (data.type === 'claim') {
      for (const id of data.panels) st._detachPanel(id)
    } else if (data.type === 'release' || data.type === 'bye') {
      for (const id of data.panels || [data.panel]) st._reattachPanel(id)
    }
  }

  if (POPOUT) {
    // One message for the whole tab rather than one per panel: a tab holding a
    // popped-out window announces every panel it took, and the main window
    // answers with a single snapshot instead of one per tab.
    channel.postMessage({ type: 'hello', panel: popoutPanelId(), panels: popoutPanelIds() })
    // pagehide fires on close and on navigation, where unload is unreliable.
    // The list is read at that moment rather than captured here, since a tab
    // gains and loses views while it is open.
    window.addEventListener('pagehide', () => {
      const st = useStore.getState()
      channel.postMessage({ type: 'bye', panel: st.popoutActive, panels: st.popoutIds })
    })
  }
}


// Module-private functions, exposed for the contract test suite only
// (test/contract/*). Not part of this module's public API — application code
// must not import from here, and nothing outside the tests does.
export const __internals = { loadLayout, loadPresets, loadToolbar, freeSpotNear, graphSignature }
