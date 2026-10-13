// Nominal impedances, for showing watts beside volts.
//
// A channel stores volts, never watts. The watts it shows are its voltage
// squared over the nominal load its wiring presents — the figure an amplifier
// is rated against. Nominal is a label, not a measurement: it comes from each
// driver's voice-coil resistance, rounded to the standard ratings, then split
// for a dual voice coil and combined through the node's own arrangement and the cables of the Wiring
// window (`wires.js`). The minimum impedance the simulation finds is shown
// separately.

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
 * The share of a driver's single-coil rating its dual voice coil option presents.
 *
 * A driver's figures are a single coil's; a dual-coil driver splits it into
 * two equal halves, so its coils in series are it, in parallel a quarter of
 * it and one alone half. The split comes after rating, so a 6 Ω driver's
 * coils in parallel read 1.5 Ω rather than a rating of their own.
 *
 * @param {object} p - Driver params, resolved.
 * @returns {number} The factor.
 * @pure
 */
function coilShare(p) {
  const coils = p.dvc?.coils
  if (coils === 'parallel') return 1 / 4
  if (coils === 'one') return 1 / 2
  return 1
}

/**
 * The nominal impedance of one driver node as its two terminals present it.
 *
 * Each driver is rated from its coil resistance first, then split for a dual
 * voice coil, then the node's own
 * arrangement combines those ratings, so four 4 Ω drivers in parallel read
 * 1 Ω. A node wired by hand coil by coil has no arrangement of its own; it
 * reads as its drivers in parallel, and the Wiring window rates the circuit
 * the cables make.
 *
 * @param {object} p - Driver params, resolved.
 * @returns {number} Nominal Ω.
 * @pure
 */
export function driverNominal(p) {
  const one = ratingOf(Number(p.Re) || 0) * coilShare(p)
  const n = Math.max(1, Math.round(Number(p.count) || 1))
  if (p.wiring === 'series') return one * n
  if (p.wiring === 'series-parallel') {
    const r = Math.round(Math.sqrt(n))
    return r * r === n && r > 1 ? one : one / n
  }
  return one / n
}

/**
 * An impedance as a label: up to three significant figures, no trailing zeros.
 *
 * @param {number} z - Ω.
 * @returns {string} e.g. `0.75`, `1.5`, `16`, `10.7`.
 * @pure
 */
export const fmtOhms = (z) => String(Number(z.toPrecision(3)))
