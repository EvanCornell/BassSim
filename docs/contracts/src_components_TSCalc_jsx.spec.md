# Contract specification: `src/components/TSCalc.jsx`

> Generated from method contracts. This file contains **no implementation code**.
> Write tests against what is claimed here, not against what you expect the code to do.

## EXPORTED (1)

### `TSCalc()`

- **Reachability:** EXPORTED
- **Obtain via:** import { TSCalc } from '../../src/components/TSCalc.jsx'

The Thiele/Small solver: derive a full parameter set from measurements.

Three methods — datasheet, added mass and known box — sharing one result
view, so the derived set can be applied to a driver node whichever way it
was obtained.

**Returns**

- `React.ReactElement|null` — The modal, or `null` when hidden.

**Side effects**

- Subscribes to the store.

## INTERNAL (3)

### `solveDatasheet(m)`

- **Reachability:** INTERNAL
- **Obtain via:** import { __internals } from '../../src/components/TSCalc.jsx'  →  __internals.solveDatasheet

Derive the full T/S set from published datasheet figures.

The canonical path: Vas gives compliance, compliance and Fs give moving
mass, and mass with Qes and Qms gives motor strength and mechanical
resistance.

**Parameters**

- `m` — `object` — Measurements.
- `m.Fs` — `number` — Free-air resonance, Hz.
- `m.Vas` — `number` — Equivalent compliance volume, litres.
- `m.Qes` — `number` — Electrical Q.
- `m.Qms` — `number` — Mechanical Q.
- `m.Re` — `number` — DC resistance, ohms.
- `m.Sd` — `number` — Effective cone area, cm².

**Returns**

- `object` — The complete T/S set in display units.

**Preconditions (caller must guarantee)**

- Every input is positive; a zero Qes or Qms divides by zero.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `solveAddedMass(m)`

- **Reachability:** INTERNAL
- **Obtain via:** import { __internals } from '../../src/components/TSCalc.jsx'  →  __internals.solveAddedMass

Derive the T/S set from the added-mass measurement.

Loading the cone with a known mass drops its resonance, and the size of
that drop gives the moving mass directly — which is what makes this the
practical method for a driver with no datasheet.

Qes and Qms are optional here: without them the mass, compliance and Vas
are still recoverable, and the motor figures are simply left undefined.

**Parameters**

- `m` — `object` — Measurements.
- `m.Fs` — `number` — Free-air resonance, Hz.
- `m.FsPrime` — `number` — Resonance with the added mass fitted, Hz.
- `m.mAdd` — `number` — Added mass, grams.
- `m.Qes` — `number` _(optional)_ — Electrical Q, if known.
- `m.Qms` — `number` _(optional)_ — Mechanical Q, if known.
- `m.Re` — `number` — DC resistance, ohms.
- `m.Sd` — `number` — Effective cone area, cm².

**Returns**

- `object` — The T/S set in display units; `Bl`, `Rms` and `Qts` are `undefined` when the Q values were not supplied.

**Throws**

- `Error` — When the loaded resonance is not below the free-air one, which means the measurements are swapped or wrong.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `solveKnownBox(m)`

- **Reachability:** INTERNAL
- **Obtain via:** import { __internals } from '../../src/components/TSCalc.jsx'  →  __internals.solveKnownBox

Derive the T/S set from the resonance shift in a box of known volume.

Sealing the driver in a known volume raises its resonance, and the size of
that rise gives Vas — after which this is the datasheet method.

**Parameters**

- `m` — `object` — Measurements.
- `m.Fs` — `number` — Free-air resonance, Hz.
- `m.Fc` — `number` — Resonance in the test box, Hz.
- `m.Vb` — `number` — Test box volume, litres.
- `m.Qes` — `number` — Electrical Q.
- `m.Qms` — `number` — Mechanical Q.
- `m.Re` — `number` — DC resistance, ohms.
- `m.Sd` — `number` — Effective cone area, cm².

**Returns**

- `object` — The complete T/S set in display units.

**Throws**

- `Error` — When the in-box resonance is not above the free-air one, which means the measurements are swapped or the box is leaking.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

## UNREACHABLE (2)

### `TSCalc > applyToNode()`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Write the derived parameters into the selected driver node.

Rounded to three decimals, which is past the precision the measurements
justify and keeps the parameter panel readable.

**Returns**

- `void`

**Side effects**

- Updates the node's params — which triggers a resimulation — and closes the modal. Alerts and does nothing when no driver node is selected.

### `TSCalc > F(props)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

One labelled numeric input row, registered with the form.

**Parameters**

- `props` — `object` — Component props.
- `props.name` — `string` — Form field name.
- `props.label` — `string` — Display label.
- `props.unit` — `string` — Unit shown after the input.

**Returns**

- `React.ReactElement` — The input row.

**Reads external mutable state**

- the enclosing form's `register`.
