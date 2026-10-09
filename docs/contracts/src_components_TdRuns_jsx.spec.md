# Contract specification: `src/components/TdRuns.jsx`

> Generated from method contracts. This file contains **no implementation code**.
> Write tests against what is claimed here, not against what you expect the code to do.

## Module

The time-domain runs: the library of stored runs, the viewer that shows
one run or several overlaid, and the New run drawer that queues more.

There is one kind of run — stepped tones at one drive level — and every
view is derived from it (see src/runs.js). Runs are stored in their
project's records; this file only reads them, and renames or deletes them
through the store.

## Exported constants

Names this module publishes that are not methods. The method contracts
above and below refer to these by role — a command, a node type, a panel —
so this is the vocabulary they assume.

### `NO_FILTERS`

What the library shows before any filter is touched: every project's runs.

Keys: `query`, `project`, `record`

## EXPORTED (8)

### `useRuns()`

- **Reachability:** EXPORTED
- **Obtain via:** import { useRuns } from '../../src/components/TdRuns.jsx'

Every stored run in the workspace, newest first, kept in step with the store.

**Returns**

- `Array<object>` — The runs, as `runIndex` lists them.

**Side effects**

- Subscribes to the store.

### `dayLabel(at, now)`

- **Reachability:** EXPORTED
- **Obtain via:** import { dayLabel } from '../../src/components/TdRuns.jsx'

A day's heading for the library.

**Parameters**

- `at` — `number` — Ms since the epoch.
- `now` — `number` — The time now.

**Returns**

- `string` — `Today`, `Yesterday` or a date.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `byDay(runs)`

- **Reachability:** EXPORTED
- **Obtain via:** import { byDay } from '../../src/components/TdRuns.jsx'

Runs grouped by day, newest first.

**Parameters**

- `runs` — `Array<object>` — Runs, newest first.

**Returns**

- `Array<{day: string, runs: Array<object>}>` — The groups.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `filterRuns(runs, f, skip)`

- **Reachability:** EXPORTED
- **Obtain via:** import { filterRuns } from '../../src/components/TdRuns.jsx'

The runs the library's search and filters let through.

Project `*` is every project, `''` the open one, otherwise a file path.
Every word of the query has to match somewhere.

**Parameters**

- `runs` — `Array<object>` — `runIndex` entries.
- `f` — `object` — The filters, shaped like `NO_FILTERS`.
- `skip` — `string` _(optional)_ — A filter to ignore, for counting that filter's own options.

**Returns**

- `Array<object>` — The runs shown.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `filterChoices(runs, f)`

- **Reachability:** EXPORTED
- **Obtain via:** import { filterChoices } from '../../src/components/TdRuns.jsx'

Each filter's choices, with how many runs each would show given the other filters.

**Parameters**

- `runs` — `Array<object>` — `runIndex` entries.
- `f` — `object` — The filters.

**Returns**

- `{project: Array<object>, record: Array<object>}` — `{value, label, count}` per choice, the default first.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `RunLibrary()`

- **Reachability:** EXPORTED
- **Obtain via:** import { RunLibrary } from '../../src/components/TdRuns.jsx'

The library of stored runs: search, project and record filters, grouped by day.

**Returns**

- `React.ReactElement` — The library.

**Side effects**

- Subscribes to the store.

### `RunViewer()`

- **Reachability:** EXPORTED
- **Obtain via:** import { RunViewer } from '../../src/components/TdRuns.jsx'

The run viewer: open one run to see everything it measured, or drag more onto it to overlay them.

The figures are split into tabs by category; with several runs open, only
the tabs every one of them has are offered.

**Returns**

- `React.ReactElement` — The viewer.

**Side effects**

- Subscribes to the store; reads the open runs' results.

### `NewRunDrawer()`

- **Reachability:** EXPORTED
- **Obtain via:** import { NewRunDrawer } from '../../src/components/TdRuns.jsx'

The New run drawer: a name, the levels — one run each — and the range.

**Returns**

- `React.ReactElement` — The drawer.

**Side effects**

- Subscribes to the store; queues runs.

## UNREACHABLE (19)

### `useRunData(entries)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Results of some runs, read as they are needed.

**Parameters**

- `entries` — `Array<object>` — The runs.

**Returns**

- `Object<string, object>` — What is known of each, by id; see `runDataOf`.

**Side effects**

- Subscribes to the store; asks the store to read results not yet read.

### `draggedRuns(e)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

The run ids a drag carries.

**Parameters**

- `e` — `DragEvent` — The drop event.

**Returns**

- `string[]` — The ids; none when the drag is not of runs.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `dragRuns(e, ids)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Start dragging runs.

**Parameters**

- `e` — `DragEvent` — The dragstart event.
- `ids` — `string[]` — The runs.

**Returns**

- `void`

**Side effects**

- Sets the drag's data.

### `isRunDrag(e)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Whether a drag carries runs.

**Parameters**

- `e` — `DragEvent` — The event.

**Returns**

- `boolean` — True for a run drag.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `recordKey(r)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

A run's record, as the record filter names it.

**Parameters**

- `r` — `object` — A `runIndex` entry.

**Returns**

- `string` — `path#index`; `path#-1` for a deleted record.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `searchText(r)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

The text a run is searched by: its name, level, project and record.

**Parameters**

- `r` — `object` — A `runIndex` entry.

**Returns**

- `string` — Lower-case text.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `SearchIcon()`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Magnifying glass for the search field.

**Returns**

- `React.ReactElement` — The icon.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `FilterChip(props)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

One filter as a chip: its name until set, then its value with a ✕ to clear it; a click opens its choices.

**Parameters**

- `props` — `object` — Component props.
- `props.name` — `string` — The filter's name.
- `props.choices` — `Array<{value: string, label: string, count: number}>` — Its choices, the default first.
- `props.value` — `string` — The chosen value.
- `props.onChange` — `Function` — Called with a value.

**Returns**

- `React.ReactElement` — The chip.

**Side effects**

- Holds whether its menu is open.

### `RunName(props)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

A run's name: one line that scrolls sideways when long; click to edit it in place.

**Parameters**

- `props` — `object` — Component props.
- `props.run` — `object` — The run.

**Returns**

- `React.ReactElement` — The name.

**Side effects**

- Holds the edit in component state; committing renames the run.

### `RunName > commit()`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Save the edit, if it changed anything, and stop editing.

**Returns**

- `void`

**Side effects**

- Renames the run.

### `RunRow(props)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

One run in the library: its name and level, then its project and record.

Clicking the row opens it alone in the viewer; ⊕ lays it over the runs
already open, as dragging it onto the viewer does.

**Parameters**

- `props` — `object` — Component props.
- `props.run` — `object` — The run.
- `props.color` — `string|null` — Its colour in the viewer, when open there.
- `props.onMenu` — `Function` — Opens its menu at the event.

**Returns**

- `React.ReactElement` — The row.

**Side effects**

- Subscribes to the store; opens runs in the viewer.

### `RunMenu(props)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

A run's menu: open it over the others, restore its project as a record, delete it.

**Parameters**

- `props` — `object` — Component props.
- `props.at` — `{run: object, x: number, y: number}` — The run and where the menu opens.
- `props.onClose` — `Function` — Closes the menu.

**Returns**

- `React.ReactElement` — The menu.

**Side effects**

- Its items change the viewer, the records or the runs.

### `RunMenu > act(fn)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Do something, then close the menu.

**Parameters**

- `fn` — `Function` — The action.

**Returns**

- `void`

**Side effects**

- Runs the action; closes the menu.

### `QueueList()`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Queued, solving and failed runs, above the library.

**Returns**

- `React.ReactElement|null` — The queue, or nothing when it is empty.

**Side effects**

- Subscribes to the store.

### `RunLibrary > filter(patch)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Set some filters; a new project drops a record filter that belonged to another.

**Parameters**

- `patch` — `object` — Filters to set.

**Returns**

- `void`

**Side effects**

- Writes component state.

### `ViewChart(props)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

The chart for one tab view over the open runs.

With one run, each of its traces gets its own colour; with several, each
run keeps its colour and its traces are told apart by name.

**Parameters**

- `props` — `object` — Component props.
- `props.tab` — `string` — The tab.
- `props.view` — `string` — The view within it.
- `props.runs` — `Array<{entry: object, result: object, color: string}>` — The open runs that have loaded.
- `props.hz` — `number` _(optional)_ — For waveforms, the tone.

**Returns**

- `React.ReactElement` — The chart.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `RunViewer > drop(e)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Drop runs onto the viewer: they are laid over what is open.

**Parameters**

- `e` — `DragEvent` — The drop.

**Returns**

- `void`

**Side effects**

- Opens the runs.

### `NewRunDrawer > setLevel(i, v)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Change one level.

**Parameters**

- `i` — `number` — Which.
- `v` — `number|null` — Its new value; null removes it.

**Returns**

- `void`

**Side effects**

- Writes the drawer.

### `NewRunDrawer > run()`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Queue the runs and close the drawer.

**Returns**

- `void`

**Side effects**

- Queues runs; closes the drawer.
