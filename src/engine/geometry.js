// Client-safe geometry helpers: area profiles, volumes, flare cutoff, end
// corrections, and physical constants. No solver code — this module is the
// only part of the engine shipped to the browser.
export const RHO = 1.184 // air density kg/m^3 (20 °C)
export const C_AIR = 344 // speed of sound m/s

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
