# Contract specification: `test/drivers.mjs`

> Generated from method contracts. This file contains **no implementation code**.
> Write tests against what is claimed here, not against what you expect the code to do.

## Module

Driver-library integrity checks.

The library is large enough now that a bad row would hide rather than
announce itself, and a driver whose parameters disagree with each other
produces a plausible-looking simulation of nothing real.

Two tiers. Hard checks are identities the loader controls — the schema, and
the Cms/Rms the importer derives — and must hold exactly. The audit tier
covers published values that can legitimately disagree with each other in a
real catalog; those rows are permitted, but only if they carry a `suspect`
label, so the count can never grow silently.

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
