# Contract specification: `src/panelMeta.js`

> Generated from method contracts. This file contains **no implementation code**.
> Write tests against what is claimed here, not against what you expect the code to do.

## EXPORTED (1)

### `panelTitle(id)`

- **Reachability:** EXPORTED
- **Obtain via:** import { panelTitle } from '../../src/panelMeta.js'

Display title for a panel.

**Parameters**

- `id` — `string` — Panel id.

**Returns**

- `string` — The registered title, falling back to the raw id so an unknown panel still labels its tab with something.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.
