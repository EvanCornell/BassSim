# AcouSim — Node-Based Acoustic Circuit Simulator

AcouSim simulates loudspeaker enclosure behavior with a free-form visual node
graph instead of preset enclosure types. Drag acoustic elements onto an
infinite canvas, wire their ports together, and every plot updates live: any
topology — sealed, ported, bandpass, tapped horn, passive radiator, or a car
cabin modeled as a lossy chamber — is built from the same five elements.

## Run it

```bash
npm install
npm run dev     # http://localhost:5173
npm run build   # production bundle in dist/
```

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

Six plot tabs (SPL with per-radiator overlays, electrical impedance + phase,
cone excursion vs Xmax, port velocity, radiated acoustic power, phase & group
delay) above which a live metrics strip shows F3/F10, Fb, Qtc, impedance
peaks, peak SPL, excursion ratios, −3 dB bandwidth, and the maximum input
power before Xmax is exceeded.

### Tools

- **Amplifier solver**: Voltage/Impedance/Power linked by P = V²/Z, always visible.
- **Snapshots**: freeze up to three results as labeled reference overlays.
- **Resonance masking**: switch chambers to lumped compliances to hide standing-wave artifacts.
- **Projects**: auto-save to LocalStorage, restore prompt, project manager with thumbnails, JSON file export/import with schema versioning.
- **Export**: CSV of all series, PNG schematic of the canvas, plain-text metrics summary.

## MCP server (AI agent access)

The simulation engine is also exposed as an [MCP](https://modelcontextprotocol.io)
server so AI assistants can model enclosures, simulate, and tune designs
directly — see [`mcp/README.md`](mcp/README.md). `npm run mcp` starts it;
`npm run test:mcp` runs the smoke tests.

## Stack

React 18, React Flow 11, Zustand, math.js (complex arithmetic), Recharts,
React Hook Form, Vite.

## Caveats

Built-in driver T/S values are transcribed from public spec sheets and are
approximate. Tractrix and Le Cléac'h flares are approximated by hypex area
profiles. The model is lumped/1-D (plane-wave): higher-order cross modes and
diffraction are out of scope.
