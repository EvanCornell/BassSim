# Contract specification: `src/engine/pool.js`

> Generated from method contracts. This file contains **no implementation code**.
> Write tests against what is claimed here, not against what you expect the code to do.

## Module

The simulation thread pool: one ngspice engine per processor thread.

ngspice solves one circuit at a time on one thread, so the way to use a
machine's cores is to run many circuits at once. The pool keeps a set of
engine workers (`spiceWorker.js`) as large as the machine has threads,
and the workers that coordinate a job — the live sweep's, the time-domain
analyses' — send it netlists rather than running them. It then:

- runs independent netlists side by side, one per free worker;
- splits a frequency sweep across the free workers, since every frequency
  is solved on its own (see `spice/split.js`), and joins the pieces;
- puts the live sweep ahead of time-domain work, and keeps one worker
  beyond the thread count for it, so a long distortion run never holds
  up the frequency response;
- stops a lane's runs on cancel, terminating the workers they are on.

Workers are started and warmed (their engine loaded) ahead of need, since
loading takes most of a second.

## Exported constants

Names this module publishes that are not methods. The method contracts
above and below refer to these by role — a command, a node type, a panel —
so this is the vocabulary they assume.

### `LANES`

Lanes, in priority order: the live sweep first, then time-domain work.

Values: `live`, `td`

### `RESERVE`

Workers kept beyond the thread count, for the live sweep only.

Value: `1`

## EXPORTED (2)

### `poolSize(nav)`

- **Reachability:** EXPORTED
- **Obtain via:** import { poolSize } from '../../src/engine/pool.js'

How many engines to run at once on this machine: one per processor thread.

**Parameters**

- `nav` — `object` _(optional)_ — The `navigator` to read.

**Returns**

- `number` — Logical processors reported, at least 1; 4 when unknown.

**Reads external mutable state**

- navigator.hardwareConcurrency.

### `createPool(opts)`

- **Reachability:** EXPORTED
- **Obtain via:** import { createPool } from '../../src/engine/pool.js'

Create a pool.

**Parameters**

- `opts` — `object` — Options.
- `opts.spawn` — `Function` — `() → Worker` running `spiceWorker.js` (or anything with `postMessage`, `onmessage`, `onerror` and `terminate`).
- `opts.size` — `number` — Threads to use; the time-domain lane runs at most this many at once.

**Returns**

- `{run: Function, warm: Function, cancel: Function, stats: Function, size: number}` — The pool.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

## UNREACHABLE (14)

### `cancelled()`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

The error a cancelled run rejects with.

**Returns**

- `Error` — Named `Cancelled`.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `createPool > limit(lane)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Most workers a lane may start.

**Parameters**

- `lane` — `string` — The lane.

**Returns**

- `number` — The thread count, plus the reserve for the live sweep.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `createPool > add()`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Start one worker.

**Returns**

- `object` — Its entry, idle and not yet warm.

**Mutates**

- the pool's worker list.

**Side effects**

- Spawns a worker.

### `createPool > add > ?.onmessage(e)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

A reply from the worker: warmed, or a run finished.

**Parameters**

- `e` — `MessageEvent` — `{warm: true}` or `{tid, ok, scale, vectors, error, spiceErrors}`.

**Returns**

- `void`

**Side effects**

- Settles the run's promise and hands the worker its next run.

### `createPool > add > ?.onerror()`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

The worker died: fail its run and drop it.

**Returns**

- `void`

**Side effects**

- Rejects the run and dispatches the queue to the remaining workers.

### `createPool > drop(entry)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Terminate a worker and forget it.

**Parameters**

- `entry` — `object` — Its entry.

**Returns**

- `void`

**Mutates**

- the pool's worker list.

**Side effects**

- Terminates the worker.

### `createPool > idle()`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

An idle worker, warm ones first.

**Returns**

- `object|null` — Its entry.

**Reads external mutable state**

- the pool's workers.

### `createPool > dispatch()`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Hand queued runs to free workers, live sweep first, starting workers up to each lane's limit.

**Returns**

- `void`

**Mutates**

- the queue and the workers' tasks.

**Side effects**

- Posts runs to workers; may spawn workers.

### `createPool > submit(netlist, kind, lane)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Queue one netlist.

**Parameters**

- `netlist` — `string` — The netlist.
- `kind` — `string` — `complex` or `real`.
- `lane` — `string` — `live` or `td`.

**Returns**

- `Promise<{scale: number[], vectors: Map<string, object>}>` — Its result.

**Side effects**

- Queues the run and dispatches.

### `createPool > pieces(lane)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

How many pieces to split a sweep into for a lane, now.

**Parameters**

- `lane` — `string` — The lane.

**Returns**

- `number` — For the live sweep, the warm workers free (it never waits on an engine loading); for time-domain work, the lane's free threads.

**Reads external mutable state**

- the pool's state.

### `createPool > run(netlist, kind, lane)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.
- **Async:** returns a Promise

Run one netlist, splitting a frequency sweep across the free workers.

**Parameters**

- `netlist` — `string` — A complete netlist.
- `kind` — `string` — `complex` for an AC sweep, `real` for a transient run.
- `lane` — `string` _(optional)_ — `live` or `td`.

**Returns**

- `Promise<{scale: number[], vectors: Map<string, object>}>` — The result, as one run returns it.

**Throws**

- `Error` — When SPICE fails, or the run is cancelled (named `Cancelled`).

**Side effects**

- Runs engines in the pool.

### `createPool > warm(n)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Start and warm workers up to a count, so the next runs need not wait for an engine to load.

**Parameters**

- `n` — `number` _(optional)_ — Workers wanted; at most the thread count.

**Returns**

- `void`

**Side effects**

- Spawns workers and posts them a warm-up.

### `createPool > cancel(lane)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Stop every run of a lane: queued ones are dropped, running ones' workers terminated.

**Parameters**

- `lane` — `string` — The lane.

**Returns**

- `void`

**Mutates**

- the queue and the worker list.

**Side effects**

- Rejects the lane's runs as `Cancelled` and terminates their workers; fresh ones start with the next runs.

### `createPool > stats()`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

The pool's state, for display.

**Returns**

- `{size: number, workers: number, busy: number, queued: number}` — Threads, workers started, workers running, runs waiting.

**Reads external mutable state**

- the pool's state.
