# Contract specification: `src/components/TSCalc.jsx`

> Generated from method contracts. This file contains **no implementation code**.
> Write tests against what is claimed here, not against what you expect the code to do.

## Exported constants

Names this module publishes that are not methods. The method contracts
above and below refer to these by role — a command, a node type, a panel —
so this is the vocabulary they assume.

### `CORE`

The six parameters the solver works from, in the order they are entered.

An array of 6 entries.

### `ALTS`

What each parameter can be recovered from when the datasheet omits it.

`needs` lists the other core parameters a substitution consumes, which is
what lets the solver order the work and refuse a set that is circular —
Qes from Qts needs Qms, so it cannot also be where Qms comes from.

Substitute inputs are keyed by name rather than by substitution, so a
figure entered once is still there after switching to another route that
also uses it. Mms in particular appears in five of them.

Keys: `Fs`, `Re`, `Sd`, `Qes`, `Qms`, `Vas`

### `__internals`

Keys: `solveDatasheet`, `altFor`, `compliance`, `equivalentVolume`

## EXPORTED (2)

### `solveTS(values, missing)`

- **Reachability:** EXPORTED
- **Obtain via:** import { solveTS } from '../../src/components/TSCalc.jsx'

Resolve the six core parameters, then derive the full T/S set.

Anything named in `missing` comes from a substitution instead of from its
own field. Because a substitution can itself depend on other core figures,
they are resolved by repeated passes rather than in a fixed order: each
pass takes whatever has all its dependencies satisfied, until either
everything is known or a pass achieves nothing — which means what is left
depends on itself.

**Parameters**

- `values` — `object` — Every form field, core and substitute alike.
- `missing` — `object` — Map of core parameter to the substitution id chosen for it. Absent keys are taken from their own field.

**Returns**

- `{result: object, via: object, estimated: boolean}` — The full T/S set, a map of core parameter to the relation that produced it (or `'given'`), and whether any estimate was involved.

**Throws**

- `Error` — When a figure is missing or not positive, when a substitution's own precondition fails, or when the chosen substitutions depend on each other in a circle.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `TSCalc()`

- **Reachability:** EXPORTED
- **Obtain via:** import { TSCalc } from '../../src/components/TSCalc.jsx'

The Thiele/Small solver: derive a full parameter set from datasheet figures.

Six parameters are wanted — Fs, Re, Sd, Qes, Qms and Vas — and datasheets
routinely print five of them. Each row can therefore be marked as missing,
which swaps its field for whichever published figures it can be recovered
from instead.

**Returns**

- `React.ReactElement|null` — The modal, or `null` when hidden.

**Side effects**

- Subscribes to the store.

## INTERNAL (4)

### `compliance(Vas, Sd)`

- **Reachability:** INTERNAL
- **Obtain via:** import { __internals } from '../../src/components/TSCalc.jsx'  →  __internals.compliance

Mechanical compliance implied by an equivalent volume.

**Parameters**

- `Vas` — `number` — Equivalent compliance volume, litres.
- `Sd` — `number` — Effective cone area, cm².

**Returns**

- `number` — Compliance, m/N.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `equivalentVolume(Cms, Sd)`

- **Reachability:** INTERNAL
- **Obtain via:** import { __internals } from '../../src/components/TSCalc.jsx'  →  __internals.equivalentVolume

Equivalent volume implied by a compliance — the inverse of `compliance`.

**Parameters**

- `Cms` — `number` — Compliance, m/N.
- `Sd` — `number` — Effective cone area, cm².

**Returns**

- `number` — Equivalent compliance volume, litres.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `solveDatasheet(m)`

- **Reachability:** INTERNAL
- **Obtain via:** import { __internals } from '../../src/components/TSCalc.jsx'  →  __internals.solveDatasheet

Derive the rest of the T/S set from the six core parameters.

The canonical path: Vas gives compliance, compliance and Fs give moving
mass, and mass with Qes and Qms gives motor strength and mechanical
resistance.

**Parameters**

- `m` — `object` — The six core parameters.
- `m.Fs` — `number` — Free-air resonance, Hz.
- `m.Vas` — `number` — Equivalent compliance volume, litres.
- `m.Qes` — `number` — Electrical Q.
- `m.Qms` — `number` — Mechanical Q.
- `m.Re` — `number` — DC resistance, ohms.
- `m.Sd` — `number` — Effective cone area, cm².

**Returns**

- `{Fs: number, Vas: number, Qes: number, Qms: number, Qts: number, Re: number, Sd: number, Cms: number, Mms: number, Bl: number, Rms: number}` — The complete T/S set in display units — the six inputs echoed back plus Cms mm/N, Mms g, Bl T·m and Rms kg/s.

**Preconditions (caller must guarantee)**

- Every input is positive; a zero Qes or Qms divides by zero.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `altFor(key, id)`

- **Reachability:** INTERNAL
- **Obtain via:** import { __internals } from '../../src/components/TSCalc.jsx'  →  __internals.altFor

Look up one substitution by parameter and id.

**Parameters**

- `key` — `string` — Core parameter name.
- `id` — `string` — Substitution id.

**Returns**

- `object` — The substitution, falling back to the parameter's first.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

## UNREACHABLE (17)

### `fsFromMmsCms(a)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Free-air resonance from moving mass and compliance.

**Parameters**

- `a` — `object` — Substitute inputs.
- `a.Mms` — `number` — Moving mass, grams.
- `a.Cms` — `number` — Compliance, mm/N.

**Returns**

- `number` — Fs, Hz.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `fsFromMmsVas(a, c)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Free-air resonance from moving mass, taking compliance from Vas and Sd.

**Parameters**

- `a` — `object` — Substitute inputs.
- `a.Mms` — `number` — Moving mass, grams.
- `c` — `object` — Core parameters resolved so far.
- `c.Vas` — `number` — Equivalent compliance volume, litres.
- `c.Sd` — `number` — Effective cone area, cm².

**Returns**

- `number` — Fs, Hz.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `reFromZmax(a, c)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

DC resistance from the impedance peak.

At resonance the motional branch adds Re·Qms/Qes in parallel with nothing
else, so the peak stands at Re(1 + Qms/Qes) — an exact relation, and Zmax
is one of the few things a sheet without Re still tends to plot.

**Parameters**

- `a` — `object` — Substitute inputs.
- `a.Zmax` — `number` — Impedance at resonance, ohms.
- `c` — `object` — Core parameters resolved so far.
- `c.Qms` — `number` — Mechanical Q.
- `c.Qes` — `number` — Electrical Q.

**Returns**

- `number` — Re, ohms.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `reFromZnom(a)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

DC resistance estimated from the nominal impedance rating.

A rule of thumb rather than a relation: nominal impedance is a marketing
figure, and Re lands somewhere near 0.85 of it across most drivers. Marked
as an estimate wherever it is used, because it is the one substitution here
that cannot be derived from anything.

**Parameters**

- `a` — `object` — Substitute inputs.
- `a.Znom` — `number` — Nominal impedance rating, ohms.

**Returns**

- `number` — Re, ohms.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `sdFromDiameter(a)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Cone area from the effective piston diameter.

**Parameters**

- `a` — `object` — Substitute inputs.
- `a.Dia` — `number` — Effective piston diameter, cm.

**Returns**

- `number` — Sd, cm².

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `sdFromVasCms(a, c)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Cone area from compliance and the equivalent volume it produces.

**Parameters**

- `a` — `object` — Substitute inputs.
- `a.Cms` — `number` — Compliance, mm/N.
- `c` — `object` — Core parameters resolved so far.
- `c.Vas` — `number` — Equivalent compliance volume, litres.

**Returns**

- `number` — Sd, cm².

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `qesFromQtsQms(a, c)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Electrical Q from total and mechanical Q.

The most common gap of all: sheets that print Qts and Qms but not Qes.

**Parameters**

- `a` — `object` — Substitute inputs.
- `a.Qts` — `number` — Total Q.
- `c` — `object` — Core parameters resolved so far.
- `c.Qms` — `number` — Mechanical Q.

**Returns**

- `number` — Qes.

**Throws**

- `Error` — When Qts is not below Qms, which no real driver allows.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `qesFromBlMms(a, c)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Electrical Q from motor strength and moving mass.

**Parameters**

- `a` — `object` — Substitute inputs.
- `a.Bl` — `number` — Motor strength, T·m.
- `a.Mms` — `number` — Moving mass, grams.
- `c` — `object` — Core parameters resolved so far.
- `c.Fs` — `number` — Free-air resonance, Hz.
- `c.Re` — `number` — DC resistance, ohms.

**Returns**

- `number` — Qes.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `qmsFromQtsQes(a, c)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Mechanical Q from total and electrical Q.

**Parameters**

- `a` — `object` — Substitute inputs.
- `a.Qts` — `number` — Total Q.
- `c` — `object` — Core parameters resolved so far.
- `c.Qes` — `number` — Electrical Q.

**Returns**

- `number` — Qms.

**Throws**

- `Error` — When Qts is not below Qes, which no real driver allows.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `qmsFromRmsMms(a, c)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Mechanical Q from suspension losses and moving mass.

**Parameters**

- `a` — `object` — Substitute inputs.
- `a.Rms` — `number` — Mechanical resistance, kg/s.
- `a.Mms` — `number` — Moving mass, grams.
- `c` — `object` — Core parameters resolved so far.
- `c.Fs` — `number` — Free-air resonance, Hz.

**Returns**

- `number` — Qms.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `vasFromCms(a, c)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Equivalent volume from compliance.

**Parameters**

- `a` — `object` — Substitute inputs.
- `a.Cms` — `number` — Compliance, mm/N.
- `c` — `object` — Core parameters resolved so far.
- `c.Sd` — `number` — Effective cone area, cm².

**Returns**

- `number` — Vas, litres.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `vasFromMms(a, c)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Equivalent volume from moving mass, via the compliance Fs and Mms imply.

**Parameters**

- `a` — `object` — Substitute inputs.
- `a.Mms` — `number` — Moving mass, grams.
- `c` — `object` — Core parameters resolved so far.
- `c.Fs` — `number` — Free-air resonance, Hz.
- `c.Sd` — `number` — Effective cone area, cm².

**Returns**

- `number` — Vas, litres.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `Field(props)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

One labelled numeric input row.

**Parameters**

- `props` — `object` — Component props.
- `props.name` — `string` — Form field name.
- `props.label` — `string` — Display label.
- `props.unit` — `string` — Unit shown after the input.
- `props.register` — `Function` — The form's `register`.
- `props.children` — `React.ReactNode` _(optional)_ — Trailing control, such as the missing-parameter checkbox.

**Returns**

- `React.ReactElement` — The input row.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `TSCalc > setMissingFlag(key, on)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Mark a parameter as present or missing from the datasheet.

**Parameters**

- `key` — `string` — Core parameter name.
- `on` — `boolean` — Whether it is missing.

**Returns**

- `void`

**Side effects**

- Updates component state and drops any previous result.

### `TSCalc > setAlt(key, id)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Choose which relation a missing parameter is recovered through.

**Parameters**

- `key` — `string` — Core parameter name.
- `id` — `string` — Substitution id.

**Returns**

- `void`

**Side effects**

- Updates component state and drops any previous result.

### `TSCalc > applyToNode()`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Write the derived parameters into the selected driver node.

Rounded to three decimals, which is past the precision the measurements
justify and keeps the parameter panel readable.

**Returns**

- `void`

**Side effects**

- Updates the node's params and records them as its new starting point — which triggers a resimulation — then closes the modal. Alerts and does nothing when no driver node is selected.

### `TSCalc > renderRow(p)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

One core parameter's row: its own field, or the substitute that replaces it.

**Parameters**

- `p` — `object` — The core parameter descriptor.
- `p.key` — `string` — Parameter name.
- `p.label` — `string` — Display label.
- `p.unit` — `string` — Unit.

**Returns**

- `React.ReactElement` — The row, or the substitution block when the parameter is missing.

**Reads external mutable state**

- component state.
