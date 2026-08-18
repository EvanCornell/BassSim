# Contract specification: `src/engine/worker.js`

> Generated from method contracts. This file contains **no implementation code**.
> Write tests against what is claimed here, not against what you expect the code to do.

## Module

Simulation worker: the engine's host in the browser.

The solver is pure and knows nothing about where it runs, so this module is
the whole of what makes it usable from the UI thread. It replaces the
`/api/simulate` endpoint the app used to POST to; the request/response shape
is deliberately the same, minus the transport.

A sweep is fast enough that cancellation is not worth the cost of tearing
down and respawning a worker: the store tags every request with an id and
ignores replies it no longer wants. What the worker buys is that a long
sweep — a large `npts`, or the iterating large-signal path — cannot freeze
the canvas mid-drag.

## UNREACHABLE (2)

### `simulate(project)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Run one sweep and derive its metrics.

Mirrors what the former `/api/simulate` handler did, so a project that
simulated through the server simulates identically here.

**Parameters**

- `project` — `object` — A serialized project: `{nodes, edges, settings}`.

**Returns**

- `{results: object, metrics: object|null}` — The raw sweep and its derived metrics, `metrics` being `null` when the simulation failed.

**Throws**

- `Error` — When the project is structurally invalid; the error carries `projectErrors`.

**Side effects**

- Runs the solver.

### `self.onmessage(e)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Handle one simulation request from the store.

Structural errors come back as a failed reply rather than an exception, so
the caller sees a hand-edited project's problems the same way it saw the
server's 422 — as a list on `projectErrors`.

**Parameters**

- `e` — `MessageEvent` — The request, `{id, project}`.

**Returns**

- `void`

**Side effects**

- Posts a reply back to the main thread.
