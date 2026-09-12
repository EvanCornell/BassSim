# Engine contract

Status: **proposal.** Nothing in `src/` implements this yet.

This is the artifact everything else is downstream of. The UI, the surfaces, the
platform and the second engine are all consumers of what is defined here, and
each of them can be revised freely as long as this holds. That is the point of
writing it first.

A contract has to pin five things. Anything it leaves open, two implementations
will answer differently:

1. **Shape** — what fields exist, which are required, what types they carry
2. **Units** — explicit, at the boundary, never implied by a field name
3. **Semantics** — what a value *means*, including edge cases and defaults
4. **Errors** — how failure is reported, in a form a program can act on
5. **Versioning** — how it changes without breaking existing callers or caches

---

## 1. Invariants

These hold for every engine and every analysis. They are the rules a conformance
suite tests directly.

**Deterministic.** The same `(Model, AnalysisSpec)` produces bit-identical
`Results`. No wall-clock, no RNG without a seed in the spec, no iteration over
unordered maps, no ambient configuration. This is not a purity preference — the
content-hash result cache (`ARCHITECTURE.md` §6.4) is unsound without it, and so
is the cross-language golden-fixture suite.

**SI at the boundary, always.** See §3.4. The engine never sees a centimetre.

**The engine declares; the caller never guesses.** Supported node types,
supported analyses, parameter ranges, and cost all come from the engine
(§6). A surface that hardcodes "the time-domain engine can't do passive
radiators" is a bug waiting for the day that stops being true.

**Additive evolution.** New optional fields with defaults, never renamed or
repurposed ones. See §8.

**Structured errors.** Typed codes with machine-readable parameters, not prose
(§5.4).

**No display concerns cross the boundary.** If changing a field cannot change a
number the solver computes, it does not belong in the engine input. This is what
makes "display transforms never invalidate results" (`ARCHITECTURE.md` §5.2)
enforceable rather than aspirational.

---

## 2. What is wrong with the boundary today

Concrete, because each of these is a specific fix rather than a general
aspiration.

**Ports exist only in a comment.** The handle vocabulary — `driver.front`,
`chamber.in`, `waveguide.throat` — is documented in a block comment at the top
of `solver.js` and enforced nowhere. It must be data.

**`DEFAULT_PARAMS` is doing a job it cannot do.** Its own docstring says it
"doubles as the schema," and it is the closest thing to a registry that exists.
But it carries only default *values* — no units, no valid ranges, no port
declarations, no statement of which engines support which type.

**Display units at the boundary.** Params arrive as cm², grams, mm/N, mH, mm,
and `driverSI` converts inside the solver. A C++ engine would have to reimplement
that conversion, which is a pure drift risk for zero benefit — unit-conversion
bugs are silent and produce plausible-looking numbers.

**`settings` mixes solver input with display preferences.** `DEFAULT_SETTINGS`
contains `vThreshold`, `masking`, `unwrapPhase` and `delayOffset`, none of which
change any computed value, alongside `fmin`/`fmax`/`npts`/`voltage`/`rg`, which
do. It also carries `impedance` and `power`, which are UI conveniences derived
from `voltage` — the docstring notes the solver reads only `voltage`.

Because the whole object is POSTed to `/api/simulate`, **toggling phase
unwrapping currently re-runs the solver.** That is the §5.2 rule being violated
today, and the split below fixes it structurally.

**`computeMetrics` needs a node parameter injected into settings.**
`server/index.js` calls it as `computeMetrics(results, { ...settings, xmax:
xmaxNode?.data.params.Xmax })`, reaching into a node to patch the settings
object, and picking an arbitrary driver when there are several. Metrics should
read `xmaxByDriver`, which the results already carry.

**Errors are prose strings.** `hydrateProject` throws with a
`projectErrors: string[]`, and validation returns `{errors: string[], warnings:
{[nodeId]: string[]}}`. Human-readable, but a caller cannot branch on them, they
cannot be localised, and their wording is effectively frozen because consumers
will pattern-match it.

**No version negotiation.** `SCHEMA_VERSION = 1` exists but is not transmitted,
checked, or acted on.

---

## 3. Model — input

The physical description. Contains no analysis parameters and no display state.

Notation below is TypeScript-ish for compactness. The normative definition is
JSON Schema (§9).

### 3.1 Envelope

```ts
type Model = {
  schemaVersion: number          // integer, currently 1
  id?: string                    // stable identity for caching and sharing
  nodes: Node[]
  edges: Edge[]
}

type Node = {
  id: string                     // unique within the model
  type: NodeTypeId               // must exist in the registry
  params: Record<string, number | string | boolean | null>
  placement?: Placement          // §3.5, required only for far-field
  meta?: { label?: string, position?: { x: number, y: number } }
}

type Edge = {
  id: string
  from: { node: string, port: string }   // must be an output port
  to:   { node: string, port: string }   // must be an input port
}
```

Two changes from today worth calling out. `label` and canvas `position` move
into `meta` — they are annotations, not physics, and a change to either must not
invalidate a cached result. And edges become `{from, to}` with explicit port
objects rather than the flat `source`/`sourceHandle`/`target`/`targetHandle`
quadruple, which does not express that the pair is a unit.

### 3.2 Node type registry

The registry is data, owned by `@acousim/model`, and is the *only* place a node
type is defined. Each entry declares:

```ts
type NodeType = {
  id: string
  ports: { id: string, direction: 'in' | 'out', role: string }[]
  params: ParamSpec[]
  engines: string[]              // which engines support this type
}

type ParamSpec = {
  id: string
  unit: Unit                     // SI unit at the boundary; see §3.4
  displayUnit?: Unit             // what the UI and file format use
  default: number | string | boolean
  min?: number
  max?: number
  enum?: string[]
  description: string
}
```

Current vocabulary, transcribed from `DEFAULT_PARAMS` and the `solver.js` port
comment:

| Type | Ports | Parameters (display unit → SI) |
|---|---|---|
| `driver` | `front` (out), `rear` (out) | `Fs` Hz, `Qts`, `Qes`, `Qms`, `Vas` L→m³, `Re` Ω, `Bl` T·m, `Mms` g→kg, `Cms` mm/N→m/N, `Sd` cm²→m², `Le` mH→H, `LeExp`, `Xmax` mm→m, `Rms` N·s/m, `count`, `wiring` ∈ {single, series, parallel, series-parallel}, `Q` |
| `chamber` | `in` (in), `out` (out) | `volume` L→m³, `length` cm→m, `shape` ∈ {rectangular, …}, `stuffing`, `Q`, `probe`, `probePos` |
| `waveguide` | `throat` (in), `mouth` (out) | `S1` cm²→m², `S2` cm²→m², `length` cm→m, `flare` ∈ {conical, …}, `ecFactor` (multiplier on the junction-derived end correction, 1 = neutral), `space` (solid angle for an unconnected mouth), `Q` |
| `pr` | `in` (in) | `Mmd` g→kg, `Cms` mm/N→m/N, `Rms` N·s/m, `Sd` cm²→m², `addedMass` g→kg, `space`, `Q` |
| `radiation` | `in` (in) | `space` ∈ {full, half, …} |

Two normalisations while transcribing:

- **`lossless` disappears.** Today `lossless: boolean` and `Q: number` say the
  same thing two ways, collapsed by `normQ`. The contract has one field:
  `Q: number | null`, where `null` means lossless. Two representations of one
  state is a bug source, and `Q: 0` read literally divides by zero.
- **`chamber.probe` is a measurement request, not a property of the box.**
  `probePos` is genuinely physical (a location), but *whether to compute
  interior SPL there* is an analysis decision. Keep the position in the model,
  move the enable flag to `AnalysisSpec.outputs`.

### 3.3 Port semantics

Directional: an output connects to an input. These rules are currently enforced
in prose and warnings; they belong in the contract.

- An unconnected **output** is not an error. An open waveguide mouth radiates; a
  chamber with nothing on its outlet is sealed.
- An unconnected **input** is a warning, not an error.
- **Multiple edges into one input do not form an acoustic junction.** The solver
  superposes driven sources without letting them load each other, and silently
  ignores passive side branches. This is a real modelling limitation, currently
  surfaced as a warning string — it needs a stable diagnostic code (§5.4)
  because callers may want to refuse to run rather than trust the result.

### 3.4 Units

**The engine boundary is SI. Without exception.**

The project file and the UI keep display units — litres and millimetres are what
users think in, and a hand-written `.acousim.json` should stay readable. But
conversion happens exactly once, in `@acousim/model`, on the way in.

The reason is drift. `driverSI` currently converts inside the solver; a C++
engine would need its own copy, and a discrepancy between the two produces
numbers that are wrong but entirely plausible. Converting once, above both
engines, removes the possibility.

Every `ParamSpec` carries its SI `unit` explicitly. No unit is ever implied by a
field name.

### 3.5 Placement

Required only by far-field analysis; ignored by the others. Defining it now is
cheap, and retrofitting it costs a migration of every stored project.

```ts
type Placement = {
  position: { x: number, y: number, z: number }   // metres
  normal:   { x: number, y: number, z: number }   // radiating direction
  aperture: { shape: 'circular', radius: number }
          | { shape: 'rectangular', width: number, height: number }
          | { shape: 'slot', width: number, height: number }
}
```

---

## 4. AnalysisSpec — input

What to compute. Separate from the model because the same model is analysed many
ways, and because the cache key needs them distinct.

```ts
type AnalysisSpec =
  | FrequencySweepSpec
  | TimeDomainSpec
  | FarFieldSpec

type CommonSpec = {
  specVersion: number
  drive: { voltage: number, sourceResistance: number }   // V, Ω  (was rg)
  environment?: {
    temperature: number      // K
    pressure: number         // Pa
  }
  outputs?: string[]         // opt-in extras, e.g. ['interiorSPL', 'perOutlet']
}
```

`drive` replaces the `voltage`/`impedance`/`power` trio: the latter two are
derived views for the UI and never reach the engine.

### 4.1 Frequency sweep

```ts
type FrequencySweepSpec = CommonSpec & {
  kind: 'frequency-sweep'
  fmin: number               // Hz
  fmax: number               // Hz
  points: number             // was npts
  spacing: 'log' | 'linear'  // implicit today; make it explicit
  largeSignal?: {            // was nlEnabled
    enabled: boolean
    // quasi-linear cycle-averaged path; see src/engine/nonlinear.js
  }
}
```

Note what is *absent*: `vThreshold`, `masking`, `unwrapPhase`, `delayOffset`,
`impedance`, `power`. All are display state and stay client-side.

### 4.2 Time domain

```ts
type TimeDomainSpec = CommonSpec & {
  kind: 'time-domain'
  stimulus:
    | { type: 'sine', frequency: number, amplitude: number }
    | { type: 'sweep', fmin: number, fmax: number, duration: number }
    | { type: 'noise', kind: 'pink' | 'white', seed: number }
    | { type: 'signal', ref: string }        // content-addressed audio
  duration: number           // s
  settling?: number          // s discarded before metrics accumulate
  sampleRate: number         // Hz, base rate for linear elements
  oversampling: number       // integer factor for the nonlinear core
  initialThermal: {          // §4.4
    coilTemperature: number  // K
  } | { preconditionSeconds: number }
  metricSet: string          // id + version; see analysis-metrics.md
  reference: 'linear-cold' | 'none'   // paired run; see below
}
```

**`reference` is not optional in practice.** Compression and distortion are both
defined against a linear cold reference, so the pairing is part of the job
rather than something the engine improvises. `'none'` exists for a bare
simulation with no comparative metrics.

**`initialThermal` is mandatory and has no default.** Starting cold and starting
pre-heated give materially different compression figures, and neither is wrong.
An engine default here makes results irreproducible and will be reported as a
bug.

### 4.3 Far field

```ts
type FarFieldSpec = CommonSpec & {
  kind: 'far-field'
  frequencies: number[]      // Hz
  angles: { azimuth: number[], elevation: number[] }   // degrees
  distance: number           // m
  method: 'rayleigh'         // named explicitly — see ARCHITECTURE.md §7
}
```

`method` is in the contract from the start because the honest first
implementation is a Rayleigh integral over aperture geometry, which is good for
flat-baffle direct radiators and approximate for horns. Callers need to know
which approximation produced a number.

---

## 5. Results — output

### 5.1 Common header

Every variant carries the same header. This is what makes results cacheable,
attributable, and safe to store indefinitely.

```ts
type ResultHeader = {
  resultVersion: number
  kind: 'frequency-sweep' | 'time-domain' | 'far-field'
  status: 'ok' | 'failed'
  engine:  { id: string, version: string }
  inputs:  { modelHash: string, specHash: string, metricSetVersion?: string }
  timing:  { coreSeconds: number, wallSeconds: number }
  diagnostics: Diagnostic[]        // §5.4
}
```

`inputs` is the cache key material, carried in the result so a stored result can
always be traced to what produced it.

### 5.2 Frequency sweep

```ts
type FrequencySweepResult = ResultHeader & {
  frequencies: number[]                  // Hz

  perOutlet: {                           // see below
    [outletId: string]: {
      pressure:       Complex[]          // Pa, at reference distance
      volumeVelocity: Complex[]          // m³/s
    }
  }
  combined: { pressure: Complex[] }      // coherent sum

  input:      { impedance: Complex[] }   // Ω  (was zinMag/zinPhase)
  power:      { real: number[], apparent: number[] }   // W, VA
  excursion:  { [driverId: string]: number[] }         // m (SI, was mm)
  xmax:       { [driverId: string]: number }           // m
  velocity:   { [waveguideId: string]: number[] }      // m/s
  interiorSPL?: { [chamberId: string]: number[] }      // opt-in via outputs
  derived?:   DerivedMetrics                           // §5.5
}
```

**`perOutlet` complex data is the single most important change here.**
`runSimulation` currently collapses every radiating outlet into `splCombined`, a
complex sum, and that collapse is why a bare driver reads as −146 dB and looked
like a bug during the contract audit. The far-field tool needs exactly what is
being discarded, and the solver already computes it internally.

Note also that SPL in dB is *derived*. The primitive is complex pressure;
`20·log10(|p|/20µPa)` is a view. Storing the primitive keeps phase, which
far-field and outlet-summing both need.

### 5.3 Time domain

Shapes only — the metric definitions live in
[`analysis-metrics.md`](./analysis-metrics.md) and are explicitly tunable.

```ts
type TimeDomainResult = ResultHeader & {
  bands: { centre: number, low: number, high: number }[]   // Hz
  frames: { times: number[] }                              // s

  perBandFrame: {              // [band][frame] matrices
    rmsPower:    Float32Array
    peakPower:   Float32Array
    crestFactor: Float32Array
    compression: Float32Array  // fitted gain g vs linear reference
    distortion:  Float32Array  // residual after removing g
  }

  exceedance: {                // O(1) in duration
    thresholds: number[]
    levels: number[]
    timeAbove: Float32Array    // [band][level][threshold], seconds
  }

  attribution: {               // per-mechanism, single run
    mechanisms: string[]       // e.g. ['Bl', 'Kms', 'Le', 'port', 'thermal']
    energy: Float32Array       // [band][mechanism]
  }

  aggregates: {                // scalars, renderable without the matrices
    rmsPower: number, peakPower: number
    worstHeadroomDb: number
    peakExcursion: number, finalCoilTemperature: number
    excursionHistogram: { edges: number[], counts: number[] }
  }
}
```

`aggregates` is deliberately a separate top-level block so a UI can render a
verdict without parsing any matrix.

### 5.4 Diagnostics

Replaces the current prose strings. One list, typed, with severity, so a caller
can branch, localise, and decide whether to proceed.

```ts
type Diagnostic = {
  code: string                 // stable, e.g. 'MULTI_FED_INPUT_PORT'
  severity: 'error' | 'warning' | 'info'
  target?: { node?: string, edge?: string, port?: string, param?: string }
  params?: Record<string, unknown>   // structured detail for the message
  message: string              // English fallback; never pattern-matched
}
```

Codes needed on day one, from the existing validation:

`NO_DRIVER`, `UNKNOWN_NODE_TYPE`, `MISSING_NODE_ID`, `EDGE_ENDPOINT_MISSING`,
`INPUT_PORT_UNCONNECTED`, `OUTPUT_PORT_UNCONNECTED`, `MULTI_FED_INPUT_PORT`,
`PARAM_OUT_OF_RANGE`, `UNSUPPORTED_NODE_TYPE_FOR_ENGINE`,
`UNSUPPORTED_ANALYSIS`.

`status: 'failed'` means no numbers were produced. Warnings accompany a
successful result and must not suppress it.

### 5.5 Derived metrics

`F3`, `F10`, passband, `Qtc`, `Fb`, impedance peaks, excursion-limited power and
the rest are **derived from results, not produced by the solver**. They belong in
a separate pure function over `Results`, versioned with the metric set.

Two things this fixes: `computeMetrics` currently needs `xmax` patched into
`settings` from an arbitrary driver node, and it silently picks one when several
exist. Reading `xmax` from the result removes both problems.

---

## 6. Capabilities and cost

```ts
type EngineDescriptor = {
  id: string
  version: string
  supports: {
    nodeTypes: string[]
    analyses: ('frequency-sweep' | 'time-domain' | 'far-field')[]
    modelSchemaVersions: number[]
  }
  estimateCost(model: Model, spec: AnalysisSpec): {
    coreSeconds: number
    confidence: 'exact' | 'estimated'
  }
}
```

Runtime here is essentially deterministic — state count × sample rate × sweep
points × settling time — so one cheap function serves pre-run UX, scheduler
admission control, quota accounting and tier gating at once.

---

## 7. Determinism and caching

The cache key is:

```
hash(modelHash, specHash, engineId, engineVersion, metricSetVersion)
```

For this to be sound, every one of these must hold:

- Serialisation is **canonical** — sorted keys, fixed float formatting. Two
  models that are semantically equal must hash equal.
- `meta` (labels, canvas positions) is **excluded** from `modelHash`. Renaming a
  node must not invalidate a result.
- Display state never enters `specHash`, because it never enters the spec at all
  (§4.1).
- Floating-point results are reproducible for a given engine version. Any change
  to numerics — including a compiler flag that alters FP behaviour — is a
  version bump.

`metricSetVersion` in the key is what makes the metric set safely tunable:
revising it never returns stale results and never requires a backfill.

---

## 8. Versioning

Four independent version numbers, because they change at different rates:

| Version | Bumped when | Consequence |
|---|---|---|
| `schemaVersion` (Model) | The project format changes | Forward migration required, permanently |
| `specVersion` | An analysis gains or changes a field | Old specs still accepted |
| `resultVersion` | The result shape changes | Old cached results remain readable |
| `metricSetVersion` | Any metric is added or redefined | Cache misses, recompute on demand |

Rules:

- **Additive only.** New fields are optional with documented defaults. Never
  rename, never repurpose, never tighten a type.
- **Forward migrations are permanent.** Every `schemaVersion` ever shipped keeps
  a migration path. Cloud storage makes this non-negotiable — you cannot ask
  users to re-save projects you are holding for them.
- **Engines declare which model versions they accept.** A mismatch is
  `UNSUPPORTED_SCHEMA_VERSION`, not a crash and not a silent best-effort parse.

---

## 9. Serialisation — open decision

Model and spec are kilobytes; time-domain results are megabytes of float
matrices. One format does not serve both well.

**Recommendation:** JSON Schema as the single normative definition, generating
zod validators for JavaScript and structs for C++. Wire format is JSON for
`Model` and `AnalysisSpec` — human-editable, MCP-friendly, and it keeps
`.acousim.json` a file people can hand-write — and **CBOR** for `Results`, which
has native typed arrays (RFC 8746) and avoids the ~3× bloat and slow parse of
float matrices in JSON.

**Alternative:** Protobuf or FlatBuffers as source of truth. Better C++
ergonomics and a tighter binary format, at the cost of making the project file
opaque and the MCP surface harder to hand-write. Worth choosing deliberately —
switching later is a migration of every stored project.

Whichever is chosen, the schema is generated from one source, never
hand-maintained in two languages.

---

## 10. What the conformance suite must cover

The suite is written from this document alone, without reading either
implementation — the existing `blind-contract-tester` agent already does exactly
this, pointed at method contracts rather than a package boundary.

1. **Round-trip** — every valid model serialises, deserialises and hashes
   identically.
2. **Determinism** — identical inputs produce bit-identical outputs, across
   repeated runs and across processes.
3. **Cross-language agreement** — both engines match the Tier 0 golden fixtures
   for radiation impedance, Bessel/Struve, air constants and end corrections.
4. **Unit correctness** — a model expressed in display units and its SI
   equivalent produce identical results.
5. **Cache-key soundness** — changing `meta` does not change `modelHash`;
   changing any physical parameter does.
6. **Diagnostics** — every code in §5.4 is reachable, and warnings never
   suppress a result.
7. **Version negotiation** — an unsupported `schemaVersion` yields the right
   diagnostic rather than a crash or a silent misparse.
8. **Capability honesty** — an engine refuses analyses and node types it does
   not declare, rather than producing plausible wrong numbers.

Item 8 is the one most likely to be skipped and most likely to cause a
hard-to-trace bug later.

---

## 11. Sequencing note

This document replaces "define the results envelope" as the centre of Phase 0
(`ARCHITECTURE.md` §8). The order that follows from it:

1. Node registry and `Model` in `@acousim/model`, with SI normalisation
2. `AnalysisSpec`, splitting display state out of `settings`
3. `Results` with `perOutlet` complex data and typed diagnostics
4. Conformance suite from §10
5. Existing frequency-domain engine adapted to the contract, unchanged
   numerically — the golden fixtures prove it

Only then is the C++ engine a matter of implementing a known interface rather
than negotiating one.
