# Contract specification: `scripts/triage-contracts.mjs`

> Generated from method contracts. This file contains **no implementation code**.
> Write tests against what is claimed here, not against what you expect the code to do.

## UNREACHABLE (3)

### `indexContracts()`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Index every method's contract by name, for looking up what a failure violates.

Names can collide across modules, so each entry keeps its module path and
ambiguous names are resolved by the test file that reported the failure.

**Returns**

- `Map<string, Array<{file: string, method: object}>>` — Methods keyed by bare name.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `runSuite()`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Run the contract suite and capture its TAP output.

**Returns**

- `{code: number, out: string}` — The runner's exit code and combined output.

**Side effects**

- Spawns the Node test runner, which imports and executes application code.

### `parseFailures(out)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Extract failing tests from TAP output.

Test names follow the suite's convention `<method>: <clause>`, which is what
lets a failure be traced back to the contract it contradicts.

**Parameters**

- `out` — `string` — Raw runner output.

**Returns**

- `Array<{name: string, method: string, clause: string, detail: string}>` — One entry per failure.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.
