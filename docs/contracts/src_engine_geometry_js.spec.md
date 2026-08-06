# Contract specification: `src/engine/geometry.js`

> Generated from method contracts. This file contains **no implementation code**.
> Write tests against what is claimed here, not against what you expect the code to do.

## Module

Client-safe geometry helpers: area profiles, volumes, flare cutoff, end
corrections, and physical constants. No solver code — this module is the
only part of the engine shipped to the browser.

Everything here is SI: areas in m², lengths in m, frequencies in Hz. The UI
converts from cm² / cm at the parameter boundary, not here.

## Exported constants

Names this module publishes that are not methods. The method contracts
above and below refer to these by role — a command, a node type, a panel —
so this is the vocabulary they assume.

### `RHO`

Air density ρ, kg/m³, at 20 °C.

Value: `1.184`

### `C_AIR`

Speed of sound c in air, m/s, at 20 °C.

Value: `344`

## EXPORTED (4)

### `areaProfile(flare, S1, S2, L)`

- **Reachability:** EXPORTED
- **Obtain via:** import { areaProfile } from '../../src/engine/geometry.js'

Build the cross-sectional area function S(x) for a waveguide segment.

Returns a closure rather than a sampled table so callers can integrate it at
whatever resolution they need — `waveguideVolume` uses 200 slices, the
solver uses 24.

Tractrix and Le Cléac'h are approximated by hyperbolic-exponential (Salmon)
profiles with different T parameters; their area expansions are close over
the usable band. An unrecognised flare degrades to a straight duct rather
than throwing, so a project saved by a newer version still simulates.

**Parameters**

- `flare` — `'conical'|'parabolic'|'exponential'|'hypex'|'tractrix'|'lecleach'` — Expansion law. Unknown values yield a constant-area duct.
- `S1` — `number` — Throat area, m².
- `S2` — `number` — Mouth area, m².
- `L` — `number` — Axial length, m.

**Returns**

- `(x: number) => number` — S(x) in m², valid for x in [0, L].

**Preconditions (caller must guarantee)**

- S1 > 0 && L > 0
- S2 > 0 for the exponential and hypex families, which take log(S2/S1)

**Postconditions (must hold on return)**

- result(0) equals S1 for every flare law, to within floating-point rounding — the conical and hypex laws reach it through a square root and back

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `waveguideVolume(flare, S1, S2, L, N)`

- **Reachability:** EXPORTED
- **Obtain via:** import { waveguideVolume } from '../../src/engine/geometry.js'

Internal air volume of a waveguide segment.

A midpoint numeric integral of the exact area profile rather than a closed
form, so the volume tracks whichever flare law is selected instead of
assuming a cone. This feeds the enclosure's total-volume readout, where a
horn's own internal volume is easy to forget.

**Parameters**

- `flare` — `'conical'|'parabolic'|'exponential'|'hypex'|'tractrix'|'lecleach'` — Expansion law.
- `S1` — `number` — Throat area, m².
- `S2` — `number` — Mouth area, m².
- `L` — `number` — Axial length, m.
- `N` — `number` _(optional, default `200`)_ — Integration slices. Midpoint error falls as 1/N².

**Returns**

- `number` — Enclosed volume, m³.

**Preconditions (caller must guarantee)**

- N >= 1 && L > 0

**Postconditions (must hold on return)**

- result >= 0

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `flareCutoff(flare, S1, S2, L)`

- **Reachability:** EXPORTED
- **Obtain via:** import { flareCutoff } from '../../src/engine/geometry.js'

Flare (cutoff) frequency of an exponential-family horn.

Below this frequency the horn stops transforming impedance and its output
collapses, so it is the practical low-frequency limit of the design.

Conical and parabolic horns have no true cutoff — they load progressively
rather than sharply — and a segment that does not expand is a duct, so both
return `null` instead of a misleading number. The exponential family is
everything else: `exponential`, `hypex`, `tractrix` and `lecleach`, the last
two being hypex approximations and so sharing its cutoff behaviour.

**Parameters**

- `flare` — `'conical'|'parabolic'|'exponential'|'hypex'|'tractrix'|'lecleach'` — Expansion law.
- `S1` — `number` — Throat area, m².
- `S2` — `number` — Mouth area, m².
- `L` — `number` — Axial length, m.

**Returns**

- `number|null` — Cutoff frequency in Hz, or `null` when the geometry has no cutoff.

**Preconditions (caller must guarantee)**

- S1 > 0 && L > 0

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `endCorrectionLength(S, factor)`

- **Reachability:** EXPORTED
- **Obtain via:** import { endCorrectionLength } from '../../src/engine/geometry.js'

End-correction length ΔL for an opening.

Air just outside a port moves with the column inside it, so the duct behaves
as if it were longer than its physical length. Ports are tuned with this
included; omitting it puts the predicted tuning several Hz high.

The correction is `factor · a`, where `a` is the radius of the equivalent
circular opening — so it scales with the square root of area, and doubling
the coefficient doubles the correction.

**Parameters**

- `S` — `number` — Area of the opening, m².
- `factor` — `number` — End-correction coefficient: ≈0.85 flanged, ≈0.61 free, 0.732 for the typical two-flanged port.

**Returns**

- `number` — Added effective length in m, equal to `factor · sqrt(S/π)`.

**Preconditions (caller must guarantee)**

- S >= 0

**Postconditions (must hold on return)**

- result >= 0 when factor >= 0
- result is 0 when S is 0, and strictly increasing in both S and factor otherwise

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.
