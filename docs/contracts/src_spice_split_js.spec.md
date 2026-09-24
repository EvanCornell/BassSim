# Contract specification: `src/spice/split.js`

> Generated from method contracts. This file contains **no implementation code**.
> Write tests against what is claimed here, not against what you expect the code to do.

## Module

Splitting one frequency sweep into several, to run side by side.

Every frequency of an AC analysis is solved on its own, so a sweep of N
points can run as k sweeps of about N/k points on k engines and be joined
back in order. Each piece repeats the circuit's setup (parsing, the
operating point) — about as long as a few dozen points — so a piece is
never made smaller than `MIN_POINTS`.

## Exported constants

Names this module publishes that are not methods. The method contracts
above and below refer to these by role — a command, a node type, a panel —
so this is the vocabulary they assume.

### `MIN_POINTS`

Fewest points one piece of a split sweep carries.

Value: `16`

## EXPORTED (4)

### `acLine(netlist)`

- **Reachability:** EXPORTED
- **Obtain via:** import { acLine } from '../../src/spice/split.js'

The AC analysis line of a netlist, parsed.

**Parameters**

- `netlist` — `string` — A netlist.

**Returns**

- `{line: string, scale: 'lin'|'dec', n: number, fstart: number, fstop: number}|null` — The line and its fields — `n` is the point count for `lin`, points per decade for `dec` — or `null` when the netlist has no `.ac lin` or `.ac dec` line.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `acCount(ac)`

- **Reachability:** EXPORTED
- **Obtain via:** import { acCount } from '../../src/spice/split.js'

How many points an AC line makes.

**Parameters**

- `ac` — `{scale: string, n: number, fstart: number, fstop: number}` — From `acLine`.

**Returns**

- `number` — The count; for `dec`, exact when the top is on the grid of steps, as `compileProject` writes it.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `splitAc(netlist, parts)`

- **Reachability:** EXPORTED
- **Obtain via:** import { splitAc } from '../../src/spice/split.js'

A netlist's sweep split into pieces, each a netlist of its own.

The pieces cover consecutive points of the original sweep, the same
frequencies in the same order. A logarithmic piece starts and stops on the
sweep's grid of steps, which is exact when the whole sweep's top is on
that grid too, as `compileProject` makes it; the last piece keeps the
original stop, so it ends where the whole sweep would.

**Parameters**

- `netlist` — `string` — A netlist with an `.ac lin` or `.ac dec` line.
- `parts` — `number` — Pieces wanted.

**Returns**

- `string[]` — The pieces — the netlist itself, alone, when it has no AC line or too few points to split.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `mergeAc(parts)`

- **Reachability:** EXPORTED
- **Obtain via:** import { mergeAc } from '../../src/spice/split.js'

Pieces of a split sweep joined back into one result.

**Parameters**

- `parts` — `Array<{scale: number[], vectors: Map<string, object>}>` — The pieces' results, in sweep order.

**Returns**

- `{scale: number[], vectors: Map<string, object>}` — One result, as a single run returns it.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

## UNREACHABLE (2)

### `num(v)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

A number written for an `.ac` line, exactly.

**Parameters**

- `v` — `number` — The value.

**Returns**

- `string` — Fifteen significant figures.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `mergeAc > join(pick)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

One vector's pieces joined end to end.

**Parameters**

- `pick` — `Function` — Piece value → the array to join.

**Returns**

- `Float64Array` — The joined array.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.
