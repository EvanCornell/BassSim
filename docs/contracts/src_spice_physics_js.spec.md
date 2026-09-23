# Contract specification: `src/spice/physics.js`

> Generated from method contracts. This file contains **no implementation code**.
> Write tests against what is claimed here, not against what you expect the code to do.

## Module

Physical constants and loss laws the SPICE compiler builds elements from.

Losses are derived from geometry here rather than typed in as a Q. Each law
is the standard textbook result, stated with its range of validity.

## Exported constants

Names this module publishes that are not methods. The method contracts
above and below refer to these by role — a command, a node type, a panel —
so this is the vocabulary they assume.

### `MU`

Dynamic viscosity of air at 20 °C, Pa·s.

Value: `0.0000181`

### `KAPPA`

Thermal conductivity of air at 20 °C, W/(m·K).

Value: `0.0257`

### `CP`

Specific heat of air at constant pressure, J/(kg·K).

Value: `1005`

### `GAMMA`

Ratio of specific heats for air.

Value: `1.4`

### `SOLID_ANGLE`

Solid angle Ω in steradians for each named radiating space.

Keys: `free`, `half`, `quarter`, `eighth`

## EXPORTED (5)

### `perimeter(S, shape)`

- **Reachability:** EXPORTED
- **Obtain via:** import { perimeter } from '../../src/spice/physics.js'

Perimeter of a duct or chamber cross-section.

Waveguides are treated as round — the equivalent-radius assumption the rest
of the model makes, and one that under-reads a slot's perimeter. Chambers
follow their `shape`: square for rectangular, round for cylindrical.

**Parameters**

- `S` — `number` — Cross-section area, m².
- `shape` — `string` _(optional, default `'round'`)_ — `round`, `cylindrical` or `rectangular`.

**Returns**

- `number` — Perimeter, m.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `viscousCoeff(S, P)`

- **Reachability:** EXPORTED
- **Obtain via:** import { viscousCoeff } from '../../src/spice/physics.js'

Viscous boundary-layer loss per unit length, as the coefficient of √(jω).

In a duct much wider than the viscous boundary layer δ = √(2μ/ρω), wall
friction adds a series impedance per metre of `(P/S²)·√(ρμ)·√(jω)` — a
resistance and an equal mass, both rising as √f. Valid while the duct's
hydraulic radius is several δ (δ ≈ 0.3 mm at 45 Hz), which holds for any
practical port.

**Parameters**

- `S` — `number` — Cross-section area, m².
- `P` — `number` — Perimeter, m.

**Returns**

- `number` — The coefficient A in Z′ = A·√(jω), Pa·s^½/m⁴ per metre.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `thermalCoeff(P)`

- **Reachability:** EXPORTED
- **Obtain via:** import { thermalCoeff } from '../../src/spice/physics.js'

Thermal boundary-layer loss per unit length, as the coefficient of √(jω).

Heat exchange with the walls makes compression slightly isothermal near
them, which adds a shunt admittance per metre of
`(γ−1)·P/(ρc²)·√(κ/ρc_p)·√(jω)`. This is the main wall loss inside a
box, where it acts on the air's springiness.

**Parameters**

- `P` — `number` — Perimeter, m.

**Returns**

- `number` — The coefficient B in Y′ = B·√(jω), per metre.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `flowResistivity(gPerL)`

- **Reachability:** EXPORTED
- **Obtain via:** import { flowResistivity } from '../../src/spice/physics.js'

Flow resistivity of fibrous stuffing, Pa·s/m².

Bies & Hansen's empirical law for fibrous absorbers,
σ = 27.3·(ρ_bulk/ρ_fibre)^1.53·μ/d², for polyester fibre (1380 kg/m³) of
20 µm diameter. An estimate: real fill varies by a factor of two or more
with fibre and packing.

**Parameters**

- `gPerL` — `number` — Stuffing density, g/L (= kg/m³).

**Returns**

- `number` — Flow resistivity, Pa·s/m²; 0 for no stuffing.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `stuffedSoundSpeed(gPerL)`

- **Reachability:** EXPORTED
- **Obtain via:** import { stuffedSoundSpeed } from '../../src/spice/physics.js'

Speed of sound in a stuffed volume.

Fill shifts compression from adiabatic toward isothermal, slowing sound by
up to 15.5% at 8 g/L, beyond which it stops changing.

**Parameters**

- `gPerL` — `number` — Stuffing density, g/L.

**Returns**

- `number` — Speed of sound, m/s.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.
