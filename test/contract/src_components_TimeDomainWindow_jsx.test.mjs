// Contract tests for the pure parts of src/components/TimeDomainWindow.jsx.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { linearTicks, logTicks, timeRows, compressionRows } from '../../src/components/TimeDomainWindow.jsx'

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

// CONTRACT (compressionRows): `n<i>` the nonlinear value and `l<i>` the
// linear model's at level i; a point not solved is null.
test('compressionRows: nonlinear and linear keys per level', () => {
  const res = {
    levels: [0, 6],
    rows: [
      { hz: 20, at: { 0: { pe: 1 }, 6: null }, linear: { 0: { pe: 1.1 }, 6: { pe: 4.4 } } },
      { hz: 40 },
    ],
  }
  const rows = compressionRows(res, (m) => m.pe)
  assert.deepEqual(rows[0], { hz: 20, n0: 1, l0: 1.1, n1: null, l1: 4.4 })
  assert.deepEqual(rows[1], { hz: 40, n0: null, l0: null, n1: null, l1: null })
})
