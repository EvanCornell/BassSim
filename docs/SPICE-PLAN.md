# SPICE engine plan

**Private — excluded from the public export (see `PUBLISH.md`).**

AcouSim stops solving circuits itself. The node graph is translated into a
SPICE netlist, ngspice solves it, and the output is translated back into what
a loudspeaker designer needs. Our code owns the two translations; the solver
is ngspice's, and is trusted.

---

## Status

Milestones 1–4 are built (`src/schema/`, `src/spice/`, `src/engine/pipeline.js`,
and the editor panels). SPICE is the default engine in the app and the MCP
server; the legacy solver is a Settings toggle (`ACOUSIM_ENGINE=legacy` for
the server) and refuses what it cannot represent. Milestone 5 remains:
deleting the legacy solver.

### Time domain and nonlinearity, as built

Everything lives in its own full-screen workspace (quick-bar **Time Domain**
button, View/Tools menus, Alt+T), which replaces the dock rather than
docking in it; the dock stays mounted underneath. Four tabs:

- **Linear response** — impulse and step (per volt of channel 1), tone burst
  (at the channels' levels), cumulative spectral decay. Inverse FFT of a
  linear `.ac lin` sweep of the same circuit (default 2 kHz band, 0.5 Hz
  steps). Re-runs itself while open. A linear transient burst matches it to
  5e-4 relative — the check that the transient path is right.
- **Transient** — sine (faded in), Hann tone burst, log sweep, pink noise
  (seeded, PWL source) through the circuit in time, at the channels' levels
  plus an offset. Waveforms: pressure at 1 m, excursion, amplifier current
  and voltage, duct velocity, probes, output spectrum; optional linear run
  overlaid. Run on demand.
- **Distortion** — harmonics of a steady tone (whole periods at a sample
  rate that is a multiple of the tone, so no leakage), THD/H2/H3 across
  frequency, compression across level (against a single-point AC run),
  and a CEA-2010-style burst max SPL (3 dB steps then bisection to 0.25 dB,
  CEA harmonic limits or an excursion limit × Xmax).
- **Driver nonlinearity** — the Nonlinear Lab curve editor, now with
  polynomial entry (Klippel-style coefficients over a range, used as
  P(x)/P(0)), and the duct exit loss K per waveguide end.

How it is built:
- `src/spice/run.js` `runTransient`; `.options interp` puts samples on the
  grid; the max internal step is capped at 0.9× the shortest T-line delay
  (ngspice's lossless line fails otherwise). "Timestep too small" and
  "aborted" are now fatal.
- In a transient compile, far-field pressure is `v` across a ρ-henry
  inductor fed Σ U/Ω by F sources, and excursion is a 1 F capacitor fed the
  cone velocity — solved by the same integrator as the rest.
- Nonlinear driver (`src/spice/nonlinear.js`): Bl(x) replaces both H
  sources with B sources; Kms(x)/Cms(x) replaces the compliance capacitor
  with V = K0·k(x)·x; Le(x) scales a shadow copy of the coil inductance
  network and adds the motional term i·Le·dr/dx·u and the reluctance force
  ½i²·Le·dr/dx. Curves are sampled from exactly the Lab's `evalCurve` into
  `pwl()`, pinned flat beyond ±max(4·Xmax, 20 mm).
- Duct exit loss: series B source K·ρ/(2S²)·U|U| at radiating ends and at
  ends meeting a larger area; only in nonlinear transient runs. Default K 0.5.
- Jobs run in a second worker (`src/engine/tdWorker.js`) with progress;
  cancel terminates it. Settings are stored in the project's `analyses` as
  one `{type: 'timedomain'}` entry; results are not saved.
- The legacy quasi-linear "Experimental features" mode is retired from the
  UI (the legacy engine still reads `nlEnabled` from old files).
- Checks (contract suite): linear transient = IFFT; tone fundamental = AC
  level; flat curve THD < 1e-4; symmetric curves → odd harmonics, asymmetric
  Bl and Le(x) → H2; exit loss → odd harmonics and growing compression.

### Milestone 4, as built

- **Loose connections.** The canvas runs React Flow in loose mode; every
  handle is a `source`, so throat-to-throat, mouth-to-mouth and anything else
  joins. A join already made the other way round is refused as a duplicate;
  a node may not join itself.
- **Taps** are edited in the chamber and waveguide forms (position in cm,
  expressions allowed) and drawn as pink handles down the node's right side
  at their share of the length. Removing a tap removes its joins.
- **Named parameters** — the Project Parameters panel. Every numeric field
  in the node forms, the wiring manager and the probes panel takes a number
  or an expression; half-typed text is held in the box and never written.
  Canvas readouts and derived figures read resolved values. The driver's
  coupled T/S fields stay numeric (the padlock form derives five of them).
- **Wiring manager** — the Wiring panel: master level, and per channel its
  volts at master 0 dB, output resistance, polarity, delay, filters and load
  tree (default catch-all, or customised series/parallel groups). Each
  channel shows its voltage now, the nominal load its wiring presents, the
  watts that makes, and the minimum |Z| from the last run. The toolbar
  voltage is the first channel at the master; editing it moves the master,
  so every channel keeps its relative level.
- **Dual voice coil** is a select on the driver form; the node shows its
  nominal impedance (coil Re rounded to a standard rating, then the DVC
  option and the node's array wiring).
- **DSP filters from ordinary parts** (`src/spice/filters.js`): Butterworth
  and Linkwitz-Riley high/low-pass of any order, parametric EQ, low and high
  shelves, each a cascade of series R-L-C sections read out through
  controlled sources. Matches the analytic response to 3e-8 dB in the sweep
  and is valid for a transient run unchanged. Filters can be bypassed.
- **Probes** — the Probes panel: pressure, volume flow or velocity, at any
  handle (ends, faces, taps, a radiation node) or at a distance along a
  chamber or waveguide. Flow along a line cuts it with a sense source; the
  re-slicing changes the result by under 1e-5 dB. Pressure probes plot on
  Interior SPL, flow and velocity on the new Probe Flow & Velocity chart.
- **Per-channel impedance** (`zinByChannel`); the impedance chart shows a
  trace per channel when there are several.
- **Throat chamber**: the driver warning offers "Insert a throat chamber",
  which puts an ordinary chamber between the face and what it met; the
  chamber form has the calculator (cone area × (depth × shape factor +
  excursion + clearance)) with a button to apply the volume.
- Deleting nodes drops their wiring leaves and probes; wiring, params and
  probe edits are part of undo (structural edits; typed values, like node
  parameters, are not separate undo steps).

### What was measured

- **Accuracy against independent references** (all in the contract suite):
  radiation network within 0.5% of Bessel/Struve up to ka = 3 (0.16% in
  practice); √(jω) loss and Le·(jω)^n ladders within 0.5% across the band; a
  lossless duct and a stepped horn equal to the exact line; distributed wall
  loss within 1% of the exact lossy line; a complete sealed box and a
  driver-plus-passive-radiator box within 0.5% in impedance and 0.05 dB in SPL
  of closed-form models.
- **Speed, warm:** ~40–60 ms for a ported box at 513 points (legacy ~65 ms);
  ~330–390 ms for the five-port series-tuned box (≈2,700 elements, mostly loss
  ladders). First run adds ~1–2 s to load the engine.
- **Bundle:** engine chunk 20 MB raw (~5.7 MB gzipped), loaded on first
  simulation. The worker is ~700 kB because it now carries the mathjs parser.

### Decisions made while building

- **Solid angle uses the image-source model**, `Z_Ω(S) = n·Z_half(n·S)`,
  n = 2π/Ω. The legacy blend of resistance and reactance for free, quarter and
  eighth space is not causal — no passive circuit can reproduce it — while
  the image model is, and it has the limits the legacy formula aimed for
  (resistance ×n and mass ×√n at low ka, 0.707 reactance in free space).
- **Never a near-zero resistor as a wire.** A 1e-9 Ω "short" put a conductance
  fourteen orders above its neighbours and cost ~0.9% accuracy. Nodes are
  joined directly; the only small resistances are the 1e-3 DC ties (about a
  millionth of any acoustic impedance), which keep loops of DC-short
  elements from making the operating point singular.
- **No XSPICE in the WASM build** — DSP filters will be built from ordinary
  parts. Behavioural sources work in transient, which the flow-dependent port
  loss needs later.
- **Tuning search scans upward** for the first crossing, so a long port's
  pipe modes can no longer be mistaken for its Helmholtz tuning.

## Why

The current solver walks the graph as a tree from each driver. It cannot
represent paths that split and rejoin: five ports from one chamber into
another were solved as five copies of the downstream chamber and exit port,
worth up to 14 dB of phantom gain on a series-tuned test box. Loops are
silently blocked by a cycle guard, multiple drivers are superposed rather than
solved together, and power ignores interference between sources. These all
come from the architecture, not from a bug that can be patched once.

A circuit solver handles any topology by construction. Writing our own would
leave us owning its correctness; ngspice has decades of use behind it.

---

## Decisions

- **Engine:** ngspice compiled to WebAssembly, via `eecircuit-engine` (MIT
  wrapper). Runs in the existing Web Worker. Confirm ngspice's own licence
  (mostly BSD-3) covers everything in the WASM build before shipping.
- **The solver is trusted.** Tests cover our code only: the graph → netlist
  compiler, each element's subcircuit against the physics it represents, and
  the output adapter.
- **One netlist for both analyses.** Every element is a real circuit —
  R, L, C, controlled sources, transmission lines. No frequency-only
  constructs (expressions in `hertz`, frequency tables), even where they would
  be more exact in the sweep. Time domain must later run on the same model
  the frequency curve came from, with no separate model to maintain.
- **No comparison with the old solver.** It stays the default only so the app
  keeps working while the new engine is built; the new one sits behind a
  setting. When the new engine covers every node type it becomes the default
  and the old solver is deleted.
- **Large-signal mode (`nlEnabled`) is frozen** until transient analysis
  exists; its fixed-point approximation is not ported.
- **Optimizer slowdown is accepted** for now.

---

## Architecture

**Compiler — graph → netlist.** Every set of handles joined by edges becomes
one netlist node, so parallel paths, loops and meshes need no special case.
Each node type is a subcircuit from a library — a pure function from params to
a netlist fragment:

- driver — Re, an Le/LeExp ladder, Bl as controlled sources, mechanical R/L/C,
  Sd coupling to separate front and rear nodes; series/parallel wiring as real
  circuits rather than one collapsed equivalent driver
- chamber — transmission line; stuffing sets its impedance and delay
- duct / horn — stepped transmission-line segments
- radiation — fitted network per solid angle; `rigid` is an open circuit
- passive radiator — mechanical R/L/C plus area coupling

Junction rules (end-correction ownership, loss on that air) become plain
inductors and resistors the compiler inserts. Flows are read through 0 V sense
sources. The compiler emits a map from each SPICE vector to the graph quantity
it means, and names elements after graph node ids so ngspice errors point back
to the node.

**Runner.** Engine loaded once in the worker and kept. One `.ac` sweep per run
on the settings' frequency grid.

**Adapter — SPICE output → speaker quantities.** Impedance from the amplifier
source; excursion from cone velocity / jω; port velocity from mouth flow /
area; chamber pressure from node voltages; SPL as a coherent sum over
radiators, per source or combined; power per source as Re(p·U*); driver output
only from exposed cone faces; efficiency, phase, group delay derived. The
first version produces the current result shape so charts, metrics, export and
the MCP server keep working unchanged.

---

## Measured (Node, `eecircuit-engine` 1.8.0)

| | |
|---|---|
| Bundle | 20 MB raw, 5.7 MB gzipped |
| Engine start | ~1.2 s |
| AC sweep, 801 points, five-port test box | ~315 ms (current solver ~90 ms at 512) |
| Transient, same box, 20 µs step | ~6.4 s per simulated second |
| Transient, 5 µs step | ~26 s per simulated second |

The AC run agreed with a hand-built reference of identical elements to 1e-13.

---

## Phases

1. **Core elements on the new engine** — driver, chamber, straight duct,
   radiation — behind an "engine: SPICE (experimental)" setting. Schema
   designed up front (below).
2. **Element fidelity** — radiation network fit, Le ladder, realizable duct
   and chamber losses, flares, stuffing, passive radiators.
3. **Switch the default; delete the old solver.** Then what it unlocks:
   multiple drivers anywhere, per-source power, correct driver output, tap
   points along chambers.
4. **Linear time domain** from the sweep — impulse, step, waterfall, burst
   decay. No transient needed.
5. **Electrical chain** — amplifier, subsonic filter, EQ, crossover nodes.
6. **Transient runs** with signals — bursts, sweeps, noise, imported audio.
7. **Nonlinear drivers and thermal** — Bl(x), Kms(x), Le(x), voice-coil
   heating; THD, compression, maximum SPL.

## Schema v3

The file format migrates once for all of this, not once per phase. Items
marked *provisional* are first designs, expected to change once they can be
used; items marked *reserved* are shapes held open but not built yet.

```jsonc
{
  "schemaVersion": 3,
  "app": "AcouSim", "name": "…", "modified": "…",
  "air":       { "temperatureC": 20, "altitudeM": 0 },   // reserved
  "params":    [ … ],          // named parameters (provisional)
  "nodes":     [ … ],          // the acoustic graph
  "edges":     [ … ],          // undirected joins between handles
  "wiring":    { … },          // channels, DSP, load trees (see Graph semantics)
  "analyses":  [ … ],          // what to simulate
  "probes":    [ … ],          // extra outputs (provisional)
  "components":[ … ],          // groups / sub-circuits (reserved)
  "display":   { … }           // chart scales, phase unwrap, velocity threshold, delay offset
}
```

Today's `settings` is split three ways: sweep range and `masking` go to
`analyses`, drive and `rg` to `wiring`, everything else to `display`. The
display settings no longer take part in deciding whether to resimulate.

### Nodes and edges

- Node shape unchanged: `{ id, type, position, params }`.
- Edges keep React Flow's `source`/`target` fields but mean only "these two
  handles are joined"; order carries no meaning.
- Handles: `throat`/`mouth` (waveguide), `in`/`out` (chamber), `front`/`rear`
  (driver), `in` (radiation, passive radiator), `tap:<id>` (waveguide and
  chamber taps).
- New params: `taps: [{ id, position }]` (cm from the S1/`in` end) on
  waveguides and chambers; `throatSpace`/`mouthSpace` on waveguides (solid
  angle or `rigid`; the old `space` migrates to `mouthSpace`); dual voice coil
  options on drivers (`dvc: { coilOhms, coils: 'series'|'parallel'|'one' }`,
  absent = single coil).
- Loss (decided):
  - Waveguides: `Q` and `lossless` become one `loss` multiplier on the
    geometry-derived boundary-layer loss (default 1, 0 = lossless).
  - Chambers: `Q` and `lossless` become leakage, entered as
    `leak: { ql, hz }` — the familiar QL, referred to a frequency (default
    30 Hz, editable) and compiled to the equivalent resistor
    `R = ql / (2π·hz·C_box)`. Absent = sealed. Chamber wall loss is derived
    from geometry like a duct's.
  - Migration: waveguide `Q` → `loss: 1` (the old value expressed a
    frequency law that no longer exists), `lossless` → `loss: 0`; chamber
    `Q` → `leak.ql` with the same number, since that is how it has been
    used; chamber `lossless` → sealed.
- Chamber `probe`/`probePos` move to `probes`.
- Passive radiator: handles `front`/`rear` (the old `in` migrates to
  `rear`, its front left open to radiate, matching today), `count`.
- Driver and passive radiator `Q`/`lossless` removed, folded into `Rms`.
- Reserved on drivers: `nl` (already present) and `thermal`.

### Parameters and expressions (provisional)

```jsonc
"params": [
  { "name": "Vb",      "value": 60,        "note": "net box volume, L" },
  { "name": "portA",   "value": 80 },
  { "name": "portLen", "value": "Vb / 2" }
]
```

- Any numeric field — node params, channel volts, DSP filter values, tap
  positions — holds either a number or an expression string, e.g.
  `"volume": "Vb / 2"`. Text fields (labels, flare, shape) never do.
- Expressions: arithmetic, parentheses, `pi`, `sqrt`, `min`, `max`, `abs`,
  `log`, `exp`, and references to named params. No references to other
  nodes' fields for now. Parsed with the mathjs parser (already a
  dependency) restricted to those node types — no assignment, no function
  definitions.
- Params are plain numbers, used in the units of the field they land in.
  They may reference each other; a cycle is an error naming the params
  involved.
- Evaluated in JavaScript before compiling, so the netlist holds plain
  numbers and errors point at the field, not at SPICE.
- The optimizer and sweeps address params by name.

### Analyses

```jsonc
"analyses": [
  { "id": "sweep", "type": "ac", "fmin": 10, "fmax": 1000, "npts": 512,
    "masking": false,
    "sweep": { "param": "portLen", "values": [20, 25, 30] } }   // optional overlay
]
```

Later: `{ "type": "transient", "signal": { … }, "duration": …, "step": … }`.

### Probes (provisional)

Default outputs stay automatic — SPL, impedance, excursion, velocity in every
duct. Probes add anything else:

```jsonc
"probes": [
  { "id": "cabin",  "label": "Driver's seat", "kind": "pressure",
    "at": { "node": "chamber_cabin", "position": 120 } },
  { "id": "throat", "kind": "velocity", "at": { "node": "waveguide_1", "handle": "throat" } },
  { "id": "tap1",   "kind": "pressure", "at": { "node": "waveguide_1", "handle": "tap:t1" } }
]
```

- `kind`: `pressure` (shown as SPL), `flow`, `velocity`. Later: channel
  `current` and `voltage`.
- `at`: a handle (an end or a tap), or a `position` in cm along a chamber or
  waveguide.
- Migration: a chamber with `probe: true` becomes a pressure probe at its
  `probePos` converted to cm.
- Reserved: listener positions for combined output with source spacing,
  as a probe kind holding a distance per radiating source (default 1 m).

### Groups and sub-circuits (reserved)

```jsonc
"components": [{
  "id": "tappedHorn", "name": "Tapped horn section",
  "nodes": [ … ], "edges": [ … ],
  "ports":  [ { "name": "drvFront", "node": "…", "handle": "tap:t1" } ],
  "params": [ { "name": "L", "value": 250 } ]
}]
```

An instance is a node `{ "type": "group", "params": { "component": "tappedHorn",
"overrides": { "L": 300 } } }` whose handles are the component's port names.
Components may nest but not recurse. The compiler flattens them (or emits
`.subckt`). Nothing here is built until later; the shape is held so saved
files never need a second migration for it.

### Migration v1/v2 → v3

One step, applied on load: settings split as above; one channel carrying the
old voltage and `rg`, every driver node in parallel; `space` → `mouthSpace`;
chamber probes → `probes`; loss as above; empty
`params`, `probes`, `components`. Existing `migrateParams` (v1 → v2
`ecFactor`) runs first.

## Graph semantics, decided

- **Connections have no direction.** Any handle joins any handle, on every
  node type (React Flow 11 `connectionMode="loose"`). Ends keep identity only
  for geometry — a waveguide's throat is its S1 end, mouth its S2 end — so
  throat-to-throat and mouth-to-mouth are valid. Validation reduces to:
  acoustic handles join acoustic handles (electrical to electrical, once the
  amplifier node exists).
- **Unconnected ends.** A chamber end with nothing connected is always a
  closed wall — no setting; either end may be connected, both, or neither.
  Each waveguide end has its own setting for when nothing is connected: open
  into a solid angle (default half space) or closed. The waveguide's single
  `space` migrates to its mouth.
- **Chambers and waveguides compile to the same thing** — a line. They stay
  separate node types because they are specified differently (volume and
  length vs areas, length and flare) and carry different extras (stuffing,
  probe, leakage on chambers; flare on waveguides).
- **Taps** on waveguides and chambers: a list of `{ id, position }`, position
  in cm from the S1 / `in` end, edited in the node editor and drawn as handles
  along the node. Handle ids `tap:<id>`. A tap is an ideal junction; the
  compiler splits the line there. Anything may attach. A tap beyond the
  current length is a warning, never silently moved.
- **Driver face on a duct end** — the cone is the end of the duct: its flow
  enters the duct and the duct's pressure acts on it, so compression ratio
  follows from the areas. The Karal step between Sd and the end area is an
  inductor on the duct side. When Sd exceeds the end area, the editor warns
  that this is physically impossible without a throat chamber and offers to
  insert an ordinary chamber node there. The simulation still runs as an
  ideal zero-volume coupling if the warning is ignored.
- **Throat chamber calculator** — optional tool that computes the chamber's
  volume from cone depth and shape plus excursion clearance. Output only;
  the chamber stays an ordinary chamber node.
- **Electrical wiring lives outside the acoustic graph.** Drivers have no
  electrical handles. The driver node keeps `count` with series/parallel
  across that count, plus dual voice coil options: coil impedance, and coils
  in series, in parallel, or one coil only. The node shows its resulting
  nominal impedance.
- **The driver database has no dual/single distinction** and never will.
  Every driver's parameters are used exactly as given. Dual voice coil is
  purely an electrical option the user can switch on for any driver; when
  on, the given parameters are the both-coils-in-series configuration.
  Parallel: Re ÷ 4, Bl ÷ 2, Le ≈ ÷ 4 — Bl²/Re and Qes unchanged, only the
  impedance moves. One coil only: Re ÷ 2, Bl ÷ 2, Le ≈ ÷ 4, which doubles
  Qes.
- **Wiring manager** for anything deeper: amp channels, series/parallel
  connections between driver nodes, per-channel DSP, the load each channel
  sees (nominal from the coils, minimum from the simulation); later cable
  resistance and passive crossovers. Default: one channel with every driver
  node in parallel, which reproduces today's behaviour.
- **Amps are channels; drive level lives on each channel.** Signal chain:
  one program signal → per-channel DSP → per-channel amp → the drivers wired
  to that channel. A channel stores one voltage: its output at master 0 dB,
  which is its gain. The user may set it at any master level; it is stored
  normalized to 0 dB. A project-wide master (dB, default 0) offsets every
  channel together. Each channel displays nominal watts live — its voltage at
  the current master, squared, over the nominal load derived from its wiring.
  Volts are stored, never watts: rewiring a channel keeps its voltage and
  changes its wattage, as on a real amp. DSP (polarity, delay, filters, EQ)
  shapes each channel relative to its level and has no separate gain.
  A driver on no channel is undriven with its coil open.

  ```jsonc
  "wiring": {
    "masterDb": 0,
    "channels": [{
      "id": "ch1", "label": "Sub amp",
      "volts": 31.6,                       // output at master 0 dB
      "outputOhms": 0,                     // amp output + cable (today's rg)
      "rated": { "watts": 1000, "ohms": 1 },   // optional; warnings, later clipping
      "dsp": { "polarity": 1, "delayMs": 0, "filters": [
        { "type": "highpass", "shape": "butterworth", "order": 4, "hz": 25 } ] },
      "load": { "parallel": [ { "driver": "driver_a" },
        { "series": [ { "driver": "driver_b" }, { "driver": "driver_c" } ] } ] }
    }]
  }
  ```

  A driver node is a leaf on at most one channel; its own count, wiring and
  dual voice coil options stay inside the node. Migration: one channel with
  the old voltage, `rg` as output resistance, no DSP, every driver node in
  parallel. To check: whether the ngspice WASM build includes the XSPICE
  transfer-function block for filters in both analyses; otherwise build them
  from ordinary circuit parts.
- **Unconnected driver faces — infinite baffle.** A driver face with
  nothing attached radiates into half space, as if mounted in an infinite
  baffle. No per-face setting.
  - One face unconnected: its output is summed with every other radiating
    element (rear with inverted polarity).
  - Both faces unconnected: both load the cone, but only the front face
    counts toward the output — the rear is on the far side of the baffle.
  - "Driver output" is the output of exposed driver faces, nothing else.
- **Listening position.** By default every distinct radiating element —
  exposed driver face, open duct end, radiation node, passive radiator face
  — is 1 m from a common listening point, so the combined output is their
  coherent sum with no path differences. Per-source distances are the
  reserved listener probes.
- **Passive radiators have two faces**, `front`/`rear`, like a driver
  without a motor, so one can sit between two chambers. Unconnected faces
  follow the same infinite-baffle rule. `count` for several identical units.
- **A radiation node is one shared opening.** Everything connected to it
  joins at one point in the circuit, so two mouths on one radiation node act
  as a single combined opening. Separate openings stay unconnected and
  radiate independently.
- **No `Q`/`lossless` on drivers or passive radiators.** Rms is the
  mechanical loss; migration folds any extra into it
  (Rms + 2π·Fs·Mms/Q), so results are unchanged.
- **Units in the file are display units** — cm, L, cm², g — converted when
  the netlist is built.
- **Masking and taps.** With `masking` on, a chamber is one uniform
  pressure, so its ends and taps become the same point; taps stay
  connected, their positions stop mattering.
- **Snapshots record the analysis id** they came from, so overlays never
  mix a sweep with a transient.
- **Warnings vs errors.** Warnings flag physically unrealistic but
  simulatable graphs and never block a run. Errors are only for what cannot
  be simulated at all — no driver, invalid parameters.
- **The compiler always emits a solvable netlist**, e.g. a very large
  resistor to ground at every node so a sealed chamber is never floating.

## Modelling questions (not solver questions)

- **What an edge between two ducts means** — a straight seamless join, a
  bend, or user-specified. A bend adds loss and mass and changes the effective
  path length.
- **Neighbouring openings interact** at a shared wall; the model treats each
  as independent.
- **Loss, two mechanisms.**
  - *Linear dissipation* — energy actually lost, present in both analyses.
    Box leakage: a fixed resistor from the chamber to outside, entered as QL
    (replaces chamber `Q`). Wall friction and heat
    exchange in ducts and chambers: a boundary-layer loss per unit length
    rising as √f, realized as a short RL ladder (the same construction as
    skin effect in wires), derived from geometry via hydraulic radius, so
    narrow and slotted ducts lose more. This replaces α = k/2Q, which no
    physical element can produce. Stuffing: reduced sound speed plus added
    resistance per length. The waveguide `loss` multiplier (default 1)
    scales the derived loss.
  - *Flow-dependent resistance* — turbulence and jetting at duct ends,
    Δp = K·½ρ·v|v|, K ≈ 1 for a sharp edge, ≈ 0.2 for a good radius. A
    nonlinear behavioural element at each duct end, solved directly in
    transient (compression, harmonics, inflow/outflow asymmetry). It
    contributes nothing to the AC sweep by construction — the small-signal
    linearization of v|v| at zero flow is zero — which is physically right.
    K is an empirical geometry input. Phase 7, with nonlinear drivers.
- **Radiation fit tolerance** — proposed: within 1% of the Bessel/Struve
  impedance up to ka = 3.
