# Contract specification: `src/engine/nonlinear.js`

> Generated from method contracts. This file contains **no implementation code**.
> Write tests against what is claimed here, not against what you expect the code to do.

## Module

Large-signal driver curves.

Each driver may carry three ratio curves — Bl(x), Cms(x), Le(x) — expressed
relative to the small-signal value (1.0 = datasheet number). A curve is a
flat 1.0 baseline (or an imported table), deformed by parametric-EQ style
control points: gaussian bumps {x mm, g gain, w width mm}. Time-domain runs
build the driver's motor and suspension from them.

## Exported constants

Names this module publishes that are not methods. The method contracts
above and below refer to these by role — a command, a node type, a panel —
so this is the vocabulary they assume.

### `NL_PARAMS`

The nonlinear parameter names a driver may carry curves for.

`Cms` and `Kms` are two descriptions of the same suspension, so a driver
normally has one or the other rather than both.

Values: `Bl`, `Cms`, `Kms`, `Le`

### `BL_AT_XMAX`

Bl at Xmax, as a ratio of its rest value.

Value: `0.7`

### `XVAR_DB`

The output variation that defines Xvar, dB.

Value: `6`

### `FRINGE_LEVEL`

The field at the fringe height, as a share of the gap's.

Value: `0.1`

### `DEFAULT_FRINGE_SHARE`

The fringe height assumed when none is given, as a share of the gap height.

Value: `0.25`

### `__internals`

Keys: `baseValue`, `rawEval`, `logCosh`

## EXPORTED (12)

### `emptyCurve()`

- **Reachability:** EXPORTED
- **Obtain via:** import { emptyCurve } from '../../src/engine/nonlinear.js'

A curve with no content — a flat 1.0 ratio at every excursion.

**Returns**

- `{points: Array<{x: number, g: number, w: number}>, table: null}` — A fresh empty curve; callers own it and may mutate it.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `defaultNL()`

- **Reachability:** EXPORTED
- **Obtain via:** import { defaultNL } from '../../src/engine/nonlinear.js'

A complete, empty nonlinear parameter set for a new driver.

**Returns**

- `{Bl: object, Cms: object, Kms: object, Le: object}` — One empty curve per nonlinear parameter, freshly allocated.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `curveHasContent(curve)`

- **Reachability:** EXPORTED
- **Obtain via:** import { curveHasContent } from '../../src/engine/nonlinear.js'

Whether a curve deviates from the flat 1.0 baseline.

A curve has content once it has either control points, an imported table or
a polynomial. An untouched driver is linear, and costs nothing.

**Parameters**

- `curve` — `object|null|undefined` — A curve, or nothing.

**Returns**

- `boolean` — True when the curve would evaluate to anything other than a constant 1.0.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `polyRatio(poly, x)`

- **Reachability:** EXPORTED
- **Obtain via:** import { polyRatio } from '../../src/engine/nonlinear.js'

A polynomial curve's ratio at x: P(x)/P(0), held at its end values outside its range.

Measurement reports (Klippel's among them) publish Bl(x), Kms(x) and
Le(x) as polynomial coefficients in absolute units over a stated range —
Bl(x) = b0 + b1·x + b2·x² … with x in mm. Dividing by b0 makes it a ratio
like every other curve; outside the range the fit means nothing, so the
end values hold.

**Parameters**

- `poly` — `{coeffs: number[], min?: number, max?: number}` — Coefficients from the constant term up, x in mm, and the range they were fitted over.
- `x` — `number` — Displacement, mm.

**Returns**

- `number` — The ratio.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `evalCurve(curve, x, xmax)`

- **Reachability:** EXPORTED
- **Obtain via:** import { evalCurve } from '../../src/engine/nonlinear.js'

Ratio at a static displacement x, with optional extrapolation past Xmax.

Gaussian control points decay back toward the baseline far from their centre,
which is wrong past Xmax: a coil leaving the gap does not recover its Bl. With
`curve.extrap` set, the curve instead continues past ±Xmax along the slope it
had *at* Xmax, estimated from a 0.25 mm finite difference.

**Parameters**

- `curve` — `object|null|undefined` — The curve to evaluate.
- `x` — `number` — Displacement, mm.
- `xmax` — `number` _(optional, default `0`)_ — Xmax, mm. Extrapolation is skipped when this is 0.

**Returns**

- `number` — Ratio at x, floored at 0.01.

**Postconditions (must hold on return)**

- result >= 0.01 — a ratio must stay physically positive, since Bl, Cms and Le are multiplied by it

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `normalizeTable(table)`

- **Reachability:** EXPORTED
- **Obtain via:** import { normalizeTable } from '../../src/engine/nonlinear.js'

Convert an imported curve table to ratios, detecting absolute units.

Published curves are usually absolute — Kms in N/mm, Bl in T·m — while the
engine works in ratios of the small-signal value. The two are told apart by
the value at x = 0: a ratio curve passes through 1 there, so anything outside
0.5–2 is assumed absolute and divided through by its own x = 0 value.

That heuristic is reported back in `wasAbsolute` rather than applied silently,
so the import UI can say what it decided.

**Parameters**

- `table` — `Array<[number, number]>` — Rows of `[x_mm, value]`, sorted ascending by x.

**Returns**

- `{table: Array<[number, number]>, wasAbsolute: boolean, v0: number}` — The normalized table (the original array when no scaling was needed), whether it was treated as absolute, and the detected x = 0 value.

**Throws**

- `Error` — When the value at x = 0 is zero, which no ratio can be derived from.

**Postconditions (must hold on return)**

- The input array is never modified; scaling produces a new array.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `parseCurveCSV(text)`

- **Reachability:** EXPORTED
- **Obtain via:** import { parseCurveCSV } from '../../src/engine/nonlinear.js'

Parse a pasted or uploaded curve as CSV.

Accepts comma, semicolon or tab separated `x_mm, ratio` rows. Blank lines,
`#` comments and header rows — detected by alphabetic characters in the first
field — are skipped, so exports that carry a title row import without editing.

**Parameters**

- `text` — `string` — Raw file or clipboard contents.

**Returns**

- `Array<[number, number]>` — Rows sorted ascending by x.

**Throws**

- `Error` — When fewer than two usable rows are found, since a single point defines no curve.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `variationDb(bl, kms)`

- **Reachability:** EXPORTED
- **Obtain via:** import { variationDb } from '../../src/engine/nonlinear.js'

The output variation from a Bl and a Kms ratio, dB.

**Parameters**

- `bl` — `number` — Bl, as a ratio of its rest value.
- `kms` — `number` — Kms, as a ratio of its rest value.

**Returns**

- `number` — −20·log10(bl) + 10·log10(kms): positive as Bl falls or Kms rises.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `curvesFromRatings(xmax, xvar)`

- **Reachability:** EXPORTED
- **Obtain via:** import { curvesFromRatings } from '../../src/engine/nonlinear.js'

Bl and Kms curves from a driver's Xmax and Xvar.

Bl(x) = exp(−x²/c²), with c set so Bl(Xmax) = 70%. With an Xvar, the
variation Bl leaves short of 6 dB there is made up by Kms(x) = 1 + k·x²;
when Bl alone already reaches 6 dB before Xvar, the suspension is left
linear and `info.blAlone` says so — the two ratings then disagree under
these assumptions.

Bl is a table sampled over the whole stroke the circuit uses, Kms an exact
polynomial over the same range; both stay symmetric past Xmax.

**Parameters**

- `xmax` — `number` — Xmax, mm.
- `xvar` — `number` _(optional)_ — Xvar, mm; without it only Bl is built.

**Returns**

- `{Bl: object, Kms: object, info: {blSixDbAt: number, blAtXvar: number|null, kmsAtXvar: number|null, blDb: number|null, kmsDb: number|null, blAlone: boolean}}` — The two curves, and what they come to: where Bl alone reaches 6 dB, and at Xvar each ratio and its share of the variation.

**Throws**

- `Error` — When Xmax is not a positive number, or Xvar is given but is not.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `blFromGeometry(g)`

- **Reachability:** EXPORTED
- **Obtain via:** import { blFromGeometry } from '../../src/engine/nonlinear.js'

Bl(x) from the coil height, gap height and fringe height.

**Parameters**

- `g` — `{coil: number, gap: number, fringe?: number}` — Coil (winding) height, magnetic gap height and fringe height, mm. The fringe defaults to a quarter of the gap; 0 is a hard-edged field.

**Returns**

- `Function` — `x ↦ Bl(x)/Bl(0)`, x in mm: even, 1 at rest, falling towards 0.

**Throws**

- `Error` — When the coil or gap height is not positive, or the fringe is negative.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `excursionAt(fn, level, limit)`

- **Reachability:** EXPORTED
- **Obtain via:** import { excursionAt } from '../../src/engine/nonlinear.js'

The excursion at which a falling, even ratio function first reaches a level.

**Parameters**

- `fn` — `Function` — The ratio at an excursion, mm; 1 at rest and falling.
- `level` — `number` — The level, below 1.
- `limit` — `number` — The furthest excursion to look, mm.

**Returns**

- `number|null` — The excursion, mm, or `null` when it does not get there within `limit`.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `curvesFromGeometry(g)`

- **Reachability:** EXPORTED
- **Obtain via:** import { curvesFromGeometry } from '../../src/engine/nonlinear.js'

Bl and Kms curves from the motor's geometry, and Xvar.

Bl follows `blFromGeometry`; Kms takes what the 6 dB at Xvar still needs,
as with `curvesFromRatings`. Xmax plays no part in the curves: when given,
`info.blAtXmax` reports what Bl comes to at the rated Xmax, as a check.

**Parameters**

- `g` — `{coil: number, gap: number, fringe?: number, xvar?: number|null, xmax?: number|null}` — Coil and gap heights, fringe height, Xvar and Xmax, mm.

**Returns**

- `{Bl: object, Kms: object, info: object}` — The curves, and what they come to: the fringe used, where full Bl ends (`flat`), where Bl reaches 82% (`bl82At`), 70% (`bl70At`) and 6 dB (`blSixDbAt`), Bl at Xmax, and the Xvar split.

**Throws**

- `Error` — When a height is not usable, or Xvar is given but not positive.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

## INTERNAL (3)

### `baseValue(curve, x)`

- **Reachability:** INTERNAL
- **Obtain via:** import { __internals } from '../../src/engine/nonlinear.js'  →  __internals.baseValue

The curve's baseline at displacement x, before control points are applied.

A polynomial takes precedence (see `polyRatio`). An imported table is
interpolated linearly and clamped at both ends — measured data should not
extrapolate itself. With neither the baseline is a flat 1.0.

**Parameters**

- `curve` — `object|null|undefined` — The curve to evaluate.
- `x` — `number` — Displacement, mm. Signed: positive is outward.

**Returns**

- `number` — Baseline ratio at x.

**Preconditions (caller must guarantee)**

- curve.table, when present, is sorted ascending by x

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `rawEval(curve, x)`

- **Reachability:** INTERNAL
- **Obtain via:** import { __internals } from '../../src/engine/nonlinear.js'  →  __internals.rawEval

Evaluate a curve at displacement x, baseline plus control points, unclamped.

Control points are gaussian bumps added onto the baseline, in the manner of a
parametric EQ. When the curve sets `sym`, each point is mirrored to the
opposite stroke direction — a point at +3 mm also acts at −3 mm — which is how
a motor with a symmetric gap is described with half the points. Points within
0.01 mm of centre are not mirrored, since they already straddle it.

The result is deliberately not floored here: `evalCurve` needs the raw slope
to extrapolate beyond Xmax.

**Parameters**

- `curve` — `object|null|undefined` — The curve to evaluate.
- `x` — `number` — Displacement, mm.

**Returns**

- `number` — Unclamped ratio at x, which may be zero or negative for an aggressive curve.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `logCosh(t)`

- **Reachability:** INTERNAL
- **Obtain via:** import { __internals } from '../../src/engine/nonlinear.js'  →  __internals.logCosh

ln cosh(t), without overflow for large |t|.

**Parameters**

- `t` — `number` — Any number.

**Returns**

- `number` — ln cosh t.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

## UNREACHABLE (4)

### `curvesFromRatings > bl(x)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Bl at an excursion.

**Parameters**

- `x` — `number` — Excursion, mm.

**Returns**

- `number` — The ratio.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `checkXvar(xvar)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Throw unless an optional Xvar is missing or a positive number.

**Parameters**

- `xvar` — `*` — Xvar, mm, or nothing.

**Returns**

- `void`

**Throws**

- `Error` — When it is given but not positive.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `withSuspension(bl, span, xvar)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

A Bl function sampled into a symmetric table, with the Kms(x) an Xvar calls for.

Whatever the 6 dB at Xvar still needs after Bl is given to the suspension
as Kms(x) = 1 + k·x²; when Bl alone is already past 6 dB there, the
suspension stays linear and `info.blAlone` says so.

**Parameters**

- `bl` — `Function` — Bl ratio at an excursion in mm, 1 at rest, even in x.
- `span` — `number` — Half the stroke to tabulate, mm.
- `xvar` — `number|null` _(optional)_ — Xvar, mm.

**Returns**

- `{Bl: object, Kms: object, info: object}` — The curves, and at Xvar each ratio and its share of the variation.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `blFromGeometry > linked(x)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

The field the coil sits in when centred at x, unnormalized.

**Parameters**

- `x` — `number` — Coil centre, mm.

**Returns**

- `number` — ∫ B over the coil.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.
