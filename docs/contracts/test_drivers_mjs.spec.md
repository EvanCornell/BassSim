# Contract specification: `test/drivers.mjs`

> Generated from method contracts. This file contains **no implementation code**.
> Write tests against what is claimed here, not against what you expect the code to do.

## UNREACHABLE (2)

### `check(name, fn)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Run one predicate over every driver and report the result.

**Parameters**

- `name` — `string` — Check description, printed either way.
- `fn` — `(driver: object) => string|null` — Returns a problem description, or `null` when the driver passes.

**Returns**

- `void`

**Mutates**

- Appends to the module-level failure list.

**Side effects**

- Prints the result line.

### `rel(a, b)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Relative difference between two values.

**Parameters**

- `a` — `number` — First value.
- `b` — `number` — Second value, used as the denominator.

**Returns**

- `number` — `|a - b| / |b|`.

**Preconditions (caller must guarantee)**

- b is non-zero

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.
