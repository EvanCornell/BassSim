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
