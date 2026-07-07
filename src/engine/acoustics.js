// Acoustic element models: transmission lines, waveguides/horns, radiation
// impedance of a piston in various solid angles. SI units throughout.
import { C, ZERO, ONE, add, mul, div, inv, jw, cosh, sinh, matMul, matIdentity } from './complex.js'

export const RHO = 1.184 // air density kg/m^3 (20 °C)
export const C_AIR = 344 // speed of sound m/s

// ---------- Bessel/Struve approximations for piston radiation ----------

// J1(x) via Abramowitz & Stegun polynomial approximations
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

// J0(x) via Abramowitz & Stegun polynomial approximations
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

// Struve H1(x), Aarts & Janssen (2003) approximation
export function struveH1(x) {
  if (x === 0) return 0
  const ax = Math.abs(x)
  return 2 / Math.PI - besselJ0(ax)
    + (16 / Math.PI - 5) * (Math.sin(ax) / ax)
    + (12 - 36 / Math.PI) * ((1 - Math.cos(ax)) / (ax * ax))
}

// Radiation impedance of a circular piston of area S (m^2) into a solid angle.
// Baseline is the flanged piston (2π): Z = ρc/S (R1(2ka) + jX1(2ka)).
// Smaller solid angles raise the low-frequency radiation resistance by
// 2π/Ω while converging to ρc/S at high ka.
export function radiationImpedance(S, solidAngle, w) {
  if (solidAngle === 'rigid') return C(1e12, 0)
  const a = Math.sqrt(Math.max(S, 1e-8) / Math.PI)
  if (solidAngle === 'anechoic') return C((RHO * C_AIR) / S, 0)
  const k = w / C_AIR
  const x = 2 * k * a
  let R1, X1
  if (x < 1e-6) {
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

export const SOLID_ANGLES = {
  free: 4 * Math.PI,
  half: 2 * Math.PI,
  quarter: Math.PI,
  eighth: Math.PI / 2,
}

// ---------- Transmission line ----------

// ABCD matrix of a uniform acoustic line: area S (m^2), length L (m),
// Q loss factor (null/Infinity = lossless), speed of sound c.
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

// Series acoustic mass (end correction): [[1, jωM],[0,1]]
export function seriesMassMatrix(M, w) {
  return [
    [ONE, C(0, w * M)],
    [ZERO, ONE],
  ]
}

// ---------- Waveguide / horn area profiles ----------

// Returns S(x) for x in [0,L] given throat S1, mouth S2 and flare type.
export function areaProfile(flare, S1, S2, L) {
  const r1 = Math.sqrt(S1 / Math.PI)
  const r2 = Math.sqrt(S2 / Math.PI)
  switch (flare) {
    case 'conical':
      return (x) => {
        const r = r1 + ((r2 - r1) * x) / L
        return Math.PI * r * r
      }
    case 'parabolic':
      return (x) => S1 + ((S2 - S1) * x) / L
    case 'exponential': {
      const m = Math.log(S2 / S1) / L
      return (x) => S1 * Math.exp(m * x)
    }
    case 'hypex':
    case 'tractrix':
    case 'lecleach': {
      // Hyperbolic-exponential (Salmon). Tractrix and Le Cléac'h are
      // approximated by hypex profiles with different T parameters —
      // their area expansions are close over the usable band.
      const T = flare === 'hypex' ? 0.7 : flare === 'tractrix' ? 0.5 : 0.6
      const A = Math.sqrt(S2 / S1)
      if (A <= 1) {
        const m = Math.log(S2 / S1) / L
        return (x) => S1 * Math.exp(m * x)
      }
      const u = (A + Math.sqrt(Math.max(A * A - 1 + T * T, 0))) / (1 + T)
      const kk = Math.log(u) / L
      return (x) => {
        const f = Math.cosh(kk * x) + T * Math.sinh(kk * x)
        return S1 * f * f
      }
    }
    default:
      return () => S1
  }
}

// Internal volume of a waveguide segment (m^3): numeric integral of the
// exact area profile, so it tracks the selected flare.
export function waveguideVolume(flare, S1, S2, L, N = 200) {
  const prof = areaProfile(flare, S1, S2, L)
  const dx = L / N
  let v = 0
  for (let i = 0; i < N; i++) v += prof((i + 0.5) * dx) * dx
  return v
}

// Flare (cutoff) frequency for exponential-family horns; null for conical/parabolic
export function flareCutoff(flare, S1, S2, L) {
  if (S2 <= S1 * 1.0001) return null
  if (flare === 'conical' || flare === 'parabolic') return null
  const m = Math.log(S2 / S1) / L // effective flare constant
  return (m * C_AIR) / (4 * Math.PI)
}

// End-correction length ΔL (m) for an opening of area S. factor≈0.85 flanged, 0.61 free.
export function endCorrectionLength(S, factor) {
  return factor * Math.sqrt(S / Math.PI)
}

// ABCD matrix of a waveguide segment, discretized into N short uniform
// slices of the exact area profile. Converges well for smooth flares.
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

// Chamber as a finite transmission line. volume in m^3, length in m.
// Stuffing (g/L) slows sound (adiabatic→isothermal) and adds resistive loss.
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

export function combineQ(...qs) {
  let invQ = 0
  for (const q of qs) {
    if (q && isFinite(q) && q > 0) invQ += 1 / q
  }
  return invQ > 0 ? 1 / invQ : Infinity
}
