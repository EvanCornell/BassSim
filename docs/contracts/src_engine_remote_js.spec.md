# Contract specification: `src/engine/remote.js`

> Generated from method contracts. This file contains **no implementation code**.
> Write tests against what is claimed here, not against what you expect the code to do.

## Module

The coordinator's side of the simulation thread pool.

A worker that coordinates a job — the live sweep's, the time-domain
analyses' — compiles netlists and reads results, but runs none itself:
each netlist goes to the main thread, which hands it to the pool (see
`pool.js` and `poolHost.js`), and the vectors come back.

## EXPORTED (2)

### `installRemoteRunner(scope)`

- **Reachability:** EXPORTED
- **Obtain via:** import { installRemoteRunner } from '../../src/engine/remote.js'

Send this worker's runs to the pool through the main thread.

Replies arrive as `{type: 'spice-reply', rid, …}` messages; the worker's
own message handler must ignore them.

**Parameters**

- `scope` — `object` _(optional)_ — The worker's global scope.

**Returns**

- `void`

**Side effects**

- Installs a message listener and swaps the SPICE runner.

### `isPoolMessage(data)`

- **Reachability:** EXPORTED
- **Obtain via:** import { isPoolMessage } from '../../src/engine/remote.js'

Whether a message is the pool's, not a job for the worker.

**Parameters**

- `data` — `object` — A message's data.

**Returns**

- `boolean` — True for pool traffic.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.
