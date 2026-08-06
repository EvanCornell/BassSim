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

## Exported constants

Names this module publishes that are not methods. The method contracts
above and below refer to these by role — a command, a node type, a panel —
so this is the vocabulary they assume.

### `CORE_FIELDS`

The flat, solver-facing T/S fields every driver record may carry.

The thirteen fields are Fs, Qts, Qes, Qms, Vas, Re, Bl, Mms, Cms, Sd, Le,
Xmax and Rms. The three Q values are dimensionless; the rest are
Fs Hz · Vas L · Re Ω · Bl T·m · Mms g · Cms mm/N · Sd cm² · Le mH ·
Xmax mm · Rms N·s/m.

Each entry exposes `key`, `label`, `unit` and `type`, and the solver-facing
nine additionally carry `solver: true`: Fs, Re, Bl, Mms, Cms, Sd, Le, Xmax
and Rms. The three Q values and Vas are published figures the solver derives
rather than reads.

`solver: true` marks the nine the engine actually reads — the eight that
enter the electro-mechanical equation plus Xmax, which bounds excursion; the rest are
published figures kept for display and for the consistency audit. Declared as
data so the browser, the CSV export and the MCP tools enumerate fields
generically instead of hardcoding a list that drifts.

An array of 13 entries.

### `EXT_FIELDS`

Extended, manufacturer-specific parameters, grouped for display.

Sparse by design — B&C publish flux density and winding depth, most brands
publish a power rating and stop — so every field is optional and any consumer
must tolerate `undefined`. Nothing here is required to simulate.

Each entry exposes `key`, `group`, `label`, `unit` and `type`, and some carry
a `desc`. The groups are Excursion, Electrical, Motor, Construction and
Application.

An array of 28 entries.

### `EXT_BY_KEY`

Extended field descriptors indexed by key, for O(1) lookup during filtering.

### `EXT_GROUPS`

Display group names in declaration order, so the UI groups fields consistently.

An array of undefined entries.

### `SOURCE_LABELS`

Human-readable provenance labels keyed by a record's `source`.

Anything other than `official` is a hand transcription and should be checked
against the datasheet before a build.

Keys: `official`, `datasheet`, `custom`

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

- `object` — Node params: `label` taken from the record's `model` field, plus each present core T/S field.

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
