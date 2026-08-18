# Contract specification: `src/components/FlowCanvas.jsx`

> Generated from method contracts. This file contains **no implementation code**.
> Write tests against what is claimed here, not against what you expect the code to do.

## Exported constants

Names this module publishes that are not methods. The method contracts
above and below refer to these by role — a command, a node type, a panel —
so this is the vocabulary they assume.

### `__internals`

Keys: `isValidConnection`

## EXPORTED (1)

### `FlowCanvas()`

- **Reachability:** EXPORTED
- **Obtain via:** import { FlowCanvas } from '../../src/components/FlowCanvas.jsx'

The Node Editor panel, wrapping the canvas in its React Flow provider.

**Returns**

- `React.ReactElement` — The canvas panel.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

## INTERNAL (1)

### `isValidConnection(conn)`

- **Reachability:** INTERNAL
- **Obtain via:** import { __internals } from '../../src/components/FlowCanvas.jsx'  →  __internals.isValidConnection

Whether a proposed edge is allowed.

React Flow already enforces source-to-target, which is what keeps the
pressure-out to pressure-in pairing correct. The only extra rule is that
a node may not connect to itself.

**Parameters**

- `conn` — `{source: string, target: string}` — The proposed connection.

**Returns**

- `boolean` — True when the edge may be created.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

## UNREACHABLE (8)

### `swallowNextContextMenu()`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Discard the one `contextmenu` event that trails a completed right-drag.

The browser fires it whatever the drag was for, and on whatever element the
pointer happened to be over when the button came up — which after a sweep
across the workspace is often not the canvas at all. Left alone it raises
that element's menu on top of the selection just made.

Swallowed at the window in the capture phase, so the event never reaches the
handler that would act on it, and only ever once: the listener stands down
on the next turn of the loop whether or not the event arrived, which is what
keeps a drag that ends outside the window from eating a later, deliberate
right-click.

**Returns**

- `void`

**Side effects**

- Registers a one-shot window contextmenu listener and schedules its removal.

### `swallowNextContextMenu > eat(e)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Consume the trailing event.

**Parameters**

- `e` — `MouseEvent` — The contextmenu event.

**Returns**

- `void`

**Side effects**

- Prevents the event's default and stops it propagating.

### `CanvasInner()`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

The node editor canvas.

Must render inside a `ReactFlowProvider`, which is why `FlowCanvas` wraps
it — `useReactFlow` is only available below the provider.

Tracks the pointer so a keyboard-added node can land where the user is
looking, and publishes that as `_flowApi` on the store for
`addNodeAtCursor` to read.

The right mouse button does two jobs here, told apart by how far it travels:
a click raises the context menu, a drag sweeps a marquee over the elements
it crosses. Panning is therefore restricted to the left and middle buttons,
so a right-drag is unambiguously a selection.

**Returns**

- `React.ReactElement` — The canvas.

**Side effects**

- Subscribes to the store, writes `_flowApi` into it on mount and clears it on unmount, and tracks pointer position in a ref.

### `CanvasInner > dropPoint()`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Where a keyboard-added node should land, in canvas coordinates.

Under the pointer when it is over the canvas, otherwise the middle of the
visible area — so a shortcut pressed with the mouse elsewhere still puts
the node somewhere sensible.

**Returns**

- `{x: number, y: number}|null` — Canvas position, or `null` before the wrapper has mounted.

**Side effects**

- Reads live element geometry and the tracked pointer position.

### `CanvasInner > onRightDown(e)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Begin a right-drag, which may turn out to be a marquee or a click.

Nothing is committed at mousedown: which of the two this is only becomes
clear once the pointer has moved, or failed to. Listeners go on the window
rather than the canvas so the drag survives the cursor leaving it, which a
sweep across the whole graph routinely does.

**Parameters**

- `e` — `React.MouseEvent` — The mousedown event.

**Returns**

- `void`

**Side effects**

- Reads live element geometry and registers window mousemove and mouseup listeners, both removed when the drag ends.

### `CanvasInner > onRightDown > onMove(ev)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Grow the marquee, once the pointer has moved far enough to mean one.

**Parameters**

- `ev` — `MouseEvent` — The mousemove event.

**Returns**

- `void`

**Mutates**

- The in-progress drag record.

**Side effects**

- Updates the overlay rectangle.

### `CanvasInner > onRightDown > onUp(ev)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Finish the gesture: select what the marquee caught, or let the menu open.

**Parameters**

- `ev` — `MouseEvent` — The mouseup event.

**Returns**

- `void`

**Mutates**

- The in-progress drag record.

**Side effects**

- Removes the window listeners, clears the overlay, swallows the trailing contextmenu event and — for a drag — replaces the node selection.

### `CanvasInner > openMenu(e, target)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Raise the context menu against something on the canvas.

Held back rather than raised when a right-press on the background is still
in progress, because the two platforms disagree about when `contextmenu`
arrives: Windows fires it once the button comes up, by which time a drag
has declared itself, but Linux and macOS fire it at mousedown — before
anyone can know whether this is a click or the start of a marquee. Raising
it there would put a menu over every sweep the user drew. So when a gesture
is pending the menu is stashed on it, and the mouseup that finds no
movement is what finally opens it.

The event is consumed either way, so the docked window's own menu does not
open behind this one on the way up.

**Parameters**

- `e` — `React.MouseEvent` — The contextmenu event.
- `target` — `object` — What was clicked: `{kind: 'pane'|'node'|'edge', …}`.

**Returns**

- `void`

**Mutates**

- The in-progress drag record, when there is one.

**Side effects**

- Focuses the canvas and either opens the context menu or defers it to the pending gesture.
