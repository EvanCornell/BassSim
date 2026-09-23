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

**Returns**

- `{start: string, end: string, at: Function}` — The end nodes, and `at(x)` → the node at one of `points`.

**Mutates**

- ctx.nl.

## UNREACHABLE (3)

### `compileLine > at()`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

The one node of a lumped chamber, wherever along it is asked for.

**Returns**

- `string` — The node name.

**Reads external mutable state**

- the enclosing node.

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
