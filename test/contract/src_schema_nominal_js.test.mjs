// Contract tests for src/schema/nominal.js.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ratingOf, driverNominal, treeNominal, effectiveLoad } from '../../src/schema/nominal.js'

// CONTRACT: "the standard value nearest Re / 0.85 on a logarithmic scale".
test('ratingOf: common coils read as their ratings', () => {
  assert.equal(ratingOf(3.2), 4)
  assert.equal(ratingOf(3.6), 4)
  assert.equal(ratingOf(6.4), 8)
  assert.equal(ratingOf(1.7), 2)
  assert.equal(ratingOf(0), 0)
})

// CONTRACT (driverNominal): dual voice coil — "parallel quarters Re, one coil
// alone halves it" — then the node's array wiring.
test('driverNominal: voice coils, then the array', () => {
  const d4 = { Re: 7, count: 1, wiring: 'single' } // a dual 4 Ω, both coils in series
  assert.equal(driverNominal(d4), 8)
  assert.equal(driverNominal({ ...d4, dvc: { coils: 'parallel' } }), 2)
  assert.equal(driverNominal({ ...d4, dvc: { coils: 'one' } }), 4)
  assert.equal(driverNominal({ Re: 3.6, count: 4, wiring: 'parallel' }), 1)
  assert.equal(driverNominal({ Re: 3.6, count: 2, wiring: 'series' }), 8)
  assert.equal(driverNominal({ Re: 3.6, count: 4, wiring: 'series-parallel' }), 4)
})

// CONTRACT (treeNominal): series adds, parallel adds conductances; nothing
// connected is open.
test('treeNominal: series and parallel combine', () => {
  const drivers = new Map([['a', { Re: 3.6 }], ['b', { Re: 3.6 }], ['c', { Re: 6.4 }]])
  assert.equal(treeNominal({ series: [{ driver: 'a' }, { driver: 'b' }] }, drivers), 8)
  assert.equal(treeNominal({ parallel: [{ driver: 'a' }, { driver: 'b' }] }, drivers), 2)
  assert.ok(Math.abs(treeNominal({ parallel: [{ driver: 'c' }, { series: [{ driver: 'a' }, { driver: 'b' }] }] }, drivers) - 4) < 1e-12)
  assert.equal(treeNominal({ parallel: [] }, drivers), Infinity)
  assert.equal(treeNominal(null, drivers), Infinity)
})

// CONTRACT (effectiveLoad): "The catch-all channel (`load: null`) drives every
// driver no explicit tree claims, in parallel."
test('effectiveLoad: the catch-all takes what is left', () => {
  const proj = {
    nodes: [{ id: 'a', type: 'driver' }, { id: 'b', type: 'driver' }, { id: 'c', type: 'chamber' }],
    wiring: { channels: [{ id: 'x', load: null }, { id: 'y', load: { driver: 'b' } }] },
  }
  assert.deepEqual(effectiveLoad(proj.wiring.channels[0], proj), { parallel: [{ driver: 'a' }] })
  assert.deepEqual(effectiveLoad(proj.wiring.channels[1], proj), { driver: 'b' })
})
