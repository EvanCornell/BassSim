// Contract tests for src/spice/physics.js — loss laws from geometry.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  RHO, MU, perimeter, viscousCoeff, thermalCoeff, flowResistivity, stuffedSoundSpeed, C_AIR,
  driverSI, besselJ1, besselJ0, struveH1, pistonImpedance,
} from '../../src/spice/physics.js'

// CONTRACT: waveguides are treated as round; rectangular chambers as square.
test('perimeter: round and square sections', () => {
  const S = 0.01
  assert.ok(Math.abs(perimeter(S) - 2 * Math.sqrt(Math.PI * S)) < 1e-15)
  assert.ok(Math.abs(perimeter(S, 'rectangular') - 0.4) < 1e-15)
})

// CONTRACT: wall friction adds `(P/S²)·√(ρμ)·√(jω)` per metre. The textbook
// consequence for a round duct of radius a: its resistance per metre is δ/a of
// its mass reactance per metre, δ = √(2μ/ρω) — the duct's Q is a/δ.
test('viscousCoeff: a round duct loses δ/a of its mass reactance', () => {
  for (const [a, f] of [[0.05, 45], [0.0178, 45], [0.05, 500]]) {
    const S = Math.PI * a * a
    const w = 2 * Math.PI * f
    const R = viscousCoeff(S, perimeter(S)) * Math.sqrt(w / 2) // Re of A·√(jω)
    const X = (w * RHO) / S
    const delta = Math.sqrt((2 * MU) / (RHO * w))
    assert.ok(Math.abs(R / X - delta / a) < 1e-12 * (delta / a) + 1e-15, `a=${a} f=${f}`)
  }
})

// CONTRACT: thermal loss is positive and proportional to the perimeter.
test('thermalCoeff: positive and proportional to perimeter', () => {
  assert.ok(thermalCoeff(1) > 0)
  assert.ok(Math.abs(thermalCoeff(2) / thermalCoeff(1) - 2) < 1e-12)
})

// CONTRACT: "0 for no stuffing", rising with density.
test('flowResistivity: zero without stuffing, rising with density', () => {
  assert.equal(flowResistivity(0), 0)
  assert.ok(flowResistivity(4) > 0)
  assert.ok(flowResistivity(8) > flowResistivity(4))
})

// CONTRACT: "slowing sound by up to 15.5% at 8 g/L, beyond which it stops changing."
test('stuffedSoundSpeed: saturates at 15.5% slower from 8 g/L', () => {
  assert.equal(stuffedSoundSpeed(0), C_AIR)
  assert.ok(Math.abs(stuffedSoundSpeed(8) - C_AIR * 0.845) < 1e-12)
  assert.equal(stuffedSoundSpeed(20), stuffedSoundSpeed(8))
})

// CONTRACT: several drivers collapse to one; wiring scales the electrical side, cone count the mechanical.
test('driverSI: units and wiring', () => {
  const p = { Re: 4, Le: 1, Bl: 10, Sd: 500, Mms: 100, Cms: 0.2, Rms: 2, Xmax: 8 }
  const one = driverSI(p)
  assert.deepEqual([one.n, one.Sd, one.Mms, one.Cms, one.Le, one.Xmax].map((v) => +v.toPrecision(6)), [1, 0.05, 0.1, 0.0002, 0.001, 0.008])
  const ser = driverSI({ ...p, count: 2, wiring: 'series' })
  assert.deepEqual([ser.Re, ser.Bl, ser.Sd, ser.Cms], [8, 20, 0.1, 0.0001])
  const par = driverSI({ ...p, count: 2, wiring: 'parallel' })
  assert.deepEqual([par.Re, par.Bl, par.Mms], [2, 10, 0.2])
  const grid = driverSI({ ...p, count: 4, wiring: 'series-parallel' })
  assert.deepEqual([grid.s, grid.par, grid.Re], [2, 2, 4])
  assert.equal(driverSI({ ...p, count: 3, wiring: 'series-parallel' }).par, 3)
  assert.equal(driverSI({}).n, 1, 'a blank driver still has every field')
})

test('Bessel and Struve: known values', () => {
  assert.ok(Math.abs(besselJ0(1) - 0.7651976866) < 1e-7)
  assert.ok(Math.abs(besselJ1(1) - 0.4400505857) < 1e-7)
  assert.ok(Math.abs(besselJ1(10) - 0.0434727462) < 1e-7)
  assert.equal(besselJ1(-2), -besselJ1(2))
  assert.equal(struveH1(0), 0)
  assert.ok(Math.abs(struveH1(1) - 0.1984573362) < 2e-3)
})

// CONTRACT: the flanged piston, ρc/S·(R1 + jX1); resistance never negative.
test('pistonImpedance: low- and high-frequency limits', () => {
  const S = 0.05, z0 = (RHO * C_AIR) / S
  const lo = pistonImpedance(S, 2 * Math.PI * 1)
  const ka = (2 * Math.PI * 1 / C_AIR) * Math.sqrt(S / Math.PI)
  assert.ok(Math.abs(lo.re / z0 - (ka * ka) / 2) / ((ka * ka) / 2) < 1e-3, 'R ≈ (ka)²/2')
  const hi = pistonImpedance(S, 2 * Math.PI * 20000)
  assert.ok(Math.abs(hi.re / z0 - 1) < 0.05, 'R → ρc/S')
  for (const f of [0, 1e-3, 10, 300, 5000]) assert.ok(pistonImpedance(0.002, 2 * Math.PI * f).re >= 0)
})
