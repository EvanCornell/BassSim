# Contract specification: `src/spice/run.js`

> Generated from method contracts. This file contains **no implementation code**.
> Write tests against what is claimed here, not against what you expect the code to do.

## Module

Run netlists through ngspice (WebAssembly), the same way in a browser
worker and in Node.

The engine is loaded on first use — it is several megabytes — and kept for
the life of the process. ngspice holds one circuit at a time, so runs are
queued rather than interleaved.

Where several engines are available — a pool of browser workers, one per
processor thread — a worker coordinating a job swaps in a runner that
sends each netlist to the pool (see `setRunner`), and says how many runs
may go at once (`setThreads`). The analyses start independent runs
together and the pool spreads them; here, in one process, they queue.

## EXPORTED (7)

### `setRunner(fn)`

- **Reachability:** EXPORTED
- **Obtain via:** import { setRunner } from '../../src/spice/run.js'

Send every run through another runner, or back to this process's engine.

**Parameters**

- `fn` — `Function|null` — `(netlist, kind) → Promise<{scale, vectors}>`, as `runLocal`; `null` for the local engine.

**Returns**

- `void`

**Mutates**

- the module's runner.

### `setThreads(n)`

- **Reachability:** EXPORTED
- **Obtain via:** import { setThreads } from '../../src/spice/run.js'

Say how many runs can proceed at once.

**Parameters**

- `n` — `number` — Engines available; at least 1.

**Returns**

- `void`

**Mutates**

- the module's thread count.

### `threadCount()`

- **Reachability:** EXPORTED
- **Obtain via:** import { threadCount } from '../../src/spice/run.js'

How many runs can proceed at once — the analyses size their batches by it.

**Returns**

- `number` — At least 1.

**Reads external mutable state**

- the module's thread count.

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

### `runLocal(netlist, kind)`

- **Reachability:** EXPORTED
- **Obtain via:** import { runLocal } from '../../src/spice/run.js'

Run one netlist in this process's engine and collect its vectors, queued behind any run in progress.

**Parameters**

- `netlist` — `string` — A complete netlist ending in `.end`.
- `kind` — `'complex'|'real'` — The result type the analysis must produce: `complex` for `.ac`, `real` for `.tran`.

**Returns**

- `Promise<{scale: number[], vectors: Map<string, object>}>` — The sweep variable (frequency or time) and every other vector: `{re, im}` for complex, a Float64Array for real.

**Throws**

- `Error` — When ngspice reports an error or returns the wrong kind of result; the message lines are on `spiceErrors`.

**Side effects**

- Runs the engine. A run that throws inside the engine drops it, so the next run starts a fresh one.

### `runNetlist(netlist)`

- **Reachability:** EXPORTED
- **Obtain via:** import { runNetlist } from '../../src/spice/run.js'
- **Async:** returns a Promise

Run one AC netlist and return its complex vectors.

**Parameters**

- `netlist` — `string` — A complete netlist ending in `.end`.

**Returns**

- `Promise<{freqs: number[], vec: Function, names: string[]}>` — The frequencies; `vec(name)` → `{re, im}` arrays for a saved vector (lowercase name, as in `.save`); and every name returned.

**Throws**

- `Error` — When ngspice reports an error; the message lines are on `spiceErrors`.

**Side effects**

- Runs the engine; queued behind any run already in progress.

### `runTransient(netlist)`

- **Reachability:** EXPORTED
- **Obtain via:** import { runTransient } from '../../src/spice/run.js'
- **Async:** returns a Promise

Run one transient netlist and return its real vectors.

The netlist should set `.options interp` so the samples fall on the
`.tran` step exactly. A run started from rest (`.tran … uic`) gets its
zero sample at t = 0 put back; otherwise the time axis is whatever ngspice
produced.

**Parameters**

- `netlist` — `string` — A complete netlist ending in `.end`.

**Returns**

- `Promise<{time: number[], vec: Function, names: string[]}>` — The sample times, s; `vec(name)` → a Float64Array for a saved vector; and every name returned.

**Throws**

- `Error` — When ngspice reports an error; the message lines are on `spiceErrors`.

**Side effects**

- Runs the engine; queued behind any run already in progress.

## UNREACHABLE (3)

### `engine()`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

The shared ngspice instance, started on first call.

**Returns**

- `Promise<object>` — The started `Simulation`.

**Side effects**

- Loads the WebAssembly engine the first time.

### `runRaw(netlist, kind)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Run one netlist through the current runner.

**Parameters**

- `netlist` — `string` — A complete netlist ending in `.end`.
- `kind` — `'complex'|'real'` — The result type the analysis must produce.

**Returns**

- `Promise<{scale: number[], vectors: Map<string, object>}>` — As `runLocal`.

**Throws**

- `Error` — As `runLocal`.

**Side effects**

- Runs an engine, here or in the pool.

### `lookup(vectors)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

A lookup for one saved vector, failing loudly when it is missing.

**Parameters**

- `vectors` — `Map<string, object>` — The run's vectors.

**Returns**

- `Function` — `(name) → vector`.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.
