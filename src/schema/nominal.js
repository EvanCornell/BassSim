// Nominal impedances, for showing watts beside volts.
//
// A channel stores volts, never watts. The watts it shows are its voltage
// squared over the nominal load its wiring presents — the figure an amplifier
// is rated against. Nominal is a label, not a measurement. Each driver's comes
// from, in order: a figure typed for it, the rating its database record lists,
// or an estimate from Re and Qes. That is then split for a dual voice coil and
// combined through the node's own arrangement and the cables of the Wiring
// window (`wires.js`). The minimum impedance the simulation finds is shown
// separately.

/** Qes assumed when a driver has none, a typical woofer's. */
const QES_TYPICAL = 0.4

/**
 * The low end of where a driver's nominal impedance is likely to lie, from Re and Qes.
 *
 * Re is always some share of nominal, and how large a share depends on the
 * motor: a strong one (low Qes) holds the impedance well above Re past
 * resonance, so its Re is a smaller part of its nominal. The share is taken
 * as at most 0.67 + 0.25·Qes, capped at 0.8, so the low end is Re over that:
 * lower Qes raises it. Qes is held to 0.15–1, where real drivers lie. The
 * constants are calibrated with `POW_SLACK` against the catalogue (see there).
 *
 * @param {number} re - DC resistance of one coil, Ω.
 * @param {number} [qes] - Electrical Q; a typical value when absent.
 * @returns {number} The low end, Ω; 0 for a non-positive resistance.
 * @pure
 */
export function nominalFloor(re, qes) {
  if (!(re > 0)) return 0
  const q = Number(qes) > 0 ? Math.min(1, Math.max(0.15, Number(qes))) : QES_TYPICAL
  return re / Math.min(0.8, 0.67 + 0.25 * q)
}

/**
 * How far a power-of-two rating may sit below the low end and still be the one.
 *
 * Tuned together with `nominalFloor`'s share to match as many listed ratings
 * as possible: the 192 drivers in the library that list one, B&C's catalogue
 * and the transcribed drivers whose names state it. 189 match; the misses are
 * a 3 Ω driver, which no rating here is, and two drivers with an Re far off
 * their rating's usual share. Among the settings that tie, this one leaves the
 * drivers furthest from a band edge, while keeping a band for 6 Ω and 12 Ω.
 * 6 Ω and 12 Ω take no such allowance.
 */
const POW_SLACK = 1.36

/**
 * The nominal rating estimated for a driver with none listed.
 *
 * The first rating, going up, that fits above `nominalFloor`. Ratings are the
 * powers of two, any of them, plus 6 Ω and 12 Ω. The estimate may round
 * down to a power of two the low end overshoots when it is close enough —
 * within `POW_SLACK` — the way many 4 Ω drivers have an Re near 4; 6 Ω and
 * 12 Ω, rare but made, get no such allowance and must sit above it.
 *
 * @param {number} re - DC resistance of one coil, Ω.
 * @param {number} [qes] - Electrical Q.
 * @returns {number} The rating, Ω; 0 for a non-positive resistance.
 * @pure
 */
export function estimateNominal(re, qes) {
  const low = nominalFloor(re, qes)
  if (!(low > 0)) return 0
  for (let k = Math.floor(Math.log2(low / POW_SLACK)) - 1; ; k++) {
    const pow = 2 ** k
    if (low <= pow * POW_SLACK) return pow
    // Between this power and the next: 6 between 4 and 8, 12 between 8 and 16.
    const odd = 1.5 * pow
    if ((odd === 6 || odd === 12) && low <= odd) return odd
  }
}

/**
 * One driver's nominal impedance as a single coil: typed or listed, else estimated.
 *
 * A typed figure and a database's listed one are the same field, `Znom`; the
 * typed one replaces the listed one. Without it the rating is estimated.
 *
 * @param {object} p - Driver params, resolved.
 * @returns {number} Nominal Ω; 0 when there is nothing to go on.
 * @pure
 */
export function nominalOf(p) {
  const z = Number(p?.Znom)
  return z > 0 ? z : estimateNominal(Number(p?.Re), p?.Qes)
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
 * Each driver is rated first (`nominalOf`), then split for a dual voice
 * coil, then the node's own arrangement combines those ratings, so four 4 Ω drivers in parallel read
 * 1 Ω. A node wired by hand coil by coil has no arrangement of its own; it
 * reads as its drivers in parallel, and the Wiring window rates the circuit
 * the cables make.
 *
 * @param {object} p - Driver params, resolved.
 * @returns {number} Nominal Ω.
 * @pure
 */
export function driverNominal(p) {
  const one = nominalOf(p) * coilShare(p)
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
