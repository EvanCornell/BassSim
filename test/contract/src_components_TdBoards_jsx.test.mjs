// Contract tests for the pure parts of src/components/TdBoards.jsx.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { dayLabel, libraryGroups, mergeTraces, cardPoints, defaultValues, effectiveQuantity } from '../../src/components/TdBoards.jsx'

const day = 86400000
const noon = new Date(2026, 9, 6, 12).getTime()

test('dayLabel', () => {
  assert.equal(dayLabel(noon - 3600000, noon), 'Today')
  assert.equal(dayLabel(noon - day, noon), 'Yesterday')
  assert.match(dayLabel(noon - 9 * day, noon), /Sep/)
})

// CONTRACT: grouped by day, a series folded into one item listing its runs in queued order.
test('libraryGroups', () => {
  const runs = [
    { id: 'c', at: noon, seriesId: 's', seriesTitle: 'S' },
    { id: 'b', at: noon - 10, seriesId: 's' },
    { id: 'a', at: noon - 20 },
    { id: 'z', at: noon - day },
  ]
  const g = libraryGroups(runs)
  assert.deepEqual(g.map((x) => x.items.length), [2, 1])
  assert.deepEqual(g[0].items[0].series.runs.map((r) => r.id), ['b', 'c'])
  assert.equal(g[0].items[1].run.id, 'a')
})

test('mergeTraces: rows by x, each trace keyed', () => {
  assert.deepEqual(mergeTraces([{ key: 'a', x: [0, 1], y: [1, 2] }, { key: 'b', x: [1, 2], y: [5, 6] }]),
    [{ x: 0, a: 1 }, { x: 1, a: 2, b: 5 }, { x: 2, b: 6 }])
})

test('cardPoints: what varies, and which figures there are', () => {
  const e = (id, level, x) => ({ id, points: [{ vars: { level, hz: 40 }, m: { xPeak: x } }] })
  const { points, vars, metrics } = cardPoints([e('a', 0, 3), e('b', 6, 5)])
  assert.equal(points.length, 2)
  assert.deepEqual(vars, ['level'])
  assert.deepEqual(metrics, ['xPeak'])
})

test('defaultValues', () => {
  assert.deepEqual(defaultValues('level', 0), [0, 3, 6, 9])
  assert.deepEqual(defaultValues('node:c:volume', 60), [48, 60, 75])
})

test('effectiveQuantity: falls back to what the runs have', () => {
  const compression = { analysis: 'compression', points: [{ vars: { hz: 20 }, m: { cmp: -1 } }, { vars: { hz: 40 }, m: { cmp: -2 } }] }
  assert.equal(effectiveQuantity({ kind: 'overlay', quantity: 'pressure' }, [compression]), 'm:cmp')
  assert.equal(effectiveQuantity({ kind: 'overlay', quantity: 'excursion' }, [{ analysis: 'transient' }]), 'excursion')
})
