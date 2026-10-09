# Contract specification: `src/components/Toolbar.jsx`

> Generated from method contracts. This file contains **no implementation code**.
> Write tests against what is claimed here, not against what you expect the code to do.

## Module

Quick-access bar under the menu bar.

Contents are user-configurable (Settings ▸ Quick bar): `store.toolbar` is an
ordered list of item ids from src/toolbarItems.js, and this renders them in
that order. Metric items are data-driven and need no case here; controls get
one each. Application-level switches (Settings, experimental features) belong
to the menu bar, not here — this strip is for per-design adjustments.

## EXPORTED (2)

### `Toolbar()`

- **Reachability:** EXPORTED
- **Obtain via:** import { Toolbar } from '../../src/components/Toolbar.jsx'

The quick-access bar under the menu.

Contents and order come from `store.toolbar`, configured in Settings ▸
Quick bar. Every control is a pill of its own; the metrics collect into
one block that wraps, a pill per cluster of neighbours that describe the
same thing (see `cluster` in `TOOLBAR_ITEMS`), so the response, the
impedance, the limits and the size each read as a group.

**Returns**

- `React.ReactElement` — The quick bar.

**Side effects**

- Subscribes to the store.

### `clusters(ids)`

- **Reachability:** EXPORTED
- **Obtain via:** import { clusters } from '../../src/components/Toolbar.jsx'

Metric ids split into runs of neighbours that share a cluster.

**Parameters**

- `ids` — `string[]` — Metric ids, in bar order.

**Returns**

- `string[][]` — The runs, in order.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

## UNREACHABLE (7)

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

The overlays belong to the workspace rather than the open project, so this
strip keeps showing them across a project switch — which is the point of
them.

**Returns**

- `React.ReactElement` — The snapshot control.

**Side effects**

- Subscribes to the store.

### `Metric(props)`

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

- `React.ReactElement|null` — The readout, or `null` when the id is not a metric or has no value for this design.

**Side effects**

- Subscribes to the store.

### `MetricPill(props)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

One cluster of readouts in a pill, or nothing when none of them has a value.

**Parameters**

- `props` — `object` — Component props.
- `props.ids` — `string[]` — Metric ids in the cluster.

**Returns**

- `React.ReactElement|null` — The pill.

**Side effects**

- Subscribes to the store.
