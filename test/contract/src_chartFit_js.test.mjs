// Contract tests for src/chartFit.js.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fitLevels, fitFromZero, fitLog } from '../../src/chartFit.js'

// CONTRACT (fitLevels): "the top a little above the highest, the bottom no more
// than `span` below it, both on whole steps".
test('fitLevels: the top sets the range, a skirt does not', () => {
  assert.deepEqual(fitLevels([[0, -3, -90, 4]], { span: 48 }), [-40, 10])
  assert.deepEqual(fitLevels([[2, -4]]), [-10, 10], 'a small range still spans minSpan')
  assert.deepEqual(fitLevels([[-6, -12]], { include: [0] }), [-15, 5])
  assert.deepEqual(fitLevels([[NaN]]), [-18, 0])
  const [lo, hi] = fitLevels([[95, 60, 20]], { span: 50, minSpan: 20 })
  assert.equal(hi, 100)
  assert.equal(lo, 50)
})

// CONTRACT (fitFromZero): a reference "only when it is near enough".
test('fitFromZero: zero up, taking in a near limit', () => {
  assert.deepEqual(fitFromZero([[1, 5, 3]]), [0, 5 * 1.08])
  assert.deepEqual(fitFromZero([[1, 5]], [8]), [0, 8 * 1.08])
  assert.deepEqual(fitFromZero([[1, 5]], [40]), [0, 5 * 1.08])
  assert.deepEqual(fitFromZero([[]]), [0, 1])
})

// CONTRACT (fitLog): "down no more than `decades` below it".
test('fitLog: a few decades under the top', () => {
  const [lo, hi] = fitLog([[1e-8, 0.5, 50]], 3)
  assert.ok(Math.abs(lo - 0.05 / 1.3) < 1e-12 && Math.abs(hi - 65) < 1e-9)
  assert.deepEqual(fitLog([[0, -1]]), [0.1, 1])
})
