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

There is no merging. The records are a numbered list; the project's own
content is the working copy of the selected one, written into it when
another record is selected, added or the list is changed. Each record also
has an id that stays with it while its commit changes, so a time-domain run
can say which record it came from.

A time-domain run is a branch: a commit whose parent is the record it was
run from and whose tree holds the project exactly as it was run, beside the
run's results. The record can go on changing; the run keeps its own state,
and that state can be restored as a new record.

Nothing here touches the store or the DOM: each function takes the records
and returns new ones.

## EXPORTED (16)

### `newId(prefix)`

- **Reachability:** EXPORTED
- **Obtain via:** import { newId } from '../../src/records.js'

A fresh id for a record or a run.

**Parameters**

- `prefix` — `string` — `r` for a record, `run` for a run.

**Returns**

- `string` — e.g. `r-k3j9x2`.

**Side effects**

- Reads the random number generator and the clock.

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

- `{list: string[], ids: string[], selected: number, objects: Object<string, string>, runs: Array<object>, names: Object<string, string>}|null` — The records, or `null`; `names` maps record ids to the names they were given.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `recordName(records, index)`

- **Reachability:** EXPORTED
- **Obtain via:** import { recordName } from '../../src/records.js'

A record's name: the one it was given, else its number.

**Parameters**

- `records` — `object|null` — The project's records.
- `index` — `number` — The record.

**Returns**

- `string` — e.g. `Sealed 40 L`, or `3`.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `renameRecord(records, index, name)`

- **Reachability:** EXPORTED
- **Obtain via:** import { renameRecord } from '../../src/records.js'

Name a record, or clear its name so it goes by its number again.

**Parameters**

- `records` — `object` — The project's records.
- `index` — `number` — The record.
- `name` — `string` — Its name; empty clears it.

**Returns**

- `object` — The records.

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

### `branchPoint(records, project, now)`

- **Reachability:** EXPORTED
- **Obtain via:** import { branchPoint } from '../../src/records.js'
- **Async:** returns a Promise

The record a run branches from: the selected one, saved with the project first.

Called when a run is queued, so the branch point is the record as it was
then, whatever is edited while the run waits.

**Parameters**

- `records` — `object|null` — The project's records; `null` starts them.
- `project` — `object` — The serialized project.
- `now` — `number` _(optional)_ — The time, ms since the epoch.

**Returns**

- `Promise<{records: object, parent: string, recordId: string, content: object}>` — The records, the record's commit, its id, and the content a run of it holds.

**Side effects**

- Loads the library.

### `addRun(records, run, now)`

- **Reachability:** EXPORTED
- **Obtain via:** import { addRun } from '../../src/records.js'
- **Async:** returns a Promise

Store a finished run as a branch off its record.

The commit's tree holds the project as it was run and the run's results;
its parent is the record commit the run was queued from, or, when that has
since been replaced by a later save, the record's commit now.

**Parameters**

- `records` — `object` — The project's records.
- `run` — `object` — The run.
- `run.id` — `string` — Its id.
- `run.parent` — `string` _(optional)_ — The record commit it was queued from.
- `run.recordId` — `string` _(optional)_ — The id of the record it was queued from.
- `run.content` — `object` — The project content it ran.
- `run.data` — `object` — Its settings and results, as `run.json` holds them.
- `run.meta` — `object` _(optional)_ — What the run list shows of it: title, kind, figures.
- `now` — `number` _(optional)_ — The time, ms since the epoch.

**Returns**

- `Promise<object>` — The records, the run at the end of `runs`.

**Side effects**

- Loads the library.

### `readRun(records, oid)`

- **Reachability:** EXPORTED
- **Obtain via:** import { readRun } from '../../src/records.js'
- **Async:** returns a Promise

Read a run's project and results.

**Parameters**

- `records` — `object` — The records holding the run.
- `oid` — `string` — The run's commit.

**Returns**

- `Promise<{content: object, data: object}>` — The project as it was run, and `run.json`.

**Throws**

- `Error` — When the run is missing or unreadable.

**Side effects**

- Loads the library.

### `deleteRuns(records, ids)`

- **Reachability:** EXPORTED
- **Obtain via:** import { deleteRuns } from '../../src/records.js'
- **Async:** returns a Promise

Delete runs, dropping whatever only they reached.

**Parameters**

- `records` — `object` — The project's records.
- `ids` — `string[]` — The runs.

**Returns**

- `Promise<object>` — The records.

**Side effects**

- Loads the library.

### `addRecordFrom(records, project, content, now)`

- **Reachability:** EXPORTED
- **Obtain via:** import { addRecordFrom } from '../../src/records.js'
- **Async:** returns a Promise

Add a record at the end holding given content — a run's project — and select it.

The selected record is saved with the working copy first, as when adding
any record.

**Parameters**

- `records` — `object|null` — The project's records.
- `project` — `object` — The serialized project, the selected record's working copy.
- `content` — `object` — The new record's content.
- `now` — `number` _(optional)_ — The time, ms since the epoch.

**Returns**

- `Promise<object>` — The records, the new one selected.

**Side effects**

- Loads the library.

## UNREACHABLE (21)

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

### `collect(repo, list, runs)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.
- **Async:** returns a Promise

Drop every object no record or run reaches.

**Parameters**

- `repo` — `object` — From `memoryRepo`.
- `list` — `string[]` — The records.
- `runs` — `Array<{oid: string}>` _(optional)_ — The runs, whose commits, trees and parent records are kept too.

**Returns**

- `Promise<void>` — Resolves once done.

**Side effects**

- Loads the library; removes objects from the repository.

### `addRun > blobOf(value)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Write a JSON file's blob.

**Parameters**

- `value` — `object` — The content.

**Returns**

- `Promise<string>` — The blob's hash.

**Side effects**

- Writes the repository.

### `addRun > has(oid)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Whether the repository holds an object.

**Parameters**

- `oid` — `string` _(optional)_ — Its hash.

**Returns**

- `boolean` — True when present.

**Reads external mutable state**

- the repository's files.
