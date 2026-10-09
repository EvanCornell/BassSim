// Structural checks on a resolved v3 project.
//
// Two severities, and the line between them is deliberate. An *error* is
// something that cannot be simulated at all — a missing driver, an edge to a
// node that does not exist, a volume of zero. A *warning* is something that
// can be simulated but is physically questionable, or may not be what the
// user meant; it never blocks a run. Warnings are keyed by node id so the
// editor can show each one on the node it concerns.

import { DEFAULT_PARAMS, NODE_HANDLES, PROBE_KINDS } from './version.js'
import { filterSections } from '../spice/filters.js'
import { displayNames } from '../nodeNames.js'

/**
 * Every handle a node exposes, taps included.
 *
 * @param {object} node - A v3 node.
 * @returns {string[]} Handle names an edge may use on it.
 * @pure
 */
export function nodeHandles(node) {
  const base = NODE_HANDLES[node.type] || []
  const taps = Array.isArray(node.params?.taps) ? node.params.taps.map((t) => `tap:${t.id}`) : []
  return [...base, ...taps]
}

/**
 * Collect the driver ids at the leaves of a series/parallel load tree.
 *
 * @param {object|null} tree - `{parallel: [...]}`, `{series: [...]}` or `{driver: id}`.
 * @param {string[]} [out] - Accumulator.
 * @returns {string[]} Driver ids in tree order, duplicates included.
 * @pure
 */
export function loadLeaves(tree, out = []) {
  if (!tree) return out
  if (tree.driver) out.push(tree.driver)
  for (const k of ['parallel', 'series']) {
    if (Array.isArray(tree[k])) for (const t of tree[k]) loadLeaves(t, out)
  }
  return out
}

/**
 * Which channel drives each driver node.
 *
 * A channel's explicit load tree claims its leaves. The one channel whose
 * `load` is `null` takes every driver no tree claimed, in parallel — which is
 * what keeps a newly added driver driven without anyone editing a tree. A
 * driver claimed by no channel is undriven.
 *
 * @param {object} proj - A v3 project.
 * @returns {Map<string, string>} Driver node id → channel id.
 * @pure
 */
export function driverChannels(proj) {
  const drivers = (proj.nodes || []).filter((n) => n.type === 'driver').map((n) => n.id)
  const out = new Map()
  const channels = proj.wiring?.channels || []
  for (const c of channels) {
    for (const id of loadLeaves(c.load)) if (!out.has(id)) out.set(id, c.id)
  }
  const catchAll = channels.find((c) => c.load == null)
  if (catchAll) for (const id of drivers) if (!out.has(id)) out.set(id, catchAll.id)
  return out
}

/** Params that must be positive for a node to be simulatable, by type. */
const POSITIVE = {
  driver: ['Fs', 'Re', 'Bl', 'Mms', 'Cms', 'Sd', 'count'],
  chamber: ['volume', 'length'],
  waveguide: ['S1', 'S2', 'length'],
  pr: ['Mmd', 'Cms', 'Sd', 'count'],
  radiation: [],
}

/**
 * The area a node presents at one of its handles, cm², for the throat-chamber check.
 *
 * @param {object} node - A v3 node.
 * @param {string} handle - The handle.
 * @returns {number|null} Area in cm², or `null` where the handle has no meaningful face area (a tap enters from the side).
 * @pure
 */
function endArea(node, handle) {
  const p = node.params || {}
  if (node.type === 'waveguide') {
    if (handle === 'throat') return Number(p.S1)
    if (handle === 'mouth') return Number(p.S2)
  }
  if (node.type === 'chamber' && (handle === 'in' || handle === 'out')) {
    return (Number(p.volume) * 1000) / Number(p.length)
  }
  return null
}

/**
 * Check a resolved v3 project for anything that prevents or questions a run.
 *
 * @param {object} proj - A v3 project whose expressions are already resolved (see `resolveProject`).
 * @returns {{errors: string[], warnings: Object<string, string[]>}} Blocking errors, and warnings keyed by node id.
 * @post proj is not modified
 * @pure
 */
export function validateProject(proj) {
  const errors = []
  const warnings = {}
  /**
   * Record a warning against a node.
   *
   * @param {string} id - Node id.
   * @param {string} msg - The warning.
   * @returns {void}
   * @mutates the enclosing `warnings`.
   */
  const warn = (id, msg) => { (warnings[id] ||= []).push(msg) }
  const nodes = proj.nodes || []
  const shown = displayNames(nodes)
  const byId = new Map()
  for (const [i, n] of nodes.entries()) {
    if (!n.id) { errors.push(`nodes[${i}] is missing "id"`); continue }
    if (byId.has(n.id)) errors.push(`node id "${n.id}" is used more than once`)
    byId.set(n.id, n)
    if (!DEFAULT_PARAMS[n.type]) { errors.push(`node "${n.id}" has unknown type "${n.type}"`); continue }
    const name = shown[n.id]
    for (const k of POSITIVE[n.type]) {
      const v = Number(n.params?.[k])
      if (!(v > 0)) errors.push(`${name}: ${k} must be greater than zero`)
    }
    for (const t of n.params?.taps || []) {
      const pos = Number(t.position)
      const len = Number(n.params.length)
      if (!(pos > 0 && pos < len)) warn(n.id, `Tap ${t.id} at ${pos} cm is not inside the ${len} cm length.`)
    }
  }

  const conns = new Map() // "id:handle" -> [{node, handle}]
  for (const [i, e] of (proj.edges || []).entries()) {
    const a = byId.get(e.source)
    const b = byId.get(e.target)
    if (!a) { errors.push(`edges[${i}] source "${e.source}" is not a node id`); continue }
    if (!b) { errors.push(`edges[${i}] target "${e.target}" is not a node id`); continue }
    if (!nodeHandles(a).includes(e.sourceHandle)) { errors.push(`edges[${i}]: ${shown[a.id]} has no handle "${e.sourceHandle}"`); continue }
    if (!nodeHandles(b).includes(e.targetHandle)) { errors.push(`edges[${i}]: ${shown[b.id]} has no handle "${e.targetHandle}"`); continue }
    if (a.id === b.id && e.sourceHandle === e.targetHandle) { errors.push(`edges[${i}] joins a handle to itself`); continue }
    for (const [x, hx, y, hy] of [[a, e.sourceHandle, b, e.targetHandle], [b, e.targetHandle, a, e.sourceHandle]]) {
      const k = `${x.id}:${hx}`
      if (!conns.has(k)) conns.set(k, [])
      conns.get(k).push({ node: y, handle: hy })
    }
  }
  /**
   * Whether a handle has anything attached.
   *
   * @param {string} id - Node id.
   * @param {string} h - Handle name.
   * @returns {boolean} True when connected.
   * @reads the enclosing `conns` index.
   */
  const connected = (id, h) => (conns.get(`${id}:${h}`) || []).length > 0

  const drivers = nodes.filter((n) => n.type === 'driver')
  if (!drivers.length) errors.push('Add a Driver node to run a simulation.')

  // wiring
  const channels = proj.wiring?.channels || []
  if (!channels.length) errors.push('Add an amplifier channel to drive the drivers.')
  const ids = new Set()
  for (const c of channels) {
    if (ids.has(c.id)) errors.push(`channel id "${c.id}" is used more than once`)
    ids.add(c.id)
  }
  if (channels.filter((c) => c.load == null).length > 1) {
    errors.push('Only one channel may take every otherwise unwired driver; give the others an explicit load.')
  }
  const claimed = new Map()
  for (const c of channels) {
    for (const id of loadLeaves(c.load)) {
      const n = byId.get(id)
      if (!n || n.type !== 'driver') { errors.push(`${c.label || c.id}: "${id}" is not a driver node`); continue }
      if (claimed.has(id)) errors.push(`${shown[id]} is wired to more than one place (${claimed.get(id)} and ${c.label || c.id})`)
      else claimed.set(id, c.label || c.id)
    }
  }
  for (const c of channels) {
    for (const [i, f] of (c.dsp?.filters || []).entries()) {
      try { filterSections(f) } catch (err) { errors.push(`${c.label || c.id} › filter ${i + 1}: ${err.message}`) }
    }
  }
  const driven = driverChannels(proj)
  for (const d of drivers) {
    if (!driven.has(d.id)) warn(d.id, 'Not wired to any amplifier channel — undriven, with its coil open.')
  }

  // analyses
  const analyses = proj.analyses || []
  if (!analyses.length) errors.push('Add an analysis to say what to simulate.')
  for (const a of analyses) {
    if (a.type === 'ac') {
      if (!(a.fmin > 0)) errors.push(`analysis ${a.id}: the lowest frequency must be greater than zero`)
      if (!(a.fmax > a.fmin)) errors.push(`analysis ${a.id}: the highest frequency must be above the lowest`)
      if (!(a.npts >= 2)) errors.push(`analysis ${a.id}: at least two frequency points are needed`)
    }
  }

  // probes: one that points nowhere measures nothing, which is worth saying
  // but never worth refusing to run over
  for (const p of proj.probes || []) {
    const key = `probe:${p.id}`
    const name = p.label || p.id
    if (!PROBE_KINDS.includes(p.kind)) { errors.push(`Probe ${name}: unknown kind "${p.kind}"`); continue }
    const n = byId.get(p.at?.node)
    if (!n) { warn(key, `Probe ${name} is on a node that does not exist.`); continue }
    if (p.at.position != null) {
      const len = Number(n.params?.length)
      if (n.type !== 'chamber' && n.type !== 'waveguide') warn(key, `Probe ${name}: only chambers and waveguides have positions along them.`)
      else if (!(Number(p.at.position) >= 0 && Number(p.at.position) <= len)) warn(key, `Probe ${name} at ${p.at.position} cm is not within the ${len} cm length.`)
    } else if (!nodeHandles(n).includes(p.at.handle)) {
      warn(key, `Probe ${name}: ${shown[n.id]} has no handle "${p.at.handle}".`)
    }
  }

  // per-node connection warnings
  for (const n of nodes) {
    if (!DEFAULT_PARAMS[n.type]) continue
    const handles = nodeHandles(n)
    const any = handles.some((h) => connected(n.id, h))
    if (n.type === 'driver') {
      if (!connected(n.id, 'front') && !connected(n.id, 'rear')) {
        warn(n.id, 'Neither face is connected — treated as mounted in an infinite baffle; only the front counts toward the output.')
      }
      const Sd = Number(n.params.Sd) * Math.max(1, Number(n.params.count) || 1)
      for (const face of ['front', 'rear']) {
        for (const o of conns.get(`${n.id}:${face}`) || []) {
          const area = endArea(o.node, o.handle)
          if (area != null && Sd > area * 1.05) {
            warn(n.id, `The ${face} face (${Sd.toFixed(0)} cm²) meets ${shown[o.node.id]}'s ${o.handle} (${area.toFixed(0)} cm²), which is smaller than the cone. A real build needs a throat chamber between them; this is simulated as an ideal coupling with no trapped air.`)
          }
        }
      }
    } else if (!any) {
      warn(n.id, 'Not connected to anything.')
    }
  }
  return { errors, warnings }
}
