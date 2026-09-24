// Contract tests for src/spice/nonlinear.js and the polynomial curves in src/engine/nonlinear.js.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { curveSpan, pwlOf, stiffnessRatio, ratioOf, slopeOf } from '../../src/spice/nonlinear.js'
import { polyRatio, curveHasContent, evalCurve } from '../../src/engine/nonlinear.js'

// CONTRACT: "each end is pinned by a far-away point at the same value".
test('pwlOf: samples the function and pins both ends flat', () => {
  const e = pwlOf((x) => 1 + x / 100, 20, 'v(n1)')
  assert.match(e, /^pwl\(v\(n1\)\*1000,/)
  const nums = e.slice(e.indexOf(',') + 1, -1).split(',').map(Number)
  assert.equal(nums[0], -1e6)
  assert.equal(nums[1], nums[3], 'far left holds the first sample')
  assert.equal(nums[nums.length - 1], nums[nums.length - 3], 'far right holds the last sample')
  assert.equal(curveSpan(10), 40)
  assert.equal(curveSpan(2), 20)
})

// CONTRACT: "A Kms curve is stiffness already; a Cms curve is its reciprocal."
test('stiffnessRatio and ratioOf', () => {
  assert.equal(stiffnessRatio({}, 10), null)
  const fromCms = stiffnessRatio({ Cms: { points: [{ x: 0, g: 1, w: 3 }] } }, 10)
  assert.ok(Math.abs(fromCms(0) - 0.5) < 1e-12)
  const fromKms = stiffnessRatio({ Kms: { points: [{ x: 0, g: 1, w: 3 }] }, Cms: { points: [{ x: 0, g: 5, w: 3 }] } }, 10)
  assert.ok(Math.abs(fromKms(0) - 2) < 1e-12, 'Kms takes precedence')
  assert.equal(ratioOf({ points: [] }, 10), null)
  const s = slopeOf((x) => 3 * x)
  assert.ok(Math.abs(s(1) - 3000) < 1e-9, 'per metre')
})

// CONTRACT (polyRatio): "P(x)/P(0), held at its end values outside its range".
test('polyRatio: a polynomial as a ratio, held outside its range', () => {
  const poly = { coeffs: [10, 0, -0.05], min: -8, max: 8 }
  assert.equal(polyRatio(poly, 0), 1)
  assert.ok(Math.abs(polyRatio(poly, 4) - (10 - 0.8) / 10) < 1e-12)
  assert.equal(polyRatio(poly, 20), polyRatio(poly, 8))
  assert.equal(curveHasContent({ poly }), true)
  assert.equal(curveHasContent({ poly: { coeffs: [10] } }), false)
  assert.ok(Math.abs(evalCurve({ poly, points: [{ x: 0, g: 0.1, w: 2 }] }, 0) - 1.1) < 1e-12, 'points deform the polynomial')
})
