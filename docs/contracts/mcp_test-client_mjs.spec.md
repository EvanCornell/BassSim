# Contract specification: `mcp/test-client.mjs`

> Generated from method contracts. This file contains **no implementation code**.
> Write tests against what is claimed here, not against what you expect the code to do.

## Module

Smoke test: spawns the MCP server over stdio and exercises every tool.
Run: node mcp/test-client.mjs

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

### `call(name, args)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.
- **Async:** returns a Promise

Invoke one MCP tool and return both the raw result and its text payload.

**Parameters**

- `name` — `string` — Tool name.
- `args` — `object` _(optional, default `{}`)_ — Tool arguments.

**Returns**

- `Promise<{r: object, text: string}>` — The raw tool result and its first text block.

**Side effects**

- Sends a request over the MCP transport.
