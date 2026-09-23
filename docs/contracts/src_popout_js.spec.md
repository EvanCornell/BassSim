# Contract specification: `src/popout.js`

> Generated from method contracts. This file contains **no implementation code**.
> Write tests against what is claimed here, not against what you expect the code to do.

## Module

Popped-out panels: any panel — or any whole docked window, tabs and all —
can be sent to its own browser tab, which the user then drags onto a second
monitor.

The tab loads the same app at panel?id=<panel> — relative to wherever the
app is served from — and renders that panel full-window. `id` may name
several panels, comma-separated, in which case the tab reproduces the docked
window it came from: the same tab strip over the same panels, with `active`
naming which one is in front.

Both windows run the same store; a BroadcastChannel keeps the
shared slice of that store identical between them, so a parameter edited in
one window redraws the chart in the other.

The main window stays the authority for two things it makes no sense to do
twice: running the simulation and writing the LocalStorage auto-save.

## Exported constants

Names this module publishes that are not methods. The method contracts
above and below refer to these by role — a command, a node type, a panel —
so this is the vocabulary they assume.

### `SYNC_CHANNEL`

BroadcastChannel name the windows use to mirror shared state.

Value: `"acousim-sync"`

### `SHARED_KEYS`

Store keys mirrored between the main window and every popped-out tab.

Anything absent from this list is local UI. The dock layout and the quick bar
stay per-window on purpose: a popped-out tab shows one panel, not a copy of
the workspace.

Values: `nodes`, `edges`, `projectName`, `settings`, `projectExtras`, `workspace`, `activeFile`, `results`, `metrics`, `selectedNodeId`, `velocityPopupNodeId`, `simError`, `xZoom`, `clipboard`, `folderStatus`, `folderName`, `folderError`, `folderSaved`

### `SIM_INPUT_KEYS`

Shared keys whose change invalidates the current result and forces a resolve.

Values: `nodes`, `edges`, `settings`, `projectExtras`

### `channel`

The shared BroadcastChannel, or `null` where the API is unavailable.

Null-checked at every use rather than polyfilled: without it the app still
works, it just cannot mirror state between windows.

## EXPORTED (5)

### `popoutPanelIds()`

- **Reachability:** EXPORTED
- **Obtain via:** import { popoutPanelIds } from '../../src/popout.js'

Every panel id this window was opened to show.

Checked against the path as well as the query string, so a stray `?id=` on
the main app cannot convince it that it is a panel window. The path is
matched by suffix because the app may be served from a subdirectory.

One id is a single popped-out panel; several are a whole docked window
reproduced in a tab. Blank entries are dropped so a trailing comma in a
hand-edited URL cannot produce a nameless panel.

**Returns**

- `string[]` — The panel ids in tab order, empty in the main window or outside a browser.

**Side effects**

- Reads `window.location`.

### `popoutPanelId()`

- **Reachability:** EXPORTED
- **Obtain via:** import { popoutPanelId } from '../../src/popout.js'

The panel this window is currently showing, if it is a popped-out tab.

For a single-panel tab this is that panel. For a whole-window tab it is
whichever panel the `active` parameter names, falling back to the first —
so the answer is always a panel the window actually holds, which is what
makes it safe to use as the initial keyboard focus.

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

The URL is relative — `panel?id=<panel>`, not `/panel?id=<panel>` — so it
resolves against wherever the app is served from rather than the domain
root.

**Parameters**

- `id` — `string` — Panel id to show.

**Returns**

- `Window|null` — The panel window, or `null` when the browser blocked it.

**Side effects**

- Opens a browser window and moves focus to it.

### `openPanelGroupWindow(ids, active)`

- **Reachability:** EXPORTED
- **Obtain via:** import { openPanelGroupWindow } from '../../src/popout.js'

Open — or focus — a browser tab showing a whole docked window's worth of panels.

The tab reproduces the group it came from: the same panels, in the same tab
order, with `active` in front.

The window name is keyed on the group's members rather than its order, so
re-popping the same set of panels focuses the tab already showing them
instead of opening a second copy of it.

**Parameters**

- `ids` — `string[]` — Panel ids in tab order. An empty list opens nothing.
- `active` — `string` _(optional)_ — Panel to show first. Defaults to the first id.

**Returns**

- `Window|null` — The panel window, or `null` when the browser blocked it or the list was empty.

**Side effects**

- Opens a browser window and moves focus to it.
