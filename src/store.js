import { create } from 'zustand'
import { applyNodeChanges, applyEdgeChanges, addEdge } from 'reactflow'
import { runSimulation } from './engine/solver'
import { computeMetrics } from './engine/metrics'

export const SCHEMA_VERSION = 1

export const DEFAULT_PARAMS = {
  driver: {
    Fs: 30, Qts: 0.45, Qes: 0.5, Qms: 5, Vas: 60, Re: 3.6, Bl: 15, Mms: 150,
    Cms: 0.19, Sd: 480, Le: 1.5, LeExp: 1, Xmax: 15, Rms: 4,
    count: 1, wiring: 'single', Q: 50, lossless: true, label: 'Driver',
  },
  chamber: { volume: 30, length: 40, shape: 'rectangular', stuffing: 0, Q: 50, lossless: false, label: 'Chamber' },
  waveguide: { S1: 80, S2: 80, length: 30, flare: 'conical', ecFactor: 0.732, Q: 50, lossless: false, label: 'Port' },
  pr: { Mmd: 85, Cms: 0.35, Rms: 3, Sd: 480, addedMass: 0, Q: 50, lossless: false, space: 'half', label: 'Passive Radiator' },
  radiation: { space: 'half', label: 'Radiation' },
}

let idCounter = 1
export const nextId = (type) => `${type}_${Date.now().toString(36)}_${idCounter++}`

const HISTORY_LIMIT = 80

function graphSignature(nodes, edges, settings) {
  return JSON.stringify([
    nodes.map((n) => [n.id, n.type, n.data.params]),
    edges.map((e) => [e.source, e.sourceHandle, e.target, e.targetHandle]),
    settings.fmin, settings.fmax, settings.npts, settings.voltage, settings.rg, settings.masking,
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
  },
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
  _computeTimer: null,
  _lastSig: '',
  scheduleCompute: () => {
    const st = get()
    if (st._computeTimer) clearTimeout(st._computeTimer)
    const timer = setTimeout(() => {
      const { nodes, edges, settings } = get()
      const sig = graphSignature(nodes, edges, settings)
      if (sig === get()._lastSig && get().results) return
      const xmaxNode = nodes.find((n) => n.type === 'driver')
      const res = runSimulation(nodes, edges, settings)
      const metrics = computeMetrics(res, { ...settings, xmax: xmaxNode?.data.params.Xmax })
      set({ results: res, metrics, _lastSig: sig })
      get().autoSave()
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
    })
    get().scheduleCompute()
  },
  setProjectName: (name) => { set({ projectName: name }); get().autoSave() },
  autoSave: () => {
    try {
      const proj = get().serialize()
      if (!proj.nodes.length) return
      localStorage.setItem(`acousim:project:${proj.name}`, JSON.stringify(proj))
      localStorage.setItem('acousim:lastProject', proj.name)
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
