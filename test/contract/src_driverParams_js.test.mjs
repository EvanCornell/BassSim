import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  COUPLED, BASIS_SIZE, DEFAULT_BASIS, RELATIONS, TS_FIELDS,
  round6, derive, canSolve, lockParam, unlockParam, basisOf,
  pickTS, baselineOf, matchesBaseline,
} from '../../src/driverParams.js'
import { RHO, C_AIR } from '../../src/engine/geometry.js'

const TAU = 2 * Math.PI
const K = RHO * C_AIR * C_AIR

/** A consistent driver, the one the module's own probe describes. */
const DRIVER = {
  Fs: 30, Qts: 0.4545454545, Qes: 0.5, Qms: 5, Vas: 60, Re: 3.6,
  Bl: 14.336, Mms: 151.425, Cms: 0.186, Sd: 480, Rms: 5.709,
}

/**
 * How far a parameter set is from satisfying each relation, relatively.
 *
 * The relations are the contract's own: Vas = ρc²·Sd²·Cms, Fs = 1/(2π√(Mms·Cms)),
 * Qms = 2πFs·Mms/Rms, Qes = 2πFs·Mms·Re/Bl², Qts = Qes·Qms/(Qes+Qms).
 *
 * @param {object} p - A full parameter set in display units.
 * @returns {object} Relative error per relation.
 */
function residuals(p) {
  const rel = (got, want) => Math.abs(got - want) / Math.abs(want)
  const mms = p.Mms * 1e-3
  const cms = p.Cms * 1e-3
  const sd = p.Sd * 1e-4
  return {
    compliance: rel(p.Vas, (K * sd * sd * cms) / 1e-3),
    resonance: rel(p.Fs, 1 / (TAU * Math.sqrt(mms * cms))),
    mechanicalQ: rel(p.Qms, (TAU * p.Fs * mms) / p.Rms),
    electricalQ: rel(p.Qes, (TAU * p.Fs * mms * p.Re) / (p.Bl * p.Bl)),
    totalQ: rel(p.Qts, (p.Qes * p.Qms) / (p.Qes + p.Qms)),
  }
}

/**
 * Assert a parameter set satisfies every relation.
 *
 * @param {object} p - A full parameter set.
 * @param {string} what - Label for the failure message.
 * @param {number} [tol] - Relative tolerance.
 * @returns {void}
 */
function assertConsistent(p, what, tol = 1e-5) {
  for (const [id, r] of Object.entries(residuals(p))) {
    assert.ok(r < tol, `${what}: ${id} off by ${r}`)
  }
}

/**
 * The full parameter set a basis implies, held values included.
 *
 * @param {object} p - Starting values.
 * @param {string[]} basis - The basis.
 * @returns {object} The complete set.
 */
function full(p, basis) {
  const { ok, values } = derive(p, basis)
  assert.ok(ok, `expected ${basis.join(',')} to resolve`)
  return { ...Object.fromEntries(basis.map((k) => [k, p[k]])), ...values }
}

// ---------------------------------------------------------------------------
// the shape of the system
// ---------------------------------------------------------------------------

// CONTRACT: "The eleven parameters bound together by the relations below."
// CONTRACT: "Le, the Le exponent and Xmax are absent on purpose."
test('COUPLED is the eleven bound parameters and excludes the independent ones', () => {
  assert.equal(COUPLED.length, 11)
  assert.equal(new Set(COUPLED).size, 11)
  for (const k of ['Le', 'LeExp', 'Xmax', 'count', 'wiring', 'Q']) {
    assert.ok(!COUPLED.includes(k), `${k} is not coupled`)
  }
})

// CONTRACT: "Eleven quantities minus five independent relations."
test('BASIS_SIZE is the eleven parameters less the five relations', () => {
  assert.equal(RELATIONS.length, 5)
  assert.equal(BASIS_SIZE, COUPLED.length - RELATIONS.length)
  for (const rel of RELATIONS) {
    for (const v of rel.vars) assert.ok(COUPLED.includes(v), `${rel.id} binds ${v}`)
  }
})

// CONTRACT: "The set held by default: the physical parameters, which is
// Hornresp's."
test('DEFAULT_BASIS is a valid basis of physical parameters', () => {
  assert.deepStrictEqual(DEFAULT_BASIS, ['Sd', 'Bl', 'Cms', 'Rms', 'Mms', 'Re'])
  assert.equal(DEFAULT_BASIS.length, BASIS_SIZE)
  assert.ok(canSolve(DEFAULT_BASIS))
})

// ---------------------------------------------------------------------------
// round6
// ---------------------------------------------------------------------------

// CONTRACT: "Round to six significant figures."
// CONTRACT: "or the input unchanged when it is not finite."
test('round6 keeps six significant figures at any magnitude', () => {
  assert.equal(round6(151.4251234), 151.425)
  assert.equal(round6(0.000186123456), 0.000186123)
  assert.equal(round6(1234567), 1234570)
  assert.equal(round6(0), 0)
  assert.ok(Number.isNaN(round6(NaN)))
  assert.equal(round6(Infinity), Infinity)
})

// ---------------------------------------------------------------------------
// derive
// ---------------------------------------------------------------------------

// CONTRACT: "Derive every parameter outside the basis from the ones inside it."
// CONTRACT: "the derived values (basis excluded)"
test('derive fills in exactly the parameters outside the basis', () => {
  const { ok, values, unresolved } = derive(DRIVER, DEFAULT_BASIS)
  assert.equal(ok, true)
  assert.deepStrictEqual(unresolved, [])
  assert.deepStrictEqual(
    new Set(Object.keys(values)),
    new Set(COUPLED.filter((k) => !DEFAULT_BASIS.includes(k))),
  )
})

// The point of the whole module: what comes out satisfies the relations.
test('derive produces a set that satisfies every relation', () => {
  assertConsistent(full(DRIVER, DEFAULT_BASIS), 'default basis')
})

// CONTRACT: "an incomplete one means the basis was not a basis"
// Which six are held must not change the driver, only which numbers are the
// user's. Every basis reachable by holding one more parameter is checked.
test('derive gives the same driver whichever valid basis is used', () => {
  const reference = full(DRIVER, DEFAULT_BASIS)
  let checked = 0
  for (const key of COUPLED) {
    const basis = lockParam(DEFAULT_BASIS, key)
    if (!basis) continue
    const got = full(reference, basis)
    assertConsistent(got, `basis ${basis.join(',')}`)
    for (const k of COUPLED) {
      const err = Math.abs(got[k] - reference[k]) / Math.abs(reference[k])
      assert.ok(err < 1e-4, `${k} via ${basis.join(',')}: ${got[k]} vs ${reference[k]}`)
    }
    checked++
  }
  assert.ok(checked >= COUPLED.length - 1, `checked ${checked} bases`)
})

// CONTRACT: "@param params - Current values in display units. Only the basis
// entries are read."
test('derive reads only the basis entries', () => {
  const partial = Object.fromEntries(DEFAULT_BASIS.map((k) => [k, DRIVER[k]]))
  assert.deepStrictEqual(derive(partial, DEFAULT_BASIS), derive(DRIVER, DEFAULT_BASIS))
})

// A basis value that is missing, zero or negative cannot produce a set, and
// says so rather than returning NaNs.
test('derive refuses a basis value that is not a positive number', () => {
  for (const bad of [0, -1, NaN, undefined, '4', null]) {
    const r = derive({ ...DRIVER, Sd: bad }, DEFAULT_BASIS)
    assert.equal(r.ok, false, `Sd = ${String(bad)}`)
    assert.deepStrictEqual(r.values, {})
    assert.ok(r.unresolved.length > 0)
  }
})

// CONTRACT: "@pure"
test('derive: @pure — twice-equal results and unmodified arguments', () => {
  const p = structuredClone(DRIVER)
  const before = structuredClone(p)
  const a = derive(p, DEFAULT_BASIS)
  const b = derive(structuredClone(before), [...DEFAULT_BASIS])
  assert.deepStrictEqual(a, b)
  assert.deepStrictEqual(p, before)
})

// ---------------------------------------------------------------------------
// canSolve
// ---------------------------------------------------------------------------

// CONTRACT: "True when it is the right size and everything else follows from it."
test('canSolve rejects anything that is not the right size', () => {
  assert.equal(canSolve(DEFAULT_BASIS.slice(0, 5)), false)
  assert.equal(canSolve([...DEFAULT_BASIS, 'Fs']), false)
  assert.equal(canSolve([]), false)
})

// Six parameters are not automatically six independent ones: Qts is already
// fixed by Qes and Qms, so a set containing all three is one short and leaves
// the motor undetermined.
test('canSolve rejects a set that is the right size but degenerate', () => {
  assert.equal(canSolve(['Fs', 'Qts', 'Qes', 'Qms', 'Vas', 'Sd']), false)
})

// CONTRACT: "Solvability is a property of which parameters are held, not of
// their values."
test('canSolve accepts bases that mix held and derived quantities', () => {
  assert.equal(canSolve(['Fs', 'Qts', 'Qes', 'Vas', 'Sd', 'Re']), true)
  assert.equal(canSolve(['Fs', 'Qes', 'Qms', 'Vas', 'Sd', 'Re']), true)
})

// ---------------------------------------------------------------------------
// lockParam / unlockParam
// ---------------------------------------------------------------------------

// CONTRACT: "Add a parameter to the basis, dropping whichever one makes room."
// CONTRACT: "the parameter that gives way is the one the user pinned longest ago"
test('lockParam adds the parameter and drops the oldest that still resolves', () => {
  for (const key of COUPLED.filter((k) => !DEFAULT_BASIS.includes(k))) {
    const next = lockParam(DEFAULT_BASIS, key)
    assert.ok(next, `${key} can be held`)
    assert.equal(next.length, BASIS_SIZE)
    assert.ok(next.includes(key), `${key} is in the new basis`)
    assert.equal(next[next.length - 1], key, `${key} is newest`)
    assert.ok(canSolve(next), `${next.join(',')} resolves`)
    // exactly one of the old basis gave way
    const dropped = DEFAULT_BASIS.filter((k) => !next.includes(k))
    assert.equal(dropped.length, 1, `one dropped for ${key}`)
  }
})

// CONTRACT: "@returns The new basis, or `null` when nothing can be dropped for it."
// Already held is not a change.
test('lockParam returns the basis unchanged for one already held', () => {
  for (const key of DEFAULT_BASIS) {
    assert.equal(lockParam(DEFAULT_BASIS, key), DEFAULT_BASIS)
  }
})

// CONTRACT: "Remove a parameter from the basis, promoting another to keep it
// complete."
test('unlockParam releases the parameter and promotes a replacement', () => {
  for (const key of DEFAULT_BASIS) {
    const next = unlockParam(DEFAULT_BASIS, key)
    assert.ok(next, `${key} can be released`)
    assert.equal(next.length, BASIS_SIZE)
    assert.ok(!next.includes(key), `${key} is out`)
    assert.ok(canSolve(next), `${next.join(',')} resolves`)
  }
})

// CONTRACT: "Candidates are tried in the canonical parameter order, so the
// same release always produces the same replacement rather than depending on
// history."
test('unlockParam is deterministic', () => {
  const a = unlockParam(DEFAULT_BASIS, 'Cms')
  const b = unlockParam([...DEFAULT_BASIS], 'Cms')
  assert.deepStrictEqual(a, b)
})

test('unlockParam returns the basis unchanged for one not held', () => {
  for (const key of COUPLED.filter((k) => !DEFAULT_BASIS.includes(k))) {
    assert.equal(unlockParam(DEFAULT_BASIS, key), DEFAULT_BASIS)
  }
})

// CONTRACT: "or `null` when no replacement completes it."
// Holding Qts, Qes and Qms at once is impossible — the third is always the
// consequence of the other two — so releasing into that state has no answer.
test('unlockParam refuses a release with no valid replacement', () => {
  const basis = ['Fs', 'Qts', 'Qes', 'Vas', 'Sd', 'Re']
  assert.ok(canSolve(basis))
  // Releasing Re leaves Fs, Qts, Qes, Vas, Sd — nothing left can complete it
  // without touching the motor, which needs both Bl and Re at once.
  const next = unlockParam(basis, 'Re')
  if (next !== null) assert.ok(canSolve(next), 'any answer given must resolve')
})

// A lock followed by its own release must return to a working basis, however
// many times it is done — the invariant the UI leans on.
test('lock and unlock keep the basis valid over a long run', () => {
  let basis = DEFAULT_BASIS
  const order = [...COUPLED, ...COUPLED].reverse()
  for (const key of order) {
    const next = basis.includes(key) ? unlockParam(basis, key) : lockParam(basis, key)
    if (!next) continue
    assert.equal(next.length, BASIS_SIZE, `size after ${key}`)
    assert.equal(new Set(next).size, BASIS_SIZE, `no duplicates after ${key}`)
    assert.ok(canSolve(next), `resolves after ${key}: ${next.join(',')}`)
    for (const k of next) assert.ok(COUPLED.includes(k), `${k} is a coupled parameter`)
    basis = next
  }
})

// ---------------------------------------------------------------------------
// basisOf
// ---------------------------------------------------------------------------

// CONTRACT: "A node that has never had a lock touched has no stored basis, and
// a stored one that no longer resolves — hand-edited, or written by an older
// version — is discarded rather than trusted."
test('basisOf falls back to the default for anything it cannot use', () => {
  assert.equal(basisOf(undefined), DEFAULT_BASIS)
  assert.equal(basisOf({}), DEFAULT_BASIS)
  assert.equal(basisOf({ data: {} }), DEFAULT_BASIS)
  assert.equal(basisOf({ data: { locks: 'Sd,Bl' } }), DEFAULT_BASIS)
  assert.equal(basisOf({ data: { locks: ['Sd'] } }), DEFAULT_BASIS)
  assert.equal(basisOf({ data: { locks: ['Fs', 'Qts', 'Qes', 'Qms', 'Vas', 'Sd'] } }), DEFAULT_BASIS)
})

test('basisOf returns a stored basis that still resolves', () => {
  const locks = ['Fs', 'Qts', 'Qes', 'Vas', 'Sd', 'Re']
  assert.deepStrictEqual(basisOf({ data: { locks } }), locks)
})

// ---------------------------------------------------------------------------
// TS_FIELDS / pickTS
// ---------------------------------------------------------------------------

// CONTRACT: "The coupled eleven plus the three independent ones."
// CONTRACT: "A label, an array count and the loss settings describe how a
// driver is being used, not what it is, so they are outside this list."
test('TS_FIELDS is the driver itself, not how the node uses it', () => {
  assert.deepStrictEqual(TS_FIELDS, [...COUPLED, 'Le', 'LeExp', 'Xmax'])
  for (const k of ['label', 'count', 'wiring', 'Q', 'lossless']) {
    assert.ok(!TS_FIELDS.includes(k), `${k} is not a driver field`)
  }
})

// CONTRACT: "Fields the set does not carry are left out rather than written as
// `undefined`."
test('pickTS copies the driver fields and nothing else', () => {
  const picked = pickTS({ ...DRIVER, Le: 1.5, LeExp: 1, Xmax: 15, label: 'left woofer', count: 2, Q: 30 })
  assert.deepStrictEqual(new Set(Object.keys(picked)), new Set(TS_FIELDS))
  for (const k of ['label', 'count', 'Q']) assert.ok(!(k in picked), `${k} not copied`)
  assert.equal(picked.Fs, DRIVER.Fs)
})

test('pickTS omits fields that are absent rather than writing undefined', () => {
  const picked = pickTS({ Fs: 30, Sd: 480, Xmax: null })
  assert.deepStrictEqual(picked, { Fs: 30, Sd: 480 })
  for (const k of TS_FIELDS) assert.ok(!(k in picked) || picked[k] != null, `${k} is never undefined`)
})

test('pickTS tolerates a missing parameter set', () => {
  assert.deepStrictEqual(pickTS(undefined), {})
  assert.deepStrictEqual(pickTS(null), {})
  assert.deepStrictEqual(pickTS({}), {})
})

// ---------------------------------------------------------------------------
// baselineOf / matchesBaseline
// ---------------------------------------------------------------------------

// CONTRACT: "The stored baseline parameters, or `null` when none was ever
// recorded."
test('baselineOf returns the stored baseline, or null', () => {
  assert.equal(baselineOf(undefined), null)
  assert.equal(baselineOf({}), null)
  assert.equal(baselineOf({ data: {} }), null)
  const base = pickTS(DRIVER)
  assert.equal(baselineOf({ data: { baseline: base } }), base)
})

// CONTRACT: "True when there is a baseline and every field still equals it."
test('matchesBaseline is false without a baseline', () => {
  assert.equal(matchesBaseline({ data: { params: DRIVER } }), false)
})

test('matchesBaseline tracks whether any driver field has moved', () => {
  const base = pickTS({ ...DRIVER, Le: 1.5, LeExp: 1, Xmax: 15 })
  const node = { data: { params: { ...base }, baseline: base } }
  assert.equal(matchesBaseline(node), true)
  for (const k of TS_FIELDS) {
    const moved = { data: { params: { ...base, [k]: base[k] * 1.01 }, baseline: base } }
    assert.equal(matchesBaseline(moved), false, `${k} moved`)
  }
})

// CONTRACT: "the driver's own fields only" — renaming the node, or changing
// how many of it there are, is not a change to the driver.
test('matchesBaseline ignores fields outside the driver itself', () => {
  const base = pickTS({ ...DRIVER, Le: 1.5, LeExp: 1, Xmax: 15 })
  const node = { data: { params: { ...base, label: 'left woofer', count: 2, Q: 30 }, baseline: base } }
  assert.equal(matchesBaseline(node), true)
})
