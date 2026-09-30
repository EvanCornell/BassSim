# Contract specification: `src/records.js`

> Generated from method contracts. This file contains **no implementation code**.
> Write tests against what is claimed here, not against what you expect the code to do.

## Module

Records: numbered save states of one project, kept in the project file.

Each record is a git commit — made and read by isomorphic-git — whose tree
holds the project as one file. Git's object store is content-addressed:
every object is named by the hash of what it holds, so records that share
a design share its objects, and a record saved twice unchanged is stored
once. The objects travel inside the project file, deflated as git keeps
them, so a project's records go wherever the project goes.

There is no branching or merging. The records are a numbered list; the
project's own content is the working copy of the selected one, written
into it when another record is selected, added or the list is changed.

Nothing here touches the store or the DOM: each function takes the records
and returns new ones.

## EXPORTED (8)

### `recordContent(project)`

- **Reachability:** EXPORTED
- **Obtain via:** import { recordContent } from '../../src/records.js'

A project's content as a record holds it: everything but its name, save stamp and records.

**Parameters**

- `project` — `object` — A serialized project.

**Returns**

- `object` — The content.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `readRecords(raw)`

- **Reachability:** EXPORTED
- **Obtain via:** import { readRecords } from '../../src/records.js'

The records a project file carries, checked; none when it carries none or they are unusable.

**Parameters**

- `raw` — `*` — The file's `records` field.

**Returns**

- `{list: string[], selected: number, objects: Object<string, string>}|null` — The records, or `null`.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `readRecord(records, index)`

- **Reachability:** EXPORTED
- **Obtain via:** import { readRecord } from '../../src/records.js'
- **Async:** returns a Promise

Read a record's content.

**Parameters**

- `records` — `object` — The project's records.
- `index` — `number` — Which record.

**Returns**

- `Promise<object>` — The content it holds.

**Throws**

- `Error` — When the record is missing or unreadable.

**Side effects**

- Loads the library.

### `recordTimes(records)`

- **Reachability:** EXPORTED
- **Obtain via:** import { recordTimes } from '../../src/records.js'
- **Async:** returns a Promise

When each record was last saved.

**Parameters**

- `records` — `object` — The project's records.

**Returns**

- `Promise<number[]>` — Ms since the epoch, per record.

**Side effects**

- Loads the library.

### `saveRecord(records, project, now)`

- **Reachability:** EXPORTED
- **Obtain via:** import { saveRecord } from '../../src/records.js'
- **Async:** returns a Promise

Save content into the selected record, or start the records with it.

A record saved unchanged keeps its commit — content-addressed, the
content's hash already says so — and so its time.

**Parameters**

- `records` — `object|null` — The project's records; `null` for a project that has none yet.
- `project` — `object` — The serialized project; its content is saved.
- `now` — `number` _(optional)_ — The time, ms since the epoch.

**Returns**

- `Promise<object>` — The records.

**Side effects**

- Loads the library.

### `addRecord(records, project, now)`

- **Reachability:** EXPORTED
- **Obtain via:** import { addRecord } from '../../src/records.js'
- **Async:** returns a Promise

Add a record at the end, from the selected one, and select it.

The selected record is saved first, with the project's content, and the
new one starts as a copy of it.

**Parameters**

- `records` — `object|null` — The project's records.
- `project` — `object` — The serialized project.
- `now` — `number` _(optional)_ — The time, ms since the epoch.

**Returns**

- `Promise<object>` — The records, the new one selected.

**Side effects**

- Loads the library.

### `deleteRecord(records)`

- **Reachability:** EXPORTED
- **Obtain via:** import { deleteRecord } from '../../src/records.js'
- **Async:** returns a Promise

Delete the selected record, selecting the one before it (or the new first).

**Parameters**

- `records` — `object` — The project's records.

**Returns**

- `Promise<object>` — The records.

**Throws**

- `Error` — When it is the only record.

**Side effects**

- Loads the library.

### `selectRecord(records, project, index, now)`

- **Reachability:** EXPORTED
- **Obtain via:** import { selectRecord } from '../../src/records.js'
- **Async:** returns a Promise

Select another record, saving the selected one first.

**Parameters**

- `records` — `object|null` — The project's records.
- `project` — `object` — The serialized project, the selected record's working copy.
- `index` — `number` — The record to select.
- `now` — `number` _(optional)_ — The time, ms since the epoch.

**Returns**

- `Promise<{records: object, content: object}>` — The records, and the content of the one now selected.

**Throws**

- `Error` — When there is no such record.

**Side effects**

- Loads the library.

## UNREACHABLE (19)

### `git()`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.
- **Async:** returns a Promise

The version-control library, loaded on first use.

**Returns**

- `Promise<object>` — isomorphic-git.

**Side effects**

- Loads the library the first time.

### `fsError(code, path)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

An error as Node's filesystem raises it, which is how isomorphic-git tells a missing file.

**Parameters**

- `code` — `string` — `ENOENT` and the like.
- `path` — `string` — The path.

**Returns**

- `Error` — The error.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `statOf(file, size)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

A stat result, as isomorphic-git reads one.

**Parameters**

- `file` — `boolean` — A file; otherwise a directory.
- `size` — `number` — Its size, bytes.

**Returns**

- `object` — The stat.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `memoryRepo(objects)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

A filesystem in memory holding a repository's objects, as isomorphic-git reads and writes them.

Only loose objects are ever written — the repository is never packed — so
the object's path names its hash, and the files are exactly the objects.

**Parameters**

- `objects` — `Object<string, string>` — Each object's deflated bytes, base64, by hash.

**Returns**

- `{fs: object, objects: Map<string, Uint8Array>}` — The filesystem, and the object map it reads and writes.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `memoryRepo > isDir(path)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Whether a path is a directory: some file lies beneath it.

**Parameters**

- `path` — `string` — The path.

**Returns**

- `boolean` — True when it holds a file.

**Reads external mutable state**

- the files.

### `memoryRepo > stat(path)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.
- **Async:** returns a Promise

A stat result.

**Parameters**

- `path` — `string` — The path.

**Returns**

- `object` — What isomorphic-git reads of a stat.

**Throws**

- `Error` — ENOENT when nothing is there.

**Reads external mutable state**

- the files.

### `memoryRepo > readFile(path, opts)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.
- **Async:** returns a Promise

Read a file.

**Parameters**

- `path` — `string` — The path.
- `opts` — `object|string` _(optional)_ — `{encoding: 'utf8'}` for text.

**Returns**

- `Promise<Uint8Array|string>` — Its contents.

**Throws**

- `Error` — ENOENT when it does not exist.

**Reads external mutable state**

- the files.

### `memoryRepo > writeFile(path, data)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.
- **Async:** returns a Promise

Write a file.

**Parameters**

- `path` — `string` — The path.
- `data` — `Uint8Array|string` — The contents.

**Returns**

- `Promise<void>` — Resolves once written.

**Mutates**

- the files.

### `memoryRepo > unlink(path)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.
- **Async:** returns a Promise

Remove a file.

**Parameters**

- `path` — `string` — The path.

**Returns**

- `Promise<void>` — Resolves once removed.

**Mutates**

- the files.

### `memoryRepo > readdir(path)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.
- **Async:** returns a Promise

List a directory.

**Parameters**

- `path` — `string` — The path.

**Returns**

- `Promise<string[]>` — The names directly inside it.

**Throws**

- `Error` — ENOENT when it holds nothing.

**Reads external mutable state**

- the files.

### `memoryRepo > mkdir()`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.
- **Async:** returns a Promise

Make a directory; directories exist implicitly here.

**Returns**

- `Promise<void>` — Resolves at once.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `memoryRepo > rmdir()`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.
- **Async:** returns a Promise

Remove a directory; directories exist implicitly here.

**Returns**

- `Promise<void>` — Resolves at once.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `memoryRepo > readlink(path)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.
- **Async:** returns a Promise

Read a symbolic link; there are none.

**Parameters**

- `path` — `string` — The path.

**Returns**

- `Promise<never>` — Always rejects.

**Throws**

- `Error` — ENOENT.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `memoryRepo > symlink(target, path)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.
- **Async:** returns a Promise

Make a symbolic link; not supported.

**Parameters**

- `target` — `string` — The target.
- `path` — `string` — The path.

**Returns**

- `Promise<never>` — Always rejects.

**Throws**

- `Error` — ENOTSUP.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `memoryRepo > chmod()`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.
- **Async:** returns a Promise

Change a file's mode; modes are not kept.

**Returns**

- `Promise<void>` — Resolves at once.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `objectsOf(files)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

The objects of an in-memory repository, as the project file keeps them.

**Parameters**

- `files` — `Map<string, Uint8Array>` — The repository's files.

**Returns**

- `Object<string, string>` — Each object's deflated bytes, base64, by hash.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `writeRecord(repo, content, now)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.
- **Async:** returns a Promise

Write content as a record: its blob, a tree holding it, and a commit of that tree.

**Parameters**

- `repo` — `object` — From `memoryRepo`.
- `content` — `object` — The record's content.
- `now` — `number` — The time, ms since the epoch.

**Returns**

- `Promise<string>` — The commit's hash.

**Side effects**

- Loads the library; writes the repository.

### `recordParts(repo, oid)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.
- **Async:** returns a Promise

The hash of the project file inside a record.

**Parameters**

- `repo` — `object` — From `memoryRepo`.
- `oid` — `string` — The record's commit.

**Returns**

- `Promise<{tree: string, blob: string, time: number}>` — Its tree, its file's blob, and when it was saved, ms since the epoch.

**Side effects**

- Loads the library.

### `collect(repo, list)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.
- **Async:** returns a Promise

Drop every object no record reaches.

**Parameters**

- `repo` — `object` — From `memoryRepo`.
- `list` — `string[]` — The records.

**Returns**

- `Promise<void>` — Resolves once done.

**Side effects**

- Loads the library; removes objects from the repository.
