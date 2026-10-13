// Contract tests for src/schema/wires.js — channels, terminals and the cables between them.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  chTerm, nodeTerm, parseTerm, elementsOf, allTerminals, liveWires, netsOf, GROUND, wireRefusal,
  driverStatus, nominalSolve, arrangementWires, parallelWires, wiresFromLoads, toolbarChannel,
} from '../../src/schema/wires.js'

const drv = (id, params = {}) => ({ id, type: 'driver', params: { Re: 3.6, count: 1, wiring: 'parallel', dvc: null, ...params } })
const W = (wires, channels = [{ id: 'c1' }]) => ({ channels, wires })
const on = (ch, id) => [{ a: chTerm(ch, '+'), b: nodeTerm(id, '', '+') }, { a: chTerm(ch, '-'), b: nodeTerm(id, '', '-') }]

test('terminal ids round-trip', () => {
  assert.deepEqual(parseTerm('ch:c1:+'), { kind: 'channel', ch: 'c1', pol: '+' })
  assert.deepEqual(parseTerm('d:-'), { kind: 'node', node: 'd', element: '', pol: '-' })
  assert.deepEqual(parseTerm(nodeTerm('d', '2A', '+')), { kind: 'node', node: 'd', element: '2A', pol: '+' })
  assert.equal(parseTerm('nope'), null)
})

// CONTRACT: a node wired as a whole has two terminals; one wired by hand has a pair per coil.
test('elementsOf: whole node, or each coil', () => {
  assert.deepEqual(elementsOf(drv('d')).map((e) => [e.plus, e.minus, e.nominal]), [['d:+', 'd:-', 4]])
  const c = elementsOf(drv('d', { wiring: 'custom', count: 2, dvc: { coils: 'series' } }))
  assert.deepEqual(c.map((e) => e.key), ['1A', '1B', '2A', '2B'])
  assert.equal(c[0].nominal, 2, 'each half-coil rates from half of Re')
  assert.equal(c[1].label, 'Driver 1 · coil B')
})

test('liveWires: only cables between terminals that exist, once each', () => {
  const terms = allTerminals(W([]), [drv('d')])
  const kept = liveWires([...on('c1', 'd'), { a: 'd:+', b: 'ch:c1:+' }, { a: 'd:+', b: 'gone:+' }, { a: 'd:+', b: 'd:+' }], terms)
  assert.deepEqual(kept, on('c1', 'd'))
})

// CONTRACT: every channel's return is one ground net.
test('netsOf: channel returns are the ground', () => {
  const nets = netsOf([{ a: 'ch:c1:-', b: 'd:-' }, { a: 'd:+', b: 'e:+' }], ['ch:c2:-'])
  assert.equal(nets.get('d:-'), GROUND)
  assert.equal(nets.get('ch:c2:-'), GROUND)
  assert.equal(nets.get('d:+'), nets.get('e:+'))
})

// CONTRACT: a cable may not short a channel or join two channel outputs.
test('wireRefusal: shorts and repeats are refused', () => {
  const w = W(on('c1', 'd'), [{ id: 'c1', label: 'Channel 1' }, { id: 'c2', label: 'Channel 2' }])
  assert.match(wireRefusal(w, 'd:+', 'd:-'), /short Channel 1/)
  assert.match(wireRefusal(w, 'ch:c1:+', 'ch:c2:+'), /Two channel terminals/)
  assert.match(wireRefusal(w, 'd:+', 'ch:c2:+'), /join Channel 1 and Channel 2/)
  assert.match(wireRefusal(w, 'ch:c1:+', 'd:+'), /already joined/)
  assert.equal(wireRefusal(W([]), 'ch:c1:+', 'd:+'), null)
})

test('driverStatus: driven, unwired, half-connected and shorted coils', () => {
  const nodes = [drv('a'), drv('b'), drv('c'), drv('e')]
  const st = driverStatus(W([...on('c1', 'a'), { a: 'ch:c1:+', b: 'b:+' }, { a: 'c:+', b: 'c:-' }, { a: 'c:+', b: 'ch:c1:+' }]), nodes)
  assert.deepEqual(st.get('a'), { channels: ['c1'], dangling: false, shorted: false })
  assert.equal(st.get('b').dangling, true)
  assert.equal(st.get('c').shorted, true)
  assert.deepEqual(st.get('e').channels, [])
})

// CONTRACT: the nominal circuit of any shape — series, parallel, and a driver on two channels' worth of cable.
test('nominalSolve: what each channel sees and each element carries', () => {
  const nodes = [drv('a'), drv('b'), drv('c', { Re: 6.4 })]
  const series = W([{ a: 'ch:c1:+', b: 'a:+' }, { a: 'a:-', b: 'b:+' }, { a: 'b:-', b: 'ch:c1:-' }])
  const s = nominalSolve(series, nodes, { c1: 8 })
  assert.ok(Math.abs(s.channels.c1.ohms - 8) < 1e-6)
  assert.ok(Math.abs(s.elements['a:+'] - 1) < 1e-6)
  const par = W([...on('c1', 'a'), ...on('c1', 'b'), ...on('c1', 'c')])
  const p = nominalSolve(par, nodes, { c1: 2 })
  assert.ok(Math.abs(p.channels.c1.ohms - 1 / (1 / 4 + 1 / 4 + 1 / 8)) < 1e-6)
  assert.ok(Math.abs(p.channels.c1.watts - 4 / p.channels.c1.ohms) < 1e-6)
  assert.equal(nominalSolve(W([]), nodes, { c1: 2 }).channels.c1.ohms, Infinity)
})

// CONTRACT: going to `custom` starts from the circuit the arrangement made.
test('arrangementWires: the arrangement, drawn out coil by coil', () => {
  const series = arrangementWires(drv('d', { count: 2, wiring: 'series', dvc: { coils: 'parallel' } }))
  assert.equal(series.plus, 'd:1A:+')
  assert.equal(series.minus, 'd:2A:-')
  assert.deepEqual(series.wires, [
    { a: 'd:1A:+', b: 'd:1B:+' }, { a: 'd:1A:-', b: 'd:1B:-' },
    { a: 'd:2A:+', b: 'd:2B:+' }, { a: 'd:2A:-', b: 'd:2B:-' },
    { a: 'd:1A:-', b: 'd:2A:+' },
  ])
  const one = arrangementWires(drv('d', { dvc: { coils: 'one' } }))
  assert.deepEqual(one, { wires: [], plus: 'd:1A:+', minus: 'd:1A:-' })
})

test('parallelWires: a driver on a channel; one wired by hand is left alone', () => {
  assert.deepEqual(parallelWires([drv('a'), drv('b', { wiring: 'custom' })], 'c1'), on('c1', 'a'))
})

// CONTRACT: older projects' load trees become the cables that make the same circuit.
test('wiresFromLoads: trees and the catch-all', () => {
  const chs = [{ id: 'c1', load: null }, { id: 'c2', load: { series: [{ driver: 'b' }, { parallel: [{ driver: 'c' }, { driver: 'd' }] }] } }]
  const wires = wiresFromLoads(chs, ['a', 'b', 'c', 'd'])
  const nets = netsOf(wires)
  assert.equal(nets.get('a:+'), nets.get('ch:c1:+'))
  assert.equal(nets.get('a:-'), GROUND)
  assert.equal(nets.get('b:+'), nets.get('ch:c2:+'))
  assert.equal(nets.get('b:-'), nets.get('c:+'))
  assert.equal(nets.get('c:+'), nets.get('d:+'))
  assert.equal(nets.get('d:-'), GROUND)
})

test('toolbarChannel: the named one, else the first', () => {
  const chs = [{ id: 'a' }, { id: 'b' }]
  assert.equal(toolbarChannel({ channels: chs, toolbar: 'b' }).id, 'b')
  assert.equal(toolbarChannel({ channels: chs, toolbar: 'zz' }).id, 'a')
  assert.equal(toolbarChannel({}), undefined)
})
