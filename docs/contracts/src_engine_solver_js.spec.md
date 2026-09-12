# Contract specification: `src/engine/solver.js`

> Generated from method contracts. This file contains **no implementation code**.
> Write tests against what is claimed here, not against what you expect the code to do.

## Module

Graph → transfer-matrix chain solver.
Convention: ABCD matrices map [p_in; U_in] = M · [p_out; U_out] with
p = acoustic pressure (Pa), U = volume velocity (m^3/s).

A node is `{ id, type, data: { params } }` and an edge is
`{ source, sourceHandle, target, targetHandle }`. Each node type exposes a
fixed set of named handles, and an edge must name one at each end:

  driver      front (out), rear (out)  — both may fan out
  chamber     in (in), out (out)
  waveguide   throat (in), mouth (out)
  pr          in (in)
  radiation   in (in)

Ports are directional: an output handle connects to an input handle. An
unconnected output is not an error — an open waveguide mouth radiates, and a
chamber with nothing on its outlet is sealed.

## Exported constants

Names this module publishes that are not methods. The method contracts
above and below refer to these by role — a command, a node type, a panel —
so this is the vocabulary they assume.

### `__internals`

Keys: `normQ`, `driverPassiveMechZ`, `buildGraph`

## EXPORTED (3)

### `driverSI(p)`

- **Reachability:** EXPORTED
- **Obtain via:** import { driverSI } from '../../src/engine/solver.js'

Convert a driver node's display-unit parameters into the SI set the solver runs on.

This is also where a multi-driver node collapses into one equivalent driver.
Series wiring multiplies Re, Le and Bl by the count; parallel wiring divides
the electrical terms; series-parallel splits the count into a square grid
when it is a perfect square and falls back to plain parallel when it is not.
The mechanical side scales with cone count regardless of wiring: Sd, Mms and
Rms multiply, Cms divides.

Every field has a fallback, so a partially filled node still simulates rather
than producing NaN. That is deliberate — the editor lets you drop a driver on
the canvas before typing any numbers.

**Parameters**

- `p` — `object` — Driver node params in display units (Sd cm², Mms g, Cms mm/N, Le mH, Xmax mm).

**Returns**

- `{n: number, s: number, par: number, Re: number, Le: number, LeExp: number, Bl: number, Sd: number, Mms: number, Cms: number, Rms: number, Fs: number, Xmax: number, Q: number}` — The equivalent single driver in SI units, plus the resolved count and the series/parallel multipliers.

**Postconditions (must hold on return)**

- result.n >= 1
- p is not modified

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `validateGraph(nodes, edges)`

- **Reachability:** EXPORTED
- **Obtain via:** import { validateGraph } from '../../src/engine/solver.js'

Check a graph for topology mistakes without simulating it.

The distinction the return value draws is the important one: `errors` stop
the sweep, `warnings` do not. Most topology problems are legitimate designs
the model handles approximately — an unconnected mouth is a working port, not
a mistake — so they are surfaced on the node and left alone.

The one error is having no driver at all, since there would be nothing to
excite the network.

**Parameters**

- `nodes` — `Array<object>` — Graph nodes.
- `edges` — `Array<object>` — Graph edges.

**Returns**

- `{warnings: Object<string, string[]>, errors: string[]}` — Warnings keyed by node id, and graph-level errors that block simulation.

**Postconditions (must hold on return)**

- nodes and edges are not modified

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `runSimulation(nodes, edges, settings)`

- **Reachability:** EXPORTED
- **Obtain via:** import { runSimulation } from '../../src/engine/solver.js'

Solve the whole graph across the frequency sweep.

The single entry point of the engine. For each of `npts` log-spaced
frequencies it builds every element's ABCD matrix, walks the graph backward
to find the load each driver sees, solves the coupled electro-mechanical
equation for cone velocity, then walks forward again accumulating radiated
pressure, port velocity and interior probe pressure.

Multiple drivers are handled by **superposition**: each is solved as the sole
source with the others present as passive mechanical loads, and the resulting
pressures are summed coherently. Excursion is deliberately *not* summed —
cones move independently, so `excursion` reports the worst single cone and
`excursionRatio` the worst cone relative to its own Xmax.

When `settings.nlEnabled` is set and at least one driver has nonlinear
curves, the whole sweep runs four times, refining per-frequency Bl/Cms/Le
scale factors from the previous pass's excursion by damped fixed-point
iteration. This is experimental and roughly quadruples the solve time.

`splCombined` is the *complex* sum of every radiating outlet, so radiators
that oppose each other cancel. A bare driver with both faces wired straight
to radiation nodes is the extreme case: front and rear are exactly out of
phase into the same far field, the sum is identically zero, and the reported
level sits at the −146 dB floor at every frequency and every drive voltage.
That is the physics, not a failure — a dipole needs a baffle, and the drive
level is visible in `splDriver`, `excursion` and `zinMag` regardless.

**Parameters**

- `nodes` — `Array<object>` — Graph nodes, each `{id, type, data: {params}}`.
- `edges` — `Array<object>` — Graph edges.
- `settings` — `object` — Sweep settings.
- `settings.fmin` — `number` _(optional, default `10`)_ — Sweep start, Hz.
- `settings.fmax` — `number` _(optional, default `1000`)_ — Sweep end, Hz.
- `settings.npts` — `number` _(optional, default `512`)_ — Log-spaced frequency points.
- `settings.voltage` — `number` _(optional, default `2.83`)_ — Drive voltage, V RMS at the amplifier.
- `settings.rg` — `number` _(optional, default `0`)_ — Amplifier source resistance, Ω.
- `settings.masking` — `boolean` _(optional)_ — Replace chambers with lumped compliances, hiding standing-wave artifacts.
- `settings.nlEnabled` — `boolean` _(optional)_ — Enable the experimental large-signal mode.

**Returns**

- `object` — On success `{ok: true, validation, freqs, splCombined, splDriver, splPorts, splInterior, zinMag, zinPhase, excursion, excursionByDriver, excursionRatio, xmaxByDriver, velocity, power, peReal, peApparent, phase, phaseUnwrapped, groupDelay, nl, elapsedMs}`. On failure `{ok: false, validation, freqs: []}` — returned rather than thrown, because an incomplete graph is the normal state while the user is still wiring it up.

**Preconditions (caller must guarantee)**

- settings.npts >= 2 — the log spacing divides by npts - 1
- settings.fmin > 0 — the sweep is logarithmic

**Mutates**

- Stashes solver scratch state on the caller's node objects (`node._Zl`) and on returned impedances (`Z._radS`). Harmless to the graph's meaning, but the input array is not left untouched.

**Side effects**

- Reads `performance.now()` twice to report `elapsedMs`, so the result is not bit-identical across runs.

## INTERNAL (3)

### `normQ(p)`

- **Reachability:** INTERNAL
- **Obtain via:** import { __internals } from '../../src/engine/solver.js'  →  __internals.normQ

Resolve a node's loss factor to a number the element builders can use.

Collapses two ways of saying "lossless" — an explicit `lossless` flag and a
non-positive Q — onto `Infinity`, which is what `combineQ` and `tlineMatrix`
expect. Without this, a Q of 0 read literally would divide by zero.

A *missing* Q is not lossless: it falls back to 50, the same moderate loss a
new node is created with, so a node whose Q was never set behaves like one
that was left at its default rather than like a lossless idealisation.

**Parameters**

- `p` — `object` — Any node's params.
- `p.lossless` — `boolean` _(optional)_ — When true, force `Infinity` regardless of Q.
- `p.Q` — `number` _(optional, default `50`)_ — The node's loss factor.

**Returns**

- `number` — A positive Q, or `Infinity` for lossless.

**Postconditions (must hold on return)**

- result > 0

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `driverPassiveMechZ(d, Rg, w)`

- **Reachability:** INTERNAL
- **Obtain via:** import { __internals } from '../../src/engine/solver.js'  →  __internals.driverPassiveMechZ

Mechanical impedance of a driver acting as a passive load rather than a source.

When a second driver sits on the same enclosure but is not the one being
driven in this superposition pass, it still presents a load: its moving mass,
suspension and — through the motor — its blocked electrical impedance
reflected back as `Bl²/Ze`. Ignoring that term would let an unpowered cone
behave as though its motor were disconnected.

**Parameters**

- `d` — `object` — An SI driver from `driverSI`.
- `Rg` — `number` — Amplifier source resistance, Ω, in series with the coil.
- `w` — `number` — Angular frequency ω, rad/s.

**Returns**

- `Complex` — Mechanical impedance, N·s/m, including the reflected electrical term.

**Preconditions (caller must guarantee)**

- w > 0 — the compliance term divides by ω

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `buildGraph(nodes, edges)`

- **Reachability:** INTERNAL
- **Obtain via:** import { __internals } from '../../src/engine/solver.js'  →  __internals.buildGraph

Build an undirected adjacency index keyed by `nodeId:handle`.

Each edge is registered from both ends, so a lookup on either side finds the
other. That matters because the solver traverses in both directions: forward
for pressure propagation, backward when a downstream element needs to know
its load.

Edges referencing a missing node are skipped rather than throwing — a project
file edited by hand can carry a dangling edge, and it should not stop the
whole sweep.

**Parameters**

- `nodes` — `Array<{id: string, type: string, data: object}>` — Graph nodes.
- `edges` — `Array<{source: string, sourceHandle: string, target: string, targetHandle: string}>` — Graph edges.

**Returns**

- `{byId: Map<string, object>, adj: Map<string, Array<{node: object, handle: string}>>}` — Node lookup and the adjacency index.

**Postconditions (must hold on return)**

- nodes and edges are not modified

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

## UNREACHABLE (7)

### `validateGraph > connected(id, h)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Whether a given port has at least one edge attached.

**Parameters**

- `id` — `string` — Node id.
- `h` — `string` — Handle name.

**Returns**

- `boolean` — True when the port is connected.

**Reads external mutable state**

- the `adj` index built above

### `runSimulation > effDriver(id, i)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

The SI driver to use at one frequency point, with nonlinear scaling applied.

In linear mode this is the cached `driverSI` result, returned by reference.
In nonlinear mode it is a fresh object with Bl, Cms and Le scaled by the
factors the previous sweep derived for this frequency, so callers must not
rely on identity between calls.

**Parameters**

- `id` — `string` — Driver node id.
- `i` — `number` — Frequency index into the sweep.

**Returns**

- `object` — The effective SI driver at that frequency.

**Reads external mutable state**

- `nlActive` and the `nlScales` table, which the outer iteration loop rewrites between passes — the same arguments give different results on a later pass.

### `runSimulation > faceArea(node, handle)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Area a node presents at one of its handles.

**Parameters**

- `node` — `object` — The node on the far side of a junction.
- `handle` — `string` — The handle the junction arrives at.

**Returns**

- `number|null` — Area in m², or `null` for a terminal that is not a duct face — a radiation node is open air, which has no area and needs no correction.

**Reads external mutable state**

- Node params, and the SI driver table for a driver's total cone area.

### `runSimulation > faceCorrection(node, handle)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

The end correction one face of a two-port carries, in its own area's units.

The mass at a junction is one physical thing, so exactly one of the two
sides may hold it or it would be counted twice. It goes to the narrower
side, which is where it physically sits and where `ρ·ΔL/S` is defined —
unless that side is a driver or a passive radiator, which have no place to
put it, in which case the duct holds it referred to its own area.

Several branches on one handle are one opening of their combined area: a
chamber vented by three identical ports is not three separate junctions
with the small area of one.

**Parameters**

- `node` — `object` — The two-port being built.
- `handle` — `string` — `'throat'`/`'mouth'` for a waveguide, `'in'`/`'out'` for a chamber.

**Returns**

- `number` — Added effective length in m, zero for an open end or for the side that does not own the junction.

**Reads external mutable state**

- The adjacency index and node params.

### `runSimulation > getMatrix(node, Sup)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

ABCD matrix of a two-port node at the current frequency, memoized.

The cache is per-frequency and is what keeps the cost linear: a chamber
reached from three different branches is built once. Throat and mouth
areas are stashed on the returned matrix as `S1`/`S2` because downstream
radiation and velocity calculations need the geometry and would otherwise
have to re-derive it from the params.

**Parameters**

- `node` — `object` — A `waveguide` or `chamber` node.
- `Sup` — `number` _(optional)_ — Upstream exit area, m². Accepted for signature symmetry with `inputZ`; the matrix depends only on the node's own geometry.

**Returns**

- `ABCD|null` — The node's matrix decorated with `S1` and `S2`, or `null` for node types that are not two-ports.

**Mutates**

- Writes into the per-frequency `matCache`, and sets `S1`/`S2` on the matrix it returns.

**Reads external mutable state**

- the current frequency `w` and the `masking` setting from the enclosing scope.

### `runSimulation > inputZ(node, fromHandle, Sup, visited)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Acoustic impedance looking into a node, resolved recursively downstream.

This is the backward walk. A two-port asks its downstream neighbours for
their impedances, combines parallel branches in shunt, and transforms the
result through its own matrix. Terminals answer directly: a radiation
node from the piston model, a passive radiator from its own resonance
plus radiation loading, and a driver from `driverPassiveMechZ` plus
whatever loads its other side.

`visited` guards against cycles in the user's graph, which the editor
permits — a loop returns a near-infinite impedance so it reads as a
blocked path rather than recursing forever.

**Parameters**

- `node` — `object` — The node being looked into.
- `fromHandle` — `string` — The handle the caller arrived at, which decides the direction of travel.
- `Sup` — `number|null` — Upstream exit area, m², used as the radiating area when a radiation node has no explicit override.
- `visited` — `Set<string>` — Node ids already on the current path.

**Returns**

- `Complex` — Acoustic impedance, Pa·s/m³.

**Postconditions (must hold on return)**

- `visited` is not modified — each level copies it before recursing.

**Mutates**

- Writes into the per-frequency `zCache`, stashes the resolved load on `node._Zl`, and tags radiation impedances with `_radS` for the propagation pass.

**Reads external mutable state**

- the current frequency `w`, the adjacency index, and the nonlinear scale table via `effDriver`.

### `runSimulation > propagateInto(node, fromHandle, p, U, visited, viaFront)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Push an acoustic state into a node and accumulate everything it radiates.

The forward walk, and the counterpart to `inputZ`. Terminals convert
volume velocity into far-field pressure at 1 m and add it to the running
sums; two-ports carry the state through their matrix and recurse. At a
junction the flow is split by admittance, `Uᵢ = p/Zᵢ`.

Accumulation is complex, not magnitude, because a node can be reached
from several sources — a cabin fed by both a driver's rear and a port —
and the port velocity readout has to stay phase-coherent with the summed
SPL rather than double-counting.

A `rigid` radiation node returns immediately: a closed wall radiates
nothing, though it still loaded the circuit during the backward walk.

**Parameters**

- `node` — `object` — The node receiving the state.
- `fromHandle` — `string` — Handle the state enters through.
- `p` — `Complex` — Pressure at the entry, Pa.
- `U` — `Complex` — Volume velocity into the entry, m³/s.
- `visited` — `Set<string>` — Node ids already on the current path; revisiting one returns without emitting.
- `viaFront` — `boolean` — Whether this path originates at a driver's front port. Only front-fed radiation counts toward the driver-only SPL overlay.

**Returns**

- `void`

**Mutates**

- Accumulates into the enclosing `emit`, `wgAcc` and `probeAcc` collectors, and into the caches `inputZ` and `getMatrix` own.

**Reads external mutable state**

- the current frequency `w`, the adjacency index, and the `masking` setting.
