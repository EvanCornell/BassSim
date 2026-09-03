# Contract specification: `src/App.jsx`

> Generated from method contracts. This file contains **no implementation code**.
> Write tests against what is claimed here, not against what you expect the code to do.

## EXPORTED (1)

### `App()`

- **Reachability:** EXPORTED
- **Obtain via:** import { App } from '../../src/App.jsx'

The application root.

Routes before rendering anything: a popped-out panel is a whole-page mode
that shares none of the workspace chrome.

Two effects run once on mount. The first opens whichever workspace file was
last active, seeding a first run with the demo graph — skipped entirely in a
popped-out tab, which owns no project and would otherwise broadcast one over
whatever the main window has open. The second installs the global
key handler, which resolves every combo through `src/keymap.js` so the
menus, the rebinding UI and this handler can never disagree, and which
ignores keys while a text field has focus.

**Returns**

- `React.ReactElement` — The workspace, or a whole-page route.

**Side effects**

- Subscribes to the store, reads `window.location`, and registers a window keydown listener that is removed on unmount.

## UNREACHABLE (3)

### `SimErrorBanner()`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Report that the simulation could not be run.

An app-level banner rather than a per-chart message, because the charts
are separate panels and any of them may be closed — the user would
otherwise get no indication at all.

**Returns**

- `React.ReactElement|null` — The banner, or `null` when the last run succeeded.

**Side effects**

- Subscribes to the store.

### `ErrorBanner()`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Report graph errors that prevent the simulation from running.

**Returns**

- `React.ReactElement|null` — The banner, or `null` when the graph is valid.

**Side effects**

- Subscribes to the store.

### `App > onKey(e)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Global keydown handler: resolve the combo and run its command.

Text fields keep their own keys — including the editing shortcuts — so
typing in a parameter box never triggers a canvas command.

**Parameters**

- `e` — `KeyboardEvent` — The event.

**Returns**

- `void`

**Side effects**

- Reads current store state and runs a command, which mutates the graph or the workspace. Prevents the browser default only when a command actually matched.
