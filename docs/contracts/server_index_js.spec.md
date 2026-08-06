# Contract specification: `server/index.js`

> Generated from method contracts. This file contains **no implementation code**.
> Write tests against what is claimed here, not against what you expect the code to do.

## Module

AcouSim production server: one process serving
  /               the built web app (dist/)
  /api/simulate   the simulation engine (POST project → results + metrics)
  /mcp            the MCP endpoint for AI agents (streamable HTTP)
  /healthz        liveness probe

The engine runs ONLY here — the browser bundle contains no solver code.
  PORT=8788 ACOUSIM_TOKEN=secret node server/index.js

## UNREACHABLE (4)

### `sendJson(res, code, body)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Send a JSON response.

**Parameters**

- `res` — `import('node:http').ServerResponse` — The response.
- `code` — `number` — HTTP status.
- `body` — `any` — Serializable payload.

**Returns**

- `void`

**Side effects**

- Writes the response head and ends it.

### `readBody(req, limit)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.
- **Async:** returns a Promise

Read and parse a JSON request body.

The size limit is checked as the body streams, so an oversized request is
rejected before it is fully buffered.

**Parameters**

- `req` — `import('node:http').IncomingMessage` — The request.
- `limit` — `number` _(optional, default `4e6`)_ — Maximum body size in bytes.

**Returns**

- `Promise<object>` — The parsed body, or `{}` when it was empty.

**Throws**

- `Error` — When the body exceeds the limit or is not valid JSON.

**Side effects**

- Consumes the request stream.

### `handleSimulate(body)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Run a simulation for the `/api/simulate` endpoint.

The browser bundle contains no engine code, so every result the app shows
comes through here. Point count is capped regardless of what the request
asks for, since this endpoint is unauthenticated in the default
deployment and a large sweep is expensive.

**Parameters**

- `body` — `object` — A serialized project.

**Returns**

- `{results: object, metrics: object|null}` — The raw sweep result and its derived metrics, `metrics` being `null` when the simulation failed.

**Throws**

- `Error` — When the project is structurally invalid; the error carries `projectErrors` for the 422 response.

**Side effects**

- Runs the solver.

### `serveStatic(req, res, pathname)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Serve a built asset, falling back to the SPA entry point.

Two things matter here. The resolved path is checked to be inside `dist/`
before anything is read, so a `../` in the URL cannot escape the served
directory. And content-hashed assets get a one-year immutable cache while
everything else is `no-cache` — the hash in the filename is what makes
the long cache safe, since a changed file is a changed URL.

Any path that is not a real file falls through to `index.html`, which is
what lets client-side routes like `/panel` load on a hard refresh.

**Parameters**

- `req` — `import('node:http').IncomingMessage` — The request.
- `res` — `import('node:http').ServerResponse` — The response.
- `pathname` — `string` — Requested path.

**Returns**

- `void`

**Side effects**

- Reads from disk and streams the file to the response.
