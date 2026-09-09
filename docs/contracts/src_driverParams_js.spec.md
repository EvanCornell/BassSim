# Contract specification: `src/driverParams.js`

> Generated from method contracts. This file contains **no implementation code**.
> Write tests against what is claimed here, not against what you expect the code to do.

## Module

The driver's T/S parameters are not eleven independent numbers. They are
six, plus five relations that fix the rest — so typing a new Fs into a
driver whose Mms and Cms are already set is not an edit, it is a
contradiction.

Hornresp answers this by only ever letting you edit the physical six
(Sd, Bl, Cms, Rms, Mmd, Re) and showing the rest as consequences. This
module generalises that: any six that determine the others may be the set
you edit, and the remaining five are derived from them. Which six is the
user's choice, expressed as locks.

The relations are held as data rather than as code paths, so the solver is
one propagation loop over them instead of a special case per combination.

## Exported constants

Names this module publishes that are not methods. The method contracts
above and below refer to these by role — a command, a node type, a panel —
so this is the vocabulary they assume.

### `COUPLED`

The eleven parameters bound together by the relations below.

Le, the Le exponent and Xmax are absent on purpose: they are genuinely
independent of the rest and are always editable.

Values: `Fs`, `Qts`, `Qes`, `Qms`, `Vas`, `Re`, `Bl`, `Mms`, `Cms`, `Sd`, `Rms`

### `BASIS_SIZE`

How many parameters must be held for the other five to follow.

Eleven quantities minus five independent relations. Any set of this size
that `canSolve` accepts is a legitimate basis.

Value: `6`

### `DEFAULT_BASIS`

The set held by default: the physical parameters, which is Hornresp's.

Ordered oldest-first, which is the order locks give way in when room has
to be made for a new one.

Values: `Sd`, `Bl`, `Cms`, `Rms`, `Mms`, `Re`

### `RELATIONS`

The five relations, each listing the parameters it binds together.

A relation with exactly one unknown among its `vars` can produce that
unknown, which is the whole of the solver below.

An array of 5 entries.

## EXPORTED (6)

### `round6(v)`

- **Reachability:** EXPORTED
- **Obtain via:** import { round6 } from '../../src/driverParams.js'

Round to six significant figures.

Derived values feed the next derivation, so they are rounded for display
rather than for storage precision — six figures is far past what a
datasheet justifies and keeps repeated round trips from drifting.

**Parameters**

- `v` — `number` — The value.

**Returns**

- `number` — The rounded value, or the input unchanged when it is not finite.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `derive(params, basis)`

- **Reachability:** EXPORTED
- **Obtain via:** import { derive } from '../../src/driverParams.js'

Derive every parameter outside the basis from the ones inside it.

Repeated passes rather than a fixed order: each pass takes any relation
with exactly one unknown left and fills it in, until everything is known
or a pass achieves nothing. Because there are five relations and five
parameters outside a correctly sized basis, resolving all of them means
each relation was used exactly once — so a complete result is also a
consistent one, and an incomplete one means the basis was not a basis.

**Parameters**

- `params` — `object` — Current values in display units. Only the basis entries are read.
- `basis` — `string[]` — The parameters being held.

**Returns**

- `{ok: boolean, values: object, unresolved: string[]}` — Whether everything resolved, the derived values (basis excluded), and the names that could not be reached.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `canSolve(basis)`

- **Reachability:** EXPORTED
- **Obtain via:** import { canSolve } from '../../src/driverParams.js'

Whether a set of parameters determines all the others.

**Parameters**

- `basis` — `string[]` — Candidate basis.

**Returns**

- `boolean` — True when it is the right size and everything else follows from it.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `lockParam(basis, key)`

- **Reachability:** EXPORTED
- **Obtain via:** import { lockParam } from '../../src/driverParams.js'

Add a parameter to the basis, dropping whichever one makes room.

The basis is ordered oldest-first, so the parameter that gives way is the
one the user pinned longest ago — and only if what remains still resolves.
Candidates are tried in that order, so the newest choices survive.

**Parameters**

- `basis` — `string[]` — The current basis, oldest first.
- `key` — `string` — The parameter to start holding.

**Returns**

- `string[]|null` — The new basis, or `null` when nothing can be dropped for it.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `unlockParam(basis, key)`

- **Reachability:** EXPORTED
- **Obtain via:** import { unlockParam } from '../../src/driverParams.js'

Remove a parameter from the basis, promoting another to keep it complete.

Candidates are tried in the canonical parameter order, so the same release
always produces the same replacement rather than depending on history.

**Parameters**

- `basis` — `string[]` — The current basis, oldest first.
- `key` — `string` — The parameter to stop holding.

**Returns**

- `string[]|null` — The new basis, or `null` when no replacement completes it.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `basisOf(node)`

- **Reachability:** EXPORTED
- **Obtain via:** import { basisOf } from '../../src/driverParams.js'

The basis a driver node is using, falling back to the default.

A node that has never had a lock touched has no stored basis, and a stored
one that no longer resolves — hand-edited, or written by an older version —
is discarded rather than trusted.

**Parameters**

- `node` — `object` — The driver node.

**Returns**

- `string[]` — The basis, oldest first.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

## UNREACHABLE (6)

### `si(v, key)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

One parameter's value in SI units.

**Parameters**

- `v` — `object` — Parameter values in display units.
- `key` — `string` — Parameter name.

**Returns**

- `number` — The value in SI.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `relCompliance(target, v)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Compliance, equivalent volume and cone area: Vas = ρc²·Sd²·Cms.

**Parameters**

- `target` — `string` — Which of the three to compute.
- `v` — `object` — The other values, in display units.

**Returns**

- `number` — The target's value in display units.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `relResonance(target, v)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Resonance, mass and compliance: Fs = 1 / (2π√(Mms·Cms)).

**Parameters**

- `target` — `string` — Which of the three to compute.
- `v` — `object` — The other values, in display units.

**Returns**

- `number` — The target's value in display units.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `relMechanicalQ(target, v)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Mechanical Q: Qms = 2πFs·Mms / Rms.

**Parameters**

- `target` — `string` — Which of the four to compute.
- `v` — `object` — The other values, in display units.

**Returns**

- `number` — The target's value in display units.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `relElectricalQ(target, v)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Electrical Q: Qes = 2πFs·Mms·Re / Bl².

**Parameters**

- `target` — `string` — Which of the five to compute.
- `v` — `object` — The other values, in display units.

**Returns**

- `number` — The target's value in display units.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `relTotalQ(target, v)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Total Q: Qts = Qes·Qms / (Qes + Qms).

**Parameters**

- `target` — `string` — Which of the three to compute.
- `v` — `object` — The other values, in display units.

**Returns**

- `number` — The target's value in display units.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.
