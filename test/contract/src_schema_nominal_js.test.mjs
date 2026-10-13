// Contract tests for src/schema/nominal.js.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ratingOf, driverNominal } from '../../src/schema/nominal.js'

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
  const d4 = { Re: 7, count: 1, wiring: 'parallel' } // a dual 4 Ω, both coils in series
  assert.equal(driverNominal(d4), 8)
  assert.equal(driverNominal({ ...d4, dvc: { coils: 'parallel' } }), 2)
  assert.equal(driverNominal({ ...d4, dvc: { coils: 'one' } }), 4)
  assert.equal(driverNominal({ Re: 3.6, count: 4, wiring: 'parallel' }), 1)
  assert.equal(driverNominal({ Re: 3.6, count: 2, wiring: 'series' }), 8)
  assert.equal(driverNominal({ Re: 3.6, count: 4, wiring: 'series-parallel' }), 4)
})
