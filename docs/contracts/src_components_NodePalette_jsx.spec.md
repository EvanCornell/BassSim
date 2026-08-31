# Contract specification: `src/components/NodePalette.jsx`

> Generated from method contracts. This file contains **no implementation code**.
> Write tests against what is claimed here, not against what you expect the code to do.

## Module

The element palette, floating over the top-left of the node editor.

It used to be a docked panel with a paragraph of explanation under every
entry. That paragraph is read once and then occupies a column of the screen
forever, and the column was the most valuable one — right beside the canvas.
What a user actually needs while building is the shortest possible answer to
"which one is the chamber": its colour, which is the same colour the node
will be, and its name.

Floating rather than docked because the palette is part of the canvas, not a
neighbour of it. It travels with the canvas when the panel is popped out,
and it costs the graph no space that the graph was using — the container
ignores pointer events, so only the cubes themselves are in the way.

## EXPORTED (1)

### `NodePalette()`

- **Reachability:** EXPORTED
- **Obtain via:** import { NodePalette } from '../../src/components/NodePalette.jsx'

The floating stack of draggable element cubes.

Each cube carries its element's theme colour and name; the long description
survives as the tooltip, where it costs nothing until it is wanted.

**Returns**

- `React.ReactElement` — The palette overlay.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

## UNREACHABLE (1)

### `NodePalette > onDragStart(e, type)`

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
