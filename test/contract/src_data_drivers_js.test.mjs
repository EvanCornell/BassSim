import { test } from 'node:test'
import assert from 'node:assert/strict'
import { BUILTIN_DRIVERS, DRIVER_BRANDS, POPULATED_EXT_KEYS } from '../../src/data/drivers.js'
import { EXT_BY_KEY, SOURCE_LABELS } from '../../src/data/driver-fields.js'
import { auditDriver } from '../../src/data/driver-audit.js'

// UNREACHABLE — not covered directly:
//   normalize(d) — "Not importable ... Test its behaviour through its caller,
//                   or skip it."
//
// `normalize`'s two stated guarantees — "`ext` is always an object, so callers
// can iterate it without guarding" and "`name` exists as one pre-joined field
// for search to match against" — are only observable on the records this
// module publishes, so they are asserted over every row of `BUILTIN_DRIVERS`,
// which the contract describes as "Every built-in driver, normalized and
// sorted by brand then model". No brand, model or count is hardcoded.
//
// AMBIGUITY: "sorted by brand then model" does not say which collation. The
// sortedness test below accepts either locale-aware or code-unit ordering, and
// asserts brand contiguity — required by any sort — separately and strictly.
//
// AMBIGUITY: "`name` exists as one pre-joined field" does not say what is
// joined. Brand and model are the only candidates the record shape offers, so
// the strictest reading is that both appear in it.

const populated = (v) => v !== undefined && v !== null

// ===========================================================================
// BUILTIN_DRIVERS
// ===========================================================================

// CONTRACT: "`BUILTIN_DRIVERS` — Every built-in driver, normalized and sorted by brand
// then model."
test('BUILTIN_DRIVERS: a non-empty array of records', () => {
  assert.ok(Array.isArray(BUILTIN_DRIVERS))
  assert.ok(BUILTIN_DRIVERS.length >= 1, 'the built-in driver library must not be empty')
  for (const row of BUILTIN_DRIVERS) {
    assert.ok(row !== null && typeof row === 'object' && !Array.isArray(row))
  }
})

// CONTRACT: "normalize ... `ext` is always an object, so callers can iterate it without
// guarding"
test('normalize: every built-in driver has ext as an object', () => {
  BUILTIN_DRIVERS.forEach((row, i) => {
    const ext = row.ext
    assert.ok(
      ext !== null && typeof ext === 'object' && !Array.isArray(ext),
      `BUILTIN_DRIVERS[${i}]: ext must always be an object`
    )
    assert.doesNotThrow(() => Object.entries(ext))
  })
})

// CONTRACT: "normalize ... `name` exists as one pre-joined field for search to match
// against."
test('normalize: every built-in driver has a name pre-joined from brand and model', () => {
  BUILTIN_DRIVERS.forEach((row, i) => {
    assert.equal(typeof row.name, 'string', `BUILTIN_DRIVERS[${i}]: name must exist`)
    assert.notEqual(row.name.length, 0, `BUILTIN_DRIVERS[${i}]: name must not be empty`)
    assert.ok(row.name.includes(row.brand), `BUILTIN_DRIVERS[${i}]: name must contain the brand`)
    assert.ok(row.name.includes(row.model), `BUILTIN_DRIVERS[${i}]: name must contain the model`)
  })
})

// CONTRACT: "sorted by brand then model" — brand and model must both exist to sort on.
test('BUILTIN_DRIVERS: every record carries a brand and a model', () => {
  BUILTIN_DRIVERS.forEach((row, i) => {
    assert.equal(typeof row.brand, 'string', `BUILTIN_DRIVERS[${i}]: brand`)
    assert.notEqual(row.brand.length, 0, `BUILTIN_DRIVERS[${i}]: brand must not be empty`)
    assert.equal(typeof row.model, 'string', `BUILTIN_DRIVERS[${i}]: model`)
    assert.notEqual(row.model.length, 0, `BUILTIN_DRIVERS[${i}]: model must not be empty`)
  })
})

// CONTRACT: "sorted by brand then model" — whatever the collation, all rows of one brand
// must be adjacent.
test('BUILTIN_DRIVERS: rows of the same brand are contiguous', () => {
  const seen = new Set()
  let current = null
  BUILTIN_DRIVERS.forEach((row, i) => {
    if (row.brand === current) return
    assert.equal(seen.has(row.brand), false, `BUILTIN_DRIVERS[${i}]: brand ${row.brand} reappears after another brand`)
    seen.add(row.brand)
    current = row.brand
  })
})

// CONTRACT: "sorted by brand then model"
test('BUILTIN_DRIVERS: is sorted by brand then model', () => {
  const pairs = BUILTIN_DRIVERS.map((r) => [r.brand, r.model])
  const sortedUnder = (cmp) => pairs.every((p, i) => {
    if (i === 0) return true
    const prev = pairs[i - 1]
    const byBrand = cmp(prev[0], p[0])
    return byBrand < 0 || (byBrand === 0 && cmp(prev[1], p[1]) <= 0)
  })
  const locale = (a, b) => a.localeCompare(b)
  const codeUnit = (a, b) => (a < b ? -1 : a > b ? 1 : 0)
  assert.ok(
    sortedUnder(locale) || sortedUnder(codeUnit),
    'BUILTIN_DRIVERS is not in non-decreasing brand-then-model order under either collation'
  )
})

// CONTRACT: "consumers filter on `source` when provenance matters" + SOURCE_LABELS are
// "Human-readable provenance labels keyed by a record's `source`."
test('BUILTIN_DRIVERS: every record has a source SOURCE_LABELS can label', () => {
  BUILTIN_DRIVERS.forEach((row, i) => {
    assert.equal(typeof row.source, 'string', `BUILTIN_DRIVERS[${i}]: source`)
    assert.ok(row.source in SOURCE_LABELS, `BUILTIN_DRIVERS[${i}]: unlabelled source ${row.source}`)
  })
})

// CONTRACT: "The importer runs this at generation time and the test suite enforces that
// any row failing an audit carries its label, so a bad import cannot land unannounced."
test('BUILTIN_DRIVERS: any row failing an audit carries its suspect label', () => {
  BUILTIN_DRIVERS.forEach((row, i) => {
    const problems = auditDriver(row)
    if (problems.length === 0) return
    assert.ok(populated(row.suspect), `BUILTIN_DRIVERS[${i}] (${row.name}) fails an audit but carries no suspect label`)
    assert.ok(row.suspect.length > 0, `BUILTIN_DRIVERS[${i}] (${row.name}) carries an empty suspect label`)
  })
})

// CONTRACT: "`normalize` ... Returns object — A copy carrying a guaranteed `ext` object and
// a `name`." — each row is its own copy.
test('normalize: no two built-in records are the same object', () => {
  const seen = new Set()
  BUILTIN_DRIVERS.forEach((row, i) => {
    assert.equal(seen.has(row), false, `BUILTIN_DRIVERS[${i}]: the same record object appears twice`)
    seen.add(row)
  })
})

// ===========================================================================
// DRIVER_BRANDS — derived from BUILTIN_DRIVERS
// ===========================================================================

// CONTRACT: "`DRIVER_BRANDS` — Distinct brand names in the library, sorted, for populating
// filter menus."
test('DRIVER_BRANDS: are exactly the distinct brands of BUILTIN_DRIVERS', () => {
  assert.ok(Array.isArray(DRIVER_BRANDS))
  for (const b of DRIVER_BRANDS) assert.equal(typeof b, 'string')
  assert.equal(new Set(DRIVER_BRANDS).size, DRIVER_BRANDS.length, 'DRIVER_BRANDS must be distinct')
  assert.deepEqual(
    [...DRIVER_BRANDS].sort(),
    [...new Set(BUILTIN_DRIVERS.map((r) => r.brand))].sort()
  )
})

// CONTRACT: "Distinct brand names in the library, sorted"
test('DRIVER_BRANDS: is sorted', () => {
  const sortedUnder = (cmp) => DRIVER_BRANDS.every((b, i) => i === 0 || cmp(DRIVER_BRANDS[i - 1], b) < 0)
  const locale = (a, b) => a.localeCompare(b)
  const codeUnit = (a, b) => (a < b ? -1 : a > b ? 1 : 0)
  assert.ok(sortedUnder(locale) || sortedUnder(codeUnit), 'DRIVER_BRANDS is not sorted under either collation')
})

// ===========================================================================
// POPULATED_EXT_KEYS — derived from BUILTIN_DRIVERS and EXT_FIELDS
// ===========================================================================

// CONTRACT: "`POPULATED_EXT_KEYS` — Extended field keys that at least one driver actually
// populates." + "filter UI built from the full `EXT_FIELDS` list would offer columns the
// library cannot fill. This is the subset worth showing."
test('POPULATED_EXT_KEYS: is a subset of the declared extended field keys', () => {
  assert.ok(Array.isArray(POPULATED_EXT_KEYS))
  assert.equal(new Set(POPULATED_EXT_KEYS).size, POPULATED_EXT_KEYS.length, 'keys must be distinct')
  for (const k of POPULATED_EXT_KEYS) {
    assert.equal(typeof k, 'string')
    assert.ok(k in EXT_BY_KEY, `${k} is not a declared extended field key`)
  }
})

// CONTRACT: "Extended field keys that at least one driver actually populates."
test('POPULATED_EXT_KEYS: every listed key is populated by at least one driver', () => {
  for (const k of POPULATED_EXT_KEYS) {
    assert.ok(
      BUILTIN_DRIVERS.some((r) => populated(r.ext[k])),
      `${k} is listed as populated but no built-in driver provides it`
    )
  }
})

// CONTRACT: "Both share one record shape, described in driver-fields.js" + the schema is
// "Enumerating the schema rather than hardcoding it lets the database browser, the CSV
// export and the MCP tools stay correct as fields are added" — a record's ext keys are
// the declared ones.
test('BUILTIN_DRIVERS: every ext key a record carries is declared in EXT_BY_KEY', () => {
  BUILTIN_DRIVERS.forEach((row, i) => {
    for (const k of Object.keys(row.ext)) {
      assert.ok(k in EXT_BY_KEY, `BUILTIN_DRIVERS[${i}] (${row.name}) carries undeclared ext key ${k}`)
    }
  })
})

// CONTRACT: "Extended field keys that at least one driver actually populates." — and
// therefore no populated key is left out, or the filter UI would hide a fillable column.
test('POPULATED_EXT_KEYS: every key any driver populates is listed', () => {
  const actual = new Set()
  for (const row of BUILTIN_DRIVERS) {
    for (const [k, v] of Object.entries(row.ext)) {
      if (populated(v)) actual.add(k)
    }
  }
  for (const k of actual) {
    // Only keys the schema declares can appear in the "subset of EXT_FIELDS".
    if (!(k in EXT_BY_KEY)) continue
    assert.ok(POPULATED_EXT_KEYS.includes(k), `${k} is populated by a driver but missing from POPULATED_EXT_KEYS`)
  }
})
