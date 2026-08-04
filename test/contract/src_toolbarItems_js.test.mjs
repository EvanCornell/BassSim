import { test } from 'node:test'
import assert from 'node:assert/strict'
import { systemVolume, metricValue, sanitizeToolbar, __internals } from '../../src/toolbarItems.js'

const clone = (v) => JSON.parse(JSON.stringify(v))

// ---------------------------------------------------------------------------
// systemVolume
// ---------------------------------------------------------------------------

// CONTRACT: "`number` — Volume in litres. 0 when nothing encloses air."
test('systemVolume: an empty graph encloses no air', () => {
  assert.equal(systemVolume([]), 0)
})

// CONTRACT: "0 when nothing encloses air." — only chambers and waveguides contribute
test('systemVolume: nodes that enclose nothing contribute nothing', () => {
  const nodes = [
    { id: '1', type: 'driver', data: { params: {} } },
    { id: '2', type: 'radiation', data: { params: {} } },
  ]
  const v = systemVolume(nodes)
  assert.equal(typeof v, 'number')
  assert.equal(v, 0)
})

// CONTRACT postcondition: "nodes is not modified"
// CONTRACT: "@pure — Calling it twice with equal inputs must produce equal output"
test('systemVolume: is pure and does not modify its nodes', () => {
  const nodes = [
    { id: '1', type: 'chamber', data: { params: { V: 40 } } },
    { id: '2', type: 'waveguide', data: { params: { L: 1, S1: 0.02, S2: 0.05 } } },
    { id: '3', type: 'driver', data: { params: {} } },
  ]
  const before = clone(nodes)
  const a = systemVolume(nodes)
  const b = systemVolume(nodes)
  assert.equal(a, b)
  assert.equal(typeof a, 'number')
  assert.ok(Number.isFinite(a), 'a volume must be a finite number')
  assert.deepEqual(nodes, before, 'nodes must not be modified')
})

// ---------------------------------------------------------------------------
// metricValue
//
// AMBIGUITY: the contract never lists the quick-bar item ids, nor which of them are
// controls rather than metrics, so only the documented return shape can be asserted.
// AMBIGUITY: the signature is given as `metricValue(id, arg1)` while the parameter list
// documents the second argument as `ctx`.
// ---------------------------------------------------------------------------

const EMPTY_CTX = { metrics: null, results: null, nodes: [] }

// CONTRACT: "`{label: string, value: string, bad?: boolean}|null` — The formatted readout, or
// `null` when `id` is a control rather than a metric."
test('metricValue: returns either null or the documented readout shape', () => {
  const ids = ['volume', 'f3', 'spl', 'solveTime', 'xmax', 'undo', 'voltage', 'snapshot', 'not-an-item']
  for (const id of ids) {
    const out = metricValue(id, EMPTY_CTX)
    if (out === null) continue
    assert.equal(typeof out, 'object', `${id}: readout must be an object`)
    assert.equal(typeof out.label, 'string', `${id}: label must be a string`)
    assert.equal(typeof out.value, 'string', `${id}: value must be a string`)
    if ('bad' in out) assert.equal(typeof out.bad, 'boolean', `${id}: bad must be a boolean when present`)
  }
})

// CONTRACT: "`ctx.metrics` — `object|null`" / "`ctx.results` — `object|null`" — nulls are documented inputs
// CONTRACT: "@pure"
test('metricValue: is pure and leaves the context alone', () => {
  const ctx = { metrics: null, results: null, nodes: [{ id: '1', type: 'driver', data: { params: {} } }] }
  const before = clone(ctx)
  for (const id of ['volume', 'f3', 'solveTime', 'not-an-item']) {
    const a = metricValue(id, ctx)
    const b = metricValue(id, ctx)
    assert.deepEqual(a, b, `${id}: two calls must agree`)
  }
  assert.deepEqual(ctx, before, 'the context must not be modified')
})

// ---------------------------------------------------------------------------
// sanitizeToolbar
// ---------------------------------------------------------------------------

// CONTRACT: "`string[]|null` — The surviving ids in order, or `null` when the input was not an array."
test('sanitizeToolbar: a non-array input sanitizes to null', () => {
  for (const hostile of [null, undefined, 0, 42, '', 'volume', true, false, {}, { 0: 'volume', length: 1 }]) {
    assert.equal(sanitizeToolbar(hostile), null, `input ${JSON.stringify(hostile)}`)
  }
})

// CONTRACT: "The surviving ids in order" — an array input always yields an array
test('sanitizeToolbar: an empty array yields an empty array, not null', () => {
  assert.deepEqual(sanitizeToolbar([]), [])
})

// CONTRACT: "unknown ids — from an older build or a renamed item — are dropped"
test('sanitizeToolbar: unknown ids are dropped', () => {
  assert.deepEqual(sanitizeToolbar(['__not_an_item__', '__also_not__']), [])
})

// CONTRACT: "The trust boundary for the stored bar" — hostile entry types cannot survive
test('sanitizeToolbar: non-string entries are dropped', () => {
  assert.deepEqual(sanitizeToolbar([null, undefined, 5, {}, [], true, '__not_an_item__']), [])
})

// CONTRACT: "and duplicates removed, so a stale preference cannot render a broken bar."
// CONTRACT: "@pure"
test('sanitizeToolbar: the result is a duplicate-free subsequence of the input, and the input is untouched', () => {
  const input = ['__not_an_item__', '__not_an_item__', 5, null, '__other__']
  const before = clone(input)
  const a = sanitizeToolbar(input)
  const b = sanitizeToolbar(input)
  assert.deepEqual(a, b, 'two calls must agree')
  assert.ok(Array.isArray(a))
  assert.equal(new Set(a).size, a.length, 'duplicates must be removed')
  a.forEach((id) => assert.ok(input.includes(id), `${id} was not in the input`))
  assert.deepEqual(input, before, 'the input must not be modified')
})

// ---------------------------------------------------------------------------
// __internals.fmt
// ---------------------------------------------------------------------------

// CONTRACT: "`string` — The formatted number, or `'—'` for absent and non-finite values."
test('fmt: absent and non-finite values render as an em dash', () => {
  for (const v of [null, undefined, NaN, Infinity, -Infinity]) {
    assert.equal(__internals.fmt(v), '—', `value ${String(v)}`)
  }
})

// CONTRACT: "`d` — `number` (optional, default `1`) — Decimal places."
test('fmt: formats to one decimal place by default', () => {
  assert.equal(__internals.fmt(1.24), '1.2')
  assert.equal(__internals.fmt(0), '0.0')
})

// CONTRACT: "`d` — Decimal places."
test('fmt: honours an explicit decimal count', () => {
  assert.equal(__internals.fmt(1.25, 2), '1.25')
  assert.equal(__internals.fmt(1.5, 0), '2')
  assert.equal(__internals.fmt(3.14159, 3), '3.142')
})

// CONTRACT: "@pure"
test('fmt: is pure', () => {
  assert.equal(__internals.fmt(2.345, 2), __internals.fmt(2.345, 2))
})
