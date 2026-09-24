# Contract specification: `src/spice/adapt.js`

> Generated from method contracts. This file contains **no implementation code**.
> Write tests against what is claimed here, not against what you expect the code to do.

## Module

SPICE vectors → the results a loudspeaker designer reads.

Produces the same result object the legacy engine does, so every chart,
metric, export and MCP tool reads either engine's output unchanged. Drive
levels are RMS, so pressures and flows are RMS; excursion and duct velocity
are reported as peaks, as before.

## EXPORTED (2)

### `phaseAndDelay(phase, freqs)`

- **Reachability:** EXPORTED
- **Obtain via:** import { phaseAndDelay } from '../../src/spice/adapt.js'

Unwrap a phase curve and derive group delay, as the legacy engine does.

**Parameters**

- `phase` — `number[]` — Wrapped phase, degrees.
- `freqs` — `number[]` — Frequencies, Hz.

**Returns**

- `{unwrapped: number[], groupDelay: number[]}` — Unwrapped phase in degrees, and group delay in ms.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `adaptResults(raw, map)`

- **Reachability:** EXPORTED
- **Obtain via:** import { adaptResults } from '../../src/spice/adapt.js'

Turn a SPICE run into the results object.

- Impedance is the load each channel sees, excluding its output
  resistance; `zinMag` is the first channel's. Electrical power sums over
  every channel.
- Flow probes are volume flow, m³/s peak; velocity probes are that flow
  over the local area, m/s peak.
- Each radiator's far-field pressure at 1 m is jωρU/(Ω·r), and every
  radiator is 1 m from the listening point, so the combined output is their
  coherent sum. Only radiators that count toward output are summed.
- Radiated power is Re(p·U*) at each counted radiator.

**Parameters**

- `raw` — `object` — From `runNetlist`.
- `map` — `object` — From `compileProject`.

**Returns**

- `object` — The results, in the legacy engine's shape.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

## UNREACHABLE (2)

### `spl(p)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Sound pressure level of an RMS pressure magnitude.

**Parameters**

- `p` — `number` — |p|, Pa.

**Returns**

- `number` — dB SPL, floored at a pressure of 1e-12 Pa.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `adaptResults > arr()`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

A zero-filled array, one entry per frequency.

**Returns**

- `number[]` — The array.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.
