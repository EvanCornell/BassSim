// Contract tests for src/runs.js — the one kind of stored run, and the views derived from it.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  isLevelRun, dbText, recordLabel, defaultRunName, cleanLevels, packResult, projectInfo,
  TABS, TAB_VIEWS, hasTab, sharedTabs, tabTraces, nearestStart, unreachedAt,
} from '../../src/runs.js'

/** A small result shaped like `levelRun`'s, for a ported box. */
const ported = () => ({
  levelDb: 0,
  freqs: [20, 40, 80],
  rows: [
    { hz: 20, spl: 80, linSpl: 81, cmp: -1, thd: 0.05, h: [-30, -40], xPeak: { d: 6 }, vPeak: { w: 9 }, z: { ch: { mag: 12, phase: 10 } }, pe: 2, efficiency: 0.004, effLoss: -0.5, powerChange: -0.5, linear: { spl: 81, xPeak: { d: 6.5 }, vPeak: { w: 10 } } },
    { hz: 40, failed: true },
    { hz: 80, spl: 90, linSpl: 90, cmp: 0, thd: 0.001, h: [-60, -70], xPeak: { d: 1 }, vPeak: { w: 2 }, z: { ch: { mag: 7, phase: -5 } }, pe: 1, efficiency: 0.01, effLoss: 0, powerChange: 0, linear: { spl: 90, xPeak: { d: 1 }, vPeak: { w: 2 } } },
  ],
  start: [{ hz: 20, dt: 0.001, pressure: [0, 1, 0], excursion: { d: [0, 2, 0] }, velocity: { w: [0, 3, 0] } }, { hz: 80, dt: 0.0005, pressure: [0, 2], excursion: { d: [0, 1] }, velocity: { w: [0, 1] } }],
  maxSpl: [{ hz: 20, levelDb: 4, spl: 100, thd: 0.099 }, { hz: 40, levelDb: null, spl: null }, { hz: 80, levelDb: 40, spl: 130, thd: 0.02, unreached: true }],
})

test('isLevelRun, dbText and naming', () => {
  assert.equal(isLevelRun({ analysis: 'level' }), true)
  assert.equal(isLevelRun({ analysis: 'compression' }), false)
  assert.deepEqual([dbText(6), dbText(0), dbText(-3.5)], ['+6 dB', '0 dB', '−3.5 dB'])
  assert.equal(recordLabel('3'), 'Record 3')
  assert.equal(recordLabel('Tuned'), 'Tuned')
  assert.equal(defaultRunName('Ported 60 L', '2'), 'Ported 60 L · Record 2')
  assert.equal(defaultRunName('', 'Tuned'), 'Untitled · Tuned')
})

test('cleanLevels: numbers, each once, in order', () => {
  assert.deepEqual(cleanLevels([0, '6', 'x', 6, '−3', null]), [0, 6, -3])
})

test('packResult: typed arrays to plain, five significant figures', () => {
  assert.deepEqual(packResult({ a: new Float64Array([1.234567, NaN]), b: [3.14159265], c: 'x' }), { a: [1.2346, null], b: [3.1416], c: 'x' })
})

test('projectInfo: shared names are numbered', () => {
  assert.deepEqual(projectInfo({ nodes: [{ id: 'a', type: 'driver', params: { label: 'W' } }, { id: 'b', type: 'driver', params: { label: 'W' } }] }).names,
    { a: 'W #1', b: 'W #2' })
})

test('projectInfo', () => {
  assert.deepEqual(projectInfo({ nodes: [{ id: 'd', type: 'driver', params: { label: 'Woofer', Xmax: 10 } }, { id: 'c', type: 'chamber', params: {} }] }),
    { names: { d: 'Woofer', c: 'Chamber' }, xmax: { d: 10 } })
})

// CONTRACT: a tab is offered when the run has something for it; with several runs, only the tabs all of them have.
test('hasTab and sharedTabs', () => {
  const p = ported()
  const sealed = { ...ported(), rows: ported().rows.map((r) => ({ ...r, vPeak: {}, linear: r.linear && { ...r.linear, vPeak: {} } })), start: ported().start.map((s) => ({ ...s, velocity: {} })) }
  assert.deepEqual(sharedTabs([p]), TABS.map((t) => t[0]))
  assert.equal(hasTab('velocity', sealed), false)
  assert.equal(sharedTabs([p, sealed]).includes('velocity'), false)
  assert.equal(sharedTabs([p, sealed]).includes('excursion'), true)
  assert.deepEqual(sharedTabs([]), [])
  assert.equal(hasTab('output', null), false)
})

// CONTRACT: every tab view yields traces across frequency, failed points left out, the linear model dashed.
test('tabTraces: each tab', () => {
  const p = ported()
  const out = tabTraces('output', 'spl', p)
  assert.deepEqual(out.map((t) => [t.key, t.x, t.y, !!t.dash]), [['spl', [20, 80], [80, 90], false], ['lin', [20, 80], [81, 90], true]])
  assert.deepEqual(tabTraces('compression', 'cmp', p)[0].y, [-1, 0])
  assert.deepEqual(tabTraces('distortion', 'thd', p)[0].y, [5, 0.1])
  assert.deepEqual(tabTraces('distortion', 'h3', p)[0].y, [-40, -70])
  const x = tabTraces('excursion', 'xPeak', p, { d: 'Woofer' })
  assert.deepEqual(x.map((t) => [t.key, t.y, !!t.dash]), [['d', [6, 1], false], ['d:lin', [6.5, 1], true]])
  assert.equal(x[0].label, '', 'one driver needs no name')
  assert.deepEqual(tabTraces('impedance', 'zMag', p)[0].y, [12, 7])
  assert.deepEqual(tabTraces('power', 'efficiency', p)[0].y, [0.4, 1])
  const m = tabTraces('maxspl', 'spl', p)[0]
  assert.deepEqual([m.x, m.y, m.marker], [[20, 80], [100, 130], true])
  assert.deepEqual(unreachedAt(p), [80])
  for (const [tab, views] of Object.entries(TAB_VIEWS)) for (const [v] of views) assert.ok(Array.isArray(tabTraces(tab, v, p)), `${tab}/${v}`)
})

test('waveforms: the nearest tone, in ms', () => {
  const p = ported()
  assert.equal(nearestStart(p, 70).hz, 80)
  assert.equal(nearestStart(p).hz, 20)
  const w = tabTraces('waveforms', 'excursion', p, {}, 25)
  assert.deepEqual([w[0].x, w[0].y], [[0, 1, 2], [0, 2, 0]])
  assert.equal(nearestStart({}, 40), null)
})
