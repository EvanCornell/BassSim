# Contract specification: `src/bootWorkspace.js`

> Generated from method contracts. This file contains **no implementation code**.
> Write tests against what is claimed here, not against what you expect the code to do.

## Module

The workspace as the browser last stored it, read before the app starts.

The store builds its first state synchronously when its module loads, and
IndexedDB can only be read asynchronously, so main.jsx reads it here first
and the store picks it up.

## EXPORTED (2)

### `preloadWorkspace()`

- **Reachability:** EXPORTED
- **Obtain via:** import { preloadWorkspace } from '../../src/bootWorkspace.js'
- **Async:** returns a Promise

Read the stored workspace, before the store's module is loaded.

**Returns**

- `Promise<void>` — Resolves once read, or once reading failed.

**Side effects**

- Reads IndexedDB; keeps the text for `preloadedWorkspace`.

### `preloadedWorkspace()`

- **Reachability:** EXPORTED
- **Obtain via:** import { preloadedWorkspace } from '../../src/bootWorkspace.js'

The workspace JSON read by `preloadWorkspace`.

**Returns**

- `string|null` — The text, or `null` when none was stored.

**Reads external mutable state**

- the module's preloaded text.
