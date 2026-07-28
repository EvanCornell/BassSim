import { create } from 'zustand'
import { applyNodeChanges, applyEdgeChanges, addEdge } from 'reactflow'
import { SCHEMA_VERSION, DEFAULT_PARAMS } from './engine/project'
import * as L from './layout'
import { PANEL_META, PANEL_IDS } from './panelMeta'
import { exportProjectJSON } from './utils/export'

const LAYOUT_KEY = 'acousim:layout'
const PRESETS_KEY = 'acousim:layoutPresets'

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

function loadPresets() {
  try {
    const raw = JSON.parse(localStorage.getItem(PRESETS_KEY))
    return Array.isArray(raw) ? raw : []
  } catch { return [] }
}

export { SCHEMA_VERSION, DEFAULT_PARAMS }

let idCounter = 1
export const nextId = (type) => `${type}_${Date.now().toString(36)}_${idCounter++}`

const HISTORY_LIMIT = 80

function graphSignature(nodes, edges, settings) {
  return JSON.stringify([
    nodes.map((n) => [n.id, n.type, n.data.params]),
    edges.map((e) => [e.source, e.sourceHandle, e.target, e.targetHandle]),
    settings.fmin, settings.fmax, settings.npts, settings.voltage, settings.rg, settings.masking,
    settings.nlEnabled,
  ])
}

export const useStore = create((set, get) => ({
  nodes: [],
  edges: [],
  projectName: 'Untitled',
  selectedNodeId: null,
  results: null,
  metrics: null,
  snapshots: [],
  velocityPopupNodeId: null,
  showDriverDB: false,
  showProjectManager: false,
  showTSCalc: false,
  restorePrompt: null,
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
  focusedPanel: 'canvas',   // which panel owns the keyboard right now
  draggingPanel: null,      // panel id mid tab-drag (drives the drop targets)
  showSettings: false,      // floating settings window

  setDraggingPanel: (id) => set({ draggingPanel: id }),
  focusPanel: (id) => { if (get().focusedPanel !== id) set({ focusedPanel: id }) },
  toggleMaximize: (id) => set({ maximized: get().maximized === id ? null : id }),
  setShowSettings: (v) => set({ showSettings: v }),

  _commitLayout: (tree) => {
    if (!tree) return
    set({ layout: tree })
    try {
      localStorage.setItem(LAYOUT_KEY, JSON.stringify({ version: L.LAYOUT_VERSION, tree }))
    } catch { /* quota — the layout just won't survive a reload */ }
  },

  layoutOps: {
    activate: (stackId, panelId) => get()._commitLayout(L.setActive(get().layout, stackId, panelId)),
    dock: (panelId, stackId, zone) => get()._commitLayout(L.dockPanel(get().layout, panelId, stackId, zone)),
    dockEdge: (panelId, edge) => get()._commitLayout(L.dockToEdge(get().layout, panelId, edge)),
    resize: (splitId, index, a, b) => get()._commitLayout(L.resizeChildren(get().layout, splitId, index, a, b)),
    // Dropping onto a tab reorders within the stack, or tabs the panel in
    // from elsewhere at that position.
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
    close: (panelId) => {
      if (PANEL_META[panelId]?.closable === false) return
      const next = L.removePanel(get().layout, panelId)
      if (!next) return
      if (get().maximized === panelId) set({ maximized: null })
      get()._commitLayout(next)
    },
    open: (panelId) => {
      set({ maximized: null })
      get()._commitLayout(L.openPanel(get().layout, panelId, PANEL_META[panelId]?.dock))
      get().focusPanel(panelId)
    },
    toggle: (panelId) => {
      const ops = get().layoutOps
      if (L.isOpen(get().layout, panelId)) ops.close(panelId)
      else ops.open(panelId)
    },
    reset: () => { set({ maximized: null }); get()._commitLayout(L.defaultLayout()) },
  },

  saveLayoutPreset: (name) => {
    const presets = [
      ...get().layoutPresets.filter((p) => p.name !== name),
      { name, tree: get().layout },
    ]
    set({ layoutPresets: presets })
    try { localStorage.setItem(PRESETS_KEY, JSON.stringify(presets)) } catch { /* quota */ }
  },
  applyLayoutPreset: (name) => {
    const p = get().layoutPresets.find((x) => x.name === name)
    if (!p) return
    const clean = L.sanitize(p.tree, PANEL_IDS)
    if (!clean) return
    set({ maximized: null })
    get()._commitLayout(L.isOpen(clean, 'canvas') ? clean : L.dockToEdge(clean, 'canvas', 'right'))
  },
  deleteLayoutPreset: (name) => {
    const presets = get().layoutPresets.filter((p) => p.name !== name)
    set({ layoutPresets: presets })
    try { localStorage.setItem(PRESETS_KEY, JSON.stringify(presets)) } catch { /* quota */ }
  },

  // per-chart X-axis zoom (drag-select on the plots); not persisted
  xZoom: {},
  setXZoom: (id, range) => set({ xZoom: { ...get().xZoom, [id]: range } }),
  history: [],
  future: [],

  // ---- history ----
  pushHistory: () => {
    const { nodes, edges, history } = get()
    const snap = { nodes: JSON.parse(JSON.stringify(nodes)), edges: JSON.parse(JSON.stringify(edges)) }
    set({ history: [...history.slice(-HISTORY_LIMIT), snap], future: [] })
  },
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
  onNodesChange: (changes) => {
    set({ nodes: applyNodeChanges(changes, get().nodes) })
    if (changes.some((c) => c.type === 'remove')) get().scheduleCompute()
  },
  onEdgesChange: (changes) => {
    if (changes.some((c) => c.type === 'remove')) get().pushHistory()
    set({ edges: applyEdgeChanges(changes, get().edges) })
    if (changes.some((c) => c.type === 'remove')) get().scheduleCompute()
  },
  onConnect: (conn) => {
    get().pushHistory()
    set({ edges: addEdge({ ...conn, type: 'default' }, get().edges) })
    get().scheduleCompute()
  },
  setSelected: (id) => set({ selectedNodeId: id }),

  addNode: (type, position) => {
    get().pushHistory()
    const id = nextId(type)
    const params = { ...DEFAULT_PARAMS[type] }
    const node = { id, type, position, data: { params } }
    set({ nodes: [...get().nodes, node], selectedNodeId: id })
    get().scheduleCompute()
    return id
  },

  updateParams: (id, patch) => {
    set({
      nodes: get().nodes.map((n) =>
        n.id === id ? { ...n, data: { ...n.data, params: { ...n.data.params, ...patch } } } : n),
    })
    get().scheduleCompute()
  },

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
    set({ nodes: [...nodes.map((n) => ({ ...n, selected: false })), ...copies.map((c) => ({ ...c, selected: true }))] })
    get().scheduleCompute()
  },

  selectAll: () => set({ nodes: get().nodes.map((n) => ({ ...n, selected: true })) }),

  // ---- settings / amplifier ----
  updateSettings: (patch) => {
    set({ settings: { ...get().settings, ...patch } })
    get().scheduleCompute()
  },
  // Ohm's-law linked amplifier fields: pass which field was edited
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
        groupDelay: results.groupDelay,
        power: results.power,
      }],
    })
  },
  removeSnapshot: (id) => set({ snapshots: get().snapshots.filter((s) => s.id !== id) }),
  renameSnapshot: (id, label) => set({ snapshots: get().snapshots.map((s) => (s.id === id ? { ...s, label } : s)) }),

  // ---- UI toggles ----
  setVelocityPopup: (id) => set({ velocityPopupNodeId: id }),
  setShowDriverDB: (v) => set({ showDriverDB: v }),
  setShowProjectManager: (v) => set({ showProjectManager: v }),
  setShowTSCalc: (v) => set({ showTSCalc: v }),
  setRestorePrompt: (v) => set({ restorePrompt: v }),

  // ---- compute pipeline (debounced 150 ms) ----
  // Simulation runs SERVER-SIDE: the engine never ships to the browser.
  // The debounce collapses slider drags; an AbortController cancels the
  // in-flight request when a newer edit supersedes it.
  _computeTimer: null,
  _lastSig: '',
  _abort: null,
  simError: null,
  scheduleCompute: () => {
    const st = get()
    if (st._computeTimer) clearTimeout(st._computeTimer)
    const timer = setTimeout(async () => {
      const { nodes, edges, settings } = get()
      if (!nodes.length) return
      const sig = graphSignature(nodes, edges, settings)
      if (sig === get()._lastSig && get().results) return
      get()._abort?.abort()
      const ctrl = new AbortController()
      set({ _abort: ctrl })
      try {
        const r = await fetch('/api/simulate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: ctrl.signal,
          body: JSON.stringify({
            nodes: nodes.map((n) => ({ id: n.id, type: n.type, params: n.data.params })),
            edges: edges.map((e) => ({ source: e.source, sourceHandle: e.sourceHandle, target: e.target, targetHandle: e.targetHandle })),
            settings,
          }),
        })
        if (!r.ok) throw new Error(`server responded ${r.status}`)
        const { results, metrics } = await r.json()
        if (get()._abort !== ctrl) return // a newer request superseded this one
        set({ results, metrics, _lastSig: sig, simError: null })
        get().autoSave()
      } catch (e) {
        if (e.name === 'AbortError' || get()._abort !== ctrl) return
        set({ simError: `Simulation service unreachable (${e.message}). Retrying on next edit.`, _lastSig: '' })
      }
    }, 150)
    set({ _computeTimer: timer })
  },

  // ---- persistence ----
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
  loadSerialized: (proj) => {
    const nodes = (proj.nodes || []).map((n) => ({
      id: n.id, type: n.type, position: n.position,
      data: { params: { ...DEFAULT_PARAMS[n.type], ...n.params } },
    }))
    const edges = (proj.edges || []).map((e) => ({ ...e, id: e.id || `e_${e.source}_${e.target}_${Math.random().toString(36).slice(2, 7)}` }))
    set({
      nodes, edges,
      projectName: proj.name || 'Untitled',
      settings: { ...get().settings, ...(proj.settings || {}) },
      history: [], future: [], snapshots: [], selectedNodeId: null,
      _lastSavedName: proj.name || 'Untitled',
    })
    get().scheduleCompute()
  },
  // Renaming debounces the save so intermediate keystrokes never persist,
  // and a completed rename MOVES the auto-save (old key is removed).
  _nameTimer: null,
  _lastSavedName: null,
  setProjectName: (name) => {
    set({ projectName: name })
    const t = get()._nameTimer
    if (t) clearTimeout(t)
    set({ _nameTimer: setTimeout(() => get().autoSave(), 1000) })
  },
  // Menu and keyboard both reach these, so they live here rather than in one
  // of the two call sites.
  newProject: () => {
    if (get().nodes.length && !confirm('Start a new project? Current graph is auto-saved under its project name.')) return
    get().loadSerialized({ name: `Untitled ${new Date().toLocaleTimeString()}`, nodes: [], edges: [] })
  },
  saveProjectJSON: () => {
    get().autoSave()
    exportProjectJSON(get().serialize())
  },
  autoSave: () => {
    try {
      const proj = get().serialize()
      if (!proj.nodes.length) return
      const prev = get()._lastSavedName
      localStorage.setItem(`acousim:project:${proj.name}`, JSON.stringify(proj))
      localStorage.setItem('acousim:lastProject', proj.name)
      if (prev && prev !== proj.name) localStorage.removeItem(`acousim:project:${prev}`)
      set({ _lastSavedName: proj.name })
    } catch { /* quota */ }
  },
}))

export function listSavedProjects() {
  const out = []
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i)
    if (k && k.startsWith('acousim:project:')) {
      try {
        const p = JSON.parse(localStorage.getItem(k))
        out.push({ key: k, name: p.name, modified: p.modified, nodeCount: (p.nodes || []).length, proj: p })
      } catch { /* skip corrupt */ }
    }
  }
  return out.sort((a, b) => (b.modified || '').localeCompare(a.modified || ''))
}
