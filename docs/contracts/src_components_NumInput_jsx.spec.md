# Contract specification: `src/components/NumInput.jsx`

> Generated from method contracts. This file contains **no implementation code**.
> Write tests against what is claimed here, not against what you expect the code to do.

## Exported constants

Names this module publishes that are not methods. The method contracts
above and below refer to these by role — a command, a node type, a panel —
so this is the vocabulary they assume.

### `NUMBER`

A plain number as typed: sign, digits, one point, optional exponent.

## EXPORTED (5)

### `readNumber(text, limits)`

- **Reachability:** EXPORTED
- **Obtain via:** import { readNumber } from '../../src/components/NumInput.jsx'

Check typed text against a field's limits.

**Parameters**

- `text` — `string` — What was typed.
- `limits` — `object` _(optional)_ — What the field accepts.
- `limits.min` — `number|string` _(optional)_ — Smallest value accepted.
- `limits.max` — `number|string` _(optional)_ — Largest value accepted.
- `limits.above` — `number|string` _(optional)_ — The value must be greater than this.
- `limits.integer` — `boolean` _(optional)_ — Whole numbers only.
- `limits.allowEmpty` — `boolean` _(optional)_ — An empty box is a value (stored as null).
- `limits.validate` — `Function` _(optional)_ — Further check: returns why a number is refused, or nothing.

**Returns**

- `{ok: boolean, value?: number|null, error?: string}` — The number, or why the text is not one the field takes.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `useDraft(args)`

- **Reachability:** EXPORTED
- **Obtain via:** import { useDraft } from '../../src/components/NumInput.jsx'

Hold what is typed in a box apart from the value it edits.

The box shows the stored value until it is typed in; from then on it shows
exactly what was typed, valid or not, so nothing typed is ever undone under
the cursor. Enter or leaving the box applies the text when it reads as a
value; leaving with text that does not puts the stored value back. Escape
puts it back at once.

**Parameters**

- `args` — `object` — The field.
- `args.value` — `*` — The stored value.
- `args.read` — `Function` — Reads text: `{ok, value}` or `{ok: false, error}`.
- `args.onCommit` — `Function` — Called with the value read when it is applied and differs from the stored one.
- `args.format` — `Function` _(optional)_ — Text for the stored value.

**Returns**

- `{text: string, editing: boolean, error: string|null, onChange: Function, onBlur: Function, onKeyDown: Function, setText: Function}` — What the input needs.

**Side effects**

- Holds the typed text in component state.

### `NumInput(props)`

- **Reachability:** EXPORTED
- **Obtain via:** import { NumInput } from '../../src/components/NumInput.jsx'

A number box that takes any typing and applies it on Enter or on leaving.

While the text is not a number the field accepts, the box turns red and its
tooltip says why; nothing is applied. Leaving the box with such text puts
the stored value back. The arrow keys step the value and apply it at once.

**Parameters**

- `props` — `object` — Component props; anything not listed is passed to the input.
- `props.value` — `number|null|undefined` — The stored value.
- `props.onCommit` — `Function` — Called with the new number (or null for an allowed empty box).
- `props.min` — `number|string` _(optional)_ — Smallest value accepted.
- `props.max` — `number|string` _(optional)_ — Largest value accepted.
- `props.above` — `number|string` _(optional)_ — The value must be greater than this.
- `props.integer` — `boolean` _(optional)_ — Whole numbers only.
- `props.allowEmpty` — `boolean` _(optional)_ — An empty box applies as null.
- `props.validate` — `Function` _(optional)_ — Further check: returns why a number is refused, or nothing.
- `props.format` — `Function` _(optional)_ — Text for the stored value.
- `props.step` — `number|string` _(optional)_ — Arrow-key step; Shift steps ten times as far.
- `props.className` — `string` _(optional)_ — Extra classes for the input.
- `props.title` — `string` _(optional)_ — Tooltip when the text is valid.

**Returns**

- `React.ReactElement` — The input.

**Side effects**

- Holds the typed text in component state.

### `readNumberList(text, limits)`

- **Reachability:** EXPORTED
- **Obtain via:** import { readNumberList } from '../../src/components/NumInput.jsx'

Read typed text as a list of numbers separated by commas or spaces.

**Parameters**

- `text` — `string` — What was typed.
- `limits` — `object` _(optional)_ — What each entry must satisfy, as for `readNumber`.

**Returns**

- `{ok: boolean, value?: number[], error?: string}` — The numbers, or why the text is not a list the field takes.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `ListInput(props)`

- **Reachability:** EXPORTED
- **Obtain via:** import { ListInput } from '../../src/components/NumInput.jsx'

A box holding a list of numbers, taking any typing and applying it on
Enter or on leaving, like `NumInput`.

**Parameters**

- `props` — `object` — Component props; anything not listed is passed to the input.
- `props.value` — `number[]` — The stored list.
- `props.onCommit` — `Function` — Called with the new list.
- `props.min` — `number|string` _(optional)_ — Smallest entry accepted.
- `props.above` — `number|string` _(optional)_ — Every entry must be greater than this.
- `props.title` — `string` _(optional)_ — Tooltip when the text is valid.

**Returns**

- `React.ReactElement` — The input.

**Side effects**

- Holds the typed text in component state.

## UNREACHABLE (8)

### `useDraft > apply()`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Apply the typed text if it reads as a value.

**Returns**

- `boolean` — Whether the box is now back to showing the stored value.

**Side effects**

- Calls `onCommit` with a changed value; clears the draft.

### `useDraft > onChange(e)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Hold what was typed.

**Parameters**

- `e` — `Event` — The input's change event.

**Returns**

- `void`

**Side effects**

- Sets the draft.

### `useDraft > onBlur()`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Leaving the box: apply valid text, otherwise put the stored value back.

**Returns**

- `void`

**Side effects**

- May call `onCommit`; clears the draft.

### `useDraft > onKeyDown(e)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Enter applies; Escape puts the stored value back.

**Parameters**

- `e` — `KeyboardEvent` — The key event.

**Returns**

- `void`

**Side effects**

- May call `onCommit` or clear the draft; stops Escape from closing a surrounding dialog while editing.

### `NumInput > read(t)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Read typed text against this field's limits.

**Parameters**

- `t` — `string` — The text.

**Returns**

- `{ok: boolean, value?: number|null, error?: string}` — The number, or why it is refused.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `listText(list)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

A list as the text a box shows.

**Parameters**

- `list` — `number[]` — The list.

**Returns**

- `string` — e.g. `0, 6, 12`.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `ListInput > commitList(list)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Apply a list that differs from the stored one.

**Parameters**

- `list` — `number[]` — The list read.

**Returns**

- `void`

**Side effects**

- Calls `onCommit` when the list changed.

### `ListInput > readList(t)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Read typed text as this field's list.

**Parameters**

- `t` — `string` — The text.

**Returns**

- `{ok: boolean, value?: number[], error?: string}` — The list, or why it is refused.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.
