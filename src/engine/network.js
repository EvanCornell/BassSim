// Graph vocabulary shared by both solvers.
//
// The transfer-matrix solver (solver.js) and the nodal solver (nodal.js) build
// their equations very differently but agree on what the graph *means*: which
// handles exist, how parameters convert to SI, and what a driver looks like
// when it is being pushed around rather than pushing.
import { C, add, div, mul, jw, jwPow } from './complex.js'

// ---------- unit conversion: node params (display units) → SI ----------

export function driverSI(p) {
  const n = Math.max(1, Math.round(p.count || 1))
  let s = 1, par = 1
  if (p.wiring === 'series') s = n
  else if (p.wiring === 'parallel') par = n
  else if (p.wiring === 'series-parallel') {
    const r = Math.round(Math.sqrt(n))
    if (r * r === n && r > 1) { s = r; par = r } else { par = n }
  }
  const Sd = (p.Sd || 500) * 1e-4 // cm² → m²
  const Mms = (p.Mms || 100) * 1e-3 // g → kg
  const Cms = (p.Cms || 0.2) * 1e-3 // mm/N → m/N
  return {
    n, s, par,
    Re: ((p.Re || 4) * s) / par,
    Le: (((p.Le || 1) * 1e-3) * s) / par, // mH → H
    LeExp: p.LeExp ?? 1,
    Bl: (p.Bl || 15) * s,
    Sd: Sd * n,
    Mms: Mms * n,
    Cms: Cms / n,
    Rms: (p.Rms || 3) * n,
    Fs: p.Fs || 30,
    Xmax: (p.Xmax || 10) * 1e-3,
    Q: normQ(p),
  }
}

export function normQ(p) {
  if (p.lossless) return Infinity
  const q = p.Q ?? 50
  return q > 0 ? q : Infinity
}

// Electrical impedance seen by the motor, including any amplifier source
// resistance.
export function driverZe(d, Rg, w) {
  return add(C(Rg + d.Re, 0), mul(C(d.Le, 0), jwPow(w, d.LeExp)))
}

// Mechanical impedance of the moving system on its own (mass, compliance,
// mechanical + Q losses) — no electrical reflection.
export function driverZm(d, w) {
  return add(
    C(d.Rms + (isFinite(d.Q) ? (2 * Math.PI * d.Fs * d.Mms) / d.Q : 0), 0),
    add(C(0, w * d.Mms), div(C(1, 0), jw(w * d.Cms))),
  )
}

// Blocked mechanical impedance: what a driver presents when something else is
// moving its cone. The Bl²/Ze term is the motor damping the motion.
export function driverPassiveMechZ(d, Rg, w) {
  return add(driverZm(d, w), div(C(d.Bl * d.Bl, 0), driverZe(d, Rg, w)))
}

// ---------- graph model ----------

// Adjacency: for each node+handle, the list of connected {node, handle}
export function buildGraph(nodes, edges) {
  const byId = new Map(nodes.map((n) => [n.id, n]))
  const out = new Map() // `${id}:${handle}` -> [{node, handle}]
  for (const e of edges) {
    const src = byId.get(e.source)
    const tgt = byId.get(e.target)
    if (!src || !tgt) continue
    const key = `${e.source}:${e.sourceHandle}`
    if (!out.has(key)) out.set(key, [])
    out.get(key).push({ node: tgt, handle: e.targetHandle })
    const rkey = `${e.target}:${e.targetHandle}`
    if (!out.has(rkey)) out.set(rkey, [])
    out.get(rkey).push({ node: src, handle: e.sourceHandle })
  }
  return { byId, adj: out }
}

// The output handle of a two-port, by node type.
export const outHandleOf = (type) => (type === 'waveguide' ? 'mouth' : 'out')
export const inHandleOf = (type) => (type === 'waveguide' ? 'throat' : 'in')

export function validateGraph(nodes, edges, solver = 'chain') {
  const { adj } = buildGraph(nodes, edges)
  const warnings = {}
  const errors = []
  const connected = (id, h) => (adj.get(`${id}:${h}`) || []).length > 0
  // Several edges arriving at one input port is a real acoustic junction, but
  // only the nodal solver treats it as one; the chain solver superposes the
  // sources without letting them load each other.
  const inCounts = new Map()
  for (const e of edges) {
    const k = `${e.target}:${e.targetHandle}`
    inCounts.set(k, (inCounts.get(k) || 0) + 1)
  }
  const multiFed = new Set(
    [...inCounts.entries()].filter(([, c]) => c > 1).map(([k]) => k.split(':')[0]),
  )
  const drivers = nodes.filter((n) => n.type === 'driver')
  if (drivers.length === 0) errors.push('Add a Driver node to run a simulation.')
  for (const n of nodes) {
    const w = []
    if (multiFed.has(n.id) && solver !== 'nodal') {
      w.push('Multiple edges feed this input port. Driven sources are superposed but do not load each other (approximate — OK for e.g. a series-bandpass cabin fed by driver rear + port). A passive side branch (closed stub) here would be ignored: branch stubs FROM an output port instead. The nodal solver (Settings ▸ Application) solves this junction properly.')
    }
    if (n.type === 'driver') {
      if (!connected(n.id, 'front') && !connected(n.id, 'rear'))
        w.push('Neither driver port is connected — both radiate into half space by default.')
    } else if (n.type === 'waveguide') {
      if (!connected(n.id, 'throat')) w.push('Throat is not connected.')
      if (!connected(n.id, 'mouth')) w.push('Mouth is unconnected — treated as radiating into half space.')
    } else if (n.type === 'chamber') {
      if (!connected(n.id, 'in')) w.push('Chamber inlet is not connected.')
    } else if (n.type === 'radiation') {
      if (!connected(n.id, 'in')) w.push('Radiation termination has no input.')
    } else if (n.type === 'pr') {
      if (!connected(n.id, 'in')) w.push('Passive radiator is not mounted to anything.')
    }
    if (w.length) warnings[n.id] = w
  }
  return { warnings, errors }
}
