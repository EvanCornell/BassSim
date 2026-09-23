# Contract specification: `src/schema/validate.js`

> Generated from method contracts. This file contains **no implementation code**.
> Write tests against what is claimed here, not against what you expect the code to do.

## Module

Structural checks on a resolved v3 project.

Two severities, and the line between them is deliberate. An *error* is
something that cannot be simulated at all — a missing driver, an edge to a
node that does not exist, a volume of zero. A *warning* is something that
can be simulated but is physically questionable, or may not be what the
user meant; it never blocks a run. Warnings are keyed by node id so the
editor can show each one on the node it concerns.

## EXPORTED (4)

### `nodeHandles(node)`

- **Reachability:** EXPORTED
- **Obtain via:** import { nodeHandles } from '../../src/schema/validate.js'

Every handle a node exposes, taps included.

**Parameters**

- `node` — `object` — A v3 node.

**Returns**

- `string[]` — Handle names an edge may use on it.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `loadLeaves(tree, out)`

- **Reachability:** EXPORTED
- **Obtain via:** import { loadLeaves } from '../../src/schema/validate.js'

Collect the driver ids at the leaves of a series/parallel load tree.

**Parameters**

- `tree` — `object|null` — `{parallel: [...]}`, `{series: [...]}` or `{driver: id}`.
- `out` — `string[]` _(optional)_ — Accumulator.

**Returns**

- `string[]` — Driver ids in tree order, duplicates included.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `driverChannels(proj)`

- **Reachability:** EXPORTED
- **Obtain via:** import { driverChannels } from '../../src/schema/validate.js'

Which channel drives each driver node.

A channel's explicit load tree claims its leaves. The one channel whose
`load` is `null` takes every driver no tree claimed, in parallel — which is
what keeps a newly added driver driven without anyone editing a tree. A
driver claimed by no channel is undriven.

**Parameters**

- `proj` — `object` — A v3 project.

**Returns**

- `Map<string, string>` — Driver node id → channel id.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `validateProject(proj)`

- **Reachability:** EXPORTED
- **Obtain via:** import { validateProject } from '../../src/schema/validate.js'

Check a resolved v3 project for anything that prevents or questions a run.

**Parameters**

- `proj` — `object` — A v3 project whose expressions are already resolved (see `resolveProject`).

**Returns**

- `{errors: string[], warnings: Object<string, string[]>}` — Blocking errors, and warnings keyed by node id.

**Postconditions (must hold on return)**

- proj is not modified

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

## UNREACHABLE (3)

### `endArea(node, handle)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

The area a node presents at one of its handles, cm², for the throat-chamber check.

**Parameters**

- `node` — `object` — A v3 node.
- `handle` — `string` — The handle.

**Returns**

- `number|null` — Area in cm², or `null` where the handle has no meaningful face area (a tap enters from the side).

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `validateProject > warn(id, msg)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Record a warning against a node.

**Parameters**

- `id` — `string` — Node id.
- `msg` — `string` — The warning.

**Returns**

- `void`

**Mutates**

- the enclosing `warnings`.

### `validateProject > connected(id, h)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Whether a handle has anything attached.

**Parameters**

- `id` — `string` — Node id.
- `h` — `string` — Handle name.

**Returns**

- `boolean` — True when connected.

**Reads external mutable state**

- the enclosing `conns` index.
