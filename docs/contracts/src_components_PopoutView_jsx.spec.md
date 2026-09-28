# Contract specification: `src/components/PopoutView.jsx`

> Generated from method contracts. This file contains **no implementation code**.
> Write tests against what is claimed here, not against what you expect the code to do.

## Module

The whole page when SpeakerSpice is loaded at panel?id=…: one panel — or one
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

## UNREACHABLE (1)

### `PopoutView > onContextMenu(e)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Raise the right-click menu for this tab.

A popped-out tab has no dock, so the menu it gets is its own: add a view
here beside the others, switch which is in front, send one to a further
tab, or hand them back to the main window. Panels that raise their own
menu — the node editor — consume the event before it reaches here.

**Parameters**

- `e` — `React.MouseEvent` — The contextmenu event.

**Returns**

- `void`

**Side effects**

- Opens the context menu.
