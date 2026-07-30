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

const PANEL_PATH = '/panel'
export const SYNC_CHANNEL = 'acousim-sync'

// State every window agrees on. Anything absent from this list is local UI —
// the dock layout and the quick bar stay per-window, which is the point: the
// popped-out tab is showing one panel, not a copy of the workspace.
export const SHARED_KEYS = [
  'nodes', 'edges', 'projectName', 'settings',
  'results', 'metrics', 'snapshots',
  'selectedNodeId', 'velocityPopupNodeId', 'simError', 'xZoom', 'clipboard',
]

// Editing any of these means the simulation is stale.
export const SIM_INPUT_KEYS = ['nodes', 'edges', 'settings']

export function popoutPanelId() {
  if (typeof window === 'undefined') return null
  if (window.location.pathname !== PANEL_PATH) return null
  return new URLSearchParams(window.location.search).get('id')
}

export const isPopout = () => popoutPanelId() != null

// Reuses the tab if one is already open for this panel (the window name is
// keyed on the panel id), so a second click focuses rather than duplicates.
export function openPanelWindow(id) {
  const w = window.open(`${PANEL_PATH}?id=${encodeURIComponent(id)}`, `acousim-panel-${id}`)
  w?.focus()
  return w
}

export const channel = typeof BroadcastChannel !== 'undefined'
  ? new BroadcastChannel(SYNC_CHANNEL)
  : null
