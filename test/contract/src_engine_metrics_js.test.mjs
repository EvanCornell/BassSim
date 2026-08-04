import { test } from 'node:test'
import assert from 'node:assert/strict'
import { computeMetrics, __internals } from '../../src/engine/metrics.js'
import { runSimulation } from '../../src/engine/solver.js'

const { localMaxima } = __internals

// UNREACHABLE — not covered:
//   computeMetrics > findFx(drop)
//   computeMetrics > atFreq(f)

// --- fixtures ----------------------------------------------------------
// `res` is documented as "A result from `runSimulation`", so the fixture is a
// real sweep. The node/edge shapes come from the solver contract's parameter
// documentation; the handle names are not documented anywhere in the pack.
const DRIVER_PARAMS = {
  Re: 6, Le: 1, Bl: 10, Sd: 500, Mms: 100, Cms: 0.2,
  Rms: 2, Fs: 30, Xmax: 8, Q: 5, count: 1, wiring: 'single',
}

function sweep(settings = {}) {
  const nodes = [
    { id: 'd1', type: 'driver', data: { params: { ...DRIVER_PARAMS } } },
    { id: 'r1', type: 'radiation', data: { params: {} } },
    { id: 'r2', type: 'radiation', data: { params: {} } },
  ]
  const edges = [
    { source: 'd1', sourceHandle: 'front', target: 'r1', targetHandle: 'in' },
    { source: 'd1', sourceHandle: 'rear', target: 'r2', targetHandle: 'in' },
  ]
  return runSimulation(nodes, edges, { npts: 128, ...settings })
}

const METRIC_KEYS = [
  'passband', 'peakSPL', 'f3', 'f10', 'bwHz', 'bwOct', 'zPeaks', 'fb', 'fbZ',
  'fc', 'qtc', 'xPeak', 'xPeakF', 'xAtFb', 'xAtF3', 'xRatioPeak', 'xRatioPeakF',
  'xLimitDriver', 'maxPower', 'vMax',
]

// CONTRACT: "The exceptions are `f3`, `f10`, `xPeakF`, `xAtFb` and `xAtF3`,
//            which are always present and carry `null` when undefined"
const NULLABLE_KEYS = ['f3', 'f10', 'xPeakF', 'xAtFb', 'xAtF3']

// ======================================================================
// Exported constants
// ======================================================================

// CONTRACT (exported constants): "### `__internals`  Keys: `localMaxima`"
test('__internals: publishes exactly the documented keys', () => {
  assert.deepEqual(Object.keys(__internals).sort(), ['localMaxima'])
  assert.equal(typeof __internals.localMaxima, 'function')
})

// ======================================================================
// computeMetrics(res, settings)
// ======================================================================

// CONTRACT: "`res` — `object|null` — A result from `runSimulation`."
// CONTRACT: "`object|null` — Metrics ... or `null` when the sweep failed or is
//            empty."
test('computeMetrics: null when there is no result', () => {
  assert.equal(computeMetrics(null, {}), null)
})

// CONTRACT: "or `null` when the sweep failed or is empty"
test('computeMetrics: null when the sweep failed', () => {
  const failed = runSimulation([], [], {})
  assert.equal(failed.ok, false)
  assert.equal(computeMetrics(failed, {}), null)
})

// CONTRACT: "or `null` when the sweep failed or is empty"
test('computeMetrics: null when the sweep is empty', () => {
  assert.equal(computeMetrics({ ok: true, freqs: [], splCombined: [] }, {}), null)
})

// CONTRACT: "Metrics — any of `passband`, `peakSPL`, `f3`, `f10`, `bwHz`,
//            `bwOct`, `zPeaks`, `fb`, `fbZ`, `fc`, `qtc`, `xPeak`, `xPeakF`,
//            `xAtFb`, `xAtF3`, `xRatioPeak`, `xRatioPeakF`, `xLimitDriver`,
//            `maxPower`, `vMax`"
test('computeMetrics: returns only documented fields', () => {
  const m = computeMetrics(sweep(), {})
  assert.equal(typeof m, 'object')
  assert.notEqual(m, null)
  for (const k of Object.keys(m)) {
    assert.ok(METRIC_KEYS.includes(k), `undocumented metric field: ${k}`)
  }
})

// CONTRACT: "Most fields are simply absent when the topology does not define
//            them, so a sealed box has no `fb` key at all. The exceptions are
//            `f3`, `f10`, `xPeakF`, `xAtFb` and `xAtF3`, which are always
//            present and carry `null` when undefined"
test('computeMetrics: the five nullable fields are always present', () => {
  const m = computeMetrics(sweep(), {})
  for (const k of NULLABLE_KEYS) {
    assert.ok(Object.hasOwn(m, k), `${k} should always be present`)
  }
})

// CONTRACT: "Most fields are simply absent when the topology does not define
//            them ... The exceptions are `f3`, `f10`, `xPeakF`, `xAtFb` and
//            `xAtF3`, which are always present and carry `null` when undefined"
test('computeMetrics: only the five documented exceptions may be null', () => {
  const m = computeMetrics(sweep(), {})
  for (const [k, v] of Object.entries(m)) {
    if (NULLABLE_KEYS.includes(k)) continue
    assert.notEqual(v, null, `${k} is null; it should be absent instead`)
    assert.notEqual(v, undefined, `${k} is undefined; it should be absent instead`)
  }
})

// CONTRACT: "`xAtFb` is null for a sealed box because it is looked up at a
//            tuning that does not exist."
test('computeMetrics: xAtFb is null when there is no tuning to look it up at', () => {
  const m = computeMetrics(sweep(), {})
  if (!Object.hasOwn(m, 'fb')) {
    assert.equal(m.xAtFb, null, 'no fb means xAtFb has no tuning to be read at')
  }
})

// CONTRACT: "Passband level is the median of the top quartile of SPL rather than
//            the peak" — so passband can never exceed the peak.
test('computeMetrics: passband never exceeds peakSPL', () => {
  const m = computeMetrics(sweep(), {})
  if (Object.hasOwn(m, 'passband') && Object.hasOwn(m, 'peakSPL')) {
    assert.equal(typeof m.passband, 'number')
    assert.equal(typeof m.peakSPL, 'number')
    assert.ok(m.passband <= m.peakSPL, `${m.passband} > ${m.peakSPL}`)
  }
})

// CONTRACT: "F3 and F10 are then found by linear interpolation at the first
//            upward crossing of that reference." — F10 is a deeper drop, so it
//            can never sit above F3.
// f3 and f10 are always-present nullable fields, so the ordering claim applies
// only where both are actually defined.
test('computeMetrics: f10 is never above f3', () => {
  const m = computeMetrics(sweep(), {})
  if (typeof m.f3 === 'number' && typeof m.f10 === 'number') {
    assert.ok(m.f10 <= m.f3, `f10 ${m.f10} > f3 ${m.f3}`)
  }
})

// CONTRACT: "The impedance peak count decides how the box is interpreted: two
//            peaks mean a vented alignment, so the minimum between them is the
//            tuning `fb`; one peak means sealed, so it is `fc`"
test('computeMetrics: fb appears only with two impedance peaks, fc only with one', () => {
  const m = computeMetrics(sweep(), {})
  assert.ok(Object.hasOwn(m, 'zPeaks'), 'zPeaks should be reported')
  if (m.zPeaks === 2) {
    assert.ok(Object.hasOwn(m, 'fb'), 'two impedance peaks should give fb')
    assert.equal(Object.hasOwn(m, 'fc'), false, 'two peaks is not a sealed box')
  } else if (m.zPeaks === 1) {
    assert.ok(Object.hasOwn(m, 'fc'), 'one impedance peak should give fc')
    assert.equal(Object.hasOwn(m, 'fb'), false, 'one peak is not a vented box')
  } else {
    assert.equal(Object.hasOwn(m, 'fb'), false)
    assert.equal(Object.hasOwn(m, 'fc'), false)
  }
})

// CONTRACT: "one peak means sealed, so it is `fc` and `qtc` follows from the
//            exact second-order high-pass relation between fc and F3."
test('computeMetrics: qtc accompanies fc, never appears without it', () => {
  const m = computeMetrics(sweep(), {})
  if (Object.hasOwn(m, 'qtc')) assert.ok(Object.hasOwn(m, 'fc'))
})

// CONTRACT: "`settings.voltage` — `number` _(optional, default `2.83`)_ — Drive
//            voltage the sweep was run at, V RMS."
test('computeMetrics: voltage defaults to 2.83', () => {
  const res = sweep()
  assert.deepEqual(computeMetrics(res, {}), computeMetrics(res, { voltage: 2.83 }))
})

// CONTRACT: "Maximum power before Xmax is driven by the per-driver headroom
//            ratio ... it falls back to a single global Xmax for results
//            produced before that ratio existed."
// CONTRACT: "`settings.xmax` — used only when the result carries no per-driver
//            ratio."
test('computeMetrics: settings.xmax is ignored when the result carries a per-driver ratio', () => {
  const res = sweep()
  assert.ok(Object.hasOwn(res, 'excursionRatio'), 'the sweep should carry excursionRatio')
  assert.deepEqual(computeMetrics(res, { xmax: 1 }), computeMetrics(res, {}))
  assert.deepEqual(computeMetrics(res, { xmax: 999 }), computeMetrics(res, {}))
})

// CONTRACT: "@post res and settings are not modified"
test('computeMetrics: res and settings are not modified', () => {
  const res = sweep()
  const settings = { voltage: 5, xmax: 6 }
  const resBefore = structuredClone(res)
  const settingsBefore = structuredClone(settings)
  computeMetrics(res, settings)
  assert.deepEqual(res, resBefore)
  assert.deepEqual(settings, settingsBefore)
})

// CONTRACT: "@pure — ... Calling it twice with equal inputs must produce equal
//            output and change nothing observable."
test('computeMetrics: @pure — two calls with equal inputs produce equal output', () => {
  const res = sweep()
  const a = computeMetrics(res, { voltage: 2.83 })
  const b = computeMetrics(structuredClone(res), { voltage: 2.83 })
  assert.deepEqual(a, b)
})

// ======================================================================
// __internals.localMaxima(freqs, vals, minProminence)
// ======================================================================

// CONTRACT: "`Array<{f: number, v: number, i: number}>` — Surviving peaks in
//            ascending frequency order, each with its frequency, value and
//            sample index."
test('localMaxima: returns {f, v, i} entries drawn from the input arrays', () => {
  const freqs = Array.from({ length: 14 }, (_, i) => 20 * Math.pow(1.5, i))
  const vals = freqs.map(() => 0)
  vals[5] = 3
  const peaks = localMaxima(freqs, vals)
  assert.ok(Array.isArray(peaks))
  assert.equal(peaks.length, 1)
  assert.equal(peaks[0].i, 5)
  assert.equal(peaks[0].f, freqs[5])
  assert.equal(peaks[0].v, vals[5])
})

// CONTRACT: "Surviving peaks in ascending frequency order"
test('localMaxima: peaks come back in ascending frequency order', () => {
  const freqs = Array.from({ length: 20 }, (_, i) => 20 * Math.pow(1.4, i))
  const vals = freqs.map(() => 0)
  vals[5] = 3
  vals[11] = 5
  vals[16] = 4
  const peaks = localMaxima(freqs, vals)
  assert.equal(peaks.length, 3)
  for (let i = 1; i < peaks.length; i++) {
    assert.ok(peaks[i].f > peaks[i - 1].f)
  }
})

// CONTRACT: "a peak must rise `minProminence` above the lowest point within ±40
//            samples"
// CONTRACT: "`minProminence` — `number` _(optional, default `1`)_ — Minimum rise
//            above the local floor, in the units of `vals`."
test('localMaxima: minProminence defaults to 1 and rejects a shallower rise', () => {
  const freqs = Array.from({ length: 14 }, (_, i) => 20 * Math.pow(1.5, i))
  const vals = freqs.map(() => 0)
  vals[6] = 0.5 // rises only 0.5 above the local floor of 0
  assert.deepEqual(localMaxima(freqs, vals), [])
  assert.deepEqual(localMaxima(freqs, vals, 1), localMaxima(freqs, vals))
  const kept = localMaxima(freqs, vals, 0.4)
  assert.equal(kept.length, 1)
  assert.equal(kept[0].i, 6)
})

// CONTRACT: "peaks closer together than 5% in frequency are merged to the taller
//            one"
test('localMaxima: peaks within 5% in frequency merge to the taller one', () => {
  const freqs = Array.from({ length: 14 }, (_, i) => 100 + i * 0.5) // ~1% apart
  const vals = freqs.map(() => 0)
  vals[5] = 2
  vals[7] = 3
  const peaks = localMaxima(freqs, vals)
  assert.equal(peaks.length, 1)
  assert.equal(peaks[0].i, 7)
  assert.equal(peaks[0].v, 3)
})

// CONTRACT: "peaks closer together than 5% in frequency are merged" — peaks
// further apart than that survive separately.
test('localMaxima: peaks far apart in frequency are both kept', () => {
  const freqs = Array.from({ length: 14 }, (_, i) => 20 * Math.pow(1.5, i))
  const vals = freqs.map(() => 0)
  vals[5] = 2
  vals[7] = 3
  const peaks = localMaxima(freqs, vals)
  assert.equal(peaks.length, 2)
  assert.deepEqual(peaks.map((p) => p.i), [5, 7])
})

// CONTRACT: "The first and last two samples are skipped, so a curve that is
//            still rising at the edge of the sweep reports no peak there rather
//            than a false one."
test('localMaxima: the first and last two samples never report a peak', () => {
  const freqs = Array.from({ length: 14 }, (_, i) => 20 * Math.pow(1.5, i))
  for (const i of [0, 1, 12, 13]) {
    const vals = freqs.map(() => 0)
    vals[i] = 5
    assert.deepEqual(localMaxima(freqs, vals), [], `sample ${i} should be skipped`)
  }
  // the first sample that is not skipped does report
  const vals = freqs.map(() => 0)
  vals[2] = 5
  assert.equal(localMaxima(freqs, vals).length, 1)
})

// CONTRACT: "@post freqs and vals are not modified"
test('localMaxima: freqs and vals are not modified', () => {
  const freqs = Array.from({ length: 14 }, (_, i) => 20 * Math.pow(1.5, i))
  const vals = freqs.map(() => 0)
  vals[5] = 2
  vals[9] = 3
  const fb = structuredClone(freqs)
  const vb = structuredClone(vals)
  localMaxima(freqs, vals, 1)
  assert.deepEqual(freqs, fb)
  assert.deepEqual(vals, vb)
})

// CONTRACT: "@pure — ... Calling it twice with equal inputs must produce equal
//            output and change nothing observable."
test('localMaxima: @pure — two calls with equal inputs produce equal output', () => {
  const freqs = Array.from({ length: 20 }, (_, i) => 20 * Math.pow(1.3, i))
  const vals = freqs.map((f) => Math.sin(f / 40) + 1)
  assert.deepEqual(localMaxima(freqs, vals, 0.5),
    localMaxima(structuredClone(freqs), structuredClone(vals), 0.5))
})
