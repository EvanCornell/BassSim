import { test } from 'node:test'
import assert from 'node:assert/strict'
import { __internals } from '../../src/components/DriverDB.jsx'

// UNREACHABLE — not covered:
//   DriverDB() — EXPORTED, but documented to return `React.ReactElement|null`;
//                rendering React components is out of scope for this suite.
//   ExtDetail, DriverDB > apply, DriverDB > saveCurrentAsCustom,
//   DriverDB > removeCustom, DriverDB > key — all marked UNREACHABLE.

// ---------------------------------------------------------------------------
// loadCustom
// ---------------------------------------------------------------------------

// CONTRACT: "Load the user's saved custom drivers." /
// "`Array<object>` — Custom driver records, or an empty list when absent or
// corrupt."
// AMBIGUITY: the spec names no LocalStorage key, so a corrupt-payload case
// cannot be set up blind; the "absent" case is what a fresh environment gives.
test('loadCustom: returns an array of driver records', () => {
  const out = __internals.loadCustom()
  assert.ok(Array.isArray(out), 'must return an Array')
  for (const d of out) {
    assert.equal(typeof d, 'object')
    assert.notEqual(d, null)
  }
})

// CONTRACT: "or an empty list when absent or corrupt." — with nothing saved
// there are no custom entries.
test('loadCustom: an empty list when absent', () => {
  assert.deepStrictEqual(__internals.loadCustom(), [])
})

// CONTRACT: "Side effects: Reads LocalStorage." — reading must not throw and
// must keep returning an array on repeated calls.
test('loadCustom: repeated calls keep returning an array', () => {
  assert.deepStrictEqual(__internals.loadCustom(), __internals.loadCustom())
})
