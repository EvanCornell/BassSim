# Contract specification: `src/engine/poolHost.js`

> Generated from method contracts. This file contains **no implementation code**.
> Write tests against what is claimed here, not against what you expect the code to do.

## Module

The main thread's end of the simulation thread pool: one pool for the
page, and the relay that carries a coordinating worker's netlists to it
and the results back.

## EXPORTED (3)

### `getPool()`

- **Reachability:** EXPORTED
- **Obtain via:** import { getPool } from '../../src/engine/poolHost.js'

The page's pool, created on first use.

**Returns**

- `object` — The pool (see `createPool`).

**Side effects**

- Creates the pool the first time; its workers start as runs arrive or on `warm`.

### `relay(worker, data, lane)`

- **Reachability:** EXPORTED
- **Obtain via:** import { relay } from '../../src/engine/poolHost.js'

Serve a coordinating worker's run request from the pool.

**Parameters**

- `worker` — `Worker` — The coordinating worker.
- `data` — `object` — A message from it.
- `lane` — `string` — `live` or `td`.

**Returns**

- `boolean` — True when the message was a run request (and is being served); false for any other message.

**Side effects**

- Runs the netlist in the pool and posts `{type: 'spice-reply', …}` back to the worker.

### `cancelLane(lane)`

- **Reachability:** EXPORTED
- **Obtain via:** import { cancelLane } from '../../src/engine/poolHost.js'

Stop every run of a lane, if the pool has started.

**Parameters**

- `lane` — `string` — `live` or `td`.

**Returns**

- `void`

**Side effects**

- Cancels the lane's runs (see `createPool`).

## UNREACHABLE (2)

### `spawnEngine()`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Start one engine worker.

**Returns**

- `Worker` — A worker running `spiceWorker.js`.

**Side effects**

- Spawns a worker.

### `buffers(vectors)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Every buffer in a result, so the relay can move them rather than copy them.

**Parameters**

- `vectors` — `Map<string, object>` — A run's vectors.

**Returns**

- `ArrayBuffer[]` — Their buffers.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.
