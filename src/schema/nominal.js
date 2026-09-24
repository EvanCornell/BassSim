// Nominal impedances, for showing watts beside volts.
//
// A channel stores volts, never watts. The watts it shows are its voltage
// squared over the nominal load its wiring presents — the figure an amplifier
// is rated against. Nominal is a label, not a measurement: it comes from each
// driver's voice-coil resistance, rounded to the standard ratings, then
// combined through the node's own array and the channel's series/parallel
// tree. The minimum impedance the simulation finds is shown separately.

import { loadLeaves } from './validate.js'

/** Standard nominal ratings, Ω. */
const RATINGS = [0.5, 1, 2, 3, 4, 6, 8, 16, 32]

/**
 * The nominal rating a voice-coil resistance belongs to.
 *
 * Re is typically 70–90% of nominal, so the rating is the standard value
 * nearest Re / 0.85 on a logarithmic scale.
 *
 * @param {number} re - DC resistance, Ω.
 * @returns {number} The nominal rating, Ω; 0 for a non-positive resistance.
 * @pure
 */
export function ratingOf(re) {
  if (!(re > 0)) return 0
  const target = Math.log(re / 0.85)
  let best = RATINGS[0]
  for (const r of RATINGS) if (Math.abs(Math.log(r) - target) < Math.abs(Math.log(best) - target)) best = r
  return best
}

/**
 * Re of one driver in a node after its dual voice coil option.
 *
 * Catalogue figures are both coils in series; parallel quarters Re, one coil
 * alone halves it.
 *
 * @param {object} p - Driver params, resolved.
 * @returns {number} Re, Ω.
 * @pure
 */
function coilRe(p) {
  const re = Number(p.Re) || 0
  const coils = p.dvc?.coils
  if (coils === 'parallel') return re / 4
  if (coils === 'one') return re / 2
  return re
}

/**
 * The nominal impedance of one driver node as its terminals present it.
 *
 * Each driver is rated from its coil resistance first, then the node's array
 * wiring combines those ratings, so four 4 Ω drivers in parallel read 1 Ω.
 *
 * @param {object} p - Driver params, resolved.
 * @returns {number} Nominal Ω.
 * @pure
 */
export function driverNominal(p) {
  const one = ratingOf(coilRe(p))
  const n = Math.max(1, Math.round(Number(p.count) || 1))
  if (p.wiring === 'series') return one * n
  if (p.wiring === 'parallel') return one / n
  if (p.wiring === 'series-parallel') {
    const r = Math.round(Math.sqrt(n))
    return r * r === n && r > 1 ? one : one / n
  }
  return one
}

/**
 * The nominal impedance of a load tree.
 *
 * @param {object|null} tree - `{driver}`, `{series: [...]}` or `{parallel: [...]}`.
 * @param {Map<string, object>} drivers - Driver node id → resolved params.
 * @returns {number} Nominal Ω; `Infinity` for an empty tree (nothing connected).
 * @pure
 */
export function treeNominal(tree, drivers) {
  if (!tree) return Infinity
  if (tree.driver) {
    const p = drivers.get(tree.driver)
    return p ? driverNominal(p) : Infinity
  }
  if (Array.isArray(tree.series)) {
    const parts = tree.series.map((t) => treeNominal(t, drivers))
    return parts.some((z) => !isFinite(z)) || !parts.length ? Infinity : parts.reduce((a, b) => a + b, 0)
  }
  if (Array.isArray(tree.parallel)) {
    const g = tree.parallel.map((t) => treeNominal(t, drivers)).reduce((a, z) => a + (isFinite(z) && z > 0 ? 1 / z : 0), 0)
    return g > 0 ? 1 / g : Infinity
  }
  return Infinity
}

/**
 * The load tree a channel actually drives.
 *
 * An explicit tree is used as it stands. The catch-all channel (`load: null`)
 * drives every driver no explicit tree claims, in parallel.
 *
 * @param {object} channel - A wiring channel.
 * @param {object} proj - The project, for its driver nodes and other channels.
 * @returns {object} A load tree.
 * @pure
 */
export function effectiveLoad(channel, proj) {
  if (channel.load) return channel.load
  const claimed = new Set((proj.wiring?.channels || []).flatMap((c) => loadLeaves(c.load)))
  const ids = (proj.nodes || []).filter((n) => n.type === 'driver' && !claimed.has(n.id)).map((n) => n.id)
  return { parallel: ids.map((id) => ({ driver: id })) }
}
