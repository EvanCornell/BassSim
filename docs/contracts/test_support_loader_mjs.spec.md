# Contract specification: `test/support/loader.mjs`

> Generated from method contracts. This file contains **no implementation code**.
> Write tests against what is claimed here, not against what you expect the code to do.

## EXPORTED (2)

### `resolve(specifier, context, next)`

- **Reachability:** EXPORTED
- **Obtain via:** import { resolve } from '../../test/support/loader.mjs'
- **Async:** returns a Promise

Resolve a specifier, trying the app's implicit extensions before giving up.

**Parameters**

- `specifier` — `string` — The import specifier.
- `context` — `object` — Node's resolve context, carrying the parent URL.
- `next` — `Function` — The next resolver in the chain.

**Returns**

- `Promise<object>` — A Node resolve result.

**Side effects**

- Probes the filesystem for candidate files.

### `load(url, context, next)`

- **Reachability:** EXPORTED
- **Obtain via:** import { load } from '../../test/support/loader.mjs'
- **Async:** returns a Promise

Transform .jsx sources to plain JS on load; pass everything else through.

**Parameters**

- `url` — `string` — The resolved module URL.
- `context` — `object` — Node's load context.
- `next` — `Function` — The next loader in the chain.

**Returns**

- `Promise<object>` — A Node load result.

**Side effects**

- Reads the module from disk and runs it through esbuild.
