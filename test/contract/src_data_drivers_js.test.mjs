import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as drivers from '../../src/data/drivers.js'

// UNREACHABLE — not covered directly:
//   normalize(d) — "Not importable: a closure nested inside another function,
//                   or a module-private with no test surface. Test its
//                   behaviour through its caller, or skip it."
//
// The contract for `normalize` states two guarantees "the rest of the app
// relies on": `ext` is always an object, so callers can iterate it without
// guarding, and `name` exists as one pre-joined field for search to match
// against. Those guarantees are only observable on the records this module
// produces, so they are asserted through the module's own exports below —
// the route the spec itself suggests ("Test its behaviour through its
// caller").
//
// AMBIGUITY: the spec names no export of `src/data/drivers.js` at all — no
// "Obtain via" line for the driver library, no export name, no shape. The
// tests below therefore discover the record arrays from the module namespace
// rather than inventing an export name, and assert the invariants over every
// row of every such array. No count, brand or model is asserted, because the
// contract promises none.

// Every exported array whose entries are plain objects is treated as a list of
// database rows brought up to the full record shape by `normalize`.
function recordArrays () {
  const out = []
  for (const [name, value] of Object.entries(drivers)) {
    if (!Array.isArray(value)) continue
    if (value.length === 0) continue
    const allObjects = value.every(
      (row) => row !== null && typeof row === 'object' && !Array.isArray(row)
    )
    if (allObjects) out.push([name, value])
  }
  return out
}

// CONTRACT: "Bring a raw database row up to the full record shape." / "A row from a
// catalog or legacy module." — the module exists to publish normalized rows.
test('normalize: the module exports at least one non-empty list of records', () => {
  assert.ok(recordArrays().length >= 1, 'expected src/data/drivers.js to export a list of driver records')
})

// CONTRACT: "`ext` is always an object, so callers can iterate it without guarding"
test('normalize: every exported record has ext as an object', () => {
  for (const [name, rows] of recordArrays()) {
    for (let i = 0; i < rows.length; i++) {
      const ext = rows[i].ext
      assert.ok(
        ext !== null && typeof ext === 'object' && !Array.isArray(ext),
        `${name}[${i}]: ext must always be an object`
      )
      // "callers can iterate it without guarding"
      assert.doesNotThrow(() => Object.entries(ext))
    }
  }
})

// CONTRACT: "`name` exists as one pre-joined field for search to match against."
test('normalize: every exported record has a name string', () => {
  for (const [name, rows] of recordArrays()) {
    for (let i = 0; i < rows.length; i++) {
      assert.equal(typeof rows[i].name, 'string', `${name}[${i}]: name must exist as one pre-joined field`)
    }
  }
})

// CONTRACT: "A copy carrying a guaranteed `ext` object and a `name`." — a copy, so no two
// rows may alias the same object, and no row may alias its own `ext` across rows.
test('normalize: records are copies, not shared references', () => {
  for (const [name, rows] of recordArrays()) {
    const seen = new Set()
    for (let i = 0; i < rows.length; i++) {
      assert.equal(seen.has(rows[i]), false, `${name}[${i}]: the same record object appears twice`)
      seen.add(rows[i])
    }
  }
})
