# Contract specification: `mcp/test-http.mjs`

> Generated from method contracts. This file contains **no implementation code**.
> Write tests against what is claimed here, not against what you expect the code to do.

## UNREACHABLE (2)

### `check(name, cond, info)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Assert one condition and record the outcome.

**Parameters**

- `name` — `string` — Check description.
- `cond` — `any` — Truthy to pass.
- `info` — `string` _(optional, default `''`)_ — Extra detail appended to the result line.

**Returns**

- `void`

**Mutates**

- Bumps the module-level failure counter.

**Side effects**

- Prints the result line.

### `waitForHealth(tries)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.
- **Async:** returns a Promise

Poll the health endpoint until the server under test answers.

The server is spawned as a child process, so the test cannot know when it
has bound its port; polling is what makes the suite deterministic rather
than racing a fixed sleep.

**Parameters**

- `tries` — `number` _(optional, default `40`)_ — Attempts before giving up.

**Returns**

- `Promise<boolean>` — True once the server is healthy, false if it never became ready.

**Side effects**

- Issues repeated HTTP requests and waits between them.
