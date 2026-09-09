# Contract specification: `src/utils/backdrop.js`

> Generated from method contracts. This file contains **no implementation code**.
> Write tests against what is claimed here, not against what you expect the code to do.

## EXPORTED (1)

### `useBackdropDismiss(close)`

- **Reachability:** EXPORTED
- **Obtain via:** import { useBackdropDismiss } from '../../src/utils/backdrop.js'

Props for a modal backdrop that dismisses on a click, but not on a drag
that merely finished over it.

A bare `onClick` on the backdrop is wrong, and wrong in a way that only
shows up once there is text worth selecting. `click` fires on the nearest
common ancestor of where the button went down and where it came up, so
pressing inside a text field, sweeping past the dialog's edge and
releasing lands a click on the backdrop itself — a selection gesture that
throws the dialog away mid-edit. Stopping propagation inside the dialog
cannot help: the event was never dispatched there to begin with.

So both ends of the gesture are checked instead, on the press and on the
release, and the dialog is dismissed only when neither touched it. That
also rules out the mirror case — pressing on the backdrop and releasing
inside the dialog, which is how a user drags a selection the other way.

The arming flag is a ref rather than a closure variable because React may
re-render between the press and the release, which would otherwise hand
the second handler a fresh, unarmed copy.

Because both ends are checked against `currentTarget`, the dialog this
wraps needs no `onClick` of its own to shield itself.

**Parameters**

- `close` — `Function` — Called when the backdrop is genuinely clicked.

**Returns**

- `{onMouseDown: Function, onMouseUp: Function}` — Props to spread onto the backdrop element.

**Side effects**

- Allocates a ref on the calling component.

## UNREACHABLE (2)

### `useBackdropDismiss > onMouseDown(e)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Arm the dismissal only if the press landed on the backdrop itself.

**Parameters**

- `e` — `MouseEvent` — The press.

**Returns**

- `void`

**Mutates**

- the arming ref.

### `useBackdropDismiss > onMouseUp(e)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Dismiss, if this release and the press that began it were both on the backdrop.

**Parameters**

- `e` — `MouseEvent` — The release.

**Returns**

- `void`

**Mutates**

- the arming ref.

**Side effects**

- Calls `close` when both ends of the gesture were on the backdrop.
