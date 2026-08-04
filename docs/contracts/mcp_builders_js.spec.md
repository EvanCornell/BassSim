# Contract specification: `mcp/builders.js`

> Generated from method contracts. This file contains **no implementation code**.
> Write tests against what is claimed here, not against what you expect the code to do.

## Module

Phase-2 helpers for the MCP server: driver lookup, self-calibrating
enclosure builders, an optimizer, and comparison scoring.

## EXPORTED (10)

### `searchDrivers(criteria)`

- **Reachability:** EXPORTED
- **Obtain via:** import { searchDrivers } from '../../mcp/builders.js'

Query the built-in driver library.

Filters are conjunctive and every one is optional, so an empty argument
returns the whole library. Text matching on `query` and `brand` is
case-insensitive; `query` matches against the joined brand and model.

Extended-parameter filtering is generic: a number key accepts `{min}`,
`{max}` or an exact value, and a text key matches by substring. That
means a new catalog column becomes queryable the moment it is declared in
the schema, with no change here or in the tool definition.

**Parameters**

- `criteria` — `object` _(optional, default `{}`)_ — Filter criteria.
- `criteria.query` — `string` _(optional)_ — Substring of "brand model".
- `criteria.brand` — `string` _(optional)_ — Exact brand name.
- `criteria.source` — `'official'|'datasheet'|'custom'` _(optional)_ — Provenance.
- `criteria.fs_min` — `number` _(optional)_ — Minimum Fs, Hz.
- `criteria.fs_max` — `number` _(optional)_ — Maximum Fs, Hz.
- `criteria.xmax_min` — `number` _(optional)_ — Minimum Xmax, mm.
- `criteria.sd_min` — `number` _(optional)_ — Minimum Sd, cm².
- `criteria.sd_max` — `number` _(optional)_ — Maximum Sd, cm².
- `criteria.ext` — `Object<string, {min?: number, max?: number}|string|number>` _(optional)_ — Extended-parameter filters keyed by field.

**Returns**

- `Array<object>` — Matching records, in library order. Rows lacking the extended field being filtered on are excluded rather than passed through.

**Throws**

- `Error` — When `ext` names a field that is not in the schema — a silent empty result would look like "no such driver" rather than "no such column".

**Postconditions (must hold on return)**

- The library is not modified.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `findDriver(query)`

- **Reachability:** EXPORTED
- **Obtain via:** import { findDriver } from '../../mcp/builders.js'

Resolve a query to exactly one driver.

Ambiguity is an error rather than a silent first-match, because building
an enclosure around the wrong driver produces plausible numbers for the
wrong thing. An exact match on the full name or the model alone breaks a
tie, so "18SW115-4" resolves even though it is a substring of nothing
else.

**Parameters**

- `query` — `string` — Brand, model, or any substring of "brand model".

**Returns**

- `object` — The single matching driver record.

**Throws**

- `Error` — When nothing matches, or when several do and none is an exact name match. Both messages name the alternatives or point at `driver_search`.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `driverParams(spec)`

- **Reachability:** EXPORTED
- **Obtain via:** import { driverParams } from '../../mcp/builders.js'

Turn a driver spec into Driver node params.

A spec may name a library driver, give explicit T/S values, or both — in
which case the explicit values win, which is how an agent models a
modified or re-coned driver.

Only the solver-facing fields are taken from a library row. A database
record also carries provenance and construction detail that has no
business in a node's params, so this projects through `driverToParams`
rather than spreading the record.

Wiring defaults to parallel for a multi-driver node, which is the usual
intent and, unlike series, does not change the impedance the amplifier
sees in a way the caller did not ask for.

**Parameters**

- `spec` — `object` _(optional, default `{}`)_ — Driver spec.
- `spec.db` — `string` _(optional)_ — Library driver to look up.
- `spec.count` — `number` _(optional, default `1`)_ — Drivers in this node.
- `spec.wiring` — `'single'|'series'|'parallel'|'series-parallel'` _(optional)_ — Wiring. Defaults to `parallel` when count > 1, `single` otherwise.
- `spec.label` — `string` _(optional)_ — Node label; defaults to the library model name, or "Driver".

**Returns**

- `object` — Params ready for a driver node.

**Throws**

- `Error` — When `spec.db` matches no driver or is ambiguous.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `portLengthGuess(fb, volumeL, areaCm2, ecFactor)`

- **Reachability:** EXPORTED
- **Obtain via:** import { portLengthGuess } from '../../mcp/builders.js'

Analytic Helmholtz port length for a target tuning.

A first guess only. The lumped Helmholtz relation ignores the box's own
standing waves and the port's interaction with them, so the builders
follow it with `calibratePort`, which bisects against the *simulated*
impedance minimum. Expect this to be several Hz optimistic on a real box.

**Parameters**

- `fb` — `number` — Target tuning, Hz.
- `volumeL` — `number` — Box volume, litres.
- `areaCm2` — `number` — Total port area, cm².
- `ecFactor` — `number` _(optional, default `0.732`)_ — End-correction coefficient, applied to both ends.

**Returns**

- `number` — Port length in cm, floored at 1 cm — the end correction alone can exceed the required length for a large port on a small box, which would otherwise give a negative length.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `calibratePort(project, portId, targetFb, simulateFb)`

- **Reachability:** EXPORTED
- **Obtain via:** import { calibratePort } from '../../mcp/builders.js'

Tune a port by bisecting its length against the simulated tuning.

This is what makes the builders' tunings trustworthy: rather than
trusting the analytic guess, it re-simulates and converges on the length
that actually puts the impedance minimum where it was asked for.

Tuning falls monotonically as the port lengthens, which the bracketing
step exploits — it widens the interval up to four times in each direction
before bisecting, so a poor initial guess still converges. Fourteen
bisections take the interval below a tenth of a percent, and the search
stops early once it is within 0.05 Hz.

A simulation that returns `null` — a graph with no identifiable tuning —
ends the search at the current length rather than looping.

**Parameters**

- `project` — `object` — The project to tune. Modified in place.
- `portId` — `string` — Node id of the port to adjust.
- `targetFb` — `number` — Desired tuning, Hz.
- `simulateFb` — `(project: object) => number|null` — Simulates a project and returns its tuning in Hz, or `null` when there is none.

**Returns**

- `number` — The calibrated port length in cm, rounded to 0.1 cm.

**Preconditions (caller must guarantee)**

- The project contains a waveguide node with id `portId`.

**Mutates**

- Writes the calibrated length into the project's port node.

**Side effects**

- Runs the supplied simulation up to ~22 times, which dominates the cost of building a ported enclosure.

### `buildSealedBox(spec)`

- **Reachability:** EXPORTED
- **Obtain via:** import { buildSealedBox } from '../../mcp/builders.js'

Build a sealed enclosure.

The simplest topology: the driver's rear loads a closed chamber and its
front radiates into half space.

**Parameters**

- `spec` — `object` — Build spec.
- `spec.driver` — `object` — Driver spec, as `driverParams` accepts.
- `spec.volume` — `number` — Internal volume, litres.
- `spec.name` — `string` _(optional)_ — Project name.
- `spec.settings` — `object` _(optional)_ — Sweep settings overrides.

**Returns**

- `{project: object, notes: string[]}` — The project and notes explaining the topology.

**Throws**

- `Error` — When the driver spec names an unknown or ambiguous library driver.

**Side effects**

- Consumes ids from the module counter, so two calls produce projects with different node ids.

### `buildPortedBox(spec)`

- **Reachability:** EXPORTED
- **Obtain via:** import { buildPortedBox } from '../../mcp/builders.js'

Build a vented enclosure.

Port area defaults to about a quarter of the total cone area, split
across the requested number of ports — a common starting point that keeps
port velocity reasonable without making the port unmanageably long.

The port is built at the analytic guess; the caller is expected to run
`calibratePort` against a real simulation afterwards, which is what the
MCP server does.

**Parameters**

- `spec` — `object` — Build spec.
- `spec.driver` — `object` — Driver spec.
- `spec.volume` — `number` — Internal volume, litres.
- `spec.tuning` — `number` _(optional, default `32`)_ — Target tuning, Hz. Ignored when `port_length` is given.
- `spec.port_area` — `number` _(optional)_ — Area of each port, cm². Defaults to Sd/4 shared across the ports.
- `spec.port_length` — `number` _(optional)_ — Explicit port length, cm, bypassing the tuning calculation.
- `spec.port_count` — `number` _(optional, default `1`)_ — Number of identical ports.
- `spec.name` — `string` _(optional)_ — Project name.
- `spec.settings` — `object` _(optional)_ — Sweep settings overrides.

**Returns**

- `{project: object, ports: string[], notes: string[]}` — The project, the port node ids for calibration, and notes.

**Throws**

- `Error` — When the driver spec names an unknown or ambiguous library driver.

**Side effects**

- Consumes ids from the module counter.

### `buildBandpass4(spec)`

- **Reachability:** EXPORTED
- **Obtain via:** import { buildBandpass4 } from '../../mcp/builders.js'

Build a 4th-order bandpass enclosure.

The driver is buried: its rear loads a sealed chamber and its front vents
through a ported one, so *all* output comes from the port. That is what
gives the alignment its bandpass shape and its acoustic low-pass — and
why the cone itself contributes nothing directly to the SPL.

**Parameters**

- `spec` — `object` — Build spec.
- `spec.driver` — `object` — Driver spec.
- `spec.front_volume` — `number` — Ported front chamber volume, litres.
- `spec.rear_volume` — `number` — Sealed rear chamber volume, litres.
- `spec.tuning` — `number` _(optional, default `45`)_ — Front chamber tuning, Hz.
- `spec.port_area` — `number` _(optional)_ — Port area, cm². Defaults to Sd/4.
- `spec.name` — `string` _(optional)_ — Project name.
- `spec.settings` — `object` _(optional)_ — Sweep settings overrides.

**Returns**

- `{project: object, ports: string[], notes: string[]}` — The project, the port node id, and notes.

**Throws**

- `Error` — When the driver spec names an unknown or ambiguous library driver.

**Side effects**

- Consumes ids from the module counter.

### `buildBandpass6(spec)`

- **Reachability:** EXPORTED
- **Obtain via:** import { buildBandpass6 } from '../../mcp/builders.js'

Build a parallel 6th-order bandpass enclosure.

Both chambers vent to the outside, and the two tunings set the passband
edges: tune the rear port low and the front port high. Steeper skirts
than a 4th-order at the cost of a much narrower usable band and far more
sensitivity to getting both tunings right.

**Parameters**

- `spec` — `object` — Build spec.
- `spec.driver` — `object` — Driver spec.
- `spec.front_volume` — `number` — Front chamber volume, litres.
- `spec.rear_volume` — `number` — Rear chamber volume, litres.
- `spec.front_tuning` — `number` _(optional, default `55`)_ — Front port tuning, Hz — the passband's upper edge.
- `spec.rear_tuning` — `number` _(optional, default `30`)_ — Rear port tuning, Hz — the lower edge.
- `spec.port_area` — `number` _(optional)_ — Area of each port, cm². Defaults to Sd/4.
- `spec.name` — `string` _(optional)_ — Project name.
- `spec.settings` — `object` _(optional)_ — Sweep settings overrides.

**Returns**

- `{project: object, ports: string[], notes: string[]}` — The project, both port node ids, and notes.

**Throws**

- `Error` — When the driver spec names an unknown or ambiguous library driver.

**Side effects**

- Consumes ids from the module counter.

### `optimizeProject(project, params, score, opts)`

- **Reachability:** EXPORTED
- **Obtain via:** import { optimizeProject } from '../../mcp/builders.js'

Search for the best parameter values by coordinate grid refinement.

Each round sweeps every free parameter across its current range on a
grid, keeps the best value found, then halves the range around it. This
converges far faster than a full grid search over all parameters at once
— cost is `rounds × params × gridN` evaluations rather than `gridN ^
params` — at the price of being able to miss a narrow optimum that only
appears when two parameters move together.

Constraints are the caller's job, folded into `score` as penalties rather
than enforced here, which keeps the search unconstrained and lets a
design that slightly violates a limit still be ranked against one that
badly violates it.

A parameter whose starting value is outside its own bounds is moved to
mid-range first, so a caller can pass bounds that exclude the current
design without the search starting from an invalid point.

**Parameters**

- `project` — `object` — Starting project. Not modified.
- `params` — `Array<{node?: string, param: string, min: number, max: number}>` — Free parameters. Omit `node` to target a sweep setting rather than a node param.
- `score` — `(project: object) => number` — Objective; higher is better.
- `opts` — `object` _(optional, default `{}`)_ — Search controls.
- `opts.rounds` — `number` _(optional, default `3`)_ — Refinement rounds.
- `opts.gridN` — `number` _(optional, default `9`)_ — Grid points per parameter per round.

**Returns**

- `{best: object, bestScore: number, evals: number, values: number[]}` — The best project found, its score, how many evaluations it took, and the winning value of each parameter in the order given.

**Side effects**

- Calls `score` many times; if scoring simulates, this is the expensive part.

## INTERNAL (5)

### `nid(t)`

- **Reachability:** INTERNAL
- **Obtain via:** import { __internals } from '../../mcp/builders.js'  →  __internals.nid

Sequential node id for a generated project.

Ids only need to be unique within the project being built, so a plain
counter is enough — and it keeps generated projects readable and diffable.

**Parameters**

- `t` — `string` — Node type, used as the prefix.

**Returns**

- `string` — A new node id.

**Side effects**

- Advances the module-level counter.

### `pos(col, row)`

- **Reachability:** INTERNAL
- **Obtain via:** import { __internals } from '../../mcp/builders.js'  →  __internals.pos

Canvas position for a node on a builder's grid.

Generated projects are laid out on a fixed grid so they open in the
editor already readable rather than piled at the origin.

**Parameters**

- `col` — `number` — Grid column, left to right along the signal path.
- `row` — `number` _(optional, default `0`)_ — Grid row, for parallel branches.

**Returns**

- `{x: number, y: number}` — Canvas position.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `baseProject(name, settings)`

- **Reachability:** INTERNAL
- **Obtain via:** import { __internals } from '../../mcp/builders.js'  →  __internals.baseProject

An empty project with the builders' default sweep settings.

The default range is 10–200 Hz at 256 points rather than the app's
10–1000 at 512: these are subwoofer enclosures, and the narrower sweep
resolves the tuning far better for a quarter of the solve cost.

**Parameters**

- `name` — `string` — Project name.
- `settings` — `object` _(optional, default `{}`)_ — Settings merged over the defaults.

**Returns**

- `object` — A project with no nodes or edges.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `addNode(p, type, params, col, row)`

- **Reachability:** INTERNAL
- **Obtain via:** import { __internals } from '../../mcp/builders.js'  →  __internals.addNode

Append a node to a project under construction.

**Parameters**

- `p` — `object` — Project being built.
- `type` — `string` — Node type.
- `params` — `object` — Node params.
- `col` — `number` — Grid column.
- `row` — `number` _(optional, default `0`)_ — Grid row.

**Returns**

- `string` — The new node's id, for wiring it up.

**Mutates**

- Pushes onto the project's node list.

**Side effects**

- Consumes an id from the module counter.

### `edge(p, source, sourceHandle, target, targetHandle)`

- **Reachability:** INTERNAL
- **Obtain via:** import { __internals } from '../../mcp/builders.js'  →  __internals.edge

Connect two ports in a project under construction.

**Parameters**

- `p` — `object` — Project being built.
- `source` — `string` — Source node id.
- `sourceHandle` — `string` — Source handle name.
- `target` — `string` — Target node id.
- `targetHandle` — `string` — Target handle name.

**Returns**

- `number` — The new edge count, as returned by `Array.push` and ignored by callers.

**Mutates**

- Pushes onto the project's edge list.

## UNREACHABLE (4)

### `calibratePort > setLen(p, L)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Set the port's length in a project.

**Parameters**

- `p` — `object` — Project to modify.
- `L` — `number` — Port length, cm.

**Returns**

- `void`

**Mutates**

- The port node's params.

**Reads external mutable state**

- the enclosing `portId`.

### `calibratePort > fbAt(L)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Simulated tuning at a candidate port length.

Clones the project so the trial does not disturb the one being
calibrated.

**Parameters**

- `L` — `number` — Port length to try, cm.

**Returns**

- `number|null` — Tuning in Hz, or `null` when the graph has none.

**Side effects**

- Runs the caller's simulation.

**Reads external mutable state**

- the enclosing `project` and `simulateFb`.

### `optimizeProject > getVal(p, prm)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Read a free parameter's current value from a project.

**Parameters**

- `p` — `object` — Project to read from.
- `prm` — `{node?: string, param: string}` — Parameter descriptor.

**Returns**

- `number` — The current value.

**Preconditions (caller must guarantee)**

- The named node exists when `prm.node` is set.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `optimizeProject > setVal(p, prm, v)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Write a free parameter's value into a project.

Replaces the params object rather than assigning into it, so a candidate
built by `structuredClone` cannot share structure with the project it
came from.

**Parameters**

- `p` — `object` — Project to write to. Modified in place.
- `prm` — `{node?: string, param: string}` — Parameter descriptor.
- `v` — `number` — New value.

**Returns**

- `void`

**Mutates**

- The project passed in.
