// Editing helpers for the project sections outside the node graph — wiring,
// probes, named params — kept pure so the store and the tests share them.

import { evaluateParams, evaluateExpression, isExpression } from './params.js'
import { parseTerm, toolbarChannel, nominalSolve } from './wires.js'

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
 * A channel's drive as the user sees it: its voltage as it plays, the
 * impedance its watts are figured against, and those watts.
 *
 * The impedance is the channel's own `ohms` when one has been typed;
 * otherwise it follows the cables — the nominal load they present.
 *
 * @param {object} wiring - The project's wiring.
 * @param {Array<object>} nodes - The project's nodes.
 * @param {Array<object>} params - The project's named params.
 * @param {string} [id] - Channel id; the toolbar channel when omitted.
 * @returns {{channel: object|undefined, volts: number, ohms: number, auto: boolean, watts: number, master: number}} Volts RMS at the master level; ohms, `Infinity` when nothing is wired and none was typed; whether they follow the wiring; watts; and the master as a gain.
 * @pure
 */
export function channelDrive(wiring, nodes, params, id) {
  const { values } = evaluateParams(params || [])
  const channel = id ? (wiring?.channels || []).find((c) => c.id === id) : toolbarChannel(wiring)
  const master = Math.pow(10, (valueOf(wiring?.masterDb ?? 0, values) || 0) / 20)
  if (!channel) return { channel, volts: NaN, ohms: Infinity, auto: true, watts: 0, master }
  const volts = valueOf(channel.volts, values) * master
  const typed = channel.ohms == null || channel.ohms === '' ? NaN : valueOf(channel.ohms, values)
  const auto = !(typed > 0)
  const ohms = auto ? nominalSolve(wiring, nodes, { [channel.id]: 1 }).channels[channel.id]?.ohms ?? Infinity : typed
  const watts = Number.isFinite(ohms) && ohms > 0 && Number.isFinite(volts) ? (volts * volts) / ohms : 0
  return { channel, volts, ohms, auto, watts, master }
}

/**
 * What a channel becomes when one of its voltage, impedance or power is typed.
 *
 * Voltage and power set the channel's own volts — the master is left where
 * it is, at 0 dB unless the user moved it — so the voltage typed is the
 * voltage it plays at. Power is turned into volts through the impedance.
 * Impedance fixes the figure watts are reckoned against; an empty one goes
 * back to following the wiring.
 *
 * @param {object} drive - The channel's drive, from `channelDrive`.
 * @param {'voltage'|'impedance'|'power'} field - What was typed.
 * @param {number|null} value - The value; `null` for an emptied impedance.
 * @returns {object|null} The fields to change on the channel; `null` when the value cannot be applied, such as power with no impedance to reckon it by.
 * @pure
 */
export function channelPatch(drive, field, value) {
  if (field === 'impedance') return { ohms: value > 0 ? value : null }
  const volts = field === 'power'
    ? (Number.isFinite(drive.ohms) && drive.ohms > 0 && value >= 0 ? Math.sqrt(value * drive.ohms) : NaN)
    : value
  if (!(volts >= 0)) return null
  return { volts: Number((volts / (drive.master || 1)).toPrecision(12)) }
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
