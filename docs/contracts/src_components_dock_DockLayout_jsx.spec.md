# Contract specification: `src/components/dock/DockLayout.jsx`

> Generated from method contracts. This file contains **no implementation code**.
> Write tests against what is claimed here, not against what you expect the code to do.

## Module

Dock renderer — turns the layout tree from src/layout.js into DOM.

Three interactions live here:
  1. splitter drags        (resize two adjacent siblings, others untouched)
  2. tab drags             (retarget a panel to any stack, edge or tab slot)
  3. maximize / close      (per-stack chrome)

Panels stay mounted when their tab is inactive — hidden with display:none
rather than unmounted — so React Flow keeps its viewport and the charts keep
their zoom when you tab away and back.

## Exported constants

Names this module publishes that are not methods. The method contracts
above and below refer to these by role — a command, a node type, a panel —
so this is the vocabulary they assume.

### `__internals`

Keys: `isPanelDrag`, `endPanelDrag`

## EXPORTED (1)

### `DockLayout()`

- **Reachability:** EXPORTED
- **Obtain via:** import { DockLayout } from '../../src/components/dock/DockLayout.jsx'

The workspace dock: renders the layout tree, or the maximized panel alone.

Installs a safety net for the drag flag. Whatever a drag turns out to be,
once it is over the workspace must not be left in docking mode — a stuck
flag keeps the edge strips over the window and turns every later palette
drag into a panel move. The listeners are on the bubble phase, so a
panel's own drop handler has already read the flag before it is cleared.

**Returns**

- `React.ReactElement` — The dock.

**Side effects**

- Subscribes to the store. Registers window drop and dragend listeners, removed on unmount.

## INTERNAL (2)

### `isPanelDrag(e)`

- **Reachability:** INTERNAL
- **Obtain via:** import { __internals } from '../../src/components/dock/DockLayout.jsx'  →  __internals.isPanelDrag

Whether a drag event is a panel tab drag.

The payload decides what a drag means, never the store flag alone: a palette
element carries `application/acousim-node` and must reach the canvas
untouched, even if a previous tab drag left `draggingPanel` set.

**Parameters**

- `e` — `React.DragEvent` — The drag event. A panel tab drag is identified by `application/acousim-panel` appearing in `dataTransfer.types`.

**Returns**

- `boolean` — True when the drag carries a panel tab.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `endPanelDrag()`

- **Reachability:** INTERNAL
- **Obtain via:** import { __internals } from '../../src/components/dock/DockLayout.jsx'  →  __internals.endPanelDrag

Clear the panel-drag flag.

Chromium never fires `dragend` when the drag source is removed mid-drag,
which is exactly what a successful tab drop does — the tree is rebuilt and
the tab disappears. So the flag is cleared as soon as a drop is acted on
rather than waiting for an event that will not arrive.

**Returns**

- `void`

**Side effects**

- Writes store state, if the flag was set.

## UNREACHABLE (12)

### `PanelBody(props)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Render one panel's component.

**Parameters**

- `props` — `object` — Component props.
- `props.id` — `string` — Panel id.

**Returns**

- `React.ReactElement|null` — The panel, or `null` for an unknown id.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `DockStack(props)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

One tabbed panel group, with its tab strip and drop targets.

Inactive panels stay mounted — hidden with `display: none` rather than
unmounted — so React Flow keeps its viewport and the charts keep their
zoom when you tab away and back.

**Parameters**

- `props` — `object` — Component props.
- `props.node` — `object` — The stack node from the layout tree.

**Returns**

- `React.ReactElement` — The panel group.

**Side effects**

- Subscribes to the store.

### `DockStack > zoneAt(e)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Which of the five drop targets the cursor is over.

The outer 28% of each side docks to that side; anything further in tabs
the panel into this stack. When the cursor is in two edge bands at once —
a corner — the nearer edge wins.

**Parameters**

- `e` — `React.DragEvent` — The drag event.

**Returns**

- `'left'|'right'|'top'|'bottom'|'center'` — The target zone.

**Side effects**

- Reads live element geometry.

### `DockStack > onBodyDragOver(e)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Track which drop zone a panel drag is over, to highlight it.

**Parameters**

- `e` — `React.DragEvent` — The drag event.

**Returns**

- `void`

**Side effects**

- Updates the highlighted zone, and prevents the default only for panel drags — a palette drag must pass through to the canvas.

### `DockStack > onBodyDrop(e)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Dock the dragged panel into this stack at the cursor's zone.

**Parameters**

- `e` — `React.DragEvent` — The drop event.

**Returns**

- `void`

**Side effects**

- Restructures and persists the layout, and clears the drag flag. Ignores drops that are not panel drags.

### `DockStack > onContextMenu(e, panelId)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Raise the right-click menu against this stack, or against one of its tabs.

The event is consumed so a click on a tab does not also raise the window's
own menu on the way up.

**Parameters**

- `e` — `React.MouseEvent` — The contextmenu event.
- `panelId` — `string|null` _(optional, default `null`)_ — The tab that was clicked, or `null` for the window itself.

**Returns**

- `void`

**Side effects**

- Focuses the stack's front panel and opens the context menu.

### `Splitter(props)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

The draggable divider between two sibling panes.

**Parameters**

- `props` — `object` — Component props.
- `props.parentId` — `string` — Id of the split these panes belong to.
- `props.index` — `number` — Index of the pane before the splitter.
- `props.dir` — `'row'|'col'` — Split direction.
- `props.containerRef` — `React.RefObject` — Ref to the split's DOM element, used to measure the panes.

**Returns**

- `React.ReactElement` — The splitter.

**Side effects**

- Subscribes to the store.

### `Splitter > onMove(ev)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Apply the in-progress splitter drag.

**Parameters**

- `ev` — `MouseEvent` — The mousemove event.

**Returns**

- `void`

**Side effects**

- Resizes and persists the layout on every mouse move.

**Reads external mutable state**

- the geometry captured when the drag started.

### `Splitter > onUp()`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

End the splitter drag and remove its listeners.

**Returns**

- `void`

**Side effects**

- Removes the window listeners and the body class.

### `DockNode(props)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Render a layout node, recursing through splits down to the stacks.

Splitters are interleaved between children, which is why the splitter's
own measurement code indexes DOM children at `2i`.

**Parameters**

- `props` — `object` — Component props.
- `props.node` — `object` — A stack or split node from the layout tree.

**Returns**

- `React.ReactElement` — The rendered subtree.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `EdgeDrops()`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

The four drop strips along the outer edges of the workspace.

Rendered only during a panel drag, so they never intercept anything else.

**Returns**

- `React.ReactElement|null` — The strips, or `null` when no panel is being dragged.

**Side effects**

- Subscribes to the store.

### `DockLayout > clear()`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Clear the drag flag once any drag ends anywhere in the window.

**Returns**

- `void`

**Side effects**

- Writes store state, if the flag was set.
