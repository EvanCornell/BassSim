# Contract specification: `src/spice/compile.js`

> Generated from method contracts. This file contains **no implementation code**.
> Write tests against what is claimed here, not against what you expect the code to do.

## Module

A resolved v3 project → a SPICE netlist, plus a map of what its outputs mean.

## EXPORTED (3)

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

### `decadeStep(fstart, ppd, i, top)`

- **Reachability:** EXPORTED
- **Obtain via:** import { decadeStep } from '../../src/spice/compile.js'

A point of a decade sweep, written exactly for an `.ac` line.

**Parameters**

- `fstart` — `number` — The sweep's first frequency, Hz.
- `ppd` — `number` — Points per decade.
- `i` — `number` — Steps from the start.
- `top` — `boolean` _(optional)_ — Written as a sweep's top: a hair past the point.

**Returns**

- `string` — The frequency, fifteen significant figures.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `compileProject(proj, analysis, opts)`

- **Reachability:** EXPORTED
- **Obtain via:** import { compileProject } from '../../src/spice/compile.js'

Compile a project into a netlist: its frequency sweep, or a transient run.

The circuit is the same either way; only the sources and the analysis
line differ, plus — in a transient run — the far-field pressure and
excursion nodes, and the nonlinear elements when they are switched on.

**Parameters**

- `proj` — `object` — A resolved, validated v3 project.
- `analysis` — `object` — The `ac` analysis whose band, model settings and points to use. `scale: 'lin'` makes a linear sweep of `npts` points from `fmin` to `fmax`, as the linear time responses need.
- `opts` — `object` _(optional)_ — Options.
- `opts.tran` — `object` _(optional)_ — Compile a transient run instead: `{signal, levelDb, fs, tstop, nonlinear, robust}` — a normalised signal (see `dsp.js`), a level offset in dB, the sample rate, the run length in s, whether to switch on the nonlinear elements, and whether to use the slower, more forgiving solver settings.

**Returns**

- `{netlist: string, map: object, saves: string[]}` — The netlist text; the map of drivers, channels, waveguides, radiators and probes to the SPICE vectors that carry them; and the vectors to read back.

**Throws**

- `Error` — When the project uses something this compiler cannot build yet.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

## UNREACHABLE (1)

### `transientOutputs(ctx)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Add the far-field pressure and cone excursion to a transient netlist.

In the sweep these are worked out from the saved flows afterwards. In a
transient run they are circuit nodes instead, so they are integrated by the
same solver, at the same steps, as everything else:

- pressure at 1 m from every counted radiator, p = ρ/(Ω·r) · dU/dt, is the
  voltage across a ρ-henry inductor carrying Σ U/Ω — once for all of them
  and once for the driver faces alone;
- each driver's excursion x = ∫u dt is the voltage on a 1 F capacitor fed
  its cone velocity. The nonlinear driver model reads this node too.

**Parameters**

- `ctx` — `object` — Compile context.

**Returns**

- `void`

**Mutates**

- ctx.nl and ctx.map.
