// Panel metadata — plain data, no React. Kept separate from panels.jsx so the
// store can read it (titles, dock hints, which panels exist for sanitizing a
// saved layout) without importing components that import the store back.
//
//   title    label on the tab and in the View menu
//   group    'main' panels are listed directly under View; 'charts' go into
//            the View ▸ Charts submenu so the menu stays short
//   closable false pins the panel open — the canvas is the workspace itself
//   dock     where View ▸ puts the panel when it isn't already visible
//   requires a settings flag that must be truthy for the panel to be offered
export const PANEL_META = {
  palette: {
    title: 'Palette',
    group: 'main',
    closable: true,
    dock: { edge: 'left' },
  },
  canvas: {
    title: 'Node Editor',
    group: 'main',
    closable: false,
    dock: { edge: 'right' },
  },
  params: {
    title: 'Parameters',
    group: 'main',
    closable: true,
    dock: { edge: 'right' },
  },
  nllab: {
    title: 'Nonlinear Lab',
    group: 'main',
    closable: true,
    dock: { nextTo: 'canvas', zone: 'center', edge: 'right' },
    requires: 'nlEnabled',
  },

  // Every plot is an independent panel, so any combination of them can be
  // tiled side by side instead of hidden behind one another.
  spl: { title: 'SPL Response', group: 'charts' },
  zin: { title: 'Impedance', group: 'charts' },
  exc: { title: 'Cone Excursion', group: 'charts' },
  vel: { title: 'Port Velocity', group: 'charts' },
  int: { title: 'Interior SPL', group: 'charts' },
  pow: { title: 'Acoustic Power', group: 'charts' },
  eff: { title: 'Efficiency', group: 'charts' },
  pe: { title: 'Electrical Power', group: 'charts' },
  ph: { title: 'Phase & Group Delay', group: 'charts' },
}

export const PANEL_IDS = Object.keys(PANEL_META)

export const CHART_IDS = PANEL_IDS.filter((id) => PANEL_META[id].group === 'charts')
export const MAIN_IDS = PANEL_IDS.filter((id) => PANEL_META[id].group === 'main')

// Charts are interchangeable, so opening one joins whichever chart stack is
// already on screen rather than aiming at a single fixed neighbour.
for (const id of CHART_IDS) {
  PANEL_META[id].closable = true
  PANEL_META[id].dock = { nextToAny: CHART_IDS, zone: 'center', edge: 'bottom' }
}

export const panelTitle = (id) => PANEL_META[id]?.title || id
