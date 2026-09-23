// Contract tests for src/spice/fit.js — passive network fitting.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { atomZ, nnls, fitAtoms, fitZ, logspace, fitFractional } from '../../src/spice/fit.js'

// CONTRACT: corner atom "jq/(jq + q0) — R‖L, corner at q0".
test('atomZ: a corner is R‖L with R = 1 and L = 1/q0', () => {
  for (const [q, q0] of [[0.1, 1], [1, 1], [10, 1], [3, 0.2]]) {
    const z = atomZ({ kind: 'corner', q0 }, q)
    // parallel R=1, jqL with L = 1/q0: Z = jq/q0 / (1 + jq/q0)
    const d = 1 + (q / q0) ** 2
    assert.ok(Math.abs(z.re - (q / q0) ** 2 / d) < 1e-12)
    assert.ok(Math.abs(z.im - (q / q0) / d) < 1e-12)
  }
})

// CONTRACT: resonance atom is a parallel RLC with R = 1 peaking at q0.
test('atomZ: a resonance peaks at R = 1, purely resistive, at q0', () => {
  const z = atomZ({ kind: 'resonance', q0: 2, Q: 1.5 }, 2)
  assert.ok(Math.abs(z.re - 1) < 1e-12)
  assert.ok(Math.abs(z.im) < 1e-12)
  assert.ok(atomZ({ kind: 'resonance', q0: 2, Q: 1.5 }, 0.5).re < 1)
})

// CONTRACT: "min ‖A·x − b‖ subject to x ≥ 0."
test('nnls: recovers a non-negative solution and clamps what would go negative', () => {
  const A = [[1, 0], [0, 1], [1, 1]]
  const x = nnls(A, [2, 3, 5])
  assert.ok(Math.abs(x[0] - 2) < 1e-9 && Math.abs(x[1] - 3) < 1e-9)
  const y = nnls([[1, 1], [1, 1.0001]], [1, -1])
  assert.ok(y.every((v) => v >= 0))
})

// CONTRACT: "Atoms whose weight comes out zero are dropped." — and every kept
// weight is positive, which is what makes the network passive.
test('fitAtoms: kept weights are all positive', () => {
  const atoms = logspace(0.1, 100, 12).map((q0) => ({ kind: 'corner', q0 }))
  const samples = logspace(1, 30, 50).map((q) => ({ q, z: { re: Math.sqrt(q / 2), im: Math.sqrt(q / 2) } }))
  const fit = fitAtoms(atoms, samples)
  assert.ok(fit.length > 0)
  assert.ok(fit.every((a) => a.weight > 0))
})

// CONTRACT: "Fit `(jq)^α` for 0 < α < 1 over q ∈ [1, qMax]" — accurate across
// the band for the exponents the model uses: ½ for boundary-layer loss, and
// voice-coil semi-inductance exponents up to 0.95.
test('fitFractional: (jq)^α to within 0.5% across the band', () => {
  for (const [alpha, perDecade, tol] of [[0.5, 1.5, 0.005], [0.5, 3, 0.001], [0.7, 3, 0.005], [0.95, 3, 0.005]]) {
    const fit = fitFractional(alpha, 400, perDecade)
    for (const q of logspace(1, 400, 120)) {
      const z = fitZ(fit, q)
      const m = Math.pow(q, alpha)
      const want = { re: m * Math.cos((alpha * Math.PI) / 2), im: m * Math.sin((alpha * Math.PI) / 2) }
      const err = Math.hypot(z.re - want.re, z.im - want.im) / m
      assert.ok(err < tol, `α=${alpha} q=${q.toFixed(2)}: ${(err * 100).toFixed(3)}%`)
    }
  }
})
