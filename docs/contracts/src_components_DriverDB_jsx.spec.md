# Contract specification: `src/components/DriverDB.jsx`

> Generated from method contracts. This file contains **no implementation code**.
> Write tests against what is claimed here, not against what you expect the code to do.

## EXPORTED (1)

### `DriverDB()`

- **Reachability:** EXPORTED
- **Obtain via:** import { DriverDB } from '../../src/components/DriverDB.jsx'

The driver library browser.

Filters by brand, search text, and Fs/Vas/Xmax thresholds. Clicking a row
applies it to the selected Driver node, or creates one if there is none.

Custom entries are listed ahead of the built-ins so the user's own
drivers are easy to find, and only they can be deleted.

The ⚠ marks a row whose published Q or Vas figures contradict the
Bl/Re/Mms/Cms the solver actually runs on — the simulation follows the
latter, so the headline Qts may not be what you get.

**Returns**

- `React.ReactElement|null` — The modal, or `null` when hidden.

**Side effects**

- Subscribes to the store and reads LocalStorage for custom entries.

## INTERNAL (1)

### `loadCustom()`

- **Reachability:** INTERNAL
- **Obtain via:** import { __internals } from '../../src/components/DriverDB.jsx'  →  __internals.loadCustom

Load the user's saved custom drivers.

**Returns**

- `Array<object>` — Custom driver records, or an empty list when absent or corrupt.

**Side effects**

- Reads LocalStorage.

## UNREACHABLE (5)

### `ExtDetail(props)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

The expanded extended-parameter view for one driver.

Groups holding nothing are dropped per driver, so a hand-transcribed row
shows no empty scaffolding — extended parameters are sparse, and rendering
the full schema would imply the data is missing rather than never
published.

**Parameters**

- `props` — `object` — Component props.
- `props.driver` — `object` — The driver record, whose `ext` object is displayed.

**Returns**

- `React.ReactElement` — The grouped detail rows, or a note when the driver publishes none.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `DriverDB > apply(d)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Apply a database row to the selected Driver node, or to a new one.

Goes through `driverToParams`, so a record's provenance and construction
detail can never reach a node's params.

**Parameters**

- `d` — `object` — The driver record.

**Returns**

- `void`

**Side effects**

- Updates or creates a node — which triggers a resimulation — and closes the modal.

### `DriverDB > saveCurrentAsCustom()`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Store the selected Driver node's parameters as a custom database entry.

Only the core T/S fields are captured; a node has no extended parameters
to save.

**Returns**

- `void`

**Side effects**

- Writes LocalStorage and updates component state. Alerts and does nothing when no driver node is selected.

### `DriverDB > removeCustom(i)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Delete one custom entry.

**Parameters**

- `i` — `number` — Index into the custom list.

**Returns**

- `void`

**Side effects**

- Writes LocalStorage and updates component state.

### `DriverDB > key(d, i)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

A stable React key for a table row.

The index is included because the library legitimately holds two records
with the same brand and model — a custom entry saved under a built-in's
name — and duplicate keys would make React reuse the wrong row.

**Parameters**

- `d` — `object` — The driver record.
- `i` — `number` — Row index.

**Returns**

- `string` — A unique row key.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.
