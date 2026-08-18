# Contract specification: `src/components/MenuItem.jsx`

> Generated from method contracts. This file contains **no implementation code**.
> Write tests against what is claimed here, not against what you expect the code to do.

## Module

The dropdown row, shared by the menu bar and the right-click menu.

One implementation rather than two so the two menus cannot drift: a command
offered in both places gets the same check mark, the same shortcut hint and
the same disabled styling without anyone having to keep a copy in step.

An item descriptor is plain data — `{label, hint, onClick, disabled,
checked, danger, submenu}` — which is what lets a menu be built by whoever
knows the context and rendered by code that knows nothing about it.

A submenu keeps itself on screen the same way the right-click menu does:
drawn where it would naturally go, measured, then nudged back inside the
window. Guessing from the parent's position is not enough — a submenu is
as tall as its own contents, so whether it fits is a question only it can
answer.

## EXPORTED (2)

### `Item(props)`

- **Reachability:** EXPORTED
- **Obtain via:** import { Item } from '../../src/components/MenuItem.jsx'

One dropdown row: a command, a separator, or a submenu parent.

A label of `-` renders a separator instead of an item. Clicking a submenu
parent is swallowed rather than treated as a command, since the submenu
opens on hover and a click there means "I am on my way to the child".

**Parameters**

- `props` — `object` — Component props.
- `props.label` — `string` — Display text, or `-` for a separator.
- `props.hint` — `string` _(optional)_ — Shortcut hint shown on the right.
- `props.onClick` — `Function` _(optional)_ — Command to run.
- `props.disabled` — `boolean` _(optional)_ — Render inert.
- `props.checked` — `boolean` _(optional)_ — Show a check mark.
- `props.danger` — `boolean` _(optional)_ — Style as destructive.
- `props.submenu` — `Array<object>` _(optional)_ — Child items; makes this a submenu parent.
- `props.submenuSide` — `'right'|'left'` _(optional, default `'right'`)_ — Which way to try opening a submenu first. Only a starting guess: the submenu measures itself and flips if it does not fit.

**Returns**

- `React.ReactElement` — The menu row.

**Side effects**

- Reads live element geometry while a submenu is open, to keep it inside the window.

### `ItemList(props)`

- **Reachability:** EXPORTED
- **Obtain via:** import { ItemList } from '../../src/components/MenuItem.jsx'

A list of dropdown rows.

Separators repeat their label, so they are keyed by position; everything
else is keyed by label, which is unique within one menu.

**Parameters**

- `props` — `object` — Component props.
- `props.items` — `Array<object>` — Item descriptors, in display order.
- `props.submenuSide` — `'right'|'left'` _(optional, default `'right'`)_ — Which way submenus open.

**Returns**

- `React.ReactElement[]` — The rendered rows.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.
