import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chartPanelComponent, __internals } from '../../src/components/OutputPanel.jsx'

// UNREACHABLE — not covered: BaseChart and all its nested closures
// (setManualY, r4, resetAll, fracs, onWheel, onPointerDown, move, up,
// commitZoom), useFitData, useYScale, setYs, useChartData, SPLTab,
// ImpedanceTab, ExcursionTab (labelOf, seriesKey, nameFor), VelocityTab,
// InteriorTab, PowerTab, EfficiencyTab, ElecPowerTab, PhaseTab, ChartPanel,
// chartPanelComponent > Wrapped — all marked UNREACHABLE in the spec.

// ---------------------------------------------------------------------------
// chartPanelComponent
// ---------------------------------------------------------------------------

// CONTRACT: "`React.ComponentType|null` — The wrapped panel component, or
// `null` for an unknown id."
// AMBIGUITY: the spec never lists the valid chart ids, so only the unknown-id
// branch is assertable.
test('chartPanelComponent: null for an unknown id', () => {
  assert.equal(chartPanelComponent('definitely-not-a-chart-id'), null)
  assert.equal(chartPanelComponent(''), null)
})

// CONTRACT: "@pure — ... Calling it twice with equal inputs must produce equal
// output and change nothing observable."
// AMBIGUITY: "equal output" for a value documented as a ComponentType can only
// mean the same component, since two freshly built function components are
// never equal to one another. The strictest defensible reading is asserted.
test('chartPanelComponent: @pure — twice with equal inputs gives equal output', () => {
  assert.equal(chartPanelComponent('spl'), chartPanelComponent('spl'))
  assert.equal(chartPanelComponent('nope'), chartPanelComponent('nope'))
})

// ---------------------------------------------------------------------------
// fmt
// ---------------------------------------------------------------------------

// CONTRACT: "Format a chart value, or an em dash when there is nothing to
// show." / "`string` — The formatted number, or `'—'`."
test('fmt: an em dash when there is nothing to show', () => {
  assert.equal(__internals.fmt(null), '—')
  assert.equal(__internals.fmt(undefined), '—')
  assert.equal(__internals.fmt(null, 3), '—')
})

// CONTRACT: "`d` — `number` (optional, default `1`) — Decimal places."
test('fmt: defaults to one decimal place', () => {
  const s = __internals.fmt(1.234)
  assert.equal(typeof s, 'string')
  assert.match(s, /^-?\d+\.\d$/)
  assert.equal(Number(s), 1.2)
})

// CONTRACT: "`d` — `number` — Decimal places." / "`string` — The formatted
// number"
test('fmt: honours the requested decimal places', () => {
  assert.equal(__internals.fmt(1.25, 2), '1.25')
  assert.equal(__internals.fmt(3, 0), '3')
  assert.equal(__internals.fmt(1.23456, 3), '1.235')
  assert.equal(__internals.fmt(-2.5, 1), '-2.5')
})

// CONTRACT: "@pure — ... Calling it twice with equal inputs must produce equal
// output and change nothing observable."
test('fmt: @pure — twice with equal inputs gives equal output', () => {
  assert.equal(__internals.fmt(7.77, 2), __internals.fmt(7.77, 2))
})

// ---------------------------------------------------------------------------
// round5
// ---------------------------------------------------------------------------

// CONTRACT: "Round a dB bound to a multiple of 5, so axis labels land on round
// numbers." / "`up` — `boolean` — Round up rather than down."
test('round5: rounds down to a multiple of 5 when up is false', () => {
  for (const v of [-37, -35, -0.1, 0, 3, 12.5, 101]) {
    const r = __internals.round5(v, false)
    assert.equal(typeof r, 'number')
    assert.equal(r % 5, 0, `${r} should be a multiple of 5`)
    assert.ok(r <= v, `${r} should be at or below ${v}`)
    assert.ok(v - r < 5, `${r} should be within 5 of ${v}`)
  }
  assert.equal(__internals.round5(-37, false), -40)
  assert.equal(__internals.round5(12.5, false), 10)
})

// CONTRACT: "`up` — `boolean` — Round up rather than down."
test('round5: rounds up to a multiple of 5 when up is true', () => {
  for (const v of [-37, -35, -0.1, 0, 3, 12.5, 101]) {
    const r = __internals.round5(v, true)
    assert.equal(r % 5, 0, `${r} should be a multiple of 5`)
    assert.ok(r >= v, `${r} should be at or above ${v}`)
    assert.ok(r - v < 5, `${r} should be within 5 of ${v}`)
  }
  assert.equal(__internals.round5(-37, true), -35)
  assert.equal(__internals.round5(12.5, true), 15)
})

// CONTRACT: "@pure — ... Calling it twice with equal inputs must produce equal
// output and change nothing observable."
test('round5: @pure — twice with equal inputs gives equal output', () => {
  assert.equal(__internals.round5(-37.2, true), __internals.round5(-37.2, true))
  assert.equal(__internals.round5(-37.2, false), __internals.round5(-37.2, false))
})

// ---------------------------------------------------------------------------
// fitDb
// ---------------------------------------------------------------------------

const dbRows = [
  { f: 20, a: 70, b: 60, other: 400 },
  { f: 40, a: 100, b: 95, other: 400 },
  { f: 80, a: 40, b: 30, other: 400 },
]

// CONTRACT: "A useful Y range for a dB curve: a fixed window below the peak."
// CONTRACT: "`windowDb` — `number` (optional, default `45`) — How far below the
// peak to show."
// AMBIGUITY: unlike fitLinear, fitDb documents no padding on the upper bound,
// so the strictest reading is [peak - windowDb, peak]. The peak here is 100 so
// both bounds are already multiples of 5 and any label rounding is a no-op.
test('fitDb: a fixed window below the peak, defaulting to 45 dB', () => {
  assert.deepStrictEqual(__internals.fitDb(dbRows, ['a', 'b']), [55, 100])
})

// CONTRACT: "`windowDb` — `number` — How far below the peak to show."
test('fitDb: honours an explicit window', () => {
  assert.deepStrictEqual(__internals.fitDb(dbRows, ['a', 'b'], 20), [80, 100])
})

// CONTRACT: "`keys` — `string[]` — Series keys to consider."
test('fitDb: considers only the requested series keys', () => {
  // 'other' holds 400 but is not requested, so the peak must come from 'b'.
  assert.deepStrictEqual(__internals.fitDb(dbRows, ['b'], 45), [50, 95])
})

// CONTRACT: "`[number, number]|null` — The domain, or `null` when no data is
// finite."
test('fitDb: null when no data is finite', () => {
  assert.equal(__internals.fitDb([], ['a']), null)
  assert.equal(__internals.fitDb([{ f: 1 }, { f: 2 }], ['a']), null)
  assert.equal(
    __internals.fitDb([{ a: NaN }, { a: Infinity }, { a: -Infinity }], ['a']),
    null,
  )
})

// CONTRACT: "@pure — ... Calling it twice with equal inputs must produce equal
// output and change nothing observable."
test('fitDb: @pure — twice-equal results and unmodified arguments', () => {
  const rows = structuredClone(dbRows)
  const keys = ['a', 'b']
  const before = structuredClone({ rows, keys })
  const a = __internals.fitDb(rows, keys)
  const b = __internals.fitDb(structuredClone(rows), ['a', 'b'])
  assert.deepStrictEqual(a, b)
  assert.deepStrictEqual({ rows, keys }, before)
})

// ---------------------------------------------------------------------------
// fitLinear
// ---------------------------------------------------------------------------

const linRows = [
  { f: 20, a: 1, b: 2, other: 900 },
  { f: 40, a: 5, b: 8, other: 900 },
  { f: 80, a: 3, b: 4, other: 900 },
]

// CONTRACT: "A useful Y range for a linear curve: from a floor to a padded
// maximum." / "`floor` — `number` (optional, default `0`) — Lower bound."
test('fitLinear: from the floor to a padded maximum', () => {
  const d = __internals.fitLinear(linRows, ['a', 'b'])
  assert.ok(Array.isArray(d))
  assert.equal(d.length, 2)
  assert.equal(d[0], 0, 'floor defaults to 0')
  assert.ok(d[1] >= 8, 'upper bound must cover the maximum of the requested keys')
  assert.ok(d[1] > 8, 'the maximum is documented as padded')
})

// CONTRACT: "`floor` — `number` (optional, default `0`) — Lower bound."
test('fitLinear: an explicit floor is the lower bound', () => {
  const d = __internals.fitLinear(linRows, ['a', 'b'], -10)
  assert.equal(d[0], -10)
})

// CONTRACT: "`atLeast` — `number` (optional, default `0`) — Minimum upper
// bound, so a flat trace still gets a sensible axis."
test('fitLinear: the upper bound is at least atLeast', () => {
  const flat = [{ a: 0 }, { a: 0 }, { a: 0 }]
  const d = __internals.fitLinear(flat, ['a'], 0, 10)
  assert.ok(d[1] >= 10, 'a flat trace still gets an axis reaching atLeast')
  const d2 = __internals.fitLinear(linRows, ['a', 'b'], 0, 100)
  assert.ok(d2[1] >= 100)
})

// CONTRACT: "`keys` — `string[]` — Series keys to consider."
test('fitLinear: considers only the requested series keys', () => {
  const d = __internals.fitLinear(linRows, ['a'])
  assert.ok(d[1] >= 5, 'upper bound covers the max of "a"')
  assert.ok(d[1] < 900, 'the unrequested "other" series must not be considered')
})

// CONTRACT: "`[number, number]|null` — The domain, or `null` when no data is
// finite."
test('fitLinear: null when no data is finite', () => {
  assert.equal(__internals.fitLinear([], ['a']), null)
  assert.equal(__internals.fitLinear([{ f: 1 }, { f: 2 }], ['a']), null)
  assert.equal(__internals.fitLinear([{ a: NaN }, { a: Infinity }], ['a']), null)
})

// CONTRACT: "@pure — ... Calling it twice with equal inputs must produce equal
// output and change nothing observable."
test('fitLinear: @pure — twice-equal results and unmodified arguments', () => {
  const rows = structuredClone(linRows)
  const before = structuredClone(rows)
  const a = __internals.fitLinear(rows, ['a', 'b'], 0, 0)
  const b = __internals.fitLinear(structuredClone(rows), ['a', 'b'], 0, 0)
  assert.deepStrictEqual(a, b)
  assert.deepStrictEqual(rows, before)
})

// ---------------------------------------------------------------------------
// nearestIdx
// ---------------------------------------------------------------------------

// CONTRACT: "Index of the sample nearest a frequency, by binary search."
// CONTRACT (precondition): "arr is sorted ascending and holds at least two
// samples" — every case below satisfies it.
test('nearestIdx: index of the nearest sample', () => {
  const arr = [10, 20, 30, 40]
  assert.equal(__internals.nearestIdx(arr, 10), 0)
  assert.equal(__internals.nearestIdx(arr, 21), 1)
  assert.equal(__internals.nearestIdx(arr, 26), 2)
  assert.equal(__internals.nearestIdx(arr, 40), 3)
  assert.equal(__internals.nearestIdx(arr, 39.9), 3)
  // Outside the axis: the nearest sample is still an endpoint.
  assert.equal(__internals.nearestIdx(arr, -100), 0)
  assert.equal(__internals.nearestIdx(arr, 1e6), 3)
})

// CONTRACT: "arr is sorted ascending and holds at least two samples" — the
// minimum satisfying case.
test('nearestIdx: works at the minimum of the precondition range', () => {
  assert.equal(__internals.nearestIdx([5, 9], 5.1), 0)
  assert.equal(__internals.nearestIdx([5, 9], 8.9), 1)
})

// CONTRACT: "`number` — Index of the nearest sample." — a valid index into arr,
// asserted over a non-uniform ascending axis.
test('nearestIdx: returns a valid index of the truly nearest sample', () => {
  const arr = [1, 2, 4, 8, 16, 32, 64, 128]
  for (const f of [1.4, 3, 5, 9, 17, 40, 100, 200]) {
    const i = __internals.nearestIdx(arr, f)
    assert.ok(Number.isInteger(i) && i >= 0 && i < arr.length, `index ${i} in range`)
    const best = arr.reduce(
      (bi, v, vi) => (Math.abs(v - f) < Math.abs(arr[bi] - f) ? vi : bi),
      0,
    )
    assert.equal(i, best, `nearest to ${f}`)
  }
})

// CONTRACT: "@pure — ... Calling it twice with equal inputs must produce equal
// output and change nothing observable."
test('nearestIdx: @pure — twice-equal results and unmodified arguments', () => {
  const arr = [10, 20, 30, 40]
  const before = structuredClone(arr)
  assert.equal(__internals.nearestIdx(arr, 26), __internals.nearestIdx([...before], 26))
  assert.deepStrictEqual(arr, before)
})

// ---------------------------------------------------------------------------
// snapLines
// ---------------------------------------------------------------------------

// CONTRACT: "Series descriptors for the snapshot overlays of one quantity." /
// "`Array<object>` — Line descriptors for `BaseChart`."
// AMBIGUITY: the spec names no field of a line descriptor and no shape for a
// stored snapshot, so only the array-of-objects contract is assertable. The
// "dashed and thinner than the live trace" claim is not testable blind.
test('snapLines: returns an array of line descriptors', () => {
  const out = __internals.snapLines(
    [{ id: 's1', name: 'A', results: {} }, { id: 's2', name: 'B', results: {} }],
    'splCombined',
  )
  assert.ok(Array.isArray(out))
  for (const d of out) {
    assert.equal(typeof d, 'object')
    assert.notEqual(d, null)
  }
})

// CONTRACT: "`snapshots` — `Array<object>` — Stored snapshots."
test('snapLines: no snapshots yields no descriptors', () => {
  assert.deepStrictEqual(__internals.snapLines([], 'splCombined'), [])
})

// CONTRACT: "@pure — ... Calling it twice with equal inputs must produce equal
// output and change nothing observable."
test('snapLines: @pure — twice-equal results and unmodified arguments', () => {
  const snaps = [{ id: 's1', name: 'A', results: {} }]
  const before = structuredClone(snaps)
  const a = __internals.snapLines(snaps, 'splCombined')
  const b = __internals.snapLines(structuredClone(before), 'splCombined')
  assert.deepStrictEqual(a, b)
  assert.deepStrictEqual(snaps, before)
})
