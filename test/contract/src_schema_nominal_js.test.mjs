// Contract tests for src/schema/nominal.js.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ratingOf, driverNominal, fmtOhms } from '../../src/schema/nominal.js'

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

// CONTRACT (coilShare): "The split comes after rating, so a 6 Ω driver's coils
// in parallel read 1.5 Ω rather than a rating of their own."
test('driverNominal: a dual coil splits the rating, not a new rating', () => {
  const d6 = { Re: 5, count: 2, wiring: 'parallel' } // 6 Ω drivers
  assert.equal(driverNominal({ ...d6, dvc: { coils: 'parallel' } }), 0.75)
  assert.equal(driverNominal({ ...d6, dvc: { coils: 'one' } }), 1.5)
  assert.equal(driverNominal({ ...d6, wiring: 'series', dvc: { coils: 'parallel' } }), 3)
})

// CONTRACT (fmtOhms): "up to three significant figures, no trailing zeros".
test('fmtOhms: keeps fractions an impedance needs', () => {
  assert.equal(fmtOhms(0.75), '0.75')
  assert.equal(fmtOhms(1.5), '1.5')
  assert.equal(fmtOhms(16), '16')
  assert.equal(fmtOhms(32 / 3), '10.7')
})
