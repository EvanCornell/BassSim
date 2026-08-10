# AcouSim architecture

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

A single envelope covering every engine: per-outlet complex frequency response,
time-domain waveforms, derived metrics, and provenance — which engine, which
version, which settings produced this.

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
I/O, no knowledge of who called them. This is what makes one engine runnable
both in a browser and on a server without a second implementation.

Each engine **declares which node types and analyses it supports**, so a surface
can grey out what an engine cannot do, and adding a node type cannot silently
produce wrong physics in an engine that was never taught about it.

### Tier 3 — Surfaces

Authoring surfaces produce a Model. Analysis surfaces consume Results. Neither
imports an engine — they submit a job.

### Tier 4 — Platform

Identity, storage, sharing, entitlement, orchestration. Entitlement is checked
**at the job boundary**, never in a surface.

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

## 5. Consequences of the language split

The time-domain engine will be **C/C++**; the frequency-domain engine is
JavaScript today and will **move to the client** so parameter tweaking is
instant and free-tier users cost nothing to serve.

Two consequences follow, and both need a decision rather than a discovery.

**Two numerics stacks will drift.** Radiation impedance, the Bessel and Struve
approximations, air constants and end corrections would exist in both JS and
C++. The contract audit already found a real defect in exactly this area — the
Bessel cancellation in `radiationImpedance` — so this is not hypothetical.

> **Mitigation: a shared golden-fixture set at Tier 0.** One
> language-independent file of inputs and expected outputs, with both
> implementations tested against it in their own CI. Drift becomes a failing
> test rather than a discrepancy someone notices in a plot months later.

**The paywall and the client both want the time-domain engine.** The free
engine moving client-side makes the commercial boundary physical, which is the
right instinct. But the paid engine cannot follow it: WASM shipped to a browser
is extractable, entitlement check or not.

That collides with real-time music playback, which wants the engine next to the
audio thread and cannot tolerate a per-buffer server round-trip.

The three honest options:

| Option | Trade |
|---|---|
| Server-side render, stream audio back | Protects the asset. Not truly real-time; becomes "render then audition," with latency on every EQ change. |
| Ship WASM to entitled users | True real-time and the best product. Accepts that a determined user can extract the engine. |
| Split it — cheap path client-side, heavy nonlinear analysis server-side | Best of both, most complexity, and the two paths must be proven to agree. |

**This should be decided before the engine is written, not after**, because it
determines whether the engine is built to a streaming block-processing interface
or a batch one. Retrofitting block processing onto a batch engine is a rewrite.

---

## 6. Honest assessment of the far-term ideas

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
specifically because of this feature. Its real constraint is §5's paywall
tension, not the DSP.

---

## 7. Sequencing

Phase 0 builds none of the new tools. That is the point: it is what makes each
of them a normal piece of work instead of a negotiation with the whole tree.

**Phase 0 — the foundation**

1. Stand up the monorepo and the boundary lint.
2. Extract `@acousim/model`: node registry, project schema, migrations. This
   alone removes the nine-file tax on every future node type.
3. Define the results envelope, with **per-outlet complex data retained**.
4. Version `/api/simulate` and put a conformance suite on it. Point `/mcp` at
   the same contract so the two consumers cannot drift.
5. Extract Tier 0 numerics and write the golden-fixture set.

**Phase 1 — prove the boundaries are real**

6. Move the frequency-domain engine to the client, keeping the server host.
   *This is the test of Phase 0:* if the same engine runs in both hosts against
   one conformance suite, the seam is genuine.
7. Split `store.js` — 1435 lines currently holding dock layout, keybindings,
   graph editing, simulation orchestration and persistence — along the tier
   lines the model extraction reveals.

**Phase 2 — the paid engine**

8. Build `engine-td` in C++ to the already-existing Model and Results contracts,
   after resolving §5's streaming-versus-batch question.
9. Entitlement at the job boundary.

**Phase 3 — the platform**

10. Cloud projects, version history, share links. No live co-editing, so the
    model schema does not need to be mergeable — a constraint deliberately
    avoided.

**Phase 4+ — the new surfaces**

11. Baffle builder, then 3D designer, then far-field.

---

## 8. Open questions

- **Streaming or batch** for the time-domain engine (§5). Blocks Phase 2.
- **Does the paid engine ever ship to the client?** Determines whether real-time
  music is a real-time feature or a render-and-audition one.
- **Does the frequency-domain engine eventually become C++ too**, sharing the
  numerics core with the time-domain engine? It removes the drift risk entirely
  at the cost of rewriting working, well-tested code. The golden fixtures make
  deferring this safe, so it should be deferred — but not forgotten.
- **How much geometry belongs in the model from day one?** Enough for the baffle
  builder is cheap now. Enough for the 3D designer may over-constrain the schema
  before its interaction model is understood.
