// Contract tests for the pure parts of src/components/PlotChart.jsx.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { niceTicks, logTicks, tickText, resolveY, minorTicks } from '../../src/components/PlotChart.jsx'

test('niceTicks: a 1-2-5 step, and a clean zero', () => {
  assert.deepEqual(niceTicks(0, 500, 5), [0, 100, 200, 300, 400, 500])
  assert.deepEqual(niceTicks(-0.31, 0.02, 4), [-0.3, -0.2, -0.1, 0])
  assert.ok(!niceTicks(-0.45, 0.01, 5).some((v) => v !== 0 && Math.abs(v) < 1e-9))
})

test('logTicks and tickText', () => {
  assert.deepEqual(logTicks(15, 250), [20, 50, 100, 200])
  assert.equal(tickText(1500), '1.5k')
  assert.equal(tickText(-6), '−6')
  assert.equal(tickText(0.25), '0.25')
})

test('resolveY: padded data, or dataMax expressions', () => {
  assert.deepEqual(resolveY(undefined, [0, 10], false), [-0.8, 10.8])
  assert.deepEqual(resolveY(['dataMax - 90', 'dataMax + 5'], [10, 100], false), [10, 105])
  assert.deepEqual(resolveY([0, 'auto'], [2, 10], false), [0, 10.64])
  const flat = resolveY(undefined, [5, 5], false)
  assert.ok(flat[0] < 5 && flat[1] > 5, 'a flat trace still gets a range')
})

// CONTRACT (minorTicks): "each whole multiple 1–9 of a decade that is not
// already a tick; on a linear one, the point halfway between neighbouring ticks".
test('minorTicks: decade multiples on log, halfway on linear', () => {
  assert.deepEqual(minorTicks([10, 20, 50, 100], 10, 100, true), [30, 40, 60, 70, 80, 90])
  assert.deepEqual(minorTicks([0, 10, 20], -3, 24, false), [5, 15])
  assert.deepEqual(minorTicks([0, 10, 20], 0, 26, false), [5, 15, 25])
  assert.deepEqual(minorTicks([5], 0, 10, false), [])
})
