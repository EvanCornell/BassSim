# Contract specification: `src/components/dock/stackContext.js`

> Generated from method contracts. This file contains **no implementation code**.
> Write tests against what is claimed here, not against what you expect the code to do.

## Module

Which docked window a panel is rendered inside.

A panel is written without knowing where it sits — that is the point of the
dock — but the right-click menu needs to know, because "add a view to *this*
window" and "open *this* window in a browser tab" are both statements about
the stack the click landed in. Passing the stack id down as a prop would mean
threading it through every panel component that might contain a right-click
target, so it travels as context instead: set once by the stack, read only by
whoever asks.

The value is `null` in a popped-out browser tab, which has no dock — the menu
omits the window-scoped items there rather than offering something that
cannot work.

## Exported constants

Names this module publishes that are not methods. The method contracts
above and below refer to these by role — a command, a node type, a panel —
so this is the vocabulary they assume.

### `StackContext`

Carries the id of the stack a panel is rendered inside, or `null` outside the dock.

## EXPORTED (1)

### `useStackId()`

- **Reachability:** EXPORTED
- **Obtain via:** import { useStackId } from '../../src/components/dock/stackContext.js'

The id of the docked window the calling panel is rendered inside.

**Returns**

- `string|null` — The stack id, or `null` when there is no dock — a popped-out browser tab, or a maximized panel rendered outside the tree.

**Reads external mutable state**

- React context, so the value tracks whichever stack currently holds the panel.
