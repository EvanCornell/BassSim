import { test } from 'node:test'
import assert from 'node:assert/strict'
import { __internals, solveTS, CORE, ALTS } from '../../src/components/TSCalc.jsx'

// UNREACHABLE — not covered:
//   TSCalc()                      — EXPORTED, but documented to return
//                                   `React.ReactElement|null`; rendering React
//                                   components is out of scope for this suite.
//   TSCalc > applyToNode()        — spec: UNREACHABLE
//   TSCalc > setMissingFlag(...)  — spec: UNREACHABLE
//   TSCalc > setAlt(...)          — spec: UNREACHABLE
//   TSCalc > renderRow(arg0)      — spec: UNREACHABLE
//   Field(props)                  — React component; out of scope.

const DS = { Fs: 30, Vas: 60, Qes: 0.4, Qms: 4, Re: 6, Sd: 500 }
/** The full set the six core figures imply, used to feed the substitutions. */
const FULL = __internals.solveDatasheet({ ...DS })

/**
 * Assert two numbers agree to within a relative tolerance.
 *
 * @param {number} got - Observed value.
 * @param {number} want - Expected value.
 * @param {string} what - Label for the failure message.
 * @param {number} [tol] - Relative tolerance.
 * @returns {void}
 */
function near(got, want, what, tol = 1e-9) {
  assert.ok(Math.abs(got - want) <= Math.abs(want) * tol,
    `${what}: got ${got}, want ${want}`)
}

// ---------------------------------------------------------------------------
// compliance / equivalentVolume
// ---------------------------------------------------------------------------

// CONTRACT: "Mechanical compliance implied by an equivalent volume."
// CONTRACT: "Equivalent volume implied by a compliance — the inverse of
// `compliance`."
test('compliance and equivalentVolume are inverses', () => {
  for (const [Vas, Sd] of [[60, 500], [12, 220], [200, 880]]) {
    const cms = __internals.compliance(Vas, Sd)
    assert.ok(cms > 0)
    near(__internals.equivalentVolume(cms, Sd), Vas, `round trip at ${Vas} L`)
  }
})

// A larger cone stores the same compliance in a larger equivalent volume, and
// a stiffer suspension (smaller Cms) in a smaller one.
test('compliance scales inversely with Sd² and directly with Vas', () => {
  const base = __internals.compliance(60, 500)
  near(__internals.compliance(120, 500), base * 2, 'doubling Vas')
  near(__internals.compliance(60, 1000), base / 4, 'doubling Sd')
})

// ---------------------------------------------------------------------------
// solveDatasheet
// ---------------------------------------------------------------------------

// CONTRACT: "Derive the rest of the T/S set from the six core parameters."
// CONTRACT: "The canonical path: Vas gives compliance, compliance and Fs give
// moving mass, and mass with Qes and Qms gives motor strength and mechanical
// resistance."
// CONTRACT: "The complete T/S set in display units — the six inputs echoed
// back plus Cms mm/N, Mms g, Bl T·m and Rms kg/s."
test('solveDatasheet: returns the complete T/S set in display units', () => {
  const r = __internals.solveDatasheet({ ...DS })
  assert.equal(typeof r, 'object')
  assert.notEqual(r, null)
  for (const k of ['Cms', 'Mms', 'Bl', 'Rms', 'Qts']) {
    assert.equal(typeof r[k], 'number', `${k} should be a number`)
    assert.ok(Number.isFinite(r[k]), `${k} should be finite`)
    assert.ok(r[k] > 0, `${k} should be positive for positive inputs`)
  }
  // "the six inputs echoed back"
  for (const [k, v] of Object.entries(DS)) assert.equal(r[k], v, `${k} echoed`)
})

// CONTRACT: "Qts = Qes·Qms / (Qes + Qms)"
test('solveDatasheet: Qts is the parallel combination of Qes and Qms', () => {
  near(FULL.Qts, (DS.Qes * DS.Qms) / (DS.Qes + DS.Qms), 'Qts')
})

// CONTRACT: "Preconditions (caller must guarantee): Every input is positive; a
// zero Qes or Qms divides by zero."
// The satisfied range is asserted: across a spread of positive inputs the
// result stays finite.
test('solveDatasheet: behaves across the satisfied precondition range', () => {
  for (const m of [
    { Fs: 18, Vas: 200, Qes: 0.3, Qms: 8, Re: 3.2, Sd: 880 },
    { Fs: 55, Vas: 12, Qes: 0.9, Qms: 2.5, Re: 6.4, Sd: 220 },
    { Fs: 120, Vas: 1.5, Qes: 1.4, Qms: 1.1, Re: 8, Sd: 50 },
  ]) {
    const r = __internals.solveDatasheet(m)
    for (const k of ['Cms', 'Mms', 'Bl', 'Rms', 'Qts']) {
      assert.ok(Number.isFinite(r[k]), `${k} finite for ${JSON.stringify(m)}`)
    }
  }
})

// CONTRACT: "@pure — no side effects, no dependence on external mutable state,
// and deterministic in its arguments."
test('solveDatasheet: @pure — twice-equal results and unmodified arguments', () => {
  const arg = structuredClone(DS)
  const before = structuredClone(arg)
  const a = __internals.solveDatasheet(arg)
  const b = __internals.solveDatasheet(structuredClone(before))
  assert.deepStrictEqual(a, b)
  assert.deepStrictEqual(arg, before)
})

// ---------------------------------------------------------------------------
// altFor
// ---------------------------------------------------------------------------

// CONTRACT: "The substitution, falling back to the parameter's first."
test('altFor: finds by id, and falls back to the first for an unknown one', () => {
  for (const { key } of CORE) {
    for (const alt of ALTS[key]) assert.equal(__internals.altFor(key, alt.id), alt)
    assert.equal(__internals.altFor(key, 'no-such-id'), ALTS[key][0])
    assert.equal(__internals.altFor(key, undefined), ALTS[key][0])
  }
})

// ---------------------------------------------------------------------------
// solveTS
// ---------------------------------------------------------------------------

// CONTRACT: "Anything named in `missing` comes from a substitution instead of
// from its own field."
// CONTRACT: "a map of core parameter to the relation that produced it (or
// `'given'`)"
test('solveTS: with nothing missing, every parameter is given and the set matches', () => {
  const { result, via, estimated } = solveTS({ ...DS }, {})
  assert.deepStrictEqual(result, __internals.solveDatasheet({ ...DS }))
  for (const { key } of CORE) assert.equal(via[key], 'given', `${key} via`)
  assert.equal(estimated, false)
})

// Each substitution is fed the figures the same driver actually has, so a
// correct relation must hand back the parameter it replaced. This is the
// central property of the whole feature: which route was taken must not
// change the answer.
test('solveTS: every substitution recovers the parameter it stands in for', () => {
  const cases = [
    ['Fs', 'MmsCms', { Fs_Mms: FULL.Mms, Fs_Cms: FULL.Cms }],
    ['Fs', 'MmsVas', { Fs_Mms: FULL.Mms }],
    ['Re', 'Zmax', { Re_Zmax: DS.Re * (1 + DS.Qms / DS.Qes) }],
    ['Sd', 'Dia', { Sd_Dia: Math.sqrt((4 * DS.Sd) / Math.PI) }],
    ['Sd', 'VasCms', { Sd_Cms: FULL.Cms }],
    ['Qes', 'QtsQms', { Qes_Qts: FULL.Qts }],
    ['Qes', 'BlMms', { Qes_Bl: FULL.Bl, Qes_Mms: FULL.Mms }],
    ['Qms', 'QtsQes', { Qms_Qts: FULL.Qts }],
    ['Qms', 'RmsMms', { Qms_Rms: FULL.Rms, Qms_Mms: FULL.Mms }],
    ['Vas', 'Cms', { Vas_Cms: FULL.Cms }],
    ['Vas', 'Mms', { Vas_Mms: FULL.Mms }],
  ]
  for (const [key, id, extra] of cases) {
    const { result, via } = solveTS({ ...DS, ...extra }, { [key]: id })
    near(result[key], DS[key], `${key} via ${id}`, 1e-9)
    assert.equal(via[key], __internals.altFor(key, id).formula, `${key} via ${id} formula`)
    // the rest of the set is unchanged by the detour
    for (const k of ['Mms', 'Cms', 'Bl', 'Rms', 'Qts']) {
      near(result[k], FULL[k], `${k} after recovering ${key} via ${id}`, 1e-8)
    }
  }
})

// CONTRACT: "they are resolved by repeated passes rather than in a fixed
// order: each pass takes whatever has all its dependencies satisfied"
// Fs's route needs Vas, and Vas is itself missing — so Vas has to be resolved
// first, which a fixed pass in CORE order (Fs before Vas) would not do.
test('solveTS: resolves a substitution that depends on another missing one', () => {
  const { result, via } = solveTS(
    { ...DS, Fs_Mms: FULL.Mms, Vas_Cms: FULL.Cms },
    { Fs: 'MmsVas', Vas: 'Cms' },
  )
  near(result.Fs, DS.Fs, 'Fs recovered after Vas', 1e-8)
  near(result.Vas, DS.Vas, 'Vas recovered', 1e-9)
  assert.notEqual(via.Fs, 'given')
  assert.notEqual(via.Vas, 'given')
})

// CONTRACT: "or when the chosen substitutions depend on each other in a
// circle."
test('solveTS: throws when the chosen substitutions are circular', () => {
  assert.throws(
    () => solveTS({ ...DS, Qes_Qts: FULL.Qts, Qms_Qts: FULL.Qts }, { Qes: 'QtsQms', Qms: 'QtsQes' }),
    (e) => e instanceof Error && /Qes|Qms/.test(e.message),
  )
})

// CONTRACT: "whether any estimate was involved"
// CONTRACT: "Re ≈ 0.85·Znom" — "A rule of thumb rather than a relation".
test('solveTS: the nominal-impedance route is flagged as an estimate', () => {
  const { result, estimated } = solveTS({ ...DS, Re_Znom: 8 }, { Re: 'Znom' })
  near(result.Re, 6.8, 'Re from Znom')
  assert.equal(estimated, true)
  // every other route is a derivation, not an estimate
  assert.equal(solveTS({ ...DS, Re_Zmax: 66 }, { Re: 'Zmax' }).estimated, false)
})

// CONTRACT: "When a figure is missing or not positive"
test('solveTS: throws on a missing or non-positive core figure', () => {
  for (const bad of [0, -1, NaN, undefined]) {
    assert.throws(() => solveTS({ ...DS, Fs: bad }, {}), Error, `Fs = ${bad}`)
  }
})

// CONTRACT: "When a figure is missing or not positive" — substitute inputs too.
test('solveTS: throws on a missing or non-positive substitute figure', () => {
  for (const bad of [0, -1, NaN, undefined]) {
    assert.throws(() => solveTS({ ...DS, Vas_Cms: bad }, { Vas: 'Cms' }), Error, `Cms = ${bad}`)
  }
})

// CONTRACT: "when a substitution's own precondition fails"
// CONTRACT: "Throws when Qts is not below Qms, which no real driver allows."
test('solveTS: throws when Qts is not below the Q it is paired with', () => {
  assert.throws(() => solveTS({ ...DS, Qes_Qts: DS.Qms }, { Qes: 'QtsQms' }), /Qts/)
  assert.throws(() => solveTS({ ...DS, Qes_Qts: DS.Qms + 1 }, { Qes: 'QtsQms' }), /Qts/)
  assert.throws(() => solveTS({ ...DS, Qms_Qts: DS.Qes }, { Qms: 'QtsQes' }), /Qts/)
  assert.doesNotThrow(() => solveTS({ ...DS, Qes_Qts: DS.Qms - 0.01 }, { Qes: 'QtsQms' }))
})

// CONTRACT: "@pure — no side effects, no dependence on external mutable state,
// and deterministic in its arguments."
test('solveTS: @pure — twice-equal results and unmodified arguments', () => {
  const values = { ...DS, Qes_Qts: FULL.Qts }
  const missing = { Qes: 'QtsQms' }
  const vBefore = structuredClone(values)
  const mBefore = structuredClone(missing)
  const a = solveTS(values, missing)
  const b = solveTS(structuredClone(vBefore), structuredClone(mBefore))
  assert.deepStrictEqual(a, b)
  assert.deepStrictEqual(values, vBefore)
  assert.deepStrictEqual(missing, mBefore)
})

// ---------------------------------------------------------------------------
// CORE / ALTS
// ---------------------------------------------------------------------------

// CONTRACT: "The six parameters the solver works from, in the order they are
// entered."
test('CORE lists the six parameters, each with a label and unit', () => {
  assert.deepStrictEqual(CORE.map((c) => c.key), ['Fs', 'Re', 'Sd', 'Qes', 'Qms', 'Vas'])
  for (const c of CORE) {
    assert.equal(typeof c.label, 'string')
    assert.ok(c.label.length > 0)
    assert.equal(typeof c.unit, 'string')
  }
})

// CONTRACT: "`needs` lists the other core parameters a substitution consumes"
// CONTRACT: "Substitute inputs are keyed by name rather than by substitution"
test('ALTS covers every core parameter with well-formed substitutions', () => {
  const keys = new Set(CORE.map((c) => c.key))
  assert.deepStrictEqual(new Set(Object.keys(ALTS)), keys)
  for (const [key, list] of Object.entries(ALTS)) {
    assert.ok(list.length > 0, `${key} has at least one substitution`)
    const ids = new Set()
    for (const alt of list) {
      assert.ok(!ids.has(alt.id), `${key}/${alt.id} id is unique`)
      ids.add(alt.id)
      assert.equal(typeof alt.label, 'string')
      assert.equal(typeof alt.formula, 'string')
      assert.equal(typeof alt.solve, 'function')
      assert.ok(Array.isArray(alt.needs))
      // a substitution never depends on the parameter it is replacing
      assert.ok(!alt.needs.includes(key), `${key}/${alt.id} does not need ${key}`)
      for (const n of alt.needs) assert.ok(keys.has(n), `${key}/${alt.id} needs a core key`)
      assert.ok(alt.inputs.length > 0, `${key}/${alt.id} has inputs`)
      for (const input of alt.inputs) {
        assert.equal(input.length, 3, `${key}/${alt.id} input is [name, label, unit]`)
        for (const part of input) assert.equal(typeof part, 'string')
      }
    }
  }
})

// At least one route out of every parameter must be free of core dependencies,
// or a datasheet missing that one figure alone would still be unsolvable.
test('every parameter has a substitution reachable from the other five', () => {
  for (const { key } of CORE) {
    const others = new Set(CORE.map((c) => c.key).filter((k) => k !== key))
    assert.ok(
      ALTS[key].some((alt) => alt.needs.every((n) => others.has(n))),
      `${key} is recoverable when it is the only one missing`,
    )
  }
})
