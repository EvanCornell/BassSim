# Contract specification: `src/engine/acoustics.js`

> Generated from method contracts. This file contains **no implementation code**.
> Write tests against what is claimed here, not against what you expect the code to do.

## EXPORTED (9)

### `besselJ1(x)`

- **Reachability:** EXPORTED
- **Obtain via:** import { besselJ1 } from '../../src/engine/acoustics.js'

Bessel function of the first kind, order 1.

Abramowitz & Stegun rational approximations, split at |x| = 8 between the
small-argument polynomial and the large-argument asymptotic form. Accurate
to roughly 1e-8 — far below the modelling error of the piston assumption
itself, and much faster than a series evaluation in the frequency loop.

**Parameters**

- `x` — `number` — Argument, dimensionless (here 2ka).

**Returns**

- `number` — J₁(x).

**Postconditions (must hold on return)**

- result === -J1(-x) — the function is odd

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `besselJ0(x)`

- **Reachability:** EXPORTED
- **Obtain via:** import { besselJ0 } from '../../src/engine/acoustics.js'

Bessel function of the first kind, order 0.

Abramowitz & Stegun rational approximations, split at |x| = 8. Used only as
an input to `struveH1`.

**Parameters**

- `x` — `number` — Argument, dimensionless.

**Returns**

- `number` — J₀(x).

**Postconditions (must hold on return)**

- result === J0(-x) — the function is even

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `struveH1(x)`

- **Reachability:** EXPORTED
- **Obtain via:** import { struveH1 } from '../../src/engine/acoustics.js'

Struve function H₁, via the Aarts & Janssen (2003) approximation.

Supplies the reactive (mass-loading) half of the piston radiation impedance.
The approximation is a closed form in J₀, sin and cos, so it costs a handful
of flops per frequency point instead of a series summation.

**Parameters**

- `x` — `number` — Argument, dimensionless (here 2ka).

**Returns**

- `number` — H₁(x); exactly 0 at x = 0, which the series form cannot evaluate directly.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `radiationImpedance(S, solidAngle, w)`

- **Reachability:** EXPORTED
- **Obtain via:** import { radiationImpedance } from '../../src/engine/acoustics.js'

Radiation impedance of a circular piston of area S into a solid angle.

Baseline is the flanged piston (2π): `Z = ρc/S · (R1(2ka) + jX1(2ka))`.
Smaller solid angles raise the low-frequency radiation resistance by 2π/Ω —
this is the corner loading that makes a subwoofer louder in a room corner —
while converging to ρc/S at high ka, where the piston no longer knows what
is behind it. The interpolation is smooth rather than a switch, so the
transition introduces no step in the SPL curve.

Two pseudo-terminations short-circuit the piston model entirely: `rigid`
returns a near-infinite impedance (a closed wall passes no volume velocity)
and `anechoic` returns the real characteristic impedance ρc/S (a perfectly
absorbing end with no reflection).

**Parameters**

- `S` — `number` — Piston area, m². Clamped to ≥1e-8 when deriving the radius, so a degenerate port cannot produce a NaN radius.
- `solidAngle` — `'free'|'half'|'quarter'|'eighth'|'rigid'|'anechoic'` — Radiating space, or a pseudo-termination. Unrecognised values fall back to half space.
- `w` — `number` — Angular frequency ω, rad/s.

**Returns**

- `Complex` — Acoustic radiation impedance, Pa·s/m³.

**Preconditions (caller must guarantee)**

- w >= 0
- S > 0 — `anechoic` divides by S directly and does not clamp

**Postconditions (must hold on return)**

- Re(result) >= 0 for every solid angle

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `tlineMatrix(S, L, w, Q, c, extraAlpha)`

- **Reachability:** EXPORTED
- **Obtain via:** import { tlineMatrix } from '../../src/engine/acoustics.js'

ABCD matrix of a uniform acoustic transmission line.

The workhorse element: chambers, port slices and horn slices are all built
from it. Because it is a true distributed line rather than a lumped
compliance, standing waves at n·c/2L appear naturally in the response —
which is exactly what resonance masking suppresses when it swaps chambers
for lumped compliances.

Loss enters as an attenuation constant α = k/2Q, so a given Q costs the same
fraction of amplitude per wavelength at every frequency.

**Parameters**

- `S` — `number` — Cross-sectional area, m².
- `L` — `number` — Length, m.
- `w` — `number` — Angular frequency ω, rad/s.
- `Q` — `number|null` — Loss factor. `null`, `Infinity` or ≤0 all mean lossless.
- `c` — `number` _(optional, default `C_AIR`)_ — Speed of sound, m/s. Reduced inside stuffed chambers.
- `extraAlpha` — `number` _(optional, default `0`)_ — Additional attenuation, nepers/m, added on top of the Q-derived term.

**Returns**

- `ABCD` — The two-port matrix for the line.

**Preconditions (caller must guarantee)**

- S > 0

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `seriesMassMatrix(M, w)`

- **Reachability:** EXPORTED
- **Obtain via:** import { seriesMassMatrix } from '../../src/engine/acoustics.js'

ABCD matrix of a lumped series acoustic mass: `[[1, jωM], [0, 1]]`.

Models the slug of air that moves with a port but sits outside its physical
length — the end correction. Applied at a waveguide's throat and mouth by
`waveguideMatrix`.

**Parameters**

- `M` — `number` — Acoustic mass, kg/m⁴ (ρ·ΔL/S).
- `w` — `number` — Angular frequency ω, rad/s.

**Returns**

- `ABCD` — The two-port matrix for the mass.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `waveguideMatrix(seg, w, N)`

- **Reachability:** EXPORTED
- **Obtain via:** import { waveguideMatrix } from '../../src/engine/acoustics.js'

ABCD matrix of a waveguide segment — port, duct or horn.

The segment is discretized into N short uniform slices sampled at the
midpoint of the exact area profile, then cascaded. Stepwise-constant area
converges well for smooth flares because each slice is far shorter than a
wavelength in the modelled band; 24 slices is the point past which the
response stops visibly changing.

End corrections are applied as series masses outside the sliced section, so
they shift the tuning without adding length to the geometry the user drew.

**Parameters**

- `seg` — `object` — Segment geometry.
- `seg.S1` — `number` — Throat area, m².
- `seg.S2` — `number` — Mouth area, m².
- `seg.L` — `number` — Axial length, m.
- `seg.flare` — `'conical'|'parabolic'|'exponential'|'hypex'|'tractrix'|'lecleach'` — Expansion law.
- `seg.Q` — `number|null` — Loss factor applied to every slice.
- `seg.ecThroat` — `number` _(optional, default `0`)_ — Throat end-correction length, m. Skipped when ≤0.
- `seg.ecMouth` — `number` _(optional, default `0`)_ — Mouth end-correction length, m. Skipped when ≤0.
- `w` — `number` — Angular frequency ω, rad/s.
- `N` — `number` _(optional, default `24`)_ — Number of slices.

**Returns**

- `ABCD` — The two-port matrix for the whole segment, throat to mouth.

**Preconditions (caller must guarantee)**

- N >= 1 && seg.L > 0 && seg.S1 > 0

**Postconditions (must hold on return)**

- seg is not modified

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `chamberMatrix(chamber, w, lumped)`

- **Reachability:** EXPORTED
- **Obtain via:** import { chamberMatrix } from '../../src/engine/acoustics.js'

ABCD matrix of a chamber, modelled as a finite transmission line.

Treating a box as a line of area Volume/Length rather than a lumped
compliance is what makes longitudinal standing waves at n·c/2L show up as
real response features — the ripples a lumped model cannot produce.

Stuffing does two things: it slows sound as the process shifts from
adiabatic toward isothermal (up to −15.5% at 8 g/L, where the model
saturates), and it adds resistive loss, combined with the node's own Q in
parallel.

**Parameters**

- `chamber` — `object` — Chamber parameters.
- `chamber.volume` — `number` — Internal volume, m³.
- `chamber.length` — `number` — Acoustic path length, m. Floored at 1e-4 to keep the derived area finite.
- `chamber.Q` — `number|null` — Wall-loss factor.
- `chamber.stuffing` — `number` _(optional, default `0`)_ — Stuffing density, g/L. 0 is empty.
- `w` — `number` — Angular frequency ω, rad/s.
- `lumped` — `boolean` _(optional, default `false`)_ — When true, return a pure shunt compliance instead of a line, hiding standing-wave artifacts. This is the resonance-masking view.

**Returns**

- `ABCD` — The two-port matrix for the chamber.

**Preconditions (caller must guarantee)**

- chamber.volume > 0

**Postconditions (must hold on return)**

- chamber is not modified

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `combineQ(...qs)`

- **Reachability:** EXPORTED
- **Obtain via:** import { combineQ } from '../../src/engine/acoustics.js'

Combine several loss factors into one.

Losses add as reciprocals — `1/Q = Σ 1/Qᵢ` — because each mechanism
dissipates independently, so the combined Q is always at most the lowest
input. Values that are null, non-finite or ≤0 mean "this mechanism is
lossless" and are skipped rather than treated as zero.

**Parameters**

- `qs` — `...(number|null|undefined)` — Individual loss factors.

**Returns**

- `number` — The combined Q, or `Infinity` when no argument contributes any loss.

**Postconditions (must hold on return)**

- result <= every finite positive input

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.
