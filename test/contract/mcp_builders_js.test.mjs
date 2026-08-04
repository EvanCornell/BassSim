import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  searchDrivers,
  findDriver,
  driverParams,
  portLengthGuess,
  calibratePort,
  buildSealedBox,
  buildPortedBox,
  buildBandpass4,
  buildBandpass6,
  optimizeProject,
  __internals,
} from '../../mcp/builders.js'

const { nid, pos, baseProject, addNode, edge } = __internals

// UNREACHABLE — not covered:
//   calibratePort > setLen
//   calibratePort > fbAt
//   optimizeProject > getVal
//   optimizeProject > setVal

// ---------------------------------------------------------------------------
// Shared fixtures, derived from the library at runtime rather than hardcoded.
// The spec documents that a driver record has `brand` and `model`
// ("Substring of \"brand model\"", "defaults to the library model name").
// ---------------------------------------------------------------------------

const LIB = searchDrivers()
const D0 = LIB[0]
const NAME0 = `${D0.brand} ${D0.model}`

/** Extended field of a row, wherever the schema puts extended columns. */
function extOf(row, key) {
  if (row && row.ext && typeof row.ext === 'object' && key in row.ext) return row.ext[key]
  return row ? row[key] : undefined
}

/** An extended field name that some rows carry and others do not. */
function splitExtKey() {
  const bag = new Set()
  for (const row of LIB) {
    if (row.ext && typeof row.ext === 'object') for (const k of Object.keys(row.ext)) bag.add(k)
  }
  if (bag.size === 0) {
    // No nested `ext` container: extended columns are top-level extras.
    const counts = new Map()
    for (const row of LIB) for (const k of Object.keys(row)) counts.set(k, (counts.get(k) || 0) + 1)
    for (const [k, n] of counts) if (n > 0 && n < LIB.length) bag.add(k)
  }
  for (const k of bag) {
    const withIt = LIB.filter((r) => extOf(r, k) !== undefined && extOf(r, k) !== null)
    const without = LIB.filter((r) => extOf(r, k) === undefined || extOf(r, k) === null)
    if (withIt.length > 0 && without.length > 0) {
      const v = extOf(withIt[0], k)
      if (typeof v === 'number' || typeof v === 'string') return { key: k, value: v }
    }
  }
  return null
}

// ===========================================================================
// searchDrivers
// ===========================================================================

// CONTRACT: "Filters are conjunctive and every one is optional, so an empty
// argument returns the whole library."
test('searchDrivers: an empty argument returns the whole library', () => {
  assert.ok(Array.isArray(LIB))
  assert.ok(LIB.length > 0)
  assert.deepEqual(searchDrivers({}), LIB)
})

// CONTRACT: "Matching records, in library order."
test('searchDrivers: results are in library order', () => {
  const brand = D0.brand
  const hits = searchDrivers({ brand })
  const expected = LIB.filter((r) => r.brand === brand)
  assert.deepEqual(hits, expected)
})

// CONTRACT: "Text matching on `query` and `brand` is case-insensitive"
test('searchDrivers: brand matching is case-insensitive', () => {
  const lower = searchDrivers({ brand: D0.brand.toLowerCase() })
  const upper = searchDrivers({ brand: D0.brand.toUpperCase() })
  assert.ok(lower.length > 0)
  assert.deepEqual(lower, upper)
})

// CONTRACT: "`query` matches against the joined brand and model." /
// "Text matching on `query` and `brand` is case-insensitive"
test('searchDrivers: query matches the joined brand and model, case-insensitively', () => {
  const hits = searchDrivers({ query: NAME0.toUpperCase() })
  assert.ok(hits.some((r) => r.brand === D0.brand && r.model === D0.model))
  assert.deepEqual(hits, searchDrivers({ query: NAME0.toLowerCase() }))
})

// CONTRACT: "Filters are conjunctive"
test('searchDrivers: filters are conjunctive', () => {
  const fsValues = LIB.map((r) => r.fs).filter((v) => typeof v === 'number')
  assert.ok(fsValues.length > 0, 'library rows carry an fs figure')
  const mid = fsValues.slice().sort((a, b) => a - b)[Math.floor(fsValues.length / 2)]
  const hits = searchDrivers({ brand: D0.brand, fs_min: mid })
  for (const r of hits) {
    assert.equal(r.brand.toLowerCase(), D0.brand.toLowerCase())
    assert.ok(r.fs >= mid)
  }
  // and it is a subset of either filter alone
  assert.ok(hits.length <= searchDrivers({ brand: D0.brand }).length)
  assert.ok(hits.length <= searchDrivers({ fs_min: mid }).length)
})

// CONTRACT: "`criteria.fs_min` — Minimum Fs, Hz." / "`criteria.fs_max` — Maximum Fs, Hz."
test('searchDrivers: fs_min and fs_max bound Fs inclusively', () => {
  const fsValues = LIB.map((r) => r.fs).filter((v) => typeof v === 'number').sort((a, b) => a - b)
  const lo = fsValues[0]
  const hi = fsValues[fsValues.length - 1]
  const mid = (lo + hi) / 2
  for (const r of searchDrivers({ fs_min: mid })) assert.ok(r.fs >= mid)
  for (const r of searchDrivers({ fs_max: mid })) assert.ok(r.fs <= mid)
  // AMBIGUITY: the contract states the "rows lacking the field are excluded"
  // rule only for `ext`, not for the core numeric filters, so no assertion is
  // made about rows carrying no Fs figure.
  for (const r of searchDrivers({ fs_min: lo, fs_max: hi })) {
    assert.ok(r.fs >= lo && r.fs <= hi)
  }
})

// CONTRACT: "Rows lacking the extended field being filtered on are excluded
// rather than passed through."
test('searchDrivers: rows lacking the filtered extended field are excluded', () => {
  const pick = splitExtKey()
  assert.ok(pick, 'the catalog declares an extended column carried by some rows but not all')
  const filtered = searchDrivers({ ext: { [pick.key]: pick.value } })
  assert.ok(filtered.length > 0)
  for (const r of filtered) {
    const v = extOf(r, pick.key)
    assert.notEqual(v, undefined, `row ${r.brand} ${r.model} lacks ${pick.key} but was returned`)
    assert.notEqual(v, null)
  }
  assert.ok(filtered.length < LIB.length)
})

// CONTRACT: "a number key accepts `{min}`, `{max}` or an exact value, and a
// text key matches by substring."
test('searchDrivers: an extended key accepts min/max/exact for numbers and substrings for text', () => {
  const pick = splitExtKey()
  assert.ok(pick)
  if (typeof pick.value === 'number') {
    for (const r of searchDrivers({ ext: { [pick.key]: { min: pick.value } } })) {
      assert.ok(extOf(r, pick.key) >= pick.value)
    }
    for (const r of searchDrivers({ ext: { [pick.key]: { max: pick.value } } })) {
      assert.ok(extOf(r, pick.key) <= pick.value)
    }
    const exact = searchDrivers({ ext: { [pick.key]: pick.value } })
    assert.ok(exact.length > 0)
    for (const r of exact) assert.equal(extOf(r, pick.key), pick.value)
  } else {
    const needle = pick.value.slice(0, Math.max(1, pick.value.length - 1))
    const hits = searchDrivers({ ext: { [pick.key]: needle } })
    assert.ok(hits.length > 0)
    for (const r of hits) {
      assert.ok(
        String(extOf(r, pick.key)).toLowerCase().includes(needle.toLowerCase()),
        `${r.brand} ${r.model} does not contain "${needle}" in ${pick.key}`,
      )
    }
  }
})

// CONTRACT: @throws Error "When `ext` names a field that is not in the schema
// — a silent empty result would look like \"no such driver\" rather than \"no
// such column\"."
test('searchDrivers: an ext key not in the schema throws, naming the column', () => {
  assert.throws(
    () => searchDrivers({ ext: { no_such_column_xyz: 1 } }),
    (e) => e instanceof Error && String(e.message).includes('no_such_column_xyz'),
  )
  // Neighbouring valid input: an ext object with no unknown key must not throw.
  assert.doesNotThrow(() => searchDrivers({ ext: {} }))
})

// CONTRACT: Postcondition — "The library is not modified."
test('searchDrivers: the library is not modified', () => {
  const before = structuredClone(searchDrivers())
  searchDrivers({ brand: D0.brand, fs_min: 1, query: 'x' })
  assert.deepEqual(structuredClone(searchDrivers()), before)
})

// CONTRACT: @pure — "Calling it twice with equal inputs must produce equal
// output and change nothing observable."
test('searchDrivers: @pure — equal inputs give equal output and leave arguments alone', () => {
  const criteria = { brand: D0.brand, fs_min: 1 }
  const snapshot = structuredClone(criteria)
  const a = searchDrivers(structuredClone(criteria))
  const b = searchDrivers(structuredClone(criteria))
  assert.deepEqual(a, b)
  assert.deepEqual(criteria, snapshot)
})

// ===========================================================================
// findDriver
// ===========================================================================

// CONTRACT: "Resolve a query to exactly one driver." / "An exact match on the
// full name ... breaks a tie"
test('findDriver: an exact full-name match resolves, for every uniquely named row', () => {
  const seen = new Map()
  for (const r of LIB) {
    const k = `${r.brand} ${r.model}`
    seen.set(k, (seen.get(k) || 0) + 1)
  }
  let checked = 0
  for (const r of LIB) {
    const name = `${r.brand} ${r.model}`
    if (seen.get(name) !== 1) continue
    const got = findDriver(name)
    assert.equal(got.brand, r.brand)
    assert.equal(got.model, r.model)
    checked++
  }
  assert.ok(checked > 0)
})

// CONTRACT: "An exact match on ... the model alone breaks a tie, so
// \"18SW115-4\" resolves even though it is a substring of nothing else."
test('findDriver: an exact model match breaks a tie', () => {
  const byModel = new Map()
  for (const r of LIB) byModel.set(r.model, (byModel.get(r.model) || 0) + 1)
  // Rows whose model is unique as an exact string but is a substring of some
  // other row's "brand model" — the tie the contract says is broken.
  let checked = 0
  for (const r of LIB) {
    if (byModel.get(r.model) !== 1) continue
    const substringHits = LIB.filter((o) =>
      `${o.brand} ${o.model}`.toLowerCase().includes(r.model.toLowerCase()),
    )
    if (substringHits.length < 2) continue
    const got = findDriver(r.model)
    assert.equal(got.model, r.model, `exact model "${r.model}" should win over ${substringHits.length} substring hits`)
    checked++
  }
  assert.ok(checked > 0, 'the library contains a model that is a substring of another entry')
})

// CONTRACT: @throws Error "When nothing matches ... Both messages name the
// alternatives or point at `driver_search`."
test('findDriver: nothing matching throws and points at driver_search', () => {
  assert.throws(
    () => findDriver('zzz-no-such-driver-zzz'),
    (e) => e instanceof Error && /driver_search/.test(e.message),
  )
  // Neighbouring valid input.
  assert.doesNotThrow(() => findDriver(NAME0))
})

// CONTRACT: "Ambiguity is an error rather than a silent first-match" /
// @throws "when several do and none is an exact name match. Both messages name
// the alternatives".
test('findDriver: ambiguity is an error naming the alternatives', () => {
  const byBrand = new Map()
  for (const r of LIB) {
    const list = byBrand.get(r.brand) || []
    list.push(r)
    byBrand.set(r.brand, list)
  }
  let ambiguous = null
  for (const [brand, rows] of byBrand) {
    // A brand with several models, where the brand is nobody's exact full name.
    if (rows.length >= 2 && !LIB.some((r) => `${r.brand} ${r.model}` === brand || r.model === brand)) {
      ambiguous = { brand, rows }
      break
    }
  }
  assert.ok(ambiguous, 'the library has a brand with several models')
  assert.throws(
    () => findDriver(ambiguous.brand),
    (e) =>
      e instanceof Error &&
      ambiguous.rows.some((r) => e.message.includes(r.model)),
    'the ambiguity message must name the alternatives',
  )
})

// CONTRACT: @pure
test('findDriver: @pure — equal inputs give equal output', () => {
  assert.deepEqual(findDriver(NAME0), findDriver(NAME0))
})

// ===========================================================================
// driverParams
// ===========================================================================

// CONTRACT: "Only the solver-facing fields are taken from a library row. A
// database record also carries provenance and construction detail that has no
// business in a node's params, so this projects through `driverToParams`
// rather than spreading the record."
test('driverParams: projects rather than spreads — provenance never appears', () => {
  const p = driverParams({ db: NAME0 })
  assert.equal(typeof p, 'object')
  // `source` is documented in searchDrivers as the record's provenance.
  assert.equal('source' in p, false, 'provenance must not reach node params')
  // Extended catalog columns are construction detail, not solver fields.
  assert.equal('ext' in p, false)
  // AMBIGUITY: the spec names `driverToParams` but does not enumerate the
  // projected keys, so the positive direction is asserted only for the keys
  // this contract does name (count, wiring, label) plus the requirement that
  // the result is strictly narrower than the record.
  const recordKeys = Object.keys(D0)
  assert.ok(
    recordKeys.some((k) => !(k in p)),
    'the projection must drop at least one database-only field',
  )
})

// CONTRACT: "`spec.count` — Drivers in this node." _(default `1`)_ /
// "`spec.wiring` — Defaults to `parallel` when count > 1, `single` otherwise."
// / "`spec.label` — defaults to the library model name, or \"Driver\"."
test('driverParams: documented defaults for count, wiring and label', () => {
  const bare = driverParams()
  assert.equal(bare.count, 1)
  assert.equal(bare.wiring, 'single')
  assert.equal(bare.label, 'Driver')

  assert.deepEqual(driverParams({}), bare)

  const lib = driverParams({ db: NAME0 })
  assert.equal(lib.count, 1)
  assert.equal(lib.wiring, 'single')
  assert.equal(lib.label, D0.model)

  const many = driverParams({ db: NAME0, count: 2 })
  assert.equal(many.count, 2)
  assert.equal(many.wiring, 'parallel')
})

// CONTRACT: "Wiring defaults to parallel for a multi-driver node" — but an
// explicit wiring is a documented parameter and must be honoured.
test('driverParams: an explicit wiring and label are honoured', () => {
  const p = driverParams({ db: NAME0, count: 4, wiring: 'series-parallel', label: 'Bank A' })
  assert.equal(p.wiring, 'series-parallel')
  assert.equal(p.label, 'Bank A')
  assert.equal(p.count, 4)
})

// CONTRACT: "A spec may name a library driver, give explicit T/S values, or
// both — in which case the explicit values win"
test('driverParams: explicit values win over the library row', () => {
  const fromLib = driverParams({ db: NAME0 })
  const key = Object.keys(fromLib).find(
    (k) => typeof fromLib[k] === 'number' && k !== 'count',
  )
  assert.ok(key, 'the projection yields at least one numeric solver field')
  const override = fromLib[key] + 1.5
  const p = driverParams({ db: NAME0, [key]: override })
  assert.equal(p[key], override)
})

// CONTRACT: @throws Error "When `spec.db` matches no driver or is ambiguous."
test('driverParams: an unknown db throws', () => {
  assert.throws(() => driverParams({ db: 'zzz-no-such-driver-zzz' }), Error)
  assert.doesNotThrow(() => driverParams({ db: NAME0 }))
})

// CONTRACT: @pure
test('driverParams: @pure — arguments unmodified, equal results', () => {
  const spec = { db: NAME0, count: 2 }
  const snapshot = structuredClone(spec)
  const a = driverParams(structuredClone(spec))
  const b = driverParams(structuredClone(spec))
  assert.deepEqual(a, b)
  assert.deepEqual(spec, snapshot)
})

// ===========================================================================
// portLengthGuess
// ===========================================================================

// CONTRACT: "`ecFactor` — _(optional, default `0.732`)_"
test('portLengthGuess: ecFactor defaults to 0.732', () => {
  assert.equal(portLengthGuess(32, 60, 100), portLengthGuess(32, 60, 100, 0.732))
  assert.notEqual(portLengthGuess(32, 60, 100), portLengthGuess(32, 60, 100, 0.1))
})

// CONTRACT: "Port length in cm, floored at 1 cm — the end correction alone can
// exceed the required length for a large port on a small box, which would
// otherwise give a negative length."
test('portLengthGuess: the result is a number floored at 1 cm', () => {
  const normal = portLengthGuess(32, 60, 100)
  assert.equal(typeof normal, 'number')
  assert.ok(Number.isFinite(normal))
  assert.ok(normal >= 1)
  // A huge port on a tiny box: the end correction alone dominates.
  const floored = portLengthGuess(80, 1, 2000)
  assert.equal(floored, 1)
})

// CONTRACT: @pure
test('portLengthGuess: @pure — equal inputs give equal output', () => {
  assert.equal(portLengthGuess(32, 60, 100), portLengthGuess(32, 60, 100))
})

// ===========================================================================
// builders — sealed / ported / bandpass
// ===========================================================================

const SPEC_DRIVER = { db: NAME0 }

// CONTRACT: "`{project: object, notes: string[]}` — The project and notes
// explaining the topology."
test('buildSealedBox: returns a project and string notes', () => {
  const out = buildSealedBox({ driver: SPEC_DRIVER, volume: 40, name: 'Sealed' })
  assert.equal(typeof out.project, 'object')
  assert.ok(Array.isArray(out.notes))
  for (const n of out.notes) assert.equal(typeof n, 'string')
  assert.ok(Array.isArray(out.project.nodes))
  assert.ok(out.project.nodes.length > 0)
})

// CONTRACT: @throws Error "When the driver spec names an unknown or ambiguous
// library driver."
test('buildSealedBox: an unknown library driver throws', () => {
  assert.throws(() => buildSealedBox({ driver: { db: 'zzz-nope-zzz' }, volume: 40 }), Error)
  assert.doesNotThrow(() => buildSealedBox({ driver: SPEC_DRIVER, volume: 40 }))
})

// CONTRACT: "Consumes ids from the module counter, so two calls produce
// projects with different node ids."
test('buildSealedBox: two calls produce projects with different node ids', () => {
  const a = buildSealedBox({ driver: SPEC_DRIVER, volume: 40 }).project
  const b = buildSealedBox({ driver: SPEC_DRIVER, volume: 40 }).project
  const idsA = new Set(a.nodes.map((n) => n.id))
  for (const n of b.nodes) assert.equal(idsA.has(n.id), false, `id ${n.id} reused across builds`)
})

// CONTRACT: "`{project: object, ports: string[], notes: string[]}` — The
// project, the port node ids for calibration, and notes." /
// "`spec.port_count` — _(default `1`)_ — Number of identical ports."
test('buildPortedBox: returns port node ids, one per port_count', () => {
  const one = buildPortedBox({ driver: SPEC_DRIVER, volume: 60 })
  assert.ok(Array.isArray(one.ports))
  assert.equal(one.ports.length, 1)
  for (const id of one.ports) assert.equal(typeof id, 'string')
  assert.ok(one.project.nodes.some((n) => n.id === one.ports[0]))
  assert.ok(Array.isArray(one.notes))

  const three = buildPortedBox({ driver: SPEC_DRIVER, volume: 60, port_count: 3 })
  assert.equal(three.ports.length, 3)
  assert.equal(new Set(three.ports).size, 3)
})

// CONTRACT: "`spec.port_length` — Explicit port length, cm, bypassing the
// tuning calculation." / "`spec.tuning` — Ignored when `port_length` is given."
test('buildPortedBox: an explicit port_length bypasses the tuning calculation', () => {
  const a = buildPortedBox({ driver: SPEC_DRIVER, volume: 60, tuning: 25, port_length: 30 })
  const b = buildPortedBox({ driver: SPEC_DRIVER, volume: 60, tuning: 45, port_length: 30 })
  const pa = a.project.nodes.find((n) => n.id === a.ports[0]).params
  const pb = b.project.nodes.find((n) => n.id === b.ports[0]).params
  assert.deepEqual(pa, pb, 'tuning must be ignored when port_length is given')
  assert.ok(
    Object.values(pa).includes(30),
    'the explicit 30 cm length must reach the port node',
  )
})

// CONTRACT: @throws Error "When the driver spec names an unknown or ambiguous
// library driver."
test('buildPortedBox: an unknown library driver throws', () => {
  assert.throws(() => buildPortedBox({ driver: { db: 'zzz-nope-zzz' }, volume: 60 }), Error)
  assert.doesNotThrow(() => buildPortedBox({ driver: SPEC_DRIVER, volume: 60 }))
})

// CONTRACT: "`{project: object, ports: string[], notes: string[]}` — The
// project, the port node id, and notes." (4th-order: one port)
test('buildBandpass4: returns one port node id', () => {
  const out = buildBandpass4({ driver: SPEC_DRIVER, front_volume: 30, rear_volume: 40 })
  assert.equal(typeof out.project, 'object')
  assert.ok(Array.isArray(out.ports))
  assert.equal(out.ports.length, 1)
  assert.ok(out.project.nodes.some((n) => n.id === out.ports[0]))
  assert.ok(Array.isArray(out.notes))
})

// CONTRACT: @throws Error "When the driver spec names an unknown or ambiguous
// library driver."
test('buildBandpass4: an unknown library driver throws', () => {
  assert.throws(
    () => buildBandpass4({ driver: { db: 'zzz-nope-zzz' }, front_volume: 30, rear_volume: 40 }),
    Error,
  )
  assert.doesNotThrow(() =>
    buildBandpass4({ driver: SPEC_DRIVER, front_volume: 30, rear_volume: 40 }),
  )
})

// CONTRACT: "`{project: object, ports: string[], notes: string[]}` — The
// project, both port node ids, and notes."
test('buildBandpass6: returns both port node ids', () => {
  const out = buildBandpass6({ driver: SPEC_DRIVER, front_volume: 30, rear_volume: 40 })
  assert.ok(Array.isArray(out.ports))
  assert.equal(out.ports.length, 2)
  assert.equal(new Set(out.ports).size, 2)
  for (const id of out.ports) assert.ok(out.project.nodes.some((n) => n.id === id))
  assert.ok(Array.isArray(out.notes))
})

// CONTRACT: @throws Error "When the driver spec names an unknown or ambiguous
// library driver."
test('buildBandpass6: an unknown library driver throws', () => {
  assert.throws(
    () => buildBandpass6({ driver: { db: 'zzz-nope-zzz' }, front_volume: 30, rear_volume: 40 }),
    Error,
  )
  assert.doesNotThrow(() =>
    buildBandpass6({ driver: SPEC_DRIVER, front_volume: 30, rear_volume: 40 }),
  )
})

// ===========================================================================
// calibratePort
// ===========================================================================

/**
 * Identify the port node's length parameter without reading any source: build
 * the same box twice with two different explicit port lengths and find the key
 * that tracks them.
 */
function portLengthKey() {
  const a = buildPortedBox({ driver: SPEC_DRIVER, volume: 60, port_length: 30 })
  const b = buildPortedBox({ driver: SPEC_DRIVER, volume: 60, port_length: 45 })
  const pa = a.project.nodes.find((n) => n.id === a.ports[0]).params
  const pb = b.project.nodes.find((n) => n.id === b.ports[0]).params
  return Object.keys(pa).find((k) => pa[k] === 30 && pb[k] === 45)
}

const LEN_KEY = portLengthKey()

/** A fake simulation with the documented monotonic relationship: tuning falls
 *  as the port lengthens. fb(L) = 200 - 2L, so the target 100 Hz sits at 50 cm. */
function makeFakeSim(id) {
  const calls = { n: 0 }
  const fn = (p) => {
    calls.n++
    const node = p.nodes.find((n) => n.id === id)
    return 200 - 2 * node.params[LEN_KEY]
  }
  return { fn, calls }
}

// CONTRACT: "it re-simulates and converges on the length that actually puts the
// impedance minimum where it was asked for" / "the search stops early once it
// is within 0.05 Hz" / "The calibrated port length in cm, rounded to 0.1 cm."
test('calibratePort: converges to within the documented tolerance and rounds to 0.1 cm', () => {
  assert.ok(LEN_KEY, 'the port node carries a length parameter in cm')
  const built = buildPortedBox({ driver: SPEC_DRIVER, volume: 60, port_length: 30 })
  const portId = built.ports[0]
  const sim = makeFakeSim(portId)

  const L = calibratePort(built.project, portId, 100, sim.fn)

  assert.equal(typeof L, 'number')
  // rounded to 0.1 cm
  assert.equal(L, Math.round(L * 10) / 10)
  // fb(L) = 200 - 2L, so 100 Hz is at exactly 50 cm. The search stops within
  // 0.05 Hz, i.e. 0.025 cm at this slope, and the answer is then rounded to
  // the nearest 0.1 cm — 0.05 cm more. 0.075 cm total; assert 0.1 cm.
  assert.ok(Math.abs(L - 50) <= 0.1, `expected ~50 cm, got ${L}`)
})

// CONTRACT: "it widens the interval up to four times in each direction before
// bisecting, so a poor initial guess still converges."
test('calibratePort: a poor initial guess still converges', () => {
  assert.ok(LEN_KEY)
  // Start far below the answer, then far above it.
  for (const start of [2, 150]) {
    const built = buildPortedBox({ driver: SPEC_DRIVER, volume: 60, port_length: start })
    const portId = built.ports[0]
    const sim = makeFakeSim(portId)
    const L = calibratePort(built.project, portId, 100, sim.fn)
    assert.ok(Math.abs(L - 50) <= 0.1, `from ${start} cm, expected ~50 cm, got ${L}`)
  }
})

// CONTRACT: @mutates "Writes the calibrated length into the project's port node."
test('calibratePort: writes the calibrated length into the project port node', () => {
  assert.ok(LEN_KEY)
  const built = buildPortedBox({ driver: SPEC_DRIVER, volume: 60, port_length: 30 })
  const portId = built.ports[0]
  const sim = makeFakeSim(portId)
  const L = calibratePort(built.project, portId, 100, sim.fn)
  const node = built.project.nodes.find((n) => n.id === portId)
  assert.equal(node.params[LEN_KEY], L)
})

// CONTRACT: @sideeffect "Runs the supplied simulation up to ~22 times".
// AMBIGUITY: "~22" is approximate; the strictest defensible reading is that it
// never exceeds 22 calls.
test('calibratePort: runs the supplied simulation no more than 22 times', () => {
  assert.ok(LEN_KEY)
  const built = buildPortedBox({ driver: SPEC_DRIVER, volume: 60, port_length: 2 })
  const portId = built.ports[0]
  const sim = makeFakeSim(portId)
  calibratePort(built.project, portId, 100, sim.fn)
  assert.ok(sim.calls.n <= 22, `simulation ran ${sim.calls.n} times`)
})

// CONTRACT: "A simulation that returns `null` — a graph with no identifiable
// tuning — ends the search at the current length rather than looping."
test('calibratePort: a null-returning simulation ends the search', () => {
  assert.ok(LEN_KEY)
  const built = buildPortedBox({ driver: SPEC_DRIVER, volume: 60, port_length: 30 })
  const portId = built.ports[0]
  let calls = 0
  const L = calibratePort(built.project, portId, 100, () => {
    calls++
    return null
  })
  assert.equal(typeof L, 'number')
  assert.ok(Number.isFinite(L))
  assert.equal(L, Math.round(L * 10) / 10)
  assert.ok(calls <= 22, `simulation ran ${calls} times on a null-returning sim`)
})

// ===========================================================================
// optimizeProject
// ===========================================================================

// CONTRACT: "`{best: object, bestScore: number, evals: number, values:
// number[]}` — The best project found, its score, how many evaluations it took,
// and the winning value of each parameter in the order given." /
// "cost is `rounds × params × gridN` evaluations" with defaults rounds 3,
// gridN 9.
test('optimizeProject: returns the documented shape and stays inside the evaluation budget', () => {
  assert.ok(LEN_KEY)
  const built = buildPortedBox({ driver: SPEC_DRIVER, volume: 60, port_length: 30 })
  const portId = built.ports[0]
  const read = (p) => p.nodes.find((n) => n.id === portId).params[LEN_KEY]
  // Known optimum at 40 cm, inside the bounds.
  const score = (p) => -Math.abs(read(p) - 40)

  const before = structuredClone(built.project)
  const out = optimizeProject(built.project, [{ node: portId, param: LEN_KEY, min: 10, max: 100 }], score)

  assert.equal(typeof out.best, 'object')
  assert.equal(typeof out.bestScore, 'number')
  assert.equal(typeof out.evals, 'number')
  assert.ok(Array.isArray(out.values))
  assert.equal(out.values.length, 1)
  assert.equal(typeof out.values[0], 'number')
  // rounds(3) × params(1) × gridN(9) = 27
  assert.ok(out.evals <= 27, `evals=${out.evals} exceeds the documented 3 × 1 × 9 budget`)
  // "Starting project. Not modified."
  assert.deepEqual(built.project, before)
  // The winning value must be the one in the winning project.
  assert.equal(read(out.best), out.values[0])
  assert.equal(out.bestScore, score(out.best))
  // The first round alone samples gridN points over [10, 100]: spacing 11.25,
  // so the best grid point is within half a spacing of the optimum.
  assert.ok(Math.abs(out.values[0] - 40) <= 5.625, `values[0]=${out.values[0]}`)
})

// CONTRACT: "`opts.rounds` — _(default `3`)_" / "`opts.gridN` — _(default `9`)_"
test('optimizeProject: rounds and gridN control the evaluation budget', () => {
  assert.ok(LEN_KEY)
  const built = buildPortedBox({ driver: SPEC_DRIVER, volume: 60, port_length: 30 })
  const portId = built.ports[0]
  const read = (p) => p.nodes.find((n) => n.id === portId).params[LEN_KEY]
  const score = (p) => -Math.abs(read(p) - 40)
  const params = [{ node: portId, param: LEN_KEY, min: 10, max: 100 }]

  assert.equal(
    optimizeProject(built.project, params, score, {}).evals,
    optimizeProject(built.project, params, score).evals,
  )
  const small = optimizeProject(built.project, params, score, { rounds: 1, gridN: 5 })
  assert.ok(small.evals <= 5, `evals=${small.evals} exceeds 1 × 1 × 5`)
})

// CONTRACT: "A parameter whose starting value is outside its own bounds is
// moved to mid-range first, so a caller can pass bounds that exclude the
// current design without the search starting from an invalid point."
test('optimizeProject: a starting value outside its bounds is moved to mid-range first', () => {
  assert.ok(LEN_KEY)
  // Start at 5 cm; bounds [50, 100] exclude it. Optimum at 75.
  const built = buildPortedBox({ driver: SPEC_DRIVER, volume: 60, port_length: 5 })
  const portId = built.ports[0]
  const read = (p) => p.nodes.find((n) => n.id === portId).params[LEN_KEY]
  const score = (p) => -Math.abs(read(p) - 75)

  const out = optimizeProject(built.project, [{ node: portId, param: LEN_KEY, min: 50, max: 100 }], score)
  assert.ok(out.values[0] >= 50 && out.values[0] <= 100, `values[0]=${out.values[0]} left its bounds`)
  // Spacing over [50, 100] with 9 points is 6.25; half of that is 3.125.
  assert.ok(Math.abs(out.values[0] - 75) <= 3.125, `values[0]=${out.values[0]}`)
})

// CONTRACT: "`params` — Free parameters. Omit `node` to target a sweep setting
// rather than a node param."
test('optimizeProject: omitting node targets a sweep setting', () => {
  const built = buildSealedBox({ driver: SPEC_DRIVER, volume: 40 })
  const settingKey = Object.keys(built.project.settings).find(
    (k) => typeof built.project.settings[k] === 'number',
  )
  assert.ok(settingKey, 'the project carries a numeric sweep setting')
  const read = (p) => p.settings[settingKey]
  const score = (p) => -Math.abs(read(p) - 60)

  const out = optimizeProject(built.project, [{ param: settingKey, min: 20, max: 100 }], score)
  assert.equal(out.values.length, 1)
  assert.equal(read(out.best), out.values[0])
  // Spacing over [20, 100] with 9 points is 10; half of that is 5.
  assert.ok(Math.abs(out.values[0] - 60) <= 5, `values[0]=${out.values[0]}`)
})

// CONTRACT: "cost is `rounds × params × gridN` evaluations rather than
// `gridN ^ params`" — with two free parameters.
test('optimizeProject: two free parameters cost rounds × params × gridN', () => {
  assert.ok(LEN_KEY)
  const built = buildPortedBox({ driver: SPEC_DRIVER, volume: 60, port_count: 2, port_length: 30 })
  const [p0, p1] = built.ports
  const read = (p, id) => p.nodes.find((n) => n.id === id).params[LEN_KEY]
  const score = (p) => -Math.abs(read(p, p0) - 40) - Math.abs(read(p, p1) - 20)
  const out = optimizeProject(
    built.project,
    [
      { node: p0, param: LEN_KEY, min: 10, max: 100 },
      { node: p1, param: LEN_KEY, min: 10, max: 100 },
    ],
    score,
  )
  assert.equal(out.values.length, 2)
  assert.ok(out.evals <= 54, `evals=${out.evals} exceeds 3 × 2 × 9`)
})

// ===========================================================================
// INTERNAL: nid, pos, baseProject, addNode, edge
// ===========================================================================

// CONTRACT: "`t` — Node type, used as the prefix." / "A new node id." /
// @sideeffect "Advances the module-level counter."
test('nid: returns a fresh id prefixed with the node type', () => {
  const a = nid('chamber')
  const b = nid('chamber')
  assert.equal(typeof a, 'string')
  assert.ok(a.startsWith('chamber'), `id ${a} is not prefixed with its type`)
  assert.ok(b.startsWith('chamber'))
  assert.notEqual(a, b, 'the counter must advance')
})

// CONTRACT: "`row` — _(optional, default `0`)_" / "`{x: number, y: number}` —
// Canvas position." / @pure
test('pos: row defaults to 0 and the result is a canvas position', () => {
  const p = pos(1)
  assert.equal(typeof p.x, 'number')
  assert.equal(typeof p.y, 'number')
  assert.deepEqual(p, pos(1, 0))
  assert.deepEqual(pos(2, 3), pos(2, 3))
  // Distinct grid cells must map to distinct positions.
  assert.notDeepEqual(pos(1, 0), pos(2, 0))
  assert.notDeepEqual(pos(1, 0), pos(1, 1))
})

// CONTRACT: "An empty project with the builders' default sweep settings." /
// "The default range is 10–200 Hz at 256 points" / "A project with no nodes or
// edges." / "`settings` — Settings merged over the defaults."
test('baseProject: an empty project with the documented default sweep settings', () => {
  const p = baseProject('My Box')
  assert.deepEqual(p.nodes, [])
  assert.deepEqual(p.edges, [])
  assert.equal(p.name, 'My Box')
  const values = Object.values(p.settings)
  assert.ok(values.includes(10), 'default sweep starts at 10 Hz')
  assert.ok(values.includes(200), 'default sweep ends at 200 Hz')
  assert.ok(values.includes(256), 'default sweep uses 256 points')

  // settings are merged over the defaults, not replaced
  const pointsKey = Object.keys(p.settings).find((k) => p.settings[k] === 256)
  const merged = baseProject('My Box', { [pointsKey]: 64 })
  assert.equal(merged.settings[pointsKey], 64)
  for (const k of Object.keys(p.settings)) {
    if (k !== pointsKey) assert.equal(merged.settings[k], p.settings[k], `default ${k} was dropped`)
  }
})

// CONTRACT: @pure for baseProject
test('baseProject: @pure — arguments unmodified, equal results', () => {
  const settings = { fmax: 300 }
  const snapshot = structuredClone(settings)
  assert.deepEqual(baseProject('n', structuredClone(settings)), baseProject('n', structuredClone(settings)))
  assert.deepEqual(settings, snapshot)
})

// CONTRACT: "The new node's id, for wiring it up." / @mutates "Pushes onto the
// project's node list." / "`row` — _(optional, default `0`)_"
test('addNode: appends a node and returns its id', () => {
  const p = baseProject('x')
  const id = addNode(p, 'chamber', { volume: 40 }, 2)
  assert.equal(typeof id, 'string')
  assert.ok(id.startsWith('chamber'))
  assert.equal(p.nodes.length, 1)
  assert.equal(p.nodes[0].id, id)
  assert.equal(p.nodes[0].type, 'chamber')
  assert.deepEqual(p.nodes[0].params, { volume: 40 })

  const q = baseProject('y')
  addNode(q, 'chamber', { volume: 40 }, 2)
  addNode(q, 'chamber', { volume: 40 }, 2, 0)
  assert.deepEqual(q.nodes[0].position, q.nodes[1].position, 'row defaults to 0')
})

// CONTRACT: "The new edge count, as returned by `Array.push`" / @mutates
// "Pushes onto the project's edge list."
test('edge: pushes onto the edge list and returns the new edge count', () => {
  const p = baseProject('x')
  const a = addNode(p, 'driver', {}, 0)
  const b = addNode(p, 'chamber', {}, 1)
  const n1 = edge(p, a, 'rear', b, 'in')
  assert.equal(n1, 1)
  assert.equal(p.edges.length, 1)
  const n2 = edge(p, a, 'front', b, 'in')
  assert.equal(n2, 2)
  assert.equal(p.edges.length, 2)
  assert.equal(p.edges[0].source, a)
  assert.equal(p.edges[0].target, b)
  assert.equal(p.edges[0].sourceHandle, 'rear')
  assert.equal(p.edges[0].targetHandle, 'in')
})
