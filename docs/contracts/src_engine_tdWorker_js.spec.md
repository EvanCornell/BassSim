# Contract specification: `src/engine/tdWorker.js`

> Generated from method contracts. This file contains **no implementation code**.
> Write tests against what is claimed here, not against what you expect the code to do.

## Module

Time-domain worker: runs the long analyses — transient runs, distortion
sweeps — away from both the UI thread and the live sweep's worker, so the
frequency response keeps updating while a distortion sweep runs.

Cancelling a job terminates this worker; the store spawns a fresh one for
the next job. That is the only way to stop ngspice mid-run.

The analyses run no SPICE here: every netlist goes to the page's thread
pool (see `pool.js`), and the analyses start as many at once as the pool
has threads, which each job message carries.

## UNREACHABLE (2)

### `self.onmessage(e)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.
- **Async:** returns a Promise

Run one time-domain job and post its progress and result.

**Parameters**

- `e` — `MessageEvent` — The request: `{id, kind, project, opts, mode, threads}` — `kind` is `linear`, `transient` or `distortion`; `mode` the distortion analysis; `threads` the pool's size. The pool's own messages are left to its listener.

**Returns**

- `Promise<void>` — Settles once the reply is posted.

**Side effects**

- Runs the engine and posts `progress` messages, then one `done` or `error` message.

### `self.onmessage > progress(fraction, message)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Report progress to the store.

**Parameters**

- `fraction` — `number` — 0–1.
- `message` — `string` — What is running.

**Returns**

- `void`

**Side effects**

- Posts a message.
