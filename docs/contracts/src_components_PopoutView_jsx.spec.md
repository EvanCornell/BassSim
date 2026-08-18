# Contract specification: `src/components/PopoutView.jsx`

> Generated from method contracts. This file contains **no implementation code**.
> Write tests against what is claimed here, not against what you expect the code to do.

## Module

The whole page when AcouSim is loaded at panel?id=…: one panel — or one
docked window's worth of them — full-window, for dragging onto a second
monitor.

No menu bar, no dock, no quick bar — those belong to the main window. State
arrives over the BroadcastChannel wired up in store.js, so the panels behave
exactly as they do when docked.

A tab strip appears only when the window holds more than one panel. It is
deliberately not a dock: tabs here cannot be dragged, split or closed,
because the arrangement lives in the main window and a second authority over
it would be a second thing to keep in step.

## EXPORTED (1)

### `PopoutView()`

- **Reachability:** EXPORTED
- **Obtain via:** import { PopoutView } from '../../src/components/PopoutView.jsx'

The whole page when panels are opened in their own browser tab.

Renders one panel full-window, or a tab strip over several when a whole
docked window was popped out. Inactive panels stay mounted — hidden rather
than unmounted — so a chart keeps its zoom when you tab away and back, which
is what the dock does too.

An unknown panel id renders an explanation rather than a blank page, since a
stale bookmark to a removed panel is the likely cause.

**Returns**

- `React.ReactElement` — The panels, or a message naming the unknown one.

**Side effects**

- Subscribes to the store, reads `window.location`, and sets `document.title` to track the project name.
