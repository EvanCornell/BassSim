# Contract specification: `src/spice/elements.js`

> Generated from method contracts. This file contains **no implementation code**.
> Write tests against what is claimed here, not against what you expect the code to do.

## Module

Node types as netlist elements.

Each function adds one graph node's circuit and records, in `ctx.map`, which
SPICE outputs mean what — which sense source carries a cone's velocity, a
port's flow, a radiator's output — so the adapter can turn raw vectors into
speaker quantities without knowing how the netlist was built.

## EXPORTED (6)

### `compileWaveguide(ctx, node)`

- **Reachability:** EXPORTED
- **Obtain via:** import { compileWaveguide } from '../../src/spice/elements.js'

Compile a waveguide — port, duct or horn segment.

Every end gets a flow sense. A connected end joins its junction through the
end correction it owns. An unconnected end radiates into its own solid
angle, or is closed when that is `rigid`; the air the radiation carries is
given the duct's wall loss over its equivalent length.

**Parameters**

- `ctx` — `object` — Compile context.
- `node` — `object` — The waveguide node.

**Returns**

- `void`

**Mutates**

- ctx.nl and ctx.map.

### `compileChamber(ctx, node)`

- **Reachability:** EXPORTED
- **Obtain via:** import { compileChamber } from '../../src/spice/elements.js'

Compile a chamber.

A line of area volume/length, slowed and made lossy by stuffing, with
viscous and thermal wall loss from its geometry, and leakage as a resistance
to outside split between its two ends. An unconnected end is a closed wall.

**Parameters**

- `ctx` — `object` — Compile context.
- `node` — `object` — The chamber node.

**Returns**

- `void`

**Mutates**

- ctx.nl and ctx.map.

### `applyDvc(p)`

- **Reachability:** EXPORTED
- **Obtain via:** import { applyDvc } from '../../src/spice/elements.js'

Apply a driver's dual voice coil wiring to its catalogue parameters.

Catalogue data for a dual-coil driver is its both-coils-in-series figures.
Parallel quarters Re and Le and halves Bl, leaving Bl²/Re — and so Qes and
the response shape — unchanged. One coil alone halves Re and Bl, doubling Qes.

**Parameters**

- `p` — `object` — Driver params, display units.

**Returns**

- `object` — The params with Re, Bl and Le adjusted.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `compileDriver(ctx, node, terms)`

- **Reachability:** EXPORTED
- **Obtain via:** import { compileDriver } from '../../src/spice/elements.js'

Compile a driver.

Electrical side: Re, the voice coil inductance (a fitted ladder when LeExp
is below 1), and the back EMF Bl·u, between the terminals the wiring gave
it. Mechanical side: the force Bl·i driving Rms, Mms and Cms against the
acoustic reaction Sd·(p_front − p_rear). Acoustic side: a flow Sd·u out of
the front net and into the rear. Several identical drivers in one node, and
their wiring, collapse to one equivalent via `driverSI`.

**Parameters**

- `ctx` — `object` — Compile context.
- `node` — `object` — The driver node.
- `terms` — `{ep: string, em: string}` — The driver's electrical terminals.

**Returns**

- `void`

**Mutates**

- ctx.nl and ctx.map.

### `compilePR(ctx, node)`

- **Reachability:** EXPORTED
- **Obtain via:** import { compilePR } from '../../src/spice/elements.js'

Compile a passive radiator: a driver without a motor.

**Parameters**

- `ctx` — `object` — Compile context.
- `node` — `object` — The passive radiator node.

**Returns**

- `void`

**Mutates**

- ctx.nl and ctx.map.

### `compileRadiation(ctx, node)`

- **Reachability:** EXPORTED
- **Obtain via:** import { compileRadiation } from '../../src/spice/elements.js'

Compile a radiation node — one shared opening to open air.

Everything joined to it radiates through one load, whose area is the
node's override or the combined area of the faces joined to it. When only
driver faces are joined to it, its output is driver output.

**Parameters**

- `ctx` — `object` — Compile context.
- `node` — `object` — The radiation node.

**Returns**

- `void`

**Mutates**

- ctx.nl and ctx.map.

## UNREACHABLE (12)

### `noteOf(node)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

A readable name for a graph node in netlist comments.

**Parameters**

- `node` — `object` — A v3 node.

**Returns**

- `string` — Its label and id.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `endMass(ctx, from, to, dl, S, viscous, note)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Join an element's internal node to its netlist node through an end mass.

The end correction is a series acoustic mass ρ·Δ/S, and — scaled by the
element's loss multiplier — the same viscous wall loss a Δ-long extension of
the duct would have, so the air at the end is lossy at the same rate as the
air inside.

Callers join the nodes directly when there is no correction — a wire, not a
near-zero resistor, whose enormous conductance would cost the solver most of
its precision.

**Parameters**

- `ctx` — `object` — Compile context.
- `from` — `string` — Node on the junction side.
- `to` — `string` — The element's end node.
- `dl` — `number` — Added length, m; must be positive.
- `S` — `number` — Area at this end, m².
- `viscous` — `number` — Loss multiplier; 0 for none.
- `note` — `string` — Comment.

**Returns**

- `void`

**Mutates**

- ctx.nl.

### `probesOn(ctx, node)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Probes placed at a distance along a node.

**Parameters**

- `ctx` — `object` — Compile context, carrying the project's positioned probes.
- `node` — `object` — A chamber or waveguide.

**Returns**

- `Array<{probe: object, x: number, flow: boolean}>` — Its probes, their distance in m from the start, and whether they read flow rather than pressure.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `linePoints(node, probes)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

The distances along a node where its line must have a node or a cut.

**Parameters**

- `node` — `object` — A chamber or waveguide.
- `probes` — `Array<object>` — From `probesOn`.

**Returns**

- `{points: number[], flowPoints: number[]}` — Tap and pressure-probe distances, and flow-probe distances, m.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `placeProbes(ctx, node, line, probes, areaAt, ends)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Record where each probe on a line landed.

A pressure probe reads the node at its distance. A flow or velocity probe
reads the sense source cut into the line there; one at either end reads
that end's flow instead, which the compiler resolves once every element is
built. A probe that migrated from a chamber's own probe is reported under
the chamber's id, where the editor looks for it; any other under its own id.

**Parameters**

- `ctx` — `object` — Compile context.
- `node` — `object` — The chamber or waveguide.
- `line` — `object` — The compiled line.
- `probes` — `Array<object>` — From `probesOn`.
- `areaAt` — `Function` — Cross-section at a distance, m → m².
- `ends` — `string[]` — The node's start and end handle names.

**Returns**

- `void`

**Mutates**

- ctx.map.probes, ctx.map.flowProbes and ctx.endFlowProbes.

### `recordFlow(ctx, id, handle, name, scale, S)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Record which sense source carries the flow through a handle.

**Parameters**

- `ctx` — `object` — Compile context.
- `id` — `string` — Node id.
- `handle` — `string` — Handle name.
- `name` — `string` — The sense source (or cone velocity source).
- `scale` — `number` — Factor from the source's current to volume flow — Sd for a cone, 1 otherwise.
- `S` — `number` — Area for velocity, m².

**Returns**

- `void`

**Mutates**

- ctx.map.handleFlows.

### `connectTaps(ctx, node, line, areaAt)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Connect a node's taps to the nets joined to them.

**Parameters**

- `ctx` — `object` — Compile context.
- `node` — `object` — A chamber or waveguide.
- `line` — `object` — The compiled line.
- `areaAt` — `Function` — Cross-section at a distance, m → m².

**Returns**

- `void`

**Mutates**

- ctx.nl and ctx.map.handleFlows.

### `exitLoss(ctx, from, to, senseName, K, S, note)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Add the flow-dependent loss at a duct end: Δp = K·½ρ·v|v|.

Jetting and separation where a duct opens into a larger space dissipate
the dynamic pressure of the flow. It is a series behavioural source,
opposing the flow through the end's sense source. The small-signal
linearisation of v|v| at rest is zero, so it is only ever added to
nonlinear transient runs.

**Parameters**

- `ctx` — `object` — Compile context.
- `from` — `string` — Node the flow arrives on.
- `to` — `string|undefined` — Node to end on; a new one by default.
- `senseName` — `string` — The sense source carrying the flow from `from` onward.
- `K` — `number` — Loss coefficient: about 1 for a sharp edge, 0.2 for a generous radius.
- `S` — `number` — End area, m².
- `note` — `string` — Comment.

**Returns**

- `string` — The node beyond the loss.

**Mutates**

- ctx.nl.

### `compileChamber > area()`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

The chamber's cross-section, the same all along it.

**Returns**

- `number` — Area, m².

**Reads external mutable state**

- the enclosing chamber area.

### `exposedFaces(ctx, node, Sd, isDriver)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Compile the radiation from an exposed moving face.

An unconnected face radiates as if mounted in an infinite baffle. With one
face exposed its output counts; with both exposed, only the front counts —
the rear is on the far side of the baffle — though both load the cone.

**Parameters**

- `ctx` — `object` — Compile context.
- `node` — `object` — A driver or passive radiator.
- `Sd` — `number` — Moving area, m².
- `isDriver` — `boolean` — Whether the output is driver output.

**Returns**

- `void`

**Mutates**

- ctx.nl and ctx.map.

### `driverCurves(p, xmax)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

A driver's large-signal curves as expression builders, or `null` when it has none.

**Parameters**

- `p` — `object` — Driver params, with `nl` curves.
- `xmax` — `number` — Xmax, mm.

**Returns**

- `{bl: Function|null, k: Function|null, le: Function|null, leSlope: Function|null}|null` — Each takes the excursion expression (m) and returns the ratio expression; `leSlope` the slope of the Le ratio per metre.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `driverCurves > expr(f)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

An expression builder for a function of excursion.

**Parameters**

- `f` — `Function|null` — mm → value.

**Returns**

- `Function|null` — Excursion expression → value expression.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.
