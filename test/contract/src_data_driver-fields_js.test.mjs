import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  driverToParams,
  formatExt,
  CORE_FIELDS,
  EXT_FIELDS,
  EXT_BY_KEY,
  EXT_GROUPS,
  SOURCE_LABELS
} from '../../src/data/driver-fields.js'

// UNREACHABLE — not covered:
//   (none in this module)

// ---------------------------------------------------------------------------
// The core T/S field names are now stated verbatim by the `CORE_FIELDS`
// contract, in its units line:
//   "Units: Fs Hz · Vas L · Re Ω · Bl T·m · Mms g · Cms mm/N · Sd cm² ·
//    Le mH · Xmax mm · Rms N·s/m."
// Those ten are quoted; `CORE_FIELDS` is documented as "An array of 13
// entries", so three further core fields exist that the contract never names.
//
// The `solver: true` count was corrected: the contract now states outright
// "Exactly nine entries carry `solver: true`", explaining in the same breath
// that eight of those nine enter `driverSI`'s electro-mechanical equation and
// the ninth — Xmax — merely bounds excursion. "Nine is the count to assert;
// eight is a subset of it, not an alternative reading."
//
// AMBIGUITY (still open): the module-level line "`driverSI()` reads
// Mms/Cms/Rms/Sd/Re/Le/Bl/Fs and nothing else" (eight fields, explicitly
// exhaustive) sits uneasily beside the CORE_FIELDS line's claim that the nine
// solver-marked fields "are exactly the fields `driverSI` reads". Read
// literally, one says driverSI reads eight and nothing else, the other says it
// reads nine (the eight plus Xmax). Both readings agree on which nine fields
// carry `solver: true` (the eight named fields, plus Xmax), so that set is
// asserted directly below without resolving whether driverSI itself consumes
// Xmax — `driverSI` is not exported from this module and cannot be probed
// blind.
//
// AMBIGUITY (still open): `driverToParams` says the result carries "`label`
// from the model name", but no contract names the record field holding the
// model name. `model` is taken as the strictest reading — the postcondition
// excluding `brand` from the result leaves `model` as the only other half of
// a driver's name.
//
// AMBIGUITY (still open): the field-descriptor property names are never
// stated. `CORE_FIELDS`/`EXT_FIELDS` entries are asserted to expose `key`
// because `EXT_BY_KEY` is documented as those descriptors "indexed by key",
// and `formatExt` takes "an extended field key".
// ---------------------------------------------------------------------------

const SPEC_CORE_FIELDS = ['Fs', 'Vas', 'Re', 'Bl', 'Mms', 'Cms', 'Sd', 'Le', 'Xmax', 'Rms']

// The nine fields the corrected contract names as carrying solver: true:
// "the eight of them that enter the electro-mechanical equation, plus Xmax".
const SPEC_SOLVER_FIELDS = ['Bl', 'Cms', 'Fs', 'Le', 'Mms', 'Re', 'Rms', 'Sd', 'Xmax']

// A record carrying every named core field, every forbidden key, and trivia.
function fullRecord () {
  return {
    brand: 'Acme',
    model: 'AX-12',
    Fs: 31.5,
    Vas: 90,
    Re: 6.2,
    Bl: 11.5,
    Mms: 55,
    Cms: 0.46,
    Sd: 491,
    Le: 0.9,
    Xmax: 6,
    Rms: 2.4,
    // provenance and trivia that must never reach node params
    ext: { spider: 'double', magnet: 'ferrite' },
    source: 'official',
    suspect: ['Qts disagrees with its siblings'],
    recommendedEnclosure: 'sealed 40 L'
  }
}

// ===========================================================================
// Exported constants
// ===========================================================================

// CONTRACT: "`CORE_FIELDS` — The flat, solver-facing T/S fields every driver record may
// carry. ... An array of 13 entries."
test('CORE_FIELDS: an array of 13 entries', () => {
  assert.ok(Array.isArray(CORE_FIELDS))
  assert.equal(CORE_FIELDS.length, 13)
})

// CONTRACT: "Exactly nine entries carry `solver: true`, and they are exactly
// the fields `driverSI` reads: the eight of them that enter the
// electro-mechanical equation, plus Xmax, which bounds excursion rather than
// shaping response. Nine is the count to assert; eight is a subset of it, not
// an alternative reading."
test('CORE_FIELDS: exactly nine entries are marked solver: true', () => {
  assert.equal(CORE_FIELDS.filter((f) => f.solver === true).length, 9)
})

// CONTRACT: "Units: Fs Hz · Vas L · Re Ω · Bl T·m · Mms g · Cms mm/N · Sd cm² · Le mH ·
// Xmax mm · Rms N·s/m." — every field named in the units line is a core field.
test('CORE_FIELDS: contains every core field the contract names', () => {
  const keys = CORE_FIELDS.map((f) => f.key)
  for (const name of SPEC_CORE_FIELDS) {
    assert.ok(keys.includes(name), `expected CORE_FIELDS to declare ${name}`)
  }
})

// CONTRACT: "Exactly nine entries carry `solver: true` ... the eight of them
// that enter the electro-mechanical equation, plus Xmax" — this pins down the
// exact set of nine keys, independent of which of the two module-doc readings
// of "reads" is correct (see the AMBIGUITY note above).
test('CORE_FIELDS: the solver-marked entries are exactly the documented nine', () => {
  const solverKeys = CORE_FIELDS.filter((f) => f.solver === true).map((f) => f.key).sort()
  assert.deepEqual(solverKeys, [...SPEC_SOLVER_FIELDS].sort())
})

// CONTRACT: "`EXT_FIELDS` — Extended, manufacturer-specific parameters, grouped for
// display. ... An array of 28 entries."
test('EXT_FIELDS: an array of 28 entries', () => {
  assert.ok(Array.isArray(EXT_FIELDS))
  assert.equal(EXT_FIELDS.length, 28)
})

// CONTRACT: "`EXT_BY_KEY` — Extended field descriptors indexed by key, for O(1) lookup
// during filtering."
test('EXT_BY_KEY: indexes exactly the EXT_FIELDS descriptors', () => {
  const values = Object.values(EXT_BY_KEY)
  assert.equal(values.length, EXT_FIELDS.length)
  for (const descriptor of values) {
    assert.ok(EXT_FIELDS.includes(descriptor), 'EXT_BY_KEY holds a descriptor absent from EXT_FIELDS')
  }
  for (const descriptor of EXT_FIELDS) {
    assert.ok(values.includes(descriptor), 'an EXT_FIELDS descriptor is missing from EXT_BY_KEY')
  }
})

// CONTRACT: "Extended field descriptors indexed by key" — the index key is the
// descriptor's own key.
test('EXT_BY_KEY: each descriptor is filed under its own key', () => {
  for (const [k, descriptor] of Object.entries(EXT_BY_KEY)) {
    assert.equal(descriptor.key, k)
  }
})

// CONTRACT: "`EXT_GROUPS` — Display group names in declaration order, so the UI groups
// fields consistently. An array. Its length is computed at load time and is not
// published here." / (EXT_FIELDS) "The groups are Excursion, Electrical, Motor,
// Construction and Application." — the group names are now stated, even though
// the array's length is explicitly not published as a number; the five names
// pin the length regardless.
test('EXT_GROUPS: contains exactly the five documented display group names', () => {
  assert.ok(Array.isArray(EXT_GROUPS))
  assert.equal(EXT_GROUPS.length, 5)
  assert.deepEqual(
    [...EXT_GROUPS].sort(),
    ['Application', 'Construction', 'Electrical', 'Excursion', 'Motor'],
  )
  for (const g of EXT_GROUPS) assert.equal(typeof g, 'string')
})

// CONTRACT: "Display group names in declaration order" + EXT_FIELDS are "grouped for display"
test('EXT_GROUPS: are the groups EXT_FIELDS declares, in declaration order', () => {
  const seen = []
  for (const f of EXT_FIELDS) {
    if (!seen.includes(f.group)) seen.push(f.group)
  }
  assert.deepEqual(EXT_GROUPS, seen)
})

// CONTRACT: "`SOURCE_LABELS` — Human-readable provenance labels keyed by a record's
// `source`. ... Keys: `official`, `datasheet`, `custom`"
test('SOURCE_LABELS: has exactly the documented keys, each a human-readable label', () => {
  assert.deepEqual(Object.keys(SOURCE_LABELS).sort(), ['custom', 'datasheet', 'official'])
  for (const label of Object.values(SOURCE_LABELS)) {
    assert.equal(typeof label, 'string')
    assert.notEqual(label.length, 0)
  }
})

// ===========================================================================
// driverToParams
// ===========================================================================

// CONTRACT: "Returns object — Node params: `label` from the model name, plus each present
// core T/S field."
test('driverToParams: returns an object', () => {
  const result = driverToParams(fullRecord())
  assert.equal(typeof result, 'object')
  assert.notEqual(result, null)
  assert.equal(Array.isArray(result), false)
})

// CONTRACT: "Node params: `label` from the model name"
test('driverToParams: label comes from the model name', () => {
  const d = fullRecord()
  assert.equal(driverToParams(d).label, d.model)
})

// CONTRACT: "plus each present core T/S field" — for the ten core fields the
// CORE_FIELDS units line names verbatim.
test('driverToParams: every present core T/S field is carried through unchanged', () => {
  const d = fullRecord()
  const result = driverToParams(d)
  for (const key of SPEC_CORE_FIELDS) {
    assert.ok(key in result, `expected core T/S field ${key} in result`)
    assert.equal(result[key], d[key], `expected result.${key} to equal input.${key}`)
  }
})

// CONTRACT: "plus each present core T/S field" — where the core set is CORE_FIELDS,
// "the flat, solver-facing T/S fields every driver record may carry".
test('driverToParams: every field CORE_FIELDS declares is carried through when present', () => {
  const d = { model: 'Full-15' }
  for (const f of CORE_FIELDS) d[f.key] = 1.25
  const result = driverToParams(d)
  for (const f of CORE_FIELDS) {
    assert.ok(f.key in result, `expected declared core field ${f.key} in result`)
    assert.equal(result[f.key], 1.25)
  }
})

// CONTRACT: "Fields the record omits stay absent, leaving the node's own defaults in place."
test('driverToParams: fields the record omits stay absent', () => {
  const sparse = { model: 'Sparse-8', Fs: 42 }
  const result = driverToParams(sparse)
  assert.ok('Fs' in result)
  for (const f of CORE_FIELDS) {
    if (f.key === 'Fs') continue
    assert.equal(f.key in result, false, `expected omitted field ${f.key} to stay absent from the result`)
  }
})

// CONTRACT: "The result contains no `ext`, `source`, `suspect` or `brand` key, whatever the
// input carries."
test('driverToParams: result contains no ext, source, suspect or brand key', () => {
  const result = driverToParams(fullRecord())
  for (const forbidden of ['ext', 'source', 'suspect', 'brand']) {
    assert.equal(forbidden in result, false, `forbidden key ${forbidden} leaked into the result`)
  }
})

// CONTRACT: "A record carries construction trivia — spider type, magnet material,
// recommended enclosure — that must never reach a node's params, so this copies the core
// fields explicitly rather than spreading the row and deleting what it does not want."
test('driverToParams: nothing beyond label and core T/S fields reaches node params', () => {
  const result = driverToParams(fullRecord())
  // An explicit copy of the core fields cannot admit any other key. The record
  // above carries only the ten core fields the contract names, so the allowed
  // set needs no field the contract leaves unnamed.
  const allowed = new Set(['label', ...SPEC_CORE_FIELDS])
  for (const key of Object.keys(result)) {
    assert.ok(allowed.has(key), `unexpected key ${key} reached node params`)
  }
})

// CONTRACT: "d is not modified."
test('driverToParams: d is not modified', () => {
  const d = fullRecord()
  const before = structuredClone(d)
  driverToParams(d)
  assert.deepEqual(d, before)
})

// CONTRACT: "@pure — ... Calling it twice with equal inputs must produce equal output and
// change nothing observable."
test('driverToParams: pure — twice with equal inputs gives equal output, arguments unmodified', () => {
  const a = fullRecord()
  const b = structuredClone(a)
  const first = driverToParams(a)
  const second = driverToParams(b)
  assert.deepEqual(first, second)
  assert.deepEqual(a, b)
  assert.deepEqual(a, fullRecord())
})

// ===========================================================================
// formatExt
// ===========================================================================

// CONTRACT: "Returns string|null — The formatted value with its unit appended, or `null`
// when the key is unknown or the value is absent"
// The valid extended field keys are now nameable: they are the keys of EXT_BY_KEY,
// "extended field descriptors indexed by key".
test('formatExt: a known key with a present value returns a string', () => {
  const keys = Object.keys(EXT_BY_KEY)
  assert.ok(keys.length >= 1, 'expected EXT_BY_KEY to index at least one extended field')
  for (const key of keys) {
    const out = formatExt(key, 12)
    assert.equal(typeof out, 'string', `formatExt('${key}', 12) must not be null: key known, value present`)
    // "The formatted value with its unit appended" — the value must survive into
    // the text. The unit string itself is not nameable from the contract.
    assert.ok(out.includes('12'), `formatExt('${key}', 12) dropped the value: ${out}`)
  }
})

// CONTRACT: "or `null` when the key is unknown"
test('formatExt: unknown key returns null', () => {
  assert.equal(formatExt('__not_an_extended_field__', 12), null)
  assert.equal(formatExt('__not_an_extended_field__', 'twelve'), null)
})

// CONTRACT: "or `null` when ... the value is absent — which is the normal case, since
// extended parameters are sparse."
test('formatExt: absent value returns null, for known and unknown keys alike', () => {
  for (const key of ['__not_an_extended_field__', ...Object.keys(EXT_BY_KEY)]) {
    assert.equal(formatExt(key, null), null, `expected null for ${key} with a null value`)
    assert.equal(formatExt(key, undefined), null, `expected null for ${key} with an undefined value`)
  }
})

// CONTRACT: "Returns string|null"
test('formatExt: return value is a string or null, never anything else', () => {
  const keys = Object.keys(EXT_BY_KEY)
  const samples = [
    ['__not_an_extended_field__', 1],
    ...keys.map((k) => [k, 1]),
    ...keys.map((k) => [k, 'n/a']),
    ...keys.map((k) => [k, null]),
    ...keys.map((k) => [k, undefined])
  ]
  for (const [key, value] of samples) {
    const out = formatExt(key, value)
    assert.ok(out === null || typeof out === 'string', `formatExt(${key}, ${String(value)}) returned ${typeof out}`)
  }
})

// CONTRACT: "@pure — ... Calling it twice with equal inputs must produce equal output and
// change nothing observable."
test('formatExt: pure — twice with equal inputs gives equal output', () => {
  for (const key of ['__not_an_extended_field__', ...Object.keys(EXT_BY_KEY)]) {
    for (const value of [12, 'n/a', null, undefined]) {
      assert.deepEqual(formatExt(key, value), formatExt(key, value))
    }
  }
})
