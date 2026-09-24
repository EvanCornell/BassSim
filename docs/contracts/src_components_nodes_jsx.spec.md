# Contract specification: `src/components/nodes.jsx`

> Generated from method contracts. This file contains **no implementation code**.
> Write tests against what is claimed here, not against what you expect the code to do.

## Exported constants

Names this module publishes that are not methods. The method contracts
above and below refer to these by role — a command, a node type, a panel —
so this is the vocabulary they assume.

### `nodeTypes`

Keys: `driver`, `chamber`, `waveguide`, `pr`, `radiation`

## EXPORTED (5)

### `DriverNode(props)`

- **Reachability:** EXPORTED
- **Obtain via:** import { DriverNode } from '../../src/components/nodes.jsx'

Canvas node for a driver: T/S summary, array count, and front/rear ports.

**Parameters**

- `props` — `object` — React Flow node props.
- `props.id` — `string` — Node id.
- `props.data` — `{params: object}` — Node data.
- `props.selected` — `boolean` — Whether the node is selected.

**Returns**

- `React.ReactElement` — The node.

**Side effects**

- Subscribes to the store.

### `ChamberNode(props)`

- **Reachability:** EXPORTED
- **Obtain via:** import { ChamberNode } from '../../src/components/nodes.jsx'

Canvas node for a chamber: volume, path length, stuffing, and its inlet/outlet.

**Parameters**

- `props` — `object` — React Flow node props.
- `props.id` — `string` — Node id.
- `props.data` — `{params: object}` — Node data.
- `props.selected` — `boolean` — Whether the node is selected.

**Returns**

- `React.ReactElement` — The node.

**Side effects**

- Subscribes to the store.

### `WaveguideNode(props)`

- **Reachability:** EXPORTED
- **Obtain via:** import { WaveguideNode } from '../../src/components/nodes.jsx'

Canvas node for a waveguide: geometry, flare cutoff, and a live velocity readout.

The velocity figure is clickable and opens the detailed chart, because it
is the number most likely to disqualify an otherwise good design.

**Parameters**

- `props` — `object` — React Flow node props.
- `props.id` — `string` — Node id.
- `props.data` — `{params: object}` — Node data.
- `props.selected` — `boolean` — Whether the node is selected.

**Returns**

- `React.ReactElement` — The node.

**Side effects**

- Subscribes to the store.

### `PRNode(props)`

- **Reachability:** EXPORTED
- **Obtain via:** import { PRNode } from '../../src/components/nodes.jsx'

Canvas node for a passive radiator: moving mass, compliance and resulting Fs.

**Parameters**

- `props` — `object` — React Flow node props.
- `props.id` — `string` — Node id.
- `props.data` — `{params: object}` — Node data.
- `props.selected` — `boolean` — Whether the node is selected.

**Returns**

- `React.ReactElement` — The node.

**Side effects**

- Subscribes to the store.

### `RadiationNode(props)`

- **Reachability:** EXPORTED
- **Obtain via:** import { RadiationNode } from '../../src/components/nodes.jsx'

Canvas node for a radiation termination: the space it radiates into.

**Parameters**

- `props` — `object` — React Flow node props.
- `props.id` — `string` — Node id.
- `props.data` — `{params: object}` — Node data.
- `props.selected` — `boolean` — Whether the node is selected.

**Returns**

- `React.ReactElement` — The node.

**Side effects**

- Subscribes to the store.

## UNREACHABLE (4)

### `useWarnings(id)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Subscribe to the validation warnings for one node.

**Parameters**

- `id` — `string` — Node id.

**Returns**

- `string[]|undefined` — Warnings for that node, or `undefined` when it has none.

**Side effects**

- Subscribes to the store.

### `Head(props)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

A node's title bar: colour dot, label, and a warning marker when it has warnings.

**Parameters**

- `props` — `object` — Component props.
- `props.type` — `string` — Node type, which picks the colour.
- `props.label` — `string` — Display label.
- `props.warn` — `string[]|undefined` — Validation warnings, shown in the marker's tooltip.

**Returns**

- `React.ReactElement` — The node header.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `Port(props)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

A handle, drawn with its label.

Every handle is a `source`: the canvas runs in loose connection mode, so
any handle joins any other and the join has no direction.

**Parameters**

- `props` — `object` — Component props.
- `props.id` — `string` — Handle id.
- `props.side` — `string` — `top`, `bottom`, `left` or `right`.
- `props.at` — `string` _(optional)_ — Offset along that side, as CSS (e.g. `35%`).
- `props.label` — `string` — Text drawn beside it.
- `props.title` — `string` _(optional)_ — Tooltip.

**Returns**

- `React.ReactElement` — The handle and its label.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `TapPorts(props)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Handles for a chamber's or waveguide's taps, along its right-hand side.

Each sits at its position's share of the length, so the node reads as a
map of the line; a tap outside the length is pinned to the nearer end and
flagged by the node's warning.

**Parameters**

- `props` — `object` — Component props.
- `props.taps` — `Array<{id: string, position: number}>` — Resolved taps.
- `props.length` — `number` — Resolved length, cm.

**Returns**

- `React.ReactElement` — The handles.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.
