import { test } from 'node:test'
import assert from 'node:assert/strict'
import { __internals } from '../../src/components/NLLab.jsx'

// UNREACHABLE — not covered:
//   NLLab()  — EXPORTED, but documented to return `React.ReactElement`;
//              rendering React components is out of scope for this suite.
//   CurveEditor and all its nested closures (toPx, fromPx, commit, zoomAt,
//   onWheel, onSvgPointerDown + move/up, onSvgClick, onSvgMove, onDragPoint +
//   move/up, removePoint, onKey), NLLab > setCurve, NLLab > importCSV and its
//   reader.onload — all marked UNREACHABLE in the spec.

// ---------------------------------------------------------------------------
// refValue
// ---------------------------------------------------------------------------

// CONTRACT: "The small-signal reference value for a parameter, for the
// absolute-value axis." / "`{v: number, unit: string}` — The reference value
// and its unit"
test('refValue: returns the driver value and its unit', () => {
  for (const [param, p, expected] of [
    ['Bl', { Bl: 7.5 }, 7.5],
    ['Cms', { Cms: 0.25 }, 0.25],
    ['Le', { Le: 0.8 }, 0.8],
  ]) {
    const r = __internals.refValue(param, p)
    assert.equal(typeof r, 'object')
    assert.notEqual(r, null)
    assert.equal(typeof r.v, 'number')
    assert.equal(typeof r.unit, 'string')
    assert.equal(r.v, expected)
  }
})

// CONTRACT: "Kms is derived as 1/Cms, since a driver stores compliance rather
// than stiffness."
test('refValue: Kms is derived as 1/Cms', () => {
  assert.equal(__internals.refValue('Kms', { Cms: 0.25 }).v, 1 / 0.25)
  assert.equal(__internals.refValue('Kms', { Cms: 2 }).v, 1 / 2)
  assert.equal(typeof __internals.refValue('Kms', { Cms: 0.25 }).unit, 'string')
})

// CONTRACT: "defaulting to 1 when the driver does not specify it."
test('refValue: defaults to 1 when the driver does not specify it', () => {
  for (const param of ['Bl', 'Cms', 'Kms', 'Le']) {
    const r = __internals.refValue(param, {})
    assert.equal(r.v, 1, `${param} should default to 1`)
    assert.equal(typeof r.unit, 'string')
  }
})

// CONTRACT: "@pure — ... Calling it twice with equal inputs must produce equal
// output and change nothing observable."
test('refValue: @pure — twice-equal results and unmodified arguments', () => {
  const p = { Bl: 7.5, Cms: 0.25, Le: 0.8 }
  const before = structuredClone(p)
  const a = __internals.refValue('Kms', p)
  const b = __internals.refValue('Kms', structuredClone(before))
  assert.deepStrictEqual(a, b)
  assert.deepStrictEqual(p, before)
})

// ---------------------------------------------------------------------------
// fmtVal
// ---------------------------------------------------------------------------

// CONTRACT: "Format an axis value at a readable precision for its magnitude." /
// "`string` — The formatted value."
// AMBIGUITY: "readable precision for its magnitude" fixes no digit count, so
// only string-ness and value fidelity are asserted.
test('fmtVal: returns a string that still reads back as the value', () => {
  for (const v of [0, 1, 1.5, 12.345, 1234.5, 0.001234, -42.7]) {
    const s = __internals.fmtVal(v)
    assert.equal(typeof s, 'string', `fmtVal(${v}) should be a string`)
    const back = Number(s)
    assert.ok(Number.isFinite(back), `fmtVal(${v}) = "${s}" should parse as a number`)
    const tol = Math.max(Math.abs(v) * 0.05, 1e-9)
    assert.ok(Math.abs(back - v) <= tol, `fmtVal(${v}) = "${s}" should be close to ${v}`)
  }
})

// CONTRACT: "@pure — ... Calling it twice with equal inputs must produce equal
// output and change nothing observable."
test('fmtVal: @pure — twice with equal inputs gives equal output', () => {
  assert.equal(__internals.fmtVal(12.345), __internals.fmtVal(12.345))
})

// ---------------------------------------------------------------------------
// niceTicks
// ---------------------------------------------------------------------------

const mantissaOf = (step) => {
  const p = Math.pow(10, Math.floor(Math.log10(Math.abs(step))))
  return Math.round((step / p) * 1e6) / 1e6
}

// CONTRACT: "Picks a 1, 2 or 5 times a power of ten step — the intervals people
// read without effort — landing near the requested tick count rather than
// exactly on it."
// NOTE: the contract explicitly does NOT promise an exact tick count, so no
// count is asserted.
test('niceTicks: step is 1, 2 or 5 times a power of ten and ticks are evenly spaced', () => {
  for (const [lo, hi, target] of [
    [0, 100, undefined],
    [0, 1, undefined],
    [-3, 3, undefined],
    [0, 100, 4],
    [0, 100, 20],
    [1.7, 9.3, 5],
    [0, 0.004, 8],
    [-250, 7500, 6],
  ]) {
    const ticks = target === undefined
      ? __internals.niceTicks(lo, hi)
      : __internals.niceTicks(lo, hi, target)
    assert.ok(Array.isArray(ticks), `niceTicks(${lo},${hi}) should return an array`)
    assert.ok(ticks.length >= 2, `niceTicks(${lo},${hi}) should produce ticks for a positive span`)
    for (const t of ticks) {
      assert.equal(typeof t, 'number')
      assert.ok(Number.isFinite(t))
      assert.ok(t >= lo - 1e-9 && t <= hi + 1e-9, `tick ${t} within [${lo}, ${hi}]`)
    }
    const step = ticks[1] - ticks[0]
    assert.ok(step > 0, 'ticks must ascend')
    for (let i = 1; i < ticks.length; i++) {
      assert.ok(
        Math.abs(ticks[i] - ticks[i - 1] - step) <= Math.abs(step) * 1e-6,
        `ticks evenly spaced for (${lo}, ${hi}): got ${ticks.join(', ')}`,
      )
    }
    assert.ok(
      [1, 2, 5].includes(mantissaOf(step)),
      `step ${step} should be 1, 2 or 5 times a power of ten`,
    )
  }
})

// CONTRACT: "`number[]` — Tick values, empty when the span is not positive."
test('niceTicks: empty when the span is not positive', () => {
  assert.deepStrictEqual(__internals.niceTicks(5, 5), [])
  assert.deepStrictEqual(__internals.niceTicks(10, 0), [])
  assert.deepStrictEqual(__internals.niceTicks(0, -1, 8), [])
})

// CONTRACT: "`target` — `number` (optional, default `8`) — Desired tick count."
// The default must behave as if 8 were passed explicitly.
test('niceTicks: target defaults to 8', () => {
  assert.deepStrictEqual(__internals.niceTicks(0, 100), __internals.niceTicks(0, 100, 8))
  assert.deepStrictEqual(__internals.niceTicks(-3, 3), __internals.niceTicks(-3, 3, 8))
})

// CONTRACT: "@pure — ... Calling it twice with equal inputs must produce equal
// output and change nothing observable."
test('niceTicks: @pure — twice with equal inputs gives equal output', () => {
  assert.deepStrictEqual(__internals.niceTicks(1.7, 9.3, 5), __internals.niceTicks(1.7, 9.3, 5))
})
