# SPICE engine plan

**Private — excluded from the public export (see `PUBLISH.md`).**

AcouSim stops solving circuits itself. The node graph is translated into a
SPICE netlist, ngspice solves it, and the output is translated back into what
a loudspeaker designer needs. Our code owns the two translations; the solver
is ngspice's, and is trusted.

---

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
- Duct loss: `Q` and `lossless` on waveguides become one `loss` multiplier on
  a physically derived wall loss (default 1, 0 = lossless). The exact
  migration of old `Q` values is settled when the realizable loss model is.
- Chamber `probe`/`probePos` move to `probes`.
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
chamber probes → `probes`; `Q`/`lossless` on waveguides → `loss`; empty
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
- **Duct loss must become realizable.** The current α = k/2Q (loss rising in
  proportion to frequency) is not a physical element; replace it with
  per-segment resistance or a boundary-layer network.
- **Radiation fit tolerance** — proposed: within 1% of the Bessel/Struve
  impedance up to ka = 3.
