# Contract specification: `src/components/Toolbar.jsx`

> Generated from method contracts. This file contains **no implementation code**.
> Write tests against what is claimed here, not against what you expect the code to do.

## EXPORTED (1)

### `Toolbar()`

- **Reachability:** EXPORTED
- **Obtain via:** import { Toolbar } from '../../src/components/Toolbar.jsx'

The quick-access bar under the menu.

Contents and order come from `store.toolbar`, configured in Settings ▸
Quick bar. Consecutive items of the same kind are collected into one
block that wraps internally, so a long metrics readout does not push the
controls onto a second row.

**Returns**

- `React.ReactElement` — The quick bar.

**Side effects**

- Subscribes to the store.

## UNREACHABLE (7)

### `ProjectName()`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Editable project name. Renaming moves the auto-save to the new name.

**Returns**

- `React.ReactElement` — The name input.

**Side effects**

- Subscribes to the store.

### `UndoRedo()`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Undo and redo buttons, disabled when their stacks are empty.

Subscribes to the whole store rather than a slice, since it needs both
history stacks and both actions.

**Returns**

- `React.ReactElement` — The button pair.

**Side effects**

- Subscribes to the store.

### `VoltageControl()`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Drive-level control, with the resulting wattage beside it.

Goes through `setAmp` rather than `updateSettings` so P = V²/Z stays
linked with the amplifier solver in the Parameters panel.

**Returns**

- `React.ReactElement` — The drive control.

**Side effects**

- Subscribes to the store.

### `SweepRange()`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Sweep start and end frequency. Off by default — it is a set-once control.

**Returns**

- `React.ReactElement` — The sweep range control.

**Side effects**

- Subscribes to the store.

### `MaskingToggle()`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Toggle resonance masking, which lumps chambers to hide standing-wave artifacts.

**Returns**

- `React.ReactElement` — The masking toggle.

**Side effects**

- Subscribes to the store.

### `SnapshotControl()`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Take a snapshot and manage the reference overlays already taken.

**Returns**

- `React.ReactElement` — The snapshot control.

**Side effects**

- Subscribes to the store.

### `Metric(arg0)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

One read-only metric readout, flagged when it exceeds a limit.

Entirely data-driven: `metricValue` decides the label, the text and
whether it is out of range, which is why adding a metric needs no change
here.

**Parameters**

- `props` — `object` — Component props.
- `props.id` — `string` — Quick-bar metric item id.

**Returns**

- `React.ReactElement|null` — The readout, or `null` when the id is not a metric.

**Side effects**

- Subscribes to the store.
