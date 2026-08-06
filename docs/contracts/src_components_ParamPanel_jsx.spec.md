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

The Parameters panel: the amplifier section plus the selected node's form.

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

## UNREACHABLE (12)

### `NumField(props)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

A labelled numeric parameter input bound to one node field.

Empty and unparseable input is ignored rather than written, so clearing
the box to retype a value does not momentarily push `NaN` into the graph
and trigger a failed solve.

**Parameters**

- `props` — `object` — Component props.
- `props.id` — `string` — Node id.
- `props.field` — `string` — Parameter name; also selects the tooltip.
- `props.value` — `number|string|undefined` — Current value.
- `props.unit` — `string` — Unit shown after the input.
- `props.label` — `string` _(optional)_ — Display label; defaults to the field name.
- `props.step` — `string|number` _(optional)_ — Input step.
- `props.min` — `number` _(optional)_ — Minimum accepted value.
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

### `QSection(props)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

The per-node loss control: a Q value with a lossless override.

Every node has an independent Q applied as a complex loss term — wall
flexure on chambers, port turbulence on waveguides, surround loss on
passive radiators. Ticking ∞ disables loss entirely and greys the input,
rather than expecting the user to know that a very large Q means the same
thing.

**Parameters**

- `props` — `object` — Component props.
- `props.id` — `string` — Node id.
- `props.p` — `object` — The node's params.

**Returns**

- `React.ReactElement` — The Q control.

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

### `DriverForm(props)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Parameter form for a driver, with links to the library and the T/S solver.

**Parameters**

- `props` — `object` — Component props.
- `props.node` — `object` — The selected node.

**Returns**

- `React.ReactElement` — The form.

**Side effects**

- Subscribes to the store.

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
