import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  C, add, sub, mul, div, inv, neg, abs, arg, cosh, sinh, jw, jwPow,
  matMul, matIdentity, zInFromMatrix, propagate, parallel,
  ZERO, ONE,
} from '../../src/engine/complex.js'

// ---------------------------------------------------------------------------
// Helpers.
//
// A Complex carries numeric `.re` and `.im`. structuredClone would drop the
// prototype, so "deep clone the argument" is done by snapshotting the observable
// numeric state and re-building a fresh, equal argument for the second call.
//
// Tolerance: all arithmetic below is a handful of double-precision operations on
// operands of magnitude <= ~1e3, so the accumulated error is a few ulps. 1e-12
// absolute is several orders of magnitude above that and far below any value
// being asserted, so it cannot mask a wrong answer.
const TOL = 1e-12

const snap = (c) => ({ re: c.re, im: c.im })
const snapMat = (M) => M.map((row) => row.map(snap))

function near(actual, expected, tol = TOL, msg = '') {
  assert.ok(
    Math.abs(actual - expected) < tol,
    `${msg} expected ${expected}, got ${actual} (tol ${tol})`,
  )
}

function nearC(actual, re, im, tol = TOL, msg = '') {
  near(actual.re, re, tol, `${msg} re:`)
  near(actual.im, im, tol, `${msg} im:`)
}

// ---------------------------------------------------------------------------
// Exported constants

// CONTRACT: "`ZERO` — Complex additive identity, `0 + 0j`. Shared instance —
// never mutate it."
test('ZERO: is the complex additive identity 0 + 0j', () => {
  assert.equal(ZERO.re, 0)
  assert.equal(ZERO.im, 0)
  // Additive identity: a + ZERO = a, and the shared instance survives it.
  const a = C(3, -4)
  nearC(add(a, ZERO), 3, -4)
  assert.equal(ZERO.re, 0, 'ZERO must not be mutated by use')
  assert.equal(ZERO.im, 0, 'ZERO must not be mutated by use')
})

// CONTRACT: "`ONE` — Complex multiplicative identity, `1 + 0j`. Shared instance
// — never mutate it."
test('ONE: is the complex multiplicative identity 1 + 0j', () => {
  assert.equal(ONE.re, 1)
  assert.equal(ONE.im, 0)
  const a = C(3, -4)
  nearC(mul(a, ONE), 3, -4)
  assert.equal(ONE.re, 1, 'ONE must not be mutated by use')
  assert.equal(ONE.im, 0, 'ONE must not be mutated by use')
})

// CONTRACT (module): "Every operation here returns a new Complex; none mutate
// their arguments. That is what makes the whole module `@pure` and lets the
// solver reuse operand instances across the 512-point frequency sweep without
// defensive copying."
test('module: no operation mutates its arguments or returns an operand', () => {
  const a = C(1.25, -2.5)
  const b = C(0.75, 3)
  const a0 = snap(a)
  const b0 = snap(b)
  const results = [
    add(a, b), sub(a, b), mul(a, b), div(a, b), inv(a), neg(a), cosh(a), sinh(a),
  ]
  for (const r of results) {
    assert.notEqual(r, a, 'no operation may return an operand instance')
    assert.notEqual(r, b, 'no operation may return an operand instance')
  }
  assert.deepEqual(snap(a), a0, 'a must be unmodified after every operation')
  assert.deepEqual(snap(b), b0, 'b must be unmodified after every operation')
})

// ---------------------------------------------------------------------------
// C(re, im)

// CONTRACT: "Construct a complex number." / "`re` — `number` — Real part."
// / "`im` — `number` _(optional, default `0`)_ — Imaginary part."
// / "`Complex` — The value `re + j·im`."
test('C: returns the value re + j·im', () => {
  const z = C(3, -4)
  assert.equal(typeof z.re, 'number')
  assert.equal(typeof z.im, 'number')
  near(z.re, 3)
  near(z.im, -4)
})

// CONTRACT: "`im` — `number` _(optional, default `0`)_ — Imaginary part."
test('C: im defaults to 0', () => {
  const omitted = C(3)
  const explicit = C(3, 0)
  near(omitted.re, explicit.re)
  near(omitted.im, explicit.im)
  near(omitted.im, 0)
})

// CONTRACT: "**Purity:** `@pure` ... Calling it twice with equal inputs must
// produce equal output and change nothing observable."
test('C: @pure — equal inputs give equal outputs', () => {
  const a = C(1.5, 2.5)
  const b = C(1.5, 2.5)
  near(a.re, b.re)
  near(a.im, b.im)
})

// ---------------------------------------------------------------------------
// add(a, b)

// CONTRACT: "Complex addition." / "`Complex` — `a + b`, as a new instance."
test('add: returns a + b as a new instance', () => {
  const a = C(1, 2)
  const b = C(3, 4)
  const r = add(a, b)
  nearC(r, 4, 6)
  assert.notEqual(r, a, 'result must be a new instance, not the left operand')
  assert.notEqual(r, b, 'result must be a new instance, not the right operand')
})

// CONTRACT: "**Purity:** `@pure` ... Calling it twice with equal inputs must
// produce equal output and change nothing observable."
test('add: @pure — operands unmodified, repeatable', () => {
  const a = C(1, 2)
  const b = C(3, 4)
  const a0 = snap(a)
  const b0 = snap(b)
  const r1 = add(a, b)
  const r2 = add(C(1, 2), C(3, 4))
  assert.deepEqual(snap(a), a0)
  assert.deepEqual(snap(b), b0)
  nearC(r1, r2.re, r2.im)
})

// ---------------------------------------------------------------------------
// sub(a, b)

// CONTRACT: "Complex subtraction." / "`Complex` — `a - b`, as a new instance."
test('sub: returns a - b as a new instance', () => {
  const a = C(1, 2)
  const b = C(3, 4)
  const r = sub(a, b)
  nearC(r, -2, -2)
  assert.notEqual(r, a)
  assert.notEqual(r, b)
})

// CONTRACT: "**Purity:** `@pure` ... change nothing observable."
test('sub: @pure — operands unmodified, repeatable', () => {
  const a = C(1, 2)
  const b = C(3, 4)
  const a0 = snap(a)
  const b0 = snap(b)
  const r1 = sub(a, b)
  const r2 = sub(C(1, 2), C(3, 4))
  assert.deepEqual(snap(a), a0)
  assert.deepEqual(snap(b), b0)
  nearC(r1, r2.re, r2.im)
})

// ---------------------------------------------------------------------------
// mul(a, b)

// CONTRACT: "Complex multiplication." / "`Complex` — `a · b`, as a new instance."
test('mul: returns a · b as a new instance', () => {
  // (1 + 2j)(3 + 4j) = 3 + 4j + 6j + 8j² = -5 + 10j
  const a = C(1, 2)
  const b = C(3, 4)
  const r = mul(a, b)
  nearC(r, -5, 10)
  assert.notEqual(r, a)
  assert.notEqual(r, b)
})

// CONTRACT: "**Purity:** `@pure` ... change nothing observable."
test('mul: @pure — operands unmodified, repeatable', () => {
  const a = C(1, 2)
  const b = C(3, 4)
  const a0 = snap(a)
  const b0 = snap(b)
  const r1 = mul(a, b)
  const r2 = mul(C(1, 2), C(3, 4))
  assert.deepEqual(snap(a), a0)
  assert.deepEqual(snap(b), b0)
  nearC(r1, r2.re, r2.im)
})

// ---------------------------------------------------------------------------
// div(a, b)

// CONTRACT: "Complex division." / "`Complex` — `a / b`, as a new instance."
test('div: returns a / b as a new instance', () => {
  // (1 + 2j)/(3 + 4j) = (1 + 2j)(3 - 4j)/25 = (11 + 2j)/25 = 0.44 + 0.08j
  const a = C(1, 2)
  const b = C(3, 4)
  const r = div(a, b)
  nearC(r, 0.44, 0.08)
  assert.notEqual(r, a)
  assert.notEqual(r, b)
})

// CONTRACT (precondition text, which also states the behaviour when it is
// violated): "b is non-zero; division by zero yields Infinity/NaN components
// rather than throwing"
test('div: division by zero yields Infinity/NaN components rather than throwing', () => {
  const r = div(C(1, 0), C(0, 0))
  assert.ok(
    !Number.isFinite(r.re) || !Number.isFinite(r.im),
    'at least one component of 1/0 must be Infinity or NaN',
  )
  // Neighbouring valid input: a non-zero divisor is finite.
  const ok = div(C(1, 0), C(1e-12, 0))
  assert.ok(Number.isFinite(ok.re) && Number.isFinite(ok.im))
})

// CONTRACT: "**Purity:** `@pure` ... change nothing observable."
test('div: @pure — operands unmodified, repeatable', () => {
  const a = C(1, 2)
  const b = C(3, 4)
  const a0 = snap(a)
  const b0 = snap(b)
  const r1 = div(a, b)
  const r2 = div(C(1, 2), C(3, 4))
  assert.deepEqual(snap(a), a0)
  assert.deepEqual(snap(b), b0)
  nearC(r1, r2.re, r2.im)
})

// ---------------------------------------------------------------------------
// inv(a)

// CONTRACT: "Complex reciprocal." / "`Complex` — `1 / a`, as a new instance."
test('inv: returns 1 / a as a new instance', () => {
  const a = C(2, 0)
  const r = inv(a)
  nearC(r, 0.5, 0)
  assert.notEqual(r, a)
  // 1/j = -j
  nearC(inv(C(0, 1)), 0, -1)
  // 1/(3 + 4j) = (3 - 4j)/25
  nearC(inv(C(3, 4)), 0.12, -0.16)
})

// CONTRACT precondition: "a is non-zero" — assert correct behaviour across the
// satisfied range, including small-but-non-zero boundary values.
test('inv: correct across the non-zero range', () => {
  for (const [re, im] of [[1e-8, 0], [0, 1e-8], [1e6, -1e6], [-3, 5]]) {
    const d = re * re + im * im
    const r = inv(C(re, im))
    // relative tolerance: values span many decades, so compare relatively.
    assert.ok(Math.abs(r.re - re / d) <= 1e-9 * Math.abs(re / d) + 1e-300)
    assert.ok(Math.abs(r.im + im / d) <= 1e-9 * Math.abs(im / d) + 1e-300)
  }
})

// CONTRACT: "**Purity:** `@pure` ... change nothing observable."
test('inv: @pure — operand unmodified, repeatable', () => {
  const a = C(3, 4)
  const a0 = snap(a)
  const r1 = inv(a)
  const r2 = inv(C(3, 4))
  assert.deepEqual(snap(a), a0)
  nearC(r1, r2.re, r2.im)
})

// ---------------------------------------------------------------------------
// neg(a)

// CONTRACT: "Complex negation." / "`Complex` — `-a`, as a new instance."
test('neg: returns -a as a new instance', () => {
  const a = C(1, -2)
  const r = neg(a)
  nearC(r, -1, 2)
  assert.notEqual(r, a)
})

// CONTRACT: "**Purity:** `@pure` ... change nothing observable."
test('neg: @pure — operand unmodified, repeatable', () => {
  const a = C(1, -2)
  const a0 = snap(a)
  const r1 = neg(a)
  const r2 = neg(C(1, -2))
  assert.deepEqual(snap(a), a0)
  nearC(r1, r2.re, r2.im)
})

// ---------------------------------------------------------------------------
// abs(a)

// CONTRACT: "`number` — `|a|`, always ≥ 0."
test('abs: returns |a| as a number', () => {
  const r = abs(C(3, -4))
  assert.equal(typeof r, 'number')
  near(r, 5)
  near(abs(C(0, 0)), 0)
  near(abs(C(0, -7)), 7)
})

// CONTRACT postcondition: "result >= 0"
test('abs: result >= 0', () => {
  const samples = [[0, 0], [-3, -4], [1e-12, 0], [-1e9, 1e9], [5, 0], [0, -5]]
  for (const [re, im] of samples) {
    assert.ok(abs(C(re, im)) >= 0, `abs(${re}+${im}j) must be >= 0`)
  }
})

// CONTRACT: "**Purity:** `@pure` ... change nothing observable."
test('abs: @pure — operand unmodified, repeatable', () => {
  const a = C(3, -4)
  const a0 = snap(a)
  const r1 = abs(a)
  const r2 = abs(C(3, -4))
  assert.deepEqual(snap(a), a0)
  near(r1, r2)
})

// ---------------------------------------------------------------------------
// arg(a)

// CONTRACT: "`number` — `arg(a)` in radians, in (−π, π]."
test('arg: returns the phase angle in radians', () => {
  assert.equal(typeof arg(C(1, 0)), 'number')
  near(arg(C(1, 0)), 0)
  near(arg(C(0, 1)), Math.PI / 2)
  near(arg(C(-1, 0)), Math.PI)
  near(arg(C(0, -1)), -Math.PI / 2)
  near(arg(C(1, 1)), Math.PI / 4)
})

// CONTRACT postcondition: "-Math.PI < result && result <= Math.PI"
test('arg: -Math.PI < result && result <= Math.PI', () => {
  const samples = [
    [1, 0], [0, 1], [-1, 0], [0, -1], [-1, -1e-15], [-1, 1e-15],
    [0, 0], [1e-12, -1e-12], [-1e9, -1],
  ]
  for (const [re, im] of samples) {
    const r = arg(C(re, im))
    assert.ok(
      -Math.PI < r && r <= Math.PI,
      `arg(${re}+${im}j) = ${r} must lie in (-PI, PI]`,
    )
  }
})

// CONTRACT: "**Purity:** `@pure` ... change nothing observable."
test('arg: @pure — operand unmodified, repeatable', () => {
  const a = C(-1, 2)
  const a0 = snap(a)
  const r1 = arg(a)
  const r2 = arg(C(-1, 2))
  assert.deepEqual(snap(a), a0)
  near(r1, r2)
})

// ---------------------------------------------------------------------------
// cosh(a)

// CONTRACT: "Hyperbolic cosine of a complex number." / "`Complex` — `cosh(a)`."
test('cosh: returns cosh(a)', () => {
  nearC(cosh(C(0, 0)), 1, 0)
  // Real argument reduces to the real cosh.
  nearC(cosh(C(1.3, 0)), Math.cosh(1.3), 0)
  // Purely imaginary argument: cosh(jx) = cos(x).
  nearC(cosh(C(0, 0.7)), Math.cos(0.7), 0)
  // General: cosh(a+jb) = cosh a cos b + j sinh a sin b
  const [a, b] = [0.4, 1.1]
  nearC(cosh(C(a, b)), Math.cosh(a) * Math.cos(b), Math.sinh(a) * Math.sin(b))
})

// CONTRACT: "**Purity:** `@pure` ... change nothing observable."
test('cosh: @pure — operand unmodified, repeatable', () => {
  const a = C(0.4, 1.1)
  const a0 = snap(a)
  const r1 = cosh(a)
  const r2 = cosh(C(0.4, 1.1))
  assert.deepEqual(snap(a), a0)
  nearC(r1, r2.re, r2.im)
})

// ---------------------------------------------------------------------------
// sinh(a)

// CONTRACT: "Hyperbolic sine of a complex number." / "`Complex` — `sinh(a)`."
test('sinh: returns sinh(a)', () => {
  nearC(sinh(C(0, 0)), 0, 0)
  nearC(sinh(C(1.3, 0)), Math.sinh(1.3), 0)
  // sinh(jx) = j sin(x)
  nearC(sinh(C(0, 0.7)), 0, Math.sin(0.7))
  // General: sinh(a+jb) = sinh a cos b + j cosh a sin b
  const [a, b] = [0.4, 1.1]
  nearC(sinh(C(a, b)), Math.sinh(a) * Math.cos(b), Math.cosh(a) * Math.sin(b))
})

// CONTRACT: "**Purity:** `@pure` ... change nothing observable."
test('sinh: @pure — operand unmodified, repeatable', () => {
  const a = C(0.4, 1.1)
  const a0 = snap(a)
  const r1 = sinh(a)
  const r2 = sinh(C(0.4, 1.1))
  assert.deepEqual(snap(a), a0)
  nearC(r1, r2.re, r2.im)
})

// ---------------------------------------------------------------------------
// jw(w)

// CONTRACT: "The imaginary frequency operator `jω`." / "`Complex` — `0 + jω`."
test('jw: returns 0 + jω', () => {
  nearC(jw(0), 0, 0)
  nearC(jw(1000), 0, 1000)
  nearC(jw(-3.5), 0, -3.5)
})

// CONTRACT: "**Purity:** `@pure` ... change nothing observable."
test('jw: @pure — repeatable', () => {
  const r1 = jw(628.3)
  const r2 = jw(628.3)
  nearC(r1, r2.re, r2.im)
})

// ---------------------------------------------------------------------------
// jwPow(w, n)

// CONTRACT: "The semi-inductance operator `(jω)ⁿ`." / "`Complex` — `(jω)ⁿ` on
// the principal branch."
// Principal branch: (jω)ⁿ = ωⁿ·(cos(nπ/2) + j·sin(nπ/2)) for ω >= 0.
test('jwPow: returns (jω)ⁿ on the principal branch', () => {
  for (const w of [1, 100, 6283.2]) {
    for (const n of [0.5, 0.6, 0.8, 1, 2]) {
      const r = jwPow(w, n)
      const mag = Math.pow(w, n)
      const ang = (n * Math.PI) / 2
      // Relative tolerance 1e-9: magnitudes reach ~4e7 here, so an absolute
      // tolerance would be meaningless; 1e-9 relative is still far tighter
      // than any plausible alternative branch or formula.
      const tol = 1e-9 * mag
      near(r.re, mag * Math.cos(ang), tol, `jwPow(${w},${n}) re:`)
      near(r.im, mag * Math.sin(ang), tol, `jwPow(${w},${n}) im:`)
    }
  }
})

// CONTRACT: "`w` — `number` — Angular frequency ω, rad/s." with precondition
// "w >= 0" — the boundary of the satisfied range is w = 0, where
// (j·0)ⁿ = 0 for n > 0.
test('jwPow: w = 0 boundary of the w >= 0 precondition', () => {
  for (const n of [0.5, 0.7, 1]) {
    const r = jwPow(0, n)
    near(r.re, 0, TOL, `jwPow(0,${n}) re:`)
    near(r.im, 0, TOL, `jwPow(0,${n}) im:`)
  }
})

// CONTRACT: "**Purity:** `@pure` ... change nothing observable."
test('jwPow: @pure — repeatable', () => {
  const r1 = jwPow(1234, 0.7)
  const r2 = jwPow(1234, 0.7)
  near(r1.re, r2.re)
  near(r1.im, r2.im)
})

// ---------------------------------------------------------------------------
// matMul(M, N)

// CONTRACT: "Multiply two ABCD matrices, cascading two two-ports into one." /
// "`ABCD` — The cascade `M · N`, as a new matrix."
test('matMul: returns the matrix product M · N as a new matrix', () => {
  const M = [[C(1, 0), C(2, 0)], [C(3, 0), C(4, 0)]]
  const N = [[C(5, 0), C(6, 0)], [C(7, 0), C(8, 0)]]
  const R = matMul(M, N)
  // [[1,2],[3,4]] · [[5,6],[7,8]] = [[19,22],[43,50]]
  nearC(R[0][0], 19, 0, TOL, 'A:')
  nearC(R[0][1], 22, 0, TOL, 'B:')
  nearC(R[1][0], 43, 0, TOL, 'C:')
  nearC(R[1][1], 50, 0, TOL, 'D:')
  assert.notEqual(R, M)
  assert.notEqual(R, N)
})

// CONTRACT: "Multiply two ABCD matrices" — with complex entries.
test('matMul: multiplies complex entries', () => {
  // (jI) · N = j·N
  const jI = [[C(0, 1), C(0, 0)], [C(0, 0), C(0, 1)]]
  const N = [[C(1, 0), C(2, 0)], [C(3, 0), C(4, 0)]]
  const R = matMul(jI, N)
  nearC(R[0][0], 0, 1)
  nearC(R[0][1], 0, 2)
  nearC(R[1][0], 0, 3)
  nearC(R[1][1], 0, 4)
})

// CONTRACT postcondition: "Neither M nor N is modified."
test('matMul: neither M nor N is modified', () => {
  const M = [[C(1, -1), C(2, 0)], [C(3, 0), C(4, 2)]]
  const N = [[C(5, 0), C(6, 1)], [C(7, 0), C(8, 0)]]
  const M0 = snapMat(M)
  const N0 = snapMat(N)
  matMul(M, N)
  assert.deepEqual(snapMat(M), M0)
  assert.deepEqual(snapMat(N), N0)
})

// CONTRACT: "**Purity:** `@pure` ... Calling it twice with equal inputs must
// produce equal output."
test('matMul: @pure — repeatable', () => {
  const mk = () => [[[C(1, -1), C(2, 0)], [C(3, 0), C(4, 2)]],
    [[C(5, 0), C(6, 1)], [C(7, 0), C(8, 0)]]]
  const [M1, N1] = mk()
  const [M2, N2] = mk()
  assert.deepEqual(snapMat(matMul(M1, N1)), snapMat(matMul(M2, N2)))
})

// ---------------------------------------------------------------------------
// matIdentity()

// CONTRACT: "`ABCD` — `[[1, 0], [0, 1]]`."
test('matIdentity: returns [[1, 0], [0, 1]]', () => {
  const I = matIdentity()
  assert.equal(I.length, 2)
  assert.equal(I[0].length, 2)
  assert.equal(I[1].length, 2)
  nearC(I[0][0], 1, 0)
  nearC(I[0][1], 0, 0)
  nearC(I[1][0], 0, 0)
  nearC(I[1][1], 1, 0)
})

// CONTRACT: "Returns a fresh array each call — it is the seed of `reduce`-style
// cascades and callers are free to overwrite it." /
// postcondition: "result is a newly allocated matrix sharing the ZERO/ONE constants"
test('matIdentity: newly allocated matrix sharing the ZERO/ONE constants', () => {
  const a = matIdentity()
  const b = matIdentity()
  assert.notEqual(a, b, 'outer array must be freshly allocated')
  assert.notEqual(a[0], b[0], 'row 0 must be freshly allocated')
  assert.notEqual(a[1], b[1], 'row 1 must be freshly allocated')
  // "sharing the ZERO/ONE constants": the entries are the module's exported
  // shared instances, so they are reference-identical to ZERO and ONE and to
  // each other across calls.
  assert.equal(a[0][0], ONE, 'A must be the shared ONE constant')
  assert.equal(a[1][1], ONE, 'D must be the shared ONE constant')
  assert.equal(a[0][1], ZERO, 'B must be the shared ZERO constant')
  assert.equal(a[1][0], ZERO, 'C must be the shared ZERO constant')
  assert.equal(a[0][0], b[0][0], 'ONE constant must be shared across calls')
  assert.equal(a[0][1], b[0][1], 'ZERO constant must be shared across calls')
})

// CONTRACT: "The identity two-port, representing a lossless connection of zero
// length." — cascading it with any M leaves M unchanged.
test('matIdentity: is the identity of matMul', () => {
  const M = [[C(1, -1), C(2, 0)], [C(3, 0), C(4, 2)]]
  const left = matMul(matIdentity(), M)
  const right = matMul(M, matIdentity())
  assert.deepEqual(snapMat(left), snapMat(M))
  assert.deepEqual(snapMat(right), snapMat(M))
})

// ---------------------------------------------------------------------------
// zInFromMatrix(M, Zl)

// CONTRACT: "Input impedance of a two-port terminated in a load.
// `Zin = (A·Zl + B) / (C·Zl + D)`."
test('zInFromMatrix: Zin = (A·Zl + B) / (C·Zl + D)', () => {
  const M = [[C(1, 2), C(3, -1)], [C(0.5, 0), C(2, 1)]]
  const Zl = C(4, -2)
  const num = add(mul(M[0][0], Zl), M[0][1])
  const den = add(mul(M[1][0], Zl), M[1][1])
  const expected = div(num, den)
  const r = zInFromMatrix(M, Zl)
  nearC(r, expected.re, expected.im)
})

// CONTRACT: "The identity two-port, representing a lossless connection of zero
// length" combined with "`Zin = (A·Zl + B) / (C·Zl + D)`" — through the
// identity the input impedance is the load itself.
test('zInFromMatrix: through the identity two-port Zin equals the load', () => {
  const Zl = C(7, -3)
  const r = zInFromMatrix(matIdentity(), Zl)
  nearC(r, 7, -3)
})

// CONTRACT: "**Purity:** `@pure` ... change nothing observable."
test('zInFromMatrix: @pure — arguments unmodified, repeatable', () => {
  const M = [[C(1, 2), C(3, -1)], [C(0.5, 0), C(2, 1)]]
  const Zl = C(4, -2)
  const M0 = snapMat(M)
  const Zl0 = snap(Zl)
  const r1 = zInFromMatrix(M, Zl)
  const r2 = zInFromMatrix(
    [[C(1, 2), C(3, -1)], [C(0.5, 0), C(2, 1)]], C(4, -2),
  )
  assert.deepEqual(snapMat(M), M0)
  assert.deepEqual(snap(Zl), Zl0)
  nearC(r1, r2.re, r2.im)
})

// ---------------------------------------------------------------------------
// propagate(M, p1, U1)

// CONTRACT: "Given the input state `[p1, U1]` and a matrix M defined by
// `[p1; U1] = M · [p2; U2]`, this solves for the output state `[p2, U2]` by
// applying M⁻¹." / "`[Complex, Complex]` — The output state `[p2, U2]`."
test('propagate: solves [p1; U1] = M · [p2; U2] for [p2, U2]', () => {
  const M = [[C(1, 2), C(3, -1)], [C(0.5, 0), C(2, 1)]]
  const p1 = C(1, 0)
  const U1 = C(0, 0.25)
  const out = propagate(M, p1, U1)
  assert.ok(Array.isArray(out), 'must return an array')
  assert.equal(out.length, 2)
  // Round-trip: M · [p2; U2] must reproduce [p1; U1].
  const [p2, U2] = out
  const back1 = add(mul(M[0][0], p2), mul(M[0][1], U2))
  const back2 = add(mul(M[1][0], p2), mul(M[1][1], U2))
  // Tolerance 1e-10: the inverse-then-multiply round trip is ~10 double ops on
  // operands of order 1, so error is a few ulps.
  nearC(back1, p1.re, p1.im, 1e-10, 'p1 round-trip:')
  nearC(back2, U1.re, U1.im, 1e-10, 'U1 round-trip:')
})

// CONTRACT: "The identity two-port, representing a lossless connection of zero
// length" — traversing it leaves the state unchanged.
test('propagate: through the identity two-port the state is unchanged', () => {
  const [p2, U2] = propagate(matIdentity(), C(2, -1), C(0, 3))
  nearC(p2, 2, -1)
  nearC(U2, 0, 3)
})

// CONTRACT: "The determinant is computed rather than assumed to be 1 ... and
// dividing by the true determinant keeps the propagation consistent with the
// matrix that was actually built."
test('propagate: uses the true determinant (det != 1 still round-trips)', () => {
  // det = 2·3 - 0·0 = 6, deliberately not 1.
  const M = [[C(2, 0), C(0, 0)], [C(0, 0), C(3, 0)]]
  const [p2, U2] = propagate(M, C(4, 0), C(9, 0))
  nearC(p2, 2, 0)
  nearC(U2, 3, 0)
})

// CONTRACT: "**Purity:** `@pure` ... change nothing observable."
test('propagate: @pure — arguments unmodified, repeatable', () => {
  const M = [[C(1, 2), C(3, -1)], [C(0.5, 0), C(2, 1)]]
  const p1 = C(1, 0)
  const U1 = C(0, 0.25)
  const M0 = snapMat(M)
  const p0 = snap(p1)
  const u0 = snap(U1)
  const r1 = propagate(M, p1, U1)
  const r2 = propagate(
    [[C(1, 2), C(3, -1)], [C(0.5, 0), C(2, 1)]], C(1, 0), C(0, 0.25),
  )
  assert.deepEqual(snapMat(M), M0)
  assert.deepEqual(snap(p1), p0)
  assert.deepEqual(snap(U1), u0)
  assert.deepEqual(r1.map(snap), r2.map(snap))
})

// ---------------------------------------------------------------------------
// parallel(zs)

// CONTRACT: "Parallel (shunt) combination of a list of impedances ...
// `1/Z = Σ 1/Zᵢ`."
test('parallel: combines impedances as 1/Z = Σ 1/Zᵢ', () => {
  nearC(parallel([C(2, 0), C(2, 0)]), 1, 0)
  nearC(parallel([C(6, 0), C(3, 0)]), 2, 0)
  // A single branch is its own parallel combination.
  nearC(parallel([C(3, -4)]), 3, -4)
  // Complex: 1/(j) + 1/(2j) = -j - 0.5j = -1.5j  ->  Z = 1/(-1.5j) = j/1.5
  nearC(parallel([C(0, 1), C(0, 2)]), 0, 2 / 3)
})

// CONTRACT: "`Complex|null` — The combined impedance, or `null` when `zs` is
// empty — an unconnected port has no load rather than a zero one, and callers
// must handle that case explicitly."
test('parallel: returns null when zs is empty', () => {
  assert.equal(parallel([]), null)
})

// CONTRACT postcondition: "zs is not modified"
test('parallel: zs is not modified', () => {
  const zs = [C(2, 1), C(3, -1), C(0, 4)]
  const before = zs.map(snap)
  const len = zs.length
  parallel(zs)
  assert.equal(zs.length, len)
  assert.deepEqual(zs.map(snap), before)
})

// CONTRACT: "**Purity:** `@pure` ... change nothing observable."
test('parallel: @pure — repeatable', () => {
  const a = parallel([C(2, 1), C(3, -1)])
  const b = parallel([C(2, 1), C(3, -1)])
  nearC(a, b.re, b.im)
})

// UNREACHABLE — not covered:
// (none — all 18 exports of src/engine/complex.js are marked EXPORTED/testable)
