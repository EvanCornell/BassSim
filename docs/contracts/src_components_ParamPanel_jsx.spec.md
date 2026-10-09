# Contract specification: `src/components/ParamPanel.jsx`

> Generated from method contracts. This file contains **no implementation code**.
> Write tests against what is claimed here, not against what you expect the code to do.

## Exported constants

Names this module publishes that are not methods. The method contracts
above and below refer to these by role — a command, a node type, a panel —
so this is the vocabulary they assume.

### `__internals`

Keys: `round3`

## EXPORTED (1)

### `ParamPanel()`

- **Reachability:** EXPORTED
- **Obtain via:** import { ParamPanel } from '../../src/components/ParamPanel.jsx'

The Parameters panel: the amplifier, the selected node's form, and the sweep.

Which form is shown follows the selected node's type; with nothing
selected it prompts rather than rendering an empty panel.

**Returns**

- `React.ReactElement` — The panel.

**Side effects**

- Subscribes to the store.

## INTERNAL (1)

### `round3(v)`

- **Reachability:** INTERNAL
- **Obtain via:** import { __internals } from '../../src/components/ParamPanel.jsx'  →  __internals.round3

Round a settings value for display, leaving non-numbers alone.

Derived amplifier figures otherwise show full float precision, which
makes the boxes unreadable as you type.

**Parameters**

- `v` — `any` — The value.

**Returns**

- `any` — The value rounded to three decimals, or unchanged when it is not a number.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

## UNREACHABLE (26)

### `useOpen(id, initial)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Whether a section is open, and the toggle for it.

**Parameters**

- `id` — `string` — Section key, e.g. `driver.electrical`.
- `initial` — `boolean` — Open the first time it is shown.

**Returns**

- `[boolean, Function]` — Open, and a function that flips it.

**Side effects**

- Holds React state and writes the module's open map when toggled.

### `useOpen > toggle()`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Flip the section, remembering the new state.

**Returns**

- `void`

**Side effects**

- Updates React state and the module's open map.

### `short(v)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

A figure written short, for a section summary.

**Parameters**

- `v` — `any` — A number, or anything else.

**Returns**

- `string` — Up to three significant figures without trailing zeros, the value itself when it is not a finite number, or `—` when absent.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `Section(props)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

A collapsible section of the panel: a card whose head names it and, while
closed, sums up what is in it on one line.

**Parameters**

- `props` — `object` — Component props.
- `props.id` — `string` — Key the open state is remembered by.
- `props.title` — `string` — The name.
- `props.summary` — `string` _(optional)_ — One line shown while closed.
- `props.color` — `string` _(optional)_ — An element hue: shows a dot, and rings the card when `focus`.
- `props.focus` — `boolean` _(optional)_ — The section being worked on — the selected element.
- `props.actions` — `React.ReactNode` _(optional)_ — Buttons shown in the head while open, in place of the summary.
- `props.initial` — `boolean` _(optional)_ — Open the first time it is shown.
- `props.fixed` — `boolean` _(optional)_ — Always open, with no way to close it.
- `props.children` — `React.ReactNode` — The body.

**Returns**

- `React.ReactElement` — The section.

**Side effects**

- Holds its open state.

### `Sub(props)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

A collapsible group inside a section, with its own one-line summary.

**Parameters**

- `props` — `object` — Component props.
- `props.id` — `string` — Key the open state is remembered by.
- `props.title` — `string` — The name.
- `props.summary` — `string` _(optional)_ — One line shown in the head.
- `props.initial` — `boolean` _(optional)_ — Open the first time it is shown.
- `props.children` — `React.ReactNode` — The body.

**Returns**

- `React.ReactElement` — The group.

**Side effects**

- Holds its open state.

### `LockIcon(props)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

A small padlock, closed or open.

**Parameters**

- `props` — `object` — Component props.
- `props.closed` — `boolean` — Draw it locked.

**Returns**

- `React.ReactElement` — The icon.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `NumField(props)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

A labelled numeric parameter input bound to one node field.

Takes a number or an expression over the project parameters. Empty and
unresolvable input is held in the box rather than written, so clearing it
to retype a value does not momentarily push `NaN` into the graph and
trigger a failed solve.

**Parameters**

- `props` — `object` — Component props.
- `props.id` — `string` — Node id.
- `props.field` — `string` — Parameter name; also selects the tooltip.
- `props.value` — `number|string|undefined` — Current value.
- `props.unit` — `string` — Unit shown after the input.
- `props.label` — `string` _(optional)_ — Display label; defaults to the field name.
- `props.step` — `string|number` _(optional)_ — Input step.
- `props.min` — `number` _(optional)_ — Minimum accepted value.
- `props.above` — `number` _(optional)_ — Values must be greater than this.
- `props.onCommit` — `Function` _(optional)_ — Called instead of the default update, for fields needing derived changes.

**Returns**

- `React.ReactElement` — The input row.

**Side effects**

- Subscribes to the store. Editing updates the node's params, which triggers a resimulation.

### `SelectField(props)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

A labelled dropdown parameter bound to one node field.

**Parameters**

- `props` — `object` — Component props.
- `props.id` — `string` — Node id.
- `props.field` — `string` — Parameter name; also selects the tooltip.
- `props.value` — `string` — Current value.
- `props.label` — `string` _(optional)_ — Display label; defaults to the field name.
- `props.options` — `Array` — Selectable options.

**Returns**

- `React.ReactElement` — The select row.

**Side effects**

- Subscribes to the store. Changing it updates the node's params, which triggers a resimulation.

### `LeakSection(props)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

A chamber's leakage: sealed, or a QL referred to a frequency.

QL is kept as the number people already think in; the engine turns it into
the leak resistance it implies. Ticking "sealed" removes the leak rather than
expecting the user to know that a very large QL means the same thing.

**Parameters**

- `props` — `object` — Component props.
- `props.id` — `string` — Node id.
- `props.p` — `object` — The node's params.

**Returns**

- `React.ReactElement` — The leakage controls.

**Side effects**

- Subscribes to the store.

### `LabelField(props)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

The node's display name, shown on the canvas and in exports.

**Parameters**

- `props` — `object` — Component props.
- `props.id` — `string` — Node id.
- `props.p` — `object` — The node's params.

**Returns**

- `React.ReactElement` — The label input.

**Side effects**

- Subscribes to the store.

### `AmpSolver()`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

The amplifier section: voltage, impedance and power, linked by P = V²/Z.

Editing any one derives the others, so the drive level can be set in
whichever unit the user is thinking in.

**Returns**

- `React.ReactElement` — The amplifier section.

**Side effects**

- Subscribes to the store.

### `AmpSolver > f(field, label, unit)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

One linked amplifier field.

Rejects zero and negative values: the relation divides by impedance, and
a zero would propagate infinities through the settings.

**Parameters**

- `field` — `'voltage'|'impedance'|'power'` — Settings field to bind.
- `label` — `string` — Display label.
- `unit` — `string` — Unit shown after the input.

**Returns**

- `React.ReactElement` — The input row.

**Reads external mutable state**

- the enclosing `settings` and `setAmp`.

### `SweepSection()`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

The frequency sweep: its range, how many points, and resonance masking.

**Returns**

- `React.ReactElement` — The section.

**Side effects**

- Subscribes to the store.

### `TSField(props)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

One coupled T/S parameter: its value, and the padlock deciding who sets it.

A held parameter is one the user is asserting; a released one is a
consequence, so it is shown but not typed into. The padlock is the only way
to move a parameter between the two.

**Parameters**

- `props` — `object` — Component props.
- `props.id` — `string` — Node id.
- `props.field` — `string` — Parameter name.
- `props.value` — `number|undefined` — Current value.
- `props.held` — `boolean` — Whether this parameter is one of the six being held.
- `props.unit` — `string` _(optional)_ — Unit shown after the input.
- `props.step` — `string|number` _(optional)_ — Input step.

**Returns**

- `React.ReactElement` — The row.

**Side effects**

- Subscribes to the store. Editing or toggling updates the node and triggers a resimulation.

### `DriverForm(props)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Parameter form for a driver, with links to the library and the T/S solver.

The eleven T/S figures are six free values and five consequences of them,
so the form does not offer eleven independent boxes. Six carry a closed
padlock and are editable; the rest show what those six imply, and moving a
padlock moves a parameter between the two groups.

**Parameters**

- `props` — `object` — Component props.
- `props.node` — `object` — The selected node.

**Returns**

- `React.ReactElement` — The form.

**Side effects**

- Subscribes to the store.

### `DriverForm > ts(field, unit, step)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

One coupled T/S row, wired to this node and its current basis.

**Parameters**

- `field` — `string` — Parameter name.
- `unit` — `string` _(optional)_ — Unit shown after the input.
- `step` — `string` _(optional)_ — Input step.

**Returns**

- `React.ReactElement` — The row.

**Reads external mutable state**

- the enclosing form's node and basis.

### `DvcField(props)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

A driver's dual voice coil option.

Purely electrical, and available on any driver: the catalogue never says
whether a driver has two coils, and its figures are always taken as both
coils in series. The other choices rescale Re, Bl and Le from there.

**Parameters**

- `props` — `object` — Component props.
- `props.id` — `string` — Node id.
- `props.p` — `object` — The node's params.

**Returns**

- `React.ReactElement` — The select row.

**Side effects**

- Subscribes to the store.

### `NodeWarnings(props)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

The node's validation warnings, with the fixes the editor can offer.

A driver face meeting an opening smaller than its cone gets a button that
puts a chamber between them.

**Parameters**

- `props` — `object` — Component props.
- `props.node` — `object` — The selected node.

**Returns**

- `React.ReactElement|null` — The warnings, or nothing when there are none.

**Side effects**

- Subscribes to the store.

### `TapsSection(props)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

The taps along a chamber or waveguide: where things may join it from the side.

Positions are in cm from the `in` / throat end and may be expressions.
Removing a tap removes the joins made to it.

**Parameters**

- `props` — `object` — Component props.
- `props.id` — `string` — Node id.
- `props.p` — `object` — The node's params.
- `props.from` — `string` — Name of the end positions are measured from.

**Returns**

- `React.ReactElement` — The taps section.

**Side effects**

- Subscribes to the store.

### `ThroatCalc(props)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Throat chamber calculator: the air a cone traps in front of a small opening.

Output only — it proposes a volume for this chamber and, on request, writes
it. The chamber stays an ordinary chamber node. Volume = Sd × (cone depth ×
shape factor + one-way excursion + clearance), minus nothing for the
motor, since this is the front side.

**Parameters**

- `props` — `object` — Component props.
- `props.id` — `string` — Node id.

**Returns**

- `React.ReactElement` — The calculator.

**Side effects**

- Subscribes to the store.

### `ThroatCalc > row(label, v, set, unit)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

One number input of the calculator.

**Parameters**

- `label` — `string` — Row label.
- `v` — `number` — Current value.
- `set` — `Function` — Setter.
- `unit` — `string` — Unit.

**Returns**

- `React.ReactElement` — The row.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `ChamberForm(props)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Parameter form for a chamber: volume, path length, stuffing and the probe.

**Parameters**

- `props` — `object` — Component props.
- `props.node` — `object` — The selected node.

**Returns**

- `React.ReactElement` — The form.

**Side effects**

- Subscribes to the store.

### `ProbeSection(props)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

The interior-SPL probe: a virtual microphone inside a chamber.

Observational only — enabling it never changes the simulation. The
position slider matters only near the axial standing-wave modes, where
pressure actually varies along the box.

**Parameters**

- `props` — `object` — Component props.
- `props.id` — `string` — Node id.
- `props.p` — `object` — The node's params.

**Returns**

- `React.ReactElement` — The probe controls.

**Side effects**

- Subscribes to the store.

### `WaveguideForm(props)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Parameter form for a waveguide, with derived cutoff and volume readouts.

**Parameters**

- `props` — `object` — Component props.
- `props.node` — `object` — The selected node.

**Returns**

- `React.ReactElement` — The form.

**Side effects**

- Subscribes to the store.

### `PRForm(props)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Parameter form for a passive radiator, including the compliance calculator.

**Parameters**

- `props` — `object` — Component props.
- `props.node` — `object` — The selected node.

**Returns**

- `React.ReactElement` — The form.

**Side effects**

- Subscribes to the store.

### `RadiationForm(props)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Parameter form for a radiation termination: the space it radiates into.

**Parameters**

- `props` — `object` — Component props.
- `props.node` — `object` — The selected node.

**Returns**

- `React.ReactElement` — The form.

**Side effects**

- Subscribes to the store.
