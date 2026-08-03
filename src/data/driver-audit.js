// Internal-consistency audit for a driver record.
//
// A T/S set is over-determined: Qes, Qts and Vas are all implied by the
// parameters the solver actually runs on (Bl, Re, Mms, Cms, Rms, Sd). When a
// published value disagrees with the one implied by its siblings, the row is
// describing two different drivers, and the simulation will follow the
// solver's set — not the headline Qts a buyer recognises.
//
// That is worth surfacing rather than silently correcting: the fix requires
// knowing which column was mis-transcribed, which only the datasheet can say.
// So the audit labels the row and the UI warns. The importer runs this at
// generation time and the test suite enforces that any row failing an audit
// carries its label, so a bad import cannot land unannounced.

const RHO = 1.204
const C_AIR = 343.2

const rel = (a, b) => Math.abs(a - b) / Math.abs(b)
const pct = (a, b) => Math.round(rel(a, b) * 100)

// Tolerances are set above the rounding noise of a published table — a
// catalog quoting Q to two decimals cannot be held tighter than a few percent
// — and below the level at which a mismatch changes the predicted alignment.
export const TOL = { Qes: 0.15, Qts: 0.12, Vas: 0.35 }

export function auditDriver(d) {
  const flags = []

  // Qes = ωs·Mms·Re / Bl². The check most likely to catch a Bl quoted for a
  // different coil wiring than the Re beside it — the usual dual-voice-coil
  // transcription slip.
  if (d.Qes > 0 && d.Bl > 0 && d.Re > 0 && d.Mms > 0 && d.Fs > 0) {
    const q = (2 * Math.PI * d.Fs * (d.Mms * 1e-3) * d.Re) / (d.Bl * d.Bl)
    if (rel(q, d.Qes) > TOL.Qes) {
      flags.push(`Qes implied by Bl/Re/Mms is ${q.toFixed(2)}, ${pct(q, d.Qes)}% off the published ${d.Qes}`)
    }
  }

  // Qts is the parallel combination of the other two.
  if (d.Qts > 0 && d.Qes > 0 && d.Qms > 0) {
    const q = (d.Qes * d.Qms) / (d.Qes + d.Qms)
    if (rel(q, d.Qts) > TOL.Qts) {
      flags.push(`Qes ∥ Qms is ${q.toFixed(3)}, ${pct(q, d.Qts)}% off the published Qts ${d.Qts}`)
    }
  }

  // Vas = ρc²·Sd²·Cms. Loose, because manufacturers disagree on how much of
  // the surround counts toward Sd, and Vas enters it squared.
  if (d.Vas > 0 && d.Sd > 0 && d.Cms > 0) {
    const v = RHO * C_AIR * C_AIR * Math.pow(d.Sd * 1e-4, 2) * (d.Cms * 1e-3) * 1000
    if (rel(v, d.Vas) > TOL.Vas) {
      flags.push(`Vas implied by Sd/Cms is ${v.toFixed(0)} L, ${pct(v, d.Vas)}% off the published ${d.Vas} L`)
    }
  }

  return flags
}
