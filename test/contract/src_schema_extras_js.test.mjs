// Contract tests for src/schema/extras.js.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { pruneLoad, pruneExtras, valueOf, driveOf, masterForVoltage, freshId } from '../../src/schema/extras.js'

// CONTRACT: "Remove every leaf naming a driver that is not in a set, and any
// group left empty" — "an empty explicit tree stays an empty `{parallel: []}`".
test('pruneLoad: drops missing drivers and empty groups', () => {
  const tree = { parallel: [{ driver: 'a' }, { series: [{ driver: 'b' }, { driver: 'c' }] }, { series: [{ driver: 'd' }] }] }
  assert.deepEqual(pruneLoad(tree, new Set(['a', 'c'])), { parallel: [{ driver: 'a' }, { series: [{ driver: 'c' }] }] })
  assert.deepEqual(pruneLoad(tree, new Set()), { parallel: [] })
  assert.equal(pruneLoad(null, new Set()), null, 'the catch-all stays the catch-all')
})

// CONTRACT (pruneExtras): wiring leaves and probes of deleted nodes go.
test('pruneExtras: forgets deleted nodes', () => {
  const ex = {
    params: [{ name: 'x', value: 1 }],
    wiring: { masterDb: 0, channels: [{ id: 'c', load: { parallel: [{ driver: 'a' }, { driver: 'gone' }] } }, { id: 'd', load: null }] },
    probes: [{ id: 'p1', at: { node: 'a' } }, { id: 'p2', at: { node: 'gone' } }],
  }
  const out = pruneExtras(ex, ['a'])
  assert.deepEqual(out.wiring.channels[0].load, { parallel: [{ driver: 'a' }] })
  assert.equal(out.wiring.channels[1].load, null)
  assert.deepEqual(out.probes.map((p) => p.id), ['p1'])
  assert.equal(out.params, ex.params)
  assert.equal(ex.probes.length, 2, 'the input is not modified')
})

// CONTRACT (valueOf, driveOf): expressions resolve against the named params.
test('driveOf: the first channel at the master level', () => {
  const params = [{ name: 'V', value: 10 }]
  const w = { masterDb: -6, channels: [{ id: 'c', volts: 'V * 2', outputOhms: 0.5 }] }
  const d = driveOf(w, params)
  assert.ok(Math.abs(d.voltage - 20 * Math.pow(10, -6 / 20)) < 1e-12)
  assert.equal(d.rg, 0.5)
  assert.ok(Number.isNaN(valueOf('nope + 1', {})))
  assert.equal(valueOf(3, {}), 3)
})

// CONTRACT (masterForVoltage): "The master level that brings the first channel
// to a voltage" — the channels themselves keep their levels; zero is −120 dB.
test('masterForVoltage: moves only the master', () => {
  const w = { masterDb: 0, channels: [{ id: 'a', volts: 2 }, { id: 'b', volts: 4 }] }
  const out = masterForVoltage(w, [], 4)
  assert.ok(Math.abs(out.masterDb - 20 * Math.log10(2)) < 1e-12)
  assert.deepEqual(out.channels, w.channels)
  assert.equal(masterForVoltage(w, [], 0).masterDb, -120)
  assert.equal(masterForVoltage(w, [], -1), w)
  assert.equal(masterForVoltage({ channels: [{ volts: 0 }] }, [], 5).masterDb, undefined)
})

// CONTRACT: "`prefix` followed by the lowest free number from 1".
test('freshId: the lowest free number', () => {
  assert.equal(freshId('t', []), 't1')
  assert.equal(freshId('t', ['t1', 't3']), 't2')
})
