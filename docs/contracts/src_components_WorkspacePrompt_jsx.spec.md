# Contract specification: `src/components/WorkspacePrompt.jsx`

> Generated from method contracts. This file contains **no implementation code**.
> Write tests against what is claimed here, not against what you expect the code to do.

## Module

The question asked before anything else: where does this workspace live?

Browser storage is not a filing cabinet — clearing site data takes it, a
private window never had it, and an eviction under storage pressure happens
without asking. A user who learns that after building six enclosures has
learned it too late. So it is said once, at the front, while there is
nothing to lose.

The other answer is a folder on the user's own computer, where the projects
are ordinary files in their own backups and their own version control. It is
offered first where the browser supports it, and shown as unavailable rather
than hidden where it does not — a user on Safari should find out that the
option exists and what would give it to them.

## EXPORTED (1)

### `WorkspacePrompt()`

- **Reachability:** EXPORTED
- **Obtain via:** import { WorkspacePrompt } from '../../src/components/WorkspacePrompt.jsx'

The startup workspace-location prompt.

Skipping and choosing browser storage do the same thing, deliberately: the
prompt is informative rather than gating, and a user who wants to get on
with it should not be made to read first. Both are recorded, so the question
is asked once rather than on every visit.

**Returns**

- `React.ReactElement|null` — The modal, or `null` once the question has been answered.

**Side effects**

- Subscribes to the store; the buttons write LocalStorage, and choosing a folder opens a picker and writes to disk.

## UNREACHABLE (2)

### `WorkspacePrompt > choose()`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Record the choice and dismiss the prompt.

**Returns**

- `void`

**Side effects**

- Writes store state and LocalStorage.

### `WorkspacePrompt > chooseFolder()`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.
- **Async:** returns a Promise

Pick a folder to keep the workspace in.

A folder that already holds a workspace is opened instead — the prompt is
the first thing a returning user on a new machine sees, and pointing it at
their synced folder should bring their work back, not overwrite it.

**Returns**

- `Promise<void>` — Resolves once the folder is connected or the picker is dismissed.

**Side effects**

- Shows a folder picker and a confirmation, writes to the user's filesystem, and writes store state.
