# Contract specification: `src/components/ProbesPanel.jsx`

> Generated from method contracts. This file contains **no implementation code**.
> Write tests against what is claimed here, not against what you expect the code to do.

## EXPORTED (1)

### `ProbesPanel()`

- **Reachability:** EXPORTED
- **Obtain via:** import { ProbesPanel } from '../../src/components/ProbesPanel.jsx'

The probes: extra measurements anywhere in the box.

A probe reads pressure, volume flow or air velocity at a handle — an end,
a face, a tap — or at a distance along a chamber or waveguide. Probes only
observe: adding one never changes the simulation. Pressure probes plot on
the Interior SPL chart; flow and velocity on the Probe Flow chart.

**Returns**

- `React.ReactElement` — The panel.

**Side effects**

- Subscribes to the store.

## UNREACHABLE (1)

### `ProbesPanel > edit(i, change, live)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Replace one probe.

**Parameters**

- `i` — `number` — Its index.
- `change` — `object` — Fields to merge.
- `live` — `boolean` _(optional)_ — A typed value: no undo step.

**Returns**

- `void`

**Side effects**

- Writes the project's probes.
