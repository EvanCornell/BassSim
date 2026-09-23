# Contract specification: `src/spice/compile.js`

> Generated from method contracts. This file contains **no implementation code**.
> Write tests against what is claimed here, not against what you expect the code to do.

## Module

A resolved v3 project → a SPICE netlist, plus a map of what its outputs mean.

## EXPORTED (2)

### `pointsPerDecade(fmin, fmax, npts)`

- **Reachability:** EXPORTED
- **Obtain via:** import { pointsPerDecade } from '../../src/spice/compile.js'

Points per decade for an `.ac dec` sweep that comes closest to `npts` points.

ngspice's decade sweep includes both ends, so it yields ppd·decades + 1
points.

**Parameters**

- `fmin` — `number` — Lowest frequency, Hz.
- `fmax` — `number` — Highest frequency, Hz.
- `npts` — `number` — Points wanted.

**Returns**

- `number` — Points per decade, at least 1.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `compileProject(proj, analysis)`

- **Reachability:** EXPORTED
- **Obtain via:** import { compileProject } from '../../src/spice/compile.js'

Compile a project's frequency sweep into a netlist.

**Parameters**

- `proj` — `object` — A resolved, validated v3 project.
- `analysis` — `object` — The `ac` analysis to run.

**Returns**

- `{netlist: string, map: object, saves: string[]}` — The netlist text; the map of drivers, channels, waveguides, radiators and probes to the SPICE vectors that carry them; and the vectors to read back.

**Throws**

- `Error` — When the project uses something this compiler cannot build yet.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.
