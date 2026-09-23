# Backlog

**Private — excluded from the public export (see `PUBLISH.md`).**

Deferred work, most recent first. Each entry says what is wrong today, what
done looks like, and where the code is.

---

## Driver output only where the cone is actually exposed

**Today.** The output chart always offers a "driver output" series, and
`splDriver` is not what its name says. In `runSimulation > propagateInto`,
every radiator reached through the driver's *front* handle is summed into
`emit.driverP` (`viaFront`), so in a 4th-order bandpass whose front vents
through a ported chamber, "driver output" is the port. Meanwhile an
unconnected *rear* loads the cone with a half-space radiation impedance but
never emits anything, so an open-baffle or dipole driver loses its back wave
entirely.

**Done means.**
- A driver side radiates directly only when that handle is unconnected, or
  connected to a `radiation` node. Nothing reached through a chamber, duct or
  other two-port counts as driver output.
- Both sides count: an exposed rear radiates with inverted polarity, into the
  solid angle the radiation node (or the driver) names.
- The "driver output" series exists only when at least one side is exposed;
  otherwise the checkbox is hidden or disabled, not showing a curve that
  cannot exist.

**Where.** `src/engine/solver.js` (front emission, `viaFront`, the rear
branch), `splDriver` consumers in `src/components/OutputPanel.jsx` and
`src/utils/export.js`, `mcp/acousim.js`.

---

## Per-source radiation for power and efficiency, Hornresp-style

**Today — a real bug.** Acoustic power is the incoherent sum of each source's
`|U|²·Re(Zr)`. Interference between sources is ignored, so the power and
efficiency charts are wrong whenever more than one source radiates: in phase
they under-read (1.8% shown against a true 9.8% at 50 Hz on a series-tuned
6th-order test box), in cancellation they over-read (1.3% against 0.1% at
60 Hz). SPL is unaffected — it sums pressures coherently.

**Done means.**
- Power and efficiency can be shown per radiation source (each exposed
  driver side, each open duct mouth, each radiation node) or combined.
- Combined takes a distance between the sources, and uses the mutual
  radiation impedance between them. At zero spacing this reduces to power
  from the summed volume velocity — `|ΣU|²·ρω²/(Ω·c)` for compact sources —
  which is also the correct default for any box whose sources sit well
  inside a wavelength.
- The export and MCP efficiency columns follow the same definition.

**Where.** `emit.powers` in `src/engine/solver.js`, the `pow`/`eff` rows in
`src/components/OutputPanel.jsx`, `src/utils/export.js`, `mcp/acousim.js`.
Depends on the per-source identity work in the entry above.

---

## Known wrong in the current solver — superseded, not to be patched

The tree-walk solver mis-solves paths that split and rejoin. Five ports from
one chamber into another are solved as five copies of the downstream chamber
and exit port (up to 14 dB of phantom gain on a series-tuned test box). Loops
are silently blocked. Fixed by construction in the SPICE engine
(`docs/SPICE-PLAN.md`); until then, results on such graphs are wrong.

## Dual voice coil catalogue entries don't follow the series convention

Dual-coil T/S data is always taken as both coils in series
(`docs/SPICE-PLAN.md`). All eight dual-coil entries in the catalogue carry a
single coil's Re instead — BL 12 D2, BL 15 D2, Q 18 D2, X-12 v3 D2,
X-15 v3 D2 and ZV5 18" D2 at 1.8–1.9 Ω (series ≈ 3.8), SA-12 D4 and
SA-15 D4 at 3.8 Ω (series ≈ 7.6). Check each against the manufacturer's
datasheet and correct to the series figures before the dual voice coil
options ship, or the app will model a D4 as a dual 2 Ω driver.

## Modelling questions

- **What an edge between two ducts means** — straight seamless join, bend, or
  user-specified. A bend adds loss and mass and changes effective length.
- **Neighbouring openings interact** at a shared wall; each is currently
  treated as independent.

## Carried over

- **Snapshot browser check.** Snapshots surviving project switches and
  reloads, colours staying distinct after remove-and-retake, renames
  persisting, `.acousim/snapshots.json` in the downloaded zip. Never run in a
  browser.
- **README / LICENSE / CONTRIBUTING** for the release. README uses
  "workspace" for two things, doesn't document the explorer, and still claims
  simulations run server-side. Surface the bundled Cascadia OFL notice.
- **Display-only settings trigger a resimulation.** `graphSignature` includes
  `unwrapPhase`, `vThreshold` and `delayOffset`, which only change how
  results are drawn; toggling them costs a ~90 ms recompute for nothing.
- **Louder folder-lost state.** When cleared site data drops the folder
  handle, the startup prompt could remember a folder was in use.
- **Slot ports.** End corrections use equivalent radius, which under-reads
  high-aspect slots.
- **End correction never rolls off.** It is a fixed mass; real radiation
  reactance falls away above ka ≈ 1 (~1 kHz for 80 cm²). Wrong for horn
  mouths.
- **Chamber `Q` semantics.** Conventionally box leakage (QL) is a fixed
  resistance in parallel with the box; here it is wave attenuation, so its
  damping grows with frequency.
- **Status bar and activity bar.** Offered, not started.
