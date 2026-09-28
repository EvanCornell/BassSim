# SpeakerSpice architecture

Status: **proposal, not yet implemented.** This document exists to be argued
with. Nothing in `src/` has moved.

It plans for a suite of independently-developed tools sharing one acoustic
model — a free frequency-domain simulator, a paid time-domain engine, a 3D
enclosure designer, a baffle and far-field tool, and a music-playback analyser
— deployed as a commercial product with cloud storage and project sharing.

The organising requirement is not a feature. It is this: **a change to one
component must not require reasoning about any other.** Every rule below exists
to serve that.

---

## 1. Where the project actually stands

Worth stating precisely, because the starting position is better than it looks.

**The engine boundary already exists.** `server/index.js` is explicit: *"The
engine runs ONLY here — the browser bundle contains no solver code."* The client
POSTs a project to `/api/simulate` and receives results. That is exactly the
split this document is asked to design.

**What is missing is not the split. It is the contract across it.**
`handleSimulate` accepts a parameter documented only as *"a serialized
project"* and passes it to `hydrateProject`. There is no schema, no version, no
negotiation, and no conformance suite. `/mcp` is a second consumer of the same
undocumented vocabulary and can drift from the first without anything noticing.

So the work is not "separate the components." It is **make the seams real.**

**The physics core is sound and well factored.** `src/engine/` has a clean
dependency order — `complex → geometry/acoustics → solver → metrics` — with no
cycles and no UI leakage. It is the asset to protect.

**The one structural defect that blocks everything.** There is no node-type
registry. A node type is a bare string scattered across the tree:

| Type | Files hardcoding it |
|---|---|
| `driver` | 11 |
| `chamber`, `waveguide` | 7 each |
| `radiation` | 5 |
| `pr` | 4 |

`solver.js` alone dispatches on `node.type` in **six separate if/else chains**
across four functions. Every new node type needs six correct branches and nine
file edits, with nothing to tell you what you missed.

This matters more than it appears, because almost every planned tool is a new
way of authoring node types. The 3D designer, the baffle builder and the
time-domain engine all multiply this tax rather than paying it once.

---

## 2. The layering

Five tiers. **Dependencies point downward only, without exception.**

```
┌─────────────────────────────────────────────────────┐
│  Tier 4  PLATFORM                                    │
│  identity · project storage · sharing · entitlement  │
│  job queue and orchestration                         │
└─────────────────────────────────────────────────────┘
┌──────────────────────────┐  ┌───────────────────────┐
│  Tier 3a  AUTHORING       │  │  Tier 3b  ANALYSIS    │
│  produce a Model          │  │  consume Results      │
│  node editor · 3D box     │  │  response plots       │
│  designer · baffle builder│  │  music analyser       │
│                           │  │  far-field maps       │
└──────────────────────────┘  └───────────────────────┘
┌─────────────────────────────────────────────────────┐
│  Tier 2  ENGINES        (Model, AnalysisSpec) → Results │
│  engine-fd (free) · engine-td (paid) · engine-farfield │
└─────────────────────────────────────────────────────┘
┌──────────────────────────┐  ┌───────────────────────┐
│  Tier 1  MODEL            │  │  Tier 1  RESULTS      │
│  node registry · project  │  │  result envelope      │
│  schema · placement       │  │  provenance           │
│  migrations               │  │                       │
└──────────────────────────┘  └───────────────────────┘
┌─────────────────────────────────────────────────────┐
│  Tier 0  NUMERICS  complex · bessel · air constants  │
└─────────────────────────────────────────────────────┘
```

### Tier 1 — Model

The single most important package, and the one that must be built first. It
depends on nothing and everything depends on it.

It owns:

- **The node type registry.** Each type declares, in one place: its id, its
  parameters with units and valid ranges and defaults, its ports, its geometry
  contribution, and which engines support it. No node-type string literal may
  exist anywhere outside this package. Everything else enumerates the registry.
- **The project schema** — nodes, edges, settings, metadata — carrying an
  explicit `schemaVersion` with a forward migration for every version ever
  shipped.
- **Placement and aperture geometry.** Position, orientation, and radiating
  aperture shape for each outlet. Not needed by the frequency-domain engine;
  required by the baffle and far-field tools. Designing it now costs little and
  retrofitting it costs a migration of every stored project.

Critically, the model is **not** the ReactFlow graph. Today `nodes`/`edges` with
`data.params` and `position` is a UI structure the solver happens to read. It
must become a domain format that ReactFlow is one renderer of.

### Tier 1 — Results

Usually forgotten, and as load-bearing as the model.

Not one flat shape. The three result kinds genuinely differ — frequency sweeps
are arrays over frequency, time-domain analyses are scalars plus band × frame
matrices, far-field is arrays over angle × frequency — so this is a **tagged
union sharing a common header**: provenance (which engine, which version, which
settings, which metric-set version), units, and a reference to the model that
produced it. Forcing one schema across all three yields a record that is mostly
null.

**Time-domain analyses return summaries, never raw waveforms** (§6.4). This is
a property of the seam, not an optimisation, and the rest of the envelope is
designed around it.

**One specific decision unlocks the far-field tool.** `runSimulation` currently
collapses every radiating outlet into `splCombined`, a complex sum. That
collapse is why a bare driver reads as −146 dB of silence and looked like a bug
during the contract audit. The far-field simulator needs precisely what is being
thrown away: **per-outlet complex pressure and volume velocity, retained
separately.** The solver already computes it internally. Exposing it as
first-class output is simultaneously a clarity fix today and the enabling step
for far-field prediction later.

### Tier 2 — Engines

Pure functions of `(Model, AnalysisSpec) → Results`. No framework, no store, no
I/O, no knowledge of who called them.

All engines run **server-side** (§5). Purity is still a hard rule, for two
reasons that survive that decision: an engine must be runnable from a headless
fixture with no HTTP server and no UI, which is what lets one session test one
package; and an engine that has never assumed a host can later acquire a
different one without a rewrite.

Each engine **declares which node types and analyses it supports**, so a surface
can grey out what an engine cannot do, and adding a node type cannot silently
produce wrong physics in an engine that was never taught about it.

Each engine also exposes **`estimateCost(Model, AnalysisSpec) → core-seconds`**
alongside its solver. Runtime here is essentially deterministic — state count ×
sample rate × sweep points × settling time — so one cheap function serves four
purposes at once: pre-run UX, scheduler admission control, quota accounting,
and tier gating (§6).

### Tier 3 — Surfaces

Authoring surfaces produce a Model. Analysis surfaces consume Results. Neither
imports an engine — they submit a job.

### Tier 4 — Platform

Identity, storage, sharing, entitlement, orchestration. Entitlement is checked
**at the job boundary**, never in a surface.

Solver execution is separated from state: a compute pool that runs engines and
holds no durable state, and a storage tier that owns projects and never runs a
solver. Onshape draws the same line — geometry computation on isolated servers,
distinct from the systems that write to the database. It matters more here than
it looks, because it is what allows heavy time-domain jobs to be scaled,
rate-limited, sandboxed, and starved of database credentials independently of
the interactive frequency-domain path.

---

## 3. The interaction rules

These are the "clear rules for how components interact." They are meant to be
mechanically enforced, not remembered.

1. **Dependencies point downward.** A surface may depend on Model and Results.
   An engine may depend on Model, Results and Numerics. Nothing depends on a
   surface. Nothing imports an engine directly.
2. **Engines are pure and host-agnostic.** No network, no filesystem, no
   globals. A host wraps them; they never wrap themselves.
3. **Node types are declared once.** Zero node-type string literals outside the
   model package. This is lintable and should be linted.
4. **Every seam has three things: a schema, a version, and a conformance
   suite.** A seam with only two of those is a handshake.
5. **Cross-language numerics are pinned by shared golden fixtures** (see §5).
6. **Schemas only ever migrate forward.** Every shipped `schemaVersion` keeps a
   migration path, permanently. Cloud storage makes this non-negotiable — you
   cannot ask users to re-save projects you are holding.

---

## 4. How "one component per session" is actually achieved

The user requirement is that a Claude session touches exactly one component. A
monorepo with workspace packages was chosen over separate repositories, because
schema changes will be the most frequent cross-cutting change and a polyrepo
taxes exactly those with version dances and local linking.

Isolation therefore has to come from enforcement, not from repository walls:

- **A `CLAUDE.md` per package** stating what that package may depend on, what it
  must never import, and how to run its tests alone. (There is no `CLAUDE.md` in
  the tree at all today — this is new work.)
- **Directory-scoped skills**, which this project already uses.
- **A boundary lint that fails the build on an illegal import.** This is the
  actual mechanism. Everything else is documentation.
- **Per-package contract packs and blind test suites**, extending the system
  already built in `docs/contracts/` and `test/contract/`.
- **The real test of the boundaries:** a session working in the node editor must
  be able to run that package's full suite *without building the C++ engine.* If
  that is ever untrue, the boundary has failed regardless of what the diagram
  says.

The existing contract infrastructure generalises directly here. `docs/api.json`
already models the codebase machine-readably; the blind-test agent already
writes conformance tests from a specification without seeing an implementation.
That is exactly the tool a seam contract needs, pointed at a package boundary
instead of a method.

---

## 5. Hosting: everything server-side

**Decision: all engines run on the server.** No solver ships to the browser.
This continues what `server/index.js` already does rather than reversing it.

The alternative — moving the free frequency-domain engine into the browser for
instant response — was considered and rejected. The deciding argument is the
language split: the time-domain engine will be **C/C++**, and the clean
long-run answer to numerics drift (below) is a single C++ core serving both
engines. In that end state a client-side JavaScript engine is a host that gets
built, maintained, and then deleted. Server-side avoids constructing a dead end.

Onshape is the reference case here — a fully cloud CAD system whose Parasolid
kernel never leaves the server and whose browser client receives only
tessellated triangles. Worth noting what does *not* transfer: Onshape is
server-side partly by necessity (a closed, licensed kernel that legally cannot
ship to a client) and operates on assemblies orders of magnitude larger than a
lumped-element network. The reasons here are different, which is why the
interaction budget below has to be taken seriously rather than assumed away.

### 5.1 What this buys

- One code path per engine. No dual-host conformance burden, no proving two
  implementations agree.
- The commercial boundary is physical by default. Entitlement cannot be
  bypassed by reading the bundle.
- All usage is measurable — necessary for capacity planning and abuse limits.
- Offline is explicitly not a goal, which simplifies the platform tier.

### 5.2 What it costs, and the budget that has to be met

Every parameter change is now a network round trip. **Dragging a slider and
watching the response curve move is the core interaction of this tool**, and
that interaction is now latency-bound. The compute is milliseconds; the network
is not. This is the single risk the decision creates, and it must be designed
for rather than discovered.

Targets, to be treated as requirements and not aspirations:

| Interaction | Budget | Mechanism |
|---|---|---|
| Pan, zoom, cursor readout, trace toggle, comparing stored curves | **0 ms** | Never leaves the client. Must not invalidate results at all. |
| Dragging a continuous parameter | **< 60 ms** perceived | Coarse preview sweep (~64 points), debounced, in-flight requests cancelled on new input. |
| Release / commit | **< 300 ms** | Full-resolution sweep at the configured `npts`. |
| Time-domain or far-field analysis | Async job | Progress reported; never blocks the editor. |

Two rules follow, and both belong in the Results tier:

1. **Display transforms never invalidate results.** Borrowed directly from
   Onshape: only a change to the *model* costs a round trip. Axis ranges,
   cursors, visibility, and overlay comparisons operate on cached results.
2. **Invalidation is per-parameter, not per-project.** Changing a driver
   parameter must not discard an unrelated stored comparison curve.

If these budgets cannot be met in practice, the client-side option should be
reopened for the free engine specifically. Recording that here so the decision
is revisited on evidence rather than defended by default.

### 5.3 Numerics drift between the two languages

Radiation impedance, the Bessel and Struve approximations, air constants and
end corrections will exist in both JavaScript and C++ for as long as both
engines exist. The contract audit already found a real defect in exactly this
area — the Bessel cancellation in `radiationImpedance` — so this is not
hypothetical.

> **Mitigation: a shared golden-fixture set at Tier 0.** One
> language-independent file of inputs and expected outputs, with both
> implementations tested against it in their own CI. Drift becomes a failing
> test rather than a discrepancy someone notices in a plot months later.

Because both engines now run in the same environment, consolidating onto one
C++ numerics core later is a straightforward option rather than a rewrite. The
fixtures make deferring that safe.

### 5.4 The one remaining exception

Server-side hosting resolves the paywall question for every feature except
one. **Real-time music playback cannot round-trip per audio buffer.** It is the
sole case where the engine wants to be next to the audio thread.

| Option | Trade |
|---|---|
| Server-side render, stream audio back | Consistent with everything else. Not truly real-time; becomes "render then audition," with latency on every EQ change. |
| Ship WASM to entitled users | True real-time and the better product. Breaks the rule, and a determined user can extract the engine. |

**This must be decided before the time-domain engine is written**, because it
determines whether the engine is built to a streaming block-processing
interface or a batch one. Retrofitting block processing onto a batch engine is
a rewrite. Note that building to a streaming interface keeps *both* options
open at little cost, and is therefore the safer default even if the audio path
ends up server-rendered.

---

## 6. Compute cost, the job model, and metering

The commercial model is a **fixed compute rate per user** rather than gated
features: everyone gets every capability, and complexity is priced in wall-clock
time. This section records what that requires of the architecture. Specific
metric definitions are deliberately *not* here — see
[`analysis-metrics.md`](./analysis-metrics.md), which is expected to change.

### 6.1 The computational profile

Time-domain simulation here is **SPICE-class, not FEA-class**. A ported box is
roughly 100–200 states (driver 3; chamber-as-line ~48; port waveguide ~48;
radiation rational fits ~4 per outlet), against 10⁵–10⁶ for structural FEA. Note
that `waveguideMatrix` and `chamberMatrix` are already *distributed* — 24
transmission-line segments each — so this is not a textbook lumped model.

Order-of-magnitude estimate for a well-implemented engine: **~20× faster than
real time on one core.** Not benchmarked; everything downstream scales linearly
with it, so it should be measured on a prototype before the price is fixed.

Two implementation requirements follow, and they are economic rather than
aesthetic:

- **Multi-rate integration.** Segment length is tied to timestep in a delay-line
  formulation, so work on distributed elements scales as **fs²** — oversampling
  8× for nonlinearity costs 64×, not 8×. The nonlinearity lives entirely in the
  driver's 3 lumped states, so oversample that core and run the linear lines at
  base rate. Thermal splits off again at ~10 Hz.
- **Banded solve.** The network is a chain of two-ports, so the system matrix is
  banded. Exploiting that is O(N) instead of O(N³) — roughly four orders of
  magnitude on a 200-state model.

Missing either turns ~20× real time into a fraction of it. Under fixed-rate
pricing that is a **~100× swing in unit economics**, which makes engine
efficiency a margin lever rather than a nicety.

### 6.2 Cost, sized

At 730 hours/month, one continuously-pegged core costs ~$26 on AWS on-demand,
~$9 on spot, ~$7 on cheap bare metal. **At a $15/month subscription, AWS
on-demand cannot fund a single 24/7 core.** Hosting choice is a 3–4× swing and
is therefore a real architectural decision, not an ops detail.

The saving grace is that "running 24/7" means two very different things:

| Workload | Core usage | Cost/month |
|---|---|---|
| Real-time playback, continuous | ~5% of a core (self-limiting — wall-clock bounds it) | ~$0.37 |
| Back-to-back batch sweeps | 1.0 core saturated | $7–26 |

One core-month buys ~146,000 distortion sweeps or ~292,000 track analyses. A
heavy user running 100 sweeps a day consumes ~2% of a core. **Realistic use is
far below the price; only a runaway script is expensive.**

### 6.3 What metering therefore requires

- **Rate cap plus total budget.** Rate bounds peak cost and makes the experience
  predictable; a monthly core-second allowance bounds the tail. Rate alone
  bounds neither.
- **Scheduler shares, never reserved cores.** Oversubscription of a shared pool
  *is* the business — a dedicated core per subscriber costs more than the
  subscription.
- **Two QoS classes.** Interactive work gets a burst allowance so the §5.2
  latency budget survives throttling; batch work gets the sustained rate. Caps
  apply to a user's aggregate concurrent work, not per job.
- **Cost shown before running.** Because runtime is predictable, the UI can
  state "estimated 3 min 20 s" at commit time. This is what makes fixed-rate
  pricing read as fair rather than punitive, and it makes the upsell honest.

Indicative shape: 8-core burst, ~1-core sustained fair share, ~40 core-hour
monthly budget. That budget costs well under a dollar and no legitimate user
approaches it.

### 6.4 Summaries, not waveforms

**Time-domain analyses return bounded summaries by default. Raw waveforms never
cross the seam except on explicit request.** Three consequences make this
structural rather than a preference:

1. **Output size stops depending on run length.** A 3-minute track drops from
   ~2.2 GB to a few MB. Egress and result storage become rounding errors —
   relevant because egress is billed and would otherwise dwarf compute.
2. **Results become cacheable by content hash.** `hash(model, analysisSpec,
   stimulusRef, metricSetVersion) → summary`, stored indefinitely because it is
   kilobytes. Stock drivers and standard test signals will collide across users.
   This is only possible *because* full data is not returned.
3. **Reduction must happen inside the engine, single-pass.** Computing metrics
   by buffering the waveform and post-processing defeats the purpose. Every
   metric must be an online estimator.

Two things keep this safe:

**`metricSetVersion` is part of the cache key.** The metric set is expected to
evolve; versioning it into the hash means adding or changing metrics never
silently returns stale results and never requires a backfill. This is what makes
the metric definitions a tunable rather than a commitment.

**Re-run-with-detail is a first-class operation.** Because the model, stimulus
and spec are retained and simulation is deterministic, any discarded detail is
reconstructible for ~9 core-seconds. The choice is not "store 2.2 GB or lose
the information" — it is "store it or regenerate it for a fraction of a cent."

### 6.5 Job model

Two shapes the current `/api/simulate` does not have:

- **Fan-out.** One `AnalysisSpec` expands into many independent runs (a
  distortion sweep is ~240), aggregated on completion. Embarrassingly parallel,
  which is what makes tiered burst allocation meaningful — and also gives the
  scheduler natural units to interleave and throttle.
- **Paired runs.** Compression and distortion are both defined *against* a
  linear cold reference, so the nonlinear run and its reference are one job, not
  two. Budget ~1.5× a bare nonlinear run. The pairing belongs in the job
  definition rather than being improvised by the engine.

Jobs must yield or checkpoint so they can be throttled mid-flight.

---

## 7. Honest assessment of the far-term ideas

These are worth building. They are also not equally hard, and the sequencing
should reflect that rather than treating them as one bucket.

**3D enclosure designer — hardest part is not the physics.** Constraining the
interaction so that every 3D arrangement maps onto a valid node graph is the
whole trick, and it is a UI and constraint-solving problem. The instinct that it
must be "a lot more strict on the way you can shape and connect components" is
exactly right, and it is what makes it tractable. The model tier makes this
possible: if every draggable body must resolve to a registered node type with
valid ports, the constraint system has something concrete to enforce.

**Baffle builder — the most reachable of the big ideas.** It needs placement
geometry in the model and per-outlet complex data in results. Both are Tier 1
work already planned. This should be first of the three.

**Far-field prediction — partly a research problem, and should be labelled as
one.** A lumped-element model carries *no directivity information whatsoever*.
Directivity has to come from aperture geometry, via a Rayleigh integral over the
radiating surface. That is a reasonable approximation for a flat baffle with
roughly piston-like sources; it degrades for horns, where the mouth is not a
uniformly-driven planar piston. MAPP and its peers sidestep this by using
*measured* directional balloons (GLL), not predictions from a circuit model.

This does not mean it cannot be done. It means the honest first version predicts
flat-baffle direct radiators well, treats horns approximately, and says so in the
UI — and that a path to importing measured directivity for a modelled box is
worth designing in from the start.

**Stacked-box mutual coupling — genuinely expensive.** Boundary loading between
adjacent enclosures is boundary-element territory, not something the time-domain
engine yields as a side effect. Correctly identified as far out. Worth keeping
out of the near-term model so it does not distort earlier decisions.

**Real-time music analysis — the strongest product idea here.** Per-band
compression, headroom, and pre-audition EQ is a genuinely differentiated feature
and the clearest justification for the paid tier. C++ is the right call
specifically because of this feature. Its real constraint is §5.4's paywall
tension, not the DSP.

---

## 8. Sequencing

Phase 0 builds none of the new tools. That is the point: it is what makes each
of them a normal piece of work instead of a negotiation with the whole tree.

**Phase 0 — the foundation**

The engine contract is the centre of this phase; see
[`ENGINE-CONTRACT.md`](./ENGINE-CONTRACT.md) for the field-level definition and
§11 there for the order within these steps. For the physics and numerics the
contract has to carry, see [`SOLVER-ARCHITECTURE.md`](./SOLVER-ARCHITECTURE.md).

1. Stand up the monorepo and the boundary lint.
2. Extract `@speakerspice/model`: node registry, project schema, migrations. This
   alone removes the nine-file tax on every future node type.
3. Define the results envelope as a tagged union, with **per-outlet complex data
   retained** and `metricSetVersion` in the header.
4. Version `/api/simulate` and put a conformance suite on it. Point `/mcp` at
   the same contract so the two consumers cannot drift.
5. Extract Tier 0 numerics and write the golden-fixture set.
6. Benchmark a prototype integrator on one ported box. The ~20× real-time
   estimate in §6.1 underpins the whole cost model and is currently unverified.

**Phase 1 — prove the boundaries are real, and meet the interaction budget**

7. *The test of Phase 0:* every engine must run from a headless fixture runner
   with no HTTP server, no store and no React, and the node-editor package must
   run its full suite without compiling the C++ engine. If either is untrue the
   boundary has failed regardless of what §2 says.
8. Implement the §5.2 interaction budget: results caching, per-parameter
   invalidation, request cancellation, and coarse-preview/full-commit sweeps.
   This is now load-bearing rather than an optimisation — it is what makes the
   server-side decision survivable.
9. Split `store.js` — 1435 lines currently holding dock layout, keybindings,
   graph editing, simulation orchestration and persistence — along the tier
   lines the model extraction reveals.

**Phase 2 — the paid engine**

10. Build `engine-td` in C++ to the already-existing Model and Results
    contracts, to a streaming block-processing interface (§5.4). Multi-rate
    integration and a banded solve are requirements, not optimisations (§6.1).
11. Fan-out and paired-run job model; in-engine metric reduction (§6.4–6.5).
12. Entitlement at the job boundary; compute pool separated from the storage
    tier.

**Phase 3 — the platform**

13. Scheduler with per-user rate caps, monthly budgets and two QoS classes
    (§6.3). Content-hash result cache.
14. Cloud projects, version history, share links. No live co-editing, so the
    model schema does not need to be mergeable — a constraint deliberately
    avoided.

**Phase 4+ — the new surfaces**

15. Baffle builder, then 3D designer, then far-field.

---

## 9. Open questions

- **Does the audio path ever ship to the client?** (§5.4) The only surviving
  exception to server-side hosting, and it decides whether real-time music is
  genuinely real-time or a render-and-audition feature. Building the engine to
  a streaming interface keeps both answers available, so this blocks Phase 2
  less than it appears — but it should still be answered deliberately.
- **Can the §5.2 interaction budget actually be met** over real connections? If
  not, the client-side free engine is reopened for that reason and no other.
- **Does the frequency-domain engine eventually become C++ too**, sharing the
  numerics core with the time-domain engine? It removes the drift risk entirely
  at the cost of rewriting working, well-tested code. The golden fixtures make
  deferring this safe, so it should be deferred — but not forgotten. Fully
  server-side hosting makes this a later option rather than a fork in the road.
- **Where is it hosted?** §6.2 makes this architectural rather than
  operational: AWS on-demand cannot fund a 24/7 core at $15/month, and the
  spread between hosting options is 3–4× on unit economics.
- **How much geometry belongs in the model from day one?** Enough for the baffle
  builder is cheap now. Enough for the 3D designer may over-constrain the schema
  before its interaction model is understood.
