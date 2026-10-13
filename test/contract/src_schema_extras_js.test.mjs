// Contract tests for src/schema/extras.js.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { pruneExtras, valueOf, driveOf, channelDrive, channelPatch, freshId } from '../../src/schema/extras.js'

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


// CONTRACT: "`prefix` followed by the lowest free number from 1".
test('freshId: the lowest free number', () => {
  assert.equal(freshId('t', []), 't1')
  assert.equal(freshId('t', ['t1', 't3']), 't2')
})

// CONTRACT: the drive follows the channel named by `toolbar`, else the first.
test('driveOf and masterForVoltage: follow the toolbar channel', () => {
  const w = { masterDb: 0, toolbar: 'b', channels: [{ id: 'a', volts: 2, outputOhms: 0.1 }, { id: 'b', volts: 4, outputOhms: 0.3 }] }
  assert.deepEqual(driveOf(w, []), { voltage: 4, rg: 0.3 })
})

// CONTRACT (channelDrive / channelPatch): voltage, impedance and power are one
// channel's three views, P = V²/Z, reckoned against 8 Ω until another is typed;
// a typed voltage or power sets the channel's own volts, never the master.
test('channelDrive and channelPatch: V, Z and P of one channel', () => {
  const w = { masterDb: 6, channels: [{ id: 'c', volts: 2 }] }
  const d = channelDrive(w, [], [])
  assert.ok(Math.abs(d.volts - 2 * Math.pow(10, 6 / 20)) < 1e-9)
  assert.equal(d.ohms, 8)
  assert.ok(Math.abs(d.watts - d.volts ** 2 / 8) < 1e-9)
  assert.ok(Math.abs(channelPatch(d, 'voltage', 4).volts * d.master - 4) < 1e-9, 'the typed voltage is what it plays at')
  assert.ok(Math.abs(channelPatch(d, 'power', 2).volts * d.master - 4) < 1e-9)
  assert.deepEqual(channelPatch(d, 'impedance', 4), { ohms: 4 })
  assert.equal(channelPatch(d, 'impedance', 0), null)
  assert.equal(channelDrive({ channels: [{ id: 'c', volts: 2, ohms: 4 }] }, [], []).watts, 1)
})
