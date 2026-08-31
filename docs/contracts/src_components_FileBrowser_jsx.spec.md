# Contract specification: `src/components/FileBrowser.jsx`

> Generated from method contracts. This file contains **no implementation code**.
> Write tests against what is claimed here, not against what you expect the code to do.

## Module

The workspace explorer, modelled on the VS Code and Eclipse file navigators.

The conventions those two share are the ones a user arrives already knowing,
so they are followed rather than reinvented: a compact indented tree with
twisties and indent guides, single click to select and open, arrow keys to
walk it, F2 to rename in place, Delete to remove, Ctrl+X/C/V to move and
copy, drag onto a folder to move, and a right-click menu that is the same
set of commands again.

Renaming and creating happen *in the tree*, not in a dialog. That is the
detail that most makes a file navigator feel like one: the row turns into a
text box where it sits, the extension is left out of the initial selection
so typing replaces only the name, and a bad name is reported under the box
without throwing the edit away.

The tree is derived from the workspace on every render — see src/workspace.js
for why the model is flat. Selection, expansion, the inline editor and the
file clipboard live in the store rather than here, because the right-click
menu is a separate component that has to read and drive all four.

## EXPORTED (1)

### `FileBrowser()`

- **Reachability:** EXPORTED
- **Obtain via:** import { FileBrowser } from '../../src/components/FileBrowser.jsx'

The workspace explorer panel.

**Returns**

- `React.ReactElement` — The panel.

**Side effects**

- Subscribes to the store. Its commands rename, move, copy and delete workspace entries, trigger downloads, and read imported files.

## UNREACHABLE (19)

### `Chevron(props)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

The twisty drawn beside a folder.

**Parameters**

- `props` — `object` — Component props.
- `props.open` — `boolean` — Whether the folder is expanded.

**Returns**

- `React.ReactElement` — The chevron.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `RowIcon(props)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

The icon drawn beside a row.

Folders get an open or closed folder; files get a page tinted by what they
hold, so a project and the driver library are told apart at a glance rather
than by reading.

**Parameters**

- `props` — `object` — Component props.
- `props.kind` — `string` — `'folder'` for a folder, otherwise the file entry's kind.
- `props.open` — `boolean` — Whether an expanded folder is being drawn.

**Returns**

- `React.ReactElement` — The icon.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `flatten(nodes, collapsed, depth)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

The visible rows of the tree, in display order.

Flattened rather than rendered recursively because every other behaviour
here is a question about the *visible* list: which row the down arrow moves
to, which rows a shift-click spans, where the indent guides run. A recursive
render would answer none of those without re-deriving this anyway.

**Parameters**

- `nodes` — `Array<object>` — Tree nodes from `buildTree`.
- `collapsed` — `string[]` — Paths of the collapsed folders.
- `depth` — `number` _(optional)_ — Nesting depth of `nodes`, used by the recursion.

**Returns**

- `Array<object>` — Row descriptors, each carrying its node, depth and expanded state.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `NameEditor(props)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

The text box a row becomes while it is being named.

Seeded with the current name and, for a file, with only the stem selected —
the convention every file manager follows, since the extension is almost
never the part being changed. Enter commits, Escape abandons, and clicking
away commits, which is what a user who has typed a name and moved on
expects.

**Parameters**

- `props` — `object` — Component props.
- `props.value` — `string` — Initial name.
- `props.error` — `string|null` — Message to show under the box, or `null`.
- `props.onCommit` — `(name: string) => void` — Called with the typed name.
- `props.onCancel` — `() => void` — Called when the edit is abandoned.

**Returns**

- `React.ReactElement` — The input, with any error beneath it.

**Side effects**

- Focuses itself on mount and selects the part of the name worth replacing.

### `FileBrowser > select(path, e)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Select a row, honouring the modifier keys.

Ctrl or Cmd toggles one row in or out; Shift extends from the anchor
across the visible list, which is why the flattened rows are what is
spanned rather than the tree.

**Parameters**

- `path` — `string` — The clicked row's path.
- `e` — `React.MouseEvent` — The click, read for its modifier keys.

**Returns**

- `void`

**Side effects**

- Writes store state.

### `FileBrowser > activate(node)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Act on a row: open a project, or expand a folder.

**Parameters**

- `node` — `object` — The row's tree node.

**Returns**

- `void`

**Side effects**

- Writes store state; opening a project replaces what is on the canvas.

### `FileBrowser > targetFolder()`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

The folder a new entry or a paste belongs in, given what is selected.

A selected folder takes the entry; a selected file puts it beside itself.
Both match what every file manager does with New File while something is
highlighted.

**Returns**

- `string` — A folder path, or the empty string for the root.

**Reads external mutable state**

- The current selection and the workspace.

### `FileBrowser > deleteSelection()`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Delete what is selected, after one confirmation covering all of it.

**Returns**

- `void`

**Side effects**

- Shows a confirmation dialog, then writes store state. Does nothing if declined.

### `FileBrowser > commitEdit(name)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Finish an inline edit.

A refusal keeps the box open with the reason under it, because the user is
looking straight at the thing that needs correcting.

**Parameters**

- `name` — `string` — The typed name.

**Returns**

- `void`

**Side effects**

- Writes store state and persists the workspace on success; writes component state on failure.

### `FileBrowser > cancelEdit()`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Abandon an inline edit.

**Returns**

- `void`

**Side effects**

- Writes store and component state.

### `FileBrowser > onKeyDown(e)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Handle a key pressed while the tree has focus.

Every key handled here is stopped from bubbling, so the workspace-wide
shortcuts do not also fire — Delete in the explorer must not delete the
selected *nodes* on the canvas.

**Parameters**

- `e` — `React.KeyboardEvent` — The keydown event.

**Returns**

- `void`

**Side effects**

- Writes store state; may open, rename or delete workspace entries.

### `FileBrowser > onKeyDown > moveTo(next)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Move the selection to a row by index, if it exists.

**Parameters**

- `next` — `number` — Index into the visible rows.

**Returns**

- `void`

**Side effects**

- Writes store state.

### `FileBrowser > onContextMenu(e, node)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Raise the explorer's right-click menu.

Right-clicking outside the current selection moves the selection to the
clicked row first, so the menu always describes what it is pointing at.
Right-clicking inside a multi-row selection leaves it alone, which is the
behaviour that makes "delete these six" possible.

**Parameters**

- `e` — `React.MouseEvent` — The contextmenu event.
- `node` — `object|null` — The row's tree node, or `null` for the blank area below the tree.

**Returns**

- `void`

**Side effects**

- Writes store state and opens the context menu.

### `FileBrowser > onDragOver(e, folder)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Accept a dragged row over a drop target.

**Parameters**

- `e` — `React.DragEvent` — The dragover event.
- `folder` — `string|null` — The folder under the pointer; `null` marks the root area.

**Returns**

- `void`

**Side effects**

- Prevents the default so the drop is allowed, and writes component state.

### `FileBrowser > onDrop(e, folder)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Move the dragged row into the folder it was dropped on.

**Parameters**

- `e` — `React.DragEvent` — The drop event.
- `folder` — `string` — Destination folder; the empty string means the root.

**Returns**

- `void`

**Side effects**

- Writes store state and persists the workspace.

### `FileBrowser > onImportFile(e)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Read a chosen workspace file and load it.

Confirmed first: importing replaces every project in the browser, and the
copy being replaced may be the only one that exists.

**Parameters**

- `e` — `React.ChangeEvent` — The file input's change event.

**Returns**

- `void`

**Side effects**

- Shows a confirmation, reads the chosen file, replaces the workspace on success, and clears the input so choosing the same file twice still fires.

### `FileBrowser > onImportFile > reader.onload()`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Hand the file's text to the store and report a rejection in the panel.

**Returns**

- `void`

**Side effects**

- Replaces the workspace on success; writes component state either way.

### `FileBrowser > onImportFile > reader.onerror()`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Report a file that could not be read at all.

**Returns**

- `void`

**Side effects**

- Writes component state.

### `FileBrowser > renderRow(row)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Draw one row of the tree.

**Parameters**

- `row` — `object` — A row descriptor from `flatten`.

**Returns**

- `React.ReactElement` — The row.

**Reads external mutable state**

- Selection, the inline editor, the clipboard and the active file.
