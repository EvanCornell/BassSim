# Contract specification: `src/components/FileBrowser.jsx`

> Generated from method contracts. This file contains **no implementation code**.
> Write tests against what is claimed here, not against what you expect the code to do.

## Module

The workspace panel: what used to be the node palette's dock slot.

A workspace holds projects, the folders a user sorts them into, and the app
data under `.acousim` — custom drivers today. It lives in the browser, which
is convenient and not durable: clearing site data takes it, a private window
never had it, and storage pressure can evict it without asking. So the panel
leads with how long it has been since a copy left the browser, and the
download button sits beside that sentence rather than buried in a menu.

Everything here is browser-side. There is no account, no server and nothing
uploaded; a workspace leaves as a file the user can read and comes back the
same way.

## EXPORTED (1)

### `FileBrowser()`

- **Reachability:** EXPORTED
- **Obtain via:** import { FileBrowser } from '../../src/components/FileBrowser.jsx'

The workspace file browser.

Opening a project switches the canvas to it, saving the outgoing one first.
Renaming a project file renames the project inside it, so the two never
disagree. `.acousim` is shown rather than hidden — a user who can see where
their custom drivers live is not surprised when those drivers travel with a
downloaded workspace — but it cannot be renamed, since the app finds its
contents by path.

**Returns**

- `React.ReactElement` — The panel.

**Side effects**

- Subscribes to the store. The buttons prompt, confirm, read files and trigger downloads.

## UNREACHABLE (11)

### `kindLabel(entry)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Label for one file's kind, shown beside its name.

**Parameters**

- `entry` — `object` — The stored file record.

**Returns**

- `string` — A short description of what the file holds.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `FreshnessBox(props)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

How long a workspace has gone without leaving the browser.

Deliberately the first thing in the panel. Every other file manager a user
has met is backed by a disk that remembers; this one is backed by storage
the browser may reclaim, and the only honest response is to keep saying so.

**Parameters**

- `props` — `object` — Component props.
- `props.workspace` — `object` — The workspace being described.
- `props.onDownload` — `() => void` — Called when the user asks for a download.
- `props.onImport` — `() => void` — Called when the user asks to import one.

**Returns**

- `React.ReactElement` — The freshness box.

**Side effects**

- Reads the current time to phrase the interval.

### `Row(props)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

One row of the workspace tree, and — for a folder — everything beneath it.

Recursive rather than flattened, because indentation and collapsing are both
questions about depth and a flat list would have to re-derive it per row.

**Parameters**

- `props` — `object` — Component props.
- `props.node` — `object` — A node from `buildTree`.
- `props.depth` — `number` — Nesting depth, driving the indent.
- `props.ctl` — `object` — Callbacks and state shared by every row: `activeFile`, `collapsed`, `toggle`, `open`, `rename`, `remove`, `addTo`.

**Returns**

- `React.ReactElement` — The row, with its children when it is an expanded folder.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `FileBrowser > toggle(path)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Expand or collapse a folder.

**Parameters**

- `path` — `string` — The folder's path.

**Returns**

- `void`

**Side effects**

- Writes component state.

### `FileBrowser > rename(path)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Ask for a new name and apply it.

The prompt is seeded with the current name so a small correction is a
small edit, and the result is placed back in the same folder — this is a
rename, not a move.

**Parameters**

- `path` — `string` — Path of the entry to rename.

**Returns**

- `void`

**Side effects**

- Shows a prompt, then writes store state. Reports a refused rename in the panel.

### `FileBrowser > remove(path)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Delete an entry after confirming.

A folder names how much is going with it, since the number is the whole
difference between a routine delete and a costly one.

**Parameters**

- `path` — `string` — Path of the entry to delete.

**Returns**

- `void`

**Side effects**

- Shows a confirmation dialog, then writes store state. Does nothing if declined.

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

### `FileBrowser > open(path)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Open a project file on the canvas.

**Parameters**

- `path` — `string` — Path of the file to open.

**Returns**

- `void`

**Side effects**

- Writes store state, replacing what is on the canvas.

### `FileBrowser > addTo(folder)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Create a project inside a folder.

**Parameters**

- `folder` — `string` — The folder's path.

**Returns**

- `void`

**Side effects**

- Writes store state, replacing what is on the canvas.
