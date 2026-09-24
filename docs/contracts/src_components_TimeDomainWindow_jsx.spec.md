# Contract specification: `src/components/TimeDomainWindow.jsx`

> Generated from method contracts. This file contains **no implementation code**.
> Write tests against what is claimed here, not against what you expect the code to do.

## EXPORTED (4)

### `timeRows(t, series, tMax)`

- **Reachability:** EXPORTED
- **Obtain via:** import { timeRows } from '../../src/components/TimeDomainWindow.jsx'

Rows for a time chart from sample times and named series, thinned for drawing.

**Parameters**

- `t` — `ArrayLike<number>` — Sample times, s.
- `series` — `Object<string, ArrayLike<number>>` — Key → samples.
- `tMax` — `number` _(optional)_ — Last time to include, s.

**Returns**

- `Array<object>` — Rows `{ms, key…}`.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `linearTicks(lo, hi, count)`

- **Reachability:** EXPORTED
- **Obtain via:** import { linearTicks } from '../../src/components/TimeDomainWindow.jsx'

Round tick positions across a linear range.

**Parameters**

- `lo` — `number` — Range start.
- `hi` — `number` — Range end.
- `count` — `number` _(optional, default `8`)_ — Roughly how many ticks.

**Returns**

- `number[]` — Ticks on a 1-2-5 step.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `logTicks(lo, hi)`

- **Reachability:** EXPORTED
- **Obtain via:** import { logTicks } from '../../src/components/TimeDomainWindow.jsx'

Tick positions across a logarithmic range: 1, 2 and 5 of each decade.

**Parameters**

- `lo` — `number` — Range start, above zero.
- `hi` — `number` — Range end.

**Returns**

- `number[]` — The ticks inside the range.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `TimeDomainWindow()`

- **Reachability:** EXPORTED
- **Obtain via:** import { TimeDomainWindow } from '../../src/components/TimeDomainWindow.jsx'

The time-domain workspace: its own full-screen view under the menu and quick bar.

Four tabs — the linear time responses, which follow the project by
themselves; transient runs; distortion measurements; and the driver curve
editor. Transient and distortion run only when asked, since they take
seconds to minutes, and a result says when the project has changed since.

**Returns**

- `React.ReactElement` — The window.

**Side effects**

- Subscribes to the store, and starts the linear responses when they are out of date.

## UNREACHABLE (23)

### `f(v, d)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Format a number for a readout.

**Parameters**

- `v` — `number` — The value.
- `d` — `number` _(optional, default `1`)_ — Decimals.

**Returns**

- `string` — The text, or a dash for a missing value.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `timeRows > cut(a)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

The samples up to the last time kept.

**Parameters**

- `a` — `ArrayLike<number>` — Samples.

**Returns**

- `number[]` — The kept samples.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `TdChart(props)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

A line chart for the time-domain views.

**Parameters**

- `props` — `object` — Component props.
- `props.title` — `string` — Heading above the chart.
- `props.data` — `Array<object>` — Rows.
- `props.lines` — `Array<object>` — `{key, name, color?, dash?, right?, width?}` per trace.
- `props.xKey` — `string` _(optional)_ — Row field for x; `ms` by default.
- `props.xLabel` — `string` _(optional)_ — X axis label.
- `props.logX` — `boolean` _(optional)_ — Logarithmic x axis.
- `props.yLabel` — `string` — Left axis label.
- `props.y2Label` — `string` _(optional)_ — Right axis label, when some trace uses it.
- `props.yDomain` — `Array` _(optional)_ — Left axis domain.
- `props.refs` — `Array<object>` _(optional)_ — `{y, label, color}` horizontal reference lines on the left axis.
- `props.height` — `number` _(optional)_ — Height, px.

**Returns**

- `React.ReactElement` — The chart.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `Num(props)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

A labelled number input that writes only valid numbers.

**Parameters**

- `props` — `object` — Component props.
- `props.label` — `string` — Label.
- `props.value` — `number` — Current value.
- `props.onChange` — `Function` — Called with a new number.
- `props.unit` — `string` _(optional)_ — Unit after the input.
- `props.min` — `number` _(optional)_ — Smallest accepted.
- `props.step` — `number` _(optional)_ — Input step.
- `props.title` — `string` _(optional)_ — Tooltip.

**Returns**

- `React.ReactElement` — The row.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `Pick(props)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

A labelled select.

**Parameters**

- `props` — `object` — Component props.
- `props.label` — `string` — Label.
- `props.value` — `*` — Current value.
- `props.options` — `Array` — `[value, text]` pairs.
- `props.onChange` — `Function` — Called with the chosen value (numbers stay numbers).
- `props.title` — `string` _(optional)_ — Tooltip.

**Returns**

- `React.ReactElement` — The row.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `Check(props)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

A labelled checkbox.

**Parameters**

- `props` — `object` — Component props.
- `props.label` — `string` — Label.
- `props.checked` — `boolean` — State.
- `props.onChange` — `Function` — Called with the new state.
- `props.title` — `string` _(optional)_ — Tooltip.

**Returns**

- `React.ReactElement` — The row.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `nameOf(nodes, id)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

The display name of a node, by id.

**Parameters**

- `nodes` — `Array<object>` — Graph nodes.
- `id` — `string` — Node id.

**Returns**

- `string` — Its label, or the id.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `useStale(res)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Whether a result was run from the project as it now stands.

**Parameters**

- `res` — `object|null` — A result carrying the `sig` it was run from.

**Returns**

- `boolean` — True when the project has changed since.

**Side effects**

- Subscribes to the store.

### `StaleBanner(props)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

The banner a view shows when its result no longer matches the project.

**Parameters**

- `props` — `object` — Component props.
- `props.stale` — `boolean` — Whether to show it.
- `props.onRun` — `Function` _(optional)_ — Re-run; omitted where the view re-runs itself.

**Returns**

- `React.ReactElement|null` — The banner.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `LinearControls(props)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Controls for the linear responses.

**Parameters**

- `props` — `object` — Component props.
- `props.cfg` — `object` — The linear settings.
- `props.set` — `Function` — Writes a patch to them.
- `props.view` — `object` — Display choices: `{windowMs}`.
- `props.setView` — `Function` — Writes display choices.

**Returns**

- `React.ReactElement` — The controls.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `LinearView(props)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

The linear response charts.

**Parameters**

- `props` — `object` — Component props.
- `props.res` — `object|null` — The linear result.
- `props.view` — `object` — Display choices.

**Returns**

- `React.ReactElement` — The charts.

**Side effects**

- Subscribes to the store.

### `LinearView > build(fam, withSignal)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Rows and lines for one response family.

**Parameters**

- `fam` — `object` — `{pressure, driverPressure, excursion}` for impulse, step or burst.
- `withSignal` — `boolean` — Include the burst signal itself.

**Returns**

- `{rows: object[], lines: object[], xl: object[]}` — Pressure rows and lines, and excursion lines.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `TransientControls(props)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Controls for a transient run.

**Parameters**

- `props` — `object` — Component props.
- `props.cfg` — `object` — The transient settings.
- `props.set` — `Function` — Writes a patch to them.

**Returns**

- `React.ReactElement` — The controls.

**Side effects**

- Subscribes to the store.

### `TransientControls > setSig(patch)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Write a patch to the signal.

**Parameters**

- `patch` — `object` — Fields to merge.

**Returns**

- `void`

**Side effects**

- Writes the settings.

### `TransientView(props)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

The transient result: waveforms, summary and output spectrum.

**Parameters**

- `props` — `object` — Component props.
- `props.res` — `object|null` — The transient result.
- `props.onRun` — `Function` — Starts a run.

**Returns**

- `React.ReactElement` — The view.

**Side effects**

- Subscribes to the store.

### `TransientView > spec(y)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

dB spectrum of a pressure waveform.

**Parameters**

- `y` — `ArrayLike<number>` — Samples.

**Returns**

- `Float64Array` — dB SPL per bin.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `numList(text)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Parse a comma-separated list of numbers.

**Parameters**

- `text` — `string` — The list.

**Returns**

- `number[]` — The finite numbers in it.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `DistortionControls(props)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Controls for the distortion analyses.

**Parameters**

- `props` — `object` — Component props.
- `props.cfg` — `object` — The distortion settings.
- `props.set` — `Function` — Writes a patch to them.

**Returns**

- `React.ReactElement` — The controls.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `pct(db)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Convert a level re the fundamental to a percentage.

**Parameters**

- `db` — `number` — dB relative to the fundamental.

**Returns**

- `number` — Percent.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `DistortionView(props)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

The distortion result for the selected analysis.

**Parameters**

- `props` — `object` — Component props.
- `props.mode` — `string` — The analysis.
- `props.res` — `object|null` — Its result.
- `props.onRun` — `Function` — Starts a run.

**Returns**

- `React.ReactElement` — The view.

**Side effects**

- Subscribes to the store.

### `FailedPoints(props)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Points of a distortion analysis that could not be solved, and why.

**Parameters**

- `props` — `object` — Props.
- `props.failed` — `Array<{label: string, error: string}>` _(optional)_ — The points.

**Returns**

- `React.ReactElement|null` — A notice, or nothing when every point solved.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `ExitLosses()`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Duct exit losses, listed for every waveguide.

**Returns**

- `React.ReactElement` — The section.

**Side effects**

- Subscribes to the store.

### `JobStatus()`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

The running job's progress, with a cancel button.

**Returns**

- `React.ReactElement|null` — The indicator, or nothing when idle.

**Side effects**

- Subscribes to the store.
