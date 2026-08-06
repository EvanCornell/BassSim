# Contract specification: `src/engine/complex.js`

> Generated from method contracts. This file contains **no implementation code**.
> Write tests against what is claimed here, not against what you expect the code to do.

## Module

Thin complex-arithmetic layer over math.js Complex instances.
math.js complex numbers are Complex.js objects exposing fast instance
methods (.add, .mul, ...), which we use directly in the hot loop.

Every operation here returns a new Complex; none mutate their arguments.
That is what makes the whole module `@pure` and lets the solver reuse
operand instances across the 512-point frequency sweep without defensive
copying.

## Exported constants

Names this module publishes that are not methods. The method contracts
above and below refer to these by role — a command, a node type, a panel —
so this is the vocabulary they assume.

### `ZERO`

Complex additive identity, `0 + 0j`. Shared instance — never mutate it.

### `ONE`

Complex multiplicative identity, `1 + 0j`. Shared instance — never mutate it.

## EXPORTED (18)

### `C(re, im)`

- **Reachability:** EXPORTED
- **Obtain via:** import { C } from '../../src/engine/complex.js'

Construct a complex number.

**Parameters**

- `re` — `number` — Real part.
- `im` — `number` _(optional, default `0`)_ — Imaginary part.

**Returns**

- `Complex` — The value `re + j·im`.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `add(a, b)`

- **Reachability:** EXPORTED
- **Obtain via:** import { add } from '../../src/engine/complex.js'

Complex addition.

**Parameters**

- `a` — `Complex` — Left operand.
- `b` — `Complex` — Right operand.

**Returns**

- `Complex` — `a + b`, as a new instance.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `sub(a, b)`

- **Reachability:** EXPORTED
- **Obtain via:** import { sub } from '../../src/engine/complex.js'

Complex subtraction.

**Parameters**

- `a` — `Complex` — Minuend.
- `b` — `Complex` — Subtrahend.

**Returns**

- `Complex` — `a - b`, as a new instance.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `mul(a, b)`

- **Reachability:** EXPORTED
- **Obtain via:** import { mul } from '../../src/engine/complex.js'

Complex multiplication.

**Parameters**

- `a` — `Complex` — Left operand.
- `b` — `Complex` — Right operand.

**Returns**

- `Complex` — `a · b`, as a new instance.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `div(a, b)`

- **Reachability:** EXPORTED
- **Obtain via:** import { div } from '../../src/engine/complex.js'

Complex division.

**Parameters**

- `a` — `Complex` — Dividend.
- `b` — `Complex` — Divisor.

**Returns**

- `Complex` — `a / b`, as a new instance. Division by zero yields Infinity or NaN components rather than throwing, so a degenerate network produces a visibly broken curve instead of aborting the sweep.

**Preconditions (caller must guarantee)**

- b is non-zero for the result to be meaningful

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `inv(a)`

- **Reachability:** EXPORTED
- **Obtain via:** import { inv } from '../../src/engine/complex.js'

Complex reciprocal.

**Parameters**

- `a` — `Complex` — Value to invert.

**Returns**

- `Complex` — `1 / a`, as a new instance.

**Preconditions (caller must guarantee)**

- a is non-zero

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `neg(a)`

- **Reachability:** EXPORTED
- **Obtain via:** import { neg } from '../../src/engine/complex.js'

Complex negation.

**Parameters**

- `a` — `Complex` — Value to negate.

**Returns**

- `Complex` — `-a`, as a new instance.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `abs(a)`

- **Reachability:** EXPORTED
- **Obtain via:** import { abs } from '../../src/engine/complex.js'

Magnitude (modulus) of a complex number.

**Parameters**

- `a` — `Complex` — Value to measure.

**Returns**

- `number` — `|a|`, always ≥ 0.

**Postconditions (must hold on return)**

- result >= 0

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `arg(a)`

- **Reachability:** EXPORTED
- **Obtain via:** import { arg } from '../../src/engine/complex.js'

Argument (phase angle) of a complex number.

**Parameters**

- `a` — `Complex` — Value to measure.

**Returns**

- `number` — `arg(a)` in radians, in (−π, π].

**Postconditions (must hold on return)**

- -Math.PI < result && result <= Math.PI

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `cosh(a)`

- **Reachability:** EXPORTED
- **Obtain via:** import { cosh } from '../../src/engine/complex.js'

Hyperbolic cosine of a complex number.

Used for the transmission-line element, where `cosh(Γl)` gives the A and D
entries of a lossy duct's ABCD matrix.

**Parameters**

- `a` — `Complex` — Complex argument, typically a propagation constant × length.

**Returns**

- `Complex` — `cosh(a)`.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `sinh(a)`

- **Reachability:** EXPORTED
- **Obtain via:** import { sinh } from '../../src/engine/complex.js'

Hyperbolic sine of a complex number.

Supplies the off-diagonal `sinh(Γl)` terms of a transmission-line matrix.

**Parameters**

- `a` — `Complex` — Complex argument, typically a propagation constant × length.

**Returns**

- `Complex` — `sinh(a)`.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `jw(w)`

- **Reachability:** EXPORTED
- **Obtain via:** import { jw } from '../../src/engine/complex.js'

The imaginary frequency operator `jω`.

**Parameters**

- `w` — `number` — Angular frequency ω, rad/s.

**Returns**

- `Complex` — `0 + jω`.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `jwPow(w, n)`

- **Reachability:** EXPORTED
- **Obtain via:** import { jwPow } from '../../src/engine/complex.js'

The semi-inductance operator `(jω)ⁿ`.

Real voice coils behave as `Le·(jω)ⁿ` with n ≈ 0.6–0.8 rather than as an
ideal inductor (n = 1), because eddy currents in the pole piece make the
impedance rise more slowly than 6 dB/octave. Exponent n is the driver's
`LeExp` parameter.

**Parameters**

- `w` — `number` — Angular frequency ω, rad/s.
- `n` — `number` — Semi-inductance exponent, typically 0.5–1.

**Returns**

- `Complex` — `(jω)ⁿ` on the principal branch.

**Preconditions (caller must guarantee)**

- w > 0 — the principal branch goes through log(jω), which is undefined at zero. The sweep is logarithmic and never reaches it.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `matMul(M, N)`

- **Reachability:** EXPORTED
- **Obtain via:** import { matMul } from '../../src/engine/complex.js'

Multiply two ABCD matrices, cascading two two-ports into one.

Order matters and follows signal flow: `matMul(M, N)` is the network in
which M's output feeds N's input.

**Parameters**

- `M` — `ABCD` — Upstream two-port.
- `N` — `ABCD` — Downstream two-port.

**Returns**

- `ABCD` — The cascade `M · N`, as a new matrix.

**Postconditions (must hold on return)**

- Neither M nor N is modified.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `matIdentity()`

- **Reachability:** EXPORTED
- **Obtain via:** import { matIdentity } from '../../src/engine/complex.js'

The identity two-port, representing a lossless connection of zero length.

Returns a fresh array each call — it is the seed of `reduce`-style cascades
and callers are free to overwrite it.

**Returns**

- `ABCD` — `[[1, 0], [0, 1]]`.

**Postconditions (must hold on return)**

- result is a newly allocated matrix sharing the ZERO/ONE constants

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `zInFromMatrix(M, Zl)`

- **Reachability:** EXPORTED
- **Obtain via:** import { zInFromMatrix } from '../../src/engine/complex.js'

Input impedance of a two-port terminated in a load.

`Zin = (A·Zl + B) / (C·Zl + D)`.

**Parameters**

- `M` — `ABCD` — The two-port between the input and the load.
- `Zl` — `Complex` — Terminating (load) impedance, Pa·s/m³.

**Returns**

- `Complex` — Impedance seen at the input, Pa·s/m³.

**Preconditions (caller must guarantee)**

- C·Zl + D is non-zero — it vanishes only at a parallel resonance of a lossless network, which the per-node Q terms prevent

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `propagate(M, p1, U1)`

- **Reachability:** EXPORTED
- **Obtain via:** import { propagate } from '../../src/engine/complex.js'

Carry an acoustic state through a two-port, from input to output.

Given the input state `[p1, U1]` and a matrix M defined by
`[p1; U1] = M · [p2; U2]`, this solves for the output state `[p2, U2]` by
applying M⁻¹.

The determinant is computed rather than assumed to be 1: it is exactly 1 for
a reciprocal lossless network, but the loss terms and the numeric area
profiles push it slightly off, and dividing by the true determinant keeps
the propagation consistent with the matrix that was actually built.

**Parameters**

- `M` — `ABCD` — The two-port to traverse.
- `p1` — `Complex` — Pressure at the input, Pa.
- `U1` — `Complex` — Volume velocity at the input, m³/s.

**Returns**

- `[Complex, Complex]` — The output state `[p2, U2]`.

**Preconditions (caller must guarantee)**

- det(M) is non-zero

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `parallel(zs)`

- **Reachability:** EXPORTED
- **Obtain via:** import { parallel } from '../../src/engine/complex.js'

Parallel (shunt) combination of a list of impedances.

Used at graph junctions, where several branches leaving one output port load
the source simultaneously: `1/Z = Σ 1/Zᵢ`.

**Parameters**

- `zs` — `Complex[]` — Branch impedances, Pa·s/m³.

**Returns**

- `Complex|null` — The combined impedance, or `null` when `zs` is empty — an unconnected port has no load rather than a zero one, and callers must handle that case explicitly.

**Preconditions (caller must guarantee)**

- no element of zs is zero

**Postconditions (must hold on return)**

- zs is not modified

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.
