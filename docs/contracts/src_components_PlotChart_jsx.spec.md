# Contract specification: `src/components/PlotChart.jsx`

> Generated from method contracts. This file contains **no implementation code**.
> Write tests against what is claimed here, not against what you expect the code to do.

## Module

A light line chart for the time-domain workspace.

Drawn as one SVG stretched to its box (so a chart fills whatever card it
sits in), with the tick labels, reference labels and legend in HTML around
it, where text keeps its size however the plot is stretched. Lines keep
their width through `vector-effect`. Hovering shows each trace's value at
the cursor.

## EXPORTED (5)

### `niceTicks(lo, hi, count)`

- **Reachability:** EXPORTED
- **Obtain via:** import { niceTicks } from '../../src/components/PlotChart.jsx'

Round tick positions across a linear range, on a 1-2-5 step.

**Parameters**

- `lo` — `number` — Range start.
- `hi` — `number` — Range end.
- `count` — `number` _(optional)_ — Roughly how many.

**Returns**

- `number[]` — The ticks inside the range.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `logTicks(lo, hi)`

- **Reachability:** EXPORTED
- **Obtain via:** import { logTicks } from '../../src/components/PlotChart.jsx'

Ticks across a logarithmic range: 1, 2 and 5 of each decade.

**Parameters**

- `lo` — `number` — Range start, above zero.
- `hi` — `number` — Range end.

**Returns**

- `number[]` — The ticks inside the range.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `tickText(v)`

- **Reachability:** EXPORTED
- **Obtain via:** import { tickText } from '../../src/components/PlotChart.jsx'

A tick value as short text: three figures, thousands as k, a true minus sign.

**Parameters**

- `v` — `number` — The value.

**Returns**

- `string` — e.g. `1.5k`, `−6`, `0.25`.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `resolveY(given, data, logY)`

- **Reachability:** EXPORTED
- **Obtain via:** import { resolveY } from '../../src/components/PlotChart.jsx'

Resolve the y range: given numbers, `dataMax ± n` / `dataMin ± n` expressions, or the data padded.

**Parameters**

- `given` — `Array|undefined` — `[lo, hi]`, each a number, an expression, or `auto`.
- `data` — `number[]` — The data's `[lo, hi]`.
- `logY` — `boolean` — A log axis: padded by ratio.

**Returns**

- `number[]` — `[lo, hi]`.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `PlotChart(props)`

- **Reachability:** EXPORTED
- **Obtain via:** import { PlotChart } from '../../src/components/PlotChart.jsx'

A line chart that fills its box.

**Parameters**

- `props` — `object` — Component props.
- `props.title` — `string` _(optional)_ — Heading, top left.
- `props.xunit` — `string` _(optional)_ — The x axis's unit, top right — e.g. `time, ms`.
- `props.ylabel` — `string` _(optional)_ — The y axis's unit, above its ticks.
- `props.series` — `Array<object>` — `{key, name, color, x, y, dash?, width?, legend?, right?, marker?}` per trace, x sorted; `right` traces use a second axis on the right; `marker` dots every point.
- `props.y2label` — `string` _(optional)_ — The right axis's unit.
- `props.xDomain` — `number[]` _(optional)_ — `[x0, x1]`; the data's range by default.
- `props.yDomain` — `Array` _(optional)_ — `[lo, hi]`: numbers or `dataMax - n` style ends; the data padded by default.
- `props.logX` — `boolean` _(optional)_ — Logarithmic x.
- `props.logY` — `boolean` _(optional)_ — Logarithmic y.
- `props.refs` — `Array<object>` _(optional)_ — `{y, label?, color?}` horizontal reference lines.
- `props.yTicks` — `Array<{y: number, label: string}>` _(optional)_ — Labelled ticks in place of the automatic ones.
- `props.legend` — `boolean` _(optional)_ — Show the legend; on by default.
- `props.height` — `number` _(optional)_ — A fixed height, px; otherwise the chart fills its parent.

**Returns**

- `React.ReactElement` — The chart.

**Side effects**

- Keeps the hover position as local state.

## UNREACHABLE (7)

### `yRange(series, xr, logY)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

The value range of some traces, over the part of x shown.

**Parameters**

- `series` — `Array<{x: number[], y: number[]}>` — The traces.
- `xr` — `number[]` — `[x0, x1]` shown.
- `logY` — `boolean` — Whether only positive values count.

**Returns**

- `number[]` — `[lo, hi]`, or `[0, 1]` when there is nothing.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `resolveY > one(g, fallback)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

One end of the range.

**Parameters**

- `g` — `*` — The given end.
- `fallback` — `number` — Its value when not given.

**Returns**

- `number` — The end.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `nearest(xs, x)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

The index of the sample nearest an x, in a sorted array.

**Parameters**

- `xs` — `number[]` — Sorted x values.
- `x` — `number` — The x.

**Returns**

- `number` — The index, or -1 for an empty array.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `PlotChart > X(v)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

x in the drawing space.

**Parameters**

- `v` — `number` — A value.

**Returns**

- `number` — 0–1000.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `PlotChart > Y(v)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

y in the drawing space.

**Parameters**

- `v` — `number` — A value.

**Returns**

- `number` — 0–300, top down.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `PlotChart > Y2(v)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

y on the right axis, in the drawing space.

**Parameters**

- `v` — `number` — A value.

**Returns**

- `number` — 0–300, top down.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `PlotChart > onMove(e)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Follow the cursor over the plot.

**Parameters**

- `e` — `React.MouseEvent` — The move.

**Returns**

- `void`

**Side effects**

- Writes the hover position.
