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

## UNREACHABLE (11)

### `swallowNextClick()`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Discard the one `click` event that trails a completed marquee drag.

A press and release on the same element is a click whatever happened in
between, so the browser fires one at the end of every sweep. React Flow's
pane handles that click by clearing the selection — which is right for a
click on empty space and exactly wrong here, since it would wipe the
selection the sweep had just made.

Swallowed at the window in the capture phase, so the event never reaches the
handler that would act on it, and only ever once: the listener stands down on
the next turn of the loop whether or not the event arrived, so a drag that
ends outside the window cannot eat a later, deliberate click.

**Returns**

- `void`

**Side effects**

- Registers a one-shot window click listener and schedules its removal.

### `swallowNextClick > eat(e)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Consume the trailing event.

**Parameters**

- `e` — `MouseEvent` — The click event.

**Returns**

- `void`

**Side effects**

- Stops the event propagating to the handlers that would act on it.

### `CanvasInner()`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

The node editor canvas.

Must render inside a `ReactFlowProvider`, which is why `FlowCanvas` wraps
it — `useReactFlow` is only available below the provider.

Tracks the pointer so a keyboard-added node can land where the user is
looking, and publishes that as `_flowApi` on the store for
`addNodeAtCursor` to read.

The mouse follows the convention every other node editor uses: dragging the
background with the left button sweeps a marquee over the elements it
crosses, the middle button — or the left with Space held — pans, and the
right button raises the context menu. Left-dragging cannot both select and
pan, so panning is what moves aside.

**Returns**

- `React.ReactElement` — The canvas.

**Side effects**

- Subscribes to the store, writes `_flowApi` into it on mount and clears it on unmount, and tracks pointer position in a ref.

### `CanvasInner > down(e)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Note that Space is down, which makes the left button pan.

**Parameters**

- `e` — `KeyboardEvent` — The keydown event.

**Returns**

- `void`

**Mutates**

- The held-key flag.

### `CanvasInner > up(e)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Note that Space is up.

**Parameters**

- `e` — `KeyboardEvent` — The keyup event.

**Returns**

- `void`

**Mutates**

- The held-key flag.

### `CanvasInner > clear()`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Forget the key when the window loses focus.

A keyup delivered to another window never arrives here, which would
otherwise leave the canvas convinced Space is still down.

**Returns**

- `void`

**Mutates**

- The held-key flag.

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

### `CanvasInner > onPaneDown(e)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Begin a left-drag on the background, which may turn out to be a marquee.

Nothing is committed at mousedown: whether this is a marquee or a plain
click on empty space only becomes clear once the pointer has moved, or
failed to. Listeners go on the window rather than the canvas so the drag
survives the cursor leaving it, which a sweep across the whole graph
routinely does.

**Parameters**

- `e` — `React.MouseEvent` — The mousedown event.

**Returns**

- `void`

**Side effects**

- Reads live element geometry and registers window mousemove and mouseup listeners, both removed when the drag ends.

### `CanvasInner > onPaneDown > onMove(ev)`

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

### `CanvasInner > onPaneDown > onUp(ev)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Finish the gesture: select what the marquee caught, if it was one.

A press that never moved is a plain click on empty space, which React
Flow's own pane handler already treats as clearing the selection.

**Parameters**

- `ev` — `MouseEvent` — The mouseup event.

**Returns**

- `void`

**Mutates**

- The in-progress drag record.

**Side effects**

- Removes the window listeners, clears the overlay and — for a drag — swallows the trailing click and replaces the node selection.

### `CanvasInner > openMenu(e, target)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Raise the context menu against something on the canvas.

The event is consumed so the docked window's own menu does not open behind
this one on the way up.

Nothing has to be told apart here: selection is the left button's job, so
the right button means the menu and only the menu, whether the platform
fires `contextmenu` at mousedown or at mouseup.

**Parameters**

- `e` — `React.MouseEvent` — The contextmenu event.
- `target` — `object` — What was clicked: `{kind: 'pane'|'node'|'edge', …}`.

**Returns**

- `void`

**Side effects**

- Focuses the canvas and opens the context menu.
