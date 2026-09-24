# Contract specification: `src/useResolved.js`

> Generated from method contracts. This file contains **no implementation code**.
> Write tests against what is claimed here, not against what you expect the code to do.

## Module

Hooks that give components numbers for fields that may hold expressions.

A numeric node field can hold an expression over the project's named
params — `"Vb / 2"` — so anything that computes with a field, a canvas
readout or a derived figure in a form, reads it through here.

## EXPORTED (2)

### `useParamValues()`

- **Reachability:** EXPORTED
- **Obtain via:** import { useParamValues } from '../../src/useResolved.js'

The project's named params, resolved.

**Returns**

- `{values: Object<string, number>, errors: string[]}` — Values by name, and any problems.

**Side effects**

- Subscribes to the store.

### `useResolvedParams(id, type, params)`

- **Reachability:** EXPORTED
- **Obtain via:** import { useResolvedParams } from '../../src/useResolved.js'

One node's params with every expression replaced by its value.

**Parameters**

- `id` — `string` — Node id.
- `type` — `string` — Node type.
- `params` — `object` — The node's stored params.

**Returns**

- `object` — The params, numbers throughout; `NaN` where an expression does not resolve.

**Side effects**

- Subscribes to the store.
