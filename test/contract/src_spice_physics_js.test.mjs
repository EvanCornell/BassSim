// Contract tests for src/spice/physics.js — loss laws from geometry.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  RHO, MU, perimeter, viscousCoeff, thermalCoeff, flowResistivity, stuffedSoundSpeed, C_AIR,
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
