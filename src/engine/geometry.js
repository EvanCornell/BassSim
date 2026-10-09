// Geometry helpers: area profiles, volumes, flare cutoff, end corrections,
// and physical constants, shared by the editor and the SPICE compiler.
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
 * SPICE line builder steps it more coarsely.
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
 * return `null` instead of a misleading number. The exponential family is
 * everything else: `exponential`, `hypex`, `tractrix` and `lecleach`, the last
 * two being hypex approximations and so sharing its cutoff behaviour.
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
 * The correction is `factor · a`, where `a` is the radius of the equivalent
 * circular opening — so it scales with the square root of area, and doubling
 * the coefficient doubles the correction.
 *
 * @param {number} S - Area of the opening, m².
 * @param {number} factor - End-correction coefficient: ≈0.85 flanged, ≈0.61 free, 0.732 for the typical two-flanged port.
 * @returns {number} Added effective length in m, equal to `factor · sqrt(S/π)`.
 * @pre S >= 0
 * @post result >= 0 when factor >= 0
 * @post result is 0 when S is 0, and strictly increasing in both S and factor otherwise
 * @pure
 */
export function endCorrectionLength(S, factor) {
  return factor * Math.sqrt(S / Math.PI)
}

/**
 * End correction for a junction between two areas.
 *
 * An end correction is not a property of a duct — it is a property of the
 * *discontinuity* at its end, and so it depends on what is on the other side.
 * A port opening into a box gets nearly the full flanged correction; the same
 * port butted against another duct of its own diameter gets none, because
 * nothing discontinuous happens there and the air column simply continues.
 * Treating the correction as belonging to the duct is what makes one port
 * drawn as several segments tune differently from the same port drawn as one.
 *
 * The Karal result, `0.85·a·(1 − 1.25·a/b)` for the smaller radius `a` and the
 * larger `b`, covers both extremes and everything between: it tends to the
 * flanged `0.85a` as the far side grows, and falls to zero as the two areas
 * approach each other. Above `a/b ≈ 0.8` the linear form goes negative and is
 * clamped — by then the correction is a rounding error on any real port.
 *
 * The mass belongs to the junction, not to either side, so exactly one of the
 * two ducts must carry it. The caller decides which; this only says how much,
 * expressed in `Sself`'s own units so that `ρ·ΔL/Sself` is the right inertance
 * whichever side ends up holding it.
 *
 * @param {number} Sself - Area of the side asking, m².
 * @param {number} Sother - Area on the other side of the junction, m².
 * @returns {number} Added effective length in m, for a duct of area `Sself`. Zero when either area is non-positive or the two are close enough that the discontinuity vanishes.
 * @post result >= 0
 * @post result is 0 when Sself equals Sother
 * @pure
 */
export function junctionCorrection(Sself, Sother) {
  if (!(Sself > 0) || !(Sother > 0)) return 0
  const small = Math.min(Sself, Sother)
  const large = Math.max(Sself, Sother)
  const a = Math.sqrt(small / Math.PI)
  const dl = 0.85 * a * (1 - 1.25 * Math.sqrt(small / large))
  if (!(dl > 0)) return 0
  // Referred to the asking duct: the inertance ρ·ΔL/S is what the matrix
  // applies, and it has to come out the same whichever side is asked.
  return dl * (Sself / small)
}
