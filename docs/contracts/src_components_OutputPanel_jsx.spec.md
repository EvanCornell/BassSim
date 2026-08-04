# Contract specification: `src/components/OutputPanel.jsx`

> Generated from method contracts. This file contains **no implementation code**.
> Write tests against what is claimed here, not against what you expect the code to do.

## Exported constants

Names this module publishes that are not methods. The method contracts
above and below refer to these by role — a command, a node type, a panel —
so this is the vocabulary they assume.

### `CHART_PANELS`

Chart id to component.

Keyed the same as the per-chart zoom state in the store, so a chart keeps
its zoom when it is re-docked or tabbed away.

Keys: `spl`, `zin`, `exc`, `vel`, `int`, `pow`, `eff`, `pe`, `ph`

### `__internals`

Keys: `fmt`, `round5`, `fitDb`, `fitLinear`, `nearestIdx`, `snapLines`

## EXPORTED (1)

### `chartPanelComponent(id)`

- **Reachability:** EXPORTED
- **Obtain via:** import { chartPanelComponent } from '../../src/components/OutputPanel.jsx'

Build the dockable panel component for one chart.

A fresh component is built on every call, so two calls with the same id
return distinct — though behaviourally identical — component types. Callers
that mount the result should hold onto it rather than calling again on each
render, or React will unmount and remount the panel.

**Parameters**

- `id` — `string` — Chart id.

**Returns**

- `React.ComponentType|null` — A newly built panel component, or `null` for an unknown id.

**Side effects**

- None, but not `@pure`: the returned component is a new object each call, so results are never equal by identity.

## INTERNAL (6)

### `fmt(v, d)`

- **Reachability:** INTERNAL
- **Obtain via:** import { __internals } from '../../src/components/OutputPanel.jsx'  →  __internals.fmt

Format a chart value, or an em dash when there is nothing to show.

**Parameters**

- `v` — `number|null|undefined` — The value.
- `d` — `number` _(optional, default `1`)_ — Decimal places.

**Returns**

- `string` — The formatted number, or `'—'`.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `round5(v, up)`

- **Reachability:** INTERNAL
- **Obtain via:** import { __internals } from '../../src/components/OutputPanel.jsx'  →  __internals.round5

Round a dB bound to a multiple of 5, so axis labels land on round numbers.

**Parameters**

- `v` — `number` — The bound.
- `up` — `boolean` — Round up rather than down.

**Returns**

- `number` — The rounded bound.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `fitDb(rows, keys, windowDb)`

- **Reachability:** INTERNAL
- **Obtain via:** import { __internals } from '../../src/components/OutputPanel.jsx'  →  __internals.fitDb

A useful Y range for a dB curve: a fixed window below the peak.

Anchoring to the peak rather than the data extent keeps deep nulls from
compressing the whole trace into the top of the chart — a 60 dB null is
real but says nothing about the passband.

The upper bound is not the peak: it is the peak plus 4 dB of headroom, so the
loudest trace does not sit flush against the top of the plot. Both bounds are
then rounded outward to a multiple of 5, which is what puts the axis labels on
round numbers.

**Parameters**

- `rows` — `Array<object>` — Chart rows.
- `keys` — `string[]` — Series keys to consider.
- `windowDb` — `number` _(optional, default `45`)_ — How far below the peak to show.

**Returns**

- `[number, number]|null` — The domain as `[round5(peak − windowDb, down), round5(peak + 4, up)]`, or `null` when no data is finite.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `fitLinear(rows, keys, floor, atLeast)`

- **Reachability:** INTERNAL
- **Obtain via:** import { __internals } from '../../src/components/OutputPanel.jsx'  →  __internals.fitLinear

A useful Y range for a linear curve: from a floor to a padded maximum.

**Parameters**

- `rows` — `Array<object>` — Chart rows.
- `keys` — `string[]` — Series keys to consider.
- `floor` — `number` _(optional, default `0`)_ — Lower bound.
- `atLeast` — `number` _(optional, default `0`)_ — Minimum upper bound, so a flat trace still gets a sensible axis.

**Returns**

- `[number, number]|null` — The domain, or `null` when no data is finite.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `nearestIdx(arr, f)`

- **Reachability:** INTERNAL
- **Obtain via:** import { __internals } from '../../src/components/OutputPanel.jsx'  →  __internals.nearestIdx

Index of the sample nearest a frequency, by binary search.

Used to resample snapshot curves onto the current axis; a linear scan
would make a full overlay O(n²).

**Parameters**

- `arr` — `number[]` — Ascending frequency axis.
- `f` — `number` — Frequency to locate.

**Returns**

- `number` — Index of the nearest sample. When two samples are exactly equidistant the higher index wins, which keeps a resampled overlay from drifting low across a run of ties.

**Preconditions (caller must guarantee)**

- arr is sorted ascending and holds at least two samples

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `snapLines(snapshots, key)`

- **Reachability:** INTERNAL
- **Obtain via:** import { __internals } from '../../src/components/OutputPanel.jsx'  →  __internals.snapLines

Series descriptors for the snapshot overlays of one quantity.

Drawn dashed and thinner than the live trace, so an overlay never reads
as the current result.

**Parameters**

- `snapshots` — `Array<object>` — Stored snapshots.
- `key` — `string` — Quantity key to overlay.

**Returns**

- `Array<object>` — Line descriptors for `BaseChart`.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

## UNREACHABLE (28)

### `BaseChart(props)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

The shared chart shell: log-frequency axis, zoom, pan and drag-select.

Every plot is built on this, so they all behave identically. Three
gestures: wheel zooms both axes about the cursor, shift or middle drag
pans, and a plain drag selects an X range.

Zoom state is read through a ref inside the wheel and pointer handlers
rather than from props. Those listeners are registered once on mount —
`wheel` needs `passive: false` to be preventable and `pointerdown` needs
capture to beat recharts' own drag-select — so they would otherwise close
over the domain as it was at mount and zoom from the wrong origin forever.

Zooming out to the full sweep resets rather than clamping, which is what
lets a few scroll-outs return the chart to its default view instead of
leaving it in Manual mode at the original bounds.

**Parameters**

- `props` — `object` — Component props.
- `props.chartId` — `string` — Chart id; keys the persisted zoom and Y-scale state.
- `props.data` — `Array<object>` — Recharts rows, each carrying `f` plus one field per series.
- `props.lines` — `Array<object>` — Series descriptors.
- `props.yLabel` — `string` — Left axis label.
- `props.yDomain` — `Array|undefined` — Left axis domain.
- `props.y2Label` — `string` _(optional)_ — Right axis label.
- `props.y2Domain` — `Array` _(optional)_ — Right axis domain.
- `props.refLines` — `Array<React.ReactElement>` _(optional, default `[]`)_ — Reference lines to overlay.
- `props.refAreas` — `Array<React.ReactElement>` _(optional, default `[]`)_ — Shaded regions to overlay.
- `props.children` — `React.ReactNode` _(optional)_ — Extra toolbar content.

**Returns**

- `React.ReactElement` — The chart.

**Side effects**

- Subscribes to the store. Registers wheel and pointerdown listeners on its own element, removed on unmount.

### `BaseChart > setManualY(lo, hi)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Switch this chart's Y axis to Manual mode with explicit bounds.

**Parameters**

- `lo` — `number` — Lower bound.
- `hi` — `number` — Upper bound.

**Returns**

- `void`

**Side effects**

- Writes the Y-scale setting, which persists with the project.

### `BaseChart > setManualY > r4(v)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Round a bound so the Manual inputs show a readable number.

**Parameters**

- `v` — `number` — The bound.

**Returns**

- `number` — The bound at 4 significant figures.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `BaseChart > resetAll()`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Return this chart to its default view: full sweep, Y back to Fit.

**Returns**

- `void`

**Side effects**

- Clears the zoom and writes the Y-scale setting.

### `BaseChart > fracs(clientX, clientY)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Where the cursor sits inside the plot area, as fractions of each axis.

The plot area is inset from the element by the axis gutters, which are
fixed by the chart's own margins, so they are subtracted as constants
rather than measured.

**Parameters**

- `clientX` — `number` — Pointer X in client coordinates.
- `clientY` — `number` — Pointer Y in client coordinates.

**Returns**

- `[number, number]` — Fraction along X and up Y, each clamped to 0–1.

**Side effects**

- Reads live element geometry.

### `BaseChart > onWheel(e)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Zoom both axes about the cursor.

X zooms in log space, because the axis is logarithmic and a linear zoom
would feel wrong at one end. When recharts has reported the exact data
point under the cursor, that is used as the centre instead of the
geometric fraction, so the value under the pointer stays put.

Refuses to zoom in past a 1.15 ratio, and resets entirely rather than
clamping once the view covers the whole sweep.

**Parameters**

- `e` — `WheelEvent` — The wheel event.

**Returns**

- `void`

**Side effects**

- Prevents the page from scrolling, and writes zoom and Y-scale state.

**Reads external mutable state**

- the current domains through a ref, since this listener is registered once on mount.

### `BaseChart > onPointerDown(e)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Begin a pan, on shift-drag or middle-drag.

Propagation is stopped so recharts does not start a drag-select at the
same time. The pan is clamped to keep the window inside the swept range.

**Parameters**

- `e` — `PointerEvent` — The pointerdown event.

**Returns**

- `void`

**Side effects**

- Registers window pointermove and pointerup listeners.

### `BaseChart > onPointerDown > move(ev)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Apply the in-progress pan.

**Parameters**

- `ev` — `PointerEvent` — The pointermove event.

**Returns**

- `void`

**Side effects**

- Writes zoom and Y-scale state on every move.

**Reads external mutable state**

- the domains captured when the pan started.

### `BaseChart > onPointerDown > up()`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

End the pan and remove its listeners.

**Returns**

- `void`

**Side effects**

- Removes the window listeners.

### `BaseChart > commitZoom()`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Apply a completed drag-select as an X zoom.

Selections narrower than 5% are discarded as accidental clicks rather
than zooming to a sliver.

**Returns**

- `void`

**Side effects**

- Writes zoom state and clears the drag markers.

### `useFitData(chartId, data)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

The rows currently visible, for Y "Fit" mode.

When zoomed, Fit should frame what is on screen rather than the whole
sweep — otherwise zooming into a quiet region leaves the trace pinned to
the bottom of the chart.

**Parameters**

- `chartId` — `string` — Chart id.
- `data` — `Array<object>` — All rows.

**Returns**

- `Array<object>` — The rows inside the current zoom window, or all of them when unzoomed.

**Side effects**

- Subscribes to the store.

### `useYScale(id, fitDomain)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Per-chart Y-scale control, and the domain it resolves to.

Three modes: Fit uses a computed useful range, Full lets recharts use the
entire data range, and Manual takes explicit bounds. Persisted in
settings, so the choice survives tab switches and project save/load.

**Parameters**

- `id` — `string` — Chart id.
- `fitDomain` — `Array|null` — The computed Fit domain.

**Returns**

- `[Array, React.ReactElement]` — The resolved Y domain and the control to render.

**Side effects**

- Subscribes to the store.

### `useYScale > setYs(patch)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Merge a change into this chart's persisted Y-scale settings.

**Parameters**

- `patch` — `object` — Fields to change.

**Returns**

- `void`

**Side effects**

- Writes the Y-scale setting, which persists with the project.

### `useChartData(keys)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Merge results and snapshots into recharts row objects.

One row per frequency carrying every requested series, since recharts
wants row-major data while the solver produces column-major arrays.
Snapshot series are resampled onto the current frequency axis, which is
what lets an overlay taken at a different sweep resolution still line up.

**Parameters**

- `keys` — `string[]` — Which series families to include.

**Returns**

- `{data: Array<object>, portIds: string[]}` — The rows, and the radiator ids present in them.

**Side effects**

- Subscribes to the store.

### `SPLTab()`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Sound pressure level, with a trace per radiator beside the combined response.

**Returns**

- `React.ReactElement` — The chart.

**Side effects**

- Subscribes to the store.

### `ImpedanceTab()`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Electrical input impedance magnitude, with phase on a second axis.

**Returns**

- `React.ReactElement` — The chart.

**Side effects**

- Subscribes to the store.

### `ExcursionTab()`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Cone excursion against Xmax, one trace per driver.

Cones in different places do not move together and are not
interchangeable when their Xmax differs, so each gets its own trace.

Millimetres are what you order parts by, but percent is the only way to
compare cones whose limits differ — so a design mixing limits defaults to
percent, and the unit is switchable either way. In percent every driver
shares one 100% line; in millimetres there is a reference line per
distinct Xmax, labelled with its drivers when they differ.

**Returns**

- `React.ReactElement` — The chart.

**Side effects**

- Subscribes to the store.

### `ExcursionTab > labelOf(id)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

The display label for a driver node, falling back to its id.

**Parameters**

- `id` — `string` — Driver node id.

**Returns**

- `string` — The label, or the id when unlabelled.

**Reads external mutable state**

- the enclosing `nodes` list.

### `ExcursionTab > seriesKey(id)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

The row field holding this driver's excursion, in the selected unit.

**Parameters**

- `id` — `string` — Driver node id.

**Returns**

- `string` — The series key.

**Reads external mutable state**

- the enclosing unit selection.

### `ExcursionTab > nameFor(xm)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

The label for one Xmax reference line.

With mixed limits the line names the drivers it applies to, since
otherwise two lines a millimetre apart would be indistinguishable.

**Parameters**

- `xm` — `number` — The Xmax value, mm.

**Returns**

- `string` — The reference line label.

**Reads external mutable state**

- the enclosing driver list and Xmax map.

### `VelocityTab()`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Air velocity in each waveguide, against the turbulence threshold.

The threshold line is the point of the chart: a port above it chuffs
audibly however good the response looks.

**Returns**

- `React.ReactElement` — The chart.

**Side effects**

- Subscribes to the store.

### `InteriorTab()`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Interior SPL at each probed chamber's virtual microphone.

The right measure for in-cabin listening levels, where cabin gain rises
below the cabin's first mode. Point pressure, so there is no 1 m
convention here.

**Returns**

- `React.ReactElement` — The chart.

**Side effects**

- Subscribes to the store.

### `PowerTab()`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Radiated acoustic power.

**Returns**

- `React.ReactElement` — The chart.

**Side effects**

- Subscribes to the store.

### `EfficiencyTab()`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Acoustic efficiency as a percentage of electrical input power.

**Returns**

- `React.ReactElement` — The chart.

**Side effects**

- Subscribes to the store.

### `ElecPowerTab()`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Electrical input power, real and apparent.

**Returns**

- `React.ReactElement` — The chart.

**Side effects**

- Subscribes to the store.

### `PhaseTab()`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Phase and group delay on separate axes.

**Returns**

- `React.ReactElement` — The chart.

**Side effects**

- Subscribes to the store.

### `ChartPanel(props)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

The shell every chart panel shares.

**Parameters**

- `props` — `object` — Component props.
- `props.children` — `React.ReactNode` — The chart to wrap.

**Returns**

- `React.ReactElement` — The panel.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `chartPanelComponent > Wrapped()`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

The chart wrapped in its panel shell.

**Returns**

- `React.ReactElement` — The panel.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.
