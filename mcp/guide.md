# AcouSim modeling guide (for AI agents)

AcouSim simulates loudspeaker enclosures as free-form acoustic circuits using
transfer (ABCD) matrices — Hornresp-class physics without the fixed topology.
A **project** is plain JSON; the same format the visual editor saves as
`.acousim.json`, so anything you build here opens in the app unchanged.

## Project format

```json
{
  "app": "AcouSim", "schemaVersion": 1, "name": "My box",
  "settings": { "fmin": 10, "fmax": 200, "npts": 256, "voltage": 28.3, "rg": 0 },
  "nodes": [
    { "id": "d1", "type": "driver",    "params": { "...": "..." } },
    { "id": "c1", "type": "chamber",   "params": { "volume": 50 } },
    { "id": "p1", "type": "waveguide", "params": { "S1": 100, "S2": 100, "length": 40 } },
    { "id": "r1", "type": "radiation", "params": { "space": "half" } }
  ],
  "edges": [
    { "source": "d1", "sourceHandle": "rear",  "target": "c1", "targetHandle": "in" },
    { "source": "c1", "sourceHandle": "out",   "target": "p1", "targetHandle": "throat" }
  ]
}
```

`position` is optional (editor layout only). Every param has a sensible
default; specify only what matters.

## Node types, handles, params (display units)

### driver — electrodynamic driver (source)
Handles: `front` (out), `rear` (out). Both may fan out; unconnected side
radiates into half space by default.
Params: `Fs` Hz, `Qes`, `Qms`, `Vas` L, `Re` Ω, `Bl` T·m, `Mms` g, `Cms` mm/N,
`Rms` kg/s, `Sd` cm², `Le` mH, `LeExp` (semi-inductance exponent 0.5–1),
`Xmax` mm, `count` (drivers in this node), `wiring` `single|series|parallel|series-parallel`,
`label`.

### chamber — lumped/TL volume
Handles: `in` (in), `out` (out). A chamber with only `in` connected is a
sealed volume. Params: `volume` L, `length` cm (acoustic path, sets TL modes),
`stuffing` 0–1, `Q`, `label`.

### waveguide — port, duct, horn segment
Handles: `throat` (in), `mouth` (out). Params: `S1` throat area cm², `S2`
mouth area cm², `length` cm, `flare` `conical|exponential|parabolic|hypex`,
`ecFactor` end correction (0.732 typical two-flanged), `Q`, `label`.
**An unconnected mouth is an OPEN end radiating into the listening space**
(that's how you make a vented port). To close an end, terminate it with a
`radiation` node set to `space: "rigid"`.

### pr — passive radiator
Handle: `in`. Params: `Mmd` g, `Cms` mm/N, `Rms`, `Sd` cm², `addedMass` g,
`space` (radiating space), `label`.

### radiation — termination
Handle: `in`. Params: `space` = `free|half|quarter|eighth` (4π/2π/π/π/2),
`rigid` (closed wall), or `anechoic` (perfectly absorbing ρc termination).

## Topology semantics (the part people get wrong)

- **Branches fan OUT from output ports.** Two edges leaving `d1:rear` put two
  loads acoustically in parallel at the driver's rear.
- **Multiple edges INTO one input port do not form a junction.** Driven paths
  are superposed but do not load each other. To add a passive side branch
  (e.g. a closed stub), branch it from an output port instead.
- Series chain = driver → chamber → waveguide → … Each element's output feeds
  the next element's input.
- Sealed box: driver rear → chamber (nothing else). Ported: driver rear →
  chamber → waveguide with open mouth. 4th-order bandpass: driver front →
  chamber → port; driver rear → sealed chamber. Cabin/room: model it as big
  chambers + waveguides (door openings, trunk pass-through) ending in a
  `radiation` node.

## Settings

`fmin`/`fmax` Hz, `npts` (log-spaced, ≤1024), `voltage` V RMS at amp
(`power` W and `impedance` Ω are UI conveniences; the solver uses voltage),
`rg` source resistance Ω, `masking` (lump chambers), `nlEnabled` + per-driver
`params.nl` curves (experimental large-signal mode).

## Interpreting results

- SPL is at 1 m, 2π unless nodes say otherwise; `splCombined` sums all
  radiators coherently.
- **Port air velocity**: keep peak below ~17 m/s (5% of c) at max power for
  low chuffing; 25–30 m/s audible.
- **Excursion** is mm peak, compare with driver `Xmax`. `maxPower` metric =
  power at which excursion first hits Xmax.
- Ported boxes show two impedance peaks; `fb` = the minimum between them.
  Sealed boxes show one peak (`fc`) and a `qtc`.
- Velocity/SPL scale linearly with voltage; power with voltage².

## Higher-level tools

You rarely need to hand-write project JSON from scratch:

- `driver_search` — browse the built-in T/S library; pass a result as
  `driver: { db: "UM18", count: 2, wiring: "parallel" }` to a builder.
- `build_enclosure` — sealed / ported / bandpass4 / bandpass6 topologies with
  correct wiring. Ported and bandpass4 auto-calibrate port length against the
  *simulated* tuning. Take the returned project and edit it freely.
- `optimize` — bounded search over up to 3 parameters for min_f3 / max_spl /
  flat, with Xmax and port-velocity constraints. Prefer it over manual
  iteration.
- `compare` — metrics for several candidate designs side by side.

## Workflow tips

1. `validate` first — warnings explain topology mistakes in words.
2. `simulate` with default detail for metrics + coarse curves; use
   `get_curve` for a finer look at one quantity.
3. Use `sweep_parameter` for tuning (port length, box volume, voltage) —
   it is far cheaper than calling `simulate` in a loop.
4. Typical car-audio goals: F3 low, flat passband, port velocity < 17 m/s at
   rated power, excursion ≤ Xmax across passband at rated power.
