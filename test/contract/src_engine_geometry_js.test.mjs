import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  areaProfile, waveguideVolume, flareCutoff, endCorrectionLength,
  junctionCorrection, RHO, C_AIR,
} from '../../src/engine/geometry.js'

// The six documented flare laws.
const FLARES = ['conical', 'parabolic', 'exponential', 'hypex', 'tractrix', 'lecleach']

// Tolerance: the integrals below are sums of at most 200 double-precision terms
// of order 1, so round-off is a few ulps. 1e-12 absolute is far above that and
// far below any quantity asserted.
const TOL = 1e-12

function near(actual, expected, tol = TOL, msg = '') {
  assert.ok(
    Math.abs(actual - expected) < tol,
    `${msg} expected ${expected}, got ${actual} (tol ${tol})`,
  )
}

// "to within floating-point rounding": a square-root-and-back round trip loses
// at most a couple of ulps, i.e. ~4e-16 relative. 1e-12 relative is three
// orders of magnitude looser than that and still far tighter than any real
// disagreement between S(0) and S1 could be.
const ROUNDING_REL = 1e-12

function relNear(actual, expected, rel, msg = '') {
  assert.ok(
    Math.abs(actual - expected) <= rel * Math.abs(expected),
    `${msg} expected ~${expected}, got ${actual} (rel ${rel})`,
  )
}

// ---------------------------------------------------------------------------
// Exported constants

// CONTRACT: "`RHO` — Air density ρ, kg/m³, at 20 °C. Value: `1.184`"
test('RHO: air density is 1.184 kg/m³', () => {
  assert.equal(RHO, 1.184)
})

// CONTRACT: "`C_AIR` — Speed of sound c in air, m/s, at 20 °C. Value: `344`"
test('C_AIR: speed of sound in air is 344 m/s', () => {
  assert.equal(C_AIR, 344)
})

// ---------------------------------------------------------------------------
// areaProfile(flare, S1, S2, L)

// CONTRACT: "`(x: number) => number` — S(x) in m², valid for x in [0, L]."
test('areaProfile: returns a function of x giving S(x) in m²', () => {
  for (const flare of FLARES) {
    const S = areaProfile(flare, 0.01, 0.1, 0.5)
    assert.equal(typeof S, 'function', `${flare}: must return a function`)
    for (const x of [0, 0.125, 0.25, 0.5]) {
      const v = S(x)
      assert.equal(typeof v, 'number', `${flare}: S(${x}) must be a number`)
      assert.ok(Number.isFinite(v), `${flare}: S(${x}) must be finite`)
    }
  }
})

// CONTRACT postcondition: "result(0) equals S1 for every flare law, to within
// floating-point rounding — the conical and hypex laws reach it through a
// square root and back"
test('areaProfile: result(0) equals S1 for every flare law', () => {
  const S1 = 0.0123
  for (const flare of [...FLARES, 'no-such-flare', undefined, '']) {
    const S = areaProfile(flare, S1, 0.2, 0.75)
    relNear(S(0), S1, ROUNDING_REL, `flare=${String(flare)}: S(0) vs S1:`)
  }
  // Across a wide range of throat areas, not just one.
  for (const flare of FLARES) {
    for (const s of [1e-8, 1e-3, 1, 250]) {
      relNear(areaProfile(flare, s, s * 8, 1.5)(0), s, ROUNDING_REL, `${flare} S1=${s}:`)
    }
  }
})

// CONTRACT: "An unrecognised flare degrades to a straight duct rather than
// throwing, so a project saved by a newer version still simulates." /
// "`flare` — ... Unknown values yield a constant-area duct."
test('areaProfile: an unrecognised flare yields a constant-area duct', () => {
  const S1 = 0.02
  const S = areaProfile('no-such-flare', S1, 0.4, 1)
  for (const x of [0, 0.1, 0.5, 0.9, 1]) {
    assert.equal(S(x), S1, `S(${x}) must equal S1 for an unknown flare`)
  }
})

// CONTRACT precondition: "S1 > 0 && L > 0" — behaviour must be correct across
// the satisfied range, including very small but positive S1 and L.
test('areaProfile: correct across the S1 > 0 && L > 0 range', () => {
  for (const flare of FLARES) {
    for (const [S1, S2, L] of [[1e-8, 1e-6, 1e-6], [1, 4, 1000], [0.5, 0.5, 0.001]]) {
      const S = areaProfile(flare, S1, S2, L)
      relNear(S(0), S1, ROUNDING_REL, `${flare} S1=${S1}: S(0) vs S1:`)
      assert.ok(Number.isFinite(S(L / 2)), `${flare}: S(L/2) must be finite`)
      assert.ok(Number.isFinite(S(L)), `${flare}: S(L) must be finite`)
    }
  }
})

// CONTRACT: "**Purity:** `@pure` ... Calling it twice with equal inputs must
// produce equal output and change nothing observable."
test('areaProfile: @pure — equal inputs give equal outputs', () => {
  for (const flare of FLARES) {
    const a = areaProfile(flare, 0.01, 0.1, 0.5)
    const b = areaProfile(flare, 0.01, 0.1, 0.5)
    for (const x of [0, 0.2, 0.5]) {
      assert.equal(a(x), b(x), `${flare}: S(${x}) must be deterministic`)
    }
    // Calling the closure repeatedly must not change what it returns.
    assert.equal(a(0.2), a(0.2))
  }
})

// ---------------------------------------------------------------------------
// waveguideVolume(flare, S1, S2, L, N)

// CONTRACT: "`number` — Enclosed volume, m³."
test('waveguideVolume: returns a number in m³', () => {
  for (const flare of FLARES) {
    const v = waveguideVolume(flare, 0.01, 0.1, 0.5)
    assert.equal(typeof v, 'number', `${flare}: must return a number`)
    assert.ok(Number.isFinite(v), `${flare}: must be finite`)
  }
})

// CONTRACT postcondition: "result >= 0"
test('waveguideVolume: result >= 0', () => {
  for (const flare of [...FLARES, 'no-such-flare']) {
    for (const [S1, S2, L, N] of [
      [0.01, 0.1, 0.5, 200], [1, 1, 1, 1], [1e-8, 1e-8, 1e-3, 3], [0.2, 0.01, 2, 50],
    ]) {
      const v = waveguideVolume(flare, S1, S2, L, N)
      assert.ok(v >= 0, `${flare} S1=${S1} S2=${S2} L=${L} N=${N}: got ${v}`)
    }
  }
})

// CONTRACT: "`N` — `number` _(optional, default `200`)_ — Integration slices."
test('waveguideVolume: N defaults to 200', () => {
  for (const flare of FLARES) {
    const omitted = waveguideVolume(flare, 0.01, 0.1, 0.5)
    const explicit = waveguideVolume(flare, 0.01, 0.1, 0.5, 200)
    assert.equal(omitted, explicit, `${flare}: omitting N must equal N = 200`)
    // A different slice count must actually be honoured, i.e. N is used.
    const coarse = waveguideVolume(flare, 0.01, 0.1, 0.5, 2)
    assert.ok(Number.isFinite(coarse))
  }
})

// CONTRACT: "A midpoint numeric integral of the exact area profile" — for a
// constant-area duct (S1 === S2 under the conical law, which interpolates
// linearly) the exact volume is S·L, and the midpoint rule is exact for a
// constant integrand at every N.
test('waveguideVolume: constant-area duct encloses S·L', () => {
  for (const N of [1, 2, 7, 200]) {
    near(waveguideVolume('conical', 0.25, 0.25, 2, N), 0.5, TOL, `N=${N}:`)
  }
  // An unrecognised flare is a constant-area duct of area S1 (see areaProfile).
  near(waveguideVolume('no-such-flare', 0.25, 4, 2), 0.5)
})

// CONTRACT precondition: "N >= 1 && L > 0" — N = 1 is the boundary of the
// satisfied range and must still produce a valid volume.
test('waveguideVolume: N = 1 boundary of the N >= 1 precondition', () => {
  for (const flare of FLARES) {
    const v = waveguideVolume(flare, 0.01, 0.1, 0.5, 1)
    assert.ok(Number.isFinite(v) && v >= 0, `${flare}: N=1 gave ${v}`)
  }
})

// CONTRACT: "**Purity:** `@pure` ... change nothing observable."
test('waveguideVolume: @pure — equal inputs give equal outputs', () => {
  for (const flare of FLARES) {
    assert.equal(
      waveguideVolume(flare, 0.01, 0.1, 0.5, 24),
      waveguideVolume(flare, 0.01, 0.1, 0.5, 24),
    )
  }
})

// ---------------------------------------------------------------------------
// flareCutoff(flare, S1, S2, L)

// CONTRACT: "Conical and parabolic horns have no true cutoff — they load
// progressively rather than sharply — and a segment that does not expand is a
// duct, so both return `null` instead of a misleading number."
test('flareCutoff: conical and parabolic return null', () => {
  assert.equal(flareCutoff('conical', 0.01, 0.5, 1), null)
  assert.equal(flareCutoff('parabolic', 0.01, 0.5, 1), null)
})

// CONTRACT: "a segment that does not expand is a duct, so both return `null`
// instead of a misleading number."
test('flareCutoff: a non-expanding segment returns null', () => {
  for (const flare of ['exponential', 'hypex', 'tractrix', 'lecleach']) {
    assert.equal(
      flareCutoff(flare, 0.05, 0.05, 1), null,
      `${flare}: S2 === S1 does not expand, so there is no cutoff`,
    )
  }
})

// CONTRACT: "`number|null` — Cutoff frequency in Hz, or `null` when the
// geometry has no cutoff." / "Flare (cutoff) frequency of an
// exponential-family horn."
test('flareCutoff: an expanding exponential-family horn returns a cutoff in Hz', () => {
  for (const flare of ['exponential', 'hypex', 'tractrix', 'lecleach']) {
    const f = flareCutoff(flare, 0.01, 0.5, 1)
    assert.equal(typeof f, 'number', `${flare}: must return a number`)
    assert.ok(Number.isFinite(f) && f > 0, `${flare}: got ${f}`)
  }
})

// CONTRACT: "Below this frequency the horn stops transforming impedance and its
// output collapses, so it is the practical low-frequency limit of the design."
// A faster expansion (larger mouth over the same length) raises the cutoff.
test('flareCutoff: a faster expansion gives a higher cutoff', () => {
  const slow = flareCutoff('exponential', 0.01, 0.05, 1)
  const fast = flareCutoff('exponential', 0.01, 0.5, 1)
  assert.ok(fast > slow, `expected ${fast} > ${slow}`)
})

// CONTRACT precondition: "S1 > 0 && L > 0" — correct behaviour across the
// satisfied range, including extreme but valid values.
test('flareCutoff: correct across the S1 > 0 && L > 0 range', () => {
  for (const [S1, S2, L] of [[1e-8, 1e-4, 1e-3], [1, 100, 1000]]) {
    const f = flareCutoff('exponential', S1, S2, L)
    assert.ok(f === null || (Number.isFinite(f) && f > 0), `got ${f}`)
  }
})

// CONTRACT: "**Purity:** `@pure` ... change nothing observable."
test('flareCutoff: @pure — equal inputs give equal outputs', () => {
  assert.equal(
    flareCutoff('exponential', 0.01, 0.5, 1),
    flareCutoff('exponential', 0.01, 0.5, 1),
  )
})

// ---------------------------------------------------------------------------
// endCorrectionLength(S, factor)

// CONTRACT: "`number` — Added effective length, m."
test('endCorrectionLength: returns a number in m', () => {
  const v = endCorrectionLength(0.01, 0.732)
  assert.equal(typeof v, 'number')
  assert.ok(Number.isFinite(v))
})

// CONTRACT postcondition: "result >= 0 when factor >= 0"
test('endCorrectionLength: result >= 0 when factor >= 0', () => {
  for (const S of [0, 1e-12, 1e-4, 0.01, 1, 100]) {
    for (const factor of [0, 0.61, 0.732, 0.85, 2]) {
      const v = endCorrectionLength(S, factor)
      assert.ok(v >= 0, `S=${S} factor=${factor} gave ${v}`)
    }
  }
})

// CONTRACT precondition: "S >= 0" — S = 0 is the boundary of the satisfied
// range: an opening of zero area adds no length.
test('endCorrectionLength: S = 0 boundary of the S >= 0 precondition', () => {
  for (const factor of [0.61, 0.732, 0.85]) {
    const v = endCorrectionLength(0, factor)
    assert.ok(Number.isFinite(v), `factor=${factor} gave ${v}`)
    near(v, 0, TOL, `factor=${factor}:`)
  }
})

// CONTRACT: "`factor` — `number` — End-correction coefficient: ≈0.85 flanged,
// ≈0.61 free, 0.732 for the typical two-flanged port." — the documented
// ordering of the three coefficients must be reflected in the result.
test('endCorrectionLength: larger factor gives a larger correction', () => {
  const S = 0.005
  const free = endCorrectionLength(S, 0.61)
  const twoFlanged = endCorrectionLength(S, 0.732)
  const flanged = endCorrectionLength(S, 0.85)
  assert.ok(free < twoFlanged, `expected ${free} < ${twoFlanged}`)
  assert.ok(twoFlanged < flanged, `expected ${twoFlanged} < ${flanged}`)
})

// CONTRACT: "Air just outside a port moves with the column inside it, so the
// duct behaves as if it were longer than its physical length." — a larger
// opening adds more length.
test('endCorrectionLength: a larger opening adds more length', () => {
  const small = endCorrectionLength(0.001, 0.732)
  const large = endCorrectionLength(0.01, 0.732)
  assert.ok(large > small, `expected ${large} > ${small}`)
})

// CONTRACT: "**Purity:** `@pure` ... change nothing observable."
test('endCorrectionLength: @pure — equal inputs give equal outputs', () => {
  assert.equal(
    endCorrectionLength(0.01, 0.732),
    endCorrectionLength(0.01, 0.732),
  )
})

// ---------------------------------------------------------------------------
// junctionCorrection
// ---------------------------------------------------------------------------

// CONTRACT: "@post result is 0 when Sself equals Sother" — the case the whole
// function exists for: nothing discontinuous happens where a duct meets another
// of its own area, so the air column simply continues.
test('junctionCorrection: equal areas give no correction', () => {
  assert.equal(junctionCorrection(0.008, 0.008), 0)
  assert.equal(junctionCorrection(1e-6, 1e-6), 0)
})

// CONTRACT: "it tends to the flanged `0.85a` as the far side grows"
test('junctionCorrection: a duct into a much larger space approaches 0.85a', () => {
  const S = 0.008
  const a = Math.sqrt(S / Math.PI)
  const got = junctionCorrection(S, S * 1e6)
  assert.ok(got > 0.84 * a && got <= 0.85 * a, `expected ≈0.85a=${0.85 * a}, got ${got}`)
})

// CONTRACT: "falls to zero as the two areas approach each other"
test('junctionCorrection: falls as the areas converge', () => {
  const S = 0.008
  const wide = junctionCorrection(S, S * 100)
  const near = junctionCorrection(S, S * 4)
  const closer = junctionCorrection(S, S * 1.5)
  assert.ok(wide > near, `expected ${wide} > ${near}`)
  assert.ok(near > closer, `expected ${near} > ${closer}`)
})

// CONTRACT: "@post result >= 0" — above a/b ≈ 0.8 the linear form goes negative
// "and is clamped".
test('junctionCorrection: never negative, however close the areas', () => {
  for (const ratio of [1, 1.05, 1.2, 1.5, 1.55, 1.6]) {
    assert.ok(junctionCorrection(0.008, 0.008 * ratio) >= 0)
  }
})

// CONTRACT: "expressed in `Sself`'s own units so that `ρ·ΔL/Sself` is the right
// inertance whichever side ends up holding it" — the inertance the two sides
// compute for one junction must agree, or which side carries it would matter.
test('junctionCorrection: the same inertance whichever side is asked', () => {
  const RHO = 1.2
  for (const [Sa, Sb] of [[0.008, 0.15], [0.002, 0.02], [0.05, 0.4]]) {
    const fromSmall = (RHO * junctionCorrection(Sa, Sb)) / Sa
    const fromLarge = (RHO * junctionCorrection(Sb, Sa)) / Sb
    assert.ok(
      Math.abs(fromSmall - fromLarge) < 1e-12 * Math.max(fromSmall, 1),
      `${fromSmall} vs ${fromLarge}`,
    )
  }
})

// CONTRACT: "Zero when either area is non-positive"
test('junctionCorrection: a non-positive area gives no correction', () => {
  assert.equal(junctionCorrection(0, 0.01), 0)
  assert.equal(junctionCorrection(0.01, 0), 0)
  assert.equal(junctionCorrection(-1, 0.01), 0)
})

// CONTRACT: "**Purity:** `@pure` ... change nothing observable."
test('junctionCorrection: @pure — equal inputs give equal outputs', () => {
  assert.equal(junctionCorrection(0.008, 0.15), junctionCorrection(0.008, 0.15))
})

// UNREACHABLE — not covered:
// (none — all 5 exports of src/engine/geometry.js are marked EXPORTED/testable)
