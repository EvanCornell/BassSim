// Editing helpers for the project sections outside the node graph — wiring,
// probes, named params — kept pure so the store and the tests share them.

import { evaluateParams, evaluateExpression, isExpression } from './params.js'
import { parseTerm, toolbarChannel } from './wires.js'

/** The master level zero volts is stored as, dB. */
const MUTE_DB = -120

/**
 * Drop what referred to nodes that no longer exist.
 *
 * Cables to deleted drivers go, as do their places in the Wiring window and
 * probes on deleted nodes.
 *
 * @param {object} extras - The editor's extra project sections.
 * @param {string[]} nodeIds - Ids of the nodes that remain.
 * @returns {object} New extras.
 * @pure
 */
export function pruneExtras(extras, nodeIds) {
  const ids = new Set(nodeIds)
  /**
   * Whether a terminal still has something to belong to.
   *
   * @param {string} t - Terminal id.
   * @returns {boolean} True for a channel terminal or one on a remaining node.
   * @reads the enclosing id set.
   */
  const alive = (t) => {
    const p = parseTerm(t)
    return !!p && (p.kind === 'channel' || ids.has(p.node))
  }
  const w = extras.wiring
  const wiring = w && {
    ...w,
    wires: (w.wires || []).filter((c) => alive(c.a) && alive(c.b)),
    layout: Object.fromEntries(Object.entries(w.layout || {}).filter(([id]) => ids.has(id))),
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
 * The drive the editor shows: the toolbar channel's output at the master level, and its Rg.
 *
 * @param {object} wiring - The project's wiring.
 * @param {Array<object>} params - The project's named params.
 * @returns {{voltage: number, rg: number}} Volts RMS and ohms; `NaN` for anything that does not resolve.
 * @pure
 */
export function driveOf(wiring, params) {
  const { values } = evaluateParams(params || [])
  const ch = toolbarChannel(wiring)
  const master = Math.pow(10, (valueOf(wiring?.masterDb ?? 0, values) || 0) / 20)
  return {
    voltage: ch ? valueOf(ch.volts, values) * master : NaN,
    rg: ch ? valueOf(ch.outputOhms ?? 0, values) || 0 : 0,
  }
}

/**
 * The master level that brings the toolbar channel to a voltage.
 *
 * The master moves every channel together, so asking for a drive level in
 * volts keeps every channel's relative level. Zero volts is the mute floor,
 * −120 dB, since a file cannot hold minus infinity.
 *
 * @param {object} wiring - The project's wiring.
 * @param {Array<object>} params - The project's named params.
 * @param {number} volts - The toolbar channel's wanted output, V RMS.
 * @returns {object} New wiring with `masterDb` set; the same wiring when that channel's own level is zero or unresolved, or the voltage is negative.
 * @pure
 */
export function masterForVoltage(wiring, params, volts) {
  const { values } = evaluateParams(params || [])
  const ch = toolbarChannel(wiring)
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
