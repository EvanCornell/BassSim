# Contract specification: `scripts/import-catalog.mjs`

> Generated from method contracts. This file contains **no implementation code**.
> Write tests against what is claimed here, not against what you expect the code to do.

## UNREACHABLE (48)

### `readSpreadsheetML(path)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Read a SpreadsheetML 2003 file — an `.xls` that is really XML.

This is what B&C's site exports. Parsed with regex rather than an XML
library because the format is machine-generated and utterly regular, and
this is a build-time script that should not pull a parser into the tree.

Self-closing `<Cell/>` elements hold no `<Data>` but still occupy a
column, so they are counted and padded — without that, every value after
the first blank cell would shift left by one.

**Parameters**

- `path` — `string` — Absolute path to the export.

**Returns**

- `string[][]` — Rows of decoded cell strings, header row first.

**Throws**

- `Error` — When the rows are ragged, which means the sheet uses `ss:Index` to skip columns — a format this reader does not handle, and which would silently misalign every column if ignored.

**Side effects**

- Reads the file from disk.

### `decode(s)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Decode XML entities and trim a cell's text.

`&amp;` is replaced last, so an escaped `&amp;lt;` does not become `<`.

**Parameters**

- `s` — `string` — Raw cell text.

**Returns**

- `string` — The decoded, trimmed value.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `num(s)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Parse a numeric cell, taking the metric half of a metric/imperial pair.

Catalogs write `245.0 (8.65)` in one cell; everything from the bracket on
is imperial and discarded. Placeholders for "not published" — blank, `-`,
`N/A` — become `undefined` rather than 0, which would be a real value.

**Parameters**

- `s` — `string|null|undefined` — Raw cell text.

**Returns**

- `number|undefined` — The parsed number, or `undefined` when the cell holds no value.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `text(s)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Parse a text cell, treating blanks and dashes as absent.

**Parameters**

- `s` — `string|null|undefined` — Raw cell text.

**Returns**

- `string|undefined` — The trimmed text, or `undefined` when the cell is empty.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `range(s)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Parse a range cell such as `35 - 1500` into its two ends.

Splits on both the ASCII hyphen and the en dash, since catalogs use both.

**Parameters**

- `s` — `string|null|undefined` — Raw cell text.

**Returns**

- `[number|undefined, number|undefined]` — The low and high ends, both `undefined` when the cell is not a range.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `round(v, dp)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Round a derived value for output, preserving absent values.

**Parameters**

- `v` — `number|null|undefined` — The value.
- `dp` — `number` — Decimal places.

**Returns**

- `number|undefined` — The rounded value, or `undefined` when there was none.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `model(r, c)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

The model name, including the impedance suffix.

The matrix lists one row per impedance variant under a shared model name,
which is also how B&C part-number them: 18SW115-4, 18SW115-8. Without the
suffix the two rows would collide.

**Parameters**

- `r` — `string[]` — The source row.
- `c` — `(name: string) => number` — Resolve a column index by header name.

**Returns**

- `string` — The full model name.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `Fs(r, c)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Free-air resonance, Hz.

**Parameters**

- `r` — `string[]` — The source row.
- `c` — `(name: string) => number` — Resolve a column index by header name.

**Returns**

- `number|undefined` — The parsed cell, or `undefined` when it is blank or unparseable.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `Qts(r, c)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Total Q at Fs.

**Parameters**

- `r` — `string[]` — The source row.
- `c` — `(name: string) => number` — Resolve a column index by header name.

**Returns**

- `number|undefined` — The parsed cell, or `undefined` when it is blank or unparseable.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `Qes(r, c)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Electrical Q at Fs.

**Parameters**

- `r` — `string[]` — The source row.
- `c` — `(name: string) => number` — Resolve a column index by header name.

**Returns**

- `number|undefined` — The parsed cell, or `undefined` when it is blank or unparseable.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `Qms(r, c)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Mechanical Q at Fs.

**Parameters**

- `r` — `string[]` — The source row.
- `c` — `(name: string) => number` — Resolve a column index by header name.

**Returns**

- `number|undefined` — The parsed cell, or `undefined` when it is blank or unparseable.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `Vas(r, c)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Equivalent compliance volume, litres.

**Parameters**

- `r` — `string[]` — The source row.
- `c` — `(name: string) => number` — Resolve a column index by header name.

**Returns**

- `number|undefined` — The parsed cell, or `undefined` when it is blank or unparseable.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `Re(r, c)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Voice-coil DC resistance, ohms.

**Parameters**

- `r` — `string[]` — The source row.
- `c` — `(name: string) => number` — Resolve a column index by header name.

**Returns**

- `number|undefined` — The parsed cell, or `undefined` when it is blank or unparseable.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `Bl(r, c)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Motor force factor, T·m.

**Parameters**

- `r` — `string[]` — The source row.
- `c` — `(name: string) => number` — Resolve a column index by header name.

**Returns**

- `number|undefined` — The parsed cell, or `undefined` when it is blank or unparseable.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `Mms(r, c)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Moving mass including air load, grams.

**Parameters**

- `r` — `string[]` — The source row.
- `c` — `(name: string) => number` — Resolve a column index by header name.

**Returns**

- `number|undefined` — The parsed cell, or `undefined` when it is blank or unparseable.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `Sd(r, c)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Effective radiating area, cm².

**Parameters**

- `r` — `string[]` — The source row.
- `c` — `(name: string) => number` — Resolve a column index by header name.

**Returns**

- `number|undefined` — The parsed cell, or `undefined` when it is blank or unparseable.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `Le(r, c)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Voice-coil inductance, mH.

**Parameters**

- `r` — `string[]` — The source row.
- `c` — `(name: string) => number` — Resolve a column index by header name.

**Returns**

- `number|undefined` — The parsed cell, or `undefined` when it is blank or unparseable.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `Xmax(r, c)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Linear excursion limit one way, mm.

**Parameters**

- `r` — `string[]` — The source row.
- `c` — `(name: string) => number` — Resolve a column index by header name.

**Returns**

- `number|undefined` — The parsed cell, or `undefined` when it is blank or unparseable.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `Xvar(r, c)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Variance-based displacement limit, mm. B&C publish this below Xmax; it is not geometric headroom.

**Parameters**

- `r` — `string[]` — The source row.
- `c` — `(name: string) => number` — Resolve a column index by header name.

**Returns**

- `number|undefined` — The parsed cell, or `undefined` when it is blank or unparseable.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `eta0(r, c)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Reference half-space efficiency, percent.

**Parameters**

- `r` — `string[]` — The source row.
- `c` — `(name: string) => number` — Resolve a column index by header name.

**Returns**

- `number|undefined` — The parsed cell, or `undefined` when it is blank or unparseable.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `EBP(r, c)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Efficiency bandwidth product, Hz.

**Parameters**

- `r` — `string[]` — The source row.
- `c` — `(name: string) => number` — Resolve a column index by header name.

**Returns**

- `number|undefined` — The parsed cell, or `undefined` when it is blank or unparseable.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `dia(r, c)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Nominal diameter, mm.

**Parameters**

- `r` — `string[]` — The source row.
- `c` — `(name: string) => number` — Resolve a column index by header name.

**Returns**

- `number|undefined` — The parsed cell, or `undefined` when it is blank or unparseable.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `Znom(r, c)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Nominal impedance, ohms.

**Parameters**

- `r` — `string[]` — The source row.
- `c` — `(name: string) => number` — Resolve a column index by header name.

**Returns**

- `number|undefined` — The parsed cell, or `undefined` when it is blank or unparseable.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `Zmin(r, c)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Minimum impedance, ohms.

**Parameters**

- `r` — `string[]` — The source row.
- `c` — `(name: string) => number` — Resolve a column index by header name.

**Returns**

- `number|undefined` — The parsed cell, or `undefined` when it is blank or unparseable.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `pNom(r, c)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Nominal (AES) power handling, W.

**Parameters**

- `r` — `string[]` — The source row.
- `c` — `(name: string) => number` — Resolve a column index by header name.

**Returns**

- `number|undefined` — The parsed cell, or `undefined` when it is blank or unparseable.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `pCont(r, c)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Continuous program power handling, W.

**Parameters**

- `r` — `string[]` — The source row.
- `c` — `(name: string) => number` — Resolve a column index by header name.

**Returns**

- `number|undefined` — The parsed cell, or `undefined` when it is blank or unparseable.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `sens(r, c)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Sensitivity at 1 W / 1 m, dB.

**Parameters**

- `r` — `string[]` — The source row.
- `c` — `(name: string) => number` — Resolve a column index by header name.

**Returns**

- `number|undefined` — The parsed cell, or `undefined` when it is blank or unparseable.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `fLow(r, c)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Low end of the usable frequency range, Hz.

**Parameters**

- `r` — `string[]` — The source row.
- `c` — `(name: string) => number` — Resolve a column index by header name.

**Returns**

- `number|undefined` — The parsed cell, or `undefined` when it is blank or unparseable.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `fHigh(r, c)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

High end of the usable frequency range, Hz.

**Parameters**

- `r` — `string[]` — The source row.
- `c` — `(name: string) => number` — Resolve a column index by header name.

**Returns**

- `number|undefined` — The parsed cell, or `undefined` when it is blank or unparseable.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `vcDia(r, c)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Voice coil diameter, mm.

**Parameters**

- `r` — `string[]` — The source row.
- `c` — `(name: string) => number` — Resolve a column index by header name.

**Returns**

- `number|undefined` — The parsed cell, or `undefined` when it is blank or unparseable.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `vcDepth(r, c)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Winding depth, mm.

**Parameters**

- `r` — `string[]` — The source row.
- `c` — `(name: string) => number` — Resolve a column index by header name.

**Returns**

- `number|undefined` — The parsed cell, or `undefined` when it is blank or unparseable.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `gapDepth(r, c)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Magnetic gap depth, mm.

**Parameters**

- `r` — `string[]` — The source row.
- `c` — `(name: string) => number` — Resolve a column index by header name.

**Returns**

- `number|undefined` — The parsed cell, or `undefined` when it is blank or unparseable.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `flux(r, c)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Gap flux density, T.

**Parameters**

- `r` — `string[]` — The source row.
- `c` — `(name: string) => number` — Resolve a column index by header name.

**Returns**

- `number|undefined` — The parsed cell, or `undefined` when it is blank or unparseable.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `vcWinding(r, c)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Voice coil winding material.

**Parameters**

- `r` — `string[]` — The source row.
- `c` — `(name: string) => number` — Resolve a column index by header name.

**Returns**

- `string|undefined` — The parsed cell, or `undefined` when it is blank or unparseable.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `vcFormer(r, c)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Voice coil former material.

**Parameters**

- `r` — `string[]` — The source row.
- `c` — `(name: string) => number` — Resolve a column index by header name.

**Returns**

- `string|undefined` — The parsed cell, or `undefined` when it is blank or unparseable.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `magnet(r, c)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Magnet material.

**Parameters**

- `r` — `string[]` — The source row.
- `c` — `(name: string) => number` — Resolve a column index by header name.

**Returns**

- `string|undefined` — The parsed cell, or `undefined` when it is blank or unparseable.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `pole(r, c)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Pole piece design.

**Parameters**

- `r` — `string[]` — The source row.
- `c` — `(name: string) => number` — Resolve a column index by header name.

**Returns**

- `string|undefined` — The parsed cell, or `undefined` when it is blank or unparseable.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `spider(r, c)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Spider construction.

**Parameters**

- `r` — `string[]` — The source row.
- `c` — `(name: string) => number` — Resolve a column index by header name.

**Returns**

- `string|undefined` — The parsed cell, or `undefined` when it is blank or unparseable.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `surround(r, c)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Surround shape.

**Parameters**

- `r` — `string[]` — The source row.
- `c` — `(name: string) => number` — Resolve a column index by header name.

**Returns**

- `string|undefined` — The parsed cell, or `undefined` when it is blank or unparseable.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `cone(r, c)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Cone shape.

**Parameters**

- `r` — `string[]` — The source row.
- `c` — `(name: string) => number` — Resolve a column index by header name.

**Returns**

- `string|undefined` — The parsed cell, or `undefined` when it is blank or unparseable.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `vRec(r, c)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Recommended enclosure volume, litres.

**Parameters**

- `r` — `string[]` — The source row.
- `c` — `(name: string) => number` — Resolve a column index by header name.

**Returns**

- `number|undefined` — The parsed cell, or `undefined` when it is blank or unparseable.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `fRec(r, c)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Recommended tuning frequency, Hz.

**Parameters**

- `r` — `string[]` — The source row.
- `c` — `(name: string) => number` — Resolve a column index by header name.

**Returns**

- `number|undefined` — The parsed cell, or `undefined` when it is blank or unparseable.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `cmsFrom(Fs, Mms)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Derive compliance from the mass resonating at the published Fs.

Catalogs publish Fs, Mms and Qms; the solver runs on Mms, Cms and Rms.
Deriving Cms from the same three numbers guarantees the modeled driver
resonates at exactly the frequency its datasheet claims — which
transcribing a rounded published Cms does not.

**Parameters**

- `Fs` — `number|undefined` — Free-air resonance, Hz.
- `Mms` — `number|undefined` — Moving mass, grams.

**Returns**

- `number|undefined` — Compliance in mm/N, or `undefined` when either input is missing or non-positive.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `rmsFrom(Fs, Mms, Qms)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Derive mechanical resistance from the published mechanical Q.

`Rms = ωs · Mms / Qms`. Derived for the same reason as Cms: it makes the
modeled driver's mechanical Q exactly the published one.

**Parameters**

- `Fs` — `number|undefined` — Free-air resonance, Hz.
- `Mms` — `number|undefined` — Moving mass, grams.
- `Qms` — `number|undefined` — Mechanical Q.

**Returns**

- `number|undefined` — Mechanical resistance in N·s/m, or `undefined` when any input is missing or non-positive.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `vdFrom(Sd, Xmax)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Peak displacement volume, `Sd · Xmax`.

**Parameters**

- `Sd` — `number|undefined` — Effective radiating area, cm².
- `Xmax` — `number|undefined` — Linear excursion one way, mm.

**Returns**

- `number|undefined` — Displacement volume in litres, or `undefined` when either input is missing or non-positive.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `build(profile)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Read a catalog and produce the driver records for it.

Every mapped value that comes back `undefined` is left off the record
rather than written as null, which is what keeps extended parameters
genuinely sparse.

Rows are audited as they are built. A catalog can contradict itself, and
the response is to label the row rather than "fix" a column we have no
authority to change — the fix needs the datasheet, not a guess.

**Parameters**

- `profile` — `object` — A catalog profile.

**Returns**

- `Array<object>` — Driver records, each with derived Cms and Rms, an `ext` object, a `source`, and a `suspect` array when the audit found a contradiction.

**Throws**

- `Error` — When the source file is missing a mapped column.

**Side effects**

- Reads the catalog file from disk.

### `build > c(name)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Resolve a column index by its header text.

Throws rather than returning -1, so a renamed column in a refreshed
catalog fails the import loudly instead of silently emitting a database
full of `undefined`.

**Parameters**

- `name` — `string` — Exact header text.

**Returns**

- `number` — The column index.

**Throws**

- `Error` — When the header is not present, naming both the column and the file.

**Reads external mutable state**

- the header row captured above.

### `emit(profile, drivers)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Render the driver records as a generated ES module.

One line per driver: long lines, but they diff cleanly when a catalog is
refreshed, which a pretty-printed object would not.

**Parameters**

- `profile` — `object` — The catalog profile, for the generated header.
- `drivers` — `Array<object>` — Records from `build`.

**Returns**

- `string` — The module source, ready to write.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.
