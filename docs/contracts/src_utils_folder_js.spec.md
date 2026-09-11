# Contract specification: `src/utils/folder.js`

> Generated from method contracts. This file contains **no implementation code**.
> Write tests against what is claimed here, not against what you expect the code to do.

## Module

Keeping a workspace in a real folder on the user's computer.

Browser storage is not a filing cabinet: clearing site data takes it, a
private window never had it, and an eviction under storage pressure happens
without asking. The File System Access API is the way out of that — the user
points at a folder once, and from then on their projects are ordinary files
on their own disk, in their own backups, in their own git repository.

The folder is authoritative. When one is connected, what is on disk is the
workspace: it is read on startup and every change is written back. Browser
storage keeps mirroring alongside it, but only as a fallback for the session
where permission has lapsed and the folder cannot be read.

What is written is exactly what a downloaded archive unzips to — the same
entries, from the same `workspaceToEntries`. A workspace zipped from the
browser and a workspace synced to a folder are the same tree, so one can be
unzipped over the other and neither format has to be maintained twice.

Two rules keep this from ever being destructive. Deletions are confined to
files this app previously wrote or read there, so a folder that also holds
the user's notes, a README or a `.git` keeps them. And a folder is only
removed when it is already empty — a directory the app no longer knows about
but that still has something in it stays exactly where it is.

The handle survives a reload in IndexedDB, which is the only store that can
hold one. Permission does not survive with it: the browser re-asks on the
next visit, and that ask needs a user gesture, so a resumed session may come
back locked and waiting for a click rather than connected.

## EXPORTED (11)

### `supportsFolders()`

- **Reachability:** EXPORTED
- **Obtain via:** import { supportsFolders } from '../../src/utils/folder.js'

Whether this browser can keep a workspace in a folder.

Chromium-based browsers can; Safari and Firefox have the pickers but not
the persistent read-write handles this needs, so they are told the option
does not exist rather than being offered one that fails at the second step.

**Returns**

- `boolean` — True when the File System Access API is usable here.

**Side effects**

- Reads the global `window`.

### `diskContents(ws)`

- **Reachability:** EXPORTED
- **Obtain via:** import { diskContents } from '../../src/utils/folder.js'

The files a workspace should have on disk, as text.

The same entries a download produces, so a synced folder and an unzipped
archive are byte-for-byte the same tree.

**Parameters**

- `ws` — `object` — The workspace.

**Returns**

- `{files: Map<string, string>, folders: string[]}` — Each file's contents by path, and every folder the workspace has.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `planSync(ws, previous, prune)`

- **Reachability:** EXPORTED
- **Obtain via:** import { planSync } from '../../src/utils/folder.js'

What has to happen on disk to bring a folder up to date.

Only files whose text actually changed are rewritten, which matters more
than it looks: a workspace commits on every simulation, and rewriting forty
unchanged projects each time would churn the user's filesystem, their
backups and their git history.

Deletions are drawn from `previous` rather than from the folder, so this can
only ever remove a file the app itself put there. Anything else in the
folder is invisible to it.

`prune` off removes even that: nothing is deleted, only written. That is the
setting for the first write after a folder is connected, where "the
workspace does not have this file" does not yet mean the user got rid of it
— it can equally mean this browser has never heard of it. A folder only ever
loses a file to a deletion the user made while it was connected.

**Parameters**

- `ws` — `object` — The workspace to write.
- `previous` — `{files: Map<string, string>, folders: string[]}` — What the app last saw on disk.
- `prune` — `boolean` _(optional)_ — Whether files and folders the workspace no longer has may be removed.

**Returns**

- `{writes: Array<{path: string, data: string}>, deletes: string[], folders: string[], gone: string[], next: {files: Map<string, string>, folders: string[]}}` — The files to write, the files and folders to remove, the folders to create, and the state to record once it is done.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `rememberFolder(handle)`

- **Reachability:** EXPORTED
- **Obtain via:** import { rememberFolder } from '../../src/utils/folder.js'
- **Async:** returns a Promise

Remember the folder a workspace lives in, so the next visit can resume it.

A directory handle is not serializable but is structured-cloneable, which is
why this is IndexedDB and not LocalStorage.

**Parameters**

- `handle` — `FileSystemDirectoryHandle` — The chosen folder.

**Returns**

- `Promise<boolean>` — True when it was stored; false when this browser refused.

**Side effects**

- Writes IndexedDB.

### `recallFolder()`

- **Reachability:** EXPORTED
- **Obtain via:** import { recallFolder } from '../../src/utils/folder.js'
- **Async:** returns a Promise

The folder remembered from a previous visit.

**Returns**

- `Promise<FileSystemDirectoryHandle|null>` — The handle, or `null` when none was stored or it could not be read.

**Side effects**

- Reads IndexedDB.

### `forgetFolder()`

- **Reachability:** EXPORTED
- **Obtain via:** import { forgetFolder } from '../../src/utils/folder.js'
- **Async:** returns a Promise

Forget the remembered folder.

**Returns**

- `Promise<void>` — Resolves once it is gone, or immediately when it could not be removed.

**Side effects**

- Writes IndexedDB.

### `folderPermission(handle, ask)`

- **Reachability:** EXPORTED
- **Obtain via:** import { folderPermission } from '../../src/utils/folder.js'
- **Async:** returns a Promise

Whether the app may still read and write a remembered folder.

Permission is not remembered with the handle: the browser re-asks on a new
visit, and the ask has to come from a user gesture. So the resumed case
distinguishes `'granted'` — carry on silently — from `'prompt'`, which means
the folder is there but a click is needed before it can be touched.

**Parameters**

- `handle` — `FileSystemDirectoryHandle` — The folder.
- `ask` — `boolean` _(optional)_ — Whether to raise the browser's permission prompt; only valid from a user gesture.

**Returns**

- `Promise<string>` — `'granted'`, `'prompt'` or `'denied'`.

**Side effects**

- Queries the browser's permission store, and may show a permission prompt.

### `pickFolder()`

- **Reachability:** EXPORTED
- **Obtain via:** import { pickFolder } from '../../src/utils/folder.js'
- **Async:** returns a Promise

Ask the user to choose a folder for their workspace.

**Returns**

- `Promise<FileSystemDirectoryHandle|null>` — The chosen folder, or `null` when the picker was dismissed.

**Side effects**

- Shows the browser's folder picker.

### `readFolderEntries(handle, prefix, budget)`

- **Reachability:** EXPORTED
- **Obtain via:** import { readFolderEntries } from '../../src/utils/folder.js'
- **Async:** returns a Promise

Walk a folder into archive entries.

Recursive, and deliberately indiscriminate: whatever is in the folder is
offered to the importer, which keeps what parses as JSON and skips the rest.
That is what lets a user keep a README beside their projects without either
file troubling the other.

**Parameters**

- `handle` — `FileSystemDirectoryHandle` — The folder to read.
- `prefix` — `string` _(optional)_ — Path of this folder within the workspace; empty at the top.
- `budget` — `{n: number}` _(optional)_ — Shared entry budget, so the cap covers the whole walk rather than each folder.

**Returns**

- `Promise<Array<{path: string, data: Uint8Array|null, folder: boolean}>>` — Entries for `entriesToWorkspace`.

**Side effects**

- Reads the user's filesystem.

### `readFolderWorkspace(handle)`

- **Reachability:** EXPORTED
- **Obtain via:** import { readFolderWorkspace } from '../../src/utils/folder.js'
- **Async:** returns a Promise

Read a folder as a workspace.

The folder's own name becomes the workspace name when the folder holds no
metadata of ours — which is what makes pointing at a plain directory of
project files work.

**Parameters**

- `handle` — `FileSystemDirectoryHandle` — The folder to read.

**Returns**

- `Promise<{ok: boolean, workspace?: object, previous?: {files: Map<string, string>, folders: string[]}, empty?: boolean, error?: string, skipped?: string[]}>` — The workspace and the on-disk state to sync against, or why it could not be read. `empty` marks a folder with nothing of ours in it.

**Side effects**

- Reads the user's filesystem.

### `applyPlan(root, plan)`

- **Reachability:** EXPORTED
- **Obtain via:** import { applyPlan } from '../../src/utils/folder.js'
- **Async:** returns a Promise

Carry out a sync plan against a folder.

Each step is attempted independently: one file the user has open in another
program and locked should cost that file, not the other thirty-nine. What
failed comes back so the caller can say so rather than reporting a clean
save.

**Parameters**

- `root` — `FileSystemDirectoryHandle` — The workspace folder.
- `plan` — `{writes: Array<{path: string, data: string}>, deletes: string[], folders: string[], gone: string[]}` — The plan from `planSync`.

**Returns**

- `Promise<{written: number, failed: string[]}>` — How many files were written, and the paths that could not be.

**Side effects**

- Creates, overwrites and removes files and directories on the user's filesystem.

## UNREACHABLE (9)

### `openDb()`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Open the handle database, creating its store on first use.

**Returns**

- `Promise<IDBDatabase>` — The open database.

**Side effects**

- Opens IndexedDB, creating the database and its object store if they do not exist.

### `openDb > req.onupgradeneeded()`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Create the handle store the first time this database is opened.

**Returns**

- `void`

**Side effects**

- Creates the object store.

### `openDb > req.onsuccess()`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Hand back the open database.

**Returns**

- `void`

**Side effects**

- Settles the enclosing promise.

### `openDb > req.onerror()`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Report that the database could not be opened.

**Returns**

- `void`

**Side effects**

- Rejects the enclosing promise.

### `withStore(mode, run)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.
- **Async:** returns a Promise

Run one transaction against the handle store and close the database.

**Parameters**

- `mode` — `string` — `'readonly'` or `'readwrite'`.
- `run` — `Function` — Given the object store, issues the request and returns it.

**Returns**

- `Promise<*>` — The request's result, or `null` when it produced none.

**Side effects**

- Reads or writes IndexedDB.

### `withStore > tx.oncomplete()`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Hand back the request's result once the transaction has committed.

Waiting for the transaction rather than the request is what makes a
write durable before the caller is told it happened.

**Returns**

- `void`

**Side effects**

- Settles the enclosing promise.

### `withStore > tx.onerror()`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Report a failed transaction.

**Returns**

- `void`

**Side effects**

- Rejects the enclosing promise.

### `withStore > tx.onabort()`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Report an aborted transaction.

**Returns**

- `void`

**Side effects**

- Rejects the enclosing promise.

### `dirFor(root, path, create)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.
- **Async:** returns a Promise

Walk to a folder inside another, creating the levels on the way.

**Parameters**

- `root` — `FileSystemDirectoryHandle` — The workspace folder.
- `path` — `string` — A `/`-separated folder path; empty means the root itself.
- `create` — `boolean` _(optional)_ — Whether to create levels that do not exist.

**Returns**

- `Promise<FileSystemDirectoryHandle|null>` — The folder, or `null` when a level is missing and `create` is false.

**Side effects**

- May create directories on the user's filesystem.
