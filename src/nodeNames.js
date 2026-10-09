// What each component is called wherever it is shown.
//
// A component's name is its label, or its kind when it has none. Two
// components may share a name — two drivers both called "Woofer" — and then
// every chart, list and node would show two things nobody could tell apart.
// So when a name is shared, each holder is shown with a number after it,
// `Woofer #1`, `Woofer #2`, counted in the order the components were added.
// The number is never part of the label itself: it is not typed, not saved,
// and goes away as soon as the name is unique again.

/** What a component is called when it has no label, by type. */
export const TYPE_NAMES = {
  driver: 'Driver', chamber: 'Chamber', waveguide: 'Waveguide', pr: 'Passive Radiator', radiation: 'Radiation',
}

/**
 * A node's params, whether it is an editor node or a saved one.
 *
 * @param {object} node - `{data: {params}}` on the canvas, `{params}` in a saved project.
 * @returns {object} Its params; empty when it has none.
 * @pure
 */
const paramsOf = (node) => node?.params || node?.data?.params || {}

/**
 * A component's own name: its label, else its kind.
 *
 * @param {object} node - An editor or saved node.
 * @returns {string} e.g. `Woofer`, or `Chamber`.
 * @pure
 */
export function baseName(node) {
  const label = String(paramsOf(node).label ?? '').trim()
  return label || TYPE_NAMES[node?.type] || node?.id || ''
}

/** Results already worked out, by the node array they were worked out from. */
const cache = new WeakMap()

/**
 * Each component's number among those sharing its name.
 *
 * @param {Array<object>} nodes - The project's nodes, editor or saved, in the order they were added.
 * @returns {Object<string, number>} By node id: 1, 2, … for a shared name, 0 for a unique one.
 * @pure
 */
export function nameNumbers(nodes) {
  if (!Array.isArray(nodes)) return {}
  const hit = cache.get(nodes)
  if (hit) return hit
  const groups = new Map()
  for (const n of nodes) {
    const key = baseName(n)
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(n.id)
  }
  const out = {}
  for (const ids of groups.values()) ids.forEach((id, i) => { out[id] = ids.length > 1 ? i + 1 : 0 })
  cache.set(nodes, out)
  return out
}

/**
 * Every component's name as it is shown: its own name, numbered when shared.
 *
 * @param {Array<object>} nodes - The project's nodes, editor or saved.
 * @returns {Object<string, string>} By node id, e.g. `Woofer #2`.
 * @pure
 */
export function displayNames(nodes) {
  const nums = nameNumbers(nodes)
  const out = {}
  for (const n of nodes || []) out[n.id] = nums[n.id] ? `${baseName(n)} #${nums[n.id]}` : baseName(n)
  return out
}

/**
 * One component's name as it is shown.
 *
 * @param {Array<object>} nodes - The project's nodes.
 * @param {string} id - The component.
 * @returns {string} Its shown name; the id itself when there is no such node.
 * @pure
 */
export function displayName(nodes, id) {
  const node = (nodes || []).find((n) => n.id === id)
  if (!node) return id
  const num = nameNumbers(nodes)[id]
  return num ? `${baseName(node)} #${num}` : baseName(node)
}
