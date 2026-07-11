// Phase-2 helpers for the MCP server: driver lookup, self-calibrating
// enclosure builders, an optimizer, and comparison scoring.
import { BUILTIN_DRIVERS } from '../src/data/drivers.js'
import { C_AIR } from '../src/engine/acoustics.js'

// ---------- driver lookup ----------

export function searchDrivers({ query, fs_max, xmax_min, sd_min, sd_max } = {}) {
  let rows = BUILTIN_DRIVERS
  if (query) {
    const q = String(query).toLowerCase()
    rows = rows.filter((d) => `${d.brand} ${d.model}`.toLowerCase().includes(q))
  }
  if (fs_max != null) rows = rows.filter((d) => d.Fs <= fs_max)
  if (xmax_min != null) rows = rows.filter((d) => d.Xmax >= xmax_min)
  if (sd_min != null) rows = rows.filter((d) => d.Sd >= sd_min)
  if (sd_max != null) rows = rows.filter((d) => d.Sd <= sd_max)
  return rows
}

export function findDriver(query) {
  const rows = searchDrivers({ query })
  if (rows.length === 1) return rows[0]
  if (rows.length === 0) {
    throw new Error(`No driver in the library matches "${query}". Use driver_search to browse, or pass explicit T/S params.`)
  }
  const exact = rows.find((d) => `${d.brand} ${d.model}`.toLowerCase() === String(query).toLowerCase()
    || d.model.toLowerCase() === String(query).toLowerCase())
  if (exact) return exact
  throw new Error(`"${query}" is ambiguous: ${rows.map((d) => `${d.brand} ${d.model}`).join('; ')}`)
}

// driver spec → driver node params. spec = { db: "name" } and/or explicit
// T/S overrides, plus count/wiring.
export function driverParams(spec = {}) {
  let base = {}
  let label = spec.label || 'Driver'
  if (spec.db) {
    const d = findDriver(spec.db)
    const { brand, model, ...ts } = d
    base = ts
    label = spec.label || model
  }
  const { db, count, wiring, ...overrides } = spec
  return {
    ...base, ...overrides, label,
    count: count || 1, wiring: wiring || (count > 1 ? 'parallel' : 'single'),
  }
}

// ---------- project assembly ----------

let bid = 0
const nid = (t) => `${t}_${++bid}`
const pos = (col, row = 0) => ({ x: 80 + col * 260, y: 120 + row * 200 })

function baseProject(name, settings = {}) {
  return {
    app: 'AcouSim', schemaVersion: 1, name,
    settings: { fmin: 10, fmax: 200, npts: 256, voltage: 2.83, impedance: 4, ...settings },
    nodes: [], edges: [],
  }
}

function addNode(p, type, params, col, row = 0) {
  const id = nid(type)
  p.nodes.push({ id, type, position: pos(col, row), params })
  return id
}

const edge = (p, source, sourceHandle, target, targetHandle) =>
  p.edges.push({ source, sourceHandle, target, targetHandle })

// analytic Helmholtz port length for a target fb (first guess only; the
// builder then calibrates against the simulated impedance minimum)
export function portLengthGuess(fb, volumeL, areaCm2, ecFactor = 0.732) {
  const S = areaCm2 * 1e-4
  const V = volumeL * 1e-3
  const w = 2 * Math.PI * fb
  const Leff = (C_AIR * C_AIR * S) / (w * w * V)
  const ec = 2 * ecFactor * Math.sqrt(S / Math.PI) // both ends
  return Math.max((Leff - ec) * 100, 1) // cm
}

// Bisect a port's length until the simulated tuning matches targetFb.
// simulateFb(project) must return the tuning in Hz (or null).
export function calibratePort(project, portId, targetFb, simulateFb) {
  const setLen = (p, L) => { p.nodes.find((n) => n.id === portId).params.length = L }
  const fbAt = (L) => {
    const p = structuredClone(project)
    setLen(p, L)
    return simulateFb(p)
  }
  const port = project.nodes.find((n) => n.id === portId)
  let lo = Math.max(port.params.length / 4, 0.5)
  let hi = port.params.length * 4
  // fb falls as length grows; widen until bracketed
  for (let k = 0; k < 4 && (fbAt(hi) ?? 0) > targetFb; k++) hi *= 2
  for (let k = 0; k < 4 && (fbAt(lo) ?? 1e9) < targetFb; k++) lo /= 2
  let L = port.params.length
  for (let k = 0; k < 14; k++) {
    L = (lo + hi) / 2
    const fb = fbAt(L)
    if (fb == null) break
    if (Math.abs(fb - targetFb) < 0.05) break
    if (fb > targetFb) lo = L
    else hi = L
  }
  L = Math.round(L * 10) / 10
  setLen(project, L)
  return L
}

// ---------- topologies ----------
// Each builder returns { project, notes: [] }. Ports are built at the
// analytic guess; the server calibrates them afterwards.

export function buildSealedBox({ driver, volume, name, settings }) {
  const p = baseProject(name || 'Sealed box', settings)
  const d = addNode(p, 'driver', driverParams(driver), 0)
  const c = addNode(p, 'chamber', { volume, label: 'Sealed chamber' }, 1)
  edge(p, d, 'rear', c, 'in')
  return { project: p, notes: ['Driver front radiates into half space; rear loads the sealed chamber.'] }
}

export function buildPortedBox({ driver, volume, tuning, port_area, port_length, port_count = 1, name, settings }) {
  const p = baseProject(name || 'Ported box', settings)
  const dp = driverParams(driver)
  const S = port_area || Math.round(((dp.Sd || 480) * (dp.count || 1)) / 4 / (port_count || 1))
  const L = port_length || portLengthGuess(tuning || 32, volume, S * port_count)
  const d = addNode(p, 'driver', dp, 0)
  const c = addNode(p, 'chamber', { volume, label: 'Box' }, 1)
  edge(p, d, 'rear', c, 'in')
  const ports = []
  for (let k = 0; k < port_count; k++) {
    const w = addNode(p, 'waveguide', { S1: S, S2: S, length: L, flare: 'conical', label: port_count > 1 ? `Port ${k + 1}` : 'Port' }, 2, k)
    edge(p, c, 'out', w, 'throat')
    ports.push(w)
  }
  return {
    project: p, ports,
    notes: [`Port area ${S} cm² each × ${port_count} (default ≈ Sd/4 total when not specified).`],
  }
}

export function buildBandpass4({ driver, front_volume, rear_volume, tuning, port_area, name, settings }) {
  const p = baseProject(name || '4th-order bandpass', settings)
  const dp = driverParams(driver)
  const S = port_area || Math.round(((dp.Sd || 480) * (dp.count || 1)) / 4)
  const d = addNode(p, 'driver', dp, 0)
  const rear = addNode(p, 'chamber', { volume: rear_volume, label: 'Rear sealed' }, 0, 1)
  const front = addNode(p, 'chamber', { volume: front_volume, label: 'Front chamber' }, 1)
  const port = addNode(p, 'waveguide', { S1: S, S2: S, length: portLengthGuess(tuning || 45, front_volume, S), flare: 'conical', label: 'Port' }, 2)
  edge(p, d, 'rear', rear, 'in')
  edge(p, d, 'front', front, 'in')
  edge(p, front, 'out', port, 'throat')
  return {
    project: p, ports: [port],
    notes: ['Driver is buried: rear sealed, front vents through the port. All output comes from the port.'],
  }
}

export function buildBandpass6({ driver, front_volume, rear_volume, front_tuning, rear_tuning, port_area, name, settings }) {
  const p = baseProject(name || '6th-order bandpass (parallel)', settings)
  const dp = driverParams(driver)
  const S = port_area || Math.round(((dp.Sd || 480) * (dp.count || 1)) / 4)
  const d = addNode(p, 'driver', dp, 0)
  const rear = addNode(p, 'chamber', { volume: rear_volume, label: 'Rear chamber' }, 1, 1)
  const front = addNode(p, 'chamber', { volume: front_volume, label: 'Front chamber' }, 1)
  const fPort = addNode(p, 'waveguide', { S1: S, S2: S, length: portLengthGuess(front_tuning || 55, front_volume, S), flare: 'conical', label: 'Front port' }, 2)
  const rPort = addNode(p, 'waveguide', { S1: S, S2: S, length: portLengthGuess(rear_tuning || 30, rear_volume, S), flare: 'conical', label: 'Rear port' }, 2, 1)
  edge(p, d, 'front', front, 'in')
  edge(p, d, 'rear', rear, 'in')
  edge(p, front, 'out', fPort, 'throat')
  edge(p, rear, 'out', rPort, 'throat')
  return {
    project: p, ports: [fPort, rPort],
    notes: ['Parallel 6th order: both chambers vent outside. Tune the rear port low and the front port high; the two tunings set the passband edges.'],
  }
}

export const BUILDERS = {
  sealed: buildSealedBox,
  ported: buildPortedBox,
  bandpass4: buildBandpass4,
  bandpass6: buildBandpass6,
}

// ---------- optimizer ----------
// Coordinate grid-refinement: for each round, sweep each free parameter on a
// grid across its current range, keep the best, shrink the range around it.
// score(project) → higher is better (constraints folded in as penalties).

export function optimizeProject(project, params, score, { rounds = 3, gridN = 9 } = {}) {
  const getVal = (p, prm) => prm.node
    ? p.nodes.find((n) => n.id === prm.node).params[prm.param]
    : p.settings[prm.param]
  const setVal = (p, prm, v) => {
    if (prm.node) {
      const n = p.nodes.find((x) => x.id === prm.node)
      n.params = { ...(n.params || {}), [prm.param]: v }
    } else p.settings = { ...(p.settings || {}), [prm.param]: v }
  }
  let best = structuredClone(project)
  // start from mid-range for any param whose current value is outside its bounds
  for (const prm of params) {
    const v = getVal(best, prm)
    if (!(v >= prm.min && v <= prm.max)) setVal(best, prm, (prm.min + prm.max) / 2)
  }
  let bestScore = score(best)
  let evals = 1
  const ranges = params.map((prm) => [prm.min, prm.max])
  for (let r = 0; r < rounds; r++) {
    for (let pi = 0; pi < params.length; pi++) {
      const [lo, hi] = ranges[pi]
      let cbV = getVal(best, params[pi])
      for (let k = 0; k < gridN; k++) {
        const v = lo + ((hi - lo) * k) / (gridN - 1)
        const cand = structuredClone(best)
        setVal(cand, params[pi], v)
        const s = score(cand)
        evals++
        if (s > bestScore) { bestScore = s; best = cand; cbV = v }
      }
      // shrink range around the winner
      const span = (hi - lo) / 2
      ranges[pi] = [
        Math.max(params[pi].min, cbV - span / 2),
        Math.min(params[pi].max, cbV + span / 2),
      ]
    }
  }
  return { best, bestScore, evals, values: params.map((prm) => getVal(best, prm)) }
}
