# Contract specification: `src/spice/run.js`

> Generated from method contracts. This file contains **no implementation code**.
> Write tests against what is claimed here, not against what you expect the code to do.

## Module

Run netlists through ngspice (WebAssembly), the same way in a browser
worker and in Node.

The engine is loaded on first use — it is several megabytes — and kept for
the life of the process. ngspice holds one circuit at a time, so runs are
queued rather than interleaved.

## EXPORTED (2)

### `isFatal(line)`

- **Reachability:** EXPORTED
- **Obtain via:** import { isFatal } from '../../src/spice/run.js'

Whether an ngspice message line means the run failed.

Notes and warnings that the engine recovered from are not failures.

**Parameters**

- `line` — `string` — One message line.

**Returns**

- `boolean` — True for an error.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `runNetlist(netlist)`

- **Reachability:** EXPORTED
- **Obtain via:** import { runNetlist } from '../../src/spice/run.js'

Run one AC netlist and return its complex vectors.

**Parameters**

- `netlist` — `string` — A complete netlist ending in `.end`.

**Returns**

- `Promise<{freqs: number[], vec: Function, names: string[]}>` — The frequencies; `vec(name)` → `{re, im}` arrays for a saved vector (lowercase name, as in `.save`); and every name returned.

**Throws**

- `Error` — When ngspice reports an error; the message lines are on `spiceErrors`.

**Side effects**

- Runs the engine; queued behind any run already in progress.

## UNREACHABLE (2)

### `engine()`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

The shared ngspice instance, started on first call.

**Returns**

- `Promise<object>` — The started `Simulation`.

**Side effects**

- Loads the WebAssembly engine the first time.

### `runNetlist > vec(name)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

One saved vector.

**Parameters**

- `name` — `string` — Lowercase vector name, e.g. `i(v3)`.

**Returns**

- `{re: Float64Array, im: Float64Array}` — Its complex values.

**Throws**

- `Error` — When the vector was not returned.

**Reads external mutable state**

- the parsed result.
