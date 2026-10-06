// Contract tests for src/runs.js — what a time-domain run is and holds.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  jobOf, runTitle, dbText, expandVary, applyVars, varyChoices, packResult, projectInfo,
  runPoints, headline, runTraces, differenceOf, hasQuantity, drivePreview, optsOf,
} from '../../src/runs.js'

const project = {
  params: [{ name: 'Vb', value: 60 }],
  nodes: [
    { id: 'd', type: 'driver', params: { label: 'Woofer', Xmax: 10, Bl: 15, Mms: 100, Cms: 0.3, Rms: 2, Sd: 500, Re: 4, Fs: 29, Qts: 0.4 } },
    { id: 'c', type: 'chamber', params: { label: 'Box', volume: 60 } },
  ],
}

test('jobOf and optsOf', () => {
  assert.deepEqual(jobOf('transient'), { kind: 'transient' })
  assert.deepEqual(jobOf('thd'), { kind: 'distortion', mode: 'thd' })
  const settings = { transient: { levelDb: 3, signal: { type: 'burst', hz: 40 } }, distortion: { mode: 'harmonics', hz: 50 } }
  assert.equal(optsOf('compression', settings).mode, 'compression')
  assert.notEqual(optsOf('transient', settings).signal, settings.transient.signal, 'a copy')
})

test('runTitle and dbText', () => {
  assert.equal(dbText(6), '+6 dB')
  assert.equal(dbText(-3), '−3 dB')
  assert.equal(runTitle('transient', { levelDb: 6, signal: { type: 'burst', hz: 40, cycles: 6.5 } }), 'Burst 40 Hz × 6.5 · +6 dB')
  assert.equal(runTitle('transient', { levelDb: 6, signal: { type: 'burst', hz: 40, cycles: 6.5 } }, ['level']), 'Burst 40 Hz × 6.5')
  assert.equal(runTitle('thd', { levelDb: 0, f1: 20, f2: 200 }), 'THD 20–200 Hz · 0 dB')
  assert.equal(runTitle('compression', { levels: [-6, 0, 9] }), 'Compression −6 … +9 dB')
})

// CONTRACT: every combination, the first setting varying slowest.
test('expandVary', () => {
  assert.deepEqual(expandVary([]), [{}])
  assert.deepEqual(expandVary([{ key: 'level', values: [0, 6] }, { key: 'hz', values: [30, 40] }]),
    [{ level: 0, hz: 30 }, { level: 0, hz: 40 }, { level: 6, hz: 30 }, { level: 6, hz: 40 }])
})

test('applyVars: level, frequency, named params and node params', () => {
  const o = { levelDb: 0, signal: { type: 'burst', hz: 40 } }
  const r = applyVars(project, o, 'transient', { level: 6, hz: 30, 'param:Vb': 40, 'node:c:volume': 30, 'node:d:Bl': 20 })
  assert.equal(r.opts.levelDb, 6)
  assert.equal(r.opts.signal.hz, 30)
  assert.equal(o.signal.hz, 40, 'the options passed in are not changed')
  assert.equal(r.project.params[0].value, 40)
  assert.equal(r.project.nodes[1].params.volume, 30)
  const d = r.project.nodes[0].params
  assert.equal(d.Bl, 20)
  assert.notEqual(d.Qts, 0.4, 'derived parameters follow')
  assert.equal(project.nodes[0].params.Bl, 15)
})

test('varyChoices', () => {
  const keys = varyChoices(project, 'transient', { levelDb: 0, signal: { type: 'burst', hz: 40 } }).map((c) => c.key)
  assert.ok(keys.includes('level') && keys.includes('hz') && keys.includes('param:Vb') && keys.includes('node:c:volume') && keys.includes('node:d:Bl'))
  assert.ok(!keys.includes('node:d:Qts'), 'derived driver parameters are not offered')
  assert.ok(!varyChoices(project, 'compression', {}).some((c) => c.key === 'level'), 'compression already spans levels')
})

test('packResult: typed arrays to plain, six significant figures', () => {
  const p = packResult({ a: new Float64Array([1 / 3, 2]), b: { c: Math.PI, d: 'x' }, e: [NaN] })
  assert.deepEqual(p, { a: [0.333333, 2], b: { c: 3.14159, d: 'x' }, e: [null] })
})

const transient = {
  run: {
    t: [0, 0.001, 0.002], pressure: [0, 2, -1], excursion: { d: [0, 12, -3] }, current: { ch1: [0, 1, -4] },
    voltage: { ch1: [0, 1, 1] }, velocity: { w: [0, 5, -6] }, probes: {},
  },
  linear: { t: [0, 0.001, 0.002], pressure: [0, 4, -1], excursion: { d: [0, 14, -3] }, current: { ch1: [0, 1, 1] }, voltage: {}, velocity: {}, probes: {} },
  fs: 1000,
}

test('runPoints and headline: a transient run', () => {
  const info = projectInfo(project)
  assert.deepEqual(info.xmax, { d: 10 })
  const pts = runPoints('transient', { levelDb: 6, signal: { type: 'burst', hz: 40 } }, transient, info, { 'param:Vb': 40 })
  assert.equal(pts.length, 1)
  assert.deepEqual(pts[0].vars, { level: 6, hz: 40, 'param:Vb': 40 })
  assert.equal(pts[0].m.xPeak, 12)
  assert.equal(pts[0].m.xOver, 1.2)
  assert.equal(pts[0].m.vPeak, 6)
  assert.equal(pts[0].m.iPeak, 4)
  assert.ok(Math.abs(pts[0].m.cmp - 20 * Math.log10(0.5)) < 1e-9)
  assert.deepEqual(headline('transient', pts), { text: '12.0 mm', bad: true })
})

test('runPoints: compression is a point per frequency and level', () => {
  const at = (cmp) => ({ spl: 90, cmp, thd: 0.01, xPeak: { d: 5 }, vPeak: {}, z: { ch1: { mag: 6 } }, pe: 1, pa: 0.01, efficiency: 0.01, effLoss: -1, powerChange: 0.5 })
  const res = { levels: [0, 6], rows: [{ hz: 30, at: { 0: at(-0.5), 6: at(-2) } }, { hz: 40, at: { 0: at(-0.2), 6: null } }] }
  const pts = runPoints('compression', { levels: [0, 6] }, res, projectInfo(project))
  assert.equal(pts.length, 3)
  assert.deepEqual(pts.map((p) => [p.vars.hz, p.vars.level, p.m.cmp]), [[30, 0, -0.5], [30, 6, -2], [40, 0, -0.2]])
  assert.equal(pts[0].m.thd, 1)
  assert.equal(pts[0].m.pa, 10)
  assert.deepEqual(headline('compression', pts), { text: '−2.0 dB', bad: false })
  // a frequency figure, one trace per level
  const meta = { analysis: 'compression', points: pts }
  assert.ok(hasQuantity(meta, 'm:cmp'))
  const tr = runTraces(meta, null, 'm:cmp')
  assert.deepEqual(tr.map((t) => [t.name, t.x, t.y]), [['0 dB', [30, 40], [-0.5, -0.2]], ['+6 dB', [30], [-2]]])
})

test('runTraces: waveforms, with the linear run dashed', () => {
  const meta = { analysis: 'transient', info: { names: { d: 'Woofer' } } }
  const data = { result: transient }
  const x = runTraces(meta, data, 'excursion')
  assert.deepEqual(x.map((t) => [t.name, !!t.dash]), [['Woofer', false], ['Woofer linear', true]])
  assert.deepEqual(x[0].x, [0, 1, 2])
  assert.equal(runTraces(meta, data, 'pressure').length, 2)
  assert.deepEqual(runTraces(meta, null, 'pressure'), [], 'nothing without results')
})

test('differenceOf: b − a on a’s points', () => {
  assert.deepEqual(differenceOf({ x: [0, 1, 2, 3], y: [0, 0, 0, 0] }, { x: [0.5, 2.5], y: [1, 3] }), { x: [1, 2], y: [1.5, 2.5] })
})

test('drivePreview: a burst at the channel level', () => {
  const p = drivePreview({ levelDb: 0, duration: 0.5, signal: { type: 'burst', hz: 40, cycles: 6.5 } }, 2.83)
  assert.equal(p.ms.length, 400)
  const peak = Math.max(...p.v.map(Math.abs))
  assert.ok(peak > 3.9 && peak <= 4.01, `peak ${peak}`)
})
