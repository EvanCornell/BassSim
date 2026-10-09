# Contract specification: `src/components/MenuBar.jsx`

> Generated from method contracts. This file contains **no implementation code**.
> Write tests against what is claimed here, not against what you expect the code to do.

## Module

Application menu bar — the Eclipse/Windows pattern: a thin strip of menu
titles, each opening a dropdown of commands.

Behaviour matches native menu bars: click a title to open, then *hover* any
other title to switch to it without clicking again; Escape or a click
anywhere else closes. Items carry shortcut hints, check marks and submenus.

## EXPORTED (1)

### `MenuBar()`

- **Reachability:** EXPORTED
- **Obtain via:** import { MenuBar } from '../../src/components/MenuBar.jsx'

The application menu bar.

Follows the native pattern: click a title to open, then hover any other
title to switch without clicking again; Escape or a click anywhere else
closes.

Subscribes to the whole store rather than a slice — the menus read most
of it, and the enabled/checked state of nearly every item depends on
current state.

**Returns**

- `React.ReactElement` — The menu bar.

**Side effects**

- Subscribes to the store. Registers window mousedown and keydown listeners while a menu is open.

## UNREACHABLE (36)

### `Menu(props)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

One menu title with its dropdown.

`onHover` is what gives the bar its native feel: once any menu is open,
moving across a title switches to it without a second click.

**Parameters**

- `props` — `object` — Component props.
- `props.title` — `string` — Menu title.
- `props.items` — `Array<object>` — Dropdown items.
- `props.open` — `boolean` — Whether this dropdown is showing.
- `props.onOpen` — `Function` — Called when the title is clicked.
- `props.onHover` — `Function` — Called when the pointer enters the title.

**Returns**

- `React.ReactElement` — The menu.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `ProjectTitle()`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

The open project's name, centred in the bar, with a dot for the state of its result.

Green once the result is current, amber while a sweep is running, red
when the project cannot be simulated, grey when nothing is open.

**Returns**

- `React.ReactElement|null` — The title, or `null` when no project is open.

**Side effects**

- Subscribes to the store.

### `TimeDomainTab(props)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

The way into the time-domain workspace and back, on the menu bar beside Simulate.

A switch rather than a menu: it shows which of the two views is up, and
while a queued run solves it carries the run's progress and how many wait.

**Parameters**

- `props` — `object` — Component props.
- `props.onHover` — `Function` — Called when the pointer enters it, to close an open menu.

**Returns**

- `React.ReactElement` — The button.

**Side effects**

- Subscribes to the store; opens or closes the workspace.

### `MenuBar > key(id)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

The display hint for a command's first binding.

Read live rather than baked in, so rebinding a command in Settings
updates every menu that mentions it.

**Parameters**

- `id` — `string` — Command id.

**Returns**

- `string` — The formatted combo, or `''` when unbound.

**Reads external mutable state**

- the current bindings from the store.

### `MenuBar > panelItem(id)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Build the View-menu entry for one panel.

A popped-out panel is neither open in the dock nor closed, so it is shown
checked with an "in a tab" hint, and clicking it brings that tab to the
front rather than toggling the dock.

**Parameters**

- `id` — `string` — Panel id.

**Returns**

- `object` — A menu item descriptor.

**Reads external mutable state**

- the current layout, popped-out list and settings.

### `MenuBar > panelItem > onClick()`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Bring a popped-out panel's tab to the front, or toggle a docked one.

**Returns**

- `*` — Whatever the action returns; the menu ignores it.

**Side effects**

- Focuses a browser tab, or opens/closes the panel in the dock.

### `MenuBar > away(e)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Close the menu when the pointer goes down outside the bar.

**Parameters**

- `e` — `MouseEvent` — The mousedown event.

**Returns**

- `void`

**Side effects**

- Closes the open menu.

### `MenuBar > esc(e)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Close the menu on Escape.

**Parameters**

- `e` — `KeyboardEvent` — The keydown event.

**Returns**

- `void`

**Side effects**

- Closes the open menu.

### `MenuBar > onLoadFile(e)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Import a project from a chosen file.

The project is added to the workspace as a new file rather than dropped
onto the canvas: a project belonging to no file is the one thing that can
be edited and then lost.

A schema-version mismatch asks before loading rather than refusing —
older files usually still open, since every param falls back to its
default.

The input's value is cleared afterwards so choosing the same file twice
in a row fires a change event the second time.

**Parameters**

- `e` — `React.ChangeEvent` — The file input change event.

**Returns**

- `void`

**Side effects**

- Reads the file, may show a confirmation, adds a workspace file, and alerts on unparseable input.

### `MenuBar > onLoadFile > reader.onload()`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Parse the loaded file and add it to the workspace.

**Returns**

- `void`

**Side effects**

- Adds a workspace file and opens it, or alerts when the file is not valid project JSON.

### `MenuBar > onLoadWorkspace(e)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.
- **Async:** returns a Promise

Read a chosen workspace file and replace the current workspace with it.

Confirmed first, and pointedly: importing replaces every project in the
browser, and the copy being replaced may be the only one that exists.

**Parameters**

- `e` — `React.ChangeEvent` — The file input change event.

**Returns**

- `Promise<void>` — Resolves once the import has been attempted.

**Side effects**

- Reads the file, may show a confirmation, replaces the workspace, and alerts when the file is not one.

### `MenuBar > savePreset()`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Save the current window arrangement under a prompted name.

**Returns**

- `void`

**Side effects**

- Prompts for a name, then stores the preset. Does nothing if cancelled or blank.

### `MenuBar > onClick()`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Add an empty project to the workspace and open it.

**Returns**

- `*` — Whatever the action returns; the menu ignores it.

**Side effects**

- Creates a workspace file and replaces what is on the canvas.

### `MenuBar > onClick()`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Open the file picker to import a project.

**Returns**

- `*` — Whatever the action returns; the menu ignores it.

**Side effects**

- Clicks the hidden file input.

### `MenuBar > onClick()`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Download the whole workspace as one file.

**Returns**

- `*` — Whatever the action returns; the menu ignores it.

**Side effects**

- Triggers a browser download and records when it happened.

### `MenuBar > onClick()`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Open the file picker to replace the workspace.

**Returns**

- `*` — Whatever the action returns; the menu ignores it.

**Side effects**

- Clicks the hidden workspace file input.

### `MenuBar > onClick()`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Connect the workspace to a folder on disk, or disconnect it.

**Returns**

- `*` — Whatever the action returns; the menu ignores it.

**Side effects**

- Shows a picker or a confirmation, and writes to the user's filesystem.

### `MenuBar > onClick()`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Download every result series as a CSV.

**Returns**

- `*` — Whatever the action returns; the menu ignores it.

**Side effects**

- Triggers a browser download.

### `MenuBar > onClick()`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Download a PNG of the node canvas.

**Returns**

- `*` — Whatever the action returns; the menu ignores it.

**Side effects**

- Rasterizes the live canvas and triggers a browser download.

### `MenuBar > onClick()`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Download the circuit the sweep solves, every element drawn, as an SVG.

**Returns**

- `Promise<void>` — Resolves once the download has started, or once the failure has been shown.

**Side effects**

- Compiles the project, lays out the diagram and triggers a browser download; shows a dialog when it cannot.

### `MenuBar > onClick()`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Download a plain-text metrics summary.

**Returns**

- `*` — Whatever the action returns; the menu ignores it.

**Side effects**

- Triggers a browser download.

### `MenuBar > onClick()`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Pop the focused panel out into its own browser tab.

**Returns**

- `*` — Whatever the action returns; the menu ignores it.

**Side effects**

- Opens a browser window and removes the panel from the dock.

### `MenuBar > onClick()`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Pop this specific panel out into its own browser tab.

**Returns**

- `*` — Whatever the action returns; the menu ignores it.

**Side effects**

- Opens a browser window and removes the panel from the dock.

### `MenuBar > onClick()`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Maximize the focused panel, or restore the one already maximized.

**Returns**

- `*` — Whatever the action returns; the menu ignores it.

**Side effects**

- Changes the dock layout.

### `MenuBar > onClick()`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Restore the default workspace arrangement.

**Returns**

- `*` — Whatever the action returns; the menu ignores it.

**Side effects**

- Replaces and persists the layout.

### `MenuBar > onClick()`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Apply this saved arrangement.

**Returns**

- `*` — Whatever the action returns; the menu ignores it.

**Side effects**

- Replaces and persists the layout.

### `MenuBar > onClick()`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Delete this saved arrangement.

**Returns**

- `*` — Whatever the action returns; the menu ignores it.

**Side effects**

- Removes the preset and persists the change.

### `MenuBar > onClick()`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Toggle resonance masking, which lumps chambers to hide standing-wave artifacts.

**Returns**

- `*` — Whatever the action returns; the menu ignores it.

**Side effects**

- Changes a sweep setting, which triggers a resimulation.

### `MenuBar > onClick()`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Toggle phase unwrapping on the phase chart.

**Returns**

- `*` — Whatever the action returns; the menu ignores it.

**Side effects**

- Changes a display setting.

### `MenuBar > onClick()`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Discard every reference overlay.

**Returns**

- `*` — Whatever the action returns; the menu ignores it.

**Side effects**

- Clears the snapshot list, which redraws every chart.

### `MenuBar > onClick()`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Open the driver library browser.

**Returns**

- `*` — Whatever the action returns; the menu ignores it.

**Side effects**

- Shows a modal.

### `MenuBar > onClick()`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Open the Thiele/Small parameter solver.

**Returns**

- `*` — Whatever the action returns; the menu ignores it.

**Side effects**

- Shows a modal.

### `MenuBar > onClick()`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Open the time-domain workspace.

**Returns**

- `*` — Whatever the action returns; the menu ignores it.

**Side effects**

- Replaces the dock with the time-domain view.

### `MenuBar > onClick()`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Open the time-domain workspace at the driver curve editor.

**Returns**

- `*` — Whatever the action returns; the menu ignores it.

**Side effects**

- Replaces the dock with the time-domain view.

### `MenuBar > onClick()`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Open Settings at the keyboard section.

**Returns**

- `*` — Whatever the action returns; the menu ignores it.

**Side effects**

- Shows the settings window.

### `MenuBar > onClick()`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Show the about dialog.

**Returns**

- `*` — Whatever `alert` returns; the menu ignores it.

**Side effects**

- Shows a browser dialog.
