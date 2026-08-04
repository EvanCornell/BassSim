# Contract specification: `src/toolbarItems.js`

> Generated from method contracts. This file contains **no implementation code**.
> Write tests against what is claimed here, not against what you expect the code to do.

## Module

Quick-access bar registry.

The bar under the menu is a list of small widgets chosen and ordered by the
user (Settings ▸ Quick bar). Two kinds live here:

  control — an interactive widget (project name, drive voltage, sweep …)
  metric  — a read-only number derived from the current simulation

Adding an item means one entry in TOOLBAR_ITEMS plus, for controls, one case
in Toolbar.jsx's renderer. Metrics need nothing else: `metricValue` below is
the single place that knows how to compute and format them.

## Exported constants

Names this module publishes that are not methods. The method contracts
above and below refer to these by role — a command, a node type, a panel —
so this is the vocabulary they assume.

### `TOOLBAR_ITEMS`

Every widget the quick bar can show, keyed by id.

`controls` are interactive and need a matching case in Toolbar.jsx's
renderer; `metrics` are read-only and need nothing else, because
`metricValue` is the single place that knows how to compute and format them.

Keys: `project`, `undo`, `voltage`, `sweep`, `masking`, `snapshot`, `m_f3`, `m_f10`, `m_fb`, `m_qtc`, `m_zpeaks`, `m_peakspl`, `m_xfb`, `m_xf3`, `m_bw`, `m_maxpower`, `m_volume`, `m_solve`

### `TOOLBAR_GROUPS`

Quick-bar groups as `[id, heading]`, in the order Settings lists them.

An array of 2 entries.

### `ALL_ITEM_IDS`

Every quick-bar item id, used to offer the full list in Settings.

### `DEFAULT_TOOLBAR`

The quick bar as it ships.

Sweep range and resonance masking are deliberately absent: both are set-once
controls reachable from Settings ▸ Application and the Simulate menu, so they
earn a permanent slot only for someone who actually tweaks them often.

Values: `project`, `undo`, `voltage`, `snapshot`, `m_f3`, `m_f10`, `m_fb`, `m_qtc`, `m_zpeaks`, `m_peakspl`, `m_xfb`, `m_xf3`, `m_bw`, `m_maxpower`, `m_volume`, `m_solve`

### `__internals`

Keys: `fmt`

## EXPORTED (3)

### `systemVolume(nodes)`

- **Reachability:** EXPORTED
- **Obtain via:** import { systemVolume } from '../../src/toolbarItems.js'

Total enclosed air in the design.

Chambers contribute their stated volume; waveguides contribute the true
integral of their area profile, so a flared horn counts its own internal
volume rather than being treated as a straight duct.

**Parameters**

- `nodes` — `Array<object>` — Graph nodes.

**Returns**

- `number` — Volume in litres. 0 when nothing encloses air.

**Postconditions (must hold on return)**

- nodes is not modified

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `metricValue(id, ctx)`

- **Reachability:** EXPORTED
- **Obtain via:** import { metricValue } from '../../src/toolbarItems.js'

Compute and format one quick-bar metric.

The single place that knows how to turn a metric id into display text, which
is why adding a metric needs no renderer change.

Excursion figures are shown as a percentage of Xmax and flagged with `bad`
once they exceed it. Note that Xmax comes from the *first* driver node, so the
percentage is misleading for a design mixing drivers with different limits —
the per-driver headroom in `computeMetrics` is the accurate view.

**Parameters**

- `id` — `string` — A quick-bar item id.
- `ctx` — `object` — Current app state.
- `ctx.metrics` — `object|null` — Metrics from `computeMetrics`.
- `ctx.results` — `object|null` — The raw simulation result, for solve time.
- `ctx.nodes` — `Array<object>` — Graph nodes, for system volume and Xmax.

**Returns**

- `{label: string, value: string, bad?: boolean}|null` — The formatted readout, or `null` when `id` is a control rather than a metric.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `sanitizeToolbar(ids)`

- **Reachability:** EXPORTED
- **Obtain via:** import { sanitizeToolbar } from '../../src/toolbarItems.js'

Clean a persisted quick-bar arrangement.

The trust boundary for the stored bar: unknown ids — from an older build or a
renamed item — are dropped and duplicates removed, so a stale preference
cannot render a broken bar.

**Parameters**

- `ids` — `any` — Untrusted item id list, typically from LocalStorage.

**Returns**

- `string[]|null` — The surviving ids in order, or `null` when the input was not an array.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

## INTERNAL (1)

### `fmt(v, d)`

- **Reachability:** INTERNAL
- **Obtain via:** import { __internals } from '../../src/toolbarItems.js'  →  __internals.fmt

Format a metric number, or an em dash when there is nothing to show.

**Parameters**

- `v` — `number|null|undefined` — The value.
- `d` — `number` _(optional, default `1`)_ — Decimal places.

**Returns**

- `string` — The formatted number, or `'—'` for absent and non-finite values.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

## UNREACHABLE (2)

### `metricValue > frac(x)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

An excursion as a percentage of Xmax.

**Parameters**

- `x` — `number|null|undefined` — Excursion, mm.

**Returns**

- `string` — A percentage, or `'—'` when either value is missing.

**Reads external mutable state**

- the enclosing `xmax`, taken from the first driver node.

### `metricValue > over(x)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Whether an excursion exceeds Xmax, for the warning style.

**Parameters**

- `x` — `number|null|undefined` — Excursion, mm.

**Returns**

- `boolean|undefined` — True when over Xmax; falsy when it is not, or cannot be judged.

**Reads external mutable state**

- the enclosing `xmax`, taken from the first driver node.
