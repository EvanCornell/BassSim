# Contract specification: `src/components/ExprInput.jsx`

> Generated from method contracts. This file contains **no implementation code**.
> Write tests against what is claimed here, not against what you expect the code to do.

## EXPORTED (3)

### `shortNum(v)`

- **Reachability:** EXPORTED
- **Obtain via:** import { shortNum } from '../../src/components/ExprInput.jsx'

Round a value for display without trailing noise.

**Parameters**

- `v` — `number` — The value.

**Returns**

- `string` — Up to six significant figures.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `readTyped(text, values)`

- **Reachability:** EXPORTED
- **Obtain via:** import { readTyped } from '../../src/components/ExprInput.jsx'

Read typed text as a field value: a number, an expression, or neither.

**Parameters**

- `text` — `string` — What was typed.
- `values` — `Object<string, number>` — Resolved named params.

**Returns**

- `{ok: boolean, value?: number|string, error?: string}` — The value to store, or why the text cannot be stored yet.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `ExprInput(props)`

- **Reachability:** EXPORTED
- **Obtain via:** import { ExprInput } from '../../src/components/ExprInput.jsx'

A numeric input that also takes an expression over the named params.

Typing a number stores a number; typing anything else stores it as an
expression once it resolves, and shows what it resolves to. Text that does
not resolve yet — half an expression, a misspelt name — is held in the box,
outlined, and never written, so a half-typed edit cannot break the run.
Arrow keys step a plain number.

**Parameters**

- `props` — `object` — Component props.
- `props.value` — `number|string|null|undefined` — The stored value.
- `props.onCommit` — `Function` — Called with a number or an expression string.
- `props.step` — `number` _(optional)_ — Arrow-key step for a plain number.
- `props.min` — `number` _(optional)_ — Smallest number accepted.
- `props.placeholder` — `string` _(optional)_ — Shown when empty.
- `props.disabled` — `boolean` _(optional)_ — Disable the input.
- `props.title` — `string` _(optional)_ — Tooltip.

**Returns**

- `React.ReactElement` — The input, with the resolved value beside an expression.

**Side effects**

- Subscribes to the store for the named params.

## UNREACHABLE (1)

### `ExprInput > commit(t)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Store what was typed if it can be stored.

**Parameters**

- `t` — `string` — The text.

**Returns**

- `void`

**Side effects**

- Calls `onCommit` when the text is a usable value.
