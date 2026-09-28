# Contract specification: `mcp/http.js`

> Generated from method contracts. This file contains **no implementation code**.
> Write tests against what is claimed here, not against what you expect the code to do.

## Module

Streamable-HTTP entry point, for remote MCP clients (claude.ai custom
connectors, ChatGPT, MCP inspector, or any HTTP MCP client).

  PORT=8787 SPEAKERSPICE_TOKEN=secret node mcp/http.js

Stateless mode: every tool takes the full project JSON, so no session
state is kept — each POST gets a fresh server+transport pair, which also
makes horizontal scaling trivial. Auth is an optional static bearer token
(SPEAKERSPICE_TOKEN); unset = open, for local/trusted networks only.

## UNREACHABLE (3)

### `send(res, code, body, headers)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Send a JSON response with the CORS headers attached.

**Parameters**

- `res` — `import('node:http').ServerResponse` — The response.
- `code` — `number` — HTTP status.
- `body` — `any` — Serializable payload.
- `headers` — `Object<string, string>` _(optional, default `{}`)_ — Extra headers, merged last so they can override.

**Returns**

- `void`

**Side effects**

- Writes the response head and ends it.

### `rpcError(code, message, id)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Build a JSON-RPC 2.0 error object.

Transport-level failures are reported in the protocol's own error shape,
so a client sees a structured error rather than an HTML error page.

**Parameters**

- `code` — `number` — JSON-RPC error code.
- `message` — `string` — Human-readable message.
- `id` — `string|number|null` _(optional, default `null`)_ — Request id being answered.

**Returns**

- `{jsonrpc: string, error: {code: number, message: string}, id: any}` — A JSON-RPC error envelope.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `readBody(req)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.
- **Async:** returns a Promise

Read and parse a JSON request body.

Capped at 4 MB and checked as it streams, so an oversized request is
rejected before it is buffered rather than after.

**Parameters**

- `req` — `import('node:http').IncomingMessage` — The request.

**Returns**

- `Promise<any|undefined>` — The parsed body, or `undefined` for an empty one.

**Throws**

- `Error` — When the body exceeds 4 MB or is not valid JSON.

**Side effects**

- Consumes the request stream.
