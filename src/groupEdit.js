// Acting on several nodes at once: joining a whole selection to one handle,
// and putting a copied node's settings into the place of others.
//
// Kept out of the store because the rules are the part worth being sure about,
// and none of them needs React or the store to be checked. Each planner reads
// the graph and says what to do — or why it cannot be done — and the store
// does it, so a refusal never leaves the graph half-changed.

import { displayNames, TYPE_NAMES } from './nodeNames.js'

/**
 * A kind's name in the plural, for messages about a mixed selection.
 *
 * @param {string} type - Node type.
 * @returns {string} e.g. `Waveguides`.
 * @pure
 */
export const plural = (type) => {
  const name = TYPE_NAMES[type] || type
  return name.endsWith('s') ? name : `${name}s`
}

/**
 * A handle as it is named to the user: `tap t1`, or the handle's own id.
 *
 * @param {string} handle - Handle id, e.g. `tap:t1` or `mouth`.
 * @returns {string} Its name.
 * @pure
 */
export const handleName = (handle) => (handle?.startsWith('tap:') ? `tap ${handle.slice(4)}` : handle)

/**
 * Whether a node has a handle.
 *
 * Every node of a kind has the same fixed handles, so only taps — which each
 * chamber and waveguide has its own set of — can be missing.
 *
 * @param {object} node - An editor node.
 * @param {string} handle - Handle id.
 * @returns {boolean} True when the node has it.
 * @pure
 */
export function hasHandle(node, handle) {
  if (!handle?.startsWith('tap:')) return true
  const tap = handle.slice(4)
  return (node?.data?.params?.taps || []).some((t) => t.id === tap)
}

/**
 * Whether two joins are the same one: joins have no direction.
 *
 * @param {object} a - A join: source, sourceHandle, target, targetHandle.
 * @param {object} b - Another.
 * @returns {boolean} True when they join the same two handles, in either order.
 * @pure
 */
const sameJoin = (a, b) =>
  (a.source === b.source && a.sourceHandle === b.sourceHandle && a.target === b.target && a.targetHandle === b.targetHandle)
  || (a.source === b.target && a.sourceHandle === b.targetHandle && a.target === b.source && a.targetHandle === b.sourceHandle)

/**
 * Up to three names, then a count of the rest.
 *
 * @param {string[]} names - The names.
 * @returns {string} e.g. `A, B, C and 2 more`.
 * @pure
 */
function listNames(names) {
  if (names.length <= 3) return names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}` : names[0]
  return `${names.slice(0, 3).join(', ')} and ${names.length - 3} more`
}

/**
 * The joins a drag makes when it starts from a node in a selection.
 *
 * A drag from one node of a selection joins every selected node, from the
 * same handle, to the same place. That is only meaningful when they are all
 * the same kind, and — for a tap — when each of them has that tap; otherwise
 * nothing is joined and the reason is given. A drag that does not start from
 * a selection of two or more is an ordinary single join.
 *
 * A selected node that the drag ends on is left out of the group rather than
 * joined to itself, and joins that already exist are skipped.
 *
 * @param {Array<object>} nodes - The editor's nodes.
 * @param {Array<object>} edges - The editor's edges.
 * @param {{source: string, sourceHandle: string, target: string, targetHandle: string}} conn - The join the drag made; `source` is where it started.
 * @returns {{conns: Array<object>}|{error: string}} The joins to add, or why none can be.
 * @pure
 */
export function planGroupConnect(nodes, edges, conn) {
  const from = nodes.find((n) => n.id === conn.source)
  const group = from?.selected ? nodes.filter((n) => n.selected && n.id !== conn.target) : []
  const members = group.length > 1 ? group : [from].filter(Boolean)
  if (members.length > 1) {
    const types = [...new Set(members.map((n) => n.type))]
    if (types.length > 1) {
      return { error: `Can't join these together: the selection mixes ${listNames(types.map(plural))}. Select nodes of one kind to join them at once.` }
    }
    const lacking = members.filter((n) => !hasHandle(n, conn.sourceHandle))
    if (lacking.length) {
      const shown = displayNames(nodes)
      return { error: `Can't join these together: ${listNames(lacking.map((n) => shown[n.id]))} ${lacking.length > 1 ? 'have' : 'has'} no ${handleName(conn.sourceHandle)}.` }
    }
  }
  const conns = []
  for (const n of members) {
    const c = { source: n.id, sourceHandle: conn.sourceHandle, target: conn.target, targetHandle: conn.targetHandle }
    if (edges.some((e) => sameJoin(e, c)) || conns.some((e) => sameJoin(e, c))) continue
    conns.push(c)
  }
  return { conns }
}

/**
 * What replacing nodes with a copied one changes.
 *
 * Each target keeps its identity — id, position and name — and takes the
 * copy's settings, so everything joined to it, its place in the wiring and
 * any probe on it carry over untouched. The copy and the targets must be the
 * same kind. Taps need not match: a join to a tap the copy also has stays,
 * and a join to one it lacks is removed and counted.
 *
 * @param {Array<object>} nodes - The editor's nodes.
 * @param {Array<object>} edges - The editor's edges.
 * @param {{nodes: Array<object>}|null} clipboard - The node clipboard.
 * @param {string[]} targetIds - The nodes to replace.
 * @returns {{params: Object<string, object>, baseline: object|undefined, edges: Array<object>, dropped: number}|{error: string}}
 *   The new params by node id, the driver baseline to carry, the edges left, and how many were removed; or why it cannot be done.
 * @pure
 */
export function planReplace(nodes, edges, clipboard, targetIds) {
  const copied = clipboard?.nodes || []
  if (copied.length !== 1) {
    return { error: copied.length ? 'Copy a single node to replace with — the clipboard holds several.' : 'Copy a node first, then select the nodes to replace with it.' }
  }
  const src = copied[0]
  const targets = nodes.filter((n) => targetIds.includes(n.id))
  if (!targets.length) return { error: 'Select the nodes to replace.' }
  const wrong = targets.filter((n) => n.type !== src.type)
  if (wrong.length) {
    const shown = displayNames(nodes)
    return { error: `Can't replace ${listNames(wrong.map((n) => shown[n.id]))} with a ${TYPE_NAMES[src.type] || src.type}: a node can only be replaced by one of its own kind.` }
  }
  const params = {}
  for (const n of targets) {
    const p = JSON.parse(JSON.stringify(src.params))
    if (n.data?.params?.label != null) p.label = n.data.params.label
    else delete p.label
    params[n.id] = p
  }
  const taps = new Set((src.params.taps || []).map((t) => `tap:${t.id}`))
  /**
   * Whether an edge end is a tap on a replaced node that the copy lacks.
   *
   * @param {string} node - Node id at that end.
   * @param {string} handle - Handle at that end.
   * @returns {boolean} True when the end loses its tap.
   * @reads the enclosing replaced params and the copy's tap set.
   */
  const lost = (node, handle) => node in params && handle?.startsWith('tap:') && !taps.has(handle)
  const kept = edges.filter((e) => !lost(e.source, e.sourceHandle) && !lost(e.target, e.targetHandle))
  return { params, baseline: src.baseline, edges: kept, dropped: edges.length - kept.length }
}

/**
 * The settings several nodes share, for editing them as one.
 *
 * A field every node holds the same value in is given that value; a field
 * they disagree on is left out of the params and named in `mixed`, so a form
 * can show it blank, marked as mixed, until something is typed — which then
 * goes to all of them. Values are compared whole, so two tap lists that
 * differ anywhere are mixed.
 *
 * @param {Array<object>} nodes - The editor nodes to merge; at least one.
 * @returns {{params: object, mixed: Set<string>, locks: Array<string>|undefined}} The shared params, the fields that differ, and the T/S padlocks when every node holds the same ones.
 * @pure
 */
export function mergeParams(nodes) {
  const keys = new Set(nodes.flatMap((n) => Object.keys(n.data?.params || {})))
  const params = {}
  const mixed = new Set()
  for (const k of keys) {
    const vals = nodes.map((n) => JSON.stringify(n.data?.params?.[k] ?? null))
    if (vals.every((v) => v === vals[0])) params[k] = nodes[0].data?.params?.[k]
    else mixed.add(k)
  }
  const lockSets = nodes.map((n) => JSON.stringify(n.data?.locks ?? null))
  const locks = lockSets.every((v) => v === lockSets[0]) ? nodes[0].data?.locks : undefined
  return { params, mixed, locks }
}
