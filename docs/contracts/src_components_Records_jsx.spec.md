# Contract specification: `src/components/Records.jsx`

> Generated from method contracts. This file contains **no implementation code**.
> Write tests against what is claimed here, not against what you expect the code to do.

## Module

Records: the bar that steps through a project's save states, and the lock
that keeps an earlier record from being edited by accident.

The last record is always editable. Selecting any earlier one makes the
project read-only — every field that edits it is disabled — until its Edit
button is pressed; the lock returns when another record is selected.

## EXPORTED (3)

### `RecordsBar()`

- **Reachability:** EXPORTED
- **Obtain via:** import { RecordsBar } from '../../src/components/Records.jsx'

The records bar: previous and next, the record number, Add, Delete and Edit.

**Returns**

- `React.ReactElement` — The bar.

**Side effects**

- Subscribes to the store.

### `LockNote()`

- **Reachability:** EXPORTED
- **Obtain via:** import { LockNote } from '../../src/components/Records.jsx'

The note an editing panel shows while the project is read-only.

**Returns**

- `React.ReactElement|null` — The note, or nothing when the project can be edited.

**Side effects**

- Subscribes to the store.

### `readOnlyWhenLocked(Panel)`

- **Reachability:** EXPORTED
- **Obtain via:** import { readOnlyWhenLocked } from '../../src/components/Records.jsx'

Wrap an editing panel so every field in it is disabled while the project is read-only.

A disabled fieldset disables every input, select and button inside it at
once, so a panel needs no change of its own; its section headers, which
are not form controls, still open and close.

**Parameters**

- `Panel` — `Function` — The panel component.

**Returns**

- `Function` — The wrapped component.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

## UNREACHABLE (1)

### `readOnlyWhenLocked > Locked(props)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

The panel, disabled while the project is read-only.

**Parameters**

- `props` — `object` — Passed to the panel.

**Returns**

- `React.ReactElement` — The panel.

**Side effects**

- Subscribes to the store.
