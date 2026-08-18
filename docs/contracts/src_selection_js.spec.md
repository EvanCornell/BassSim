# Contract specification: `src/selection.js`

> Generated from method contracts. This file contains **no implementation code**.
> Write tests against what is claimed here, not against what you expect the code to do.

## Module

Marquee selection geometry — the arithmetic behind a right-drag lasso on the
node editor.

Kept out of the canvas component because it is the part worth being sure
about: a rectangle dragged up-and-left has a negative width, a node that has
never been measured has no size, and "inside the box" is really "overlaps the
box" in every editor users have met. None of that needs React to be checked.

All coordinates here are canvas coordinates, not screen pixels. The caller
converts through React Flow's `screenToFlowPosition` before calling in.

## Exported constants

Names this module publishes that are not methods. The method contracts
above and below refer to these by role — a command, a node type, a panel —
so this is the vocabulary they assume.

### `MARQUEE_THRESHOLD`

Smallest right-drag, in pixels, that counts as a marquee rather than a click.

Below this the gesture opens the context menu. Three pixels of travel is
within the slop of a deliberate click on a trackpad, so the threshold sits
just above it.

Value: `4`

## EXPORTED (5)

### `marqueeRect(a, b)`

- **Reachability:** EXPORTED
- **Obtain via:** import { marqueeRect } from '../../src/selection.js'

The axis-aligned rectangle spanned by two corners.

A drag may run in any direction, so the corners are sorted rather than
assumed — dragging up-and-left is as ordinary as down-and-right.

**Parameters**

- `a` — `{x: number, y: number}` — One corner, where the drag began.
- `b` — `{x: number, y: number}` — The opposite corner, where it is now.

**Returns**

- `{x: number, y: number, w: number, h: number}` — The rectangle, with non-negative width and height.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `nodeBox(node)`

- **Reachability:** EXPORTED
- **Obtain via:** import { nodeBox } from '../../src/selection.js'

A node's bounding box in canvas coordinates.

React Flow writes measured dimensions back onto each node once it has been
laid out; until then it falls back to a nominal size so a just-created node
is still catchable.

**Parameters**

- `node` — `object` — A React Flow node, with `position` and optionally measured `width`/`height`.

**Returns**

- `{x: number, y: number, w: number, h: number}` — The node's box.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `overlaps(a, b)`

- **Reachability:** EXPORTED
- **Obtain via:** import { overlaps } from '../../src/selection.js'

Whether two rectangles overlap at all.

Touching edges do not count: a zero-area intersection is what a lasso drawn
exactly along a node's border produces, and catching the node then would be
indistinguishable from a stray click.

**Parameters**

- `a` — `{x: number, y: number, w: number, h: number}` — First rectangle.
- `b` — `{x: number, y: number, w: number, h: number}` — Second rectangle.

**Returns**

- `boolean` — True when the two overlap.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `nodesInMarquee(nodes, rect)`

- **Reachability:** EXPORTED
- **Obtain via:** import { nodesInMarquee } from '../../src/selection.js'

Which nodes a marquee has caught.

Overlap rather than containment, matching every drawing tool the user has
met: sweeping across a row of nodes selects them without having to enclose
the last one completely.

**Parameters**

- `nodes` — `Array<object>` — The graph's nodes.
- `rect` — `{x: number, y: number, w: number, h: number}` — The marquee, in canvas coordinates.

**Returns**

- `string[]` — Ids of the caught nodes, in graph order.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `distance(a, b)`

- **Reachability:** EXPORTED
- **Obtain via:** import { distance } from '../../src/selection.js'

How far apart two screen points are, in pixels.

Used to tell a right-*click* from a right-*drag*: below the threshold the
gesture is a click and must open the context menu instead.

**Parameters**

- `a` — `{x: number, y: number}` — First point.
- `b` — `{x: number, y: number}` — Second point.

**Returns**

- `number` — The distance between them.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.
