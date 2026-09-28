# Backlog

**Private — excluded from the public export (see `PUBLISH.md`).**

Deferred work, most recent first. Each entry says what is wrong today, what
done looks like, and where the code is.

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
The SPICE engine already knows each source (`map.radiators` in
`src/spice/adapt.js`); power there is Re(p·U*) per counted radiator.

---

## Known wrong in the current solver — superseded, not to be patched

The tree-walk solver mis-solves paths that split and rejoin. Five ports from
one chamber into another are solved as five copies of the downstream chamber
and exit port (up to 14 dB of phantom gain on a series-tuned test box). Loops
are silently blocked. Fixed by construction in the SPICE engine
(`docs/SPICE-PLAN.md`); until then, results on such graphs are wrong.

## SPICE engine follow-ups

- **Worker size.** The worker grew to ~700 kB because `src/schema/params.js`
  imports the full mathjs to parse expressions. A small hand-written parser
  for the restricted language (it has no units, matrices or assignment) would
  remove it.
- **Long lossy ducts are the expensive part.** The five-port box compiles to
  ~2,700 elements, mostly √f loss ladders every λ/4 at the top of the sweep.
  Coarser lumping where the loss is small, or one ladder per duct for short
  ducts, would cut solve time several-fold.
- **Legacy solver removal** (milestone 5). The editor features have landed;
  the legacy engine refuses projects that use them.

## Time-domain follow-ups

- **Voice-coil heating** (Re(T), thermal RC network) — needs its own
  approach, since heating time constants are seconds to minutes.
- **Le(i)** and eddy-current nonlinearity are not modelled; Le(x) with a
  semi-inductance ladder scales the whole ladder and uses Le at 1 kHz for
  the motional and reluctance terms.
- **MCP tools** for transient and distortion runs.
- **Max SPL speed**: bands now search in parallel, several levels per
  round; a smarter first guess (the linear excursion limit) would still cut
  the rounds.
- **Threads for the MCP server**: it runs one engine in-process. A
  `worker_threads` pool behind `setRunner` would give it the same
  parallelism as the browser.
- **Single long transient runs** use one thread; ngspice cannot split a run
  in time. Fewer ladder sections where accuracy allows (`LC_PER`) is the
  remaining lever.
- **Imported audio** as a transient signal; amplifier clipping from the
  channel's `rated` watts.
- Distortion runs model the driver's curves and duct exit losses only;
  chamber air nonlinearity and suspension creep are not modelled.

## Editor follow-ups from milestone 4

- **Channel `rated` watts** — in the schema, not in the Wiring panel yet;
  it would drive a warning when a channel's nominal watts exceed its rating.
- **Filter response preview** per channel, and more alignments (Bessel,
  all-pass, first-order shelves) if they are wanted.
- **Expressions in the coupled T/S fields.** The padlock form derives five
  of the eleven from the other six; letting an expression drive a held one
  needs the derivation to run on resolved values.
- **The element dock sits over the canvas** at the bottom centre. Nodes
  behind it can still be panned into view, but a fit-to-view that leaves
  room for it would be kinder.
- **Listener positions** (reserved probe kind) for per-source distances.

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
  simulations run server-side. Surface the bundled Geist and Cascadia OFL notices.
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
