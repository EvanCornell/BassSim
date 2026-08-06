import { test } from 'node:test'
import assert from 'node:assert/strict'
import { __internals } from '../../src/components/ParamPanel.jsx'

// UNREACHABLE — not covered:
//   ParamPanel() — EXPORTED, but documented to return `React.ReactElement`;
//                  rendering React components is out of scope for this suite.
//   NumField, SelectField, QSection, LabelField, AmpSolver (+ f), DriverForm,
//   ChamberForm, ProbeSection, WaveguideForm, PRForm, RadiationForm — all
//   marked UNREACHABLE in the spec.

// ---------------------------------------------------------------------------
// round3
// ---------------------------------------------------------------------------

// CONTRACT: "Round a settings value for display, leaving non-numbers alone." /
// "`any` — The value rounded to three decimals"
test('round3: rounds a number to three decimals', () => {
  assert.equal(__internals.round3(1.23456), 1.235)
  assert.equal(__internals.round3(-1.23456), -1.235)
  assert.equal(__internals.round3(0.0004), 0)
  assert.equal(__internals.round3(2), 2)
  assert.equal(__internals.round3(0), 0)
  assert.equal(__internals.round3(12.3), 12.3)
})

// CONTRACT: "or unchanged when it is not a number."
test('round3: leaves non-numbers alone', () => {
  const obj = { a: 1 }
  const arr = [1, 2]
  assert.equal(__internals.round3('abc'), 'abc')
  assert.equal(__internals.round3('1.23456'), '1.23456')
  assert.equal(__internals.round3(''), '')
  assert.equal(__internals.round3(null), null)
  assert.equal(__internals.round3(undefined), undefined)
  assert.equal(__internals.round3(true), true)
  assert.equal(__internals.round3(false), false)
  assert.equal(__internals.round3(obj), obj)
  assert.equal(__internals.round3(arr), arr)
})

// CONTRACT: "The value rounded to three decimals, or unchanged when it is not a
// number." — NaN is a number and is NaN under either reading.
test('round3: NaN stays NaN', () => {
  assert.ok(Number.isNaN(__internals.round3(NaN)))
})

// CONTRACT: "@pure — ... Calling it twice with equal inputs must produce equal
// output and change nothing observable."
test('round3: @pure — twice-equal results and unmodified arguments', () => {
  const v = { a: 1, b: [2, 3] }
  const before = structuredClone(v)
  assert.equal(__internals.round3(1.23456), __internals.round3(1.23456))
  assert.equal(__internals.round3(v), __internals.round3(v))
  assert.deepStrictEqual(v, before)
})
