# Contract specification: `src/schema/extras.js`

> Generated from method contracts. This file contains **no implementation code**.
> Write tests against what is claimed here, not against what you expect the code to do.

## Module

Editing helpers for the project sections outside the node graph — wiring,
probes, named params — kept pure so the store and the tests share them.

## EXPORTED (6)

### `pruneLoad(tree, ids)`

- **Reachability:** EXPORTED
- **Obtain via:** import { pruneLoad } from '../../src/schema/extras.js'

Remove every leaf naming a driver that is not in a set, and any group left empty.

**Parameters**

- `tree` — `object|null` — A load tree.
- `ids` — `Set<string>` — Driver ids that still exist.

**Returns**

- `object|null` — The pruned tree; an empty explicit tree stays an empty `{parallel: []}` rather than turning into the catch-all `null`.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `pruneExtras(extras, nodeIds)`

- **Reachability:** EXPORTED
- **Obtain via:** import { pruneExtras } from '../../src/schema/extras.js'

Drop what referred to nodes that no longer exist.

Wiring leaves for deleted drivers go, as do probes on deleted nodes. A
catch-all channel needs nothing: it only ever names drivers that exist.

**Parameters**

- `extras` — `object` — The editor's extra project sections.
- `nodeIds` — `string[]` — Ids of the nodes that remain.

**Returns**

- `object` — New extras.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `valueOf(v, values)`

- **Reachability:** EXPORTED
- **Obtain via:** import { valueOf } from '../../src/schema/extras.js'

The value of a field that may hold an expression.

**Parameters**

- `v` — `number|string` — A number, or an expression over the named params.
- `values` — `Object<string, number>` — Resolved named params.

**Returns**

- `number` — The number; `NaN` when the expression does not resolve.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `driveOf(wiring, params)`

- **Reachability:** EXPORTED
- **Obtain via:** import { driveOf } from '../../src/schema/extras.js'

The drive the editor shows: the first channel's output at the master level, and its output resistance.

**Parameters**

- `wiring` — `object` — The project's wiring.
- `params` — `Array<object>` — The project's named params.

**Returns**

- `{voltage: number, rg: number}` — Volts RMS and ohms; `NaN` for anything that does not resolve.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `masterForVoltage(wiring, params, volts)`

- **Reachability:** EXPORTED
- **Obtain via:** import { masterForVoltage } from '../../src/schema/extras.js'

The master level that brings the first channel to a voltage.

The master moves every channel together, so asking for a drive level in
volts keeps every channel's relative level. Zero volts is the mute floor,
−120 dB, since a file cannot hold minus infinity.

**Parameters**

- `wiring` — `object` — The project's wiring.
- `params` — `Array<object>` — The project's named params.
- `volts` — `number` — The first channel's wanted output, V RMS.

**Returns**

- `object` — New wiring with `masterDb` set; the same wiring when the first channel's own level is zero or unresolved, or the voltage is negative.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `freshId(prefix, used)`

- **Reachability:** EXPORTED
- **Obtain via:** import { freshId } from '../../src/schema/extras.js'

A fresh id not already used in a list.

**Parameters**

- `prefix` — `string` — Id prefix, e.g. `ch`, `t`, `probe`.
- `used` — `string[]` — Ids already taken.

**Returns**

- `string` — `prefix` followed by the lowest free number from 1.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

## UNREACHABLE (1)

### `pruneLoad > walk(t)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Prune one subtree.

**Parameters**

- `t` — `object` — A subtree.

**Returns**

- `object|null` — The subtree, or `null` when nothing is left of it.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.
