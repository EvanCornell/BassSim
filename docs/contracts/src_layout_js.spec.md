# Contract specification: `src/layout.js`

> Generated from method contracts. This file contains **no implementation code**.
> Write tests against what is claimed here, not against what you expect the code to do.

## Module

Dock layout model — the data behind the Eclipse-style workspace.

The workspace is a tree of two node kinds:

  { id, type: 'split', dir: 'row'|'col', size, children: [node, …] }
  { id, type: 'stack', size, panels: ['canvas', …], active: 'canvas' }

A *stack* is a tabbed panel group (one visible at a time); a *split* lays
its children out horizontally or vertically. `size` is a flex weight shared
among siblings — the absolute numbers are meaningless, only their ratios
matter, which is what lets a splitter drag redistribute weight between two
neighbours without touching the rest of the tree.

Every operation here is pure: it returns a new tree, never mutates. Two
invariants are maintained after each edit:
  - a stack always holds at least one panel (empty stacks are pruned)
  - a split always holds at least two children (a lone child replaces it)

## Exported constants

Names this module publishes that are not methods. The method contracts
above and below refer to these by role — a command, a node type, a panel —
so this is the vocabulary they assume.

### `LAYOUT_VERSION`

Version of the persisted layout tree.

A saved layout whose version does not match is discarded rather than migrated
— the workspace arrangement is cheap to rebuild and not worth a migration path.

Value: `2`

### `__internals`

Keys: `mapStacks`, `removeRec`, `dirOf`, `isBefore`, `insertRec`

## EXPORTED (16)

### `uid(p)`

- **Reachability:** EXPORTED
- **Obtain via:** import { uid } from '../../src/layout.js'

Generate a layout node id.

Combines the clock with a per-session counter so ids stay unique even when
several nodes are created inside the same millisecond, which a single docking
operation routinely does.

**Parameters**

- `p` — `string` _(optional, default `'n'`)_ — Prefix identifying the node kind: 's' for stacks, 'd' for splits.

**Returns**

- `string` — A new id, unique within this session.

**Side effects**

- Advances the module-level counter, so successive calls with the same argument differ.

### `stack(panels, opts)`

- **Reachability:** EXPORTED
- **Obtain via:** import { stack } from '../../src/layout.js'

Build a stack: a tabbed group showing one of its panels at a time.

**Parameters**

- `panels` — `string[]` — Panel ids in tab order.
- `opts` — `object` _(optional, default `{}`)_ — Overrides.
- `opts.id` — `string` _(optional)_ — Explicit id; a fresh one is generated when omitted.
- `opts.size` — `number` _(optional, default `1`)_ — Flex weight relative to its siblings.
- `opts.active` — `string` _(optional)_ — Initially visible panel. Defaults to the first, or `null` for an empty stack.

**Returns**

- `object` — A new stack node.

**Side effects**

- Consumes an id from `uid` unless `opts.id` is supplied.

### `split(dir, children, size)`

- **Reachability:** EXPORTED
- **Obtain via:** import { split } from '../../src/layout.js'

Build a split: a row or column laying its children out side by side.

**Parameters**

- `dir` — `'row'|'col'` — Layout direction.
- `children` — `Array<object>` — Child stacks or splits.
- `size` — `number` _(optional, default `1`)_ — Flex weight relative to its siblings.

**Returns**

- `object` — A new split node.

**Preconditions (caller must guarantee)**

- children.length >= 2 — a lone child collapses under the tree invariants

**Side effects**

- Consumes an id from `uid`.

### `defaultLayout()`

- **Reachability:** EXPORTED
- **Obtain via:** import { defaultLayout } from '../../src/layout.js'

The default workspace arrangement.

Palette on the left, canvas over the four charts most designs are judged by,
parameters on the right — the classic three-column IDE arrangement. The
remaining plots are opened from View ▸ Charts.

**Returns**

- `object` — A freshly built layout tree, safe for the caller to keep.

**Side effects**

- Consumes ids from `uid`, so two calls return trees with different node ids.

### `findNode(tree, id)`

- **Reachability:** EXPORTED
- **Obtain via:** import { findNode } from '../../src/layout.js'

Find any node — stack or split — by id.

**Parameters**

- `tree` — `object|null` — Layout tree to search.
- `id` — `string` — Node id.

**Returns**

- `object|null` — The node, or `null` when the tree has no such id.

**Postconditions (must hold on return)**

- Returns the live node, not a copy; callers must not mutate it.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `findPanelStack(tree, panelId)`

- **Reachability:** EXPORTED
- **Obtain via:** import { findPanelStack } from '../../src/layout.js'

Find the stack that currently holds a panel.

**Parameters**

- `tree` — `object|null` — Layout tree to search.
- `panelId` — `string` — Panel id.

**Returns**

- `object|null` — The containing stack, or `null` when the panel is closed or popped out.

**Postconditions (must hold on return)**

- Returns the live node, not a copy; callers must not mutate it.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `openPanels(tree, out)`

- **Reachability:** EXPORTED
- **Obtain via:** import { openPanels } from '../../src/layout.js'

Collect the ids of every panel currently in the tree.

**Parameters**

- `tree` — `object|null` — Layout tree to walk.
- `out` — `string[]` _(optional, default `[]`)_ — Accumulator, appended to in place. Callers normally omit it.

**Returns**

- `string[]` — The same array, carrying every open panel id in traversal order.

**Mutates**

- The `out` array passed in, which is the recursion's accumulator.

### `isOpen(tree, panelId)`

- **Reachability:** EXPORTED
- **Obtain via:** import { isOpen } from '../../src/layout.js'

Whether a panel is currently docked anywhere in the tree.

**Parameters**

- `tree` — `object|null` — Layout tree.
- `panelId` — `string` — Panel id.

**Returns**

- `boolean` — True when the panel is open.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `setActive(tree, stackId, panelId)`

- **Reachability:** EXPORTED
- **Obtain via:** import { setActive } from '../../src/layout.js'

Bring a panel to the front of its stack.

**Parameters**

- `tree` — `object` — Layout tree.
- `stackId` — `string` — Stack whose active tab is changing.
- `panelId` — `string` — Panel to show.

**Returns**

- `object` — A new tree with that stack's `active` updated.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `removePanel(tree, panelId)`

- **Reachability:** EXPORTED
- **Obtain via:** import { removePanel } from '../../src/layout.js'

Close a panel, pruning any stack or split left empty by its removal.

**Parameters**

- `tree` — `object` — Layout tree.
- `panelId` — `string` — Panel to close.

**Returns**

- `object|null` — A new tree, or `null` if that panel was the last one open.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `dockPanel(tree, panelId, targetStackId, zone)`

- **Reachability:** EXPORTED
- **Obtain via:** import { dockPanel } from '../../src/layout.js'

Move a panel onto a target stack — the result of a completed tab drag.

Removal happens before insertion, which creates the case this function exists
to handle: pruning the panel's old stack can delete the very target it was
being dropped on. When that happens the panel docks against the right edge
instead, so the drag still does something rather than silently failing.

Dropping a panel back onto its own stack only changes focus.

**Parameters**

- `tree` — `object` — Layout tree.
- `panelId` — `string` — Panel being moved.
- `targetStackId` — `string` — Stack to dock against.
- `zone` — `'center'|'left'|'right'|'top'|'bottom'` — `center` adds a tab; the others split the target.

**Returns**

- `object` — A new tree, or the original when the move would empty the workspace.

**Side effects**

- Consumes ids from `uid` when the move creates stacks or splits.

### `dockToEdge(tree, panelId, edge)`

- **Reachability:** EXPORTED
- **Obtain via:** import { dockToEdge } from '../../src/layout.js'

Dock a panel against an outer edge of the whole workspace.

When the root split already runs in the right direction the panel joins it as
a sibling at a quarter of the average weight; otherwise a new root split is
created giving the newcomer 22% of the width or height.

**Parameters**

- `tree` — `object` — Layout tree.
- `panelId` — `string` — Panel to dock.
- `edge` — `'left'|'right'|'top'|'bottom'` — Which outer edge.

**Returns**

- `object` — A new tree. Falls back to a lone stack if the panel was the only one open.

**Side effects**

- Consumes ids from `uid`.

### `moveTabInStack(tree, stackId, from, to)`

- **Reachability:** EXPORTED
- **Obtain via:** import { moveTabInStack } from '../../src/layout.js'

Reorder a tab within its own stack.

**Parameters**

- `tree` — `object` — Layout tree.
- `stackId` — `string` — Stack containing the tab.
- `from` — `number` — Current index.
- `to` — `number` — Destination index, in the list after the tab is lifted out.

**Returns**

- `object` — A new tree with the tab order changed.

**Preconditions (caller must guarantee)**

- Both indices are within the stack's panel list.

**Postconditions (must hold on return)**

- The stack's `active` panel is unchanged — reordering does not switch tabs.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `openPanel(tree, panelId, hint)`

- **Reachability:** EXPORTED
- **Obtain via:** import { openPanel } from '../../src/layout.js'

Show a panel, focusing it if it is already open and docking it if not.

Placement follows the panel registry's hint. `nextTo` names one preferred
neighbour; `nextToAny` names a family — the charts — so a newly opened plot
joins whichever sibling happens to be on screen rather than landing somewhere
unrelated. With no candidate available it falls back to an outer edge.

**Parameters**

- `tree` — `object` — Layout tree.
- `panelId` — `string` — Panel to show.
- `hint` — `object` _(optional)_ — Placement hint from the panel registry.
- `hint.nextTo` — `string` _(optional)_ — Preferred neighbour panel id.
- `hint.nextToAny` — `string[]` _(optional)_ — Acceptable neighbours, tried in order.
- `hint.zone` — `'center'|'left'|'right'|'top'|'bottom'` _(optional, default `'center'`)_ — How to dock beside the neighbour.
- `hint.edge` — `'left'|'right'|'top'|'bottom'` _(optional, default `'bottom'`)_ — Fallback edge when no neighbour is open.

**Returns**

- `object` — A new tree with the panel visible.

**Side effects**

- Consumes ids from `uid` when docking creates nodes.

### `resizeChildren(tree, splitId, index, weightA, weightB)`

- **Reachability:** EXPORTED
- **Obtain via:** import { resizeChildren } from '../../src/layout.js'

Apply a splitter drag, reweighting two adjacent children.

The caller is expected to have preserved the pair's combined share, which is
what keeps siblings outside the pair — and the rest of the layout — from
moving when one splitter is dragged.

**Parameters**

- `tree` — `object` — Layout tree.
- `splitId` — `string` — Split whose children are being resized.
- `index` — `number` — Index of the child on the left or top of the splitter.
- `weightA` — `number` — New weight for child `index`.
- `weightB` — `number` — New weight for child `index + 1`.

**Returns**

- `object` — A new tree. Unchanged when the root is not a split.

**Preconditions (caller must guarantee)**

- index + 1 is a valid child index

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `sanitize(tree, knownPanels)`

- **Reachability:** EXPORTED
- **Obtain via:** import { sanitize } from '../../src/layout.js'

Rebuild a persisted layout, discarding anything this build cannot render.

The trust boundary for LocalStorage. A saved tree may name panels that no
longer exist, carry a non-numeric size, or have been hand-edited into an
invalid shape; every field is re-derived here rather than accepted, and both
structural invariants are re-established on the way back up. The result is
that an old or corrupt layout can never wedge the workspace — at worst it
sanitizes to `null` and the caller falls back to the default.

**Parameters**

- `tree` — `any` — Untrusted layout tree, typically parsed from LocalStorage.
- `knownPanels` — `string[]` — Panel ids this build knows how to render. Anything else is dropped.

**Returns**

- `object|null` — A valid layout tree, or `null` when nothing renderable survived.

**Postconditions (must hold on return)**

- Every returned node has a valid id, a positive numeric size, and — for stacks — an `active` panel drawn from its own list.

**Side effects**

- Consumes ids from `uid` for any node that was missing one.

## INTERNAL (5)

### `mapStacks(tree, fn)`

- **Reachability:** INTERNAL
- **Obtain via:** import { __internals } from '../../src/layout.js'  →  __internals.mapStacks

Rebuild the tree with `fn` applied to every stack.

The structural spine of the pure edits: splits are copied, stacks are
replaced by whatever `fn` returns.

**Parameters**

- `tree` — `object` — Layout tree.
- `fn` — `(stack: object) => object` — Called for each stack; should return a stack, returning the original when it has no change to make.

**Returns**

- `object` — A new tree. Untouched subtrees are still copied, so identity is not preserved.

**Preconditions (caller must guarantee)**

- fn does not mutate the stack it is given

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `removeRec(node, panelId)`

- **Reachability:** INTERNAL
- **Obtain via:** import { __internals } from '../../src/layout.js'  →  __internals.removeRec

Remove a panel and repair the tree around it.

Maintains both structural invariants on the way back up: a stack emptied by
the removal is dropped, and a split left with one child collapses into that
child, inheriting the split's weight so the rest of the layout does not shift.

When the removed panel was the active tab, focus moves to the tab that took
its index — or the last one, if it was at the end.

**Parameters**

- `node` — `object` — Subtree to remove from.
- `panelId` — `string` — Panel to remove.

**Returns**

- `object|null` — The rebuilt subtree, or `null` when it no longer holds anything.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `dirOf(zone)`

- **Reachability:** INTERNAL
- **Obtain via:** import { __internals } from '../../src/layout.js'  →  __internals.dirOf

The split direction a drop zone implies.

**Parameters**

- `zone` — `'left'|'right'|'top'|'bottom'|'center'` — Drop zone.

**Returns**

- `'row'|'col'` — `row` for horizontal zones, `col` otherwise.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `isBefore(zone)`

- **Reachability:** INTERNAL
- **Obtain via:** import { __internals } from '../../src/layout.js'  →  __internals.isBefore

Whether a drop zone places the new panel ahead of the existing one.

**Parameters**

- `zone` — `'left'|'right'|'top'|'bottom'|'center'` — Drop zone.

**Returns**

- `boolean` — True when the new panel goes first in child order.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `insertRec(node, targetId, zone, panelId)`

- **Reachability:** INTERNAL
- **Obtain via:** import { __internals } from '../../src/layout.js'  →  __internals.insertRec

Insert a panel at a target stack, tabbing it in or splitting the target.

A `center` drop appends a tab and focuses it. An edge drop halves the target's
weight and puts the newcomer beside it.

The flattening case matters for feel: when the target is a direct child of a
split that already runs in the requested direction, the panel becomes a
sibling rather than nesting a new split inside the old one. Without it,
repeated docking builds a deep tree whose splitters behave unpredictably.

**Parameters**

- `node` — `object` — Subtree to insert into.
- `targetId` — `string` — Stack to dock against.
- `zone` — `'center'|'left'|'right'|'top'|'bottom'` — Where relative to the target.
- `panelId` — `string` — Panel being placed.

**Returns**

- `object` — A new subtree. Unchanged when `targetId` is not inside it.

**Preconditions (caller must guarantee)**

- The panel has already been removed from its previous stack.

**Side effects**

- Consumes ids from `uid` for the stacks and splits it creates.
