# Contract specification: `src/components/WiringPanel.jsx`

> Generated from method contracts. This file contains **no implementation code**.
> Write tests against what is claimed here, not against what you expect the code to do.

## EXPORTED (2)

### `editAt(tree, path, fn)`

- **Reachability:** EXPORTED
- **Obtain via:** import { editAt } from '../../src/components/WiringPanel.jsx'

Replace the subtree at a path in a load tree.

**Parameters**

- `tree` — `object` — The tree.
- `path` — `number[]` — Child indices from the root.
- `fn` — `Function` — Receives the subtree, returns its replacement, or `null` to remove it.

**Returns**

- `object|null` — The new tree.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `WiringPanel()`

- **Reachability:** EXPORTED
- **Obtain via:** import { WiringPanel } from '../../src/components/WiringPanel.jsx'

The wiring manager: the master level and every amplifier channel.

Signal chain per channel: the program → its DSP → its amplifier (volts at
master 0 dB, then the master) → its output resistance → its load, a
series/parallel tree of driver nodes. Each channel shows the watts its
voltage puts into the nominal load its wiring presents; rewiring keeps the
voltage and changes the watts, as on a real amplifier.

**Returns**

- `React.ReactElement` — The panel.

**Side effects**

- Subscribes to the store.

## UNREACHABLE (7)

### `ohms(z)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Format ohms for a label.

**Parameters**

- `z` — `number` — Impedance, Ω.

**Returns**

- `string` — The figure, or `open` for no load.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `LoadGroup(props)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

One group in a channel's load: drivers and sub-groups in series or in parallel.

**Parameters**

- `props` — `object` — Component props.
- `props.tree` — `object` — The group.
- `props.path` — `number[]` — Its path from the channel's root.
- `props.onEdit` — `Function` — `(path, fn)` applies an edit at a path.
- `props.drivers` — `Map<string, object>` — Driver id → its node.
- `props.free` — `string[]` — Driver ids no channel has claimed.
- `props.resolved` — `Map<string, object>` — Driver id → resolved params, for nominal impedance.

**Returns**

- `React.ReactElement` — The group.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `FilterRow(props)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

One DSP filter's controls.

**Parameters**

- `props` — `object` — Component props.
- `props.f` — `object` — The filter.
- `props.onChange` — `Function` — Called with the edited filter, or `null` to remove it.

**Returns**

- `React.ReactElement` — The row.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `ChannelCard(props)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

One amplifier channel: its level, DSP and load.

**Parameters**

- `props` — `object` — Component props.
- `props.ch` — `object` — The channel.
- `props.index` — `number` — Its position in the list.
- `props.ctx` — `object` — Shared lookups: wiring, drivers, resolved params, param values, master gain, the free driver list and the edit functions.

**Returns**

- `React.ReactElement` — The channel card.

**Side effects**

- Subscribes to the store for the simulated impedance.

### `ChannelCard > patch(change, live)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Apply a change to this channel.

**Parameters**

- `change` — `object` — Fields to merge.
- `live` — `boolean` _(optional)_ — A typed value: no undo step.

**Returns**

- `void`

**Side effects**

- Writes the project's wiring.

### `WiringPanel > update(w)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Replace the wiring as one undoable edit.

**Parameters**

- `w` — `object` — The new wiring.

**Returns**

- `void`

**Side effects**

- Writes the project's wiring and records history.

### `WiringPanel > updateLive(w)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Replace the wiring for a typed value, without an undo step.

**Parameters**

- `w` — `object` — The new wiring.

**Returns**

- `void`

**Side effects**

- Writes the project's wiring.
