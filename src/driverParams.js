// The driver's T/S parameters are not eleven independent numbers. They are
// six, plus five relations that fix the rest — so typing a new Fs into a
// driver whose Mms and Cms are already set is not an edit, it is a
// contradiction.
//
// Hornresp answers this by only ever letting you edit the physical six
// (Sd, Bl, Cms, Rms, Mmd, Re) and showing the rest as consequences. This
// module generalises that: any six that determine the others may be the set
// you edit, and the remaining five are derived from them. Which six is the
// user's choice, expressed as locks.
//
// The relations are held as data rather than as code paths, so the solver is
// one propagation loop over them instead of a special case per combination.
import { RHO, C_AIR } from './engine/geometry'

/** 2π, which appears in every relation here as the resonance's angular form. */
const TAU = 2 * Math.PI
/** ρc², the bulk modulus of air — the constant tying compliance to Vas. */
const K = RHO * C_AIR * C_AIR

/**
 * The eleven parameters bound together by the relations below.
 *
 * Le, the Le exponent and Xmax are absent on purpose: they are genuinely
 * independent of the rest and are always editable.
 */
export const COUPLED = ['Fs', 'Qts', 'Qes', 'Qms', 'Vas', 'Re', 'Bl', 'Mms', 'Cms', 'Sd', 'Rms']

/**
 * How many parameters must be held for the other five to follow.
 *
 * Eleven quantities minus five independent relations. Any set of this size
 * that `canSolve` accepts is a legitimate basis.
 */
export const BASIS_SIZE = 6

/**
 * The set held by default: the physical parameters, which is Hornresp's.
 *
 * Ordered oldest-first, which is the order locks give way in when room has
 * to be made for a new one.
 */
export const DEFAULT_BASIS = ['Sd', 'Bl', 'Cms', 'Rms', 'Mms', 'Re']

// Display units are the units the app stores and shows: litres, grams,
// mm/N, cm². The relations are physics, so each converts to SI at its edge
// rather than leaving a stray 1e-3 in the caller.
const toSI = { Vas: 1e-3, Mms: 1e-3, Cms: 1e-3, Sd: 1e-4 }

/**
 * One parameter's value in SI units.
 *
 * @param {object} v - Parameter values in display units.
 * @param {string} key - Parameter name.
 * @returns {number} The value in SI.
 * @pure
 */
function si(v, key) {
  return v[key] * (toSI[key] || 1)
}

/**
 * Compliance, equivalent volume and cone area: Vas = ρc²·Sd²·Cms.
 *
 * @param {string} target - Which of the three to compute.
 * @param {object} v - The other values, in display units.
 * @returns {number} The target's value in display units.
 * @pure
 */
function relCompliance(target, v) {
  if (target === 'Vas') return (K * si(v, 'Sd') ** 2 * si(v, 'Cms')) / toSI.Vas
  if (target === 'Cms') return si(v, 'Vas') / (K * si(v, 'Sd') ** 2) / toSI.Cms
  return Math.sqrt(si(v, 'Vas') / (K * si(v, 'Cms'))) / toSI.Sd
}

/**
 * Resonance, mass and compliance: Fs = 1 / (2π√(Mms·Cms)).
 *
 * @param {string} target - Which of the three to compute.
 * @param {object} v - The other values, in display units.
 * @returns {number} The target's value in display units.
 * @pure
 */
function relResonance(target, v) {
  if (target === 'Fs') return 1 / (TAU * Math.sqrt(si(v, 'Mms') * si(v, 'Cms')))
  const ws = TAU * v.Fs
  if (target === 'Mms') return 1 / (ws * ws * si(v, 'Cms')) / toSI.Mms
  return 1 / (ws * ws * si(v, 'Mms')) / toSI.Cms
}

/**
 * Mechanical Q: Qms = 2πFs·Mms / Rms.
 *
 * @param {string} target - Which of the four to compute.
 * @param {object} v - The other values, in display units.
 * @returns {number} The target's value in display units.
 * @pure
 */
function relMechanicalQ(target, v) {
  if (target === 'Qms') return (TAU * v.Fs * si(v, 'Mms')) / v.Rms
  if (target === 'Rms') return (TAU * v.Fs * si(v, 'Mms')) / v.Qms
  if (target === 'Mms') return (v.Qms * v.Rms) / (TAU * v.Fs) / toSI.Mms
  return (v.Qms * v.Rms) / (TAU * si(v, 'Mms'))
}

/**
 * Electrical Q: Qes = 2πFs·Mms·Re / Bl².
 *
 * @param {string} target - Which of the five to compute.
 * @param {object} v - The other values, in display units.
 * @returns {number} The target's value in display units.
 * @pure
 */
function relElectricalQ(target, v) {
  if (target === 'Qes') return (TAU * v.Fs * si(v, 'Mms') * v.Re) / (v.Bl * v.Bl)
  if (target === 'Bl') return Math.sqrt((TAU * v.Fs * si(v, 'Mms') * v.Re) / v.Qes)
  if (target === 'Re') return (v.Qes * v.Bl * v.Bl) / (TAU * v.Fs * si(v, 'Mms'))
  if (target === 'Mms') return (v.Qes * v.Bl * v.Bl) / (TAU * v.Fs * v.Re) / toSI.Mms
  return (v.Qes * v.Bl * v.Bl) / (TAU * si(v, 'Mms') * v.Re)
}

/**
 * Total Q: Qts = Qes·Qms / (Qes + Qms).
 *
 * @param {string} target - Which of the three to compute.
 * @param {object} v - The other values, in display units.
 * @returns {number} The target's value in display units.
 * @pure
 */
function relTotalQ(target, v) {
  if (target === 'Qts') return (v.Qes * v.Qms) / (v.Qes + v.Qms)
  if (target === 'Qes') return (v.Qts * v.Qms) / (v.Qms - v.Qts)
  return (v.Qts * v.Qes) / (v.Qes - v.Qts)
}

/**
 * The five relations, each listing the parameters it binds together.
 *
 * A relation with exactly one unknown among its `vars` can produce that
 * unknown, which is the whole of the solver below.
 */
export const RELATIONS = [
  { id: 'compliance', vars: ['Vas', 'Cms', 'Sd'], solve: relCompliance },
  { id: 'resonance', vars: ['Fs', 'Mms', 'Cms'], solve: relResonance },
  { id: 'mechanicalQ', vars: ['Qms', 'Fs', 'Mms', 'Rms'], solve: relMechanicalQ },
  { id: 'electricalQ', vars: ['Qes', 'Fs', 'Mms', 'Re', 'Bl'], solve: relElectricalQ },
  { id: 'totalQ', vars: ['Qts', 'Qes', 'Qms'], solve: relTotalQ },
]

/**
 * Round to six significant figures.
 *
 * Derived values feed the next derivation, so they are rounded for display
 * rather than for storage precision — six figures is far past what a
 * datasheet justifies and keeps repeated round trips from drifting.
 *
 * @param {number} v - The value.
 * @returns {number} The rounded value, or the input unchanged when it is not finite.
 * @pure
 */
export function round6(v) {
  if (!isFinite(v) || v === 0) return v
  const mag = Math.ceil(Math.log10(Math.abs(v)))
  const f = Math.pow(10, 6 - mag)
  return Math.round(v * f) / f
}

/**
 * Derive every parameter outside the basis from the ones inside it.
 *
 * Repeated passes rather than a fixed order: each pass takes any relation
 * with exactly one unknown left and fills it in, until everything is known
 * or a pass achieves nothing. Because there are five relations and five
 * parameters outside a correctly sized basis, resolving all of them means
 * each relation was used exactly once — so a complete result is also a
 * consistent one, and an incomplete one means the basis was not a basis.
 *
 * @param {object} params - Current values in display units. Only the basis entries are read.
 * @param {string[]} basis - The parameters being held.
 * @returns {{ok: boolean, values: object, unresolved: string[]}} Whether everything resolved, the derived values (basis excluded), and the names that could not be reached.
 * @pure
 */
export function derive(params, basis) {
  const known = {}
  for (const key of basis) {
    const v = params[key]
    if (typeof v !== 'number' || !isFinite(v) || v <= 0) {
      return { ok: false, values: {}, unresolved: COUPLED.filter((k) => !basis.includes(k)) }
    }
    known[key] = v
  }

  const pending = COUPLED.filter((k) => !(k in known))
  let progress = true
  while (progress && pending.length) {
    progress = false
    for (const rel of RELATIONS) {
      const missing = rel.vars.filter((k) => !(k in known))
      if (missing.length !== 1) continue
      const target = missing[0]
      const v = rel.solve(target, known)
      if (!isFinite(v) || v <= 0) continue
      known[target] = v
      pending.splice(pending.indexOf(target), 1)
      progress = true
    }
  }

  const values = {}
  for (const key of COUPLED) if (!basis.includes(key)) values[key] = round6(known[key])
  return { ok: pending.length === 0, values, unresolved: pending }
}

/**
 * A physically ordinary driver, used only to test whether a basis resolves.
 *
 * Solvability is a property of which parameters are held, not of their
 * values, so any consistent driver answers the question. These figures are
 * a real 12-inch woofer's, which keeps every intermediate in a sane range
 * and away from the subtractive cancellations in the Q relations.
 */
const PROBE = {
  Fs: 30, Qts: 0.454545, Qes: 0.5, Qms: 5, Vas: 60, Re: 3.6,
  Bl: 14.336, Mms: 151.425, Cms: 0.186, Sd: 480, Rms: 5.709,
}

/**
 * Whether a set of parameters determines all the others.
 *
 * @param {string[]} basis - Candidate basis.
 * @returns {boolean} True when it is the right size and everything else follows from it.
 * @pure
 */
export function canSolve(basis) {
  if (basis.length !== BASIS_SIZE) return false
  const probe = Object.fromEntries(basis.map((k) => [k, PROBE[k]]))
  return derive(probe, basis).ok
}

/**
 * Add a parameter to the basis, dropping whichever one makes room.
 *
 * The basis is ordered oldest-first, so the parameter that gives way is the
 * one the user pinned longest ago — and only if what remains still resolves.
 * Candidates are tried in that order, so the newest choices survive.
 *
 * @param {string[]} basis - The current basis, oldest first.
 * @param {string} key - The parameter to start holding.
 * @returns {string[]|null} The new basis, or `null` when nothing can be dropped for it.
 * @pure
 */
export function lockParam(basis, key) {
  if (basis.includes(key)) return basis
  for (const drop of basis) {
    const next = [...basis.filter((k) => k !== drop), key]
    if (canSolve(next)) return next
  }
  return null
}

/**
 * Remove a parameter from the basis, promoting another to keep it complete.
 *
 * Candidates are tried in the canonical parameter order, so the same release
 * always produces the same replacement rather than depending on history.
 *
 * @param {string[]} basis - The current basis, oldest first.
 * @param {string} key - The parameter to stop holding.
 * @returns {string[]|null} The new basis, or `null` when no replacement completes it.
 * @pure
 */
export function unlockParam(basis, key) {
  if (!basis.includes(key)) return basis
  const rest = basis.filter((k) => k !== key)
  for (const add of COUPLED) {
    if (rest.includes(add) || add === key) continue
    const next = [...rest, add]
    if (canSolve(next)) return next
  }
  return null
}

/**
 * The basis a driver node is using, falling back to the default.
 *
 * A node that has never had a lock touched has no stored basis, and a stored
 * one that no longer resolves — hand-edited, or written by an older version —
 * is discarded rather than trusted.
 *
 * @param {object} node - The driver node.
 * @returns {string[]} The basis, oldest first.
 * @pure
 */
export function basisOf(node) {
  const stored = node?.data?.locks
  return Array.isArray(stored) && canSolve(stored) ? stored : DEFAULT_BASIS
}
