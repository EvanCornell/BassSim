// Contract tests for the pure parts of src/components/TimeDomainWindow.jsx.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { linearTicks, logTicks, timeRows } from '../../src/components/TimeDomainWindow.jsx'

// CONTRACT: "Ticks on a 1-2-5 step"; "1, 2 and 5 of each decade".
test('ticks: round steps, linear and logarithmic', () => {
  assert.deepEqual(linearTicks(0, 500), [0, 100, 200, 300, 400, 500])
  assert.deepEqual(linearTicks(0, 0.9), [0, 0.2, 0.4, 0.6, 0.8])
  assert.deepEqual(logTicks(15, 250), [20, 50, 100, 200])
})

// CONTRACT (timeRows): rows `{ms, key…}` up to `tMax`, thinned.
test('timeRows: milliseconds, cut and thinned', () => {
  const t = Array.from({ length: 5000 }, (_, i) => i / 1000)
  const rows = timeRows(t, { a: t.map((x) => Math.sin(x * 50)), b: t.map(() => 1) }, 2)
  assert.ok(rows.length <= 1600)
  assert.ok(rows[rows.length - 1].ms <= 2000)
  assert.ok('a' in rows[0] && 'b' in rows[0])
  assert.deepEqual(timeRows(t, {}), [])
})

