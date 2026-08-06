# Contract specification: `src/components/ProjectManager.jsx`

> Generated from method contracts. This file contains **no implementation code**.
> Write tests against what is claimed here, not against what you expect the code to do.

## EXPORTED (1)

### `ProjectManager()`

- **Reachability:** EXPORTED
- **Obtain via:** import { ProjectManager } from '../../src/components/ProjectManager.jsx'

Browse, load, rename, duplicate and delete auto-saved projects.

Projects are read straight from LocalStorage on each render rather than
held in state, so the list reflects edits made in another tab.

**Returns**

- `React.ReactElement|null` — The modal, or `null` when hidden.

**Side effects**

- Subscribes to the store. Reads LocalStorage on every render.

## UNREACHABLE (5)

### `Thumb(props)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

An inline SVG preview of a project's node graph.

Scales the graph's bounding box to fit a fixed 90×54 thumbnail, using the
smaller of the two axis scales so the layout keeps its proportions.
Enough to recognise a saved project by shape without opening it.

**Parameters**

- `props` — `object` — Component props.
- `props.proj` — `object` — The serialized project to preview.

**Returns**

- `React.ReactElement` — The thumbnail, blank for a project with no nodes.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `ProjectManager > refresh()`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Force a re-read of the saved project list after a change.

The projects live in LocalStorage rather than in state, so nothing else
would tell React that they changed.

**Returns**

- `void`

**Side effects**

- Bumps a counter to trigger a re-render.

### `ProjectManager > rename(p)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Rename a saved project, moving it to its new key.

**Parameters**

- `p` — `object` — The saved project entry.

**Returns**

- `void`

**Side effects**

- Prompts for a name, then writes the new LocalStorage key and removes the old one. Does nothing if cancelled or unchanged.

### `ProjectManager > duplicate(p)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Copy a saved project under a "copy" name.

**Parameters**

- `p` — `object` — The saved project entry.

**Returns**

- `void`

**Side effects**

- Writes a new LocalStorage key with a fresh modification time. Silently overwrites an existing copy of the same name.

### `ProjectManager > remove(p)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Delete a saved project after confirming.

**Parameters**

- `p` — `object` — The saved project entry.

**Returns**

- `void`

**Side effects**

- Shows a confirmation dialog, then removes the LocalStorage key. Does nothing if declined.
