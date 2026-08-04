# Contract specification: `src/data/drivers.js`

> Generated from method contracts. This file contains **no implementation code**.
> Write tests against what is claimed here, not against what you expect the code to do.

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
