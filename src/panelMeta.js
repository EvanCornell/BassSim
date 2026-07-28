// Panel metadata — plain data, no React. Kept separate from panels.jsx so the
// store can read it (titles, dock hints, which panels exist for sanitizing a
// saved layout) without importing components that import the store back.
//
//   title    label on the tab and in the View menu
//   closable false pins the panel open — the canvas is the workspace itself
//   dock     where View ▸ puts the panel when it isn't already visible
//   requires a settings flag that must be truthy for the panel to be offered
export const PANEL_META = {
  palette: {
    title: 'Palette',
    icon: '🧩',
    closable: true,
    dock: { edge: 'left' },
  },
  canvas: {
    title: 'Node Editor',
    icon: '◈',
    closable: false,
    dock: { edge: 'right' },
  },
  params: {
    title: 'Parameters',
    icon: '⚙',
    closable: true,
    dock: { edge: 'right' },
  },
  results: {
    title: 'Results',
    icon: '📈',
    closable: true,
    dock: { nextTo: 'canvas', zone: 'bottom', edge: 'bottom' },
  },
  nllab: {
    title: 'Nonlinear Lab',
    icon: '⚗',
    closable: true,
    dock: { nextTo: 'canvas', zone: 'center', edge: 'right' },
    requires: 'nlEnabled',
  },
}

export const PANEL_IDS = Object.keys(PANEL_META)

export const panelTitle = (id) => PANEL_META[id]?.title || id
