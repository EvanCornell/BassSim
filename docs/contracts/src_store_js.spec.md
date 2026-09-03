# Contract specification: `src/store.js`

> Generated from method contracts. This file contains **no implementation code**.
> Write tests against what is claimed here, not against what you expect the code to do.

## Module

Application state: the project graph, the workspace, and everything the UI
reads. One Zustand store, deliberately flat.

State fields, since the action contracts below name what changes rather than
where:

  project    nodes, edges, projectName, selectedNodeId, settings
  results    results, metrics, snapshots, simError
  history    history, future, clipboard
  workspace  layout, layoutPresets, maximized, focusedPanel, draggingPanel,
             poppedOut, toolbar, bindings, xZoom
  modals     showDriverDB, showTSCalc, showSettings, settingsSection,
             workspacePrompt, velocityPopupNodeId

Fields prefixed with an underscore are solver and persistence bookkeeping
(`_lastSig`, `_simToken`, `_computeTimer`, `_flowApi`) and are not part of
any action's observable contract.

LocalStorage keys, all prefixed `acousim:` — `acousim:layout`,
`acousim:layoutPresets`, `acousim:toolbar`, `acousim:keymap`,
`acousim:workspace` and `acousim:workspaceChosen`.

A subset of the state is mirrored to popped-out panel windows over a
BroadcastChannel; see src/popout.js for which keys and why.

## Exported constants

Names this module publishes that are not methods. The method contracts
above and below refer to these by role — a command, a node type, a panel —
so this is the vocabulary they assume.

### `useStore`

### `__internals`

Keys: `loadLayout`, `loadPresets`, `loadToolbar`, `freeSpotNear`, `graphSignature`

## EXPORTED (1)

### `nextId(type)`

- **Reachability:** EXPORTED
- **Obtain via:** import { nextId } from '../../src/store.js'

Generate a unique node or edge id.

Combines the node type, the clock and a module counter, so ids stay
unique across a paste that creates several nodes in the same
millisecond, and stay readable in a saved project file.

**Parameters**

- `type` — `string` — Node type, used as the id's prefix.

**Returns**

- `string` — A new id, unique within this session.

**Side effects**

- Advances the module-level counter.

## INTERNAL (5)

### `loadLayout()`

- **Reachability:** INTERNAL
- **Obtain via:** import { __internals } from '../../src/store.js'  →  __internals.loadLayout

Load the persisted dock layout, falling back to the default.

Three things can invalidate a stored layout: a version mismatch, a panel
this build no longer has, or corrupt JSON. All three land on the default
rather than throwing. The canvas check is the last guard — a layout
without the Node Editor would leave the workspace with nothing to edit,
so it is rejected even if it is otherwise valid.

**Returns**

- `object` — A usable layout tree.

**Side effects**

- Reads LocalStorage.

### `loadPresets()`

- **Reachability:** INTERNAL
- **Obtain via:** import { __internals } from '../../src/store.js'  →  __internals.loadPresets

Load the user's saved layout arrangements.

**Returns**

- `Array<{name: string, tree: object}>` — Saved presets, or an empty list when absent or corrupt.

**Side effects**

- Reads LocalStorage.

### `loadToolbar()`

- **Reachability:** INTERNAL
- **Obtain via:** import { __internals } from '../../src/store.js'  →  __internals.loadToolbar

Load the quick-bar arrangement.

It lives in LocalStorage beside the layout rather than in `settings`
because settings travel inside a project file, and opening someone
else's design should not rearrange your toolbar.

**Returns**

- `string[]` — Quick-bar item ids, falling back to the default arrangement.

**Side effects**

- Reads LocalStorage.

### `freeSpotNear(spot, nodes, step, limit)`

- **Reachability:** INTERNAL
- **Obtain via:** import { __internals } from '../../src/store.js'  →  __internals.freeSpotNear

Find an unoccupied canvas position near a preferred spot.

Adding several elements without moving the mouse would stack them all on
one point, so this steps down-right until the spot is clear.

**Parameters**

- `spot` — `{x: number, y: number}` — Preferred position.
- `nodes` — `Array<object>` — Existing nodes, whose positions are avoided.
- `step` — `number` _(optional, default `34`)_ — Both the collision radius and the offset per attempt.
- `limit` — `number` _(optional, default `40`)_ — Maximum attempts before giving up and returning the last position tried, which may overlap.

**Returns**

- `{x: number, y: number}` — A position to place the node at.

**Postconditions (must hold on return)**

- spot and nodes are not modified

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `graphSignature(nodes, edges, settings)`

- **Reachability:** INTERNAL
- **Obtain via:** import { __internals } from '../../src/store.js'  →  __internals.graphSignature

A value that changes exactly when the simulation would produce a different result.

Used to skip redundant solves. Deliberately excludes everything the
solver ignores — node positions, selection, labels — so dragging a node
around the canvas does not re-run the sweep.

**Parameters**

- `nodes` — `Array<object>` — Graph nodes.
- `edges` — `Array<object>` — Graph edges.
- `settings` — `object` — Sweep settings.

**Returns**

- `string` — A JSON signature, compared by equality against the last solved one.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

## STORE ACTION (94)

### `openContextMenu(x, y, target)`

- **Reachability:** STORE ACTION
- **Obtain via:** import { useStore } from '../../src/store.js'  →  useStore.getState().openContextMenu(…)

Open the context menu at a point, against whatever was right-clicked.

**Parameters**

- `x` — `number` — Viewport x, where the menu's corner goes.
- `y` — `number` — Viewport y.
- `target` — `{kind: string}` — What was right-clicked: `{kind: 'pane'|'node'|'edge'|'stack'|'tab', …}` with the ids that kind needs.

**Returns**

- `void`

**Side effects**

- Writes store state. The field is local to the window — `SHARED_KEYS` deliberately excludes it, so a right-click does not open a menu in another window.

### `closeContextMenu()`

- **Reachability:** STORE ACTION
- **Obtain via:** import { useStore } from '../../src/store.js'  →  useStore.getState().closeContextMenu(…)

Dismiss the context menu.

Guarded against redundant writes: closing is attempted on every click
anywhere, and an unconditional write would re-render the workspace on each
one.

**Returns**

- `void`

**Side effects**

- Writes store state, when a menu was open.

### `setDraggingPanel(id)`

- **Reachability:** STORE ACTION
- **Obtain via:** import { useStore } from '../../src/store.js'  →  useStore.getState().setDraggingPanel(…)

Record which panel is mid tab-drag, which drives the drop targets.

**Parameters**

- `id` — `string|null` — Panel id, or `null` when the drag ends.

**Returns**

- `void`

**Side effects**

- Writes store state. The field is local to the window — `SHARED_KEYS` deliberately excludes it, so a popped-out panel keeps its own.

### `focusPanel(id)`

- **Reachability:** STORE ACTION
- **Obtain via:** import { useStore } from '../../src/store.js'  →  useStore.getState().focusPanel(…)

Give a panel keyboard focus, deciding which scoped commands fire.

Guarded against redundant writes because focus changes on every click and
an unchanged write would still broadcast.

**Parameters**

- `id` — `string` — Panel id.

**Returns**

- `void`

**Side effects**

- Writes store state. The field is local to the window — `SHARED_KEYS` deliberately excludes it, so a popped-out panel keeps its own.

### `toggleMaximize(id)`

- **Reachability:** STORE ACTION
- **Obtain via:** import { useStore } from '../../src/store.js'  →  useStore.getState().toggleMaximize(…)

Maximize a panel full-bleed, or restore it if it is already maximized.

**Parameters**

- `id` — `string|null` — Panel id to toggle.

**Returns**

- `void`

**Side effects**

- Writes store state. The field is local to the window — `SHARED_KEYS` deliberately excludes it, so a popped-out panel keeps its own.

### `setShowSettings(v, section)`

- **Reachability:** STORE ACTION
- **Obtain via:** import { useStore } from '../../src/store.js'  →  useStore.getState().setShowSettings(…)

Open or close the settings window, optionally jumping to a section.

**Parameters**

- `v` — `boolean` — Whether to show the window.
- `section` — `string` _(optional)_ — Section to select. The current section is kept when omitted.

**Returns**

- `void`

**Side effects**

- Writes store state. The field is local to the window — `SHARED_KEYS` deliberately excludes it, so a popped-out panel keeps its own.

### `setSettingsSection(id)`

- **Reachability:** STORE ACTION
- **Obtain via:** import { useStore } from '../../src/store.js'  →  useStore.getState().setSettingsSection(…)

Switch the settings window to a section.

**Parameters**

- `id` — `string` — Section id.

**Returns**

- `void`

**Side effects**

- Writes store state. The field is local to the window — `SHARED_KEYS` deliberately excludes it, so a popped-out panel keeps its own.

### `setBinding(id, combos)`

- **Reachability:** STORE ACTION
- **Obtain via:** import { useStore } from '../../src/store.js'  →  useStore.getState().setBinding(…)

Replace a command's combos wholesale.

**Parameters**

- `id` — `string` — Command id.
- `combos` — `string[]` — The command's complete new combo list.

**Returns**

- `void`

**Side effects**

- Writes store state and persists the bindings to LocalStorage.

### `assignBinding(id, combo)`

- **Reachability:** STORE ACTION
- **Obtain via:** import { useStore } from '../../src/store.js'  →  useStore.getState().assignBinding(…)

Give a command a combo, taking it from whatever held it before.

Assigning a combo steals it, the way most editors behave — silently
leaving two commands on one key is worse than a visible reassignment, and
the caller is told what it took so the UI can say so.

**Parameters**

- `id` — `string` — Command receiving the combo.
- `combo` — `string` — The combo being assigned.

**Returns**

- `string|null` — The id of the command the combo was taken from, or `null` when it was free.

**Side effects**

- Writes store state and persists the bindings to LocalStorage.

### `removeBinding(id, combo)`

- **Reachability:** STORE ACTION
- **Obtain via:** import { useStore } from '../../src/store.js'  →  useStore.getState().removeBinding(…)

Remove one combo from a command, leaving its others in place.

**Parameters**

- `id` — `string` — Command id.
- `combo` — `string` — Combo to remove.

**Returns**

- `void`

**Side effects**

- Writes store state and persists the bindings to LocalStorage.

### `resetBindings()`

- **Reachability:** STORE ACTION
- **Obtain via:** import { useStore } from '../../src/store.js'  →  useStore.getState().resetBindings(…)

Restore every command to its default combos.

**Returns**

- `void`

**Side effects**

- Writes store state and persists the bindings to LocalStorage, which removes the stored overrides entirely.

### `_commitLayout(tree)`

- **Reachability:** STORE ACTION
- **Obtain via:** import { useStore } from '../../src/store.js'  →  useStore.getState()._commitLayout(…)

Adopt a new layout tree and persist it.

The single write path for the layout, which is why every operation in
`layoutOps` routes through it. A `null` tree — the result of an edit that
would have emptied the workspace — is ignored rather than applied.

**Parameters**

- `tree` — `object|null` — The new layout tree.

**Returns**

- `void`

**Side effects**

- Writes store state and LocalStorage. A quota failure is swallowed: the layout simply will not survive a reload.

### `layoutOps > activate(stackId, panelId)`

- **Reachability:** STORE ACTION
- **Obtain via:** import { useStore } from '../../src/store.js'  →  useStore.getState().layoutOps.activate(…)

Bring a panel to the front of its stack.

**Parameters**

- `stackId` — `string` — Stack whose active tab changes.
- `panelId` — `string` — Panel to show.

**Returns**

- `void`

**Side effects**

- Writes store state and persists the layout.

### `layoutOps > dock(panelId, stackId, zone)`

- **Reachability:** STORE ACTION
- **Obtain via:** import { useStore } from '../../src/store.js'  →  useStore.getState().layoutOps.dock(…)

Move a panel onto a target stack.

**Parameters**

- `panelId` — `string` — Panel being moved.
- `stackId` — `string` — Stack to dock against.
- `zone` — `'center'|'left'|'right'|'top'|'bottom'` — Where relative to the target.

**Returns**

- `void`

**Side effects**

- Writes store state and persists the layout.

### `layoutOps > dockEdge(panelId, edge)`

- **Reachability:** STORE ACTION
- **Obtain via:** import { useStore } from '../../src/store.js'  →  useStore.getState().layoutOps.dockEdge(…)

Dock a panel against an outer edge of the workspace.

**Parameters**

- `panelId` — `string` — Panel being moved.
- `edge` — `'left'|'right'|'top'|'bottom'` — Which edge.

**Returns**

- `void`

**Side effects**

- Writes store state and persists the layout.

### `layoutOps > resize(splitId, index, a, b)`

- **Reachability:** STORE ACTION
- **Obtain via:** import { useStore } from '../../src/store.js'  →  useStore.getState().layoutOps.resize(…)

Apply a splitter drag, reweighting two adjacent children.

**Parameters**

- `splitId` — `string` — Split being resized.
- `index` — `number` — Index of the child before the splitter.
- `a` — `number` — New weight for that child.
- `b` — `number` — New weight for the next one.

**Returns**

- `void`

**Side effects**

- Writes store state and persists the layout.

### `layoutOps > dropOnTab(panelId, stackId, index)`

- **Reachability:** STORE ACTION
- **Obtain via:** import { useStore } from '../../src/store.js'  →  useStore.getState().layoutOps.dropOnTab(…)

Handle a tab dropped onto another tab.

Two different operations share one gesture: dropping within the panel's
own stack reorders it, dropping from elsewhere tabs it in. A drop on its
own current position does nothing.

**Parameters**

- `panelId` — `string` — Panel being dropped.
- `stackId` — `string` — Stack it was dropped on.
- `index` — `number` — Tab position it was dropped at.

**Returns**

- `void`

**Side effects**

- Writes store state and persists the layout.

### `layoutOps > close(panelId)`

- **Reachability:** STORE ACTION
- **Obtain via:** import { useStore } from '../../src/store.js'  →  useStore.getState().layoutOps.close(…)

Close a panel.

Panels marked `closable: false` — the canvas, which is the workspace
itself — are refused, as is a close that would empty the layout.

**Parameters**

- `panelId` — `string` — Panel to close.

**Returns**

- `void`

**Side effects**

- Writes store state and persists the layout.

### `layoutOps > open(panelId)`

- **Reachability:** STORE ACTION
- **Obtain via:** import { useStore } from '../../src/store.js'  →  useStore.getState().layoutOps.open(…)

Show a panel and give it focus, docking it if it is not already open.

Un-maximizes first, since opening a panel behind a maximized one would
otherwise appear to do nothing.

**Parameters**

- `panelId` — `string` — Panel to show.

**Returns**

- `void`

**Side effects**

- Writes store state and persists the layout.

### `layoutOps > toggle(panelId)`

- **Reachability:** STORE ACTION
- **Obtain via:** import { useStore } from '../../src/store.js'  →  useStore.getState().layoutOps.toggle(…)

Open a panel, or close it if it is already open. Drives the View menu's checkmarks.

**Parameters**

- `panelId` — `string` — Panel to toggle.

**Returns**

- `void`

**Side effects**

- Writes store state and persists the layout.

### `layoutOps > reset()`

- **Reachability:** STORE ACTION
- **Obtain via:** import { useStore } from '../../src/store.js'  →  useStore.getState().layoutOps.reset(…)

Restore the default workspace arrangement.

**Returns**

- `void`

**Side effects**

- Writes store state and persists the layout.

### `saveLayoutPreset(name)`

- **Reachability:** STORE ACTION
- **Obtain via:** import { useStore } from '../../src/store.js'  →  useStore.getState().saveLayoutPreset(…)

Save the current arrangement under a name, replacing any preset with that name.

**Parameters**

- `name` — `string` — Preset name.

**Returns**

- `void`

**Side effects**

- Writes store state and LocalStorage. A quota failure is swallowed.

### `applyLayoutPreset(name)`

- **Reachability:** STORE ACTION
- **Obtain via:** import { useStore } from '../../src/store.js'  →  useStore.getState().applyLayoutPreset(…)

Apply a saved arrangement.

The preset is sanitized before use — it may name panels a later build
dropped — and the canvas is docked back in if sanitizing removed it, so a
stale preset can never leave the workspace without its editor.

**Parameters**

- `name` — `string` — Preset name. An unknown name is ignored.

**Returns**

- `void`

**Side effects**

- Writes store state and persists the layout.

### `setToolbar(ids)`

- **Reachability:** STORE ACTION
- **Obtain via:** import { useStore } from '../../src/store.js'  →  useStore.getState().setToolbar(…)

Replace the quick-bar arrangement.

Sanitized on the way in, so an arrangement carrying unknown ids falls
back to the default rather than rendering a broken bar. Unknown ids are
dropped individually; the fallback fires only when nothing survives, since
a non-empty request sanitizing to nothing means the whole arrangement was
foreign. An explicitly empty `ids` is honoured — that is a deliberately
hidden bar, not corruption.

**Parameters**

- `ids` — `string[]` — Item ids in display order. A non-array falls back to the default.

**Returns**

- `void`

**Side effects**

- Writes store state and LocalStorage. A quota failure is swallowed.

### `toggleToolbarItem(id)`

- **Reachability:** STORE ACTION
- **Obtain via:** import { useStore } from '../../src/store.js'  →  useStore.getState().toggleToolbarItem(…)

Add an item to the quick bar, or remove it if it is already there.

Newly added items go to the end rather than their registry position, so
toggling one on does not reshuffle the bar.

**Parameters**

- `id` — `string` — Quick-bar item id.

**Returns**

- `void`

**Side effects**

- Writes store state and persists the toolbar.

### `moveToolbarItem(id, delta)`

- **Reachability:** STORE ACTION
- **Obtain via:** import { useStore } from '../../src/store.js'  →  useStore.getState().moveToolbarItem(…)

Move an item along the quick bar by swapping it with its neighbour.

**Parameters**

- `id` — `string` — Item to move.
- `delta` — `number` — Positions to move by; -1 is left, 1 is right.

**Returns**

- `void`

**Side effects**

- Writes store state and persists the toolbar. Does nothing when the item is absent or the move would run off either end.

### `resetToolbar()`

- **Reachability:** STORE ACTION
- **Obtain via:** import { useStore } from '../../src/store.js'  →  useStore.getState().resetToolbar(…)

Restore the default quick-bar arrangement.

**Returns**

- `void`

**Side effects**

- Writes store state and persists the toolbar, since it delegates to `setToolbar`. The toolbar is local to the window; `SHARED_KEYS` excludes it.

### `deleteLayoutPreset(name)`

- **Reachability:** STORE ACTION
- **Obtain via:** import { useStore } from '../../src/store.js'  →  useStore.getState().deleteLayoutPreset(…)

Delete a saved arrangement.

**Parameters**

- `name` — `string` — Preset name.

**Returns**

- `void`

**Side effects**

- Writes store state and LocalStorage.

### `setXZoom(id, range)`

- **Reachability:** STORE ACTION
- **Obtain via:** import { useStore } from '../../src/store.js'  →  useStore.getState().setXZoom(…)

Store one chart's X-axis zoom range, set by drag-selecting on the plot.

Not persisted: zoom is a transient view of the current result.

**Parameters**

- `id` — `string` — Chart panel id.
- `range` — `[number, number]|null` — Frequency range, or `null` to reset.

**Returns**

- `void`

**Side effects**

- Writes store state, mirrored to other windows.

### `pushHistory()`

- **Reachability:** STORE ACTION
- **Obtain via:** import { useStore } from '../../src/store.js'  →  useStore.getState().pushHistory(…)

Record the current graph as an undo point.

Called before a mutation rather than after, so the entry is the state to
return *to*. Deep-copies nodes and edges, since undo must not hand back
objects a later edit has since mutated. Pushing clears the redo stack,
which is the standard linear-history behaviour.

**Returns**

- `void`

**Side effects**

- Writes store state. The history is capped at 80 entries, oldest discarded.

### `undo()`

- **Reachability:** STORE ACTION
- **Obtain via:** import { useStore } from '../../src/store.js'  →  useStore.getState().undo(…)

Step back one entry in the history.

**Returns**

- `void`

**Side effects**

- Writes store state and schedules a resimulation. Does nothing when the history is empty.

### `redo()`

- **Reachability:** STORE ACTION
- **Obtain via:** import { useStore } from '../../src/store.js'  →  useStore.getState().redo(…)

Step forward one entry in the history.

**Returns**

- `void`

**Side effects**

- Writes store state and schedules a resimulation. Does nothing when the redo stack is empty.

### `onNodesChange(changes)`

- **Reachability:** STORE ACTION
- **Obtain via:** import { useStore } from '../../src/store.js'  →  useStore.getState().onNodesChange(…)

Apply React Flow's node changes — drags, selections, removals.

Only removals schedule a resimulation: moving or selecting a node cannot
change the result, and re-solving on every frame of a drag would be
wasteful. Note that this does not push history, because it fires
continuously during a drag.

**Parameters**

- `changes` — `Array<object>` — React Flow change descriptors.

**Returns**

- `void`

**Side effects**

- Writes store state, and schedules a resimulation when a node was removed.

### `onEdgesChange(changes)`

- **Reachability:** STORE ACTION
- **Obtain via:** import { useStore } from '../../src/store.js'  →  useStore.getState().onEdgesChange(…)

Apply React Flow's edge changes.

Removals push history and schedule a resimulation, since deleting an edge
changes the topology.

**Parameters**

- `changes` — `Array<object>` — React Flow change descriptors.

**Returns**

- `void`

**Side effects**

- Writes store state, and on removal records history and schedules a resimulation.

### `onConnect(conn)`

- **Reachability:** STORE ACTION
- **Obtain via:** import { useStore } from '../../src/store.js'  →  useStore.getState().onConnect(…)

Add an edge from a completed port-to-port drag.

**Parameters**

- `conn` — `object` — React Flow connection: source, sourceHandle, target, targetHandle.

**Returns**

- `void`

**Side effects**

- Records history, writes store state and schedules a resimulation.

### `setSelected(id)`

- **Reachability:** STORE ACTION
- **Obtain via:** import { useStore } from '../../src/store.js'  →  useStore.getState().setSelected(…)

Select a node, which drives what the Parameters panel edits.

**Parameters**

- `id` — `string|null` — Node id, or `null` to clear.

**Returns**

- `void`

**Side effects**

- Writes store state, mirrored to other windows.

### `addNode(type, position)`

- **Reachability:** STORE ACTION
- **Obtain via:** import { useStore } from '../../src/store.js'  →  useStore.getState().addNode(…)

Add a node of the given type at a canvas position.

The new node arrives selected — and alone in the selection — so it can be
copied, nudged or deleted straight away without clicking it first.

**Parameters**

- `type` — `string` — Node type; its entry in `DEFAULT_PARAMS` supplies the initial params.
- `position` — `{x: number, y: number}` — Canvas position.

**Returns**

- `string` — The new node's id, so callers can immediately update its params.

**Side effects**

- Records history, writes store state and schedules a resimulation.

### `updateParams(id, patch)`

- **Reachability:** STORE ACTION
- **Obtain via:** import { useStore } from '../../src/store.js'  →  useStore.getState().updateParams(…)

Merge a patch into one node's parameters.

**Parameters**

- `id` — `string` — Node id. An unknown id is a no-op.
- `patch` — `object` — Parameters to merge over the node's existing ones.

**Returns**

- `void`

**Side effects**

- Writes store state and schedules a resimulation.

### `deleteSelected()`

- **Reachability:** STORE ACTION
- **Obtain via:** import { useStore } from '../../src/store.js'  →  useStore.getState().deleteSelected(…)

Delete the selected nodes and edges.

Edges attached to a deleted node go with it, whether or not they were
themselves selected — leaving a dangling edge would corrupt the graph.

**Returns**

- `void`

**Side effects**

- Records history, writes store state and schedules a resimulation. Does nothing when the selection is empty.

### `duplicateSelected()`

- **Reachability:** STORE ACTION
- **Obtain via:** import { useStore } from '../../src/store.js'  →  useStore.getState().duplicateSelected(…)

Copy the selected nodes in place, offset down-right.

Deep-copies each node's params so the duplicate is independent, and moves
the selection to the copies — matching the usual expectation that what
you just created is what you are now holding. Edges are not duplicated;
`copySelection` and `pasteClipboard` are the path that preserves them.

**Returns**

- `void`

**Side effects**

- Records history, writes store state and schedules a resimulation. Does nothing when the selection is empty.

### `selectAll()`

- **Reachability:** STORE ACTION
- **Obtain via:** import { useStore } from '../../src/store.js'  →  useStore.getState().selectAll(…)

Select every node on the canvas.

**Returns**

- `void`

**Side effects**

- Writes store state, mirrored to other windows.

### `setSelection(ids, additive)`

- **Reachability:** STORE ACTION
- **Obtain via:** import { useStore } from '../../src/store.js'  →  useStore.getState().setSelection(…)

Replace — or extend — the node selection.

The write path for the right-drag marquee. `selectedNodeId`, which is what
the Parameters panel edits, follows the last node in the new selection, so
lassoing a group leaves something concrete to edit rather than an empty
panel. An empty selection clears it.

**Parameters**

- `ids` — `string[]` — Node ids to select.
- `additive` — `boolean` _(optional, default `false`)_ — Keep the existing selection and add to it, which is what a modifier-held lasso means.

**Returns**

- `void`

**Side effects**

- Writes store state, mirrored to other windows. Does not record history — selection is not an edit.

### `copySelection()`

- **Reachability:** STORE ACTION
- **Obtain via:** import { useStore } from '../../src/store.js'  →  useStore.getState().copySelection(…)

Copy the selected nodes and their internal edges to the in-app clipboard.

An in-app clipboard rather than the system one: the graph is a structure,
not text, and reading the system clipboard needs a permission prompt on
every paste. It rides the sync channel, so you can copy in the main
window and paste into a popped-out Node Editor.

Only edges wholly inside the selection are taken — a dangling half-edge
would have nothing to reconnect to on paste.

An empty selection leaves the previous clipboard in place rather than
clearing it, so a stray copy with nothing selected cannot lose what you
copied a moment ago. There is no action that empties the clipboard.

**Returns**

- `number` — How many nodes were copied; 0 when the selection was empty.

**Side effects**

- Writes store state, mirrored to other windows.

### `cutSelection()`

- **Reachability:** STORE ACTION
- **Obtain via:** import { useStore } from '../../src/store.js'  →  useStore.getState().cutSelection(…)

Copy the selection, then delete it.

Deletes only if the copy found something, so an empty selection cannot
delete anything.

**Returns**

- `void`

**Side effects**

- Records history, writes store state and schedules a resimulation.

### `pasteClipboard(at)`

- **Reachability:** STORE ACTION
- **Obtain via:** import { useStore } from '../../src/store.js'  →  useStore.getState().pasteClipboard(…)

Paste the clipboard as new nodes, at a point or offset down-right.

Every pasted node gets a fresh id, and the copied edges are rewired
through a remap table so they connect the copies rather than the
originals. Params are merged over the current defaults, so pasting into a
newer build fills in any parameter added since the copy was made.

With a position — what the canvas's right-click Paste supplies — the whole
copied group is translated so its top-left corner lands there, preserving
the relative arrangement. Without one it lands offset from the original,
which is what a keyboard paste has always done.

**Parameters**

- `at` — `{x: number, y: number}` _(optional)_ — Canvas position for the group's top-left corner.

**Returns**

- `void`

**Side effects**

- Records history, writes store state and schedules a resimulation. Does nothing when the clipboard is empty.

### `addNodeAtCursor(type)`

- **Reachability:** STORE ACTION
- **Obtain via:** import { useStore } from '../../src/store.js'  →  useStore.getState().addNodeAtCursor(…)

Add a node under the pointer, or at a default spot when it is off-canvas.

The canvas registers `_flowApi` so a keyboard-added node lands where the
user is looking rather than at a fixed position. Overlapping nodes are
stepped down-right by `freeSpotNear`.

**Parameters**

- `type` — `string` — Node type to add.

**Returns**

- `string` — The new node's id.

**Side effects**

- Reads the live React Flow viewport, records history, writes store state and schedules a resimulation.

### `nudgeVoltage(delta)`

- **Reachability:** STORE ACTION
- **Obtain via:** import { useStore } from '../../src/store.js'  →  useStore.getState().nudgeVoltage(…)

Change the drive voltage by a fixed step, for the keyboard shortcuts.

Clamped at zero and rounded to two decimals so repeated nudges do not
accumulate floating-point drift into the displayed value.

**Parameters**

- `delta` — `number` — Change in volts; negative lowers.

**Returns**

- `void`

**Side effects**

- Writes store state and schedules a resimulation.

### `recomputeNow()`

- **Reachability:** STORE ACTION
- **Obtain via:** import { useStore } from '../../src/store.js'  →  useStore.getState().recomputeNow(…)

Force a resimulation even though nothing has changed.

Clears the cached graph signature, which is what normally suppresses a
redundant solve.

**Returns**

- `void`

**Side effects**

- Writes store state and schedules a resimulation.

### `updateSettings(patch)`

- **Reachability:** STORE ACTION
- **Obtain via:** import { useStore } from '../../src/store.js'  →  useStore.getState().updateSettings(…)

Merge a patch into the sweep settings.

**Parameters**

- `patch` — `object` — Settings to merge.

**Returns**

- `void`

**Side effects**

- Writes store state and schedules a resimulation.

### `setAmp(field, value)`

- **Reachability:** STORE ACTION
- **Obtain via:** import { useStore } from '../../src/store.js'  →  useStore.getState().setAmp(…)

Set one amplifier field and re-derive the others from P = V²/Z.

Voltage, impedance and power are three views of one setting, so editing
any one has to update the rest. Which field was edited decides what is
derived: it is the field the user typed in that stays exactly as typed.

**Parameters**

- `field` — `'voltage'|'impedance'|'power'` — The field that was edited.
- `value` — `number` — Its new value.

**Returns**

- `void`

**Side effects**

- Writes store state and schedules a resimulation.

### `takeSnapshot()`

- **Reachability:** STORE ACTION
- **Obtain via:** import { useStore } from '../../src/store.js'  →  useStore.getState().takeSnapshot(…)

Freeze the current result as a labelled reference overlay.

Capped at three, which is as many as the charts can overlay legibly, and
each gets a fixed colour by position so overlays stay visually stable.
Only the plotted series are kept, not the whole result.

**Returns**

- `void`

**Side effects**

- Writes store state. Does nothing without a successful result, or once three snapshots exist.

### `removeSnapshot(id)`

- **Reachability:** STORE ACTION
- **Obtain via:** import { useStore } from '../../src/store.js'  →  useStore.getState().removeSnapshot(…)

Discard a reference overlay.

**Parameters**

- `id` — `number` — Snapshot id.

**Returns**

- `void`

**Side effects**

- Writes store state, mirrored to other windows.

### `renameSnapshot(id, label)`

- **Reachability:** STORE ACTION
- **Obtain via:** import { useStore } from '../../src/store.js'  →  useStore.getState().renameSnapshot(…)

Relabel a reference overlay.

**Parameters**

- `id` — `number` — Snapshot id.
- `label` — `string` — New label.

**Returns**

- `void`

**Side effects**

- Writes store state, mirrored to other windows.

### `setVelocityPopup(id)`

- **Reachability:** STORE ACTION
- **Obtain via:** import { useStore } from '../../src/store.js'  →  useStore.getState().setVelocityPopup(…)

Open or close the port-velocity popup for a waveguide node.

**Parameters**

- `id` — `string|null` — Waveguide node id, or `null` to close.

**Returns**

- `void`

**Side effects**

- Writes store state, mirrored to other windows.

### `setShowDriverDB(v)`

- **Reachability:** STORE ACTION
- **Obtain via:** import { useStore } from '../../src/store.js'  →  useStore.getState().setShowDriverDB(…)

Show or hide the driver database modal.

**Parameters**

- `v` — `boolean` — Whether to show it.

**Returns**

- `void`

**Side effects**

- Writes store state. The field is local to the window — `SHARED_KEYS` deliberately excludes it, so a popped-out panel keeps its own.

### `setShowTSCalc(v)`

- **Reachability:** STORE ACTION
- **Obtain via:** import { useStore } from '../../src/store.js'  →  useStore.getState().setShowTSCalc(…)

Show or hide the Thiele/Small parameter solver.

**Parameters**

- `v` — `boolean` — Whether to show it.

**Returns**

- `void`

**Side effects**

- Writes store state. The field is local to the window — `SHARED_KEYS` deliberately excludes it, so a popped-out panel keeps its own.

### `scheduleCompute()`

- **Reachability:** STORE ACTION
- **Obtain via:** import { useStore } from '../../src/store.js'  →  useStore.getState().scheduleCompute(…)

Schedule a debounced simulation run.

Simulation runs in a Web Worker — see `src/engine/worker.js` — so the
canvas stays responsive through a large sweep, and three mechanisms keep
the pipeline from thrashing. The 150 ms debounce collapses slider drags
into one run. The graph signature skips the run when nothing that affects
the result changed. A token marks the newest request, and the reply is
checked against it before being applied, so a slow reply cannot overwrite
a newer result.

A superseded run is left to finish rather than cancelled. Tearing down and
respawning a worker costs more than the sweep it would save, and the reply
is discarded either way.

A popped-out tab returns immediately: results arrive from the main window
over the sync channel, and a second sweep would duplicate the work.

**Returns**

- `void`

**Side effects**

- Sets a timer, posts to the simulation worker, writes store state, and on success triggers an auto-save. A structurally invalid project is recorded in `simError` and retried on the next edit rather than thrown.

### `serialize()`

- **Reachability:** STORE ACTION
- **Obtain via:** import { useStore } from '../../src/store.js'  →  useStore.getState().serialize(…)

Capture the project as a plain, saveable object.

The `.acousim.json` format, shared with the MCP server and the file
export. Node positions are included — they are editor state, but losing
the layout of a saved graph would be worse than carrying it.

**Returns**

- `object` — The serialized project: `{schemaVersion, app, name, modified, settings, nodes, edges}`.

**Side effects**

- Reads the current time for the `modified` stamp.

### `loadSerialized(proj)`

- **Reachability:** STORE ACTION
- **Obtain via:** import { useStore } from '../../src/store.js'  →  useStore.getState().loadSerialized(…)

Replace the current project with a deserialized one.

Params are merged over the current defaults, so a project saved by an
older build gains any parameter added since. Edges missing an id get one,
which hand-written and MCP-generated projects routinely need.

History, redo, snapshots and selection are all cleared: they describe the
project being replaced and would be meaningless against the new one.

**Parameters**

- `proj` — `object` — A serialized project.

**Returns**

- `void`

**Side effects**

- Replaces store state and schedules a resimulation.

### `saveProjectJSON()`

- **Reachability:** STORE ACTION
- **Obtain via:** import { useStore } from '../../src/store.js'  →  useStore.getState().saveProjectJSON(…)

Download the open project as a standalone JSON file.

An export, not a save: the project already lives in the workspace, and
this is for handing one design to someone who is not going to import a
whole workspace to read it.

**Returns**

- `void`

**Side effects**

- Writes the open file into the workspace, then triggers a browser download.

### `importProject(proj, filename)`

- **Reachability:** STORE ACTION
- **Obtain via:** import { useStore } from '../../src/store.js'  →  useStore.getState().importProject(…)

Import a project file into the workspace as a new file, and open it.

Imported *into* the workspace rather than onto the canvas. A project on
the canvas that belongs to no file would be the one thing that can be
edited and then lost, which is the whole reason the workspace exists.

**Parameters**

- `proj` — `object` — A deserialized project.
- `filename` — `string` — The file it came from, used to name the entry.

**Returns**

- `string` — The path of the new workspace file.

**Side effects**

- Writes store state, persists the workspace and replaces what is on the canvas.

### `_commitWorkspace(ws)`

- **Reachability:** STORE ACTION
- **Obtain via:** import { useStore } from '../../src/store.js'  →  useStore.getState()._commitWorkspace(…)

Store a modified workspace.

**Parameters**

- `ws` — `object` — The new workspace.

**Returns**

- `void`

**Side effects**

- Writes store state, which the module-level subscription then persists to LocalStorage.

### `setWorkspaceName(name)`

- **Reachability:** STORE ACTION
- **Obtain via:** import { useStore } from '../../src/store.js'  →  useStore.getState().setWorkspaceName(…)

Rename the workspace itself.


Stored exactly as typed, including a momentarily empty one — rejecting
blanks here would make the field impossible to clear and retype. A blank
name falls back to the default when the workspace is downloaded or read
back, which is the only point where the name has to mean something.

**Parameters**

- `name` — `string` — The new name.

**Returns**

- `void`

**Side effects**

- Writes store state and persists the workspace.

### `saveActiveFile()`

- **Reachability:** STORE ACTION
- **Obtain via:** import { useStore } from '../../src/store.js'  →  useStore.getState().saveActiveFile(…)

Write the editor's current project back into its file.

Called after every successful simulation, so the open file tracks the
graph without the user having to save anything. A workspace whose active file has been deleted or
was never a project writes nothing rather than resurrecting it.

**Returns**

- `void`

**Side effects**

- Writes store state and persists the workspace. Skipped in a popped-out tab, which has no editor of its own to save.

### `openFile(path)`

- **Reachability:** STORE ACTION
- **Obtain via:** import { useStore } from '../../src/store.js'  →  useStore.getState().openFile(…)

Open a project file in the editor.

The file on the way out is saved first, so switching files never loses the
edits made to the one being left. Non-project files are not openable — a
driver library has no graph to put on the canvas — and are ignored.

**Parameters**

- `path` — `string` — Path of the file to open.

**Returns**

- `void`

**Side effects**

- Writes store state, persists the workspace and schedules a resimulation.

### `newFile(folder)`

- **Reachability:** STORE ACTION
- **Obtain via:** import { useStore } from '../../src/store.js'  →  useStore.getState().newFile(…)

Create an empty project file.

**Parameters**

- `folder` — `string` _(optional)_ — Folder to create it in; the workspace root by default.

**Returns**

- `string` — The path of the new file.

**Side effects**

- Writes store state, persists the workspace and opens the new file, replacing what is on the canvas.

### `newFolder(parent)`

- **Reachability:** STORE ACTION
- **Obtain via:** import { useStore } from '../../src/store.js'  →  useStore.getState().newFolder(…)

Create an empty folder.

**Parameters**

- `parent` — `string` _(optional)_ — Folder to create it in; the workspace root by default.

**Returns**

- `string` — The path of the new folder.

**Side effects**

- Writes store state and persists the workspace.

### `renamePath(from, to)`

- **Reachability:** STORE ACTION
- **Obtain via:** import { useStore } from '../../src/store.js'  →  useStore.getState().renamePath(…)

Rename or move a file or folder.

Renaming a project file renames the project inside it too. The alternative
— a file called `Ported box` holding a project called `Untitled` — reads as
a bug every time a user meets it.

The system folder is not renamable: the app looks for its contents by
path, and a moved `.acousim` would silently become a folder of orphaned
data plus a fresh empty one.

**Parameters**

- `from` — `string` — The existing path.
- `to` — `string` — The new path.

**Returns**

- `boolean` — True when the move happened; false when the name is invalid, taken, or forbidden.

**Side effects**

- Writes store state and persists the workspace. Follows the active file if it was the one moved.

### `deletePath(path)`

- **Reachability:** STORE ACTION
- **Obtain via:** import { useStore } from '../../src/store.js'  →  useStore.getState().deletePath(…)

Delete a file, or a folder and everything in it.

Deleting the open project leaves the editor on whatever project remains,
or on an empty canvas when none does — better than holding a file that no
longer exists and writing it back on the next auto-save.

The confirmation belongs to the caller. This is the operation, not the
question.

**Parameters**

- `path` — `string` — Path of the entry to delete.

**Returns**

- `void`

**Side effects**

- Writes store state and persists the workspace. May replace what is on the canvas.

### `downloadWorkspace()`

- **Reachability:** STORE ACTION
- **Obtain via:** import { useStore } from '../../src/store.js'  →  useStore.getState().downloadWorkspace(…)
- **Async:** returns a Promise

Download the whole workspace, and record that it happened.

The stamp is the point as much as the file is: browser storage can be
cleared without warning, so the file browser shows how long it has been
since a copy existed anywhere else.

**Returns**

- `Promise<void>` — Resolves once the archive has been handed to the browser.

**Side effects**

- Saves the open file, builds and downloads an archive, then writes store state and persists the workspace.

### `importWorkspaceFile(file)`

- **Reachability:** STORE ACTION
- **Obtain via:** import { useStore } from '../../src/store.js'  →  useStore.getState().importWorkspaceFile(…)
- **Async:** returns a Promise

Replace the workspace with an imported one.

Wholesale replacement rather than a merge. Merging two workspaces raises a
question per colliding path that the user has no way to answer usefully in
a dialog, and the honest workflow — download the current workspace first —
is one click away.

The imported workspace is stored exactly as it arrived. If it has no
system folder, it does not gain one here; the first write of app data
creates it.

Both shapes a workspace can arrive in are accepted: the archive of folders
and files this build downloads, and the single JSON document an earlier
one did. Deciding by signature rather than by file extension, since the
picker hands over whatever the user chose and the extension is the least
reliable thing about it.

**Parameters**

- `file` — `File` — The chosen file.

**Returns**

- `Promise<{ok: boolean, error?: string, skipped?: string[]}>` — Whether the import succeeded, which files were unreadable, and why it failed when it did.

**Side effects**

- Reads the file. On success, writes store state, persists the workspace and replaces what is on the canvas.

### `_adoptWorkspace(ws)`

- **Reachability:** STORE ACTION
- **Obtain via:** import { useStore } from '../../src/store.js'  →  useStore.getState()._adoptWorkspace(…)

Make an imported workspace the current one and open something from it.

**Parameters**

- `ws` — `object` — The workspace to adopt.

**Returns**

- `{ok: boolean}` — Always a success; the caller has already validated.

**Side effects**

- Writes store state, persists the workspace and replaces what is on the canvas.

### `setWsSelection(paths)`

- **Reachability:** STORE ACTION
- **Obtain via:** import { useStore } from '../../src/store.js'  →  useStore.getState().setWsSelection(…)

Replace the explorer's selection.

**Parameters**

- `paths` — `string[]` — The paths now selected, in the order they were added.

**Returns**

- `void`

**Side effects**

- Writes store state.

### `toggleWsFolder(path, open)`

- **Reachability:** STORE ACTION
- **Obtain via:** import { useStore } from '../../src/store.js'  →  useStore.getState().toggleWsFolder(…)

Expand or collapse a folder in the explorer.

**Parameters**

- `path` — `string` — The folder's path.
- `open` — `boolean` _(optional)_ — Force a state; omitted, the folder toggles.

**Returns**

- `void`

**Side effects**

- Writes store state.

### `collapseAllWsFolders()`

- **Reachability:** STORE ACTION
- **Obtain via:** import { useStore } from '../../src/store.js'  →  useStore.getState().collapseAllWsFolders(…)

Collapse every folder in the explorer.

**Returns**

- `void`

**Side effects**

- Writes store state.

### `beginWsEdit(mode, path)`

- **Reachability:** STORE ACTION
- **Obtain via:** import { useStore } from '../../src/store.js'  →  useStore.getState().beginWsEdit(…)

Start an inline edit in the explorer.

The tree draws the text box; this only records that one is wanted, which
is what lets the right-click menu — a component that contains no tree —
start a rename. A folder gaining a new child is expanded first, so the row
being typed into is actually on screen.

**Parameters**

- `mode` — `string` — `'rename'`, `'newFile'` or `'newFolder'`.
- `path` — `string` — The entry being renamed, or the folder gaining a child; the empty string means the root.

**Returns**

- `void`

**Side effects**

- Writes store state.

### `endWsEdit()`

- **Reachability:** STORE ACTION
- **Obtain via:** import { useStore } from '../../src/store.js'  →  useStore.getState().endWsEdit(…)

Dismiss the explorer's inline editor.

**Returns**

- `void`

**Side effects**

- Writes store state.

### `setFileClipboard(paths, cut)`

- **Reachability:** STORE ACTION
- **Obtain via:** import { useStore } from '../../src/store.js'  →  useStore.getState().setFileClipboard(…)

Put explorer entries on the file clipboard.

A cut is recorded rather than performed: nothing moves until the paste, so
a cut the user abandons costs them nothing. This mirrors every file
manager and is the opposite of the node clipboard, where cutting removes
the nodes immediately because the graph shows the result either way.

**Parameters**

- `paths` — `string[]` — Paths to hold.
- `cut` — `boolean` — True for a cut, false for a copy.

**Returns**

- `void`

**Side effects**

- Writes store state.

### `pasteFiles(folder)`

- **Reachability:** STORE ACTION
- **Obtain via:** import { useStore } from '../../src/store.js'  →  useStore.getState().pasteFiles(…)

Paste the file clipboard into a folder.

A cut becomes a move and empties the clipboard, since the entry cannot be
moved to a second place. A copy leaves the clipboard loaded, so the same
thing can be pasted into several folders.

**Parameters**

- `folder` — `string` — Destination folder; the empty string means the root.

**Returns**

- `void`

**Side effects**

- Writes store state and persists the workspace. Follows the active file when a cut moves it.

### `duplicateFile(path)`

- **Reachability:** STORE ACTION
- **Obtain via:** import { useStore } from '../../src/store.js'  →  useStore.getState().duplicateFile(…)

Copy an entry alongside itself.

**Parameters**

- `path` — `string` — Path of the entry to duplicate.

**Returns**

- `void`

**Side effects**

- Writes store state and persists the workspace.

### `moveFile(from, folder)`

- **Reachability:** STORE ACTION
- **Obtain via:** import { useStore } from '../../src/store.js'  →  useStore.getState().moveFile(…)

Move an entry into a folder, keeping its name.

The drag-and-drop half of the explorer. A move onto the folder an entry is
already in, or into itself, is silently nothing rather than an error — a
drag that lands where it started is a cancelled drag.

**Parameters**

- `from` — `string` — Path of the entry to move.
- `folder` — `string` — Destination folder; the empty string means the root.

**Returns**

- `void`

**Side effects**

- Writes store state and persists the workspace. Follows the active file if it was the one moved.

### `createWsEntry(mode, parent, name)`

- **Reachability:** STORE ACTION
- **Obtain via:** import { useStore } from '../../src/store.js'  →  useStore.getState().createWsEntry(…)

Create a file or folder under a chosen name.

The counterpart to `beginWsEdit`: the tree collects the name, this makes
the entry. A blank or already-taken name is refused rather than silently
adjusted, because the user is looking at the text box and can fix it.

**Parameters**

- `mode` — `string` — `'newFile'` or `'newFolder'`.
- `parent` — `string` — Folder to create it in; the empty string means the root.
- `name` — `string` — The name typed by the user.

**Returns**

- `{ok: boolean, error?: string}` — Whether it was created, and why not when it was not.

**Side effects**

- On success, writes store state, persists the workspace, and for a file opens it on the canvas.

### `chooseWorkspaceStorage(kind)`

- **Reachability:** STORE ACTION
- **Obtain via:** import { useStore } from '../../src/store.js'  →  useStore.getState().chooseWorkspaceStorage(…)

Record where this workspace is kept, and dismiss the startup prompt.

Only browser storage exists today, so the choice is nearly rhetorical —
but it is asked out loud because browser storage is the one option whose
durability the user needs to have been told about before they have work in
it. The answer is remembered so the question is asked once, not on every
visit.

**Parameters**

- `kind` — `string` — Where the workspace lives; only `'browser'` is supported.

**Returns**

- `void`

**Side effects**

- Writes store state and LocalStorage.

### `setCustomDrivers(drivers)`

- **Reachability:** STORE ACTION
- **Obtain via:** import { useStore } from '../../src/store.js'  →  useStore.getState().setCustomDrivers(…)

Replace the workspace's custom driver library.

The one write that creates the system folder in normal use: saving a
driver is a modification, and this is where the workspace discovers it has
nowhere to put it yet.

**Parameters**

- `drivers` — `Array<object>` — The full driver list to store.

**Returns**

- `void`

**Side effects**

- Writes store state and persists the workspace.

### `setPopoutActive(id)`

- **Reachability:** STORE ACTION
- **Obtain via:** import { useStore } from '../../src/store.js'  →  useStore.getState().setPopoutActive(…)

Bring a view to the front in a popped-out tab.

**Parameters**

- `id` — `string` — Panel id.

**Returns**

- `void`

**Side effects**

- Writes store state and rewrites this tab's URL. The fields are local to the window — `SHARED_KEYS` deliberately excludes them.

### `addViewToPopout(id)`

- **Reachability:** STORE ACTION
- **Obtain via:** import { useStore } from '../../src/store.js'  →  useStore.getState().addViewToPopout(…)

Add a view to this popped-out tab, beside the ones already in it.

The counterpart of `addViewToStack` for a window that has no dock. The
main window is told so it can let go of the panel, exactly as it does when
a whole new tab claims one — a panel exists once across every window, and
a view showing in two places would be two things to keep in step.

**Parameters**

- `id` — `string` — Panel to add. One already here is merely brought to the front.

**Returns**

- `void`

**Side effects**

- Writes store state, rewrites this tab's URL, and announces the claim to the main window. Does nothing outside a popped-out tab.

### `closeViewInPopout(id)`

- **Reachability:** STORE ACTION
- **Obtain via:** import { useStore } from '../../src/store.js'  →  useStore.getState().closeViewInPopout(…)

Remove a view from this popped-out tab, handing it back to the main window.

Closing the last one closes the tab rather than leaving an empty window,
which is also how every remaining view gets handed back at once.

**Parameters**

- `id` — `string` — Panel to close. One this tab does not hold is a no-op.

**Returns**

- `void`

**Side effects**

- Writes store state, rewrites this tab's URL, and either announces the release to the main window or closes the browser tab. Does nothing outside a popped-out tab.

### `popOutPanel(id)`

- **Reachability:** STORE ACTION
- **Obtain via:** import { useStore } from '../../src/store.js'  →  useStore.getState().popOutPanel(…)

Send a panel to its own browser tab and remove it from the dock.

Called from a popped-out tab it only opens the window: that tab has no
dock to take the panel out of, and the new window announces itself over
the channel anyway, which is what makes the main window let go of it.

**Parameters**

- `id` — `string` — Panel id.

**Returns**

- `void`

**Side effects**

- Opens a browser window, and in the main window writes store state and persists the layout.

### `popOutStack(stackId)`

- **Reachability:** STORE ACTION
- **Obtain via:** import { useStore } from '../../src/store.js'  →  useStore.getState().popOutStack(…)

Send a whole docked window — every tab in one stack — to a single browser tab.

The new tab reproduces the stack: the same panels, the same tab order, the
same one in front. Panels that cannot leave the dock stay in it, so popping
out the window holding the Node Editor gives you the group in a tab and
leaves the editor where it is rather than emptying the workspace.

**Parameters**

- `stackId` — `string` — Id of the stack to pop out. An unknown id is a no-op.

**Returns**

- `void`

**Side effects**

- Opens a browser window, writes store state and persists the layout.

### `addViewToStack(panelId, stackId)`

- **Reachability:** STORE ACTION
- **Obtain via:** import { useStore } from '../../src/store.js'  →  useStore.getState().addViewToStack(…)

Add a view as a new tab in one named docked window.

This is the injection the right-click menu offers: unlike `layoutOps.open`,
which consults the panel's own placement hint, the caller chooses the
destination. A panel already open elsewhere moves rather than being
duplicated — a panel exists once in the workspace.

A panel currently in its own browser tab is taken back first, so it does
not end up counted as both docked and popped out.

**Parameters**

- `panelId` — `string` — Panel to add.
- `stackId` — `string` — Stack to add it to. An unknown id is a no-op.

**Returns**

- `void`

**Side effects**

- Writes store state and persists the layout.

### `_detachPanel(id)`

- **Reachability:** STORE ACTION
- **Obtain via:** import { useStore } from '../../src/store.js'  →  useStore.getState()._detachPanel(…)

Mark a panel as popped out and close it in this window's dock.

Called both when this window pops a panel out and when another window
announces that it has. Tracking which panels are out keeps the View menu
honest about what is actually visible.

**Parameters**

- `id` — `string` — Panel id.

**Returns**

- `void`

**Side effects**

- Writes store state and persists the layout.

### `_reattachPanel(id)`

- **Reachability:** STORE ACTION
- **Obtain via:** import { useStore } from '../../src/store.js'  →  useStore.getState()._reattachPanel(…)

Take a panel back into the dock when its tab closes.

**Parameters**

- `id` — `string` — Panel id. Ignored when the panel was not popped out.

**Returns**

- `void`

**Side effects**

- Writes store state and persists the layout.

### `_applyRemote(patch)`

- **Reachability:** STORE ACTION
- **Obtain via:** import { useStore } from '../../src/store.js'  →  useStore.getState()._applyRemote(…)

Apply state mirrored from another window without echoing it back.

Writes through Zustand's raw setter and holds `applyingRemote` for the
duration, which is what stops the wrapped `set` from re-broadcasting what
it just received and starting a loop. The flag is cleared in a `finally`
so a throwing subscriber cannot leave sync permanently muted.

**Parameters**

- `patch` — `object` — Shared-state delta from another window.

**Returns**

- `void`

**Mutates**

- The module-level `applyingRemote` flag, for the duration of the call.

**Side effects**

- Writes store state.

### `_sharedSnapshot()`

- **Reachability:** STORE ACTION
- **Obtain via:** import { useStore } from '../../src/store.js'  →  useStore.getState()._sharedSnapshot(…)

The full shared slice, sent to a popped-out tab when it announces itself.

**Returns**

- `object` — Every key in `SHARED_KEYS` with its current value.

**Reads external mutable state**

- Current store state.

## UNREACHABLE (8)

### `simulateInWorker(project)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Run one sweep in the simulation worker.

Each request carries an id and resolves its own promise, so several runs may
be in flight without their replies being confused. Replies whose id is no
longer pending are dropped, which is what makes a superseded run harmless.

**Parameters**

- `project` — `object` — A serialized project: `{nodes, edges, settings}`.

**Returns**

- `Promise<{id: number, ok: boolean, results?: object, metrics?: object|null, error?: string, projectErrors?: string[]|null}>` — The worker's reply.

**Side effects**

- Spawns the worker on first call and posts a message to it.

### `simulateInWorker > simWorker.onmessage(e)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Resolve the request a worker reply belongs to.

An unrecognised id is dropped rather than treated as an error: it means
the request was superseded and its entry already removed.

**Parameters**

- `e` — `MessageEvent` — The reply, carrying the `id` of its request.

**Returns**

- `void`

**Side effects**

- Removes the request from `simPending` and resolves its promise.

### `syncPopoutUrl(ids, active)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Rewrite a popped-out tab's own URL to match what it now holds.

The URL seeds the tab but does not own it: views can be added and closed
once it is open. Keeping the address in step means reloading the tab — or
restoring it after a browser restart — brings back the window the user
actually built rather than the one they first opened.

`replaceState` rather than `pushState`, since adding a view is not somewhere
the back button should return from.

**Parameters**

- `ids` — `string[]` — Panel ids the tab now holds, in tab order.
- `active` — `string|null` — The view in front.

**Returns**

- `void`

**Side effects**

- Replaces the current history entry. Silently does nothing where the History API is unavailable.

### `needsStorageChoice()`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Whether the user has already been asked where their workspace lives.

A popped-out tab never asks: it owns no workspace of its own and the
question belongs to the window that does.

**Returns**

- `boolean` — True when the prompt should be shown.

**Side effects**

- Reads LocalStorage and the window's own URL.

### `loadWorkspace()`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Load the persisted workspace, or build a first-run one.

A workspace that fails to parse is replaced rather than repaired: the file
browser cannot show something it cannot read, and a half-recovered workspace
would be harder to reason about than an empty one.

Custom drivers saved by a build that predates workspaces are adopted into
the new one. That only happens on a genuine first run — an existing
workspace is never modified on load, since the system folder is supposed to
appear when something writes to it, not when the app starts.

**Returns**

- `object` — A usable workspace.

**Side effects**

- Reads LocalStorage and the current time.

### `freeSpotNear > taken(x, y)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Whether any existing node sits within one step of a point.

**Parameters**

- `x` — `number` — Canvas x.
- `y` — `number` — Canvas y.

**Returns**

- `boolean` — True when the spot is occupied.

**Reads external mutable state**

- the enclosing `nodes` list and `step` radius.

### `set(partial, replace)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Update state and mirror the shared slice to other windows.

Wraps Zustand's setter so cross-window sync happens in exactly one place
rather than at every call site. Only keys in `SHARED_KEYS` are broadcast,
and only when they were actually touched, so local UI state stays local.

`applyingRemote` suppresses the echo when the update *came from* another
window, and `muted` keeps a freshly opened popout quiet until the main
window has sent it a snapshot — without that, its own start-up writes
would race across the channel and overwrite the project the main window
is showing.

**Parameters**

- `partial` — `object|Function` — State delta, as Zustand accepts it.
- `replace` — `boolean` _(optional)_ — Replace rather than merge the state.

**Returns**

- `void`

**Side effects**

- Writes store state and may post a message on the BroadcastChannel.

**Reads external mutable state**

- The module-level `applyingRemote` and `muted` flags.

### `channel.onmessage(event)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Handle a message from another window.

The protocol is deliberately small: `patch` is a shared-state delta
mirrored both ways, `hello` is a popped-out tab announcing itself, `full`
is the snapshot the main window answers with, and `bye` is that tab
closing.

Receiving anything unmutes this window — a fresh popout stays quiet until
the main window has spoken, so its start-up writes cannot overwrite the
project already open.

A popout can edit shared state, but the main window owns the solver, so an
incoming edit to a simulation input re-runs the sweep there.

**Parameters**

- `event` — `MessageEvent` — The channel message.
- `event.data` — `object` — The message payload; ignored unless it is an object.

**Returns**

- `void`

**Mutates**

- The module-level `muted` flag.

**Side effects**

- Writes store state, may post a reply on the channel, and may trigger a resimulation.
