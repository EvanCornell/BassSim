# Contract specification: `scripts/triage-contracts.mjs`

> Generated from method contracts. This file contains **no implementation code**.
> Write tests against what is claimed here, not against what you expect the code to do.

## Module

Turn a contract-suite run into a triage report.

The blind suite's failures are not ordinary test failures. Each one is a
disagreement between a documented contract and the implementation, and which
side is wrong is a judgement call — so this deliberately does not "fix"
anything. It groups failures by the module and method whose contract they
contradict, and prints the contract clause beside the observed behaviour, so
the decision can be made with both in view.

Run: npm run test:triage

## UNREACHABLE (5)

### `indexContracts()`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Index every method's contract by name, for looking up what a failure violates.

Names can collide across modules, so each entry keeps its module path and
ambiguous names are resolved by the test file that reported the failure.

**Returns**

- `Map<string, Array<{file: string, method: object}>>` — Methods keyed by bare name.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `indexContracts > add(name, entry)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Record one declaration under its bare name.

**Parameters**

- `name` — `string` — The method or constant name.
- `entry` — `{file: string, method: object}` — Where it is declared.

**Returns**

- `void`

**Mutates**

- The index being built.

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

Extract failing tests from TAP output, with their full diagnostic block.

Node emits each failure as a YAML block whose `error` may be a multi-line
literal (`error: |-`) holding an assertion diff. Reading only the first line
loses exactly the part that says what went wrong, so the block is parsed
properly rather than scanned for keys.

Test names follow the suite's convention `<method>: <clause>`, which is what
lets a failure be traced back to the contract it contradicts.

**Parameters**

- `out` — `string` — Raw runner output.

**Returns**

- `Array<{name: string, method: string, clause: string, message: string, expected: string|null, actual: string|null, location: string|null}>` — One entry per failure.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `parseFailures > field(key)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Read one key out of the failure's YAML block.

Handles both an inline scalar and a `|-` literal block, which is how
Node emits a multi-line assertion diff.

**Parameters**

- `key` — `string` — The YAML key to read.

**Returns**

- `string|null` — The value with quotes stripped, or `null` when the key is absent.

**Reads external mutable state**

- the `body` lines captured for the current failure.
