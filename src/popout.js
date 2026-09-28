// Popped-out panels: any panel — or any whole docked window, tabs and all —
// can be sent to its own browser tab, which the user then drags onto a second
// monitor.
//
// The tab loads the same app at panel?id=<panel> — relative to wherever the
// app is served from — and renders that panel full-window. `id` may name
// several panels, comma-separated, in which case the tab reproduces the docked
// window it came from: the same tab strip over the same panels, with `active`
// naming which one is in front.
//
// Both windows run the same store; a BroadcastChannel keeps the
// shared slice of that store identical between them, so a parameter edited in
// one window redraws the chart in the other.
//
// The main window stays the authority for two things it makes no sense to do
// twice: running the simulation and writing the LocalStorage auto-save.

// Relative rather than absolute, so the app works wherever it is deployed.
// `window.open('panel?…')` resolves against the current directory, which puts a
// panel at /panel when served from a domain root and at /speakerspice/panel when
// served from a subdirectory — a GitHub Pages project site, say. An absolute
// '/panel' would escape to the domain root and 404 in the second case.
/** Path segment a popped-out panel is served from, relative to the app root. */
const PANEL_PATH = 'panel'
/** BroadcastChannel name the windows use to mirror shared state. */
export const SYNC_CHANNEL = 'speakerspice-sync'

/**
 * Store keys mirrored between the main window and every popped-out tab.
 *
 * Anything absent from this list is local UI. The dock layout and the quick bar
 * stay per-window on purpose: a popped-out tab shows one panel, not a copy of
 * the workspace.
 */
export const SHARED_KEYS = [
  'nodes', 'edges', 'projectName', 'settings', 'projectExtras', 'workspace', 'activeFile',
  'results', 'metrics',
  'selectedNodeId', 'velocityPopupNodeId', 'simError', 'xZoom', 'clipboard',
  // Where the workspace is kept. Mirrored so a popped-out explorer reports the
  // truth; the folder itself belongs to the main window, which is the only one
  // that holds its handle and the only one that writes to it.
  'folderStatus', 'folderName', 'folderError', 'folderSaved',
]

/** Shared keys whose change invalidates the current result and forces a resolve. */
export const SIM_INPUT_KEYS = ['nodes', 'edges', 'settings', 'projectExtras']

/**
 * Every panel id this window was opened to show.
 *
 * Checked against the path as well as the query string, so a stray `?id=` on
 * the main app cannot convince it that it is a panel window. The path is
 * matched by suffix because the app may be served from a subdirectory.
 *
 * One id is a single popped-out panel; several are a whole docked window
 * reproduced in a tab. Blank entries are dropped so a trailing comma in a
 * hand-edited URL cannot produce a nameless panel.
 *
 * @returns {string[]} The panel ids in tab order, empty in the main window or outside a browser.
 * @sideEffect Reads `window.location`.
 */
export function popoutPanelIds() {
  if (typeof window === 'undefined') return []
  if (!window.location.pathname.endsWith(`/${PANEL_PATH}`)) return []
  const raw = new URLSearchParams(window.location.search).get('id')
  return raw ? raw.split(',').map((s) => s.trim()).filter(Boolean) : []
}

/**
 * The panel this window is currently showing, if it is a popped-out tab.
 *
 * For a single-panel tab this is that panel. For a whole-window tab it is
 * whichever panel the `active` parameter names, falling back to the first —
 * so the answer is always a panel the window actually holds, which is what
 * makes it safe to use as the initial keyboard focus.
 *
 * @returns {string|null} The panel id, or `null` in the main window or outside a browser.
 * @sideEffect Reads `window.location`.
 */
export function popoutPanelId() {
  const ids = popoutPanelIds()
  if (!ids.length) return null
  const active = new URLSearchParams(window.location.search).get('active')
  return ids.includes(active) ? active : ids[0]
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
 * The URL is relative — `panel?id=<panel>`, not `/panel?id=<panel>` — so it
 * resolves against wherever the app is served from rather than the domain
 * root.
 *
 * @param {string} id - Panel id to show.
 * @returns {Window|null} The panel window, or `null` when the browser blocked it.
 * @sideEffect Opens a browser window and moves focus to it.
 */
export function openPanelWindow(id) {
  const w = window.open(`${PANEL_PATH}?id=${encodeURIComponent(id)}`, `speakerspice-panel-${id}`)
  w?.focus()
  return w
}

/**
 * Open — or focus — a browser tab showing a whole docked window's worth of panels.
 *
 * The tab reproduces the group it came from: the same panels, in the same tab
 * order, with `active` in front.
 *
 * The window name is keyed on the group's members rather than its order, so
 * re-popping the same set of panels focuses the tab already showing them
 * instead of opening a second copy of it.
 *
 * @param {string[]} ids - Panel ids in tab order. An empty list opens nothing.
 * @param {string} [active] - Panel to show first. Defaults to the first id.
 * @returns {Window|null} The panel window, or `null` when the browser blocked it or the list was empty.
 * @sideEffect Opens a browser window and moves focus to it.
 */
export function openPanelGroupWindow(ids, active) {
  if (!ids.length) return null
  const front = ids.includes(active) ? active : ids[0]
  const query = `id=${encodeURIComponent(ids.join(','))}&active=${encodeURIComponent(front)}`
  const name = `speakerspice-group-${[...ids].sort().join('-')}`
  const w = window.open(`${PANEL_PATH}?${query}`, name)
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
