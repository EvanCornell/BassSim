# Contract specification: `src/schema/toLegacy.js`

> Generated from method contracts. This file contains **no implementation code**.
> Write tests against what is claimed here, not against what you expect the code to do.

## Module

Translate a v3 project into the form the legacy solver reads.

The legacy engine (`src/engine/solver.js`) walks the graph as a tree from
each driver, so it only understands directed edges from an output handle to
an input handle, one drive voltage, and per-element `Q`. Anything a v3
project can say that it cannot is refused here with a message pointing at
the SPICE engine, rather than being quietly approximated.

## EXPORTED (1)

### `toLegacy(proj)`

- **Reachability:** EXPORTED
- **Obtain via:** import { toLegacy } from '../../src/schema/toLegacy.js'

Convert a resolved v3 project into the legacy serialized form.

**Parameters**

- `proj` — `object` — A v3 project with expressions resolved.

**Returns**

- `{nodes: object[], edges: object[], settings: object}` — The legacy project, ready for `hydrateProject`.

**Throws**

- `Error` — When the project uses anything the legacy engine cannot represent. Every reason is on the error's `projectErrors` property.

**Postconditions (must hold on return)**

- proj is not modified

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

## UNREACHABLE (5)

### `legacyHandle(node, handle)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Map a v3 handle to its legacy name.

**Parameters**

- `node` — `object` — The node the handle belongs to.
- `handle` — `string` — The v3 handle.

**Returns**

- `string` — The legacy handle name.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `orient(a, ha, b, hb)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Orient one undirected v3 edge the way the legacy engine needs it.

**Parameters**

- `a` — `object` — One end's node.
- `ha` — `string` — That end's handle, legacy-named.
- `b` — `object` — The other end's node.
- `hb` — `string` — That end's handle, legacy-named.

**Returns**

- `object|null` — `{source, sourceHandle, target, targetHandle}`, or `null` when neither orientation is a legacy output-to-input edge.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `orient > out(n, h)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Whether a handle is a legacy output.

**Parameters**

- `n` — `object` — Node.
- `h` — `string` — Legacy handle name.

**Returns**

- `boolean` — True for an output.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `orient > inp(n, h)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Whether a handle is a legacy input.

**Parameters**

- `n` — `object` — Node.
- `h` — `string` — Legacy handle name.

**Returns**

- `boolean` — True for an input.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `toLegacy > need(msg)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Record a reason the legacy engine cannot run this project.

**Parameters**

- `msg` — `string` — What it cannot represent.

**Returns**

- `void`

**Mutates**

- the enclosing `why` list.
