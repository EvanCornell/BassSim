# Contract specification: `src/components/VariablesPanel.jsx`

> Generated from method contracts. This file contains **no implementation code**.
> Write tests against what is claimed here, not against what you expect the code to do.

## EXPORTED (1)

### `VariablesPanel()`

- **Reachability:** EXPORTED
- **Obtain via:** import { VariablesPanel } from '../../src/components/VariablesPanel.jsx'

The project's named parameters: values defined once and used by name.

Any numeric field — a node parameter, a tap position, a channel's volts, a
filter frequency — may hold an expression over these, e.g. `Vb / 2`.
A parameter may itself be an expression over others. Renaming a parameter
does not rewrite the expressions that use it; they report the missing name
until they are updated.

**Returns**

- `React.ReactElement` — The panel.

**Side effects**

- Subscribes to the store.

## UNREACHABLE (1)

### `VariablesPanel > edit(i, change, live)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Replace one parameter.

**Parameters**

- `i` — `number` — Its index.
- `change` — `object` — Fields to merge.
- `live` — `boolean` _(optional)_ — A typed value: no undo step.

**Returns**

- `void`

**Side effects**

- Writes the project's params.
