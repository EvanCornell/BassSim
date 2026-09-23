# Contract specification: `src/spice/fit.js`

> Generated from method contracts. This file contains **no implementation code**.
> Write tests against what is claimed here, not against what you expect the code to do.

## Module

Passive networks fitted to frequency responses no finite circuit has exactly.

Three quantities in the model are not a single R, L or C: the radiation
impedance of an opening (Bessel/Struve in ka), the voice coil's
semi-inductance `Le·(jω)^n`, and boundary-layer loss, which goes as √(jω).
Each is approximated here by a weighted sum of fixed passive building
blocks ("atoms"), with the weights found by non-negative least squares.

Non-negative weights on passive atoms are what make the result safe: every
fitted network is a series chain of positive R‖L (or R‖L‖C) sections, so it
is passive by construction and can never add energy, and it behaves the
same in an AC sweep and in a transient run. The price is that the fit is an
approximation; each use states and tests its own accuracy.

An atom is a unit-weight impedance in a normalized frequency variable q:

  corner(q0)       jq/(jq + q0)                     — R‖L, corner at q0
  resonance(q0,Q)  (jq/(Q·q0)) / (1 − (q/q0)² + jq/(Q·q0))  — R‖L‖C

A weight w scales an atom into a section with R = w, L = w/q0 (and, for a
resonance, L = w/(Q·q0), C = Q/(w·q0)), all in normalized units the caller
scales to physical ones.

## EXPORTED (6)

### `atomZ(atom, q)`

- **Reachability:** EXPORTED
- **Obtain via:** import { atomZ } from '../../src/spice/fit.js'

Unit-weight impedance of one atom at normalized frequency q.

**Parameters**

- `atom` — `{kind: string, q0: number, Q?: number}` — `corner` or `resonance`.
- `q` — `number` — Normalized frequency.

**Returns**

- `{re: number, im: number}` — The atom's impedance.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `nnls(A, b, maxIter)`

- **Reachability:** EXPORTED
- **Obtain via:** import { nnls } from '../../src/spice/fit.js'

Non-negative least squares, min ‖A·x − b‖ subject to x ≥ 0.

Lawson–Hanson active set method. Sizes here are small (a few hundred rows,
a few dozen columns), so dense normal-equation solves are fine.

**Parameters**

- `A` — `number[][]` — Row-major matrix, m × n.
- `b` — `number[]` — Target, length m.
- `maxIter` — `number` _(optional, default `500`)_ — Iteration cap.

**Returns**

- `number[]` — The non-negative solution, length n.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `fitAtoms(atoms, samples, componentwise)`

- **Reachability:** EXPORTED
- **Obtain via:** import { fitAtoms } from '../../src/spice/fit.js'

Fit non-negative atom weights to a complex target response.

Each sample contributes its real and imaginary parts as two rows. By
default both are divided by the target's magnitude, so the fit minimizes
relative error in |Z|. With `componentwise`, each part is divided by its own
magnitude instead — needed where one part is much smaller than the other but
still matters, as radiation resistance does at low ka, where it is tiny next
to the reactance yet sets the radiated power. Atoms whose weight comes out
zero are dropped.

**Parameters**

- `atoms` — `Array<object>` — Candidate atoms.
- `samples` — `Array<{q: number, z: {re: number, im: number}, w?: number}>` — Target samples.
- `componentwise` — `boolean` _(optional, default `false`)_ — Weight the real and imaginary parts by their own magnitudes.

**Returns**

- `Array<object>` — The atoms kept, each with its `weight`.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `fitZ(fit, q)`

- **Reachability:** EXPORTED
- **Obtain via:** import { fitZ } from '../../src/spice/fit.js'

Impedance of a fitted network at normalized frequency q.

**Parameters**

- `fit` — `Array<object>` — Atoms with weights, from `fitAtoms`.
- `q` — `number` — Normalized frequency.

**Returns**

- `{re: number, im: number}` — The network's impedance.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `logspace(lo, hi, n)`

- **Reachability:** EXPORTED
- **Obtain via:** import { logspace } from '../../src/spice/fit.js'

Logarithmically spaced values, inclusive.

**Parameters**

- `lo` — `number` — First value.
- `hi` — `number` — Last value.
- `n` — `number` — Count, at least 2.

**Returns**

- `number[]` — The values.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `fitFractional(alpha, qMax, perDecade)`

- **Reachability:** EXPORTED
- **Obtain via:** import { fitFractional } from '../../src/spice/fit.js'

Fit `(jq)^α` for 0 < α < 1 over q ∈ [1, qMax] with R‖L corners.

Used for the voice coil's semi-inductance and for boundary-layer loss
(α = ½). The caller maps its band onto [1, qMax] by choosing the frequency
unit, then scales the weights by its coefficient. Corners extend a decade
beyond the band on each side so the fit holds right to its edges.

**Parameters**

- `alpha` — `number` — Exponent, 0 < α < 1.
- `qMax` — `number` _(optional, default `1e4`)_ — Upper end of the band, as a multiple of its lower end.
- `perDecade` — `number` _(optional, default `3`)_ — Candidate corners per decade; fewer means a smaller network and a looser fit.

**Returns**

- `Array<object>` — Corner atoms with weights.

**Reads external mutable state**

- A module-level cache keyed by the arguments.

## UNREACHABLE (2)

### `nnls > gradient()`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

The gradient Aᵀ(b − A·x).

**Returns**

- `number[]` — One entry per column.

**Reads external mutable state**

- the enclosing `A`, `b` and `x`.

### `nnls > solveFree(P)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Unconstrained least squares restricted to the free set.

**Parameters**

- `P` — `number[]` — Column indices in the free set.

**Returns**

- `number[]` — A full-length vector, zero outside P.

**Reads external mutable state**

- the enclosing `A` and `b`.
