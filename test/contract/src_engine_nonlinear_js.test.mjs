import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  curvesFromRatings,
  curvesFromGeometry,
  blFromGeometry,
  excursionAt,
  DEFAULT_FRINGE_SHARE,
  FRINGE_LEVEL,
  variationDb,
  BL_AT_XMAX,
  XVAR_DB,
  emptyCurve,
  defaultNL,
  curveHasContent,
  complianceRatio,
  evalCurve,
  cycleAverage,
  hasNL,
  derivedRatios,
  normalizeTable,
  parseCurveCSV,
  NL_PARAMS,
  __internals,
} from '../../src/engine/nonlinear.js'

const { baseValue, rawEval } = __internals

// UNREACHABLE — not covered: (none; this spec lists no UNREACHABLE methods)

// --- helpers -----------------------------------------------------------
// A curve whose baseline table is a constant value everywhere in range.
const flatTable = (v) => ({ points: [], table: [[-1000, v], [1000, v]] })

// ======================================================================
// Exported constants
// ======================================================================

// CONTRACT (exported constants): "### `NL_PARAMS` — The nonlinear parameter
//            names a driver may carry curves for. ... Values: `Bl`, `Cms`,
//            `Kms`, `Le`"
// The listing is a set of values; no order is claimed, so the contents are
// compared sorted.
test('NL_PARAMS: holds exactly the four documented parameter names', () => {
  assert.deepEqual([...NL_PARAMS].sort(), ['Bl', 'Cms', 'Kms', 'Le'])
})

// CONTRACT: "The nonlinear parameter names a driver may carry curves for."
// CONTRACT (defaultNL): "One empty curve per nonlinear parameter"
test('NL_PARAMS: defaultNL carries one empty curve per name in NL_PARAMS', () => {
  const nl = defaultNL()
  assert.deepEqual(Object.keys(nl).sort(), [...NL_PARAMS].sort())
  for (const k of NL_PARAMS) assert.deepEqual(nl[k], emptyCurve())
})

// CONTRACT (hasNL): "True when at least one of Bl, Cms, Kms or Le has content."
test('NL_PARAMS: content in any name from NL_PARAMS is enough for hasNL', () => {
  for (const k of NL_PARAMS) {
    const nl = defaultNL()
    nl[k] = { points: [{ x: 0, g: -0.2, w: 3 }], table: null }
    assert.equal(hasNL(nl), true, `content in ${k} should make hasNL true`)
  }
})

// CONTRACT (exported constants): "### `__internals`  Keys: `baseValue`, `rawEval`"
test('__internals: publishes exactly the documented keys', () => {
  assert.deepEqual(Object.keys(__internals).sort(), ['baseValue', 'logCosh', 'rawEval'])
  for (const k of Object.keys(__internals)) {
    assert.equal(typeof __internals[k], 'function', `${k} should be callable`)
  }
})

// ======================================================================
// emptyCurve()
// ======================================================================

// CONTRACT: "A curve with no content — a flat 1.0 ratio at every excursion."
// CONTRACT: "`{points: Array<{x: number, g: number, w: number}>, table: null}` —
//            A fresh empty curve; callers own it and may mutate it."
test('emptyCurve: returns {points: [], table: null}', () => {
  assert.deepEqual(emptyCurve(), { points: [], table: null })
})

// CONTRACT: "A curve with no content — a flat 1.0 ratio at every excursion."
test('emptyCurve: evaluates to a flat 1.0 ratio at every excursion', () => {
  for (const x of [-50, -5, -0.1, 0, 0.1, 5, 50]) {
    assert.equal(evalCurve(emptyCurve(), x), 1)
  }
})

// CONTRACT: "A fresh empty curve; callers own it and may mutate it."
test('emptyCurve: each call returns a freshly allocated curve', () => {
  const a = emptyCurve()
  const b = emptyCurve()
  assert.notEqual(a, b)
  assert.notEqual(a.points, b.points)
  a.points.push({ x: 1, g: 1, w: 1 })
  assert.deepEqual(b.points, [])
})

// CONTRACT: "@pure — ... Calling it twice with equal inputs must produce equal
//            output and change nothing observable."
test('emptyCurve: @pure — two calls produce equal output', () => {
  assert.deepEqual(emptyCurve(), emptyCurve())
})

// ======================================================================
// defaultNL()
// ======================================================================

// CONTRACT: "`{Bl: object, Cms: object, Kms: object, Le: object}` — One empty
//            curve per nonlinear parameter, freshly allocated."
test('defaultNL: one empty curve per nonlinear parameter', () => {
  const nl = defaultNL()
  assert.deepEqual(Object.keys(nl).sort(), ['Bl', 'Cms', 'Kms', 'Le'])
  for (const k of ['Bl', 'Cms', 'Kms', 'Le']) {
    assert.deepEqual(nl[k], emptyCurve())
  }
})

// CONTRACT: "One empty curve per nonlinear parameter, freshly allocated."
test('defaultNL: curves are freshly allocated and not shared', () => {
  const a = defaultNL()
  const b = defaultNL()
  assert.notEqual(a, b)
  for (const k of ['Bl', 'Cms', 'Kms', 'Le']) {
    assert.notEqual(a[k], b[k])
  }
  // the four curves within one set must also be distinct objects
  const seen = new Set([a.Bl, a.Cms, a.Kms, a.Le])
  assert.equal(seen.size, 4)
})

// CONTRACT: "A complete, empty nonlinear parameter set for a new driver."
test('defaultNL: @pure — two calls produce equal output', () => {
  assert.deepEqual(defaultNL(), defaultNL())
})

// ======================================================================
// curveHasContent(curve)
// ======================================================================

// CONTRACT: "`curve` — `object|null|undefined` — A curve, or nothing."
// CONTRACT: "A curve has content once it has either control points or an
//            imported table."
test('curveHasContent: nothing, and an empty curve, have no content', () => {
  assert.equal(curveHasContent(null), false)
  assert.equal(curveHasContent(undefined), false)
  assert.equal(curveHasContent(emptyCurve()), false)
})

// CONTRACT: "A curve has content once it has either control points or an
//            imported table."
test('curveHasContent: control points alone give content', () => {
  assert.equal(curveHasContent({ points: [{ x: 0, g: -0.2, w: 3 }], table: null }), true)
})

// CONTRACT: "A curve has content once it has either control points or an
//            imported table."
test('curveHasContent: an imported table alone gives content', () => {
  assert.equal(curveHasContent({ points: [], table: [[-1, 0.9], [0, 1], [1, 0.9]] }), true)
})

// CONTRACT: "`boolean` — True when the curve would evaluate to anything other
//            than a constant 1.0."
test('curveHasContent: returns a boolean', () => {
  assert.equal(typeof curveHasContent(null), 'boolean')
  assert.equal(typeof curveHasContent(emptyCurve()), 'boolean')
  assert.equal(typeof curveHasContent({ points: [{ x: 0, g: 1, w: 1 }], table: null }), 'boolean')
})

// CONTRACT: "@pure — ... deterministic in its arguments."
test('curveHasContent: @pure — deterministic and does not modify its argument', () => {
  const c = { points: [{ x: 0, g: -0.2, w: 3 }], table: [[-1, 0.9], [1, 0.9]] }
  const before = structuredClone(c)
  const a = curveHasContent(c)
  const b = curveHasContent(c)
  assert.equal(a, b)
  assert.deepEqual(c, before)
})

// ======================================================================
// evalCurve(curve, x, xmax)
// ======================================================================

// CONTRACT: "`curve` — `object|null|undefined` — The curve to evaluate."
// CONTRACT (baseValue): "With no table the baseline is a flat 1.0."
test('evalCurve: nothing evaluates to the flat 1.0 baseline', () => {
  assert.equal(evalCurve(null, 3), 1)
  assert.equal(evalCurve(undefined, -3), 1)
})

// CONTRACT: "`number` — Ratio at x, floored at 0.01."
// CONTRACT: "@post result >= 0.01 — a ratio must stay physically positive"
test('evalCurve: an aggressive curve is floored at exactly 0.01', () => {
  // A gaussian control point of gain -5 puts the raw value at 1 + (-5) = -4 at
  // its centre; the documented floor must clamp that to 0.01.
  const c = { points: [{ x: 0, g: -5, w: 2 }], table: null }
  assert.equal(evalCurve(c, 0), 0.01)
})

// CONTRACT: "@post result >= 0.01"
test('evalCurve: result >= 0.01 across a range of curves and displacements', () => {
  const curves = [
    null,
    emptyCurve(),
    { points: [{ x: 0, g: -5, w: 2 }], table: null },
    { points: [{ x: 2, g: -3, w: 1 }, { x: -2, g: -3, w: 1 }], table: null },
    flatTable(0.001),
    { points: [{ x: 0, g: -0.9, w: 4 }], table: null, extrap: true },
  ]
  for (const c of curves) {
    for (const x of [-40, -10, -1, 0, 1, 10, 40]) {
      const v = evalCurve(c, x, 5)
      assert.equal(typeof v, 'number')
      assert.ok(v >= 0.01, `evalCurve gave ${v} at x=${x}`)
    }
  }
})

// CONTRACT: "`xmax` — `number` _(optional, default `0`)_ — Xmax, mm.
//            Extrapolation is skipped when this is 0."
test('evalCurve: xmax defaults to 0, which skips extrapolation', () => {
  const c = { points: [{ x: 0, g: -0.3, w: 3 }], table: null, extrap: true }
  for (const x of [-20, -6, 0, 6, 20]) {
    assert.equal(evalCurve(c, x), evalCurve(c, x, 0))
  }
})

// CONTRACT: "With `curve.extrap` set, the curve instead continues past ±Xmax
//            along the slope it had *at* Xmax"
test('evalCurve: with extrap set the curve continues linearly past +Xmax', () => {
  const c = { points: [{ x: 0, g: -0.3, w: 3 }], table: null, extrap: true }
  const xmax = 5
  const v0 = evalCurve(c, xmax, xmax)
  const v1 = evalCurve(c, xmax + 2, xmax)
  const v2 = evalCurve(c, xmax + 4, xmax)
  // Linear continuation: equally spaced samples form an arithmetic progression.
  assert.ok(Math.abs((v2 - v1) - (v1 - v0)) < 1e-9, `${v0} ${v1} ${v2}`)
})

// CONTRACT: "the curve instead continues past ±Xmax along the slope it had *at*
//            Xmax" (±: the negative stroke extrapolates too)
test('evalCurve: with extrap set the curve continues linearly past -Xmax', () => {
  const c = { points: [{ x: 0, g: -0.3, w: 3 }], table: null, extrap: true }
  const xmax = 5
  const v0 = evalCurve(c, -xmax, xmax)
  const v1 = evalCurve(c, -xmax - 2, xmax)
  const v2 = evalCurve(c, -xmax - 4, xmax)
  assert.ok(Math.abs((v2 - v1) - (v1 - v0)) < 1e-9, `${v0} ${v1} ${v2}`)
})

// CONTRACT: "Gaussian control points decay back toward the baseline far from
//            their centre, which is wrong past Xmax ... With `curve.extrap` set,
//            the curve instead continues past ±Xmax"
test('evalCurve: extrap changes the answer past Xmax but not inside it', () => {
  const pts = [{ x: 0, g: -0.3, w: 3 }]
  const plain = { points: pts, table: null }
  const ext = { points: pts, table: null, extrap: true }
  const xmax = 5
  // Inside ±Xmax the two agree — extrapolation only applies beyond Xmax.
  for (const x of [-4, -1, 0, 1, 4]) {
    assert.equal(evalCurve(ext, x, xmax), evalCurve(plain, x, xmax))
  }
  // Well past Xmax the gaussian has decayed back to baseline; extrapolation
  // must not.
  assert.notEqual(evalCurve(ext, 20, xmax), evalCurve(plain, 20, xmax))
})

// CONTRACT: "@pure — no side effects ... Calling it twice with equal inputs must
//            produce equal output and change nothing observable."
test('evalCurve: @pure — repeatable and does not modify its arguments', () => {
  const c = { points: [{ x: 1, g: -0.4, w: 2 }], table: [[-5, 1], [5, 0.8]], extrap: true }
  const before = structuredClone(c)
  const a = evalCurve(c, 3.5, 4)
  const b = evalCurve(c, 3.5, 4)
  assert.equal(a, b)
  assert.deepEqual(c, before)
})

// ======================================================================
// cycleAverage(curve, X, xmax)
// ======================================================================

// CONTRACT: "`number` — The cycle-averaged ratio; exactly 1 for a curve with no
//            content, short-circuited before any sampling."
test('cycleAverage: exactly 1 for a curve with no content', () => {
  assert.equal(cycleAverage(null, 5), 1)
  assert.equal(cycleAverage(undefined, 5), 1)
  assert.equal(cycleAverage(emptyCurve(), 5, 8), 1)
})

// CONTRACT: "Average ratio over one sinusoidal cycle of peak excursion X."
test('cycleAverage: at X = 0 the swing collapses onto the value at x = 0', () => {
  const c = { points: [{ x: 0, g: -0.4, w: 3 }], table: null }
  assert.ok(Math.abs(cycleAverage(c, 0, 5) - evalCurve(c, 0, 5)) < 1e-12)
})

// CONTRACT: "a cone swinging to ±X spends its cycle sampling the whole curve, so
//            the parameter the solver should use is the average over that swing"
test('cycleAverage: lies between the curve minimum and maximum over ±X', () => {
  const c = { points: [{ x: 0, g: -0.4, w: 3 }], table: null }
  const X = 6
  let lo = Infinity
  let hi = -Infinity
  for (let i = 0; i <= 2000; i++) {
    const v = evalCurve(c, -X + (2 * X * i) / 2000, 0)
    if (v < lo) lo = v
    if (v > hi) hi = v
  }
  const avg = cycleAverage(c, X)
  assert.equal(typeof avg, 'number')
  assert.ok(avg >= lo - 1e-12 && avg <= hi + 1e-12, `${avg} not in [${lo}, ${hi}]`)
})

// CONTRACT: "`xmax` — `number` _(optional, default `0`)_"
test('cycleAverage: xmax defaults to 0', () => {
  const c = { points: [{ x: 0, g: -0.4, w: 3 }], table: null, extrap: true }
  assert.equal(cycleAverage(c, 6), cycleAverage(c, 6, 0))
})

// CONTRACT: "@pure — ... Calling it twice with equal inputs must produce equal
//            output and change nothing observable."
test('cycleAverage: @pure — repeatable and does not modify its arguments', () => {
  const c = { points: [{ x: 1, g: -0.4, w: 2 }], table: [[-5, 1], [5, 0.8]] }
  const before = structuredClone(c)
  const a = cycleAverage(c, 4, 5)
  const b = cycleAverage(c, 4, 5)
  assert.equal(a, b)
  assert.deepEqual(c, before)
})

// ======================================================================
// hasNL(nl)
// ======================================================================

// CONTRACT: "`nl` — `object|null|undefined` — A driver's nonlinear parameter set."
// CONTRACT: "`boolean` — True when at least one of Bl, Cms, Kms or Le has content."
test('hasNL: nothing, and a default set, have no nonlinear content', () => {
  assert.equal(hasNL(null), false)
  assert.equal(hasNL(undefined), false)
  assert.equal(hasNL({}), false)
  assert.equal(hasNL(defaultNL()), false)
})

// CONTRACT: "True when at least one of Bl, Cms, Kms or Le has content."
test('hasNL: content in any one of Bl, Cms, Kms or Le is enough', () => {
  for (const k of ['Bl', 'Cms', 'Kms', 'Le']) {
    const nl = defaultNL()
    nl[k] = { points: [{ x: 0, g: -0.2, w: 3 }], table: null }
    assert.equal(hasNL(nl), true, `content in ${k} should make hasNL true`)
  }
})

// CONTRACT: "@pure — ... deterministic in its arguments."
test('hasNL: @pure — repeatable and does not modify its argument', () => {
  const nl = defaultNL()
  nl.Bl = { points: [{ x: 0, g: -0.2, w: 3 }], table: null }
  const before = structuredClone(nl)
  assert.equal(hasNL(nl), hasNL(nl))
  assert.deepEqual(nl, before)
})

// ======================================================================
// complianceRatio(nl, X, xmax)
// ======================================================================

// CONTRACT: "`number` — Compliance as a ratio of the small-signal value; 1 when
//            neither curve has content."
test('complianceRatio: exactly 1 when neither curve has content', () => {
  assert.equal(complianceRatio(null, 5), 1)
  assert.equal(complianceRatio(undefined, 5), 1)
  assert.equal(complianceRatio({}, 5), 1)
  assert.equal(complianceRatio(defaultNL(), 5, 8), 1)
})

// CONTRACT: "A Kms curve therefore takes precedence over a Cms curve when both
//            are present."
// CONTRACT: "the correct result is `1/avg(Kms)`, not `avg(1/Kms)`"
// CONTRACT (exported constants): "`Cms` and `Kms` are two descriptions of the
//            same suspension, so a driver normally has one or the other rather
//            than both." — this test is the abnormal case the precedence rule
//            exists to settle.
test('complianceRatio: a Kms curve takes precedence over a Cms curve', () => {
  const nl = defaultNL()
  nl.Kms = flatTable(0.5) // constant stiffness ratio 0.5 -> compliance 1/0.5 = 2
  nl.Cms = flatTable(3) // would give 3 if it were used
  assert.ok(Math.abs(complianceRatio(nl, 4) - 2) < 1e-9, `got ${complianceRatio(nl, 4)}`)
})

// CONTRACT: "the correct result is `1/avg(Kms)`"
test('complianceRatio: with only a Kms curve the result is 1/avg(Kms)', () => {
  const nl = defaultNL()
  nl.Kms = flatTable(0.5)
  assert.ok(Math.abs(complianceRatio(nl, 4) - 2) < 1e-9)
})

// CONTRACT: "Effective compliance ratio at peak excursion X." (a Cms curve is
// already a compliance ratio, so its cycle average is the answer directly)
test('complianceRatio: with only a Cms curve the result is the averaged Cms ratio', () => {
  const nl = defaultNL()
  nl.Cms = flatTable(3)
  assert.ok(Math.abs(complianceRatio(nl, 4) - 3) < 1e-9, `got ${complianceRatio(nl, 4)}`)
})

// CONTRACT: "@post result > 0 — the averaged stiffness is floored at 0.05 so a
//            curve driven to zero stiffness cannot produce an infinite compliance"
test('complianceRatio: a zero-stiffness Kms curve hits the 0.05 floor, giving 20', () => {
  const nl = defaultNL()
  // Gain -5 over a very wide gaussian drives Kms below zero everywhere in the
  // swing; evalCurve floors it at 0.01, which is below the documented 0.05
  // stiffness floor, so the compliance is exactly 1 / 0.05 = 20.
  nl.Kms = { points: [{ x: 0, g: -5, w: 1000 }], table: null }
  assert.equal(complianceRatio(nl, 5), 20)
})

// CONTRACT: "@post result > 0"
test('complianceRatio: result > 0 across a range of inputs', () => {
  const sets = [
    null,
    {},
    defaultNL(),
    { Kms: { points: [{ x: 0, g: -5, w: 1000 }], table: null } },
    { Cms: { points: [{ x: 0, g: -5, w: 1000 }], table: null } },
    { Cms: flatTable(0.001) },
    { Kms: flatTable(50) },
  ]
  for (const nl of sets) {
    for (const X of [0, 0.5, 5, 50]) {
      const r = complianceRatio(nl, X, 5)
      assert.equal(typeof r, 'number')
      assert.ok(r > 0, `complianceRatio gave ${r}`)
    }
  }
})

// CONTRACT: "`xmax` — `number` _(optional, default `0`)_ — ... 0 disables it."
test('complianceRatio: xmax defaults to 0', () => {
  const nl = defaultNL()
  nl.Cms = { points: [{ x: 0, g: -0.3, w: 3 }], table: null, extrap: true }
  assert.equal(complianceRatio(nl, 6), complianceRatio(nl, 6, 0))
})

// CONTRACT: "@pure — ... Calling it twice with equal inputs must produce equal
//            output and change nothing observable."
test('complianceRatio: @pure — repeatable and does not modify its arguments', () => {
  const nl = defaultNL()
  nl.Kms = { points: [{ x: 0, g: -0.5, w: 4 }], table: null }
  const before = structuredClone(nl)
  const a = complianceRatio(nl, 4, 5)
  const b = complianceRatio(nl, 4, 5)
  assert.equal(a, b)
  assert.deepEqual(nl, before)
})

// ======================================================================
// derivedRatios(nl, X, xmax)
// ======================================================================

// CONTRACT: "`{Bl: number, Cms: number, Le: number, Fs: number, Qes: number,
//            Vas: number}` — Each parameter as a ratio of its small-signal
//            value, where 1 means unchanged."
test('derivedRatios: returns exactly the six documented numeric ratios', () => {
  const r = derivedRatios(defaultNL(), 4)
  assert.deepEqual(Object.keys(r).sort(), ['Bl', 'Cms', 'Fs', 'Le', 'Qes', 'Vas'])
  for (const k of Object.keys(r)) assert.equal(typeof r[k], 'number')
})

// CONTRACT: "Each parameter as a ratio of its small-signal value, where 1 means
//            unchanged."
test('derivedRatios: an empty parameter set leaves every ratio at 1', () => {
  assert.deepEqual(derivedRatios(defaultNL(), 6, 8), {
    Bl: 1, Cms: 1, Le: 1, Fs: 1, Qes: 1, Vas: 1,
  })
})

// CONTRACT: "the derived figures follow from the standard relations — Fs varies
//            as 1/sqrt(Cms), Vas directly with Cms, and Qes as sqrt(1/Cms)/Bl²."
test('derivedRatios: Fs = 1/sqrt(Cms), Vas = Cms, Qes = sqrt(1/Cms)/Bl^2', () => {
  const nl = defaultNL()
  nl.Cms = flatTable(4) // compliance ratio 4
  nl.Bl = flatTable(2) // Bl ratio 2
  const r = derivedRatios(nl, 4)
  assert.ok(Math.abs(r.Cms - 4) < 1e-9, `Cms ${r.Cms}`)
  assert.ok(Math.abs(r.Bl - 2) < 1e-9, `Bl ${r.Bl}`)
  assert.ok(Math.abs(r.Vas - r.Cms) < 1e-9, `Vas ${r.Vas}`)
  assert.ok(Math.abs(r.Fs - 1 / Math.sqrt(r.Cms)) < 1e-9, `Fs ${r.Fs}`)
  assert.ok(Math.abs(r.Qes - Math.sqrt(1 / r.Cms) / (r.Bl * r.Bl)) < 1e-9, `Qes ${r.Qes}`)
})

// CONTRACT: "`xmax` — `number` _(optional, default `0`)_ — Xmax, mm, passed
//            through for extrapolation."
test('derivedRatios: xmax defaults to 0', () => {
  const nl = defaultNL()
  nl.Bl = { points: [{ x: 0, g: -0.3, w: 3 }], table: null, extrap: true }
  assert.deepEqual(derivedRatios(nl, 6), derivedRatios(nl, 6, 0))
})

// CONTRACT: "@pure — ... Calling it twice with equal inputs must produce equal
//            output and change nothing observable."
test('derivedRatios: @pure — repeatable and does not modify its arguments', () => {
  const nl = defaultNL()
  nl.Bl = { points: [{ x: 0, g: -0.3, w: 3 }], table: null }
  nl.Cms = flatTable(1.4)
  const before = structuredClone(nl)
  const a = derivedRatios(nl, 4, 5)
  const b = derivedRatios(nl, 4, 5)
  assert.deepEqual(a, b)
  assert.deepEqual(nl, before)
})

// ======================================================================
// normalizeTable(table)
// ======================================================================

// CONTRACT: "a ratio curve passes through 1 there, so anything outside 0.5–2 is
//            assumed absolute"
// CONTRACT: "the original array when no scaling was needed"
test('normalizeTable: a ratio table is returned unscaled, by identity', () => {
  const t = [[-1, 0.9], [0, 1], [1, 0.9]]
  const out = normalizeTable(t)
  assert.equal(out.wasAbsolute, false)
  assert.equal(out.v0, 1)
  assert.equal(out.table, t) // "the original array when no scaling was needed"
})

// CONTRACT: "anything outside 0.5–2 is assumed absolute and divided through by
//            its own x = 0 value."
test('normalizeTable: an absolute table is divided through by its x = 0 value', () => {
  const t = [[-1, 4], [0, 5], [1, 4]]
  const out = normalizeTable(t)
  assert.equal(out.wasAbsolute, true)
  assert.equal(out.v0, 5)
  assert.notEqual(out.table, t)
  assert.deepEqual(out.table, [[-1, 0.8], [0, 1], [1, 0.8]])
})

// CONTRACT: "anything outside 0.5–2 is assumed absolute"
// AMBIGUITY: the range 0.5–2 is written inclusively, so 0.5 and 2 themselves are
// NOT "outside" it and must be treated as ratios. Tested at the strictest
// defensible reading.
test('normalizeTable: the 0.5–2 ratio window is inclusive at both ends', () => {
  assert.equal(normalizeTable([[-1, 0.4], [0, 0.5], [1, 0.4]]).wasAbsolute, false)
  assert.equal(normalizeTable([[-1, 1.5], [0, 2], [1, 1.5]]).wasAbsolute, false)
  assert.equal(normalizeTable([[-1, 0.4], [0, 0.49], [1, 0.4]]).wasAbsolute, true)
  assert.equal(normalizeTable([[-1, 1.5], [0, 2.01], [1, 1.5]]).wasAbsolute, true)
})

// CONTRACT: "`Error` — When the value at x = 0 is zero, which no ratio can be
//            derived from."
test('normalizeTable: throws when the value at x = 0 is zero', () => {
  assert.throws(() => normalizeTable([[-1, 0.5], [0, 0], [1, 0.5]]), Error)
  // a neighbouring valid input does not throw
  assert.doesNotThrow(() => normalizeTable([[-1, 0.5], [0, 0.001], [1, 0.5]]))
})

// CONTRACT: "@post The input array is never modified; scaling produces a new
//            array."
test('normalizeTable: the input array is never modified', () => {
  const t = [[-1, 4], [0, 5], [1, 4]]
  const before = structuredClone(t)
  normalizeTable(t)
  assert.deepEqual(t, before)
  const t2 = [[-1, 0.9], [0, 1], [1, 0.9]]
  const before2 = structuredClone(t2)
  normalizeTable(t2)
  assert.deepEqual(t2, before2)
})

// CONTRACT: "`{table: Array<[number, number]>, wasAbsolute: boolean, v0: number}`"
test('normalizeTable: returns the documented shape and types', () => {
  const out = normalizeTable([[-1, 4], [0, 5], [1, 4]])
  assert.deepEqual(Object.keys(out).sort(), ['table', 'v0', 'wasAbsolute'])
  assert.ok(Array.isArray(out.table))
  assert.equal(typeof out.wasAbsolute, 'boolean')
  assert.equal(typeof out.v0, 'number')
  for (const row of out.table) {
    assert.equal(row.length, 2)
    assert.equal(typeof row[0], 'number')
    assert.equal(typeof row[1], 'number')
  }
})

// CONTRACT: "@pure — ... Calling it twice with equal inputs must produce equal
//            output and change nothing observable."
test('normalizeTable: @pure — repeatable', () => {
  const t = [[-1, 4], [0, 5], [1, 4]]
  assert.deepEqual(normalizeTable(t), normalizeTable(structuredClone(t)))
})

// ======================================================================
// parseCurveCSV(text)
// ======================================================================

// CONTRACT: "Accepts comma, semicolon or tab separated `x_mm, ratio` rows."
test('parseCurveCSV: accepts comma, semicolon and tab separators', () => {
  assert.deepEqual(parseCurveCSV('0,1\n1,0.9'), [[0, 1], [1, 0.9]])
  assert.deepEqual(parseCurveCSV('0;1\n1;0.9'), [[0, 1], [1, 0.9]])
  assert.deepEqual(parseCurveCSV('0\t1\n1\t0.9'), [[0, 1], [1, 0.9]])
})

// CONTRACT: "Blank lines, `#` comments and header rows — detected by alphabetic
//            characters in the first field — are skipped"
test('parseCurveCSV: skips blank lines, # comments and header rows', () => {
  assert.deepEqual(parseCurveCSV('\n0,1\n\n1,0.9\n\n'), [[0, 1], [1, 0.9]])
  assert.deepEqual(parseCurveCSV('# a comment\n0,1\n1,0.9'), [[0, 1], [1, 0.9]])
  assert.deepEqual(parseCurveCSV('x_mm,ratio\n0,1\n1,0.9'), [[0, 1], [1, 0.9]])
})

// CONTRACT: "`Array<[number, number]>` — Rows sorted ascending by x."
test('parseCurveCSV: rows come back sorted ascending by x', () => {
  assert.deepEqual(parseCurveCSV('1,0.9\n-1,0.8\n0,1'), [[-1, 0.8], [0, 1], [1, 0.9]])
})

// CONTRACT: "`Error` — When fewer than two usable rows are found, since a single
//            point defines no curve."
test('parseCurveCSV: throws when fewer than two usable rows are found', () => {
  assert.throws(() => parseCurveCSV('0,1'), Error)
  assert.throws(() => parseCurveCSV(''), Error)
  assert.throws(() => parseCurveCSV('x_mm,ratio\n0,1'), Error)
  // two usable rows is enough
  assert.doesNotThrow(() => parseCurveCSV('0,1\n1,0.9'))
})

// CONTRACT: "@pure — ... deterministic in its arguments."
test('parseCurveCSV: @pure — repeatable', () => {
  const text = 'x_mm,ratio\n# note\n1,0.9\n-1,0.8\n\n0,1\n'
  assert.deepEqual(parseCurveCSV(text), parseCurveCSV(text))
})

// ======================================================================
// __internals.baseValue(curve, x)
// ======================================================================

// CONTRACT: "With no table the baseline is a flat 1.0."
test('baseValue: with no table the baseline is a flat 1.0', () => {
  assert.equal(baseValue(null, 3), 1)
  assert.equal(baseValue(undefined, -3), 1)
  assert.equal(baseValue(emptyCurve(), 7), 1)
  assert.equal(baseValue({ points: [{ x: 0, g: -5, w: 2 }], table: null }, 0), 1)
})

// CONTRACT: "An imported table is interpolated linearly"
test('baseValue: an imported table is interpolated linearly', () => {
  const c = { points: [], table: [[-1, 0.5], [0, 1], [1, 1.5]] }
  assert.ok(Math.abs(baseValue(c, 0.5) - 1.25) < 1e-12)
  assert.ok(Math.abs(baseValue(c, -0.5) - 0.75) < 1e-12)
  assert.equal(baseValue(c, 0), 1)
})

// CONTRACT: "and clamped at both ends — measured data should not extrapolate
//            itself."
test('baseValue: an imported table is clamped at both ends', () => {
  const c = { points: [], table: [[-1, 0.5], [0, 1], [1, 1.5]] }
  assert.equal(baseValue(c, 5), 1.5)
  assert.equal(baseValue(c, 1), 1.5)
  assert.equal(baseValue(c, -5), 0.5)
  assert.equal(baseValue(c, -1), 0.5)
})

// CONTRACT: "@pure — ... deterministic in its arguments."
test('baseValue: @pure — repeatable and does not modify its arguments', () => {
  const c = { points: [], table: [[-1, 0.5], [0, 1], [1, 1.5]] }
  const before = structuredClone(c)
  assert.equal(baseValue(c, 0.3), baseValue(c, 0.3))
  assert.deepEqual(c, before)
})

// ======================================================================
// __internals.rawEval(curve, x)
// ======================================================================

// CONTRACT: "Evaluate a curve at displacement x, baseline plus control points,
//            unclamped."
// CONTRACT: "`number` — Unclamped ratio at x, which may be zero or negative for
//            an aggressive curve."
test('rawEval: is not floored and may go negative', () => {
  const c = { points: [{ x: 0, g: -5, w: 2 }], table: null }
  assert.ok(rawEval(c, 0) < 0, `rawEval gave ${rawEval(c, 0)}`)
  // evalCurve applies the floor that rawEval deliberately does not.
  assert.equal(evalCurve(c, 0), 0.01)
})

// CONTRACT: "Control points are gaussian bumps added onto the baseline"
// CONTRACT (module): "A curve is a flat 1.0 baseline (or an imported table),
//            deformed by parametric-EQ style control points: gaussian bumps
//            {x mm, g gain, w width mm}."
// The module section names `g` as the gain, so at a point's centre — where the
// gaussian is at full height — the raw value is the baseline plus that gain.
test('rawEval: at a control point centre the value is baseline plus its gain', () => {
  const c = { points: [{ x: 0, g: -5, w: 2 }], table: null }
  assert.ok(Math.abs(rawEval(c, 0) - (1 - 5)) < 1e-12, `rawEval gave ${rawEval(c, 0)}`)
})

// CONTRACT: "Control points are gaussian bumps added onto the baseline, in the
//            manner of a parametric EQ." (a gaussian decays away from its centre)
test('rawEval: a control point decays back toward the baseline away from its centre', () => {
  const c = { points: [{ x: 2, g: -0.5, w: 1 }], table: null }
  const atCentre = rawEval(c, 2)
  const near = rawEval(c, 3)
  const far = rawEval(c, 20)
  assert.ok(atCentre < near, `${atCentre} !< ${near}`)
  assert.ok(near < far, `${near} !< ${far}`)
  assert.ok(Math.abs(far - 1) < 1e-6, `far value ${far} should return to the 1.0 baseline`)
})

// CONTRACT (module): "gaussian bumps {x mm, g gain, w width mm}"
// `w` is the bump's width in mm, so a wider point deforms the curve further from
// its centre while leaving the full-height value at the centre unchanged.
test('rawEval: a control point\'s w is its width in mm', () => {
  const narrow = { points: [{ x: 0, g: -0.5, w: 1 }], table: null }
  const wide = { points: [{ x: 0, g: -0.5, w: 8 }], table: null }
  // same gain at the centre
  assert.ok(Math.abs(rawEval(narrow, 0) - rawEval(wide, 0)) < 1e-12)
  // but the wide point still bites well away from the centre where the narrow
  // one has decayed back to the baseline
  assert.ok(rawEval(wide, 6) < rawEval(narrow, 6), `${rawEval(wide, 6)} !< ${rawEval(narrow, 6)}`)
  assert.ok(Math.abs(rawEval(narrow, 6) - 1) < 1e-6, `narrow at 6 mm: ${rawEval(narrow, 6)}`)
})

// CONTRACT: "baseline plus control points" — with no points the raw value is the
// baseline, and with no curve at all it is the flat 1.0 baseline.
test('rawEval: with no control points the value is the baseline', () => {
  assert.equal(rawEval(null, 3), 1)
  assert.equal(rawEval(emptyCurve(), 3), 1)
  const c = { points: [], table: [[-1, 0.5], [1, 1.5]] }
  assert.equal(rawEval(c, 0), baseValue(c, 0))
})

// CONTRACT: "When the curve sets `sym`, each point is mirrored to the opposite
//            stroke direction — a point at +3 mm also acts at −3 mm — which is
//            how a motor with a symmetric gap is described with half the points."
test('rawEval: when the curve sets sym each point is mirrored to the opposite stroke', () => {
  const c = { points: [{ x: 3, g: -0.5, w: 1 }], table: null, sym: true }
  assert.ok(Math.abs(rawEval(c, 3) - rawEval(c, -3)) < 1e-12,
    `${rawEval(c, 3)} vs ${rawEval(c, -3)}`)
  // the mirrored copy really acts at −3 mm, not merely by coincidence of shape
  assert.ok(rawEval(c, -3) < rawEval(c, -10), 'the mirror should deform the curve at -3 mm')
  // and without `sym`, the point is one-sided
  const asym = { points: [{ x: 3, g: -0.5, w: 1 }], table: null }
  assert.notEqual(rawEval(asym, 3), rawEval(asym, -3))
  assert.ok(Math.abs(rawEval(asym, -3) - 1) < 1e-6, 'unmirrored: -3 mm stays at baseline')
})

// CONTRACT: "Points within 0.01 mm of centre are not mirrored, since they
//            already straddle it."
test('rawEval: a point within 0.01 mm of centre is not mirrored', () => {
  // At 0.005 mm the point is inside the no-mirror band, so its full-height
  // deviation from the baseline is its own gain, applied once.
  const near = { points: [{ x: 0.005, g: -0.5, w: 1 }], table: null, sym: true }
  assert.ok(Math.abs((rawEval(near, 0.005) - 1) - (-0.5)) < 1e-9,
    `deviation ${rawEval(near, 0.005) - 1} should be a single gain of -0.5`)

  const atCentre = { points: [{ x: 0, g: -0.5, w: 1 }], table: null, sym: true }
  assert.ok(Math.abs((rawEval(atCentre, 0) - 1) - (-0.5)) < 1e-9,
    `deviation ${rawEval(atCentre, 0) - 1} should be a single gain of -0.5`)
})

// CONTRACT: "Points within 0.01 mm of centre are not mirrored" — just outside
// that band the point IS mirrored, so its own contribution and its mirror's
// almost coincide and the deviation at centre is close to twice the gain.
test('rawEval: a point just outside the 0.01 mm band is mirrored', () => {
  const outside = { points: [{ x: 0.02, g: -0.5, w: 1 }], table: null, sym: true }
  const dev = rawEval(outside, 0.02) - 1
  assert.ok(Math.abs(dev - (-1)) < 0.02, `deviation ${dev} should be close to twice -0.5`)
})

// CONTRACT: "@pure — ... deterministic in its arguments."
test('rawEval: @pure — repeatable and does not modify its arguments', () => {
  const c = { points: [{ x: 1, g: -0.4, w: 2 }], table: [[-5, 1], [5, 0.8]] }
  const before = structuredClone(c)
  assert.equal(rawEval(c, 2.5), rawEval(c, 2.5))
  assert.deepEqual(c, before)
})

// ---------------------------------------------------------------------------
// curvesFromRatings
// ---------------------------------------------------------------------------

// CONTRACT (variationDb): Bl counts as 20·log, Kms as 10·log — 70% Bl and
// 200% Kms are each about 3 dB.
test('variationDb: Bl squared, Kms linear', () => {
  assert.ok(Math.abs(variationDb(0.7, 1) - 3.098) < 1e-3)
  assert.ok(Math.abs(variationDb(1, 2) - 3.010) < 1e-3)
  assert.equal(variationDb(1, 1), 0)
})

// CONTRACT: Bl is 70% at Xmax; the variation is exactly 6 dB at Xvar and
// grows with excursion — smooth, symmetric, continuing past Xmax.
test('curvesFromRatings: 70% Bl at Xmax, 6 dB at Xvar, smooth and symmetric', () => {
  for (const [xmax, xvar] of [[8, 10], [9.6, 12], [10, 8], [5, 6.5]]) {
    const { Bl, Kms, info } = curvesFromRatings(xmax, xvar)
    const v = (x) => variationDb(evalCurve(Bl, x, xmax), evalCurve(Kms, x, xmax))
    assert.ok(Math.abs(evalCurve(Bl, xmax, xmax) - BL_AT_XMAX) < 1e-3, `Bl at Xmax ${xmax}`)
    assert.ok(Math.abs(v(xvar) - XVAR_DB) < 0.02, `${xmax}/${xvar}: ${v(xvar)} dB at Xvar`)
    assert.equal(info.blAlone, false)
    assert.ok(Math.abs(info.blDb + info.kmsDb - XVAR_DB) < 1e-9)
    let last = -1
    for (let x = 0; x <= 2 * xvar; x += 0.25) {
      const now = v(x)
      assert.ok(now >= last - 1e-9, `variation grows with excursion (${x} mm)`)
      assert.ok(Math.abs(now - v(-x)) < 1e-6, 'symmetric')
      last = now
    }
    assert.ok(evalCurve(Bl, 1.5 * xmax, xmax) < BL_AT_XMAX, 'Bl keeps falling past Xmax')
    // smooth: no step in the slope anywhere over the stroke
    const step = 0.25
    let maxCurv = 0
    for (let x = -2 * xvar; x <= 2 * xvar; x += step) {
      const c = v(x + step) - 2 * v(x) + v(x - step)
      maxCurv = Math.max(maxCurv, Math.abs(c))
    }
    assert.ok(maxCurv < 0.1, `smooth: second difference ${maxCurv}`)
  }
})

// CONTRACT: without Xvar only Bl is built; when Bl alone passes 6 dB before
// Xvar the suspension is left linear and the disagreement is reported.
test('curvesFromRatings: no Xvar, and an Xvar Bl alone already exceeds', () => {
  const noXvar = curvesFromRatings(8)
  assert.equal(curveHasContent(noXvar.Kms), false)
  assert.equal(noXvar.info.blAtXvar, null)
  const far = curvesFromRatings(6, 12)
  assert.equal(far.info.blAlone, true)
  assert.equal(curveHasContent(far.Kms), false)
  assert.ok(far.info.blSixDbAt < 12)
  assert.ok(Math.abs(variationDb(evalCurve(far.Bl, far.info.blSixDbAt, 6), 1) - XVAR_DB) < 0.02)
  assert.throws(() => curvesFromRatings(0, 5), /Xmax/)
  assert.throws(() => curvesFromRatings(5, -1), /Xvar/)
})


// ---------------------------------------------------------------------------
// Bl from the motor's geometry
// ---------------------------------------------------------------------------

// CONTRACT: with a hard-edged field, Bl is the share of the gap the coil covers.
test('blFromGeometry: hard edge — flat to the overhang, then linear to zero', () => {
  const over = blFromGeometry({ coil: 20, gap: 8, fringe: 0 })
  assert.equal(over(0), 1)
  assert.ok(Math.abs(over(6) - 1) < 1e-12, 'flat while the coil covers the gap')
  assert.ok(Math.abs(over(8) - 0.75) < 1e-12)
  assert.ok(Math.abs(over(10) - 0.5) < 1e-12)
  assert.ok(Math.abs(over(14)) < 1e-12, 'gone once the coil leaves the gap')
  const under = blFromGeometry({ coil: 6, gap: 12, fringe: 0 })
  assert.ok(Math.abs(under(3) - 1) < 1e-12, 'underhung: flat while the coil stays in the gap')
  assert.ok(Math.abs(under(6) - 0.5) < 1e-12)
  assert.ok(Math.abs(over(-10) - over(10)) < 1e-12, 'symmetric')
})

// CONTRACT: the fringe rounds the knee and spreads the fall, but takes no flux from the gap.
test('blFromGeometry: fringe rounds the knee and reaches further', () => {
  const hard = blFromGeometry({ coil: 20, gap: 8, fringe: 0 })
  const soft = blFromGeometry({ coil: 20, gap: 8, fringe: 2 })
  assert.ok(soft(6) < 1 && soft(6) > 0.85, 'below full Bl where the coil end meets the plate')
  assert.ok(soft(14) > 0.05, 'some Bl left past the hard-edge limit')
  assert.ok(Math.abs(soft(10) - hard(10)) < 0.02, 'about the same halfway across the gap')
  const auto = blFromGeometry({ coil: 20, gap: 8 })
  const quarter = blFromGeometry({ coil: 20, gap: 8, fringe: DEFAULT_FRINGE_SHARE * 8 })
  assert.equal(auto(9), quarter(9), 'the fringe defaults to a quarter of the gap')
  // the field past a plate face falls to FRINGE_LEVEL at the fringe height: a 1 mm-long coil reads the field
  const probe = blFromGeometry({ coil: 1e-3, gap: 8, fringe: 2 })
  assert.ok(Math.abs(probe(4 + 2) - FRINGE_LEVEL) < 5e-3, 'down to the fringe level at the fringe height')
  assert.ok(Math.abs(probe(4) - 0.5) < 0.02, 'half strength at the face')
  assert.throws(() => blFromGeometry({ coil: 0, gap: 8 }), /Coil/)
  assert.throws(() => blFromGeometry({ coil: 10, gap: -1 }), /Gap/)
  assert.throws(() => blFromGeometry({ coil: 10, gap: 8, fringe: -1 }), /Fringe/)
})

test('excursionAt: where a falling ratio reaches a level', () => {
  const lin = (x) => 1 - Math.abs(x) / 10
  assert.ok(Math.abs(excursionAt(lin, 0.7, 20) - 3) < 1e-9)
  assert.equal(excursionAt(lin, 0.7, 2), null)
})

// CONTRACT: Bl from the motor, not Xmax; Xmax only reported; Kms takes what Xvar still needs.
test('curvesFromGeometry: Bl from coil and gap, Kms from Xvar', () => {
  const a = curvesFromGeometry({ coil: 11, gap: 7, xmax: 3.8 })
  const b = curvesFromGeometry({ coil: 11, gap: 7, xmax: 6 })
  for (const x of [0, 2, 3.8, 5, 8]) assert.ok(Math.abs(evalCurve(a.Bl, x) - evalCurve(b.Bl, x)) < 1e-3, 'Xmax does not shape Bl')
  assert.ok(a.info.blAtXmax > b.info.blAtXmax)
  assert.equal(a.info.flat, 2)
  assert.equal(a.info.overhung, true)
  assert.equal(a.info.fringe, 1.75)
  const bl = blFromGeometry({ coil: 11, gap: 7 })
  assert.ok(Math.abs(evalCurve(a.Bl, 3.8, 3.8) - bl(3.8)) < 2e-3, 'the table follows the model')
  assert.ok(Math.abs(bl(a.info.bl70At) - BL_AT_XMAX) < 1e-6)
  assert.ok(Math.abs(variationDb(bl(a.info.blSixDbAt), 1) - XVAR_DB) < 1e-6)
  assert.equal(curveHasContent(a.Kms), false, 'no Xvar, no Kms(x)')
  // a long Xvar: Bl leaves some of the 6 dB to the suspension
  const v = curvesFromGeometry({ coil: 30, gap: 10, xvar: 12 })
  assert.equal(v.info.blAlone, false)
  assert.ok(Math.abs(variationDb(v.info.blAtXvar, evalCurve(v.Kms, 12)) - XVAR_DB) < 1e-6)
  assert.equal(curvesFromGeometry({ coil: 11, gap: 7, xvar: 5.7 }).info.blAlone, true)
  assert.throws(() => curvesFromGeometry({ coil: 11, gap: 7, xvar: -2 }), /Xvar/)
})
