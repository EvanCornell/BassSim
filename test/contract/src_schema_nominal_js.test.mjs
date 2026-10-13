// Contract tests for src/schema/nominal.js.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { nominalFloor, estimateNominal, nominalOf, driverNominal, fmtOhms } from '../../src/schema/nominal.js'
import { BUILTIN_DRIVERS } from '../../src/data/drivers.js'

// CONTRACT (nominalFloor): "the low end is Re over that: lower Qes raises it".
test('nominalFloor: a stronger motor raises the low end', () => {
  assert.ok(nominalFloor(3.6, 0.2) > nominalFloor(3.6, 0.5))
  assert.equal(nominalFloor(3.6, 0.6), nominalFloor(3.6, 0.9), 'the share is capped')
  assert.equal(nominalFloor(0, 0.4), 0)
  assert.ok(nominalFloor(3.6) > 0, 'a typical Qes stands in for a missing one')
})

// CONTRACT (estimateNominal): powers of two with a quarter's allowance, 6 and 12 without.
test('estimateNominal: common drivers land on their usual ratings', () => {
  assert.equal(estimateNominal(3.6, 0.5), 4)
  assert.equal(estimateNominal(3.2, 0.4), 4)
  assert.equal(estimateNominal(1.8, 0.5), 2)
  assert.equal(estimateNominal(6.4, 0.4), 8)
  assert.equal(estimateNominal(4.7, 0.4), 6)
  assert.equal(estimateNominal(9, 0.4), 12)
  assert.equal(estimateNominal(0.4, 0.5), 0.5, 'any power of two, below 1 too')
  assert.equal(estimateNominal(25, 0.4), 32)
  assert.equal(estimateNominal(0, 0.4), 0)
})

// CONTRACT (estimateNominal): "gives the listed figure for all but a few drivers".
test('estimateNominal: agrees with the catalogue listed ratings', () => {
  const listed = BUILTIN_DRIVERS.filter((d) => d.ext?.Znom && d.Re && d.Qes)
  const hits = listed.filter((d) => estimateNominal(d.Re, d.Qes) === d.ext.Znom).length
  assert.ok(listed.length > 150)
  assert.ok(hits / listed.length > 0.95, `${hits} of ${listed.length}`)
})

// CONTRACT (nominalOf): a typed or listed figure first, else the estimate.
test('nominalOf: Znom over the estimate', () => {
  assert.equal(nominalOf({ Re: 3.6, Qes: 0.5, Znom: 6 }), 6)
  assert.equal(nominalOf({ Re: 3.6, Qes: 0.5, Znom: null }), 4)
  assert.equal(nominalOf({ Re: 3.6, Qes: 0.5 }), 4)
})

// CONTRACT (driverNominal): dual voice coil — "parallel quarters Re, one coil
// alone halves it" — then the node's array wiring.
test('driverNominal: voice coils, then the array', () => {
  const d4 = { Re: 7, Qes: 0.5, count: 1, wiring: 'parallel' } // a dual 4 Ω, both coils in series
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
  const d6 = { Re: 5, Znom: 6, count: 2, wiring: 'parallel' }
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
