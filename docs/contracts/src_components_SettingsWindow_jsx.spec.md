# Contract specification: `src/components/SettingsWindow.jsx`

> Generated from method contracts. This file contains **no implementation code**.
> Write tests against what is claimed here, not against what you expect the code to do.

## EXPORTED (1)

### `SettingsWindow()`

- **Reachability:** EXPORTED
- **Obtain via:** import { SettingsWindow } from '../../src/components/SettingsWindow.jsx'

The settings window: a floating, draggable panel rather than a dock panel.

Deliberately not a panel — settings are modal to the whole workspace, and
docking them would let the user tile settings beside the thing they are
configuring and lose track of which is which.

Re-centres each time it opens, so a window dragged off to one side is not
lost the next time it is needed.

**Returns**

- `React.ReactElement|null` — The window, or `null` when hidden.

**Side effects**

- Subscribes to the store. Registers a window keydown listener for Escape while open.

## UNREACHABLE (10)

### `ApplicationSection()`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

The Application section: engine, sweep range and display options.

**Returns**

- `React.ReactElement` — The section.

**Side effects**

- Subscribes to the store.

### `QuickBarSection()`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

The Quick bar section: choose and reorder the items in the quick bar.

**Returns**

- `React.ReactElement` — The section.

**Side effects**

- Subscribes to the store.

### `ComboChip(props)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

One shortcut chip: click to re-record it, or use its ✕ to drop it.

**Parameters**

- `props` — `object` — Component props.
- `props.combo` — `string` — The combo to display.
- `props.onRemove` — `Function` — Called when the ✕ is clicked.
- `props.onClick` — `Function` — Called when the chip itself is clicked.

**Returns**

- `React.ReactElement` — The chip.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `KeyboardSection()`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

The Keyboard section: view and rebind every command's shortcuts.

While recording, a capture-phase listener swallows every key, so the
shortcut being captured cannot also fire the command it is bound to —
without that, recording Ctrl+N over "New project" would start a new
project. Escape cancels.

Assigning a combo already in use takes it from the other command and says
so, rather than silently leaving two commands on one key.

**Returns**

- `React.ReactElement` — The section.

**Side effects**

- Subscribes to the store. Registers a capture-phase window keydown listener while recording.

### `KeyboardSection > onKey(e)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Capture the next keypress as the shortcut being recorded.

**Parameters**

- `e` — `KeyboardEvent` — The keydown event.

**Returns**

- `void`

**Side effects**

- Swallows the key, then writes and persists the new binding. Escape cancels without changing anything.

### `KeyboardSection > isDefault(id)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Whether a command still carries exactly its default bindings.

**Parameters**

- `id` — `string` — Command id.

**Returns**

- `boolean` — True when the bindings match the defaults in both content and order.

**Reads external mutable state**

- the current bindings from the store.

### `SettingsWindow > esc(e)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Close the window on Escape.

**Parameters**

- `e` — `KeyboardEvent` — The keydown event.

**Returns**

- `void`

**Side effects**

- Closes the settings window.

### `SettingsWindow > onTitleDown(e)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Begin dragging the window by its title bar.

Clicks on the close button are ignored, so closing does not start a drag.

**Parameters**

- `e` — `React.MouseEvent` — The mousedown event.

**Returns**

- `void`

**Side effects**

- Registers window mousemove and mouseup listeners.

### `SettingsWindow > onTitleDown > move(ev)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Apply the in-progress window drag.

**Parameters**

- `ev` — `MouseEvent` — The mousemove event.

**Returns**

- `void`

**Side effects**

- Updates the window offset on every move.

### `SettingsWindow > onTitleDown > up()`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

End the window drag and remove its listeners.

**Returns**

- `void`

**Side effects**

- Removes the window listeners.
