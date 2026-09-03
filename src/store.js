// Application state: the project graph, the workspace, and everything the UI
// reads. One Zustand store, deliberately flat.
//
// State fields, since the action contracts below name what changes rather than
// where:
//
//   project    nodes, edges, projectName, selectedNodeId, settings
//   results    results, metrics, snapshots, simError
//   history    history, future, clipboard
//   workspace  layout, layoutPresets, maximized, focusedPanel, draggingPanel,
//              poppedOut, toolbar, bindings, xZoom
//   modals     showDriverDB, showTSCalc, showSettings, settingsSection,
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
import { SCHEMA_VERSION, DEFAULT_PARAMS } from './engine/project'
import * as L from './layout'
import { PANEL_META, PANEL_IDS } from './panelMeta'
import { exportProjectJSON, exportWorkspaceZip } from './utils/export'
import * as W from './workspace'
import * as Z from './utils/zip'
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
 * @param {object} project - A serialized project: `{nodes, edges, settings}`.
 * @returns {Promise<{id: number, ok: boolean, results?: object, metrics?: object|null, error?: string, projectErrors?: string[]|null}>} The worker's reply.
 * @sideEffect Spawns the worker on first call and posts a message to it.
 */
function simulateInWorker(project) {
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
     * @sideEffect Removes the request from `simPending` and resolves its promise.
     */
    simWorker.onmessage = (e) => {
      const resolve = simPending.get(e.data.id)
      if (!resolve) return // superseded and already discarded
      simPending.delete(e.data.id)
      resolve(e.data)
    }
  }
  const id = ++simReqId
  return new Promise((resolve) => {
    simPending.set(id, resolve)
    simWorker.postMessage({ id, project })
  })
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
      if (parsed.ok) return parsed.workspace
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
 * @returns {string} A JSON signature, compared by equality against the last solved one.
 * @pure
 */
function graphSignature(nodes, edges, settings) {
  return JSON.stringify([
    nodes.map((n) => [n.id, n.type, n.data.params]),
    edges.map((e) => [e.source, e.sourceHandle, e.target, e.targetHandle]),
    settings.fmin, settings.fmax, settings.npts, settings.voltage, settings.rg, settings.masking,
    settings.nlEnabled,
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
  // Shown once, before the user has anything to lose: browser storage is the
  // only option today, and its durability is the thing worth saying first.
  workspacePrompt: needsStorageChoice(),
  selectedNodeId: null,
  results: null,
  metrics: null,
  snapshots: [],
  velocityPopupNodeId: null,
  showDriverDB: false,
  showTSCalc: false,
  settings: {
    fmin: 10, fmax: 1000, npts: 512,
    voltage: 2.83, impedance: 4, power: 2, rg: 0,
    vThreshold: 17, masking: false, unwrapPhase: true, delayOffset: 0,
    nlEnabled: false,
  },
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
    const { nodes, edges, history } = get()
    const snap = { nodes: JSON.parse(JSON.stringify(nodes)), edges: JSON.parse(JSON.stringify(edges)) }
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
    const { history, future, nodes, edges } = get()
    if (!history.length) return
    const prev = history[history.length - 1]
    set({
      nodes: prev.nodes, edges: prev.edges,
      history: history.slice(0, -1),
      future: [...future, { nodes, edges }],
    })
    get().scheduleCompute()
  },
  /**
   * Step forward one entry in the history.
   *
   * @returns {void}
   * @sideEffect Writes store state and schedules a resimulation. Does nothing when the redo stack is empty.
   */
  redo: () => {
    const { history, future, nodes, edges } = get()
    if (!future.length) return
    const next = future[future.length - 1]
    set({
      nodes: next.nodes, edges: next.edges,
      future: future.slice(0, -1),
      history: [...history, { nodes, edges }],
    })
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
   * @sideEffect Records history, writes store state and schedules a resimulation.
   */
  onConnect: (conn) => {
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
    const params = { ...DEFAULT_PARAMS[type] }
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
    set({
      nodes: nodes.filter((n) => !n.selected),
      edges: edges.filter((e) => !e.selected && !selNodes.includes(e.source) && !selNodes.includes(e.target)),
      selectedNodeId: null,
    })
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
        data: { params: { ...DEFAULT_PARAMS[n.type], ...JSON.parse(JSON.stringify(n.params)) } },
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
    set({ settings: s })
    get().scheduleCompute()
  },

  // ---- snapshots (compare mode) ----
  /**
   * Freeze the current result as a labelled reference overlay.
   *
   * Capped at three, which is as many as the charts can overlay legibly, and
   * each gets a fixed colour by position so overlays stay visually stable.
   * Only the plotted series are kept, not the whole result.
   *
   * @returns {void}
   * @sideEffect Writes store state. Does nothing without a successful result, or once three snapshots exist.
   */
  takeSnapshot: () => {
    const { results, snapshots, projectName } = get()
    if (!results || !results.ok) return
    if (snapshots.length >= 3) return
    const colors = ['#f59e0b', '#10b981', '#8b5cf6']
    set({
      snapshots: [...snapshots, {
        id: Date.now(),
        label: `${projectName} ${snapshots.length + 1}`,
        color: colors[snapshots.length],
        freqs: results.freqs,
        splCombined: results.splCombined,
        zinMag: results.zinMag,
        excursion: results.excursion,
        excursionRatio: results.excursionRatio,
        groupDelay: results.groupDelay,
        power: results.power,
      }],
    })
  },
  /**
   * Discard a reference overlay.
   *
   * @param {number} id - Snapshot id.
   * @returns {void}
   * @sideEffect Writes store state, mirrored to other windows.
   */
  removeSnapshot: (id) => set({ snapshots: get().snapshots.filter((s) => s.id !== id) }),
  /**
   * Relabel a reference overlay.
   *
   * @param {number} id - Snapshot id.
   * @param {string} label - New label.
   * @returns {void}
   * @sideEffect Writes store state, mirrored to other windows.
   */
  renameSnapshot: (id, label) => set({ snapshots: get().snapshots.map((s) => (s.id === id ? { ...s, label } : s)) }),

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
      const { nodes, edges, settings } = get()
      if (!nodes.length) return
      const sig = graphSignature(nodes, edges, settings)
      if (sig === get()._lastSig && get().results) return
      const token = {}
      set({ _simToken: token })
      const reply = await simulateInWorker({
        nodes: nodes.map((n) => ({ id: n.id, type: n.type, params: n.data.params })),
        edges: edges.map((e) => ({ source: e.source, sourceHandle: e.sourceHandle, target: e.target, targetHandle: e.targetHandle })),
        settings,
      })
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
   * @returns {object} The serialized project: `{schemaVersion, app, name, modified, settings, nodes, edges}`.
   * @sideEffect Reads the current time for the `modified` stamp.
   */
  serialize: () => {
    const { nodes, edges, projectName, settings } = get()
    return {
      schemaVersion: SCHEMA_VERSION,
      app: 'AcouSim',
      name: projectName,
      modified: new Date().toISOString(),
      settings,
      nodes: nodes.map((n) => ({ id: n.id, type: n.type, position: n.position, params: n.data.params })),
      edges: edges.map((e) => ({ id: e.id, source: e.source, sourceHandle: e.sourceHandle, target: e.target, targetHandle: e.targetHandle })),
    }
  },
  /**
   * Replace the current project with a deserialized one.
   *
   * Params are merged over the current defaults, so a project saved by an
   * older build gains any parameter added since. Edges missing an id get one,
   * which hand-written and MCP-generated projects routinely need.
   *
   * History, redo, snapshots and selection are all cleared: they describe the
   * project being replaced and would be meaningless against the new one.
   *
   * @param {object} proj - A serialized project.
   * @returns {void}
   * @sideEffect Replaces store state and schedules a resimulation.
   */
  loadSerialized: (proj) => {
    const nodes = (proj.nodes || []).map((n) => ({
      id: n.id, type: n.type, position: n.position,
      data: { params: { ...DEFAULT_PARAMS[n.type], ...n.params } },
    }))
    const edges = (proj.edges || []).map((e) => ({ ...e, id: e.id || `e_${e.source}_${e.target}_${Math.random().toString(36).slice(2, 7)}` }))
    set({
      nodes, edges,
      projectName: proj.name || '',
      settings: { ...get().settings, ...(proj.settings || {}) },
      history: [], future: [], snapshots: [], selectedNodeId: null,
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
   * Only browser storage exists today, so the choice is nearly rhetorical —
   * but it is asked out loud because browser storage is the one option whose
   * durability the user needs to have been told about before they have work in
   * it. The answer is remembered so the question is asked once, not on every
   * visit.
   *
   * @param {string} kind - Where the workspace lives; only `'browser'` is supported.
   * @returns {void}
   * @sideEffect Writes store state and LocalStorage.
   */
  chooseWorkspaceStorage: (kind) => {
    try { localStorage.setItem(STORAGE_CHOICE_KEY, kind) } catch { /* private mode */ }
    set({ workspacePrompt: false })
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
  })
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
