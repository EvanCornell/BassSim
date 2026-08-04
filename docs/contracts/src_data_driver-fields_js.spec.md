# Contract specification: `src/data/driver-fields.js`

> Generated from method contracts. This file contains **no implementation code**.
> Write tests against what is claimed here, not against what you expect the code to do.

## Module

The driver record schema, described as data.

A database entry is flat for the parameters the solver consumes and nests
everything else under `ext`. The split is deliberate: `driverSI()` reads
Mms/Cms/Rms/Sd/Re/Le/Bl/Fs and nothing else, so spreading a record straight
into a node's params must never smuggle construction trivia in with it.

`ext` is sparse by design. Manufacturers publish wildly different subsets —
B&C give flux density and winding depth, most car-audio brands give a power
rating and little else — so every extended field is optional and code that
reads them must tolerate `undefined`. Nothing here is required to simulate.

Enumerating the schema rather than hardcoding it lets the database browser,
the CSV export and the MCP tools stay correct as fields are added, and gives
an agent a machine-readable answer to "what can I filter on?".

## EXPORTED (2)

### `driverToParams(d)`

- **Reachability:** EXPORTED
- **Obtain via:** import { driverToParams } from '../../src/data/driver-fields.js'

Project a database row down to the params a Driver node accepts.

The load-bearing boundary between the database and the graph. A record
carries construction trivia — spider type, magnet material, recommended
enclosure — that must never reach a node's params, so this copies the core
fields explicitly rather than spreading the row and deleting what it does not
want. Fields the record omits stay absent, leaving the node's own defaults in
place.

**Parameters**

- `d` — `object` — A driver database record.

**Returns**

- `object` — Node params: `label` from the model name, plus each present core T/S field.

**Postconditions (must hold on return)**

- The result contains no `ext`, `source`, `suspect` or `brand` key, whatever the input carries.
- d is not modified.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `formatExt(key, value)`

- **Reachability:** EXPORTED
- **Obtain via:** import { formatExt } from '../../src/data/driver-fields.js'

Render an extended parameter as display text with its unit.

**Parameters**

- `key` — `string` — An extended field key.
- `value` — `number|string|null|undefined` — The record's value for that key.

**Returns**

- `string|null` — The formatted value with its unit appended, or `null` when the key is unknown or the value is absent — which is the normal case, since extended parameters are sparse.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.
