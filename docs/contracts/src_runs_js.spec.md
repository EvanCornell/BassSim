# Contract specification: `src/runs.js`

> Generated from method contracts. This file contains **no implementation code**.
> Write tests against what is claimed here, not against what you expect the code to do.

## Module

Stored time-domain runs.

There is one kind of run: stepped tones across a frequency range at one
drive level (see `levelRun` in src/spice/timedomain.js). Every figure the
time-domain views show — output, compression, distortion, excursion, port
velocity, impedance, power, the 10% THD Max SPL and each tone's start-up —
comes from it. Queuing several levels makes one run per level.

Each run is a branch off the record it was queued from (see
src/records.js): its commit holds the project as it was run and the
result. The run list in the project file carries a summary of each, so the
library lists runs without reading any result.

Everything here is pure.

## Exported constants

Names this module publishes that are not methods. The method contracts
above and below refer to these by role — a command, a node type, a panel —
so this is the vocabulary they assume.

### `RUN_DEFAULTS`

The range a new run covers, and how many tones across it.

Keys: `f1`, `f2`, `points`

### `MAX_SPL_THD`

The THD that defines the Max SPL.

Value: `0.1`

### `TABS`

The viewer's tabs, `[id, label]`, in order.

Each shows one category of figure across frequency, except Waveforms,
which shows each tone's start-up in time.

An array of 9 entries.

### `TAB_VIEWS`

The choices inside a tab, `[id, label, unit]`; the first is shown first.

Keys: `output`, `compression`, `distortion`, `excursion`, `velocity`, `impedance`, `power`, `maxspl`, `waveforms`

## EXPORTED (12)

### `isLevelRun(r)`

- **Reachability:** EXPORTED
- **Obtain via:** import { isLevelRun } from '../../src/runs.js'

Whether a stored run is of the current kind.

Runs stored before there was one kind of run are not; they are deleted
when their project is read.

**Parameters**

- `r` — `object` — A run's summary.

**Returns**

- `boolean` — Whether it can be shown.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `dbText(L)`

- **Reachability:** EXPORTED
- **Obtain via:** import { dbText } from '../../src/runs.js'

A level offset as text, with a true minus sign.

**Parameters**

- `L` — `number` — dB.

**Returns**

- `string` — `+6 dB`, `0 dB`, `−3 dB`.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `recordLabel(name)`

- **Reachability:** EXPORTED
- **Obtain via:** import { recordLabel } from '../../src/runs.js'

How a record is named in run names and the library: its name, or "Record n" when it goes by its number.

**Parameters**

- `name` — `string` — From `recordName`.

**Returns**

- `string` — e.g. `Tuned`, `Record 3`.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `defaultRunName(project, record)`

- **Reachability:** EXPORTED
- **Obtain via:** import { defaultRunName } from '../../src/runs.js'

A new run's name when none is typed: the project's name and the record's.

**Parameters**

- `project` — `string` — The project's name.
- `record` — `string` — The record's name or number, from `recordName`.

**Returns**

- `string` — e.g. `Ported 60 L · Record 3`.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `cleanLevels(levels)`

- **Reachability:** EXPORTED
- **Obtain via:** import { cleanLevels } from '../../src/runs.js'

The levels a run list asks for: numbers, each once, in the order given.

**Parameters**

- `levels` — `Array<number|string>` — As typed.

**Returns**

- `number[]` — The levels, dB.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `packResult(v)`

- **Reachability:** EXPORTED
- **Obtain via:** import { packResult } from '../../src/runs.js'

A result made ready to store: typed arrays become plain arrays, and every number is cut to five significant figures.

**Parameters**

- `v` — `*` — A result, or part of one.

**Returns**

- `*` — The same shape, JSON-safe and compact.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `projectInfo(project)`

- **Reachability:** EXPORTED
- **Obtain via:** import { projectInfo } from '../../src/runs.js'

Node labels and driver Xmax from a project, as a run's summary keeps them.

**Parameters**

- `project` — `object` — A serialized project.

**Returns**

- `{names: Object<string, string>, xmax: Object<string, number>}` — Labels by node id, and each driver's Xmax, mm.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `hasTab(tab, result)`

- **Reachability:** EXPORTED
- **Obtain via:** import { hasTab } from '../../src/runs.js'

Whether a run's result has anything for a tab.

**Parameters**

- `tab` — `string` — A `TABS` id.
- `result` — `object` — The run's result.

**Returns**

- `boolean` — Whether the tab has something to show.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `sharedTabs(results)`

- **Reachability:** EXPORTED
- **Obtain via:** import { sharedTabs } from '../../src/runs.js'

The tabs a set of runs share: those every one of them has something for.

**Parameters**

- `results` — `Array<object>` — The runs' results.

**Returns**

- `string[]` — Tab ids, in `TABS` order.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `tabTraces(tab, view, result, names, hz)`

- **Reachability:** EXPORTED
- **Obtain via:** import { tabTraces } from '../../src/runs.js'

One run's traces for a tab: `{key, label, x, y, dash?, marker?}`, x in Hz (or ms for waveforms).

Where a project has several drivers, ports or channels, each is a trace,
labelled with its node's name. Linear-model traces are dashed.

**Parameters**

- `tab` — `string` — A `TABS` id.
- `view` — `string` — One of the tab's `TAB_VIEWS` ids.
- `result` — `object` — The run's result.
- `names` — `Object<string, string>` _(optional)_ — Node labels by id.
- `hz` — `number` _(optional)_ — For waveforms: the tone, the nearest one run is used.

**Returns**

- `Array<object>` — The traces; points that could not be solved are left out.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `nearestStart(result, hz)`

- **Reachability:** EXPORTED
- **Obtain via:** import { nearestStart } from '../../src/runs.js'

The start-up of the tone nearest a frequency.

**Parameters**

- `result` — `object` — A run's result.
- `hz` — `number` _(optional)_ — The frequency; the run's lowest when omitted.

**Returns**

- `object|null` — `{hz, dt, pressure, excursion, velocity}`, or null when none was kept.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `unreachedAt(result)`

- **Reachability:** EXPORTED
- **Obtain via:** import { unreachedAt } from '../../src/runs.js'

The 10% THD search's frequencies where THD stayed under the limit at the top of the range searched.

**Parameters**

- `result` — `object` — A run's result.

**Returns**

- `number[]` — Those frequencies, Hz: the Max SPL shown there is a floor, not the limit.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

## UNREACHABLE (4)

### `idsOf(rows, field)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

The ids a map-valued figure carries across a result's rows: drivers, waveguides or channels.

**Parameters**

- `rows` — `Array<object>` — The result's rows.
- `field` — `string` — `xPeak`, `vPeak` or `z`.

**Returns**

- `string[]` — The ids, in first-seen order.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `tabTraces > line(key, label, get, extra)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

A trace across frequency.

**Parameters**

- `key` — `string` — Its key.
- `label` — `string` — Its label.
- `get` — `Function` — The value from a row, or null.
- `extra` — `object` _(optional)_ — Fields to add, e.g. `dash`.

**Returns**

- `object` — The trace.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `tabTraces > perId(field, pick)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Traces of a map-valued figure, one per id, with the linear model's beside each when it has one.

**Parameters**

- `field` — `string` — `xPeak`, `vPeak` or `z`.
- `pick` — `Function` _(optional)_ — Turns a map value into a number.

**Returns**

- `Array<object>` — The traces.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `tabTraces > wave(key, label, y)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

A start-up series as a trace in ms.

**Parameters**

- `key` — `string` — Its key.
- `label` — `string` — Its label.
- `y` — `number[]` — The samples.

**Returns**

- `object` — The trace.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.
