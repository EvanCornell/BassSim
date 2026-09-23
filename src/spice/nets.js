// Graph → netlist nodes, and the end-correction rule that depends on them.
//
// Every set of handles joined by edges is one netlist node — a junction at a
// single pressure. That is the whole reason paths that split and rejoin,
// loops and meshes need no special handling: they are simply several
// elements between the same nodes.

import { nodeHandles } from '../schema/validate.js'
import { junctionCorrection } from '../engine/geometry.js'
import { driverSI } from '../engine/solver.js'

/**
 * The area a node presents at one of its handles, m².
 *
 * @param {object} node - A v3 node with resolved params.
 * @param {string} handle - The handle.
 * @returns {number|null} Area in m², or `null` for a handle that is not a face with an area — a tap enters from the side, and a radiation node is open air.
 * @pure
 */
export function faceArea(node, handle) {
  const p = node.params || {}
  if (handle.startsWith('tap:')) return null
  if (node.type === 'waveguide') return Math.max((handle === 'throat' ? p.S1 : p.S2) * 1e-4, 1e-8)
  if (node.type === 'chamber') return Math.max(p.volume * 1e-3, 1e-8) / Math.max(p.length * 1e-2, 1e-4)
  if (node.type === 'driver') return driverSI(p).Sd
  if (node.type === 'pr') return Math.max(p.Sd * 1e-4, 1e-8) * Math.max(1, Math.round(p.count || 1))
  return null
}

/**
 * Join the project's handles into netlist nodes.
 *
 * @param {object} proj - A resolved, valid v3 project.
 * @param {object} nl - The netlist builder, which names the nodes.
 * @returns {{netOf: Function, neighbours: Function, connected: Function}} Lookups: `netOf(id, handle)` → node name; `neighbours(id, handle)` → the `{node, handle}` list joined to it by edges directly; `connected(id, handle)` → whether anything is.
 * @mutates nl — allocates one node per net.
 */
export function buildNets(proj, nl) {
  const parent = new Map()
  /**
   * The representative of a handle's set.
   *
   * @param {string} k - `id:handle`.
   * @returns {string} The root key.
   * @mutates the enclosing `parent` map (path compression).
   */
  const find = (k) => {
    let r = k
    while (parent.get(r) !== r) r = parent.get(r)
    let c = k
    while (parent.get(c) !== r) { const n = parent.get(c); parent.set(c, r); c = n }
    return r
  }
  const byId = new Map()
  for (const n of proj.nodes || []) {
    byId.set(n.id, n)
    for (const h of nodeHandles(n)) parent.set(`${n.id}:${h}`, `${n.id}:${h}`)
  }
  const adj = new Map()
  for (const e of proj.edges || []) {
    const a = `${e.source}:${e.sourceHandle}`
    const b = `${e.target}:${e.targetHandle}`
    if (!parent.has(a) || !parent.has(b)) continue
    parent.set(find(a), find(b))
    if (!adj.has(a)) adj.set(a, [])
    if (!adj.has(b)) adj.set(b, [])
    adj.get(a).push({ node: byId.get(e.target), handle: e.targetHandle })
    adj.get(b).push({ node: byId.get(e.source), handle: e.sourceHandle })
  }
  const names = new Map()
  for (const k of parent.keys()) {
    const r = find(k)
    if (!names.has(r)) names.set(r, nl.node())
  }
  return {
    /**
     * The netlist node a handle belongs to.
     *
     * @param {string} id - Node id.
     * @param {string} handle - Handle name.
     * @returns {string} The netlist node name.
     * @reads the join sets.
     */
    netOf: (id, handle) => names.get(find(`${id}:${handle}`)),
    /**
     * What an edge joins directly to a handle.
     *
     * @param {string} id - Node id.
     * @param {string} handle - Handle name.
     * @returns {Array<{node: object, handle: string}>} The far ends of its edges.
     * @reads the adjacency index.
     */
    neighbours: (id, handle) => adj.get(`${id}:${handle}`) || [],
    /**
     * Whether any edge touches a handle.
     *
     * @param {string} id - Node id.
     * @param {string} handle - Handle name.
     * @returns {boolean} True when connected.
     * @reads the adjacency index.
     */
    connected: (id, handle) => (adj.get(`${id}:${handle}`) || []).length > 0,
  }
}

/**
 * The end correction one end of a duct or chamber carries, m.
 *
 * An end correction is a property of the discontinuity at a junction, not of
 * the duct, and exactly one side may hold it: the narrower, unless the other
 * side is a driver or passive radiator, which have nowhere to put it. Several
 * things joined to one end are one opening of their combined area. An end
 * joined to open air or to a tap gets nothing here — the radiation impedance
 * carries open air, and a tap is an ideal junction.
 *
 * @param {object} nets - From `buildNets`.
 * @param {object} node - A waveguide or chamber node.
 * @param {string} handle - One of its ends.
 * @returns {number} Added length, m; 0 when this side does not own the junction.
 * @pure
 */
export function endCorrection(nets, node, handle) {
  const nb = nets.neighbours(node.id, handle)
  if (!nb.length) return 0
  let total = 0
  let farSideCanHold = true
  for (const o of nb) {
    const area = faceArea(o.node, o.handle)
    if (area == null) return 0
    total += area
    if (o.node.type !== 'waveguide' && o.node.type !== 'chamber') farSideCanHold = false
  }
  const self = faceArea(node, handle)
  if (self > total && farSideCanHold) return 0
  return junctionCorrection(self, total)
}
