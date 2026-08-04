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
  assert.deepEqual(nodes, before, 'nodes must not be modified')
})

// ---------------------------------------------------------------------------
// metricValue
//
// CONTRACT (constants): "`TOOLBAR_ITEMS` — Every widget the quick bar can show, keyed by id.
// `controls` are interactive and need a matching case in Toolbar.jsx's renderer; `metrics` are
// read-only and need nothing else, because `metricValue` is the single place that knows how to
// compute and format them.
// Keys: `project`, `undo`, `voltage`, `sweep`, `masking`, `snapshot`, `m_f3`, `m_f10`, `m_fb`,
// `m_qtc`, `m_zpeaks`, `m_peakspl`, `m_xfb`, `m_xf3`, `m_bw`, `m_maxpower`, `m_volume`, `m_solve`"
//
// AMBIGUITY: the signature is given as `metricValue(id, arg1)` while the parameter list
// documents the second argument as `ctx`.
// ---------------------------------------------------------------------------

const CONTROL_IDS = ['project', 'undo', 'voltage', 'sweep', 'masking', 'snapshot']
const METRIC_IDS = [
  'm_f3', 'm_f10', 'm_fb', 'm_qtc', 'm_zpeaks', 'm_peakspl',
  'm_xfb', 'm_xf3', 'm_bw', 'm_maxpower', 'm_volume', 'm_solve',
]
const ALL_ITEM_IDS = [...CONTROL_IDS, ...METRIC_IDS]

// CONTRACT (constants): "`DEFAULT_TOOLBAR` — The quick bar as it ships. Values: `project`,
// `undo`, `voltage`, `snapshot`, `m_f3`, `m_f10`, `m_fb`, `m_qtc`, `m_zpeaks`, `m_peakspl`,
// `m_xfb`, `m_xf3`, `m_bw`, `m_maxpower`, `m_volume`, `m_solve`"
const DEFAULT_TOOLBAR = [
  'project', 'undo', 'voltage', 'snapshot', 'm_f3', 'm_f10', 'm_fb', 'm_qtc',
  'm_zpeaks', 'm_peakspl', 'm_xfb', 'm_xf3', 'm_bw', 'm_maxpower', 'm_volume', 'm_solve',
]

const EMPTY_CTX = { metrics: null, results: null, nodes: [] }

// CONTRACT: "`null` when `id` is a control rather than a metric."
test('metricValue: every control returns null', () => {
  for (const id of CONTROL_IDS) {
    assert.equal(metricValue(id, EMPTY_CTX), null, `${id} is a control, not a metric`)
  }
})

// CONTRACT: "`{label: string, value: string, bad?: boolean}|null` — The formatted readout"
// CONTRACT: "`metricValue` is the single place that knows how to compute and format" the metrics
// CONTRACT: "`fmt` — The formatted number, or `'—'` for absent and non-finite values" — an absent
// metric still has a readout, it just reads as an em dash.
test('metricValue: every metric returns the documented readout shape', () => {
  for (const id of METRIC_IDS) {
    const out = metricValue(id, EMPTY_CTX)
    assert.notEqual(out, null, `${id} is a metric and must produce a readout`)
    assert.equal(typeof out, 'object', `${id}: readout must be an object`)
    assert.equal(typeof out.label, 'string', `${id}: label must be a string`)
    assert.ok(out.label.length > 0, `${id}: label must not be empty`)
    assert.equal(typeof out.value, 'string', `${id}: value must be a string`)
    if ('bad' in out && out.bad !== undefined) {
      assert.equal(typeof out.bad, 'boolean', `${id}: bad must be a boolean when present`)
    }
  }
})

// CONTRACT: "`null` when `id` is a control rather than a metric." — an id that is neither is not
// a quick-bar item at all; the readout must not invent one.
test('metricValue: an unknown id produces no readout', () => {
  assert.equal(metricValue('__not_an_item__', EMPTY_CTX), null)
})

// CONTRACT: "`ctx.metrics` — `object|null`" / "`ctx.results` — `object|null`" — nulls are documented inputs
// CONTRACT: "@pure"
test('metricValue: is pure and leaves the context alone', () => {
  const ctx = { metrics: null, results: null, nodes: [{ id: '1', type: 'driver', data: { params: {} } }] }
  const before = clone(ctx)
  for (const id of [...ALL_ITEM_IDS, '__not_an_item__']) {
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
  assert.deepEqual(sanitizeToolbar(['m_f3', '__not_an_item__', 'undo']), ['m_f3', 'undo'])
})

// CONTRACT: "The trust boundary for the stored bar" — hostile entry types cannot survive
test('sanitizeToolbar: non-string entries are dropped', () => {
  assert.deepEqual(sanitizeToolbar([null, undefined, 5, {}, [], true, '__not_an_item__']), [])
  assert.deepEqual(sanitizeToolbar(['m_f3', null, 5, {}, 'undo']), ['m_f3', 'undo'])
})

// CONTRACT: "Clean a persisted quick-bar arrangement." + "`string[]|null` — The surviving ids in
// order" — every known item survives, in the order given.
test('sanitizeToolbar: every known item survives, in order', () => {
  assert.deepEqual(sanitizeToolbar(ALL_ITEM_IDS), ALL_ITEM_IDS)
  const reversed = ALL_ITEM_IDS.slice().reverse()
  assert.deepEqual(sanitizeToolbar(reversed), reversed, 'the caller\'s order must be preserved')
})

// CONTRACT (constants): "`DEFAULT_TOOLBAR` — The quick bar as it ships." — the shipped
// arrangement must itself survive the trust boundary unchanged.
test('sanitizeToolbar: the shipped default arrangement survives unchanged', () => {
  assert.deepEqual(sanitizeToolbar(DEFAULT_TOOLBAR), DEFAULT_TOOLBAR)
})

// CONTRACT (constants): "`DEFAULT_TOOLBAR` — ... Sweep range and resonance masking are
// deliberately absent" — but both are known items, so they survive when a user adds them.
test('sanitizeToolbar: items absent from the default bar are still known items', () => {
  assert.deepEqual(sanitizeToolbar(['sweep', 'masking']), ['sweep', 'masking'])
})

// CONTRACT: "and duplicates removed, so a stale preference cannot render a broken bar."
test('sanitizeToolbar: duplicates are removed, keeping the first occurrence', () => {
  assert.deepEqual(sanitizeToolbar(['m_f3', 'undo', 'm_f3']), ['m_f3', 'undo'])
  assert.deepEqual(sanitizeToolbar(['undo', 'undo', 'undo']), ['undo'])
  assert.deepEqual(
    sanitizeToolbar([...DEFAULT_TOOLBAR, ...DEFAULT_TOOLBAR]),
    DEFAULT_TOOLBAR,
  )
})

// CONTRACT: "and duplicates removed, so a stale preference cannot render a broken bar."
// CONTRACT: "@pure"
test('sanitizeToolbar: the result is a duplicate-free subsequence of the input, and the input is untouched', () => {
  const input = ['m_f3', 'm_f3', 5, null, '__other__', 'undo']
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
