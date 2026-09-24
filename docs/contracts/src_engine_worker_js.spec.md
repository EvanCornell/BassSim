# Contract specification: `src/engine/worker.js`

> Generated from method contracts. This file contains **no implementation code**.
> Write tests against what is claimed here, not against what you expect the code to do.

## Module

Simulation worker: the engine's host in the browser.

Everything that turns a project into results lives in `pipeline.js`, which
the MCP server shares; this module only makes it reachable from the UI
thread without freezing the canvas during a long sweep.

A sweep is fast enough that cancellation is not worth the cost of tearing
down and respawning a worker: the store tags every request with an id and
ignores replies it no longer wants.

SPICE runs go to the page's thread pool (see `pool.js`), which splits the
sweep across whichever engine workers are free.

## UNREACHABLE (1)

### `self.onmessage(e)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.
- **Async:** returns a Promise

Handle one simulation request from the store.

A project that cannot be simulated comes back as a failed reply rather than
an exception, carrying every reason on `projectErrors`.

**Parameters**

- `e` — `MessageEvent` — The request, `{id, project, engine}`; the pool's own messages are left to its listener.

**Returns**

- `Promise<void>` — Settles once the reply is posted.

**Side effects**

- Runs the simulation and posts a reply back to the main thread.
