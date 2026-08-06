import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  besselJ1, besselJ0, struveH1, radiationImpedance,
  tlineMatrix, seriesMassMatrix, waveguideMatrix, chamberMatrix, combineQ,
  SOLID_ANGLES,
} from '../../src/engine/acoustics.js'
// `C_AIR` is the documented default for `tlineMatrix`'s `c`, and ρc is the
// characteristic impedance `radiationImpedance` returns for `anechoic`. Both
// constants are published by src/engine/geometry.js, which is the only place
// the spec pack gives them a value.
import { RHO, C_AIR } from '../../src/engine/geometry.js'

// ---------------------------------------------------------------------------
// Helpers.
//
// Tolerance policy: unless a test says otherwise, comparisons of quantities of
// order 1 use 1e-12 absolute (a few ulps of double arithmetic, far below any
// asserted value); quantities spanning decades use a relative tolerance stated
// at the site.
const TOL = 1e-12

const snap = (c) => ({ re: c.re, im: c.im })
const snapMat = (M) => M.map((row) => row.map(snap))

function near(actual, expected, tol = TOL, msg = '') {
  assert.ok(
    Math.abs(actual - expected) < tol,
    `${msg} expected ${expected}, got ${actual} (tol ${tol})`,
  )
}

function relNear(actual, expected, rel, msg = '') {
  assert.ok(
    Math.abs(actual - expected) <= rel * Math.abs(expected) + 1e-300,
    `${msg} expected ~${expected}, got ${actual} (rel ${rel})`,
  )
}

function assertMatNear(A, B, tol, msg = '') {
  for (let i = 0; i < 2; i++) {
    for (let j = 0; j < 2; j++) {
      near(A[i][j].re, B[i][j].re, tol, `${msg} [${i}][${j}].re:`)
      near(A[i][j].im, B[i][j].im, tol, `${msg} [${i}][${j}].im:`)
    }
  }
}

function assertIsABCD(M) {
  assert.ok(Array.isArray(M), 'ABCD must be an array')
  assert.equal(M.length, 2)
  for (const row of M) {
    assert.equal(row.length, 2)
    for (const z of row) {
      assert.equal(typeof z.re, 'number')
      assert.equal(typeof z.im, 'number')
    }
  }
}

// ---------------------------------------------------------------------------
// Exported constants

// CONTRACT: "`SOLID_ANGLES` — Solid angle Ω in steradians for each named
// radiating space. `free` is a driver suspended in air, `half` a flush-mounted
// baffle, and each step down halves the space: baffle against a wall, then into
// a corner." / Keys: free, half, quarter, eighth.
// `radiationImpedance` fixes the scale: "Baseline is the flanged piston (2π)",
// i.e. `half` = 2π sr. Free air is the whole sphere, 4π; each step down halves.
test('SOLID_ANGLES: Ω in steradians for each named radiating space', () => {
  assert.deepEqual(
    Object.keys(SOLID_ANGLES).sort(),
    ['eighth', 'free', 'half', 'quarter'],
  )
  near(SOLID_ANGLES.free, 4 * Math.PI, TOL, 'free:')
  near(SOLID_ANGLES.half, 2 * Math.PI, TOL, 'half:')
  near(SOLID_ANGLES.quarter, Math.PI, TOL, 'quarter:')
  near(SOLID_ANGLES.eighth, Math.PI / 2, TOL, 'eighth:')
})

// ---------------------------------------------------------------------------
// besselJ1(x)

// CONTRACT: "`number` — J₁(x)."
test('besselJ1: returns a finite number', () => {
  for (const x of [0, 0.5, 3, 7.9, 8, 8.1, 25, -4]) {
    const v = besselJ1(x)
    assert.equal(typeof v, 'number', `J1(${x}) must be a number`)
    assert.ok(Number.isFinite(v), `J1(${x}) must be finite, got ${v}`)
  }
})

// CONTRACT postcondition: "result === -J1(-x) — the function is odd"
// Asserted with exact === as the contract states it, on both sides of the
// documented |x| = 8 split.
test('besselJ1: result === -J1(-x) — the function is odd', () => {
  for (const x of [0, 0.25, 1, 3.7, 7.999, 8, 8.001, 12, 40]) {
    assert.equal(besselJ1(x), -besselJ1(-x), `oddness fails at x = ${x}`)
  }
})

// CONTRACT: "Bessel function of the first kind, order 1." — J₁(0) = 0, and the
// oddness postcondition forces it.
test('besselJ1: J₁(0) = 0', () => {
  near(besselJ1(0), 0)
})

// CONTRACT: "Accurate to roughly 1e-8" — checked against reference values of
// J₁ on both sides of the |x| = 8 split, with the documented 1e-8 tolerance.
test('besselJ1: accurate to roughly 1e-8', () => {
  const ref = [
    [1, 0.4400505857449335],
    [2, 0.5767248077568734],
    [5, -0.3275791375914652],
    [10, 0.0434727461688615],
    [20, 0.0668331241759257],
  ]
  for (const [x, expected] of ref) {
    near(besselJ1(x), expected, 1e-8, `J1(${x}):`)
  }
})

// CONTRACT: "**Purity:** `@pure` ... Calling it twice with equal inputs must
// produce equal output and change nothing observable."
test('besselJ1: @pure — equal inputs give equal outputs', () => {
  assert.equal(besselJ1(3.3), besselJ1(3.3))
  assert.equal(besselJ1(12.7), besselJ1(12.7))
})

// ---------------------------------------------------------------------------
// besselJ0(x)

// CONTRACT: "`number` — J₀(x)."
test('besselJ0: returns a finite number', () => {
  for (const x of [0, 0.5, 3, 7.9, 8, 8.1, 25, -4]) {
    const v = besselJ0(x)
    assert.equal(typeof v, 'number')
    assert.ok(Number.isFinite(v), `J0(${x}) must be finite, got ${v}`)
  }
})

// CONTRACT postcondition: "result === J0(-x) — the function is even"
test('besselJ0: result === J0(-x) — the function is even', () => {
  for (const x of [0, 0.25, 1, 3.7, 7.999, 8, 8.001, 12, 40]) {
    assert.equal(besselJ0(x), besselJ0(-x), `evenness fails at x = ${x}`)
  }
})

// CONTRACT: "Abramowitz & Stegun rational approximations" for J₀, whose
// accuracy is documented on the sibling entry as "roughly 1e-8".
test('besselJ0: matches J₀ reference values', () => {
  const ref = [
    [0, 1],
    [1, 0.7651976865579666],
    [2, 0.2238907791412357],
    [5, -0.1775967713143383],
    [10, -0.2459357644513483],
    [20, 0.1670246643405886],
  ]
  for (const [x, expected] of ref) {
    near(besselJ0(x), expected, 1e-8, `J0(${x}):`)
  }
})

// CONTRACT: "**Purity:** `@pure` ... change nothing observable."
test('besselJ0: @pure — equal inputs give equal outputs', () => {
  assert.equal(besselJ0(3.3), besselJ0(3.3))
  assert.equal(besselJ0(12.7), besselJ0(12.7))
})

// ---------------------------------------------------------------------------
// struveH1(x)

// CONTRACT: "`number` — H₁(x); exactly 0 at x = 0, which the series form cannot
// evaluate directly."
test('struveH1: exactly 0 at x = 0', () => {
  assert.equal(struveH1(0), 0)
})

// CONTRACT: "`number` — H₁(x)"
test('struveH1: returns a finite number', () => {
  for (const x of [0, 0.1, 1, 5, 8, 20, 100]) {
    const v = struveH1(x)
    assert.equal(typeof v, 'number')
    assert.ok(Number.isFinite(v), `H1(${x}) must be finite, got ${v}`)
  }
})

// CONTRACT: "Struve function H₁, via the Aarts & Janssen (2003) approximation."
// The defining series of H₁ begins H₁(x) = (2/π)·x²/3 − …, so the leading
// small-argument behaviour is fixed by the function the contract names.
// Tolerance 2% relative at x = 0.05, where the next series term is ~1e-4 of
// the leading one — well inside 2%.
test('struveH1: matches the small-argument behaviour of H₁', () => {
  for (const x of [0.02, 0.05]) {
    relNear(struveH1(x), (2 / Math.PI) * (x * x) / 3, 0.02, `H1(${x}):`)
  }
})

// CONTRACT: "**Purity:** `@pure` ... change nothing observable."
test('struveH1: @pure — equal inputs give equal outputs', () => {
  assert.equal(struveH1(3.3), struveH1(3.3))
})

// ---------------------------------------------------------------------------
// radiationImpedance(S, solidAngle, w)

const ANGLES = ['free', 'half', 'quarter', 'eighth', 'rigid', 'anechoic']

// CONTRACT: "`Complex` — Acoustic radiation impedance, Pa·s/m³."
test('radiationImpedance: returns a Complex', () => {
  for (const a of ANGLES) {
    const z = radiationImpedance(0.05, a, 2 * Math.PI * 50)
    assert.equal(typeof z.re, 'number', `${a}: re must be a number`)
    assert.equal(typeof z.im, 'number', `${a}: im must be a number`)
    assert.ok(!Number.isNaN(z.re) && !Number.isNaN(z.im), `${a}: must not be NaN`)
  }
})

// CONTRACT postcondition: "Re(result) >= 0 for every solid angle"
test('radiationImpedance: Re(result) >= 0 for every solid angle', () => {
  for (const a of [...ANGLES, 'no-such-angle']) {
    for (const S of [1e-6, 0.001, 0.05, 1]) {
      for (const w of [0, 1, 2 * Math.PI * 20, 2 * Math.PI * 1000, 2 * Math.PI * 20000]) {
        const z = radiationImpedance(S, a, w)
        assert.ok(z.re >= 0, `${a} S=${S} w=${w}: Re = ${z.re}`)
      }
    }
  }
})

// CONTRACT: "`solidAngle` — ... Unrecognised values fall back to half space."
test('radiationImpedance: unrecognised solid angles fall back to half space', () => {
  for (const w of [0, 2 * Math.PI * 50, 2 * Math.PI * 5000]) {
    const bogus = radiationImpedance(0.05, 'no-such-angle', w)
    const half = radiationImpedance(0.05, 'half', w)
    assert.equal(bogus.re, half.re, `w=${w}: re must match half space`)
    assert.equal(bogus.im, half.im, `w=${w}: im must match half space`)
  }
})

// CONTRACT: "`anechoic` returns the real characteristic impedance ρc/S (a
// perfectly absorbing end with no reflection)."
test('radiationImpedance: anechoic returns the real characteristic impedance ρc/S', () => {
  const z1 = radiationImpedance(1, 'anechoic', 2 * Math.PI * 100)
  assert.equal(z1.im, 0, 'anechoic impedance must be purely real')
  assert.ok(z1.re > 0, `anechoic Re must be positive, got ${z1.re}`)
  // Independent of frequency.
  const z1b = radiationImpedance(1, 'anechoic', 2 * Math.PI * 5000)
  assert.equal(z1b.re, z1.re)
  assert.equal(z1b.im, 0)
  // Scales exactly as 1/S, and the constant is ρc — RHO · C_AIR from
  // src/engine/geometry.js, the only published values for those constants.
  for (const S of [0.001, 0.05, 1, 2]) {
    const z = radiationImpedance(S, 'anechoic', 2 * Math.PI * 100)
    assert.equal(z.im, 0, `S=${S}: anechoic must be purely real`)
    relNear(z.re * S, z1.re, 1e-12, `S=${S}: ρc from re·S:`)
    relNear(z.re, (RHO * C_AIR) / S, 1e-12, `S=${S}: must equal ρc/S:`)
  }
})

// CONTRACT: "`rigid` returns a near-infinite impedance (a closed wall passes no
// volume velocity)". "Near-infinite" is operationalised here as at least 1e6
// times the characteristic impedance ρc/S of the same opening — a wall must be
// overwhelmingly stiffer than a perfect absorber, and no finite modelling
// choice below that factor would "pass no volume velocity".
test('radiationImpedance: rigid returns a near-infinite impedance', () => {
  for (const S of [0.001, 0.05, 1]) {
    const rigid = radiationImpedance(S, 'rigid', 2 * Math.PI * 100)
    const anechoic = radiationImpedance(S, 'anechoic', 2 * Math.PI * 100)
    const mag = Math.hypot(rigid.re, rigid.im)
    assert.ok(
      mag >= 1e6 * anechoic.re,
      `S=${S}: |Z_rigid| = ${mag} must be >= 1e6 · ρc/S = ${1e6 * anechoic.re}`,
    )
  }
})

// CONTRACT: "Smaller solid angles raise the low-frequency radiation resistance
// by 2π/Ω — this is the corner loading that makes a subwoofer louder in a room
// corner". Ω comes from the published SOLID_ANGLES map, and the baseline is the
// flanged piston (2π, i.e. `half`).
// Tolerance 2% relative: at 2ka ≈ 1e-3 the piston resistance is deep in its
// ka² regime, where the documented interpolation is at its asymptote.
test('radiationImpedance: low-frequency resistance scales as 2π/Ω', () => {
  const S = 0.01
  const w = 1 // ~0.16 Hz: deep in the low-frequency limit
  const half = radiationImpedance(S, 'half', w).re
  assert.ok(half > 0, `half-space Re must be positive at w=${w}, got ${half}`)
  for (const angle of ['free', 'half', 'quarter', 'eighth']) {
    const factor = (2 * Math.PI) / SOLID_ANGLES[angle]
    relNear(radiationImpedance(S, angle, w).re, factor * half, 0.02, `${angle} (2π/Ω = ${factor}):`)
  }
  // And the ordering the prose describes: each step down raises the resistance.
  const re = (a) => radiationImpedance(S, a, w).re
  assert.ok(re('free') < re('half'), 'half space must load more than free air')
  assert.ok(re('half') < re('quarter'), 'quarter space must load more than half')
  assert.ok(re('quarter') < re('eighth'), 'eighth space must load more than quarter')
})

// CONTRACT: "while converging to ρc/S at high ka, where the piston no longer
// knows what is behind it."
test('radiationImpedance: converges to ρc/S at high ka', () => {
  const S = 0.05
  const w = 2 * Math.PI * 20000
  const rhoC_over_S = radiationImpedance(S, 'anechoic', w).re
  for (const a of ['free', 'half', 'quarter', 'eighth']) {
    // 5% relative: "converging" at 20 kHz for a 0.05 m² piston (2ka ≈ 90) is
    // asymptotic, not exact.
    relNear(radiationImpedance(S, a, w).re, rhoC_over_S, 0.05, `${a} at high ka:`)
  }
})

// CONTRACT precondition: "w >= 0" — w = 0 is the boundary of the satisfied
// range and must yield a usable (finite, non-negative-resistance) impedance.
test('radiationImpedance: w = 0 boundary of the w >= 0 precondition', () => {
  for (const a of ANGLES) {
    const z = radiationImpedance(0.05, a, 0)
    assert.ok(!Number.isNaN(z.re) && !Number.isNaN(z.im), `${a}: NaN at w = 0`)
    assert.ok(z.re >= 0, `${a}: Re = ${z.re} at w = 0`)
  }
})

// CONTRACT: "`S` — `number` — Piston area, m². Clamped to ≥1e-8 when deriving
// the radius, so a degenerate port cannot produce a NaN radius." — below the
// clamp the derived radius, and therefore the ka-dependence, is that of S = 1e-8.
test('radiationImpedance: S is clamped to 1e-8 when deriving the radius', () => {
  const w = 2 * Math.PI * 1000
  for (const a of ['free', 'half', 'quarter', 'eighth']) {
    const tiny = radiationImpedance(1e-12, a, w)
    const clamp = radiationImpedance(1e-8, a, w)
    assert.ok(!Number.isNaN(tiny.re) && !Number.isNaN(tiny.im), `${a}: NaN below clamp`)
    // The ρc/S prefactor still uses the true S, so compare the dimensionless
    // ka-dependent factor Z·S/(ρc), which must be identical below the clamp.
    const rhoC = radiationImpedance(1, 'anechoic', w).re
    relNear(
      (tiny.re * 1e-12) / rhoC, (clamp.re * 1e-8) / rhoC, 1e-9,
      `${a}: clamped radius factor:`,
    )
  }
})

// CONTRACT: "**Purity:** `@pure` ... change nothing observable."
test('radiationImpedance: @pure — equal inputs give equal outputs', () => {
  for (const a of ANGLES) {
    const z1 = radiationImpedance(0.05, a, 2 * Math.PI * 100)
    const z2 = radiationImpedance(0.05, a, 2 * Math.PI * 100)
    assert.equal(z1.re, z2.re, `${a}: re`)
    assert.equal(z1.im, z2.im, `${a}: im`)
  }
})

// ---------------------------------------------------------------------------
// tlineMatrix(S, L, w, Q, c, extraAlpha)

// CONTRACT: "`ABCD` — The two-port matrix for the line."
test('tlineMatrix: returns an ABCD matrix', () => {
  assertIsABCD(tlineMatrix(0.01, 0.5, 2 * Math.PI * 100, null))
})

// CONTRACT: "`Q` — `number|null` — Loss factor. `null`, `Infinity` or ≤0 all
// mean lossless."
test('tlineMatrix: null, Infinity and ≤0 Q all mean lossless', () => {
  const args = [0.01, 0.5, 2 * Math.PI * 100]
  const base = tlineMatrix(...args, null)
  for (const q of [Infinity, 0, -1, -1e9]) {
    assertMatNear(tlineMatrix(...args, q), base, TOL, `Q=${q}:`)
  }
  // A neighbouring finite positive Q must NOT be lossless.
  const lossy = tlineMatrix(...args, 5)
  let differs = false
  for (let i = 0; i < 2; i++) {
    for (let j = 0; j < 2; j++) {
      if (lossy[i][j].re !== base[i][j].re || lossy[i][j].im !== base[i][j].im) differs = true
    }
  }
  assert.ok(differs, 'a finite positive Q must introduce loss')
})

// CONTRACT: "`extraAlpha` — `number` _(optional, default `0`)_ — Additional
// attenuation, nepers/m, added on top of the Q-derived term."
test('tlineMatrix: extraAlpha defaults to 0', () => {
  const omitted = tlineMatrix(0.01, 0.5, 2 * Math.PI * 100, 10, 343)
  const explicit = tlineMatrix(0.01, 0.5, 2 * Math.PI * 100, 10, 343, 0)
  assertMatNear(omitted, explicit, TOL)
  // And a non-zero extraAlpha must change the result.
  const extra = tlineMatrix(0.01, 0.5, 2 * Math.PI * 100, 10, 343, 2)
  assert.notEqual(extra[0][0].re, omitted[0][0].re)
})

// CONTRACT: "`c` — `number` _(optional, default `C_AIR`)_ — Speed of sound,
// m/s." C_AIR is published by src/engine/geometry.js with the value 344, so
// omitting c must be identical to passing C_AIR, and to passing 344.
test('tlineMatrix: c defaults to C_AIR', () => {
  const w = 2 * Math.PI * 100
  const omitted = tlineMatrix(0.01, 0.5, w, null)
  assertMatNear(tlineMatrix(0.01, 0.5, w, null, C_AIR), omitted, TOL, 'c = C_AIR:')
  assertMatNear(tlineMatrix(0.01, 0.5, w, null, 344), omitted, TOL, 'c = 344:')
  // Also with a lossy Q and an explicit extraAlpha, so the default is not only
  // exercised on the lossless path.
  assertMatNear(
    tlineMatrix(0.01, 0.5, w, 25, C_AIR, 0.3),
    tlineMatrix(0.01, 0.5, w, 25, undefined, 0.3),
    TOL, 'c = undefined must fall back to C_AIR:',
  )
  const slow = tlineMatrix(0.01, 0.5, w, null, 100)
  assert.notEqual(slow[0][0].re, omitted[0][0].re, 'c must be honoured when supplied')
})

// CONTRACT: "Because it is a true distributed line rather than a lumped
// compliance, standing waves at n·c/2L appear naturally in the response".
// At f = n·c/2L the line is n half-wavelengths long: kL = nπ, so
// cosh(jkL) = cos(nπ) = ±1 and sinh(jkL) = j·sin(nπ) = 0.
test('tlineMatrix: standing waves at n·c/2L', () => {
  const c = 343
  const L = 1
  const S = 0.01
  for (const n of [1, 2, 3]) {
    const w = 2 * Math.PI * ((n * c) / (2 * L))
    const M = tlineMatrix(S, L, w, null, c)
    const sign = n % 2 === 0 ? 1 : -1
    // Tolerance 1e-9: sin(nπ) is evaluated from a float multiple of π, so it
    // is ~1e-16 rather than exactly 0, amplified only by the ρc/S prefactor.
    near(M[0][0].re, sign, 1e-9, `n=${n} A.re:`)
    near(M[0][0].im, 0, 1e-9, `n=${n} A.im:`)
    near(M[1][1].re, sign, 1e-9, `n=${n} D.re:`)
    near(M[1][1].im, 0, 1e-9, `n=${n} D.im:`)
    near(M[0][1].re, 0, 1e-9, `n=${n} B.re:`)
    near(M[1][0].re, 0, 1e-9, `n=${n} C.re:`)
    // B and C are ρc/S · sin and sin/(ρc/S) — relative to those scales the
    // imaginary parts must vanish too; compare against the B/C magnitudes at a
    // quarter-wave frequency, where they are maximal.
    const quarter = tlineMatrix(S, L, 2 * Math.PI * (c / (4 * L)), null, c)
    assert.ok(
      Math.abs(M[0][1].im) < 1e-6 * Math.abs(quarter[0][1].im),
      `n=${n}: B must vanish at a half-wave multiple`,
    )
    assert.ok(
      Math.abs(M[1][0].im) < 1e-6 * Math.abs(quarter[1][0].im),
      `n=${n}: C must vanish at a half-wave multiple`,
    )
  }
})

// CONTRACT (src/engine/complex.js, `propagate`): "The determinant ... is
// exactly 1 for a reciprocal lossless network". A lossless uniform line is such
// a network, so det = AD − BC = 1.
test('tlineMatrix: a lossless line has determinant 1', () => {
  for (const w of [2 * Math.PI * 20, 2 * Math.PI * 200, 2 * Math.PI * 2000]) {
    const M = tlineMatrix(0.01, 0.5, w, null, 343)
    const [[A, B], [Cc, D]] = M
    const detRe = A.re * D.re - A.im * D.im - (B.re * Cc.re - B.im * Cc.im)
    const detIm = A.re * D.im + A.im * D.re - (B.re * Cc.im + B.im * Cc.re)
    near(detRe, 1, 1e-9, `w=${w} det.re:`)
    near(detIm, 0, 1e-9, `w=${w} det.im:`)
  }
})

// CONTRACT: "Loss enters as an attenuation constant α = k/2Q, so a given Q
// costs the same fraction of amplitude per wavelength at every frequency." —
// a lower Q means more loss, so the through-amplitude |A| grows away from the
// lossless value as Q falls.
test('tlineMatrix: lower Q means more loss', () => {
  const w = 2 * Math.PI * 500
  const lossless = tlineMatrix(0.01, 1, w, null, 343)
  const q50 = tlineMatrix(0.01, 1, w, 50, 343)
  const q5 = tlineMatrix(0.01, 1, w, 5, 343)
  const dev = (M) => Math.hypot(M[0][0].re - lossless[0][0].re, M[0][0].im - lossless[0][0].im)
  assert.ok(dev(q5) > dev(q50), `expected ${dev(q5)} > ${dev(q50)}`)
  assert.ok(dev(q50) > 0, 'a finite Q must deviate from the lossless matrix')
})

// CONTRACT precondition: "S > 0" — correct behaviour across the satisfied
// range, including very small and very large areas.
test('tlineMatrix: correct across the S > 0 range', () => {
  for (const S of [1e-8, 1e-4, 0.05, 10]) {
    const M = tlineMatrix(S, 0.5, 2 * Math.PI * 100, 20)
    assertIsABCD(M)
    for (const row of M) {
      for (const z of row) {
        assert.ok(Number.isFinite(z.re) && Number.isFinite(z.im), `S=${S}: non-finite entry`)
      }
    }
  }
})

// CONTRACT: "**Purity:** `@pure` ... change nothing observable."
test('tlineMatrix: @pure — equal inputs give equal outputs', () => {
  const a = tlineMatrix(0.01, 0.5, 2 * Math.PI * 100, 20, 343, 0.1)
  const b = tlineMatrix(0.01, 0.5, 2 * Math.PI * 100, 20, 343, 0.1)
  assert.deepEqual(snapMat(a), snapMat(b))
})

// ---------------------------------------------------------------------------
// seriesMassMatrix(M, w)

// CONTRACT: "ABCD matrix of a lumped series acoustic mass: `[[1, jωM], [0, 1]]`."
test('seriesMassMatrix: returns [[1, jωM], [0, 1]]', () => {
  for (const [M, w] of [[0, 0], [12.5, 2 * Math.PI * 100], [0.001, 1], [500, 12345]]) {
    const A = seriesMassMatrix(M, w)
    assertIsABCD(A)
    // Relative tolerance 1e-12 on the jωM term: ωM reaches ~6e6 here.
    near(A[0][0].re, 1, TOL, `M=${M} w=${w} A.re:`)
    near(A[0][0].im, 0, TOL, `M=${M} w=${w} A.im:`)
    near(A[0][1].re, 0, TOL, `M=${M} w=${w} B.re:`)
    relNear(A[0][1].im, w * M, 1e-12, `M=${M} w=${w} B.im:`)
    near(A[1][0].re, 0, TOL, `M=${M} w=${w} C.re:`)
    near(A[1][0].im, 0, TOL, `M=${M} w=${w} C.im:`)
    near(A[1][1].re, 1, TOL, `M=${M} w=${w} D.re:`)
    near(A[1][1].im, 0, TOL, `M=${M} w=${w} D.im:`)
  }
})

// CONTRACT: "**Purity:** `@pure` ... change nothing observable."
test('seriesMassMatrix: @pure — equal inputs give equal outputs', () => {
  assert.deepEqual(
    snapMat(seriesMassMatrix(12.5, 628.3)),
    snapMat(seriesMassMatrix(12.5, 628.3)),
  )
})

// ---------------------------------------------------------------------------
// waveguideMatrix(seg, w, N)

const baseSeg = () => ({
  S1: 0.01, S2: 0.04, L: 0.5, flare: 'exponential', Q: 30,
  ecThroat: 0, ecMouth: 0,
})

// CONTRACT: "`ABCD` — The two-port matrix for the whole segment, throat to mouth."
test('waveguideMatrix: returns an ABCD matrix', () => {
  const M = waveguideMatrix(baseSeg(), 2 * Math.PI * 100)
  assertIsABCD(M)
  for (const row of M) {
    for (const z of row) {
      assert.ok(Number.isFinite(z.re) && Number.isFinite(z.im), 'entries must be finite')
    }
  }
})

// CONTRACT postcondition: "seg is not modified"
test('waveguideMatrix: seg is not modified', () => {
  const seg = baseSeg()
  const before = structuredClone(seg)
  waveguideMatrix(seg, 2 * Math.PI * 100, 24)
  assert.deepEqual(seg, before)
})

// CONTRACT: "`N` — `number` _(optional, default `24`)_ — Number of slices." and
// "24 slices is the point past which the response stops visibly changing."
test('waveguideMatrix: N defaults to 24', () => {
  const w = 2 * Math.PI * 100
  const omitted = waveguideMatrix(baseSeg(), w)
  const explicit = waveguideMatrix(baseSeg(), w, 24)
  assertMatNear(omitted, explicit, TOL)
  // N must actually be honoured: a much coarser slicing gives a different matrix.
  const coarse = waveguideMatrix(baseSeg(), w, 2)
  assert.notEqual(coarse[0][1].im, omitted[0][1].im)
})

// CONTRACT: "`seg.ecThroat` — `number` _(optional, default `0`)_ — Throat
// end-correction length, m. Skipped when ≤0." / same for `seg.ecMouth`.
test('waveguideMatrix: ecThroat/ecMouth default to 0 and are skipped when ≤0', () => {
  const w = 2 * Math.PI * 100
  const without = { S1: 0.01, S2: 0.04, L: 0.5, flare: 'exponential', Q: 30 }
  const zeros = { ...without, ecThroat: 0, ecMouth: 0 }
  const negative = { ...without, ecThroat: -0.05, ecMouth: -0.05 }
  const ref = waveguideMatrix(zeros, w, 24)
  assertMatNear(waveguideMatrix(without, w, 24), ref, TOL, 'omitted:')
  assertMatNear(waveguideMatrix(negative, w, 24), ref, TOL, 'negative (skipped):')
  // A positive end correction must change the matrix.
  const withEC = { ...without, ecThroat: 0.05, ecMouth: 0.05 }
  assert.notEqual(waveguideMatrix(withEC, w, 24)[0][1].im, ref[0][1].im)
})

// CONTRACT: "The segment is discretized into N short uniform slices sampled at
// the midpoint of the exact area profile, then cascaded." — for a
// constant-area segment every slice is the same uniform line, and cascading N
// lines of length L/N is the line of length L, i.e. `tlineMatrix(S, L, w, Q)`.
test('waveguideMatrix: a constant-area segment equals the equivalent uniform line', () => {
  const w = 2 * Math.PI * 250
  const seg = { S1: 0.02, S2: 0.02, L: 0.6, flare: 'conical', Q: null, ecThroat: 0, ecMouth: 0 }
  const M = waveguideMatrix(seg, w, 24)
  const line = tlineMatrix(0.02, 0.6, w, null)
  // Relative tolerance 1e-9 against the largest entry magnitude: the cascade is
  // ~24 complex matrix products, so a few hundred ulps at worst.
  const scale = Math.max(
    ...[].concat(...line.map((r) => r.map((z) => Math.hypot(z.re, z.im)))),
  )
  assertMatNear(M, line, 1e-9 * scale)
})

// CONTRACT precondition: "N >= 1 && seg.L > 0 && seg.S1 > 0" — N = 1 is the
// boundary of the satisfied range.
test('waveguideMatrix: N = 1 boundary of the N >= 1 precondition', () => {
  const M = waveguideMatrix(baseSeg(), 2 * Math.PI * 100, 1)
  assertIsABCD(M)
  for (const row of M) {
    for (const z of row) {
      assert.ok(Number.isFinite(z.re) && Number.isFinite(z.im), 'N=1 entries must be finite')
    }
  }
})

// CONTRACT: "**Purity:** `@pure` ... change nothing observable."
test('waveguideMatrix: @pure — arguments unmodified, repeatable', () => {
  const seg = baseSeg()
  const before = structuredClone(seg)
  const r1 = waveguideMatrix(seg, 2 * Math.PI * 100, 24)
  const r2 = waveguideMatrix(structuredClone(before), 2 * Math.PI * 100, 24)
  assert.deepEqual(seg, before)
  assert.deepEqual(snapMat(r1), snapMat(r2))
})

// ---------------------------------------------------------------------------
// chamberMatrix(chamber, w, lumped)

const baseChamber = () => ({ volume: 0.05, length: 0.4, Q: 20, stuffing: 0 })

// CONTRACT: "`ABCD` — The two-port matrix for the chamber."
test('chamberMatrix: returns an ABCD matrix', () => {
  const M = chamberMatrix(baseChamber(), 2 * Math.PI * 100)
  assertIsABCD(M)
  for (const row of M) {
    for (const z of row) {
      assert.ok(Number.isFinite(z.re) && Number.isFinite(z.im), 'entries must be finite')
    }
  }
})

// CONTRACT postcondition: "chamber is not modified"
test('chamberMatrix: chamber is not modified', () => {
  const chamber = baseChamber()
  const before = structuredClone(chamber)
  chamberMatrix(chamber, 2 * Math.PI * 100, false)
  assert.deepEqual(chamber, before)
  const stuffed = { volume: 0.05, length: 0.4, Q: 20, stuffing: 4 }
  const stuffedBefore = structuredClone(stuffed)
  chamberMatrix(stuffed, 2 * Math.PI * 100, true)
  assert.deepEqual(stuffed, stuffedBefore)
})

// CONTRACT: "`chamber.stuffing` — `number` _(optional, default `0`)_ —
// Stuffing density, g/L. 0 is empty."
test('chamberMatrix: stuffing defaults to 0', () => {
  const w = 2 * Math.PI * 100
  const omitted = chamberMatrix({ volume: 0.05, length: 0.4, Q: 20 }, w)
  const explicit = chamberMatrix({ volume: 0.05, length: 0.4, Q: 20, stuffing: 0 }, w)
  assertMatNear(omitted, explicit, TOL)
  // Stuffing must actually do something.
  const stuffed = chamberMatrix({ volume: 0.05, length: 0.4, Q: 20, stuffing: 4 }, w)
  assert.notEqual(stuffed[0][0].re, omitted[0][0].re)
})

// CONTRACT: "`lumped` — `boolean` _(optional, default `false`)_ — When true,
// return a pure shunt compliance instead of a line".
test('chamberMatrix: lumped defaults to false', () => {
  const w = 2 * Math.PI * 100
  const omitted = chamberMatrix(baseChamber(), w)
  const explicitFalse = chamberMatrix(baseChamber(), w, false)
  assertMatNear(omitted, explicitFalse, TOL)
  const lumped = chamberMatrix(baseChamber(), w, true)
  assert.notEqual(lumped[0][1].im, omitted[0][1].im, 'lumped must differ from the line')
})

// CONTRACT: "When true, return a pure shunt compliance instead of a line,
// hiding standing-wave artifacts." A pure shunt element has the ABCD form
// [[1, 0], [Y, 1]] — no series term at all.
test('chamberMatrix: lumped returns a pure shunt compliance', () => {
  const w = 2 * Math.PI * 100
  const M = chamberMatrix(baseChamber(), w, true)
  near(M[0][0].re, 1, TOL, 'A.re:')
  near(M[0][0].im, 0, TOL, 'A.im:')
  near(M[0][1].re, 0, TOL, 'B.re:')
  near(M[0][1].im, 0, TOL, 'B.im:')
  near(M[1][1].re, 1, TOL, 'D.re:')
  near(M[1][1].im, 0, TOL, 'D.im:')
  assert.ok(
    Math.hypot(M[1][0].re, M[1][0].im) > 0,
    'the shunt admittance C must be non-zero',
  )
})

// CONTRACT: "`chamber.length` — `number` — Acoustic path length, m. The floor
// of 1e-4 applies only to the Volume/Length division that derives the
// cross-section; the line itself is built at the length as given, so a length
// of 0 yields a zero-length line rather than a 1e-4 one."
// Combined with "modelled as a finite transmission line" and "a line of area
// Volume/Length", the chamber is exactly `tlineMatrix(V/max(L,1e-4), L, w, Q)`
// when unstuffed.
test('chamberMatrix: the 1e-4 floor applies to the derived area, not the line length', () => {
  const w = 2 * Math.PI * 100
  const V = 0.05
  const scaleOf = (M) => Math.max(
    ...[].concat(...M.map((r) => r.map((z) => Math.hypot(z.re, z.im)))), 1,
  )
  for (const L of [0.4, 1e-2, 1e-4, 1e-5, 1e-9]) {
    const area = V / Math.max(L, 1e-4)
    const line = tlineMatrix(area, L, w, null)
    const M = chamberMatrix({ volume: V, length: L, Q: null }, w)
    // Relative tolerance 1e-12 against the largest entry magnitude: the two
    // routes should be the same arithmetic, so only round-off may differ.
    assertMatNear(M, line, 1e-12 * scaleOf(line), `length=${L}:`)
  }
})

// CONTRACT: "so a length of 0 yields a zero-length line rather than a 1e-4 one."
// A zero-length line is the identity two-port (see `matIdentity`: "the identity
// two-port, representing a lossless connection of zero length").
test('chamberMatrix: a length of 0 yields a zero-length line', () => {
  const w = 2 * Math.PI * 100
  const M = chamberMatrix({ volume: 0.05, length: 0, Q: 20 }, w)
  near(M[0][0].re, 1, 1e-12, 'A.re:')
  near(M[0][0].im, 0, 1e-12, 'A.im:')
  near(M[0][1].re, 0, 1e-12, 'B.re:')
  near(M[0][1].im, 0, 1e-12, 'B.im:')
  near(M[1][0].re, 0, 1e-12, 'C.re:')
  near(M[1][0].im, 0, 1e-12, 'C.im:')
  near(M[1][1].re, 1, 1e-12, 'D.re:')
  near(M[1][1].im, 0, 1e-12, 'D.im:')
  // Explicitly NOT the 1e-4-length chamber, which the old wording implied.
  const floored = chamberMatrix({ volume: 0.05, length: 1e-4, Q: 20 }, w)
  assert.notEqual(
    floored[0][1].im, M[0][1].im,
    'length 0 must not be treated as a line of length 1e-4',
  )
})

// CONTRACT: "The floor of 1e-4 applies only to the Volume/Length division that
// derives the cross-section" — below the floor the area stops changing, but the
// line length keeps shrinking, so two sub-floor lengths still differ.
test('chamberMatrix: sub-floor lengths share an area but not a line length', () => {
  const w = 2 * Math.PI * 100
  const a = chamberMatrix({ volume: 0.05, length: 1e-5, Q: null }, w)
  const b = chamberMatrix({ volume: 0.05, length: 1e-6, Q: null }, w)
  assert.notEqual(
    a[0][1].im, b[0][1].im,
    'the line length below the floor must still be the length as given',
  )
  // Both use the same clamped area V/1e-4. Tolerance 1e-12 absolute: the
  // matrix entries here are O(1) (diagonal) and O(1e-5) (off-diagonal), so
  // 1e-12 is far tighter than any difference in the derived area would produce.
  const area = 0.05 / 1e-4
  assertMatNear(a, tlineMatrix(area, 1e-5, w, null), 1e-12, 'length=1e-5:')
  assertMatNear(b, tlineMatrix(area, 1e-6, w, null), 1e-12, 'length=1e-6:')
})

// CONTRACT: "Treating a box as a line of area Volume/Length" — above the floor,
// doubling the length at fixed volume halves the cross-section.
test('chamberMatrix: above the floor the area is Volume/Length', () => {
  const w = 2 * Math.PI * 100
  const M = chamberMatrix({ volume: 0.08, length: 0.5, Q: null }, w)
  const scale = Math.max(
    ...[].concat(...M.map((r) => r.map((z) => Math.hypot(z.re, z.im)))), 1,
  )
  assertMatNear(M, tlineMatrix(0.08 / 0.5, 0.5, w, null), 1e-12 * scale)
  const longer = chamberMatrix({ volume: 0.08, length: 1, Q: null }, w)
  const scale2 = Math.max(
    ...[].concat(...longer.map((r) => r.map((z) => Math.hypot(z.re, z.im)))), 1,
  )
  assertMatNear(longer, tlineMatrix(0.08 / 1, 1, w, null), 1e-12 * scale2)
})

// CONTRACT: "Stuffing does two things: it slows sound as the process shifts
// from adiabatic toward isothermal (up to −15.5% at 8 g/L, where the model
// saturates)".
test('chamberMatrix: the stuffing model saturates at 8 g/L', () => {
  const w = 2 * Math.PI * 100
  const at8 = chamberMatrix({ volume: 0.05, length: 0.4, Q: 20, stuffing: 8 }, w)
  for (const stuffing of [8.1, 12, 100]) {
    assertMatNear(
      chamberMatrix({ volume: 0.05, length: 0.4, Q: 20, stuffing }, w), at8, TOL,
      `stuffing=${stuffing} must saturate at the 8 g/L value:`,
    )
  }
})

// CONTRACT: "it adds resistive loss, combined with the node's own Q in
// parallel." — combining in parallel can only lower Q, so a stuffed chamber is
// never less lossy than the same chamber unstuffed.
test('chamberMatrix: stuffing adds loss on top of the node Q', () => {
  const w = 2 * Math.PI * 100
  const dry = chamberMatrix({ volume: 0.05, length: 0.4, Q: 20, stuffing: 0 }, w)
  const wet = chamberMatrix({ volume: 0.05, length: 0.4, Q: 20, stuffing: 4 }, w)
  const lossless = chamberMatrix({ volume: 0.05, length: 0.4, Q: null, stuffing: 0 }, w)
  const dev = (M) => Math.hypot(M[0][0].re - lossless[0][0].re, M[0][0].im - lossless[0][0].im)
  assert.ok(dev(wet) > dev(dry), `expected stuffed deviation ${dev(wet)} > dry ${dev(dry)}`)
})

// CONTRACT precondition: "chamber.volume > 0" — correct behaviour across the
// satisfied range.
test('chamberMatrix: correct across the volume > 0 range', () => {
  const w = 2 * Math.PI * 100
  for (const volume of [1e-6, 1e-3, 0.05, 5]) {
    const M = chamberMatrix({ volume, length: 0.4, Q: 20 }, w)
    for (const row of M) {
      for (const z of row) {
        assert.ok(
          Number.isFinite(z.re) && Number.isFinite(z.im),
          `volume=${volume}: non-finite entry`,
        )
      }
    }
  }
})

// CONTRACT: "**Purity:** `@pure` ... change nothing observable."
test('chamberMatrix: @pure — arguments unmodified, repeatable', () => {
  const chamber = baseChamber()
  const before = structuredClone(chamber)
  const r1 = chamberMatrix(chamber, 2 * Math.PI * 100, false)
  const r2 = chamberMatrix(structuredClone(before), 2 * Math.PI * 100, false)
  assert.deepEqual(chamber, before)
  assert.deepEqual(snapMat(r1), snapMat(r2))
})

// ---------------------------------------------------------------------------
// combineQ(...qs)

// CONTRACT: "Losses add as reciprocals — `1/Q = Σ 1/Qᵢ`"
test('combineQ: combines as 1/Q = Σ 1/Qᵢ', () => {
  const v = combineQ(2, 2)
  assert.equal(typeof v, 'number')
  near(v, 1)
  near(combineQ(10, 20), 20 / 3)
  near(combineQ(4), 4)
  near(combineQ(3, 6, 9), 1 / (1 / 3 + 1 / 6 + 1 / 9))
})

// CONTRACT: "`number` — The combined Q, or `Infinity` when no argument
// contributes any loss."
test('combineQ: returns Infinity when no argument contributes any loss', () => {
  assert.equal(combineQ(), Infinity)
  assert.equal(combineQ(null), Infinity)
  assert.equal(combineQ(undefined), Infinity)
  assert.equal(combineQ(Infinity), Infinity)
  assert.equal(combineQ(0), Infinity)
  assert.equal(combineQ(-5), Infinity)
  assert.equal(combineQ(NaN), Infinity)
  assert.equal(combineQ(null, undefined, Infinity, 0, -3, NaN), Infinity)
})

// CONTRACT: "Values that are null, non-finite or ≤0 mean 'this mechanism is
// lossless' and are skipped rather than treated as zero."
test('combineQ: null, non-finite and ≤0 values are skipped', () => {
  near(combineQ(5, null), 5)
  near(combineQ(null, 5, undefined), 5)
  near(combineQ(5, Infinity), 5)
  near(combineQ(5, 0), 5)
  near(combineQ(5, -2), 5)
  near(combineQ(5, NaN), 5)
  near(combineQ(null, 10, 0, 20, undefined, -1, Infinity), 20 / 3)
})

// CONTRACT postcondition: "result <= every finite positive input"
// (and: "the combined Q is always at most the lowest input")
test('combineQ: result <= every finite positive input', () => {
  const cases = [[2, 2], [10, 20], [1e-3, 1e6], [7], [3, 6, 9, 12], [5, null, 0, Infinity]]
  for (const qs of cases) {
    const r = combineQ(...qs)
    for (const q of qs) {
      if (typeof q === 'number' && Number.isFinite(q) && q > 0) {
        assert.ok(r <= q, `combineQ(${qs}) = ${r} must be <= ${q}`)
      }
    }
  }
})

// CONTRACT: "**Purity:** `@pure` ... change nothing observable."
test('combineQ: @pure — equal inputs give equal outputs', () => {
  assert.equal(combineQ(3, 6, 9), combineQ(3, 6, 9))
})

// UNREACHABLE — not covered:
// (none — all 9 exports of src/engine/acoustics.js are marked EXPORTED/testable)
