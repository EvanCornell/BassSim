# Contract specification: `src/components/NLLab.jsx`

> Generated from method contracts. This file contains **no implementation code**.
> Write tests against what is claimed here, not against what you expect the code to do.

## EXPORTED (1)

### `NLLab()`

- **Reachability:** EXPORTED
- **Obtain via:** import { NLLab } from '../../src/components/NLLab.jsx'

The Nonlinear Lab: edit a driver's large-signal curves and see their effect.

Experimental. Curves describe how Bl, Cms/Kms and Le vary with excursion;
the solver then iterates a quasi-linear sweep against them, which captures
power compression and resonance drift but produces no harmonic distortion
— that needs a time-domain engine.

**Returns**

- `React.ReactElement` — The panel.

**Side effects**

- Subscribes to the store; edits update the driver's params.

## INTERNAL (3)

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

## UNREACHABLE (19)

### `CurveEditor(arg0)`

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

- Removes the selected point, which triggers a resimulation. Ignored while a text field has focus or another panel is focused.

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
