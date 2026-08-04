import { test } from 'node:test'
import assert from 'node:assert/strict'
import { auditDriver } from '../../src/data/driver-audit.js'

// UNREACHABLE — not covered:
//   rel(a, b)  — module-private, no test surface
//   pct(a, b)  — module-private, no test surface

// ---------------------------------------------------------------------------
// Units
//
// The contract says the identities are those of "the Bl, Re, Mms, Cms and Sd
// the solver actually runs on", so the record is built in the solver's SI
// units: Fs in Hz, Mms in kg, Cms in m/N, Sd in m^2, Re in ohm, Bl in T*m,
// Vas in m^3.
//
// AMBIGUITY: the contract states no units for any field, and states no
// tolerance at which a published value "disagrees" with the implied one. The
// self-consistent fixture below is built to satisfy every standard T/S
// identity exactly, so it should produce no sentence at any tolerance; the
// inconsistent fixtures are wrong by a factor of ten, which should exceed any
// plausible tolerance.
//
// AMBIGUITY: the Vas identity needs the air constant rho*c^2, which the
// contract never states. 1.42e5 Pa is the conventional value; a 1-2% choice
// of rho and c cannot matter at any sane tolerance.
// ---------------------------------------------------------------------------

const RHO_C2 = 1.42e5

// Fs = 1 / (2*pi*sqrt(Mms*Cms)); Qes = 2*pi*Fs*Mms*Re / Bl^2;
// Qts = Qes*Qms/(Qes+Qms);       Vas = rho*c^2*Sd^2*Cms
function consistentRecord () {
  const Mms = 0.05
  const Cms = 0.0005
  const Re = 6
  const Bl = 10
  const Sd = 0.05
  const Qms = 5
  const Fs = 1 / (2 * Math.PI * Math.sqrt(Mms * Cms))
  const Qes = (2 * Math.PI * Fs * Mms * Re) / (Bl * Bl)
  const Qts = (Qes * Qms) / (Qes + Qms)
  const Vas = RHO_C2 * Sd * Sd * Cms
  return { Fs, Qes, Qts, Qms, Vas, Re, Bl, Mms, Cms, Sd }
}

// CONTRACT: "Returns string[] — One sentence per inconsistency found, empty when the record is self-consistent."
test('auditDriver: returns an array of strings', () => {
  for (const input of [{}, consistentRecord(), { ...consistentRecord(), Qes: consistentRecord().Qes * 10 }]) {
    const out = auditDriver(input)
    assert.ok(Array.isArray(out), 'expected an array')
    for (const entry of out) assert.equal(typeof entry, 'string')
  }
})

// CONTRACT: "One sentence per inconsistency found, empty when the record is self-consistent."
test('auditDriver: a self-consistent record yields an empty array', () => {
  assert.deepEqual(auditDriver(consistentRecord()), [])
})

// CONTRACT: "Each check is skipped unless every value it needs is present and positive, so
// a sparse hand-transcribed row is audited on whatever it does provide instead of being
// flagged for what it omits."
test('auditDriver: an empty record yields an empty array', () => {
  assert.deepEqual(auditDriver({}), [])
})

// CONTRACT: "When a published value disagrees with the one implied by its siblings ...
// Discrepancies are returned as human-readable sentences" / "One sentence per inconsistency found"
test('auditDriver: a check runs when every value it needs is present and positive', () => {
  // Only the Qes identity has all of its inputs here: Fs, Mms, Re and Bl are
  // present and positive, and the published Qes is ten times the implied one.
  const c = consistentRecord()
  const d = { Fs: c.Fs, Mms: c.Mms, Re: c.Re, Bl: c.Bl, Qes: c.Qes * 10 }
  const out = auditDriver(d)
  assert.ok(out.length >= 1, 'expected at least one sentence for a 10x Qes disagreement')
  for (const entry of out) assert.equal(typeof entry, 'string')
})

// CONTRACT: "Each check is skipped unless every value it needs is present and positive"
test('auditDriver: a check is skipped when one value it needs is absent', () => {
  const c = consistentRecord()
  // Same 10x-wrong Qes, but Bl — which the Qes identity needs — is absent, and
  // no other identity has all of its inputs, so nothing can be checked.
  const d = { Fs: c.Fs, Mms: c.Mms, Re: c.Re, Qes: c.Qes * 10 }
  assert.deepEqual(auditDriver(d), [])
})

// CONTRACT: "Each check is skipped unless every value it needs is present and positive"
test('auditDriver: a check is skipped when one value it needs is zero', () => {
  const c = consistentRecord()
  const d = { Fs: c.Fs, Mms: c.Mms, Re: c.Re, Bl: 0, Qes: c.Qes * 10 }
  assert.deepEqual(auditDriver(d), [])
})

// CONTRACT: "Each check is skipped unless every value it needs is present and positive"
test('auditDriver: a check is skipped when one value it needs is negative', () => {
  const c = consistentRecord()
  const d = { Fs: c.Fs, Mms: c.Mms, Re: c.Re, Bl: -c.Bl, Qes: c.Qes * 10 }
  assert.deepEqual(auditDriver(d), [])
})

// CONTRACT: "Each check is skipped unless every value it needs is present and positive"
test('auditDriver: the Qts identity is skipped without Qms and runs with it', () => {
  const c = consistentRecord()
  // Qts vs Qes/Qms: with Qms absent the identity cannot be evaluated. Fs, Mms,
  // Re, Bl, Cms, Sd and Vas are all absent too, so no other check can run.
  assert.deepEqual(auditDriver({ Qes: c.Qes, Qts: c.Qts * 10 }), [])
  const withQms = auditDriver({ Qes: c.Qes, Qms: c.Qms, Qts: c.Qts * 10 })
  assert.ok(withQms.length >= 1, 'expected a sentence once Qms makes the Qts identity checkable')
})

// CONTRACT: "Nothing is corrected here" / postcondition "d is not modified."
test('auditDriver: d is not modified', () => {
  const d = { ...consistentRecord(), Qes: consistentRecord().Qes * 10, brand: 'Acme', ext: { spider: 'double' } }
  const before = structuredClone(d)
  auditDriver(d)
  assert.deepEqual(d, before)
})

// CONTRACT: "@pure — ... Calling it twice with equal inputs must produce equal output and change nothing observable."
test('auditDriver: pure — twice with equal inputs gives equal output, arguments unmodified', () => {
  const base = { ...consistentRecord(), Qts: consistentRecord().Qts * 10 }
  const a = structuredClone(base)
  const b = structuredClone(base)
  const first = auditDriver(a)
  const second = auditDriver(b)
  assert.deepEqual(first, second)
  assert.deepEqual(a, b)
  assert.deepEqual(a, base)
})
