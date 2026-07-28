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
all under **⚙ Settings → Account** in the app. Copy `.env.example` to `.env`:
`BETTER_AUTH_SECRET` is required in production, each social provider appears
automatically once its OAuth credentials are set, and password-reset email
uses SMTP (without it, reset links print to the server log).

## Workspace

Commands live in the menu bar — **File**, **Edit**, **View**, **Simulate**,
**Tools**, **Help** — with a thin quick-access strip beneath it for the
controls you touch while iterating (project name, undo/redo, sweep range,
resonance masking, snapshots).

The area below is a dock. Five panels — Palette, Node Editor, Parameters,
Results, Nonlinear Lab — live in tabbed groups:

| Action | How |
|---|---|
| Move a panel | Drag its tab; the target group highlights the half it will occupy, or its centre to tab in |
| Dock against the window edge | Drag a tab onto the outer strip of the workspace |
| Reorder tabs | Drag a tab onto another tab in the same group |
| Resize | Drag the gap between two groups |
| Maximize / restore | Double-click a tab, or use the ⛶ button |
| Show / hide a panel | **View ▸** — a check mark marks the open ones |
| Restore the default | **View ▸ Reset Layout** |
| Reusable arrangements | **View ▸ Save Layout As…**, then **Apply Saved Layout ▸** |

The layout and any saved arrangements persist in LocalStorage. Settings is not
a panel: **Tools ▸ Settings…** (or the ⚙ button) opens it as a floating window
centred on screen that can be dragged by its title bar and closed with Escape.

## How it works

The connected graph is converted into a chain of complex 2×2 ABCD transfer
matrices in `[pressure; volume velocity]` state, solved at 512 log-spaced
frequencies (10–1000 Hz by default, adjustable). Parallel branches are
combined in shunt at junctions; multiple drivers are handled by superposition
with inactive drivers present as passive impedances.

### Node types

| Node | Model |
|---|---|
| **Driver** | Electro-mechano-acoustic source with full T/S set, semi-inductance Le·(jω)ⁿ, series/parallel arrays, and a T/S solver (datasheet, added-mass, known-box methods) plus a searchable driver database (LocalStorage-extensible). |
| **Chamber** | Finite transmission line (area = Volume/Length) so longitudinal standing waves at n·c/2L appear as real response features. Stuffing slows sound and adds loss. |
| **Waveguide Segment** | Any duct/port/horn: conical, exponential, parabolic, hypex, tractrix≈, Le Cléac'h≈ profiles discretized into 24 exact-area slices. Straight port when S1 = S2. Per-node velocity readout on canvas with a click-through velocity chart and turbulence threshold. |
| **Passive Radiator** | Mechanical resonator in shunt with added-mass tuning and a Cms-from-Fs calculator. |
| **Radiation Termination** | Circular-piston radiation impedance (Bessel/Struve) into 4π/2π/π/π⁄2 space, rigid wall, or anechoic ρc termination. |

**Every node has an independent Q factor** (or lossless) applied as a complex
loss term — wall flexure on chambers, port turbulence on waveguides, surround
loss on passive radiators — which is the main thing Hornresp's single QL
cannot do.

### Outputs

The Results panel carries nine plots (SPL with per-radiator overlays,
electrical impedance + phase, cone excursion vs Xmax, port velocity, interior
SPL from in-chamber probes, radiated acoustic power, efficiency, electrical
power, phase & group delay) above which a live metrics strip shows F3/F10, Fb,
Qtc, impedance peaks, peak SPL, excursion ratios, −3 dB bandwidth, total
internal volume, and the maximum input power before Xmax is exceeded.

### Tools

- **Amplifier solver**: Voltage/Impedance/Power linked by P = V²/Z, at the top of the Parameters panel.
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
(`npm run mcp:http`, also Dockerized). `npm run test:mcp` and
`npm run test:http` run the smoke tests.

## Stack

React 18, React Flow 11, Zustand, math.js (complex arithmetic), Recharts,
React Hook Form, Vite.

## Caveats

Built-in driver T/S values are transcribed from public spec sheets and are
approximate. Tractrix and Le Cléac'h flares are approximated by hypex area
profiles. The model is lumped/1-D (plane-wave): higher-order cross modes and
diffraction are out of scope.
