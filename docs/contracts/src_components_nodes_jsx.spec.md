# Contract specification: `src/components/nodes.jsx`

> Generated from method contracts. This file contains **no implementation code**.
> Write tests against what is claimed here, not against what you expect the code to do.

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

## UNREACHABLE (2)

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
