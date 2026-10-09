// Physical constants and loss laws the SPICE compiler builds elements from.
//
// Losses are derived from geometry here rather than typed in as a Q. Each law
// is the standard textbook result, stated with its range of validity.

import { RHO, C_AIR } from '../engine/geometry.js'

export { RHO, C_AIR }

/** Dynamic viscosity of air at 20 °C, Pa·s. */
export const MU = 1.81e-5
/** Thermal conductivity of air at 20 °C, W/(m·K). */
export const KAPPA = 0.0257
/** Specific heat of air at constant pressure, J/(kg·K). */
export const CP = 1005
/** Ratio of specific heats for air. */
export const GAMMA = 1.4

/** Solid angle Ω in steradians for each named radiating space. */
export const SOLID_ANGLE = {
  free: 4 * Math.PI, half: 2 * Math.PI, quarter: Math.PI, eighth: Math.PI / 2,
}

/**
 * Perimeter of a duct or chamber cross-section.
 *
 * Waveguides are treated as round — the equivalent-radius assumption the rest
 * of the model makes, and one that under-reads a slot's perimeter. Chambers
 * follow their `shape`: square for rectangular, round for cylindrical.
 *
 * @param {number} S - Cross-section area, m².
 * @param {string} [shape='round'] - `round`, `cylindrical` or `rectangular`.
 * @returns {number} Perimeter, m.
 * @pure
 */
export function perimeter(S, shape = 'round') {
  if (shape === 'rectangular') return 4 * Math.sqrt(S)
  return 2 * Math.sqrt(Math.PI * S)
}

/**
 * Viscous boundary-layer loss per unit length, as the coefficient of √(jω).
 *
 * In a duct much wider than the viscous boundary layer δ = √(2μ/ρω), wall
 * friction adds a series impedance per metre of `(P/S²)·√(ρμ)·√(jω)` — a
 * resistance and an equal mass, both rising as √f. Valid while the duct's
 * hydraulic radius is several δ (δ ≈ 0.3 mm at 45 Hz), which holds for any
 * practical port.
 *
 * @param {number} S - Cross-section area, m².
 * @param {number} P - Perimeter, m.
 * @returns {number} The coefficient A in Z′ = A·√(jω), Pa·s^½/m⁴ per metre.
 * @pure
 */
export function viscousCoeff(S, P) {
  return (P * Math.sqrt(RHO * MU)) / (S * S)
}

/**
 * Thermal boundary-layer loss per unit length, as the coefficient of √(jω).
 *
 * Heat exchange with the walls makes compression slightly isothermal near
 * them, which adds a shunt admittance per metre of
 * `(γ−1)·P/(ρc²)·√(κ/ρc_p)·√(jω)`. This is the main wall loss inside a
 * box, where it acts on the air's springiness.
 *
 * @param {number} P - Perimeter, m.
 * @returns {number} The coefficient B in Y′ = B·√(jω), per metre.
 * @pure
 */
export function thermalCoeff(P) {
  return ((GAMMA - 1) * P) / (RHO * C_AIR * C_AIR) * Math.sqrt(KAPPA / (RHO * CP))
}

/**
 * Flow resistivity of fibrous stuffing, Pa·s/m².
 *
 * Bies & Hansen's empirical law for fibrous absorbers,
 * σ = 27.3·(ρ_bulk/ρ_fibre)^1.53·μ/d², for polyester fibre (1380 kg/m³) of
 * 20 µm diameter. An estimate: real fill varies by a factor of two or more
 * with fibre and packing.
 *
 * @param {number} gPerL - Stuffing density, g/L (= kg/m³).
 * @returns {number} Flow resistivity, Pa·s/m²; 0 for no stuffing.
 * @pure
 */
export function flowResistivity(gPerL) {
  if (!(gPerL > 0)) return 0
  const d = 20e-6
  return 27.3 * Math.pow(gPerL / 1380, 1.53) * (MU / (d * d))
}

/**
 * Speed of sound in a stuffed volume.
 *
 * Fill shifts compression from adiabatic toward isothermal, slowing sound by
 * up to 15.5% at 8 g/L, beyond which it stops changing.
 *
 * @param {number} gPerL - Stuffing density, g/L.
 * @returns {number} Speed of sound, m/s.
 * @pure
 */
export function stuffedSoundSpeed(gPerL) {
  return C_AIR * (1 - 0.155 * Math.min(Math.max(gPerL || 0, 0) / 8, 1))
}

/**
 * Convert a driver node's display-unit parameters into the SI set the compiler builds from.
 *
 * This is also where a multi-driver node collapses into one equivalent driver.
 * Series wiring multiplies Re, Le and Bl by the count; parallel wiring divides
 * the electrical terms; series-parallel splits the count into a square grid
 * when it is a perfect square and falls back to plain parallel when it is not.
 * The mechanical side scales with cone count regardless of wiring: Sd, Mms and
 * Rms multiply, Cms divides.
 *
 * Every field has a fallback, so a partially filled node still simulates rather
 * than producing NaN. That is deliberate — the editor lets you drop a driver on
 * the canvas before typing any numbers.
 *
 * @param {object} p - Driver node params in display units (Sd cm², Mms g, Cms mm/N, Le mH, Xmax mm).
 * @returns {{n: number, s: number, par: number, Re: number, Le: number, LeExp: number, Bl: number, Sd: number, Mms: number, Cms: number, Rms: number, Xmax: number}} The equivalent single driver in SI units, plus the resolved count and the series/parallel multipliers.
 * @post result.n >= 1
 * @post p is not modified
 * @pure
 */
export function driverSI(p) {
  const n = Math.max(1, Math.round(p.count || 1))
  let s = 1, par = 1
  if (p.wiring === 'series') s = n
  else if (p.wiring === 'parallel') par = n
  else if (p.wiring === 'series-parallel') {
    const r = Math.round(Math.sqrt(n))
    if (r * r === n && r > 1) { s = r; par = r } else { par = n }
  }
  const Sd = (p.Sd || 500) * 1e-4 // cm² → m²
  const Mms = (p.Mms || 100) * 1e-3 // g → kg
  const Cms = (p.Cms || 0.2) * 1e-3 // mm/N → m/N
  return {
    n, s, par,
    Re: ((p.Re || 4) * s) / par,
    Le: (((p.Le || 1) * 1e-3) * s) / par, // mH → H
    LeExp: p.LeExp ?? 1,
    Bl: (p.Bl || 15) * s,
    Sd: Sd * n,
    Mms: Mms * n,
    Cms: Cms / n,
    Rms: (p.Rms || 3) * n,
    Xmax: (p.Xmax || 10) * 1e-3,
  }
}

/**
 * Bessel function of the first kind, order 1.
 *
 * Abramowitz & Stegun rational approximations, split at |x| = 8 between the
 * small-argument polynomial and the large-argument asymptotic form. Accurate
 * to roughly 1e-8.
 *
 * @param {number} x - Argument, dimensionless (here 2ka).
 * @returns {number} J₁(x).
 * @pure
 */
export function besselJ1(x) {
  const ax = Math.abs(x)
  if (ax < 8) {
    const y = x * x
    const p1 = x * (72362614232.0 + y * (-7895059235.0 + y * (242396853.1 + y * (-2972611.439 + y * (15704.48260 + y * -30.16036606)))))
    const p2 = 144725228442.0 + y * (2300535178.0 + y * (18583304.74 + y * (99447.43394 + y * (376.9991397 + y))))
    return p1 / p2
  }
  const z = 8 / ax
  const y = z * z
  const xx = ax - 2.356194491
  const p1 = 1.0 + y * (0.183105e-2 + y * (-0.3516396496e-4 + y * (0.2457520174e-5 + y * -0.240337019e-6)))
  const p2 = 0.04687499995 + y * (-0.2002690873e-3 + y * (0.8449199096e-5 + y * (-0.88228987e-6 + y * 0.105787412e-6)))
  const ans = Math.sqrt(0.636619772 / ax) * (Math.cos(xx) * p1 - z * Math.sin(xx) * p2)
  return x < 0 ? -ans : ans
}

/**
 * Bessel function of the first kind, order 0.
 *
 * Abramowitz & Stegun rational approximations, split at |x| = 8. Used only as
 * an input to `struveH1`.
 *
 * @param {number} x - Argument, dimensionless.
 * @returns {number} J₀(x).
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
 * Roughly 1e-3 relative over the usable range — well inside the error of the
 * rigid-piston assumption it feeds.
 *
 * @param {number} x - Argument, dimensionless (here 2ka).
 * @returns {number} H₁(x); exactly 0 at x = 0.
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
 * Radiation impedance of a flanged circular piston: `ρc/S · (R1(2ka) + jX1(2ka))`.
 *
 * The exact curve the radiation network is fitted to. Below 2ka ≈ 1e-3 the
 * leading terms x²/8 and 2x/3π replace `1 − 2J₁(x)/x`, which cancels
 * catastrophically there.
 *
 * @param {number} S - Piston area, m².
 * @param {number} w - Angular frequency ω, rad/s.
 * @returns {{re: number, im: number}} Acoustic radiation impedance, Pa·s/m³.
 * @pre S > 0
 * @pre w >= 0
 * @post result.re >= 0
 * @pure
 */
export function pistonImpedance(S, w) {
  const x = 2 * (w / C_AIR) * Math.sqrt(S / Math.PI)
  const small = x < 1e-3
  const R1 = small ? x * x / 8 : 1 - (2 * besselJ1(x)) / x
  const X1 = small ? (4 / (3 * Math.PI)) * x / 2 : (2 * struveH1(x)) / x
  const z0 = (RHO * C_AIR) / S
  return { re: z0 * R1, im: z0 * X1 }
}
