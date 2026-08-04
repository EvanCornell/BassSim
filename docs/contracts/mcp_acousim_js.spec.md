# Contract specification: `mcp/acousim.js`

> Generated from method contracts. This file contains **no implementation code**.
> Write tests against what is claimed here, not against what you expect the code to do.

## EXPORTED (1)

### `createServer()`

- **Reachability:** EXPORTED
- **Obtain via:** import { createServer } from '../../mcp/acousim.js'

Build a fully configured MCP server with every tool and resource registered.

A factory rather than a singleton because the HTTP transport is
stateless: each POST is handled by a fresh instance, which is what makes
it safe to run behind a load balancer.

**Returns**

- `McpServer` — A server ready to connect to a transport.

**Side effects**

- Reads `mcp/guide.md` from disk at module load, and registers tools on the new instance.

## INTERNAL (9)

### `sig(v, n)`

- **Reachability:** INTERNAL
- **Obtain via:** import { __internals } from '../../mcp/acousim.js'  →  __internals.sig

Round a number to a fixed significant-figure count for JSON output.

Tool responses are read by a language model, and full float precision is
noise that costs tokens without adding meaning: 4 significant figures is
well past the accuracy of the model producing them.

**Parameters**

- `v` — `number|null|undefined` — The value.
- `n` — `number` _(optional, default `4`)_ — Significant figures.

**Returns**

- `number|null` — The rounded number, or `null` for absent and non-finite values so the JSON carries an explicit "no value" rather than `NaN`.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `labelOf(nodes, id)`

- **Reachability:** INTERNAL
- **Obtain via:** import { __internals } from '../../mcp/acousim.js'  →  __internals.labelOf

Describe a node as `label (id)`, or just its id when it has no label.

Used throughout the tool responses so an agent reads "Port (waveguide_3)"
rather than an opaque id.

**Parameters**

- `nodes` — `Array<object>` — Hydrated graph nodes.
- `id` — `string` — Node id.

**Returns**

- `string` — A human-readable node reference.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `resolveNode(nodes, ref, types)`

- **Reachability:** INTERNAL
- **Obtain via:** import { __internals } from '../../mcp/acousim.js'  →  __internals.resolveNode

Resolve a node reference, which may be an id or a label.

Agents naturally refer to "the port" rather than `waveguide_3`, so both
work. Ids are matched first, then labels case-insensitively.

**Parameters**

- `nodes` — `Array<object>` — Hydrated graph nodes.
- `ref` — `string` — Node id or label.
- `types` — `string[]|null` _(optional, default `null`)_ — Restrict to these node types. `null` searches every node.

**Returns**

- `object` — The matching node.

**Throws**

- `Error` — When nothing matches. The message lists the available nodes, so an agent can correct itself without another round-trip.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `run(projRaw)`

- **Reachability:** INTERNAL
- **Obtain via:** import { __internals } from '../../mcp/acousim.js'  →  __internals.run

Hydrate a project and simulate it.

The shared entry point behind every simulating tool. Point count is
capped at 1024 regardless of what the project asks for, since a tool call
is a synchronous request and an agent can otherwise request an
arbitrarily expensive sweep.

**Parameters**

- `projRaw` — `object` — A serialized project.

**Returns**

- `{nodes: Array<object>, edges: Array<object>, settings: object, res: object, metrics: object|null}` — The hydrated graph, the raw result, and metrics — `null` when the simulation failed.

**Throws**

- `Error` — When the project is structurally invalid, propagated from `hydrateProject`.

**Side effects**

- Runs the solver, which is the expensive part of every tool call.

### `downsample(freqs, arr, points, fmin, fmax)`

- **Reachability:** INTERNAL
- **Obtain via:** import { __internals } from '../../mcp/acousim.js'  →  __internals.downsample

Reduce a curve to about `points` samples for a tool response.

A 512-point curve is far more than an agent needs and far more than it
should pay for in tokens. The samples are evenly spaced across the
window, but the minimum and maximum are always added — without them, an
impedance peak or an excursion spike could fall between samples and the
agent would conclude the design is fine when it is not.

**Parameters**

- `freqs` — `number[]` — Frequency axis, Hz.
- `arr` — `number[]` — Curve sampled on that axis.
- `points` — `number` _(optional, default `48`)_ — Target sample count. The result may hold up to two more, for the extrema.
- `fmin` — `number|null` _(optional, default `null`)_ — Window the output to at or above this frequency.
- `fmax` — `number|null` _(optional, default `null`)_ — Window the output to at or below this frequency.

**Returns**

- `Array<[number|null, number|null]>` — `[frequency, value]` pairs in ascending frequency order, rounded for output.

**Preconditions (caller must guarantee)**

- freqs.length === arr.length

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `metricsSummary(metrics)`

- **Reachability:** INTERNAL
- **Obtain via:** import { __internals } from '../../mcp/acousim.js'  →  __internals.metricsSummary

Reduce computed metrics to a labelled, unit-carrying object for JSON output.

Absent figures are omitted rather than emitted as null, so a sealed box's
summary simply has no tuning field instead of one saying `null` — which
reads to an agent as a missing measurement rather than an inapplicable one.

**Parameters**

- `metrics` — `object|null` — Metrics from `computeMetrics`.

**Returns**

- `object|null` — A flat object of formatted metrics, or `null` when there were none.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `summarize(arg0, points)`

- **Reachability:** INTERNAL
- **Obtain via:** import { __internals } from '../../mcp/acousim.js'  →  __internals.summarize

Build the JSON summary returned by `simulate`.

Shaped for an agent rather than a chart: the headline metrics, the
validation warnings in plain language, per-radiator peak air velocity,
per-driver peak excursion annotated against each cone's own Xmax, and
two downsampled curves. Excursion over Xmax is called out in the text as
"EXCEEDED" so the agent cannot miss it by not comparing two numbers.

A failed simulation returns early with the errors and no curves.

**Parameters**

- `ctx` — `object` — The result of `run`.
- `points` — `number` _(optional, default `40`)_ — Curve downsample resolution.

**Returns**

- `object` — The summary object, ready to serialize.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `jsonResult(obj)`

- **Reachability:** INTERNAL
- **Obtain via:** import { __internals } from '../../mcp/acousim.js'  →  __internals.jsonResult

Wrap a value as a successful MCP tool result.

**Parameters**

- `obj` — `any` — Serializable payload.

**Returns**

- `{content: Array<{type: string, text: string}>}` — An MCP tool result carrying the JSON as text.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `errResult(e)`

- **Reachability:** INTERNAL
- **Obtain via:** import { __internals } from '../../mcp/acousim.js'  →  __internals.errResult

Wrap an error as a failed MCP tool result.

Returned rather than thrown, so the agent receives the message and can
correct its input instead of the transport reporting an opaque failure.

**Parameters**

- `e` — `Error` — The error.

**Returns**

- `{isError: boolean, content: Array<{type: string, text: string}>}` — An MCP error result.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

## UNREACHABLE (20)

### `get(r)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Coherent sum of every radiator in the design — the headline response.

**Parameters**

- `r` — `object` — A simulation result.

**Returns**

- `Array<number>` — SPL in dB at 1 m, per frequency.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `get(r)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Only the output reaching the listener from a driver's front port, excluding anything radiated by a port or passive radiator.

**Parameters**

- `r` — `object` — A simulation result.

**Returns**

- `Array<number|null>` — SPL in dB, `null` where nothing radiates directly.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `get(r, id)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Output of a single radiating terminal, for judging how much of the total each contributes.

**Parameters**

- `r` — `object` — A simulation result.
- `id` — `string` — Radiator node id.

**Returns**

- `Array<number|null>|undefined` — SPL in dB, or `undefined` when that node radiates nothing.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `get(r)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Impedance magnitude at the amplifier terminals. Its peaks identify the box alignment.

**Parameters**

- `r` — `object` — A simulation result.

**Returns**

- `Array<number>` — Impedance magnitude in ohms.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `get(r)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Impedance phase angle, which decides how reactive a load the amplifier sees.

**Parameters**

- `r` — `object` — A simulation result.

**Returns**

- `Array<number>` — Phase in degrees.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `get(r)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Largest single-cone displacement at each frequency. Cone travel is not additive, so this reports the worst offender rather than a sum.

**Parameters**

- `r` — `object` — A simulation result.

**Returns**

- `Array<number>` — Peak displacement in mm.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `get(r, id)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Displacement of one specific driver, for judging each cone against its own Xmax.

**Parameters**

- `r` — `object` — A simulation result.
- `id` — `string` — Driver node id.

**Returns**

- `Array<number>|undefined` — Peak displacement in mm.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `get(r, id)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Peak air speed in a port or duct. Above roughly 17 m/s a port begins to chuff audibly.

**Parameters**

- `r` — `object` — A simulation result.
- `id` — `string` — Waveguide node id.

**Returns**

- `Array<number>|undefined` — Peak velocity in m/s.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `get(r, id)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Pressure at a virtual microphone inside a chamber — the right measure for in-cabin listening levels. Requires `probe: true` on that chamber.

**Parameters**

- `r` — `object` — A simulation result.
- `id` — `string` — Chamber node id.

**Returns**

- `Array<number|null>|undefined` — Interior SPL in dB, or `undefined` when that chamber has no probe.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `get(r)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Total acoustic power leaving the enclosure, summed over every radiator.

**Parameters**

- `r` — `object` — A simulation result.

**Returns**

- `Array<number>` — Acoustic power in watts.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `get(r)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Real power drawn at the driver terminals — what the amplifier actually delivers.

**Parameters**

- `r` — `object` — A simulation result.

**Returns**

- `Array<number>` — Real power in watts.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `get(r)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Apparent power, which exceeds the real power wherever the load is reactive.

**Parameters**

- `r` — `object` — A simulation result.

**Returns**

- `Array<number>` — Apparent power in VA.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `get(r)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Acoustic power as a percentage of electrical input power.

Derived rather than stored, since it is the ratio of two series the
solver already produces. Guarded against a near-zero denominator at
frequencies where the driver draws essentially nothing.

**Parameters**

- `r` — `object` — A simulation result.

**Returns**

- `Array<number|null>` — Efficiency in percent, `null` where input power is too small to divide by.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `get(r)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Phase of the combined pressure, unwrapped so it runs continuously.

**Parameters**

- `r` — `object` — A simulation result.

**Returns**

- `Array<number>` — Unwrapped phase in degrees.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `get(r)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Group delay, the derivative of unwrapped phase with respect to frequency.

**Parameters**

- `r` — `object` — A simulation result.

**Returns**

- `Array<number>` — Group delay in milliseconds.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `metricsSummary > put(k, v, unit)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Add one metric, skipping it when there is no usable value.

**Parameters**

- `k` — `string` — Output key.
- `v` — `number|null|undefined` — The value.
- `unit` — `string` _(optional)_ — Unit appended to the formatted number. Omit for dimensionless figures.

**Returns**

- `void`

**Mutates**

- Adds to the enclosing output object.

### `createServer > need(k)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Assert that an optional argument was supplied.

**Parameters**

- `k` — `string` — Argument name.

**Returns**

- `void`

**Throws**

- `Error` — When the argument is missing, naming it so the agent can retry correctly.

**Reads external mutable state**

- the enclosing tool arguments.

### `createServer > simFb(p)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Simulate a project and report its tuning, for port calibration.

**Parameters**

- `p` — `object` — The project to simulate.

**Returns**

- `number|null` — Tuning in Hz — the vented `fb`, falling back to a sealed box's `fc` — or `null` when the simulation failed.

**Side effects**

- Runs the solver.

### `createServer > bandIndices(freqs, band)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Sweep indices falling inside a frequency band.

**Parameters**

- `freqs` — `number[]` — Frequency axis, Hz.
- `band` — `[number, number]` — Band as `[f1, f2]` Hz.

**Returns**

- `number[]` — Indices inside the band, ascending.

**Throws**

- `Error` — When fewer than three points fall in the band — averaging SPL over one or two samples would produce a confident number from almost no data, so this refuses rather than misleading the optimizer.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `createServer > makeScore(arg0)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Build the objective function the optimizer maximizes.

Three objectives: `min_f3` maximizes the negated F3, `max_spl` the mean
level across the band, and `flat` the mean minus four times the standard
deviation — which trades roughly 4 dB of level for each 1 dB of ripple
removed, and is what makes "flat" prefer a smooth response over a loud
lumpy one.

Constraints are penalties, not hard limits, and are scaled by how far
they are exceeded. A design 10% over Xmax loses 3 points rather than
being discarded, so the search can still traverse a slightly-invalid
region on its way to a better answer instead of being walled off from it.

A project that fails to simulate scores −1e9, which is low enough never
to win but finite, so it does not poison comparisons.

**Parameters**

- `spec` — `object` — Objective spec.
- `spec.objective` — `'min_f3'|'max_spl'|'flat'` — What to maximize.
- `spec.band` — `[number, number]` _(optional)_ — Frequency band, required for `max_spl` and `flat`.
- `spec.constraints` — `object` _(optional, default `{}`)_ — Penalty settings.
- `spec.constraints.max_port_velocity_ms` — `number` _(optional)_ — Penalize peak port velocity above this.
- `spec.constraints.max_excursion_mm` — `number` _(optional)_ — Excursion limit; defaults to each driver's own Xmax.
- `spec.constraints.respect_xmax` — `boolean` _(optional)_ — Set false to drop the excursion penalty entirely.

**Returns**

- `(project: object) => number` — A scoring function; higher is better.

**Side effects**

- The returned function runs a full simulation on every call.
