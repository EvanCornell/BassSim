// Acoustic element models: transmission lines, waveguides/horns, radiation
// impedance of a piston in various solid angles. SI units throughout.
import { C, ZERO, ONE, add, mul, div, inv, jw, cosh, sinh, matMul, matIdentity } from './complex.js'
import { RHO, C_AIR, areaProfile, waveguideVolume, flareCutoff, endCorrectionLength } from './geometry.js'

export { RHO, C_AIR, areaProfile, waveguideVolume, flareCutoff, endCorrectionLength }


// ---------- Bessel/Struve approximations for piston radiation ----------

/**
 * Bessel function of the first kind, order 1.
 *
 * Abramowitz & Stegun rational approximations, split at |x| = 8 between the
 * small-argument polynomial and the large-argument asymptotic form. Accurate
 * to roughly 1e-8 — far below the modelling error of the piston assumption
 * itself, and much faster than a series evaluation in the frequency loop.
 *
 * @param {number} x - Argument, dimensionless (here 2ka).
 * @returns {number} J₁(x).
 * @post result === -J1(-x) — the function is odd
 * @pure
 */
export function besselJ1(x) {
  const ax = Math.abs(x)
  let ans
  if (ax < 8) {
    const y = x * x
    const p1 = x * (72362614232.0 + y * (-7895059235.0 + y * (242396853.1 + y * (-2972611.439 + y * (15704.48260 + y * -30.16036606)))))
    const p2 = 144725228442.0 + y * (2300535178.0 + y * (18583304.74 + y * (99447.43394 + y * (376.9991397 + y))))
    ans = p1 / p2
  } else {
    const z = 8 / ax
    const y = z * z
    const xx = ax - 2.356194491
    const p1 = 1.0 + y * (0.183105e-2 + y * (-0.3516396496e-4 + y * (0.2457520174e-5 + y * -0.240337019e-6)))
    const p2 = 0.04687499995 + y * (-0.2002690873e-3 + y * (0.8449199096e-5 + y * (-0.88228987e-6 + y * 0.105787412e-6)))
    ans = Math.sqrt(0.636619772 / ax) * (Math.cos(xx) * p1 - z * Math.sin(xx) * p2)
    if (x < 0) ans = -ans
  }
  return ans
}

/**
 * Bessel function of the first kind, order 0.
 *
 * Abramowitz & Stegun rational approximations, split at |x| = 8. Used only as
 * an input to `struveH1`.
 *
 * @param {number} x - Argument, dimensionless.
 * @returns {number} J₀(x).
 * @post result === J0(-x) — the function is even
 * @pure
 */
export function besselJ0(x) {
  const ax = Math.abs(x)
  if (ax < 8) {
    const y = x * x
    const p1 = 57568490574.0 + y * (-13362590354.0 + y * (651619640.7 + y * (-11214424.18 + y * (77392.33017 + y * -184.9052456))))
    const p2 = 57568490411.0 + y * (1029532985.0 + y * (9494680.718 + y * (59272.64853 + y * (267.8532712 + y))))
    return p1 / p2
  }
  const z = 8 / ax
  const y = z * z
  const xx = ax - 0.785398164
  const p1 = 1.0 + y * (-0.1098628627e-2 + y * (0.2734510407e-4 + y * (-0.2073370639e-5 + y * 0.2093887211e-6)))
  const p2 = -0.1562499995e-1 + y * (0.1430488765e-3 + y * (-0.6911147651e-5 + y * (0.7621095161e-6 + y * -0.934935152e-7)))
  return Math.sqrt(0.636619772 / ax) * (Math.cos(xx) * p1 - z * Math.sin(xx) * p2)
}

/**
 * Struve function H₁, via the Aarts & Janssen (2003) approximation.
 *
 * Supplies the reactive (mass-loading) half of the piston radiation impedance.
 * The approximation is a closed form in J₀, sin and cos, so it costs a handful
 * of flops per frequency point instead of a series summation.
 *
 * @param {number} x - Argument, dimensionless (here 2ka).
 * @returns {number} H₁(x); exactly 0 at x = 0, which the series form cannot evaluate directly.
 * @pure
 */
export function struveH1(x) {
  if (x === 0) return 0
  const ax = Math.abs(x)
  return 2 / Math.PI - besselJ0(ax)
    + (16 / Math.PI - 5) * (Math.sin(ax) / ax)
    + (12 - 36 / Math.PI) * ((1 - Math.cos(ax)) / (ax * ax))
}

/**
 * Radiation impedance of a circular piston of area S into a solid angle.
 *
 * Baseline is the flanged piston (2π): `Z = ρc/S · (R1(2ka) + jX1(2ka))`.
 * Smaller solid angles raise the low-frequency radiation resistance by 2π/Ω —
 * this is the corner loading that makes a subwoofer louder in a room corner —
 * while converging to ρc/S at high ka, where the piston no longer knows what
 * is behind it. The interpolation is smooth rather than a switch, so the
 * transition introduces no step in the SPL curve.
 *
 * Two pseudo-terminations short-circuit the piston model entirely: `rigid`
 * returns a near-infinite impedance (a closed wall passes no volume velocity)
 * and `anechoic` returns the real characteristic impedance ρc/S (a perfectly
 * absorbing end with no reflection).
 *
 * @param {number} S - Piston area, m². Clamped to ≥1e-8 when deriving the radius, so a degenerate port cannot produce a NaN radius.
 * @param {'free'|'half'|'quarter'|'eighth'|'rigid'|'anechoic'} solidAngle - Radiating space, or a pseudo-termination. Unrecognised values fall back to half space.
 * @param {number} w - Angular frequency ω, rad/s.
 * @returns {Complex} Acoustic radiation impedance, Pa·s/m³.
 * @pre w >= 0
 * @pre S > 0 — `anechoic` divides by S directly and does not clamp
 * @post Re(result) >= 0 for every solid angle
 * @pure
 */
export function radiationImpedance(S, solidAngle, w) {
  if (solidAngle === 'rigid') return C(1e12, 0)
  const a = Math.sqrt(Math.max(S, 1e-8) / Math.PI)
  if (solidAngle === 'anechoic') return C((RHO * C_AIR) / S, 0)
  const k = w / C_AIR
  const x = 2 * k * a
  let R1, X1
  // The series forms are used well beyond where they are merely convenient.
  // `1 - 2·J₁(x)/x` is catastrophic cancellation at small x: the two terms agree
  // to more digits than the Bessel polynomial carries, so the difference is
  // noise — and ρc/S, of order 1e8 for a small opening, amplifies it into a
  // visibly negative radiation resistance. Below x ≈ 1e-3 the leading terms
  // x²/8 and 2x/3π are themselves accurate to far better than the polynomial,
  // so switching early costs nothing and keeps Re ≥ 0 everywhere.
  if (x < 1e-3) {
    R1 = x * x / 8
    X1 = (4 / (3 * Math.PI)) * x / 2
  } else {
    R1 = 1 - (2 * besselJ1(x)) / x
    X1 = (2 * struveH1(x)) / x
  }
  const omega = SOLID_ANGLES[solidAngle] ?? 2 * Math.PI
  const factor = (2 * Math.PI) / omega
  // Smooth interpolation: factor·R1 at low ka, → 1 at high ka
  let R = (R1 * factor) / (1 + R1 * (factor - 1))
  let X = X1 * (solidAngle === 'free' ? 0.7 : 1) // unflanged end correction is smaller
  const z0 = (RHO * C_AIR) / S
  return C(z0 * R, z0 * X)
}

/**
 * Solid angle Ω in steradians for each named radiating space.
 *
 * `free` is a driver suspended in air, `half` a flush-mounted baffle, and each
 * step down halves the space: baffle against a wall, then into a corner.
 */
export const SOLID_ANGLES = {
  free: 4 * Math.PI,
  half: 2 * Math.PI,
  quarter: Math.PI,
  eighth: Math.PI / 2,
}

// ---------- Transmission line ----------

/**
 * ABCD matrix of a uniform acoustic transmission line.
 *
 * The workhorse element: chambers, port slices and horn slices are all built
 * from it. Because it is a true distributed line rather than a lumped
 * compliance, standing waves at n·c/2L appear naturally in the response —
 * which is exactly what resonance masking suppresses when it swaps chambers
 * for lumped compliances.
 *
 * Loss enters as an attenuation constant α = k/2Q, so a given Q costs the same
 * fraction of amplitude per wavelength at every frequency.
 *
 * @param {number} S - Cross-sectional area, m².
 * @param {number} L - Length, m.
 * @param {number} w - Angular frequency ω, rad/s.
 * @param {number|null} Q - Loss factor. `null`, `Infinity` or ≤0 all mean lossless.
 * @param {number} [c=C_AIR] - Speed of sound, m/s. Reduced inside stuffed chambers.
 * @param {number} [extraAlpha=0] - Additional attenuation, nepers/m, added on top of the Q-derived term.
 * @returns {ABCD} The two-port matrix for the line.
 * @pre S > 0
 * @pure
 */
export function tlineMatrix(S, L, w, Q, c = C_AIR, extraAlpha = 0) {
  const k = w / c
  const alpha = (Q && isFinite(Q) && Q > 0 ? k / (2 * Q) : 0) + extraAlpha
  const gL = C(alpha * L, k * L)
  const Zc = C((RHO * c) / S, 0)
  const ch = cosh(gL)
  const sh = sinh(gL)
  return [
    [ch, mul(Zc, sh)],
    [div(sh, Zc), ch],
  ]
}

/**
 * ABCD matrix of a lumped series acoustic mass: `[[1, jωM], [0, 1]]`.
 *
 * Models the slug of air that moves with a port but sits outside its physical
 * length — the end correction. Applied at a waveguide's throat and mouth by
 * `waveguideMatrix`.
 *
 * @param {number} M - Acoustic mass, kg/m⁴ (ρ·ΔL/S).
 * @param {number} w - Angular frequency ω, rad/s.
 * @returns {ABCD} The two-port matrix for the mass.
 * @pure
 */
export function seriesMassMatrix(M, w) {
  return [
    [ONE, C(0, w * M)],
    [ZERO, ONE],
  ]
}

/**
 * ABCD matrix of a waveguide segment — port, duct or horn.
 *
 * The segment is discretized into N short uniform slices sampled at the
 * midpoint of the exact area profile, then cascaded. Stepwise-constant area
 * converges well for smooth flares because each slice is far shorter than a
 * wavelength in the modelled band; 24 slices is the point past which the
 * response stops visibly changing.
 *
 * End corrections are applied as series masses outside the sliced section, so
 * they shift the tuning without adding length to the geometry the user drew.
 *
 * @param {object} seg - Segment geometry.
 * @param {number} seg.S1 - Throat area, m².
 * @param {number} seg.S2 - Mouth area, m².
 * @param {number} seg.L - Axial length, m.
 * @param {'conical'|'parabolic'|'exponential'|'hypex'|'tractrix'|'lecleach'} seg.flare - Expansion law.
 * @param {number|null} seg.Q - Loss factor applied to every slice.
 * @param {number} [seg.ecThroat=0] - Throat end-correction length, m. Skipped when ≤0.
 * @param {number} [seg.ecMouth=0] - Mouth end-correction length, m. Skipped when ≤0.
 * @param {number} w - Angular frequency ω, rad/s.
 * @param {number} [N=24] - Number of slices.
 * @returns {ABCD} The two-port matrix for the whole segment, throat to mouth.
 * @pre N >= 1 && seg.L > 0 && seg.S1 > 0
 * @post seg is not modified
 * @pure
 */
export function waveguideMatrix({ S1, S2, L, flare, Q, ecThroat = 0, ecMouth = 0 }, w, N = 24) {
  const prof = areaProfile(flare, S1, S2, L)
  const dx = L / N
  let M = matIdentity()
  if (ecThroat > 0) M = matMul(M, seriesMassMatrix((RHO * ecThroat) / S1, w))
  for (let i = 0; i < N; i++) {
    const S = prof((i + 0.5) * dx)
    M = matMul(M, tlineMatrix(S, dx, w, Q))
  }
  if (ecMouth > 0) M = matMul(M, seriesMassMatrix((RHO * ecMouth) / S2, w))
  return M
}

/**
 * ABCD matrix of a chamber, modelled as a finite transmission line.
 *
 * Treating a box as a line of area Volume/Length rather than a lumped
 * compliance is what makes longitudinal standing waves at n·c/2L show up as
 * real response features — the ripples a lumped model cannot produce.
 *
 * Stuffing does two things: it slows sound as the process shifts from
 * adiabatic toward isothermal (up to −15.5% at 8 g/L, where the model
 * saturates), and it adds resistive loss, combined with the node's own Q in
 * parallel.
 *
 * @param {object} chamber - Chamber parameters.
 * @param {number} chamber.volume - Internal volume, m³.
 * @param {number} chamber.length - Acoustic path length, m. The floor of 1e-4 applies only to the Volume/Length division that derives the cross-section; the line itself is built at the length as given, so a length of 0 yields a zero-length line rather than a 1e-4 one.
 * @param {number|null} chamber.Q - Wall-loss factor.
 * @param {number} [chamber.stuffing=0] - Stuffing density, g/L. 0 is empty.
 * @param {number} w - Angular frequency ω, rad/s.
 * @param {boolean} [lumped=false] - When true, return a pure shunt compliance instead of a line, hiding standing-wave artifacts. This is the resonance-masking view.
 * @returns {ABCD} The two-port matrix for the chamber.
 * @pre chamber.volume > 0
 * @post chamber is not modified
 * @pure
 */
export function chamberMatrix({ volume, length, Q, stuffing = 0 }, w, lumped = false) {
  const S = Math.max(volume / Math.max(length, 1e-4), 1e-6)
  const stuffFrac = Math.min((stuffing || 0) / 8, 1)
  const c = C_AIR * (1 - 0.155 * stuffFrac)
  const qEff = combineQ(Q, stuffing > 0 ? 30 / stuffing : Infinity)
  if (lumped) {
    // Resonance-masked view: pure lumped compliance (+ loss resistance)
    const Ca = volume / (RHO * c * c)
    let Zshunt = div(ONE, jw(w * Ca))
    if (qEff && isFinite(qEff)) {
      const Ra = 1 / (w * Ca * qEff)
      Zshunt = add(Zshunt, C(Ra, 0))
    }
    return [
      [ONE, ZERO],
      [inv(Zshunt), ONE],
    ]
  }
  return tlineMatrix(S, length, w, qEff, c)
}

/**
 * Combine several loss factors into one.
 *
 * Losses add as reciprocals — `1/Q = Σ 1/Qᵢ` — because each mechanism
 * dissipates independently, so the combined Q is always at most the lowest
 * input. Values that are null, non-finite or ≤0 mean "this mechanism is
 * lossless" and are skipped rather than treated as zero.
 *
 * @param {...(number|null|undefined)} qs - Individual loss factors.
 * @returns {number} The combined Q, or `Infinity` when no argument contributes any loss.
 * @post result <= every finite positive input
 * @pure
 */
export function combineQ(...qs) {
  let invQ = 0
  for (const q of qs) {
    if (q && isFinite(q) && q > 0) invQ += 1 / q
  }
  return invQ > 0 ? 1 / invQ : Infinity
}
