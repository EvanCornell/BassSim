# AcouSim — Node-Based Acoustic Circuit Simulator

AcouSim simulates loudspeaker enclosure behavior with a free-form visual node
graph instead of preset enclosure types. Drag acoustic elements onto an
infinite canvas, wire their ports together, and every plot updates live: any
topology — sealed, ported, bandpass, tapped horn, passive radiator, or a car
cabin modeled as a lossy chamber — is built from the same five elements.

The workspace is a dockable IDE-style layout: every panel can be dragged to a
new position, tabbed with another panel, resized, maximized or closed, and the
arrangement is saved and restored automatically.

## Run it

Simulations run **server-side** — the browser bundle contains the UI only,
no engine code. Development therefore needs both processes:

```bash
npm install
npm run server  # simulation backend on :8788 (terminal 1)
npm run dev     # UI on http://localhost:5173, proxies /api to :8788 (terminal 2)
```

Production is a single process serving the built app, the simulation API,
and the MCP endpoint:

```bash
npm start       # build + serve everything on http://localhost:8788
```

Or with Docker: `docker build -t acousim . && docker run -p 8788:8788 -v acousim-data:/data acousim`

### Accounts

The server includes an account system ([Better Auth](https://better-auth.com)
on SQLite): email + password with reset, plus optional social sign-in
(Google, Apple, Facebook, GitHub) and post-signup account linking — manage it
all under **Settings ▸ Account** in the app. Copy `.env.example` to `.env`:
`BETTER_AUTH_SECRET` is required in production, each social provider appears
automatically once its OAuth credentials are set, and password-reset email
uses SMTP (without it, reset links print to the server log).

## Workspace

Commands live in the menu bar — **File**, **Edit**, **View**, **Simulate**,
**Tools**, **Help**, and **Settings**, which opens its window directly rather
than hiding behind a dropdown. Beneath it sits a configurable quick bar for per-design
adjustments: by default the project name, undo/redo, a drive-voltage box with
its resulting wattage, the snapshot button, and a live metrics readout (F3/F10,
Fb, Qtc, impedance peaks, peak SPL, excursion ratios, −3 dB bandwidth, max
power before Xmax, system volume, solve time). Sweep range and resonance
masking are available there too but off by default, since both are set-once
controls that also live in **Settings ▸ Application** and the Simulate menu.
Every item can be shown, hidden or reordered under **Settings ▸ Quick bar**.

The area below is a dock. Every panel is independent — Palette, Node Editor,
Parameters, Nonlinear Lab, and each of the nine plots — so any combination can
be tiled side by side instead of hidden behind one another. They live in tabbed
groups:

| Action | How |
|---|---|
| Move a panel | Drag its tab; the target group highlights the half it will occupy, or its centre to tab in |
| Dock against the window edge | Drag a tab onto the outer strip of the workspace |
| Reorder tabs | Drag a tab onto another tab in the same group |
| Resize | Drag the gap between two groups |
| Maximize / restore | Double-click a tab, or use the ⛶ button |
| Send to another monitor | The ⧉ button, or **View ▸ Open in New Tab ▸** — opens that panel in its own browser tab |
| Show / hide a panel | **View ▸**, with the plots under **View ▸ Charts** — a check mark marks the open ones |
| Restore the default | **View ▸ Reset Layout** |
| Reusable arrangements | **View ▸ Save Layout As…**, then **Apply Saved Layout ▸** |

Any panel can be popped out into its own browser tab (`/panel?id=…`) and
dragged onto a second monitor. The tab shows that panel alone and stays live: a
`BroadcastChannel` mirrors the shared state — graph, parameters, settings,
results, chart zoom — so an edit in either window redraws both. The panel
leaves the dock while it is out and returns when the tab is closed. The main
window remains the only one that runs the solver and writes the auto-save.

By default the workspace opens with SPL Response, Impedance, Cone Excursion
and Port Velocity tabbed together below the canvas; the other five plots are a
click away in **View ▸ Charts**. The layout and any saved arrangements persist
in LocalStorage. Settings is not a panel: it is a floating window, centred on
screen, draggable by its title bar and dismissed with Escape.

### Keyboard

Every command runs through one registry (`src/keymap.js`), so the global key
handler, the shortcut hints in the menus and the rebinding UI can never
disagree. Defaults:

| | |
|---|---|
| Undo / redo | `Ctrl+Z` · `Ctrl+Shift+Z` or `Ctrl+Y` |
| Cut / copy / paste / duplicate | `Ctrl+X` · `Ctrl+C` · `Ctrl+V` · `Ctrl+D` |
| Select all / delete | `Ctrl+A` · `Del` |
| Add driver / chamber / waveguide / passive radiator / radiation | `D` `C` `W` `P` `R` |
| Drive level ±1 V, ±0.1 V | `Alt+↑ ↓` · `Alt+Shift+↑ ↓` |
| New / save / open project | `Ctrl+N` · `Ctrl+S` · `Ctrl+O` |
| Snapshot, masking, recompute | `Alt+S` · `Alt+M` · `Ctrl+Enter` |
| Settings, maximize panel, pop out panel | `Ctrl+,` · `Alt+Enter` · `Alt+O` |

Commands marked *editor* — the graph edits and the bare-letter add keys — fire
only while the Node Editor holds focus, which is what keeps single letters out
of the way of the Nonlinear Lab and the charts. No command fires while a text
field has focus.

Everything is rebindable under **Settings ▸ Keyboard**: click a shortcut to
record a replacement, `+` to give a command a second one. Assigning a combo
already in use takes it from the other command and says so. `Ctrl` and `⌘` are
the same modifier, so one default set fits both platforms, and bindings are
matched on the physical key so a layout change or a held Shift doesn't shift
their meaning.

Nodes added by keyboard land under the pointer when it is over the canvas,
cascading down-right if that spot is taken. Copy/paste works on a selection:
**Ctrl/⌘+click** adds a node to it, **Shift+drag** rubber-bands a group. Pasting
brings the edges that were wholly inside the selection, rewired to the copies.

## How it works

The connected graph is converted into a chain of complex 2×2 ABCD transfer
matrices in `[pressure; volume velocity]` state, solved at 512 log-spaced
frequencies (10–1000 Hz by default, adjustable). Parallel branches are
combined in shunt at junctions; multiple drivers are handled by superposition
with inactive drivers present as passive impedances.

### Node types

| Node | Model |
|---|---|
| **Driver** | Electro-mechano-acoustic source with full T/S set, semi-inductance Le·(jω)ⁿ, series/parallel arrays, and a T/S solver (datasheet, added-mass, known-box methods) plus a searchable [driver database](#driver-database) of 197 drivers (LocalStorage-extensible). |
| **Chamber** | Finite transmission line (area = Volume/Length) so longitudinal standing waves at n·c/2L appear as real response features. Stuffing slows sound and adds loss. |
| **Waveguide Segment** | Any duct/port/horn: conical, exponential, parabolic, hypex, tractrix≈, Le Cléac'h≈ profiles discretized into 24 exact-area slices. Straight port when S1 = S2. Per-node velocity readout on canvas with a click-through velocity chart and turbulence threshold. |
| **Passive Radiator** | Mechanical resonator in shunt with added-mass tuning and a Cms-from-Fs calculator. |
| **Radiation Termination** | Circular-piston radiation impedance (Bessel/Struve) into 4π/2π/π/π⁄2 space, rigid wall, or anechoic ρc termination. |

Each driver's excursion is tracked separately, and the scalar readouts (peak
excursion, X @ Fb, X @ F3, max power before Xmax) report whichever cone comes
closest to *its own* Xmax — not the sum of their travel, and not the first
driver's limit applied to all of them.

**Every node has an independent Q factor** (or lossless) applied as a complex
loss term — wall flexure on chambers, port turbulence on waveguides, surround
loss on passive radiators — which is the main thing Hornresp's single QL
cannot do.

### Driver database

197 drivers under **Tools ▸ Driver Database**, filterable by brand, Fs, Vas
and Xmax. Clicking a row fills the selected Driver node.

A record is flat for the thirteen core T/S values and nests everything else
under `ext`. That split is load-bearing: the solver reads Mms, Cms, Rms, Sd,
Re, Le and Bl and nothing more, so applying a database row can never smuggle
construction trivia into a node's parameters. Extended parameters are sparse
by design — B&C publish flux density and winding depth, most brands publish a
power rating and stop — so every one is optional, and the schema is declared
as data in `src/data/driver-fields.js` rather than hardcoded, which is what
lets the browser, the CSV export and the MCP tools stay correct as fields are
added. `driver_fields` hands an agent the same list.

| Source | Drivers | Meaning |
|---|---|---|
| `official` | 172 (B&C) | Generated from the manufacturer's own catalog export; full extended parameter set. |
| `datasheet` | 25 | Hand-transcribed from individual spec sheets; core T/S only. |

Catalog imports are generated, not edited. Drop the export in `data/catalogs/`,
add a column-mapping profile to `scripts/import-catalog.mjs`, and run
`npm run import:catalog <brand>` — a second manufacturer lands as data, not as
code. Cms and Rms are *derived* from the published Fs, Mms and Qms rather than
transcribed, so the modeled driver resonates at exactly the frequency and
mechanical Q its datasheet claims; every other value is copied verbatim.

`npm run test:drivers` checks the library: schema conformance, the identities
the importer is responsible for, and a consistency audit. A T/S set is
over-determined, so a row's published Qes, Qts and Vas can be checked against
the Bl, Re, Mms and Cms the solver actually runs on. Rows that fail carry a
`suspect` label, shown as ⚠ in the browser, and the test asserts every failing
row is labelled — the count cannot grow unnoticed. 3 of the 172 catalog rows
are flagged; 18 of the 25 hand-transcribed ones are, which is the honest
measure of the difference between the two sources.

### Outputs

Nine plots, each its own dockable panel: SPL with per-radiator overlays,
electrical impedance + phase, cone excursion vs Xmax (one trace per driver,
in mm or as a percentage of each driver's own Xmax), port velocity, interior
SPL from in-chamber probes, radiated acoustic power, efficiency, electrical
power, and phase & group delay. Every one keeps its own zoom and Y-scale mode.
The scalar figures that summarize them live in the quick bar, visible whatever
panel you are looking at.

### Tools

- **Amplifier solver**: Voltage/Impedance/Power linked by P = V²/Z, at the top of the Parameters panel; the quick bar's drive box sets the same voltage.
- **Snapshots**: freeze up to three results as labeled reference overlays.
- **Resonance masking**: switch chambers to lumped compliances to hide standing-wave artifacts.
- **Projects**: auto-save to LocalStorage, restore prompt, project manager with thumbnails, JSON file export/import with schema versioning.
- **Export**: CSV of all series, PNG schematic of the canvas, plain-text metrics summary.

## MCP server (AI agent access)

The simulation engine is also exposed as an [MCP](https://modelcontextprotocol.io)
server so AI assistants can search drivers, build and calibrate enclosures,
simulate, optimize against goals, and compare designs directly — see
[`mcp/README.md`](mcp/README.md). Run it locally over stdio (`npm run mcp`,
for Claude Desktop/Code) or as a hosted HTTP connector for claude.ai/ChatGPT
(`npm run mcp:http`, also Dockerized). `npm run test:mcp`,
`npm run test:http` and `npm run test:drivers` run the checks.

## Stack

React 18, React Flow 11, Zustand, math.js (complex arithmetic), Recharts,
React Hook Form, Vite.

## Caveats

Driver T/S values sourced `datasheet` are hand transcriptions and are
approximate — the ⚠ label marks the ones known to contradict themselves.
Prefer `official` rows. Tractrix and Le Cléac'h flares are approximated by
hypex area profiles. The model is lumped/1-D (plane-wave): higher-order cross modes and
diffraction are out of scope.

Drivers that feed the *same* port — two woofers whose rears enter one chamber —
are superposed but do not currently load each other, so each sees the full
enclosure rather than its share of it; the affected nodes carry a warning in
the app. For identical drivers on one enclosure, use the driver node's array
count instead, which models the shared loading correctly.
