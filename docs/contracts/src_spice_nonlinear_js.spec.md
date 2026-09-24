# Contract specification: `src/spice/nonlinear.js`

> Generated from method contracts. This file contains **no implementation code**.
> Write tests against what is claimed here, not against what you expect the code to do.

## Module

Large-signal driver curves as behavioural-source expressions.

A driver's Bl(x), Kms(x)/Cms(x) and Le(x) curves are the Nonlinear Lab's
ratio curves (see src/engine/nonlinear.js): baseline table or polynomial,
Gaussian control points, symmetry and extrapolation past Xmax. Rather than
re-express each of those as a formula, the curve is sampled finely in
JavaScript — with exactly the function the Lab draws — and handed to SPICE
as a piecewise-linear function of the excursion node. What the Lab shows is
what the circuit uses.

## EXPORTED (5)

### `curveSpan(xmax)`

- **Reachability:** EXPORTED
- **Obtain via:** import { curveSpan } from '../../src/spice/nonlinear.js'

The excursion range a curve is sampled over, mm either side of rest.

**Parameters**

- `xmax` — `number` — The driver's Xmax, mm.

**Returns**

- `number` — Four times Xmax, at least 20 mm.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `pwlOf(f, span, x)`

- **Reachability:** EXPORTED
- **Obtain via:** import { pwlOf } from '../../src/spice/nonlinear.js'

A `pwl` expression of a function of excursion, flat beyond the sampled span.

ngspice extends a `pwl` along its end slopes, so each end is pinned by a
far-away point at the same value.

**Parameters**

- `f` — `Function` — mm → value.
- `span` — `number` — Sampled half-range, mm.
- `x` — `string` — The expression for excursion in metres, e.g. `v(n12)`.

**Returns**

- `string` — The expression.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `stiffnessRatio(nl, xmax)`

- **Reachability:** EXPORTED
- **Obtain via:** import { stiffnessRatio } from '../../src/spice/nonlinear.js'

Stiffness as a ratio of the small-signal value, from whichever suspension curve has content.

A Kms curve is stiffness already; a Cms curve is its reciprocal.

**Parameters**

- `nl` — `object|null|undefined` — A driver's curve set.
- `xmax` — `number` — Xmax, mm, for extrapolation.

**Returns**

- `Function|null` — mm → stiffness ratio, or `null` when the suspension is linear.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `ratioOf(curve, xmax)`

- **Reachability:** EXPORTED
- **Obtain via:** import { ratioOf } from '../../src/spice/nonlinear.js'

A curve's ratio as a function of excursion, or `null` when it has no content.

**Parameters**

- `curve` — `object|null|undefined` — A Lab curve.
- `xmax` — `number` — Xmax, mm.

**Returns**

- `Function|null` — mm → ratio.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `slopeOf(f)`

- **Reachability:** EXPORTED
- **Obtain via:** import { slopeOf } from '../../src/spice/nonlinear.js'

The slope of a function of excursion, per metre, by central difference.

**Parameters**

- `f` — `Function` — mm → value.

**Returns**

- `Function` — mm → d(value)/dx in 1/m.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

## UNREACHABLE (1)

### `pwlOf > n(v)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

A number written for the netlist.

**Parameters**

- `v` — `number` — The value.

**Returns**

- `string` — Eight significant figures.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.
