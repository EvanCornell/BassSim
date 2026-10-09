# Contract specification: `src/components/NLLab.jsx`

> Generated from method contracts. This file contains **no implementation code**.
> Write tests against what is claimed here, not against what you expect the code to do.

## Exported constants

Names this module publishes that are not methods. The method contracts
above and below refer to these by role — a command, a node type, a panel —
so this is the vocabulary they assume.

### `__internals`

Keys: `refValue`, `fmtVal`, `niceTicks`, `catalogueXvar`, `catalogueGeometry`, `fitFor`, `curveSummary`

## EXPORTED (3)

### `curveSummary(curve)`

- **Reachability:** EXPORTED
- **Obtain via:** import { curveSummary } from '../../src/components/NLLab.jsx'

What a curve holds, in a few words.

**Parameters**

- `curve` — `object` — A curve.

**Returns**

- `string` — e.g. `2 points, symmetric`, `Imported table`, `Flat`.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `NLRail()`

- **Reachability:** EXPORTED
- **Obtain via:** import { NLRail } from '../../src/components/NLLab.jsx'

The curve list beside the editor: the driver, and what each curve holds.

**Returns**

- `React.ReactElement` — The rail's sections.

**Side effects**

- Subscribes to the store; picks the driver and curve.

### `NLLab()`

- **Reachability:** EXPORTED
- **Obtain via:** import { NLLab } from '../../src/components/NLLab.jsx'

The driver curve editor: a driver's large-signal Bl, Kms/Cms and Le curves.

Curves describe how each parameter varies with excursion, as a ratio of
its small-signal value. Nonlinear time-domain runs use them directly; the
frequency sweep does not, since it is the small-signal model. The driver
and curve are picked in the rail beside it (`NLRail`).

**Returns**

- `React.ReactElement` — The editor.

**Side effects**

- Subscribes to the store; edits update the driver's params.

## INTERNAL (6)

### `refValue(param, p)`

- **Reachability:** INTERNAL
- **Obtain via:** import { __internals } from '../../src/components/NLLab.jsx'  →  __internals.refValue

The small-signal reference value for a parameter, for the absolute-value axis.

The editor works in ratios, but a ratio is hard to judge without knowing
what it is a ratio *of* — this supplies the driver's own value so the
second axis can show real units.

Kms is derived as 1/Cms, since a driver stores compliance rather than
stiffness.

**Parameters**

- `param` — `'Bl'|'Cms'|'Kms'|'Le'` — The parameter.
- `p` — `object` — The driver node's params.

**Returns**

- `{v: number, unit: string}` — The reference value and its unit, defaulting to 1 when the driver does not specify it.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `fmtVal(v)`

- **Reachability:** INTERNAL
- **Obtain via:** import { __internals } from '../../src/components/NLLab.jsx'  →  __internals.fmtVal

Format an axis value at a readable precision for its magnitude.

Three bands, so a value keeps roughly three significant figures without an
axis label ever running long: at or above 100 no decimals, at or above 10 one
decimal, and below that three significant figures.

**Parameters**

- `v` — `number` — The value.

**Returns**

- `string` — The formatted value.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `niceTicks(lo, hi, target)`

- **Reachability:** INTERNAL
- **Obtain via:** import { __internals } from '../../src/components/NLLab.jsx'  →  __internals.niceTicks

Axis tick positions at round intervals.

Picks a 1, 2 or 5 times a power of ten step — the intervals people read
without effort — landing near the requested tick count rather than
exactly on it.

**Parameters**

- `lo` — `number` — Axis minimum.
- `hi` — `number` — Axis maximum.
- `target` — `number` _(optional, default `8`)_ — Desired tick count.

**Returns**

- `number[]` — Tick values, empty when the span is not positive.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `catalogueXvar(p, custom)`

- **Reachability:** INTERNAL
- **Obtain via:** import { __internals } from '../../src/components/NLLab.jsx'  →  __internals.catalogueXvar

A driver's published Xvar, when it came from the built-in catalogue.

**Parameters**

- `p` — `object` — The driver node's params.
- `custom` — `Array<object>` _(optional)_ — The workspace's custom drivers.

**Returns**

- `number|null` — Xvar, mm, or `null` when the catalogue does not list one.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `catalogueGeometry(p, custom)`

- **Reachability:** INTERNAL
- **Obtain via:** import { __internals } from '../../src/components/NLLab.jsx'  →  __internals.catalogueGeometry

A driver's coil (winding) and magnetic gap heights, when its catalogue entry lists them.

**Parameters**

- `p` — `object` — The driver node's params.
- `custom` — `Array<object>` _(optional)_ — The workspace's custom drivers.

**Returns**

- `{coil: number, gap: number}|null` — Heights, mm, or `null` without both.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `fitFor(p, custom)`

- **Reachability:** INTERNAL
- **Obtain via:** import { __internals } from '../../src/components/NLLab.jsx'  →  __internals.fitFor

The curves a driver's saved build settings, or its catalogue entry, give: from the motor when its geometry is known, else from Xmax.

**Parameters**

- `p` — `object` — The driver node's params.
- `custom` — `Array<object>` _(optional)_ — The workspace's custom drivers.

**Returns**

- `{Bl: object, Kms: object, label: string}|null` — The curves and what they were built from; `null` when there is nothing to build from.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

## UNREACHABLE (36)

### `CurveEditor(props)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Interactive editor for one nonlinear parameter curve.

Parametric-EQ style: click the curve to add a control point, drag it to
move and reshape it, tune width with the slider. Wheel zooms about the
cursor, shift or middle drag pans, Delete removes the selected point.

Dragging a point sets its gain relative to the curve *without* that point,
so grabbing a point and moving it puts the curve where the cursor is
rather than adding to what is already there.

**Parameters**

- `props` — `object` — Component props.
- `props.driverId` — `string` — Driver node being edited.
- `props.param` — `'Bl'|'Cms'|'Kms'|'Le'` — Which curve.
- `props.nl` — `object` — The driver's full nonlinear parameter set.
- `props.xmax` — `number` — The driver's Xmax, mm, which sets the default span.
- `props.width` — `number` — Available width, px.
- `props.height` — `number` — Available height, px.
- `props.refv` — `{v: number, unit: string}` — Small-signal reference for the absolute-value axis.
- `props.overlays` — `Array<{label: string, color: string, curve: object, xmax: number}>` _(optional)_ — Curves drawn dashed for comparison.

**Returns**

- `React.ReactElement` — The editor.

**Side effects**

- Subscribes to the store; edits update the driver's params, which triggers a resimulation. Registers a non-passive wheel listener and a window keydown listener.

### `CurveEditor > toPx(x, r)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Convert data coordinates to pixels.

**Parameters**

- `x` — `number` — Excursion, mm.
- `r` — `number` — Ratio value.

**Returns**

- `[number, number]` — Pixel coordinates within the SVG.

**Reads external mutable state**

- the current view window.

### `CurveEditor > fromPx(px, py)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Convert pixel coordinates back to data coordinates.

**Parameters**

- `px` — `number` — X in SVG pixels.
- `py` — `number` — Y in SVG pixels.

**Returns**

- `[number, number]` — Excursion in mm and the ratio value.

**Reads external mutable state**

- the current view window.

### `CurveEditor > commit(patch)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Write a change to this curve back to the driver node.

**Parameters**

- `patch` — `object` — Fields to change on the curve.

**Returns**

- `*` — Whatever the store action returns; callers ignore it.

**Side effects**

- Updates the driver's params, which triggers a resimulation.

### `CurveEditor > zoomAt(px, py, factor)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Zoom the view about a pixel position.

Refuses zoom levels outside a sane span in either axis, so the view
cannot be lost by over-scrolling.

**Parameters**

- `px` — `number` — X in SVG pixels.
- `py` — `number` — Y in SVG pixels.
- `factor` — `number` — Scale factor; above 1 zooms out.

**Returns**

- `void`

**Side effects**

- Updates the view window.

### `CurveEditor > onWheel(e)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Zoom about the cursor.

Registered manually rather than through React's `onWheel` because that
one is passive and cannot call `preventDefault`, so the page would scroll
as well. The zoom maths is inlined against the latest view read from a
ref, since this listener is registered once on mount.

**Parameters**

- `e` — `WheelEvent` — The wheel event.

**Returns**

- `void`

**Side effects**

- Prevents the page from scrolling and updates the view window.

### `CurveEditor > onSvgPointerDown(e)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Begin a pan, on shift-drag or middle-drag.

**Parameters**

- `e` — `React.PointerEvent` — The pointerdown event.

**Returns**

- `void`

**Side effects**

- Registers window pointermove and pointerup listeners. Ignores plain clicks, which add a point instead.

### `CurveEditor > onSvgPointerDown > move(ev)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Apply the in-progress pan.

**Parameters**

- `ev` — `PointerEvent` — The pointermove event.

**Returns**

- `void`

**Side effects**

- Updates the view window on every move.

### `CurveEditor > onSvgPointerDown > up()`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

End the pan and remove its listeners.

**Returns**

- `void`

**Side effects**

- Clears the pan state and removes the window listeners.

### `CurveEditor > onSvgClick(e)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Add a control point where the curve was clicked.

The new point's gain is the gap between the click and the current curve,
so the curve passes through exactly where it was clicked rather than
jumping. Clicks on an existing point, during a pan, or outside the plot
are ignored.

**Parameters**

- `e` — `React.MouseEvent` — The click event.

**Returns**

- `void`

**Side effects**

- Adds a control point and selects it, which triggers a resimulation.

### `CurveEditor > onSvgMove(e)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Track the cursor for the crosshair guide.

**Parameters**

- `e` — `React.MouseEvent` — The mousemove event.

**Returns**

- `void`

**Side effects**

- Updates the hover position, or clears it outside the plot.

### `CurveEditor > onDragPoint(idx, e)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Drag one control point.

Gain is recomputed against the curve with this point removed, so the
point follows the cursor exactly instead of compounding with its own
contribution.

**Parameters**

- `idx` — `number` — Index of the point.
- `e` — `React.PointerEvent` — The pointerdown event.

**Returns**

- `void`

**Side effects**

- Selects the point and registers window pointermove and pointerup listeners. Each move updates the driver's params.

### `CurveEditor > onDragPoint > move(ev)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Apply the in-progress point drag.

**Parameters**

- `ev` — `PointerEvent` — The pointermove event.

**Returns**

- `void`

**Side effects**

- Updates the driver's params on every move, which triggers a resimulation.

### `CurveEditor > onDragPoint > up()`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

End the point drag and remove its listeners.

**Returns**

- `void`

**Side effects**

- Removes the window listeners.

### `CurveEditor > removePoint(idx)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Delete one control point.

**Parameters**

- `idx` — `number` — Index of the point.

**Returns**

- `void`

**Side effects**

- Updates the driver's params and clears the selection.

### `CurveEditor > onKey(e)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Delete the selected control point on Delete or Backspace.

Only acts while the Lab holds focus: the Node Editor uses the same key to
remove graph nodes, and both panels can be on screen at once.

**Parameters**

- `e` — `KeyboardEvent` — The keydown event.

**Returns**

- `void`

**Side effects**

- Removes the selected point, which triggers a resimulation. Ignored while a text field has focus or the curve editor is not the view on screen.

### `PolyButton(props)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Enter a curve as polynomial coefficients, as measurement reports publish them.

Coefficients are in the parameter's absolute units with x in mm, constant
term first — Bl(x) = b0 + b1·x + b2·x² … — over the range they were fitted
on. The curve becomes P(x)/P(0), held at its end values outside that range.

**Parameters**

- `props` — `object` — Component props.
- `props.curve` — `object` — The curve being edited.
- `props.param` — `string` — Its parameter name.
- `props.refv` — `{v: number, unit: string}` — The driver's small-signal value, shown for comparison.
- `props.setCurve` — `Function` — Writes a patch to the curve.

**Returns**

- `React.ReactElement` — The button, and its form when open.

**Side effects**

- Holds the form's text in component state.

### `catalogueEntry(p, custom)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

A driver's catalogue entry, from the built-in catalogue or the workspace's own drivers.

Driver nodes keep only what the solver reads, so construction figures such
as coil and gap heights are looked up again by model.

**Parameters**

- `p` — `object` — The driver node's params.
- `custom` — `Array<object>` _(optional)_ — The workspace's custom drivers.

**Returns**

- `object|null` — The entry, or `null` when no driver of that model is listed.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `buildMethod(r, geo)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

How a driver's curves are built: as last built, else from the motor when its geometry is known.

Builds saved before the motor model carry no method and were made from Xmax.

**Parameters**

- `r` — `object|undefined` — The saved build settings (`nl.ratings`).
- `geo` — `object|null` — The catalogue's coil and gap heights.

**Returns**

- `'geometry'|'xmax'` — The method.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `pct(r)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

A ratio as a percentage.

**Parameters**

- `r` — `number` — The ratio.

**Returns**

- `string` — e.g. `70%`.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `dbText(v)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

A level in dB.

**Parameters**

- `v` — `number` — dB.

**Returns**

- `string` — e.g. `3.1 dB`.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `mmText(v)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

An excursion in mm, or a dash when there is none.

**Parameters**

- `v` — `number|null` — mm.

**Returns**

- `string` — e.g. `4.1 mm`.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `MmField(props)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

A number field for the builder: free text, red while it does not read as a number.

**Parameters**

- `props` — `object` — Component props.
- `props.label` — `string` — Its label.
- `props.value` — `string` — The text.
- `props.onChange` — `Function` — Called with the new text.
- `props.placeholder` — `string` _(optional)_ — Shown when empty.
- `props.zero` — `boolean` _(optional)_ — Whether 0 is allowed.
- `props.title` — `string` _(optional)_ — Its tooltip.

**Returns**

- `React.ReactElement` — The field.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `RatingsButton(props)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Build Bl(x) and Kms(x) for a driver, as a form behind a button.

From the motor: Bl(x) follows the coil and gap heights and the fringe
past each plate face (see `blFromGeometry`); the driver's Xmax is not used
for it and is left as it is. From Xmax, for drivers whose geometry is not
published: Bl falls to 70% at Xmax (see `curvesFromRatings`). Either way the
suspension stiffens by whatever the 6 dB at Xvar still needs. Applying
replaces Bl(x), Kms(x) and any Cms(x).

**Parameters**

- `props` — `object` — Component props.
- `props.driver` — `object` — The driver node.
- `props.nl` — `object` — Its curve set.

**Returns**

- `React.ReactElement` — The button, and its form when open.

**Side effects**

- Holds the form's values in component state; applying updates the driver's params.

### `RatingsButton > show()`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Open the form, filled from the last build, or the driver and its catalogue entry.

**Returns**

- `void`

**Side effects**

- Writes component state.

### `RatingsButton > show > str(v)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

A stored number as field text.

**Parameters**

- `v` — `*` — The number, or nothing.

**Returns**

- `string` — Its text; empty for nothing.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `RatingsButton > field(k)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Set one field.

**Parameters**

- `k` — `string` — The field.

**Returns**

- `Function` — Its change handler.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `RatingsButton > num(t)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

A field's number.

**Parameters**

- `t` — `string` — Its text.

**Returns**

- `number|null` — The number; `null` when empty, NaN when unreadable.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `RatingsButton > apply()`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Install the curves on the driver.

**Returns**

- `void`

**Side effects**

- Updates the driver's params, which triggers a resimulation.

### `useNlDriver()`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

The driver being edited, and its curves with defaults filled in.

**Returns**

- `{drivers: Array<object>, driver: object|undefined, nl: object|null, param: string}` — Every driver, the chosen one, its curves, and the chosen curve.

**Side effects**

- Subscribes to the store.

### `AddOverlay(props)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

The "+ Add overlay" menu: the same driver's curves in another record, a driver in another project, or a fit to the driver's ratings.

**Parameters**

- `props` — `object` — Component props.
- `props.driver` — `object` — The driver being edited.

**Returns**

- `React.ReactElement` — The button and, when open, its menu.

**Side effects**

- Subscribes to the store; reads records; adds overlays.

### `AddOverlay > add(id, label, nl, xmax)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Lay a curve set over the editor.

**Parameters**

- `id` — `string` — What it is, so it is added once.
- `label` — `string` — Its name.
- `nl` — `object|null` — Its curves; none is the linear driver, every curve flat.
- `xmax` — `number` — Its driver's Xmax.

**Returns**

- `void`

**Side effects**

- Writes the overlays; closes the menu.

### `AddOverlay > fromRecord(i)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.
- **Async:** returns a Promise

Overlay this driver as another record holds it.

**Parameters**

- `i` — `number` — The record.

**Returns**

- `Promise<void>` — Resolves once added.

**Side effects**

- Reads the record; writes the overlays.

### `NLLab > setCurve(patch)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Write a change to the selected curve back to the driver node.

**Parameters**

- `patch` — `object` — Fields to change on the curve.

**Returns**

- `*` — Whatever the store action returns; callers ignore it.

**Side effects**

- Updates the driver's params, which triggers a resimulation.

### `NLLab > importCSV(e)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Import a measured curve from a CSV file.

**Parameters**

- `e` — `React.ChangeEvent` — The file input change event.

**Returns**

- `void`

**Side effects**

- Reads the file and replaces the curve's table, or alerts when it cannot be parsed.

### `NLLab > importCSV > reader.onload()`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Parse the loaded CSV and install it as this curve's table.

Normalized on the way in, since published curves are usually in absolute
units while the engine works in ratios.

**Returns**

- `void`

**Side effects**

- Updates the driver's params, or alerts when the file is unusable.
