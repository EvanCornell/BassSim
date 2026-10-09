# Contract specification: `src/utils/export.js`

> Generated from method contracts. This file contains **no implementation code**.
> Write tests against what is claimed here, not against what you expect the code to do.

## Exported constants

Names this module publishes that are not methods. The method contracts
above and below refer to these by role — a command, a node type, a panel —
so this is the vocabulary they assume.

### `__internals`

Keys: `download`

## EXPORTED (6)

### `exportProjectJSON(proj)`

- **Reachability:** EXPORTED
- **Obtain via:** import { exportProjectJSON } from '../../src/utils/export.js'

Download a project as a formatted `.speakerspice.json` file.

**Parameters**

- `proj` — `object` — The project to serialize.
- `proj.name` — `string` _(optional)_ — Used for the filename; falls back to `speakerspice-project`.

**Returns**

- `void`

**Side effects**

- Triggers a browser download.

### `exportCircuitSVG(proj)`

- **Reachability:** EXPORTED
- **Obtain via:** import { exportCircuitSVG } from '../../src/utils/export.js'
- **Async:** returns a Promise

Download the circuit the frequency sweep solves, drawn as an SVG diagram.

Every element of the netlist is drawn, laid out automatically — the raw
circuit, not a tidied schematic. The renderer and its symbols are loaded
only when asked for.

**Parameters**

- `proj` — `object` — The project, as saved.
- `proj.name` — `string` _(optional)_ — Used for the filename.

**Returns**

- `Promise<void>` — Resolves once the download has been handed to the browser.

**Throws**

- `Error` — When the project cannot be compiled, or the diagram cannot be laid out.

**Side effects**

- Loads the renderer, runs the layout and triggers a browser download.

### `exportWorkspaceZip(ws)`

- **Reachability:** EXPORTED
- **Obtain via:** import { exportWorkspaceZip } from '../../src/utils/export.js'
- **Async:** returns a Promise

Download a whole workspace as an archive of folders and files.

Unzipped it is the tree the explorer shows: each project a readable JSON
document where the user filed it, and `.speakerspice` holding the app's own data.
A single blob would download faster and be worth less — this one can be
browsed, edited in a text editor, diffed and committed.

**Parameters**

- `ws` — `object` — The workspace to archive.

**Returns**

- `Promise<void>` — Resolves once the download has been handed to the browser.

**Side effects**

- Compresses through the platform's streams and triggers a browser download.

### `exportCSV(results, nodes, projectName)`

- **Reachability:** EXPORTED
- **Obtain via:** import { exportCSV } from '../../src/utils/export.js'

Download every result series as one wide CSV.

Columns are built as `[header, accessor]` pairs so the per-port, per-waveguide
and per-probe series — whose count depends on the graph — can be spliced in
alongside the fixed ones without a second layout pass. Node labels are
resolved into the headers so the file is readable without the project beside
it.

Values are written at 7 significant digits; absent and non-finite entries
become empty cells rather than `NaN`, which spreadsheets handle badly.

**Parameters**

- `results` — `object|null` — A sweep result, as `simulateProject` returns it. A failed or absent result exports nothing.
- `nodes` — `Array<object>` — Graph nodes, used to label port and chamber columns.
- `projectName` — `string` — Base filename.

**Returns**

- `void`

**Side effects**

- Triggers a browser download. Returns silently when there is nothing to export.

### `exportSchematicPNG(projectName)`

- **Reachability:** EXPORTED
- **Obtain via:** import { exportSchematicPNG } from '../../src/utils/export.js'
- **Async:** returns a Promise

Download a PNG of the node canvas.

Rasterizes the live React Flow element at 2× for a legible image, filtering
out the minimap and controls so the export shows the schematic rather than the
editor chrome. The background is set explicitly because the canvas itself is
transparent.

**Parameters**

- `projectName` — `string` — Base filename.

**Returns**

- `Promise<void>` — Resolves once the download has been triggered.

**Side effects**

- Reads the live DOM, rasterizes it, and triggers a browser download. Returns silently when the canvas is not mounted.

### `exportMetricsTxt(metrics, settings, projectName)`

- **Reachability:** EXPORTED
- **Obtain via:** import { exportMetricsTxt } from '../../src/utils/export.js'

Download a plain-text summary of the key metrics.

The human-readable counterpart to the CSV: a fixed-width report suitable for
pasting into a build thread. Every figure degrades to `n/a` rather than being
omitted, so the shape of the report is the same for a sealed box and a ported
one.

**Parameters**

- `metrics` — `object|null` — Metrics from `computeMetrics`. Absent metrics export nothing.
- `settings` — `object` — Sweep settings, for the drive-level header line.
- `projectName` — `string` — Base filename, also used in the title line.

**Returns**

- `void`

**Side effects**

- Reads the current time for the generated-on stamp and triggers a browser download.

## INTERNAL (1)

### `download(filename, content, mime)`

- **Reachability:** INTERNAL
- **Obtain via:** import { __internals } from '../../src/utils/export.js'  →  __internals.download

Push content to the user as a file download.

Uses an object URL and a synthetic anchor click, which is the only way to
name a download from the browser. The URL is revoked after 5 s — long enough
for the download to start, short enough not to leak the blob for the session.

**Parameters**

- `filename` — `string` — Suggested filename, including extension.
- `content` — `Blob|string` — A ready Blob, or text to wrap in one.
- `mime` — `string` — MIME type, used only when `content` is text.

**Returns**

- `void`

**Side effects**

- Creates an object URL, clicks a synthetic anchor to trigger a browser download, and schedules the URL's revocation.

## UNREACHABLE (2)

### `exportSchematicPNG > filter(n)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Exclude the editor chrome from the exported image.

The minimap and controls belong to the editor, not the schematic.

**Parameters**

- `n` — `HTMLElement` — A candidate node.

**Returns**

- `boolean` — True to include the node in the render.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `exportMetricsTxt > row(k, v)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Append one aligned `label value` line to the report.

**Parameters**

- `k` — `string` — Row label, padded to a fixed column width.
- `v` — `string` — Formatted value.

**Returns**

- `number` — The new line count, as returned by `Array.push` and ignored by callers.

**Mutates**

- Appends to the enclosing `l` line buffer.
