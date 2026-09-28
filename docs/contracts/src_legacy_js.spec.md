# Contract specification: `src/legacy.js`

> Generated from method contracts. This file contains **no implementation code**.
> Write tests against what is claimed here, not against what you expect the code to do.

## Module

Data saved under the app's former name, AcouSim, carried over to SpeakerSpice.

Everything that knows the old name is here, so a build that no longer needs
to read it can drop this module and the few calls into it.

## Exported constants

Names this module publishes that are not methods. The method contracts
above and below refer to these by role — a command, a node type, a panel —
so this is the vocabulary they assume.

### `LEGACY_SYSTEM_FOLDER`

The system folder's former name inside a workspace.

Value: `".acousim"`

### `LEGACY_PROJECT_EXT`

A project file's former extension inside a workspace.

Value: `".acousim"`

### `LEGACY_DB_NAME`

The IndexedDB database that used to hold a connected folder's handle.

Value: `"acousim"`

## EXPORTED (3)

### `migrateStorage(storage)`

- **Reachability:** EXPORTED
- **Obtain via:** import { migrateStorage } from '../../src/legacy.js'

Move every browser-storage key from the old prefix to the new one.

A key already present under the new name is kept, and the old one dropped.
Each value is removed before it is written again, so a workspace near the
storage quota is never held twice; if the write fails the old key is put
back, and nothing is lost.

**Parameters**

- `storage` — `Storage` _(optional)_ — The storage; `localStorage` by default.

**Returns**

- `number` — How many keys were moved.

**Side effects**

- Rewrites keys in the storage.

### `modernPath(path, systemFolder, projectExt)`

- **Reachability:** EXPORTED
- **Obtain via:** import { modernPath } from '../../src/legacy.js'

A workspace path under the current names.

The system folder and anything in it move to the new folder name; a
project file takes the new extension. Every other path is unchanged.

**Parameters**

- `path` — `string` — A workspace path.
- `systemFolder` — `string` — The system folder's current name.
- `projectExt` — `string` — A project file's current extension.

**Returns**

- `string` — The path under the current names.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `stripLegacySuffix(name)`

- **Reachability:** EXPORTED
- **Obtain via:** import { stripLegacySuffix } from '../../src/legacy.js'

A filename without the project or workspace suffix it had under the app's former name.

**Parameters**

- `name` — `string` — A filename, e.g. `box.acousim.json` or `workspace.acousim`.

**Returns**

- `string` — The name without that suffix; unchanged when it has none.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.
