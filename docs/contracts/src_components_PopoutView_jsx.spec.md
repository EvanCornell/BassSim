# Contract specification: `src/components/PopoutView.jsx`

> Generated from method contracts. This file contains **no implementation code**.
> Write tests against what is claimed here, not against what you expect the code to do.

## EXPORTED (1)

### `PopoutView()`

- **Reachability:** EXPORTED
- **Obtain via:** import { PopoutView } from '../../src/components/PopoutView.jsx'

The whole page when a single panel is opened in its own browser tab.

Renders one panel full-window with no menu bar, dock or quick bar — those
belong to the main window. State arrives over the BroadcastChannel wired
up in store.js, so the panel behaves exactly as it does when docked.

An unknown panel id renders an explanation rather than a blank page,
since a stale bookmark to a removed panel is the likely cause.

**Returns**

- `React.ReactElement` — The panel, or a message naming the unknown panel.

**Side effects**

- Subscribes to the store, reads `window.location`, and sets `document.title` to track the project name.
