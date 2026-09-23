# Contract specification: `src/spice/networks.js`

> Generated from method contracts. This file contains **no implementation code**.
> Write tests against what is claimed here, not against what you expect the code to do.

## Module

Fitted networks as netlist elements.

`fit.js` finds non-negative weights for passive building blocks; this module
turns a fit into resistors, inductors and capacitors between netlist nodes,
scaled to a physical impedance level and frequency.

## EXPORTED (8)

### `seriesNetwork(nl, a, b, fit, zScale, omegaScale, note)`

- **Reachability:** EXPORTED
- **Obtain via:** import { seriesNetwork } from '../../src/spice/networks.js'

Add a fitted series impedance between two nodes.

Each atom becomes one section in a series chain: R‖L for a corner, R‖L‖C
for a resonance. Normalized frequency q maps to ω = q·ωs.

**Parameters**

- `nl` — `object` — A netlist builder.
- `a` — `string` — Start node.
- `b` — `string` — End node.
- `fit` — `Array<object>` — Atoms with weights.
- `zScale` — `number` — Impedance a unit weight stands for.
- `omegaScale` — `number` — ωs, rad/s per unit of q.
- `note` — `string` _(optional)_ — Comment on each element.

**Returns**

- `void`

**Throws**

- `Error` — When the fit has no sections, which a successful fit never produces.

**Mutates**

- nl.

### `shuntNetwork(nl, node, fit, yScale, omegaScale, note)`

- **Reachability:** EXPORTED
- **Obtain via:** import { shuntNetwork } from '../../src/spice/networks.js'

Add a fitted shunt admittance from a node to the reference.

Each corner atom becomes one series R–C branch, whose admittance is
G·jq/(jq + q0): the dual of an R‖L section.

**Parameters**

- `nl` — `object` — A netlist builder.
- `node` — `string` — The node.
- `fit` — `Array<object>` — Corner atoms with weights.
- `yScale` — `number` — Admittance a unit weight stands for.
- `omegaScale` — `number` — ωs, rad/s per unit of q.
- `note` — `string` _(optional)_ — Comment on each element.

**Returns**

- `void`

**Mutates**

- nl.

### `fitBand(fmin, fmax)`

- **Reachability:** EXPORTED
- **Obtain via:** import { fitBand } from '../../src/spice/networks.js'

The band a fractional element must be accurate over, for an analysis.

Half an octave-and-a-bit beyond the sweep on each side, never below 0.5 Hz.

**Parameters**

- `fmin` — `number` — Lowest analysed frequency, Hz.
- `fmax` — `number` — Highest analysed frequency, Hz.

**Returns**

- `{f1: number, f2: number}` — The band, Hz.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `fractionalSeries(nl, a, b, alpha, coeff, band, note, perDecade)`

- **Reachability:** EXPORTED
- **Obtain via:** import { fractionalSeries } from '../../src/spice/networks.js'

Add a series impedance `coeff·(jω)^α` between two nodes.

**Parameters**

- `nl` — `object` — A netlist builder.
- `a` — `string` — Start node.
- `b` — `string` — End node.
- `alpha` — `number` — Exponent, 0 < α < 1.
- `coeff` — `number` — Coefficient, in the units of the impedance per (rad/s)^α.
- `band` — `{f1: number, f2: number}` — Where the approximation must hold, Hz.
- `note` — `string` _(optional)_ — Comment.
- `perDecade` — `number` _(optional, default `1.5`)_ — Fit density; 1.5 fits √(jω) to about 0.3%, ample for a loss term.

**Returns**

- `void`

**Mutates**

- nl.

### `fractionalShunt(nl, node, alpha, coeff, band, note, perDecade)`

- **Reachability:** EXPORTED
- **Obtain via:** import { fractionalShunt } from '../../src/spice/networks.js'

Add a shunt admittance `coeff·(jω)^α` from a node to the reference.

**Parameters**

- `nl` — `object` — A netlist builder.
- `node` — `string` — The node.
- `alpha` — `number` — Exponent, 0 < α < 1.
- `coeff` — `number` — Coefficient, admittance per (rad/s)^α.
- `band` — `{f1: number, f2: number}` — Where the approximation must hold, Hz.
- `note` — `string` _(optional)_ — Comment.
- `perDecade` — `number` _(optional, default `1.5`)_ — Fit density; 1.5 fits √(jω) to about 0.3%, ample for a loss term.

**Returns**

- `void`

**Mutates**

- nl.

### `halfSpaceRadiationFit()`

- **Reachability:** EXPORTED
- **Obtain via:** import { halfSpaceRadiationFit } from '../../src/spice/networks.js'

The fitted normalized radiation impedance of a flanged piston.

`z(q) = Z/(ρc/S)` as a function of q = ka, fitted over 0.003 ≤ ka ≤ 12 with
both parts weighted by their own size, so the tiny low-frequency radiation
resistance — which sets the radiated power — is fitted as tightly as the
reactance.

**Returns**

- `Array<object>` — Atoms with weights.

**Reads external mutable state**

- A module-level cache.

### `radiationScale(S, space)`

- **Reachability:** EXPORTED
- **Obtain via:** import { radiationScale } from '../../src/spice/networks.js'

The radiation impedance an opening sees in a solid angle, as a network.

Image-source model: an opening flush at the junction of the boundaries that
bound a solid angle Ω radiates like itself plus its images — a piston of n
times the area in half space, n = 2π/Ω — so `Z_Ω(S) = n·Z_half(n·S)`. At low
ka that multiplies the radiation resistance by n and the mass by √n; at high
ka every case tends to ρc/S. Because it is a rescaled half-space impedance
it is causal and passive, and one fit serves every solid angle.

**Parameters**

- `S` — `number` — Opening area, m².
- `space` — `string` — `free`, `half`, `quarter` or `eighth`; anything else is treated as half space.

**Returns**

- `{zScale: number, omegaScale: number, omega: number}` — The scale factors for `halfSpaceRadiationFit`, and Ω for the far-field pressure.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `radiationLoad(nl, node, S, space, note)`

- **Reachability:** EXPORTED
- **Obtain via:** import { radiationLoad } from '../../src/spice/networks.js'

Add a radiation load from a node to the reference.

`rigid` adds nothing — a closed end. `anechoic` is the resistance ρc/S.
Anything else is the fitted piston network for that solid angle.

**Parameters**

- `nl` — `object` — A netlist builder.
- `node` — `string` — The node the flow radiates from.
- `S` — `number` — Opening area, m².
- `space` — `string` — Solid angle name, `rigid` or `anechoic`.
- `note` — `string` _(optional)_ — Comment.

**Returns**

- `number|null` — Ω for the far-field pressure, or `null` when nothing radiates.

**Mutates**

- nl.
