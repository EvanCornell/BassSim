# Contract specification: `src/components/ContextMenu.jsx`

> Generated from method contracts. This file contains **no implementation code**.
> Write tests against what is claimed here, not against what you expect the code to do.

## Module

The right-click menu.

One component for every context in the app. The store records only *what*
was right-clicked — a node, an edge, the canvas background, a docked window,
one of its tabs — and this module decides what that target can do. Keeping
the menu's contents out of state is what lets an item's enabled or checked
state be correct at the moment it is drawn rather than at the moment the menu
opened.

Rows come from MenuItem.jsx, shared with the menu bar, so a command offered
in both places looks the same in both.

The browser's own menu is suppressed everywhere except in text fields, where
it is genuinely the better menu: spell-check suggestions and the system
clipboard are things this app cannot offer.

## Exported constants

Names this module publishes that are not methods. The method contracts
above and below refer to these by role — a command, a node type, a panel —
so this is the vocabulary they assume.

### `__internals`

Keys: `isTextField`, `offerable`

## EXPORTED (1)

### `ContextMenu()`

- **Reachability:** EXPORTED
- **Obtain via:** import { ContextMenu } from '../../src/components/ContextMenu.jsx'

The floating right-click menu.

Renders nothing until something opens it. While open it closes on Escape, on
any pointer press outside itself, and on a scroll or resize — all three being
ways the menu would otherwise end up pointing at something that has moved.

**Returns**

- `React.ReactElement|null` — The menu, or `null` when none is open.

**Side effects**

- Subscribes to the store, and registers window listeners for the suppression of the native menu and for dismissal.

## INTERNAL (2)

### `isTextField(el)`

- **Reachability:** INTERNAL
- **Obtain via:** import { __internals } from '../../src/components/ContextMenu.jsx'  →  __internals.isTextField

Whether an element takes typed input, and so keeps the browser's own menu.

The native menu is the better menu in a text field — it offers spell-check
corrections and the system clipboard, neither of which this app has — so it
is left alone there rather than replaced with something less useful.

**Parameters**

- `el` — `EventTarget|null` — The right-clicked element.

**Returns**

- `boolean` — True when the native menu should be left alone.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `offerable(ids, settings)`

- **Reachability:** INTERNAL
- **Obtain via:** import { __internals } from '../../src/components/ContextMenu.jsx'  →  __internals.offerable

Panels that may be offered as a new view, given the current settings.

Experimental panels are hidden rather than shown disabled: a panel gated
behind a setting the user has not turned on is not a thing they are meant to
be reaching for yet.

**Parameters**

- `ids` — `string[]` — Candidate panel ids.
- `settings` — `object` — Current sweep and feature settings.

**Returns**

- `string[]` — The offerable ids.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

## UNREACHABLE (25)

### `ContextMenu > suppress(e)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Take the browser's context menu away outside text fields.

**Parameters**

- `e` — `MouseEvent` — The contextmenu event.

**Returns**

- `void`

**Side effects**

- Prevents the event's default, which is what stops the native menu appearing.

### `ContextMenu > away(e)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Close the menu when the pointer goes down outside it.

**Parameters**

- `e` — `MouseEvent` — The pointerdown event.

**Returns**

- `void`

**Side effects**

- Closes the menu.

### `ContextMenu > esc(e)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Close the menu on Escape.

**Parameters**

- `e` — `KeyboardEvent` — The keydown event.

**Returns**

- `void`

**Side effects**

- Closes the menu.

### `ContextMenu > key(id)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

The display hint for a command's first binding.

Read live rather than baked in, so rebinding a command in Settings updates
the right-click menu too.

**Parameters**

- `id` — `string` — Command id.

**Returns**

- `string` — The formatted combo, or `''` when unbound.

**Reads external mutable state**

- the current bindings from the store.

### `ContextMenu > addViewItems()`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Submenu offering every view that could be added to the clicked window.

Panels already in this stack are left out — adding one where it already is
would be a no-op the user had to discover by trying it. Charts are nested
one level down, matching the View menu, because there are nine of them.

**Returns**

- `Array<object>` — Item descriptors for the Add View submenu.

**Reads external mutable state**

- the current layout and settings.

### `ContextMenu > addViewItems > row(id)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

One Add View row.

**Parameters**

- `id` — `string` — Panel id.

**Returns**

- `object` — An item descriptor that docks the panel into the clicked stack.

**Reads external mutable state**

- the clicked stack id.

### `ContextMenu > addViewItems > row > onClick()`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Add this view to the clicked window.

**Returns**

- `void`

**Side effects**

- Changes and persists the layout, and closes the menu.

### `ContextMenu > popoutItems(here, front)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

The items a popped-out browser tab offers about itself.

A popped-out tab has no dock, so none of the docking commands apply. What
it can do instead is switch which of its views is in front, spawn a
further tab, and hand its views back — which it does by closing, the same
path a user closing the tab by hand takes.

**Parameters**

- `here` — `string[]` — The panel ids this tab holds.
- `front` — `string` — The view currently showing.

**Returns**

- `Array<object>` — Item descriptors.

**Reads external mutable state**

- the current settings, to leave out views gated behind one.

### `ContextMenu > popoutItems > onClick()`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Bring this view to the front of the tab.

**Returns**

- `void`

**Side effects**

- Writes store state and closes the menu.

### `ContextMenu > popoutItems > onClick()`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Open a further browser tab showing this view.

**Returns**

- `void`

**Side effects**

- Opens a browser window and closes the menu.

### `ContextMenu > popoutItems > onClick()`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Close this tab, which hands its views back to the main window.

The handover is the tab's own closing announcement rather than
anything done here — the same path a user closing the tab by hand
takes, so there is only one way it can happen.

**Returns**

- `void`

**Side effects**

- Closes the browser tab.

### `ContextMenu > windowItems()`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

The items describing whichever window the click landed in.

A docked stack gets the docking commands; a popped-out tab gets its own
set; a maximized panel gets neither, since the stack it would name is not
what is on screen. One builder, so every target can end with "and whatever
this window can do" without caring which kind it is.

**Returns**

- `Array<object>` — Item descriptors, empty when the click belongs to no window.

**Reads external mutable state**

- the clicked stack, the current layout and the window's own URL.

### `ContextMenu > windowItems > onClick()`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Send the whole clicked window, tabs and all, to one browser tab.

**Returns**

- `void`

**Side effects**

- Opens a browser window, changes and persists the layout, and closes the menu.

### `ContextMenu > windowItems > onClick()`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Send this one view to its own browser tab.

**Returns**

- `void`

**Side effects**

- Opens a browser window, changes and persists the layout, and closes the menu.

### `ContextMenu > run(fn)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Run a store action and dismiss the menu.

Every command in this menu ends the same way, so the pairing is written
once rather than at each call site.

**Parameters**

- `fn` — `Function` — The action to run.

**Returns**

- `Function` — A click handler.

**Side effects**

- The returned handler runs the action and closes the menu.

### `ContextMenu > items()`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

The rows for whatever was right-clicked.

**Returns**

- `Array<object>` — Item descriptors, in display order.

**Reads external mutable state**

- the whole store — nearly every row's enabled or checked state depends on current state.

### `ContextMenu > items > onClick()`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Paste the clipboard where the menu was opened.

**Returns**

- `void`

**Side effects**

- Adds nodes, schedules a resimulation and closes the menu.

### `ContextMenu > items > onClick()`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Create this element where the menu was opened.

**Returns**

- `void`

**Side effects**

- Adds a node, schedules a resimulation and closes the menu.

### `ContextMenu > items > onClick()`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Remove the right-clicked edge.

**Returns**

- `void`

**Side effects**

- Changes the graph, schedules a resimulation and closes the menu.

### `ContextMenu > items > onClick()`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Send the right-clicked view to its own browser tab.

**Returns**

- `void`

**Side effects**

- Opens a browser window, changes and persists the layout, and closes the menu.

### `ContextMenu > items > onClick()`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Maximize the right-clicked view, or restore the layout.

**Returns**

- `void`

**Side effects**

- Changes the dock layout and closes the menu.

### `ContextMenu > items > onClick()`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Close the right-clicked view.

**Returns**

- `void`

**Side effects**

- Changes and persists the layout, and closes the menu.

### `ContextMenu > items > onClick()`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Close every other view in this window.

**Returns**

- `void`

**Side effects**

- Changes and persists the layout, and closes the menu.

### `ContextMenu > items > onClick()`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Maximize the window's front view, or restore the layout.

**Returns**

- `void`

**Side effects**

- Changes the dock layout and closes the menu.

### `ContextMenu > items > onClick()`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Restore the default workspace arrangement.

**Returns**

- `void`

**Side effects**

- Replaces and persists the layout, and closes the menu.
