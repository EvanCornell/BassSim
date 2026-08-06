# Contract specification: `scripts/build-spec-pack.mjs`

> Generated from method contracts. This file contains **no implementation code**.
> Write tests against what is claimed here, not against what you expect the code to do.

## Module

Generate docs/contracts/ — the specification pack the blind test suite is
written from.

This exists to make blindness structural rather than a promise. The pack is
derived mechanically from docs/api.json, which holds contracts and nothing
else: no function bodies, no expressions, no line contents. An agent given
only this directory cannot see how a method is implemented, so the tests it
writes can only encode what the contract claims — which is the entire point.
If a test fails, that is a genuine disagreement between the contract and the
code, not a test written to match whatever the code happened to do.

Each method is also given a *reachability* line: how to import it. That is
the one piece of information a blind author needs that a contract does not
contain, and it is derived from the export structure rather than the source.

Run: npm run docs:spec

## UNREACHABLE (4)

### `internalsByModule()`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Which module-private functions each module re-exports for testing.

Read from the `__internals` declarations rather than hardcoded, so the pack
stays correct as the test surface changes.

**Returns**

- `Object<string, string[]>` — Internal names keyed by module path.

**Side effects**

- Reads every module's source to find its `__internals` block.

### `reachability(mod, m)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

How a test can obtain this method, or why it cannot.

**Parameters**

- `mod` — `object` — The module entry from api.json.
- `m` — `object` — The method entry.

**Returns**

- `{reach: string, how: string}` — A reachability class and an import recipe.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `renderMethod(mod, m)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Render one method as a specification block.

**Parameters**

- `mod` — `object` — The module entry.
- `m` — `object` — The method entry.

**Returns**

- `string` — Markdown for that method.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `renderModule(mod)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Render one module's specification file.

**Parameters**

- `mod` — `object` — The module entry from api.json.

**Returns**

- `string` — Markdown for the whole module.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.
