# Contract specification: `src/spice/line.js`

> Generated from method contracts. This file contains **no implementation code**.
> Write tests against what is claimed here, not against what you expect the code to do.

## Module

A duct or chamber as a sliced transmission line.

Chambers and waveguides compile to the same element: a line along its
length, cut at every tap and probe so those land on real nodes. A uniform
lossless piece is one exact SPICE transmission line. A flared piece is
stepped into slices along its area profile. Wall loss is distributed:
each slice gets a series √(jω) viscous element at its middle and a shunt
√(jω) thermal element at its ends, so the loss follows the geometry and
scales with length the way friction and heat exchange do.

## EXPORTED (1)

### `compileLine(ctx, spec)`

- **Reachability:** EXPORTED
- **Obtain via:** import { compileLine } from '../../src/spice/line.js'

Compile one line into the netlist.

**Parameters**

- `ctx` — `object` — Compile context: `{nl, band, fmax}`.
- `spec` — `object` — The line.
- `spec.note` — `string` — Comment naming the graph node.
- `spec.L` — `number` — Length, m.
- `spec.area` — `Function` — Cross-section at distance x from the start, m² → m².
- `spec.c` — `number` — Speed of sound in the line, m/s.
- `spec.shape` — `string` — Cross-section shape, for the perimeter.
- `spec.viscous` — `number` — Multiplier on viscous wall loss; 0 for none.
- `spec.thermal` — `number` — Multiplier on thermal wall loss; 0 for none.
- `spec.flowResistance` — `number` — Series resistance per metre from stuffing, as σ (Pa·s/m²); divided by the local area.
- `spec.stepped` — `boolean` — Whether the area varies, so the line must be sliced along its profile.
- `spec.lumped` — `boolean` — Collapse the whole line to one node and a compliance.
- `spec.volume` — `number` — Air volume, m³, for the lumped form.
- `spec.points` — `number[]` — Distances, m, where nodes are needed (taps and probes).
- `spec.flowPoints` — `number[]` _(optional)_ — Distances, m, strictly inside the line, where the flow along it is to be read.

**Returns**

- `{start: string, end: string, at: Function, flowAt: Function}` — The end nodes; `at(x)` → the node at one of `points`; `flowAt(x)` → the sense source carrying the flow past one of `flowPoints`, toward the end, or `null` where there is none.

**Mutates**

- ctx.nl.

## UNREACHABLE (7)

### `segment(ctx, a, b, Z0, td, note)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

One uniform piece of line, between two nodes.

In the frequency sweep it is SPICE's exact lossless line. In a transient
run it is a ladder of L-C sections instead: an ideal line re-launches
every sharp edge in its input as reflections at its delay, and with many
short lines those pile up until ngspice cannot find a step small enough
("timestep too small"). The ladder has no delays to schedule, so the step
follows the signal, not the geometry.

**Parameters**

- `ctx` — `object` — Compile context: `{nl, tran, fmax}`.
- `a` — `string` — One end.
- `b` — `string` — The other end.
- `Z0` — `number` — Characteristic impedance, ρc/S.
- `td` — `number` — Delay, s.
- `note` — `string` _(optional)_ — Comment.

**Returns**

- `void`

**Mutates**

- ctx.nl.

### `compileLine > at()`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

The one node of a lumped chamber, wherever along it is asked for.

**Returns**

- `string` — The node name.

**Reads external mutable state**

- the enclosing node.

### `compileLine > flowAt()`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

A lumped chamber has no flow along it.

**Returns**

- `null` — Always.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `compileLine > clamp(x)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Clamp a distance onto the line.

**Parameters**

- `x` — `number` — Distance, m.

**Returns**

- `number` — The distance within [0, L].

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `compileLine > addShunt(node, len, S)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Record a share of line length whose thermal loss belongs at a node.

**Parameters**

- `node` — `string` — The node.
- `len` — `number` — Length share, m.
- `S` — `number` — Local area, m².

**Returns**

- `void`

**Mutates**

- the enclosing `shunt` map.

### `compileLine > at(x)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

The node at one of the requested points.

**Parameters**

- `x` — `number` — Distance from the start, m — one of `spec.points`.

**Returns**

- `string` — The node name.

**Reads external mutable state**

- the breakpoint map.

### `compileLine > flowAt(x)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

The sense source carrying the flow past a point, toward the end.

**Parameters**

- `x` — `number` — Distance from the start, m — one of `spec.flowPoints`.

**Returns**

- `string|null` — The source name, or `null` for a point that was not cut.

**Reads external mutable state**

- the flow-sense map.
