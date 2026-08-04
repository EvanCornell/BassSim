# Contract specification: `src/components/FlowCanvas.jsx`

> Generated from method contracts. This file contains **no implementation code**.
> Write tests against what is claimed here, not against what you expect the code to do.

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

## UNREACHABLE (2)

### `CanvasInner()`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

The node editor canvas.

Must render inside a `ReactFlowProvider`, which is why `FlowCanvas` wraps
it — `useReactFlow` is only available below the provider.

Tracks the pointer so a keyboard-added node can land where the user is
looking, and publishes that as `_flowApi` on the store for
`addNodeAtCursor` to read.

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
