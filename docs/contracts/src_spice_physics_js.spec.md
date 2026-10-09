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

## EXPORTED (10)

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

### `driverSI(p)`

- **Reachability:** EXPORTED
- **Obtain via:** import { driverSI } from '../../src/spice/physics.js'

Convert a driver node's display-unit parameters into the SI set the compiler builds from.

This is also where a multi-driver node collapses into one equivalent driver.
Series wiring multiplies Re, Le and Bl by the count; parallel wiring divides
the electrical terms; series-parallel splits the count into a square grid
when it is a perfect square and falls back to plain parallel when it is not.
The mechanical side scales with cone count regardless of wiring: Sd, Mms and
Rms multiply, Cms divides.

Every field has a fallback, so a partially filled node still simulates rather
than producing NaN. That is deliberate — the editor lets you drop a driver on
the canvas before typing any numbers.

**Parameters**

- `p` — `object` — Driver node params in display units (Sd cm², Mms g, Cms mm/N, Le mH, Xmax mm).

**Returns**

- `{n: number, s: number, par: number, Re: number, Le: number, LeExp: number, Bl: number, Sd: number, Mms: number, Cms: number, Rms: number, Xmax: number}` — The equivalent single driver in SI units, plus the resolved count and the series/parallel multipliers.

**Postconditions (must hold on return)**

- result.n >= 1
- p is not modified

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `besselJ1(x)`

- **Reachability:** EXPORTED
- **Obtain via:** import { besselJ1 } from '../../src/spice/physics.js'

Bessel function of the first kind, order 1.

Abramowitz & Stegun rational approximations, split at |x| = 8 between the
small-argument polynomial and the large-argument asymptotic form. Accurate
to roughly 1e-8.

**Parameters**

- `x` — `number` — Argument, dimensionless (here 2ka).

**Returns**

- `number` — J₁(x).

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `besselJ0(x)`

- **Reachability:** EXPORTED
- **Obtain via:** import { besselJ0 } from '../../src/spice/physics.js'

Bessel function of the first kind, order 0.

Abramowitz & Stegun rational approximations, split at |x| = 8. Used only as
an input to `struveH1`.

**Parameters**

- `x` — `number` — Argument, dimensionless.

**Returns**

- `number` — J₀(x).

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `struveH1(x)`

- **Reachability:** EXPORTED
- **Obtain via:** import { struveH1 } from '../../src/spice/physics.js'

Struve function H₁, via the Aarts & Janssen (2003) approximation.

Roughly 1e-3 relative over the usable range — well inside the error of the
rigid-piston assumption it feeds.

**Parameters**

- `x` — `number` — Argument, dimensionless (here 2ka).

**Returns**

- `number` — H₁(x); exactly 0 at x = 0.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `pistonImpedance(S, w)`

- **Reachability:** EXPORTED
- **Obtain via:** import { pistonImpedance } from '../../src/spice/physics.js'

Radiation impedance of a flanged circular piston: `ρc/S · (R1(2ka) + jX1(2ka))`.

The exact curve the radiation network is fitted to. Below 2ka ≈ 1e-3 the
leading terms x²/8 and 2x/3π replace `1 − 2J₁(x)/x`, which cancels
catastrophically there.

**Parameters**

- `S` — `number` — Piston area, m².
- `w` — `number` — Angular frequency ω, rad/s.

**Returns**

- `{re: number, im: number}` — Acoustic radiation impedance, Pa·s/m³.

**Preconditions (caller must guarantee)**

- S > 0
- w >= 0

**Postconditions (must hold on return)**

- result.re >= 0

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.
