# Contract specification: `src/data/drivers.js`

> Generated from method contracts. This file contains **no implementation code**.
> Write tests against what is claimed here, not against what you expect the code to do.

## Module

The built-in driver library.

Entries arrive from two places. Catalog imports (drivers.<brand>.js) are
generated from a manufacturer's own multi-driver data export and carry the
full extended parameter set; hand transcriptions (drivers.legacy.js) carry
the core T/S only. Both share one record shape, described in
driver-fields.js, so nothing downstream has to care which it got — beyond
reading `source` when it wants to say how much to trust the numbers.

## Exported constants

Names this module publishes that are not methods. The method contracts
above and below refer to these by role — a command, a node type, a panel —
so this is the vocabulary they assume.

### `BUILTIN_DRIVERS`

Every built-in driver, normalized and sorted by brand then model.

Catalog and hand-transcribed entries are merged into one list deliberately:
consumers filter on `source` when provenance matters rather than choosing
between two arrays.

Sorted by brand then model using `localeCompare`, so ordering follows the
runtime's collation rather than code-unit order — the two disagree on real
brand names. Same-brand rows are therefore contiguous.

### `DRIVER_BRANDS`

Distinct brand names in the library, sorted, for populating filter menus.

### `POPULATED_EXT_KEYS`

Extended field keys that at least one driver actually populates.

Extended parameters are sparse, so filter UI built from the full `EXT_FIELDS`
list would offer columns the library cannot fill. This is the subset worth
showing.

## UNREACHABLE (1)

### `normalize(d)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Bring a raw database row up to the full record shape.

Two guarantees the rest of the app relies on: `ext` is always an object, so
callers can iterate it without guarding, and `name` exists as one
pre-joined field for search to match against.

**Parameters**

- `d` — `object` — A row from a catalog or legacy module.

**Returns**

- `object` — A copy carrying a guaranteed `ext` object and a `name`.

**Postconditions (must hold on return)**

- The input row is not modified.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.
