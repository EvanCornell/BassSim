# Contract specification: `src/engine/spiceWorker.js`

> Generated from method contracts. This file contains **no implementation code**.
> Write tests against what is claimed here, not against what you expect the code to do.

## Module

An engine worker in the simulation thread pool (see `pool.js`): one
ngspice instance on its own thread, running whatever netlists the pool
hands it and sending back the vectors.

## UNREACHABLE (2)

### `buffers(vectors)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Every buffer in a result, so the reply can move them rather than copy them.

**Parameters**

- `vectors` — `Map<string, object>` — The run's vectors.

**Returns**

- `ArrayBuffer[]` — Their buffers.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `self.onmessage(e)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.
- **Async:** returns a Promise

Run one netlist, or load the engine, and reply.

**Parameters**

- `e` — `MessageEvent` — `{warm: true}`, or `{tid, netlist, kind}`.

**Returns**

- `Promise<void>` — Settles once the reply is posted.

**Side effects**

- Runs the engine and posts `{warm: true}`, or `{tid, ok, scale, vectors}` / `{tid, ok: false, error, spiceErrors}`.
