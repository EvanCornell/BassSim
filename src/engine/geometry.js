// Client-safe geometry helpers: area profiles, volumes, flare cutoff, end
// corrections, and physical constants. No solver code — this module is the
// only part of the engine shipped to the browser.
//
// Everything here is SI: areas in m², lengths in m, frequencies in Hz. The UI
// converts from cm² / cm at the parameter boundary, not here.

/** Air density ρ, kg/m³, at 20 °C. */
export const RHO = 1.184

/** Speed of sound c in air, m/s, at 20 °C. */
export const C_AIR = 344

// ---------- Waveguide / horn area profiles ----------

/**
 * Build the cross-sectional area function S(x) for a waveguide segment.
 *
 * Returns a closure rather than a sampled table so callers can integrate it at
 * whatever resolution they need — `waveguideVolume` uses 200 slices, the
 * solver uses 24.
 *
 * Tractrix and Le Cléac'h are approximated by hyperbolic-exponential (Salmon)
 * profiles with different T parameters; their area expansions are close over
 * the usable band. An unrecognised flare degrades to a straight duct rather
 * than throwing, so a project saved by a newer version still simulates.
 *
 * @param {'conical'|'parabolic'|'exponential'|'hypex'|'tractrix'|'lecleach'} flare - Expansion law. Unknown values yield a constant-area duct.
 * @param {number} S1 - Throat area, m².
 * @param {number} S2 - Mouth area, m².
 * @param {number} L - Axial length, m.
 * @returns {(x: number) => number} S(x) in m², valid for x in [0, L].
 * @pre S1 > 0 && L > 0
 * @pre S2 > 0 for the exponential and hypex families, which take log(S2/S1)
 * @post result(0) equals S1 for every flare law, to within floating-point rounding — the conical and hypex laws reach it through a square root and back
 * @pure
 */
export function areaProfile(flare, S1, S2, L) {
  const r1 = Math.sqrt(S1 / Math.PI)
  const r2 = Math.sqrt(S2 / Math.PI)
  switch (flare) {
    case 'conical':
      /**
       * Conical expansion: the radius, not the area, grows linearly.
       * @param {number} x - Axial position, m.
       * @returns {number} Area at x, m².
       * @pure
       */
      return (x) => {
        const r = r1 + ((r2 - r1) * x) / L
        return Math.PI * r * r
      }
    case 'parabolic':
      /**
       * Parabolic expansion: area grows linearly with axial position.
       * @param {number} x - Axial position, m.
       * @returns {number} Area at x, m².
       * @pure
       */
      return (x) => S1 + ((S2 - S1) * x) / L
    case 'exponential': {
      const m = Math.log(S2 / S1) / L
      /**
       * Exponential expansion with flare constant m.
       * @param {number} x - Axial position, m.
       * @returns {number} Area at x, m².
       * @pure
       */
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
        /**
         * Degenerate case: a non-expanding "horn" has no hypex solution, so
         * fall back to the exponential law, which handles S2 ≤ S1 correctly.
         * @param {number} x - Axial position, m.
         * @returns {number} Area at x, m².
         * @pure
         */
        return (x) => S1 * Math.exp(m * x)
      }
      const u = (A + Math.sqrt(Math.max(A * A - 1 + T * T, 0))) / (1 + T)
      const kk = Math.log(u) / L
      /**
       * Salmon hypex expansion: S(x) = S1·(cosh kx + T·sinh kx)².
       * @param {number} x - Axial position, m.
       * @returns {number} Area at x, m².
       * @pure
       */
      return (x) => {
        const f = Math.cosh(kk * x) + T * Math.sinh(kk * x)
        return S1 * f * f
      }
    }
    default:
      /**
       * Unrecognised flare — a straight duct of throat area.
       * @returns {number} The constant throat area S1, m².
       * @pure
       */
      return () => S1
  }
}

/**
 * Internal air volume of a waveguide segment.
 *
 * A midpoint numeric integral of the exact area profile rather than a closed
 * form, so the volume tracks whichever flare law is selected instead of
 * assuming a cone. This feeds the enclosure's total-volume readout, where a
 * horn's own internal volume is easy to forget.
 *
 * @param {'conical'|'parabolic'|'exponential'|'hypex'|'tractrix'|'lecleach'} flare - Expansion law.
 * @param {number} S1 - Throat area, m².
 * @param {number} S2 - Mouth area, m².
 * @param {number} L - Axial length, m.
 * @param {number} [N=200] - Integration slices. Midpoint error falls as 1/N².
 * @returns {number} Enclosed volume, m³.
 * @pre N >= 1 && L > 0
 * @post result >= 0
 * @pure
 */
export function waveguideVolume(flare, S1, S2, L, N = 200) {
  const prof = areaProfile(flare, S1, S2, L)
  const dx = L / N
  let v = 0
  for (let i = 0; i < N; i++) v += prof((i + 0.5) * dx) * dx
  return v
}

/**
 * Flare (cutoff) frequency of an exponential-family horn.
 *
 * Below this frequency the horn stops transforming impedance and its output
 * collapses, so it is the practical low-frequency limit of the design.
 *
 * Conical and parabolic horns have no true cutoff — they load progressively
 * rather than sharply — and a segment that does not expand is a duct, so both
 * return `null` instead of a misleading number.
 *
 * @param {'conical'|'parabolic'|'exponential'|'hypex'|'tractrix'|'lecleach'} flare - Expansion law.
 * @param {number} S1 - Throat area, m².
 * @param {number} S2 - Mouth area, m².
 * @param {number} L - Axial length, m.
 * @returns {number|null} Cutoff frequency in Hz, or `null` when the geometry has no cutoff.
 * @pre S1 > 0 && L > 0
 * @pure
 */
export function flareCutoff(flare, S1, S2, L) {
  if (S2 <= S1 * 1.0001) return null
  if (flare === 'conical' || flare === 'parabolic') return null
  const m = Math.log(S2 / S1) / L // effective flare constant
  return (m * C_AIR) / (4 * Math.PI)
}

/**
 * End-correction length ΔL for an opening.
 *
 * Air just outside a port moves with the column inside it, so the duct behaves
 * as if it were longer than its physical length. Ports are tuned with this
 * included; omitting it puts the predicted tuning several Hz high.
 *
 * @param {number} S - Area of the opening, m².
 * @param {number} factor - End-correction coefficient: ≈0.85 flanged, ≈0.61 free, 0.732 for the typical two-flanged port.
 * @returns {number} Added effective length, m.
 * @pre S >= 0
 * @post result >= 0 when factor >= 0
 * @pure
 */
export function endCorrectionLength(S, factor) {
  return factor * Math.sqrt(S / Math.PI)
}
