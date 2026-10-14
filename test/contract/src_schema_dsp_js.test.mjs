// Contract tests for src/schema/dsp.js.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  DEFAULT_DSP, PASS_SLOPES, MUTE_SCALE, fitSlope, normalizeDsp, dspFilters, dspScale, dspSections, isFlat, dspResponse,
} from '../../src/schema/dsp.js'

const on = (patch) => ({ ...normalizeDsp(), ...patch })

test('normalizeDsp: nothing is the flat default', () => {
  assert.deepEqual(normalizeDsp(), DEFAULT_DSP)
  assert.deepEqual(normalizeDsp(null), DEFAULT_DSP)
  assert.ok(isFlat(normalizeDsp()))
  const d = normalizeDsp({ hpf: { on: true, hz: 30 } })
  assert.deepEqual(d.hpf, { on: true, shape: 'butterworth', slope: 24, hz: 30 })
  assert.equal(d.lpf.on, false)
})

// CONTRACT (fitSlope): "the nearest at or above the one asked for".
test('fitSlope: Linkwitz-Riley takes only even orders', () => {
  assert.equal(fitSlope('linkwitz-riley', 18), 24)
  assert.equal(fitSlope('linkwitz-riley', 6), 12)
  assert.equal(fitSlope('butterworth', 18), 18)
  assert.equal(fitSlope('bessel', 99), 48)
  assert.deepEqual(PASS_SLOPES['linkwitz-riley'], [12, 24, 36, 48])
})

// CONTRACT (dspFilters): "in the order they run".
test('dspFilters: crossovers, transform, then the bands switched on', () => {
  const d = on({
    hpf: { on: true, shape: 'bessel', slope: 18, hz: 25 },
    lt: { on: true, f0: 40, q0: 1, fp: 25, qp: 0.6 },
    peq: [{ id: 'b1', on: true, type: 'peak', hz: 50, db: -3, q: 2 }, { id: 'b2', on: false, type: 'notch', hz: 60, db: 0, q: 4 }],
  })
  assert.deepEqual(dspFilters(d).map((f) => f.type), ['highpass', 'transform', 'peq'])
  assert.equal(dspFilters(d)[0].order, 3)
  assert.deepEqual(dspFilters(d, { pass: false }).map((f) => f.type), ['transform', 'peq'])
  assert.equal(dspSections(d).length, 4)
})

test('dspScale: gain, polarity and mute as one factor', () => {
  assert.equal(dspScale(on({})), 1)
  assert.ok(Math.abs(dspScale(on({ gainDb: 6, invert: true })) + 10 ** (6 / 20)) < 1e-12)
  assert.equal(dspScale(on({ mute: true })), MUTE_SCALE)
  assert.ok(!isFlat(on({ invert: true })))
  assert.ok(!isFlat(on({ delayMs: 1 })))
})

// CONTRACT (dspSections): "@throws ... Naming the stage".
test('dspSections: an out-of-range stage is named', () => {
  assert.throws(() => dspSections(on({ lpf: { on: true, shape: 'butterworth', slope: 12, hz: 0 } })), /low-pass/)
})

// CONTRACT (dspResponse): magnitude and phase of the whole block.
test('dspResponse: gain, polarity, delay and filters together', () => {
  const r = dspResponse(on({ gainDb: -6, invert: true }), [100])
  assert.ok(Math.abs(r.db[0] + 6) < 1e-9)
  assert.ok(Math.abs(Math.abs(r.phase[0]) - 180) < 1e-9)
  const late = dspResponse(on({ delayMs: 1 }), [125])
  assert.ok(Math.abs(Math.abs(late.phase[0]) - 45) < 1e-6, '1 ms is 45° at 125 Hz')
  const hp = dspResponse(on({ hpf: { on: true, shape: 'linkwitz-riley', slope: 24, hz: 80 } }), [80, 8000])
  assert.ok(Math.abs(hp.db[0] + 6.0206) < 1e-3 && Math.abs(hp.db[1]) < 0.01)
})
