# Contract specification: `src/schema/params.js`

> Generated from method contracts. This file contains **no implementation code**.
> Write tests against what is claimed here, not against what you expect the code to do.

## Module

Named parameters and expressions.

A project may define named values once — `{ name: 'Vb', value: 60 }` — and
any numeric field may then hold an expression over them instead of a
number: `"volume": "Vb / 2"`. Expressions are resolved here, before a
netlist is built, so the engine only ever sees numbers and an error names
the field it came from rather than surfacing from inside SPICE.

The language is deliberately small: numbers, the named params, `pi` and
`e`, + − × ÷ ^, parentheses, and a short list of functions. It is parsed
with mathjs, but only the node types listed below are accepted, so nothing
can assign, define a function, reach a unit or call anything else.

## Exported constants

Names this module publishes that are not methods. The method contracts
above and below refer to these by role — a command, a node type, a panel —
so this is the vocabulary they assume.

### `__internals`

Keys: `parseExpression`

## EXPORTED (7)

### `isExpression(v)`

- **Reachability:** EXPORTED
- **Obtain via:** import { isExpression } from '../../src/schema/params.js'

Whether a stored value is an expression rather than a plain number.

**Parameters**

- `v` — `*` — A stored field value.

**Returns**

- `boolean` — True for a string — the only form an expression takes.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `isValidParamName(name)`

- **Reachability:** EXPORTED
- **Obtain via:** import { isValidParamName } from '../../src/schema/params.js'

Whether a name may be used for a parameter.

An identifier that does not collide with a constant or a function name,
so an expression can never be ambiguous about what a name refers to.

**Parameters**

- `name` — `string` — The proposed name.

**Returns**

- `boolean` — True when the name is usable.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `evaluateParams(params)`

- **Reachability:** EXPORTED
- **Obtain via:** import { evaluateParams } from '../../src/schema/params.js'

Evaluate the project's named parameters, in dependency order.

Parameters may reference each other. A reference to an unknown name, a
cycle, a duplicate or invalid name, or a result that is not a finite
number is reported, and that parameter (with anything depending on it) is
left out of `values`.

**Parameters**

- `params` — `Array<{name: string, value: number|string}>` — The project's `params` list.

**Returns**

- `{values: Object<string, number>, errors: string[]}` — Resolved values by name, and every problem found.

**Postconditions (must hold on return)**

- params is not modified

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `evaluateExpression(src, values)`

- **Reachability:** EXPORTED
- **Obtain via:** import { evaluateExpression } from '../../src/schema/params.js'

Evaluate one field's expression against resolved parameter values.

**Parameters**

- `src` — `string` — The expression.
- `values` — `Object<string, number>` — Resolved parameters.

**Returns**

- `{value: number, error: string|null}` — The number, or an error and `NaN`.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `isNumericField(type, field)`

- **Reachability:** EXPORTED
- **Obtain via:** import { isNumericField } from '../../src/schema/params.js'

Whether a node field is numeric, and so may hold an expression.

**Parameters**

- `type` — `string` — Node type.
- `field` — `string` — Param name.

**Returns**

- `boolean` — True when the field's default is a number, or it is a numeric field that defaults to `null`.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `resolveNodeParams(node, values, errors)`

- **Reachability:** EXPORTED
- **Obtain via:** import { resolveNodeParams } from '../../src/schema/params.js'

Replace the expressions in one node's params with their values.

**Parameters**

- `node` — `object` — A v3 node: `{id, type, params}`.
- `values` — `Object<string, number>` — Resolved named params.
- `errors` — `string[]` _(optional)_ — Collects a message for each expression that does not resolve.

**Returns**

- `object` — A copy of the params holding numbers in every numeric field and tap position; `NaN` where an expression failed.

**Mutates**

- errors, when given.

### `resolveProject(proj)`

- **Reachability:** EXPORTED
- **Obtain via:** import { resolveProject } from '../../src/schema/params.js'

Replace every expression in a project with its value.

Covers node params, tap positions, the master level, channel volts and
output resistance, DSP delay and filter values, analysis ranges and probe
positions. Anything that cannot be resolved is reported with where it is,
and left as `NaN` so a caller that ignores the errors still cannot mistake
it for a real value.

**Parameters**

- `proj` — `object` — A v3 project (see `migrateProject`).

**Returns**

- `{project: object, values: Object<string, number>, errors: string[]}` — A copy holding only numbers, the resolved parameters, and every problem found.

**Postconditions (must hold on return)**

- proj is not modified

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

## INTERNAL (1)

### `parseExpression(src)`

- **Reachability:** INTERNAL
- **Obtain via:** import { __internals } from '../../src/schema/params.js'  →  __internals.parseExpression

Parse an expression and check it uses only the permitted language.

**Parameters**

- `src` — `string` — The expression text.

**Returns**

- `{node: object|null, symbols: string[], error: string|null}` — The parsed tree, the parameter names it references, and an error when it does not parse or uses anything outside the language.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

## UNREACHABLE (3)

### `evaluateParams > resolve(name, stack)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Resolve one parameter, resolving its references first.

**Parameters**

- `name` — `string` — Parameter name.
- `stack` — `string[]` — Names being resolved above this one, for reporting a cycle.

**Returns**

- `boolean` — True when the parameter resolved to a finite number.

**Mutates**

- the enclosing `values`, `state` and `errors`.

### `resolveNodeParams > num(v, where)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Resolve one value if it is an expression.

**Parameters**

- `v` — `*` — The stored value.
- `where` — `string` — Location used in any error message.

**Returns**

- `*` — The number for an expression; anything else unchanged.

**Mutates**

- the enclosing `errors`.

### `resolveProject > num(v, where)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Resolve one value if it is an expression.

**Parameters**

- `v` — `*` — The stored value.
- `where` — `string` — Location used in any error message.

**Returns**

- `*` — The number for an expression; anything else unchanged.

**Mutates**

- the enclosing `errors`.
