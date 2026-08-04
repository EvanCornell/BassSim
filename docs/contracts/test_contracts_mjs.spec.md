# Contract specification: `test/contracts.mjs`

> Generated from method contracts. This file contains **no implementation code**.
> Write tests against what is claimed here, not against what you expect the code to do.

## UNREACHABLE (2)

### `check(label, fn)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Run one predicate over every method and report the result.

Failures are truncated to the first twelve, since an early-stage file can
fail every check at once and a wall of output hides which check matters.

**Parameters**

- `label` — `string` — Check description, printed either way.
- `fn` — `(method: object) => string|null` — Returns a problem description, or `null` when the method passes.

**Returns**

- `void`

**Mutates**

- Appends to the module-level failure list and bumps the check count.

**Side effects**

- Prints the result line and up to twelve failures.

### `topLevel(doc)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

A contract's top-level `@param` entries.

Sub-properties like `@param {number} opts.gain` document a field of a
parameter, not a parameter, so they are excluded from the positional
comparison against the signature.

**Parameters**

- `doc` — `object` — A parsed contract.

**Returns**

- `Array<object>` — Only the entries describing whole parameters.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.
