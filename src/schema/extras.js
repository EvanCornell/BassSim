// Editing helpers for the project sections outside the node graph — wiring,
// probes, named params — kept pure so the store and the tests share them.

import { evaluateParams, evaluateExpression, isExpression } from './params.js'

/** The master level zero volts is stored as, dB. */
const MUTE_DB = -120

/**
 * Remove every leaf naming a driver that is not in a set, and any group left empty.
 *
 * @param {object|null} tree - A load tree.
 * @param {Set<string>} ids - Driver ids that still exist.
 * @returns {object|null} The pruned tree; an empty explicit tree stays an empty `{parallel: []}` rather than turning into the catch-all `null`.
 * @pure
 */
export function pruneLoad(tree, ids) {
  if (!tree) return tree
  /**
   * Prune one subtree.
   *
   * @param {object} t - A subtree.
   * @returns {object|null} The subtree, or `null` when nothing is left of it.
   * @pure
   */
  const walk = (t) => {
    if (t.driver) return ids.has(t.driver) ? t : null
    const key = Array.isArray(t.series) ? 'series' : 'parallel'
    const kids = (t[key] || []).map(walk).filter(Boolean)
    return kids.length ? { [key]: kids } : null
  }
  return walk(tree) || { parallel: [] }
}

/**
 * Drop what referred to nodes that no longer exist.
 *
 * Wiring leaves for deleted drivers go, as do probes on deleted nodes. A
 * catch-all channel needs nothing: it only ever names drivers that exist.
 *
 * @param {object} extras - The editor's extra project sections.
 * @param {string[]} nodeIds - Ids of the nodes that remain.
 * @returns {object} New extras.
 * @pure
 */
export function pruneExtras(extras, nodeIds) {
  const ids = new Set(nodeIds)
  const wiring = extras.wiring && {
    ...extras.wiring,
    channels: (extras.wiring.channels || []).map((c) => (c.load ? { ...c, load: pruneLoad(c.load, ids) } : c)),
  }
  return {
    ...extras,
    wiring,
    probes: (extras.probes || []).filter((p) => ids.has(p.at?.node)),
  }
}

/**
 * The value of a field that may hold an expression.
 *
 * @param {number|string} v - A number, or an expression over the named params.
 * @param {Object<string, number>} values - Resolved named params.
 * @returns {number} The number; `NaN` when the expression does not resolve.
 * @pure
 */
export function valueOf(v, values) {
  if (isExpression(v)) return evaluateExpression(v, values).value
  return Number(v)
}

/**
 * The drive the editor shows: the first channel's output at the master level, and its output resistance.
 *
 * @param {object} wiring - The project's wiring.
 * @param {Array<object>} params - The project's named params.
 * @returns {{voltage: number, rg: number}} Volts RMS and ohms; `NaN` for anything that does not resolve.
 * @pure
 */
export function driveOf(wiring, params) {
  const { values } = evaluateParams(params || [])
  const ch = wiring?.channels?.[0]
  const master = Math.pow(10, (valueOf(wiring?.masterDb ?? 0, values) || 0) / 20)
  return {
    voltage: ch ? valueOf(ch.volts, values) * master : NaN,
    rg: ch ? valueOf(ch.outputOhms ?? 0, values) || 0 : 0,
  }
}

/**
 * The master level that brings the first channel to a voltage.
 *
 * The master moves every channel together, so asking for a drive level in
 * volts keeps every channel's relative level. Zero volts is the mute floor,
 * −120 dB, since a file cannot hold minus infinity.
 *
 * @param {object} wiring - The project's wiring.
 * @param {Array<object>} params - The project's named params.
 * @param {number} volts - The first channel's wanted output, V RMS.
 * @returns {object} New wiring with `masterDb` set; the same wiring when the first channel's own level is zero or unresolved, or the voltage is negative.
 * @pure
 */
export function masterForVoltage(wiring, params, volts) {
  const { values } = evaluateParams(params || [])
  const ch = wiring?.channels?.[0]
  const base = ch ? valueOf(ch.volts, values) : NaN
  if (!(base > 0) || !(volts >= 0)) return wiring
  return { ...wiring, masterDb: Math.max(20 * Math.log10(volts / base), MUTE_DB) }
}

/**
 * A fresh id not already used in a list.
 *
 * @param {string} prefix - Id prefix, e.g. `ch`, `t`, `probe`.
 * @param {string[]} used - Ids already taken.
 * @returns {string} `prefix` followed by the lowest free number from 1.
 * @pure
 */
export function freshId(prefix, used) {
  const taken = new Set(used)
  let i = 1
  while (taken.has(`${prefix}${i}`)) i++
  return `${prefix}${i}`
}
