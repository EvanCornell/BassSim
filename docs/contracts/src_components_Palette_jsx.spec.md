# Contract specification: `src/components/Palette.jsx`

> Generated from method contracts. This file contains **no implementation code**.
> Write tests against what is claimed here, not against what you expect the code to do.

## EXPORTED (1)

### `Palette()`

- **Reachability:** EXPORTED
- **Obtain via:** import { Palette } from '../../src/components/Palette.jsx'

The node palette: draggable element types and the driver library button.

**Returns**

- `React.ReactElement` — The palette panel.

**Side effects**

- Subscribes to the store.

## UNREACHABLE (1)

### `Palette > onDragStart(e, type)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Start a palette drag, tagging it with the node type to create.

The canvas reads the `application/acousim-node` type on drop, which is
what keeps a palette drag from being confused with any other drag.

**Parameters**

- `e` — `React.DragEvent` — The drag event.
- `type` — `string` — Node type being dragged.

**Returns**

- `void`

**Mutates**

- Sets data and the allowed effect on the event's dataTransfer.
