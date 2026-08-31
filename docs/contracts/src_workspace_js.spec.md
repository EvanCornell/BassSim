# Contract specification: `src/workspace.js`

> Generated from method contracts. This file contains **no implementation code**.
> Write tests against what is claimed here, not against what you expect the code to do.

## Module

The workspace model: a user's projects, folders and app data as one
self-contained, downloadable object.

A workspace is deliberately flat. Files are held in a map keyed by path
rather than in a nested tree, because every interesting operation — write,
rename, delete, "does this exist" — is a single map lookup on a path, while
the same operations on a tree are recursive walks that have to rebuild the
spine. The tree the file browser draws is *derived*, once, at render time.

Folders are implied by the paths of the files inside them, which means a
folder normally needs no record of its own. Empty folders are the exception:
a user who makes a folder and has not yet put anything in it would otherwise
watch it vanish, so those are listed explicitly and pruned as files arrive.

One folder is special. `.acousim` holds data the app itself tracks rather
than data the user authored — custom drivers today, more as features land.
It is created lazily and never eagerly: an imported workspace that predates
the folder, or one a user has trimmed by hand, stays exactly as imported
until something actually needs to write there. Creating it on import would
modify a workspace the user only meant to open.

Nothing here touches storage or the DOM. Persistence, downloading and the
current time all belong to the caller; these are value-to-value functions so
that "what does renaming a folder do" can be answered without a browser.

## Exported constants

Names this module publishes that are not methods. The method contracts
above and below refer to these by role — a command, a node type, a panel —
so this is the vocabulary they assume.

### `WORKSPACE_VERSION`

Version stamp written into every workspace this build produces.

Read on import to decide whether a workspace needs migrating. Bumped only
when the shape changes in a way an older build could not read.

Value: `1`

### `SYSTEM_FOLDER`

The folder holding app-tracked data rather than user-authored files.

Dot-prefixed by the same convention as `.git` and `.vscode`: it is the
workspace's own bookkeeping, shown in the browser but visibly not a project.

Value: `".acousim"`

### `DRIVERS_PATH`

Path of the custom driver library inside the system folder.

Drivers the user saves appear both in the driver database and here as a
file, because they are workspace data like any other and travel with a
downloaded workspace.

### `PROJECT_EXT`

Filename extension for a project file inside a workspace.

Value: `".acousim"`

### `DEFAULT_WORKSPACE_NAME`

Name given to the workspace a first-time user lands in.

Value: `"workspace"`

### `DEFAULT_PROJECT_NAME`

Name given to the project a first-time user lands in.

Value: `"project"`

### `STALE_DOWNLOAD_MS`

How long a downloaded workspace can go unsaved before it is worth a warning.

Browser storage is not a filing cabinet: clearing site data, a private
window, or an eviction under storage pressure all take it without asking.
A week is long enough not to nag someone mid-session and short enough that
the loss, if it comes, is a week of work rather than a year of it.

## EXPORTED (26)

### `normalizePath(path)`

- **Reachability:** EXPORTED
- **Obtain via:** import { normalizePath } from '../../src/workspace.js'

Clean a path, or reject it.

Collapses repeated and trailing separators and trims each segment, so the
paths a user types by hand normalize to the same key as the ones the app
builds. Traversal segments are rejected outright rather than resolved: a
workspace has no parent to escape to, so `..` can only be a mistake or an
attack in an imported file.

**Parameters**

- `path` — `string` — A candidate path, `/`-separated.

**Returns**

- `string|null` — The normalized path, or `null` when it is empty, absolute, or contains an illegal segment.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `baseName(path)`

- **Reachability:** EXPORTED
- **Obtain via:** import { baseName } from '../../src/workspace.js'

The last segment of a path.

**Parameters**

- `path` — `string` — A normalized path.

**Returns**

- `string` — The file or folder name, without its parent folders.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `parentOf(path)`

- **Reachability:** EXPORTED
- **Obtain via:** import { parentOf } from '../../src/workspace.js'

The folder containing a path.

**Parameters**

- `path` — `string` — A normalized path.

**Returns**

- `string` — The parent folder's path, or the empty string for a top-level entry.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `joinPath(folder, name)`

- **Reachability:** EXPORTED
- **Obtain via:** import { joinPath } from '../../src/workspace.js'

Join a folder and a name into a path.

**Parameters**

- `folder` — `string` — Parent folder path; the empty string means the workspace root.
- `name` — `string` — Entry name.

**Returns**

- `string` — The combined path.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `isSystemPath(path)`

- **Reachability:** EXPORTED
- **Obtain via:** import { isSystemPath } from '../../src/workspace.js'

Whether a path lives in the workspace's own system folder.

The browser uses this to hold back the operations that would leave the app
looking for a file the user has moved.

**Parameters**

- `path` — `string` — A normalized path.

**Returns**

- `boolean` — True for the system folder itself and everything under it.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `isUnder(folder, path)`

- **Reachability:** EXPORTED
- **Obtain via:** import { isUnder } from '../../src/workspace.js'

Whether one path is the other or sits underneath it.

The prefix is compared segment-wise, so `models` does not contain
`models-old` — a plain `startsWith` would move the wrong folder on rename.

**Parameters**

- `folder` — `string` — The candidate ancestor path.
- `path` — `string` — The path being tested.

**Returns**

- `boolean` — True when `path` is `folder` or lies inside it.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `uniqueName(ws, folder, name)`

- **Reachability:** EXPORTED
- **Obtain via:** import { uniqueName } from '../../src/workspace.js'

A name not already taken in a folder.

Appends ` 2`, ` 3` and so on before the extension, which is what a user
expects a duplicate to be called and keeps the file type intact.

**Parameters**

- `ws` — `object` — The workspace.
- `folder` — `string` — Folder to place the entry in; the empty string means the root.
- `name` — `string` — Desired name, extension included.

**Returns**

- `string` — `name` if it is free, otherwise the first numbered variant that is.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `newWorkspace(name, projectName)`

- **Reachability:** EXPORTED
- **Obtain via:** import { newWorkspace } from '../../src/workspace.js'

An empty workspace holding one empty project.

A workspace with nothing in it would give a first-time user a file browser
and nowhere to work, so the default project exists from the start. The
system folder deliberately does not — nothing has asked to write there yet.

**Parameters**

- `name` — `string` _(optional)_ — Workspace name; defaults to the standard first-run name.
- `projectName` — `string` _(optional)_ — Name of the project file created inside it.

**Returns**

- `object` — A new workspace.

**Side effects**

- Reads the current time for the creation and modification stamps.

### `touch(ws)`

- **Reachability:** EXPORTED
- **Obtain via:** import { touch } from '../../src/workspace.js'

A copy of a workspace with a fresh modification stamp.

Every mutation below ends here, so "when did this workspace last change" is
answered in one place rather than by each operation remembering to say so.

**Parameters**

- `ws` — `object` — The workspace.

**Returns**

- `object` — A shallow copy with `modified` set to now.

**Side effects**

- Reads the current time.

### `hasEntry(ws, path)`

- **Reachability:** EXPORTED
- **Obtain via:** import { hasEntry } from '../../src/workspace.js'

Whether a workspace holds a file or folder at a path.

Folders count whether they are explicitly listed or merely implied by the
files inside them, so a new entry can never collide with an existing one.

**Parameters**

- `ws` — `object` — The workspace.
- `path` — `string` — A normalized path.

**Returns**

- `boolean` — True when something already occupies the path.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `listFolders(ws)`

- **Reachability:** EXPORTED
- **Obtain via:** import { listFolders } from '../../src/workspace.js'

Every folder in a workspace.

Union of the explicitly recorded folders and every ancestor of every file,
because a file at `boxes/ported/a.acousim` implies two folders that no one
ever created by hand.

**Parameters**

- `ws` — `object` — The workspace.

**Returns**

- `string[]` — Folder paths, sorted.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `listProjects(ws)`

- **Reachability:** EXPORTED
- **Obtain via:** import { listProjects } from '../../src/workspace.js'

Every project file in a workspace.

**Parameters**

- `ws` — `object` — The workspace.

**Returns**

- `string[]` — Paths of the project files, sorted.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `buildTree(ws)`

- **Reachability:** EXPORTED
- **Obtain via:** import { buildTree } from '../../src/workspace.js'

The workspace as a nested tree, ready to render.

Folders sort ahead of files and each group sorts by name, which is the order
every file browser a user has met puts them in. The system folder is sorted
last regardless, since it is app bookkeeping and should not sit above the
user's own work.

**Parameters**

- `ws` — `object` — The workspace.

**Returns**

- `Array<object>` — The root's children: folder nodes with their own `children`, and file nodes carrying the stored entry.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `writeFile(ws, path, entry)`

- **Reachability:** EXPORTED
- **Obtain via:** import { writeFile } from '../../src/workspace.js'

Write a file into a workspace, creating it or replacing what is there.

Any folder the path implies comes into existence with the file, so a caller
never has to create the parents first.

**Parameters**

- `ws` — `object` — The workspace.
- `path` — `string` — A normalized path.
- `entry` — `object` — The file record: at least `kind` and `data`.

**Returns**

- `object` — A new workspace with the file written.

**Side effects**

- Reads the current time for the file's and the workspace's modification stamps.

### `addFolder(ws, path)`

- **Reachability:** EXPORTED
- **Obtain via:** import { addFolder } from '../../src/workspace.js'

Create an empty folder.

Recorded explicitly, because until a file lands in it there is nothing to
imply its existence.

**Parameters**

- `ws` — `object` — The workspace.
- `path` — `string` — A normalized folder path.

**Returns**

- `object` — A new workspace with the folder, unchanged if something already occupies the path.

**Side effects**

- Reads the current time for the modification stamp.

### `deleteEntry(ws, path)`

- **Reachability:** EXPORTED
- **Obtain via:** import { deleteEntry } from '../../src/workspace.js'

Remove a file, or a folder and everything inside it.

**Parameters**

- `ws` — `object` — The workspace.
- `path` — `string` — A normalized path.

**Returns**

- `object` — A new workspace without the entry.

**Side effects**

- Reads the current time for the modification stamp.

### `renameEntry(ws, from, to)`

- **Reachability:** EXPORTED
- **Obtain via:** import { renameEntry } from '../../src/workspace.js'

Move or rename a file or folder.

A folder brings its contents with it: every path underneath is rewritten by
prefix, which is why the tree is derived rather than stored — there is no
spine to fix up.

Moving a folder into itself is refused. Nothing else would go wrong
mechanically, but the result would be a folder that has vanished from the
workspace, which is indistinguishable from a bug.

**Parameters**

- `ws` — `object` — The workspace.
- `from` — `string` — Existing normalized path.
- `to` — `string` — New normalized path.

**Returns**

- `object` — A new workspace with the entry moved, or the original when the move is a no-op, the destination is taken, or the move is into itself.

**Side effects**

- Reads the current time for the modification stamp.

### `hasSystemFolder(ws)`

- **Reachability:** EXPORTED
- **Obtain via:** import { hasSystemFolder } from '../../src/workspace.js'

Whether the workspace's system folder is present.

**Parameters**

- `ws` — `object` — The workspace.

**Returns**

- `boolean` — True when the folder exists, explicitly or by implication.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `ensureSystemFolder(ws)`

- **Reachability:** EXPORTED
- **Obtain via:** import { ensureSystemFolder } from '../../src/workspace.js'

Make sure the system folder and its driver library exist.

Called from the write paths only. An imported workspace that arrives without
the folder — because it predates it, or because the user pruned it — is left
exactly as it came until something genuinely needs to store app data, at
which point the folder appears with the write that needed it.

**Parameters**

- `ws` — `object` — The workspace.

**Returns**

- `object` — A workspace whose system folder exists, unchanged when it already did.

**Side effects**

- Reads the current time when a file has to be created.

### `readDrivers(ws)`

- **Reachability:** EXPORTED
- **Obtain via:** import { readDrivers } from '../../src/workspace.js'

The workspace's custom driver entries.

**Parameters**

- `ws` — `object` — The workspace.

**Returns**

- `Array<object>` — The saved drivers, empty when the system folder has never been written.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `writeDrivers(ws, drivers)`

- **Reachability:** EXPORTED
- **Obtain via:** import { writeDrivers } from '../../src/workspace.js'

Replace the workspace's custom driver entries.

This is a modification, so it is one of the moments the system folder is
created if it is missing.

**Parameters**

- `ws` — `object` — The workspace.
- `drivers` — `Array<object>` — The full driver list to store.

**Returns**

- `object` — A new workspace holding the drivers.

**Side effects**

- Reads the current time for the modification stamps.

### `serializeWorkspace(ws)`

- **Reachability:** EXPORTED
- **Obtain via:** import { serializeWorkspace } from '../../src/workspace.js'

A workspace serialized for download.

**Parameters**

- `ws` — `object` — The workspace.

**Returns**

- `string` — Formatted JSON, indented so a downloaded workspace is readable and diffable.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `workspaceFilename(ws)`

- **Reachability:** EXPORTED
- **Obtain via:** import { workspaceFilename } from '../../src/workspace.js'

Suggested filename for a downloaded workspace.

**Parameters**

- `ws` — `object` — The workspace.

**Returns**

- `string` — The filename, including its extension.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `parseWorkspace(text)`

- **Reachability:** EXPORTED
- **Obtain via:** import { parseWorkspace } from '../../src/workspace.js'

Read a downloaded workspace back.

Imported data is not trusted: it may come from an older build, a hand-edited
file, or something that is not a workspace at all. Every field is checked
and anything unusable is dropped rather than allowed to reach the store,
where a malformed path or a non-object file entry would surface later as an
unexplained crash in the file browser.

The system folder is not added here. Import must reproduce what was in the
file — creating a folder the user did not download would make a round trip
lossy in the one direction that is supposed to be exact.

**Parameters**

- `text` — `string` — The file's contents.

**Returns**

- `{ok: boolean, workspace?: object, error?: string}` — The parsed workspace, or the reason it was rejected.

**Side effects**

- Reads the current time to stamp a workspace whose own stamps are missing or unusable.

### `timeAgo(iso, now)`

- **Reachability:** EXPORTED
- **Obtain via:** import { timeAgo } from '../../src/workspace.js'

A human phrase for how long ago something happened.

Coarse on purpose — the exact minute is never the point, and "3 days ago"
carries the only fact that matters, which is roughly how much work is at
risk.

**Parameters**

- `iso` — `string|null` — An ISO timestamp, or `null` when the event has never happened.
- `now` — `number` — Current time in milliseconds, passed in so the phrase is testable.

**Returns**

- `string` — The phrase, or `'never'` for a missing or unparseable stamp.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `isDownloadStale(ws, now)`

- **Reachability:** EXPORTED
- **Obtain via:** import { isDownloadStale } from '../../src/workspace.js'

Whether a workspace has gone too long without being downloaded.

A workspace that has never been downloaded counts as stale from the moment
it was created, since that is exactly the case where nothing outside the
browser holds a copy.

**Parameters**

- `ws` — `object` — The workspace.
- `now` — `number` — Current time in milliseconds.

**Returns**

- `boolean` — True when the last download — or, failing that, the workspace's creation — is older than the staleness window.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

## UNREACHABLE (2)

### `buildTree > build(folder)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Order one folder's contents and recurse into the folders it holds.

**Parameters**

- `folder` — `string` — Folder path; the empty string is the root.

**Returns**

- `Array<object>` — The folder's children, sorted, with folder nodes filled in.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `renameEntry > moved(p)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Rewrite one path for the move, leaving unrelated paths alone.

**Parameters**

- `p` — `string` — A path in the workspace.

**Returns**

- `string` — The path after the move.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.
