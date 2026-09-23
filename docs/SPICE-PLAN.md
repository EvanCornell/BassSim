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

## Schema, designed once

The file format should migrate once for all of this, not once per phase:

- a project-level analysis spec — which analyses, with which signals
- source nodes on the electrical side (amplifier, filters) feeding drivers
- per-driver channel, polarity and delay
- reserved per-driver fields for nonlinear curves and a thermal model
- listener position(s) for combined output

## Graph semantics, decided

- **Connections have no direction.** Any handle joins any handle, on every
  node type (React Flow 11 `connectionMode="loose"`). Ends keep identity only
  for geometry — a waveguide's throat is its S1 end, mouth its S2 end — so
  throat-to-throat and mouth-to-mouth are valid. Validation reduces to:
  acoustic handles join acoustic handles (electrical to electrical, once the
  amplifier node exists).
- **Per-end termination.** Each end of a waveguide and of a chamber has its
  own setting for when nothing is connected: open into a solid angle, or
  closed. Defaults: waveguide ends open (half space), chamber ends closed.
  The waveguide's single `space` migrates to its mouth.
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
