# Contract specification: `src/spice/nets.js`

> Generated from method contracts. This file contains **no implementation code**.
> Write tests against what is claimed here, not against what you expect the code to do.

## Module

Graph → netlist nodes, and the end-correction rule that depends on them.

Every set of handles joined by edges is one netlist node — a junction at a
single pressure. That is the whole reason paths that split and rejoin,
loops and meshes need no special handling: they are simply several
elements between the same nodes.

## EXPORTED (3)

### `faceArea(node, handle)`

- **Reachability:** EXPORTED
- **Obtain via:** import { faceArea } from '../../src/spice/nets.js'

The area a node presents at one of its handles, m².

**Parameters**

- `node` — `object` — A v3 node with resolved params.
- `handle` — `string` — The handle.

**Returns**

- `number|null` — Area in m², or `null` for a handle that is not a face with an area — a tap enters from the side, and a radiation node is open air.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `buildNets(proj, nl)`

- **Reachability:** EXPORTED
- **Obtain via:** import { buildNets } from '../../src/spice/nets.js'

Join the project's handles into netlist nodes.

**Parameters**

- `proj` — `object` — A resolved, valid v3 project.
- `nl` — `object` — The netlist builder, which names the nodes.

**Returns**

- `{netOf: Function, neighbours: Function, connected: Function}` — Lookups: `netOf(id, handle)` → node name; `neighbours(id, handle)` → the `{node, handle}` list joined to it by edges directly; `connected(id, handle)` → whether anything is.

**Mutates**

- nl — allocates one node per net.

### `endCorrection(nets, node, handle)`

- **Reachability:** EXPORTED
- **Obtain via:** import { endCorrection } from '../../src/spice/nets.js'

The end correction one end of a duct or chamber carries, m.

An end correction is a property of the discontinuity at a junction, not of
the duct, and exactly one side may hold it: the narrower, unless the other
side is a driver or passive radiator, which have nowhere to put it. Several
things joined to one end are one opening of their combined area. An end
joined to open air or to a tap gets nothing here — the radiation impedance
carries open air, and a tap is an ideal junction.

**Parameters**

- `nets` — `object` — From `buildNets`.
- `node` — `object` — A waveguide or chamber node.
- `handle` — `string` — One of its ends.

**Returns**

- `number` — Added length, m; 0 when this side does not own the junction.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

## UNREACHABLE (4)

### `buildNets > find(k)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

The representative of a handle's set.

**Parameters**

- `k` — `string` — `id:handle`.

**Returns**

- `string` — The root key.

**Mutates**

- the enclosing `parent` map (path compression).

### `buildNets > netOf(id, handle)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

The netlist node a handle belongs to.

**Parameters**

- `id` — `string` — Node id.
- `handle` — `string` — Handle name.

**Returns**

- `string` — The netlist node name.

**Reads external mutable state**

- the join sets.

### `buildNets > neighbours(id, handle)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

What an edge joins directly to a handle.

**Parameters**

- `id` — `string` — Node id.
- `handle` — `string` — Handle name.

**Returns**

- `Array<{node: object, handle: string}>` — The far ends of its edges.

**Reads external mutable state**

- the adjacency index.

### `buildNets > connected(id, handle)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Whether any edge touches a handle.

**Parameters**

- `id` — `string` — Node id.
- `handle` — `string` — Handle name.

**Returns**

- `boolean` — True when connected.

**Reads external mutable state**

- the adjacency index.
