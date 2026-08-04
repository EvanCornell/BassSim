import { test } from 'node:test'
import assert from 'node:assert/strict'
import { auditDriver, TOL } from '../../src/data/driver-audit.js'

// UNREACHABLE — not covered:
//   rel(a, b)  — module-private, no test surface
//   pct(a, b)  — module-private, no test surface

// ---------------------------------------------------------------------------
// CONTRACT: "Three identities are checked, each only when every value it needs is
// present and positive: Qes against ωs·Mms·Re/Bl², Qts against Qes ∥ Qms, and Vas
// against ρc²·Sd²·Cms. Fields are read in the database's own display units —
// Mms in grams, Cms in mm/N, Sd in cm², Vas in litres — and converted internally.
// The tolerances live in `TOL` and are relative, not absolute."
//
// Every fixture below is therefore written in display units, and every
// disagreement is expressed as a multiple of the relevant `TOL` entry rather
// than as an invented threshold.
//
// CONTRACT: "Wording is for humans and is not a stable interface." — no test
// below asserts any wording; only counts, types and emptiness.
//
// AMBIGUITY (still open): the Vas identity needs ρc², which no contract states.
// 1.42e5 Pa is the conventional value; the ~1.5% spread across plausible
// choices of ρ and c is far inside TOL.Vas, documented as the loosest of the
// three.
//
// AMBIGUITY: the contract does not say whether the comparison against TOL is
// strict or inclusive, so no fixture sits on the boundary — violations are 3×
// TOL and compliant cases are TOL/4.
// ---------------------------------------------------------------------------

const RHO_C2 = 1.42e5

// Built from independent primitives in display units, with the three checked
// values derived from them, so the record is self-consistent by construction.
function consistentRecord () {
  const Mms = 50 // g
  const Cms = 0.5 // mm/N
  const Re = 6 // ohm
  const Bl = 10 // T*m
  const Sd = 500 // cm^2
  const Qms = 5

  const MmsSI = Mms / 1000
  const CmsSI = Cms / 1000
  const SdSI = Sd / 1e4

  const Fs = 1 / (2 * Math.PI * Math.sqrt(MmsSI * CmsSI)) // Hz
  const wS = 2 * Math.PI * Fs
  const Qes = (wS * MmsSI * Re) / (Bl * Bl)
  const Qts = (Qes * Qms) / (Qes + Qms) // Qes || Qms
  const Vas = RHO_C2 * SdSI * SdSI * CmsSI * 1000 // m^3 -> litres

  return { Fs, Qes, Qts, Qms, Vas, Re, Bl, Mms, Cms, Sd }
}

// Only the fields the Qes identity needs: Qes against ωs·Mms·Re/Bl².
function qesOnly (scale) {
  const c = consistentRecord()
  return { Fs: c.Fs, Mms: c.Mms, Re: c.Re, Bl: c.Bl, Qes: c.Qes * scale }
}

// Only the fields the Qts identity needs: Qts against Qes ∥ Qms.
function qtsOnly (scale) {
  const c = consistentRecord()
  return { Qes: c.Qes, Qms: c.Qms, Qts: c.Qts * scale }
}

// Only the fields the Vas identity needs: Vas against ρc²·Sd²·Cms.
function vasOnly (scale) {
  const c = consistentRecord()
  return { Vas: c.Vas * scale, Sd: c.Sd, Cms: c.Cms }
}

// ===========================================================================
// TOL
// ===========================================================================

// CONTRACT: "`TOL` — Per-parameter tolerances for the consistency audit, as relative
// differences. ... Keys: `Qes`, `Qts`, `Vas`"
test('TOL: has exactly the keys Qes, Qts and Vas, each a positive relative difference', () => {
  assert.deepEqual(Object.keys(TOL).sort(), ['Qes', 'Qts', 'Vas'])
  for (const [k, v] of Object.entries(TOL)) {
    assert.equal(typeof v, 'number', `TOL.${k} must be a number`)
    assert.ok(v > 0, `TOL.${k} must be positive`)
    // "relative differences", "as relative differences" — a relative tolerance
    // of 1 or more would accept a value off by 100%.
    assert.ok(v < 1, `TOL.${k} must be a relative difference, not a percentage or absolute value`)
  }
})

// CONTRACT: "Vas is loosest because manufacturers disagree on how much of the surround
// counts toward Sd, and Sd enters the relation squared."
test('TOL: Vas is the loosest tolerance', () => {
  assert.ok(TOL.Vas > TOL.Qes, 'TOL.Vas must be looser than TOL.Qes')
  assert.ok(TOL.Vas > TOL.Qts, 'TOL.Vas must be looser than TOL.Qts')
})

// ===========================================================================
// auditDriver
// ===========================================================================

// CONTRACT: "Returns string[] — One sentence per inconsistency found, empty when the
// record is self-consistent."
test('auditDriver: returns an array of strings', () => {
  for (const input of [{}, consistentRecord(), qesOnly(1 + 3 * TOL.Qes)]) {
    const out = auditDriver(input)
    assert.ok(Array.isArray(out), 'expected an array')
    for (const entry of out) assert.equal(typeof entry, 'string')
  }
})

// CONTRACT: "empty when the record is self-consistent."
test('auditDriver: a self-consistent record yields an empty array', () => {
  assert.deepEqual(auditDriver(consistentRecord()), [])
})

// CONTRACT: "Each check is skipped unless every value it needs is present and positive, so
// a sparse hand-transcribed row is audited on whatever it does provide instead of being
// flagged for what it omits."
test('auditDriver: an empty record yields an empty array', () => {
  assert.deepEqual(auditDriver({}), [])
})

// CONTRACT: "Qes against ωs·Mms·Re/Bl²" + "One sentence per inconsistency found" +
// "The tolerances live in `TOL` and are relative"
test('auditDriver: the Qes identity is flagged when it disagrees by more than TOL.Qes', () => {
  const out = auditDriver(qesOnly(1 + 3 * TOL.Qes))
  assert.equal(out.length, 1, 'exactly one identity is checkable and it disagrees')
  assert.equal(typeof out[0], 'string')
})

// CONTRACT: "The tolerances live in `TOL` and are relative, not absolute." — a
// disagreement inside the tolerance is not an inconsistency.
test('auditDriver: the Qes identity is not flagged inside TOL.Qes', () => {
  assert.deepEqual(auditDriver(qesOnly(1 + TOL.Qes / 4)), [])
  assert.deepEqual(auditDriver(qesOnly(1 - TOL.Qes / 4)), [])
})

// CONTRACT: "Qts against Qes ∥ Qms"
test('auditDriver: the Qts identity is flagged when it disagrees by more than TOL.Qts', () => {
  const out = auditDriver(qtsOnly(1 + 3 * TOL.Qts))
  assert.equal(out.length, 1)
  assert.equal(typeof out[0], 'string')
})

// CONTRACT: "The tolerances live in `TOL` and are relative, not absolute."
test('auditDriver: the Qts identity is not flagged inside TOL.Qts', () => {
  assert.deepEqual(auditDriver(qtsOnly(1 + TOL.Qts / 4)), [])
  assert.deepEqual(auditDriver(qtsOnly(1 - TOL.Qts / 4)), [])
})

// CONTRACT: "Vas against ρc²·Sd²·Cms" + "Fields are read in the database's own display
// units — ... Cms in mm/N, Sd in cm², Vas in litres — and converted internally."
test('auditDriver: the Vas identity is flagged when it disagrees by more than TOL.Vas', () => {
  const out = auditDriver(vasOnly(1 + 3 * TOL.Vas))
  assert.equal(out.length, 1)
  assert.equal(typeof out[0], 'string')
})

// CONTRACT: "The tolerances live in `TOL` and are relative, not absolute."
test('auditDriver: the Vas identity is not flagged inside TOL.Vas', () => {
  assert.deepEqual(auditDriver(vasOnly(1 + TOL.Vas / 4)), [])
  assert.deepEqual(auditDriver(vasOnly(1 - TOL.Vas / 4)), [])
})

// CONTRACT: "Three identities are checked" — a record breaking all three, each in
// isolation of the others' inputs, produces one sentence per inconsistency.
test('auditDriver: one sentence per inconsistency, not one per record', () => {
  const c = consistentRecord()
  const Qes = c.Qes * (1 + 3 * TOL.Qes) // disagrees with ωs·Mms·Re/Bl²
  const impliedQts = (Qes * c.Qms) / (Qes + c.Qms)
  const broken = {
    ...c,
    Qes,
    Qts: impliedQts * (1 + 3 * TOL.Qts), // disagrees with Qes ∥ Qms
    Vas: c.Vas * (1 + 3 * TOL.Vas) // disagrees with ρc²·Sd²·Cms
  }
  const out = auditDriver(broken)
  assert.equal(out.length, 3)
  for (const entry of out) assert.equal(typeof entry, 'string')
})

// CONTRACT: "Each check is skipped unless every value it needs is present and positive"
test('auditDriver: a check is skipped when one value it needs is absent', () => {
  const d = qesOnly(1 + 3 * TOL.Qes)
  delete d.Bl // the Qes identity needs Bl; no other identity has its inputs
  assert.deepEqual(auditDriver(d), [])
})

// CONTRACT: "Each check is skipped unless every value it needs is present and positive"
test('auditDriver: a check is skipped when one value it needs is zero', () => {
  const d = qesOnly(1 + 3 * TOL.Qes)
  d.Bl = 0
  assert.deepEqual(auditDriver(d), [])
})

// CONTRACT: "Each check is skipped unless every value it needs is present and positive"
test('auditDriver: a check is skipped when one value it needs is negative', () => {
  const d = qesOnly(1 + 3 * TOL.Qes)
  d.Bl = -Math.abs(d.Bl)
  assert.deepEqual(auditDriver(d), [])
})

// CONTRACT: "Each check is skipped unless every value it needs is present and positive"
test('auditDriver: the Qts identity is skipped without Qms and runs with it', () => {
  const c = consistentRecord()
  const withoutQms = { Qes: c.Qes, Qts: c.Qts * (1 + 3 * TOL.Qts) }
  assert.deepEqual(auditDriver(withoutQms), [])
  assert.equal(auditDriver({ ...withoutQms, Qms: c.Qms }).length, 1)
})

// CONTRACT: "Each check is skipped unless every value it needs is present and positive"
test('auditDriver: the Vas identity is skipped when Sd is missing', () => {
  const d = vasOnly(1 + 3 * TOL.Vas)
  delete d.Sd
  assert.deepEqual(auditDriver(d), [])
})

// CONTRACT: "Nothing is corrected here" / postcondition "d is not modified."
test('auditDriver: d is not modified', () => {
  const c = consistentRecord()
  const d = { ...c, Qes: c.Qes * (1 + 3 * TOL.Qes), brand: 'Acme', ext: { spider: 'double' } }
  const before = structuredClone(d)
  auditDriver(d)
  assert.deepEqual(d, before)
})

// CONTRACT: "@pure — ... Calling it twice with equal inputs must produce equal output and
// change nothing observable."
test('auditDriver: pure — twice with equal inputs gives equal output, arguments unmodified', () => {
  const c = consistentRecord()
  const base = { ...c, Qts: c.Qts * (1 + 3 * TOL.Qts) }
  const a = structuredClone(base)
  const b = structuredClone(base)
  const first = auditDriver(a)
  const second = auditDriver(b)
  assert.deepEqual(first, second)
  assert.deepEqual(a, b)
  assert.deepEqual(a, base)
})
