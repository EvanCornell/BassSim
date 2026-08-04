// Popped-out panels: any panel can be sent to its own browser tab, which the
// user then drags onto a second monitor.
//
// The tab loads the same app at /panel?id=<panel> and renders that one panel
// full-window. Both windows run the same store; a BroadcastChannel keeps the
// shared slice of that store identical between them, so a parameter edited in
// one window redraws the chart in the other.
//
// The main window stays the authority for two things it makes no sense to do
// twice: running the simulation and writing the LocalStorage auto-save.

/** Path a popped-out panel is served from. */
const PANEL_PATH = '/panel'
/** BroadcastChannel name the windows use to mirror shared state. */
export const SYNC_CHANNEL = 'acousim-sync'

/**
 * Store keys mirrored between the main window and every popped-out tab.
 *
 * Anything absent from this list is local UI. The dock layout and the quick bar
 * stay per-window on purpose: a popped-out tab shows one panel, not a copy of
 * the workspace.
 */
export const SHARED_KEYS = [
  'nodes', 'edges', 'projectName', 'settings',
  'results', 'metrics', 'snapshots',
  'selectedNodeId', 'velocityPopupNodeId', 'simError', 'xZoom', 'clipboard',
]

/** Shared keys whose change invalidates the current result and forces a resolve. */
export const SIM_INPUT_KEYS = ['nodes', 'edges', 'settings']

/**
 * The panel id this window was opened to show, if it is a popped-out tab.
 *
 * Checked against the path as well as the query string, so a stray `?id=` on
 * the main app cannot convince it that it is a panel window.
 *
 * @returns {string|null} The panel id, or `null` in the main window or outside a browser.
 * @sideEffect Reads `window.location`.
 */
export function popoutPanelId() {
  if (typeof window === 'undefined') return null
  if (window.location.pathname !== PANEL_PATH) return null
  return new URLSearchParams(window.location.search).get('id')
}

/**
 * Whether this window is a popped-out panel rather than the main workspace.
 *
 * Gates the two responsibilities the main window keeps to itself: running the
 * solver and writing the auto-save.
 *
 * @returns {boolean} True in a panel tab.
 * @sideEffect Reads `window.location` via `popoutPanelId`.
 */
export const isPopout = () => popoutPanelId() != null

/**
 * Open — or focus — the browser tab showing one panel.
 *
 * The window name is keyed on the panel id, so a second click focuses the
 * existing tab instead of opening a duplicate.
 *
 * @param {string} id - Panel id to show.
 * @returns {Window|null} The panel window, or `null` when the browser blocked it.
 * @sideEffect Opens a browser window and moves focus to it.
 */
export function openPanelWindow(id) {
  const w = window.open(`${PANEL_PATH}?id=${encodeURIComponent(id)}`, `acousim-panel-${id}`)
  w?.focus()
  return w
}

/**
 * The shared BroadcastChannel, or `null` where the API is unavailable.
 *
 * Null-checked at every use rather than polyfilled: without it the app still
 * works, it just cannot mirror state between windows.
 */
export const channel = typeof BroadcastChannel !== 'undefined'
  ? new BroadcastChannel(SYNC_CHANNEL)
  : null
