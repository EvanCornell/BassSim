# Contract specification: `src/components/NodePalette.jsx`

> Generated from method contracts. This file contains **no implementation code**.
> Write tests against what is claimed here, not against what you expect the code to do.

## Module

The element dock, floating at the bottom centre of the node editor.

One chip per element — its colour, which is the colour its node will be,
its name, and the key that adds one at the pointer — then the zoom. A
chip is dragged onto the canvas to place the element. The long
description survives as the tooltip, where it costs nothing until wanted.

It lives inside the canvas, not beside it: it travels with the canvas
when the panel is popped out, and it costs the graph no space.

## EXPORTED (1)

### `NodePalette()`

- **Reachability:** EXPORTED
- **Obtain via:** import { NodePalette } from '../../src/components/NodePalette.jsx'

The element dock: draggable element chips with their shortcut keys, and the zoom.

Must be rendered inside the canvas's React Flow provider, which the zoom
reads and drives.

**Returns**

- `React.ReactElement` — The dock.

**Side effects**

- Subscribes to the store and to the canvas viewport.

## UNREACHABLE (1)

### `onDragStart(e, type)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Start a palette drag, tagging it with the node type to create.

The canvas reads `NODE_DRAG_TYPE` on drop, which is what keeps a palette
drag from being confused with a panel tab or a file dragged in from the
desktop.

**Parameters**

- `e` — `React.DragEvent` — The drag event.
- `type` — `string` — Node type being dragged.

**Returns**

- `void`

**Mutates**

- Sets data and the allowed effect on the event's dataTransfer.
