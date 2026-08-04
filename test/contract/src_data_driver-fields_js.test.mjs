import { test } from 'node:test'
import assert from 'node:assert/strict'
import { driverToParams, formatExt } from '../../src/data/driver-fields.js'

// UNREACHABLE — not covered:
//   (none in this module)

// ---------------------------------------------------------------------------
// Shared fixtures
//
// AMBIGUITY: the contract for `driverToParams` says the result carries
// "`label` from the model name, plus each present core T/S field", but it
// never names the record field holding the model name, and never enumerates
// the "core T/S fields". The strictest defensible reading is taken here:
//   - the model name lives in `model` (the only field the postcondition's
//     exclusion of `brand` leaves room for as the model half of a name), so
//     `label === d.model`;
//   - the core T/S set is the one the sibling contract for
//     `auditDriver` (src/data/driver-audit.js) calls a "T/S set":
//     Fs, Qes, Qts, Qms, Vas, Re, Bl, Mms, Cms, Sd.
// ---------------------------------------------------------------------------

const CORE_TS_FIELDS = ['Fs', 'Qes', 'Qts', 'Qms', 'Vas', 'Re', 'Bl', 'Mms', 'Cms', 'Sd']

// A record deliberately carrying every forbidden key alongside the core set.
function fullRecord () {
  return {
    brand: 'Acme',
    model: 'AX-12',
    Fs: 31.5,
    Qes: 0.4,
    Qts: 0.36,
    Qms: 4.2,
    Vas: 0.09,
    Re: 6.2,
    Bl: 11.5,
    Mms: 0.055,
    Cms: 0.00046,
    Sd: 0.0491,
    // construction trivia / provenance that must never reach node params
    ext: { spider: 'double', magnet: 'ferrite' },
    source: 'catalog-2024',
    suspect: ['Qts disagrees with its siblings'],
    recommendedEnclosure: 'sealed 40 L'
  }
}

// CONTRACT: "Returns object — Node params: `label` from the model name, plus each present core T/S field."
test('driverToParams: returns an object', () => {
  const result = driverToParams(fullRecord())
  assert.equal(typeof result, 'object')
  assert.notEqual(result, null)
  assert.equal(Array.isArray(result), false)
})

// CONTRACT: "Returns object — Node params: `label` from the model name, plus each present core T/S field."
test('driverToParams: label comes from the model name', () => {
  const d = fullRecord()
  const result = driverToParams(d)
  // AMBIGUITY: "from the model name" fixes no transformation; the strictest
  // reading is that the label IS the model name, unchanged.
  assert.equal(result.label, d.model)
})

// CONTRACT: "Returns object — Node params: `label` from the model name, plus each present core T/S field."
test('driverToParams: every present core T/S field is carried through unchanged', () => {
  const d = fullRecord()
  const result = driverToParams(d)
  for (const key of CORE_TS_FIELDS) {
    assert.ok(key in result, `expected core T/S field ${key} in result`)
    assert.equal(result[key], d[key], `expected result.${key} to equal input.${key}`)
  }
})

// CONTRACT: "Fields the record omits stay absent, leaving the node's own defaults in place."
test('driverToParams: fields the record omits stay absent', () => {
  const sparse = { model: 'Sparse-8', Fs: 42 }
  const result = driverToParams(sparse)
  assert.ok('Fs' in result)
  for (const key of CORE_TS_FIELDS) {
    if (key === 'Fs') continue
    assert.equal(key in result, false, `expected omitted field ${key} to stay absent from the result`)
  }
})

// CONTRACT: "The result contains no `ext`, `source`, `suspect` or `brand` key, whatever the input carries."
test('driverToParams: result contains no ext, source, suspect or brand key', () => {
  const result = driverToParams(fullRecord())
  for (const forbidden of ['ext', 'source', 'suspect', 'brand']) {
    assert.equal(forbidden in result, false, `forbidden key ${forbidden} leaked into the result`)
  }
})

// CONTRACT: "this copies the core fields explicitly rather than spreading the row and
// deleting what it does not want" / "A record carries construction trivia — spider type,
// magnet material, recommended enclosure — that must never reach a node's params"
test('driverToParams: construction trivia beyond the named four is also dropped', () => {
  const result = driverToParams(fullRecord())
  // An explicit copy of the core fields cannot admit a key that is neither
  // `label` nor a core T/S field.
  const allowed = new Set(['label', ...CORE_TS_FIELDS])
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

// CONTRACT: "@pure — ... Calling it twice with equal inputs must produce equal output and change nothing observable."
test('driverToParams: pure — twice with equal inputs gives equal output, arguments unmodified', () => {
  const a = fullRecord()
  const b = structuredClone(a)
  const first = driverToParams(a)
  const second = driverToParams(b)
  assert.deepEqual(first, second)
  assert.deepEqual(a, b)
  assert.deepEqual(a, fullRecord())
})

// ---------------------------------------------------------------------------
// formatExt
//
// AMBIGUITY: the contract never enumerates a single valid "extended field key"
// nor any unit string, so the positive branch ("the formatted value with its
// unit appended") is not testable blind. Only the documented null branches are
// covered below.
// ---------------------------------------------------------------------------

// CONTRACT: "Returns string|null — ... or `null` when the key is unknown or the value is absent"
test('formatExt: unknown key returns null', () => {
  assert.equal(formatExt('__not_an_extended_field__', 12), null)
  assert.equal(formatExt('__not_an_extended_field__', 'twelve'), null)
})

// CONTRACT: "Returns string|null — ... or `null` when the key is unknown or the value is absent"
test('formatExt: absent value returns null', () => {
  for (const key of ['__not_an_extended_field__', 'Xmax', 'Pe', 'Le']) {
    assert.equal(formatExt(key, null), null, `expected null for ${key} with a null value`)
    assert.equal(formatExt(key, undefined), null, `expected null for ${key} with an undefined value`)
  }
})

// CONTRACT: "Returns string|null"
test('formatExt: return value is a string or null, never anything else', () => {
  const samples = [
    ['__not_an_extended_field__', 1],
    ['Xmax', 6],
    ['Pe', 250],
    ['Le', 0.6],
    ['Xmax', null],
    ['Xmax', undefined],
    ['Xmax', 'n/a']
  ]
  for (const [key, value] of samples) {
    const out = formatExt(key, value)
    assert.ok(out === null || typeof out === 'string', `formatExt(${key}, ${String(value)}) returned ${typeof out}`)
  }
})

// CONTRACT: "@pure — ... Calling it twice with equal inputs must produce equal output and change nothing observable."
test('formatExt: pure — twice with equal inputs gives equal output', () => {
  const samples = [
    ['Xmax', 6],
    ['Pe', 250],
    ['__not_an_extended_field__', 3],
    ['Xmax', null]
  ]
  for (const [key, value] of samples) {
    assert.deepEqual(formatExt(key, value), formatExt(key, value))
  }
})
