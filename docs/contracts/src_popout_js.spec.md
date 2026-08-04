# Contract specification: `src/popout.js`

> Generated from method contracts. This file contains **no implementation code**.
> Write tests against what is claimed here, not against what you expect the code to do.

## Module

Popped-out panels: any panel can be sent to its own browser tab, which the
user then drags onto a second monitor.

The tab loads the same app at /panel?id=<panel> and renders that one panel
full-window. Both windows run the same store; a BroadcastChannel keeps the
shared slice of that store identical between them, so a parameter edited in
one window redraws the chart in the other.

The main window stays the authority for two things it makes no sense to do
twice: running the simulation and writing the LocalStorage auto-save.

## EXPORTED (3)

### `popoutPanelId()`

- **Reachability:** EXPORTED
- **Obtain via:** import { popoutPanelId } from '../../src/popout.js'

The panel id this window was opened to show, if it is a popped-out tab.

Checked against the path as well as the query string, so a stray `?id=` on
the main app cannot convince it that it is a panel window.

**Returns**

- `string|null` — The panel id, or `null` in the main window or outside a browser.

**Side effects**

- Reads `window.location`.

### `isPopout()`

- **Reachability:** EXPORTED
- **Obtain via:** import { isPopout } from '../../src/popout.js'

Whether this window is a popped-out panel rather than the main workspace.

Gates the two responsibilities the main window keeps to itself: running the
solver and writing the auto-save.

**Returns**

- `boolean` — True in a panel tab.

**Side effects**

- Reads `window.location` via `popoutPanelId`.

### `openPanelWindow(id)`

- **Reachability:** EXPORTED
- **Obtain via:** import { openPanelWindow } from '../../src/popout.js'

Open — or focus — the browser tab showing one panel.

The window name is keyed on the panel id, so a second click focuses the
existing tab instead of opening a duplicate.

**Parameters**

- `id` — `string` — Panel id to show.

**Returns**

- `Window|null` — The panel window, or `null` when the browser blocked it.

**Side effects**

- Opens a browser window and moves focus to it.
