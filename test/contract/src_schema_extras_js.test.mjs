// Contract tests for src/schema/extras.js.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { pruneExtras, valueOf, driveOf, masterForVoltage, freshId } from '../../src/schema/extras.js'

// CONTRACT (pruneExtras): cables and places of deleted drivers go, as do probes on deleted nodes.
test('pruneExtras: forgets deleted nodes', () => {
  const ex = {
    params: [{ name: 'x', value: 1 }],
    wiring: {
      masterDb: 0,
      channels: [{ id: 'c' }],
      wires: [{ a: 'ch:c:+', b: 'a:+' }, { a: 'ch:c:+', b: 'gone:+' }, { a: 'a:-', b: 'gone:1A:-' }],
      layout: { a: { x: 1, y: 2 }, gone: { x: 3, y: 4 } },
    },
    probes: [{ id: 'p1', at: { node: 'a' } }, { id: 'p2', at: { node: 'gone' } }],
  }
  const out = pruneExtras(ex, ['a'])
  assert.deepEqual(out.wiring.wires, [{ a: 'ch:c:+', b: 'a:+' }])
  assert.deepEqual(out.wiring.layout, { a: { x: 1, y: 2 } })
  assert.deepEqual(out.probes.map((p) => p.id), ['p1'])
  assert.equal(out.params, ex.params)
  assert.equal(ex.probes.length, 2, 'the input is not modified')
})

// CONTRACT (valueOf, driveOf): expressions resolve against the named params.
test('driveOf: the toolbar channel at the master level', () => {
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

// CONTRACT: the drive follows the channel named by `toolbar`, else the first.
test('driveOf and masterForVoltage: follow the toolbar channel', () => {
  const w = { masterDb: 0, toolbar: 'b', channels: [{ id: 'a', volts: 2, outputOhms: 0.1 }, { id: 'b', volts: 4, outputOhms: 0.3 }] }
  assert.deepEqual(driveOf(w, []), { voltage: 4, rg: 0.3 })
  assert.ok(Math.abs(masterForVoltage(w, [], 8).masterDb - 20 * Math.log10(2)) < 1e-12)
})
