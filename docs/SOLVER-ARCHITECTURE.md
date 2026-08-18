# Solver architecture

Status: **proposal.** Nothing in `src/` implements this.

This document covers core solving logic only — physics, numerics, and how the
pieces compose. Hosting, metering and the platform are in
[`ARCHITECTURE.md`](./ARCHITECTURE.md); the data contract is in
[`ENGINE-CONTRACT.md`](./ENGINE-CONTRACT.md).

The requirement is maximum achievable accuracy with no modelling shortcuts.
That constraint, taken seriously, dictates most of what follows.

---

## 1. The central problem

**Nonlinearity lives in the time domain. Accurate 3D acoustics lives in the
frequency domain. They do not compose.**

`Bl(x,i)`, `Kms(x)`, `Le(x,i)` and thermal drift all break superposition, so
they have no honest frequency-domain form. The current cycle-averaged
large-signal path in `nonlinear.js` is precisely the approximation being
rejected here.

BEM *is* the Helmholtz equation — a frequency-domain method. Time-domain BEM
exists, and is both extremely expensive and numerically fragile.

Two naive resolutions, both bad:

- Quasi-linearise the nonlinearity so everything fits in the frequency domain.
  That is the shortcut.
- Brute-force everything in the time domain with FDTD or time-domain BEM.
  Impractical at realistic mesh sizes, and it destroys the cost model.

## 2. The resolution: reduce, then sandwich

Solve each **linear distributed subsystem** once in the frequency domain. Fit a
passive, causal, stable **state-space macromodel**. Embed those as linear blocks
around a small nonlinear lumped core. Integrate in time.

```
   ┌──────────────────────────────────────────────────────────┐
   │  LINEAR (exact, from FEM/BEM, reduced to state space)      │
   │                                                            │
   │   electrical      ┌────────────────────┐    structural     │
   │   source /   ───► │  NONLINEAR CORE     │ ◄─── cone modes  │
   │   crossover       │  Bl(x,i)  Kms(x)    │                  │
   │                   │  Le(x,i)  Rms(v)    │    interior       │
   │   thermal    ───► │  Rap(qp)  Fm(x,i)   │ ◄─── cavity Z    │
   │   (slow rate)     │  ~10 states         │                  │
   │                   └────────────────────┘    exterior       │
   │                                          ◄─── radiation Z   │
   └──────────────────────────────────────────────────────────┘
```

This is Klippel's Figure 12 sandwich generalised: his outer blocks are lumped
linear systems, these are derived from arbitrary geometry. His justification for
treating them as linear holds unchanged — in the mechanical and acoustical path
"the amplitude is relatively small and the sound propagation is sufficiently
linear."

Why this is the right architecture rather than a convenient trick:

- **No modelling approximation beyond linearity of the reduced blocks**, which
  is physically justified. Fit error is a controlled, measurable tolerance.
- **The expensive work runs once per geometry.** FEM/BEM take minutes; the
  macromodel is kilobytes; every time-domain run afterwards is cheap. The
  accuracy requirement and the cost model stop fighting.
- **Mutual coupling is free.** Radiation impedance is a *matrix* across coupling
  surfaces, so cone/port interaction, baffle diffraction and (later) stacked-box
  coupling all live in one object rather than being separate features.
- **The linear blocks impose no timestep restriction** (§9).

### 2.1 Two hard requirements

**Passivity and causality must be enforced in the fit.** A non-passive
macromodel makes time-domain integration diverge. This is the classic failure
mode of the technique and it is not optional.

**The macromodel is validated against its source data** as a build step —
maximum deviation from the original FEM/BEM response over the band, recorded and
thresholded. A fit that has not been checked is not a model.

### 2.2 Where the sandwich genuinely fails

Documented rather than papered over:

| Effect | Why it breaks | Handling |
|---|---|---|
| Wave steepening in horns | Distributed nonlinearity — cannot be reduced to a linear block | Nonlinear 1D transmission line in the horn, outside the macromodel |
| Doppler | Radiation operator depends on instantaneous cone position | Out of scope initially; state it |
| Very large excursion altering cavity geometry | Macromodel assumes fixed geometry | `Cab(pbox)` is the lumped proxy; bound its validity |

---

## 3. Fidelity is a vector, not a mode

The decision that cone breakup should be *optional* generalises into the
organising principle of the whole solver. **Every subsystem has an independently
selectable fidelity level, and every combination is valid**, because all levels
present the same state-space interface to the integrator.

| Subsystem | Fidelity levels (low → high) |
|---|---|
| **Motor** | linear T/S → nonlinear `Bl(x)`, `Kms(x)`, `Le(x)` → full `Bl(x,i)`, `Le(x,i)`, `L2/R2(x)`, `Fm(x,i)` |
| **Cone** | rigid piston → modal (N structural FEM modes) |
| **Interior** | lumped compliance → 1D transmission line → 3D FEM macromodel |
| **Port** | lumped mass+resistance → 1D transmission line → 3D FEM (part of interior mesh) |
| **Radiation** | analytic piston in baffle → BEM macromodel (diffraction, mutual coupling) |
| **Losses** | fixed `Q` → `Rms(v)`, `Rap(qp)` → Miki porous lining |
| **Thermal** | off → two-body `Re(Tv)` |

This buys four things at once:

1. **Rigid piston is not a special case** — it is a modal block with zero modes.
   No branching in the integrator.
2. **The current lumped engine becomes fidelity level 0**, not legacy code.
3. **Cost is computable from the fidelity vector**, which is what
   `estimateCost` needs.
4. **The fidelity vector is provenance.** It travels in the result header, so a
   user can always see which approximations produced a number. For a tool
   claiming accuracy this is not optional — an unlabelled number is not a
   result.

---

## 4. The layer stack

| Layer | Contents | Cadence |
|---|---|---|
| **L0 Geometry** | Gmsh mesh import, physical-group tagging, boundary classification | Per edit |
| **L1 Field solvers** | Structural FEM (cone) · interior acoustic FEM · exterior BEM | **Once per geometry** |
| **L2 Reduction** | Modal truncation · matrix vector fitting · passivity enforcement | Once per geometry |
| **L3 Nonlinear core** | Klippel Fig 7 lumped element set | — |
| **L4 Integration** | Multi-rate DAE, exact LTI discretisation | Per run |
| **L5 Analysis** | Metrics, per [`analysis-metrics.md`](./analysis-metrics.md) | Per run |

L1 and L2 are cached on geometry hash. L3–L5 run per analysis.

---

## 5. One compiled system, two authoring front-ends

Geometry enters by **mesh import** — no parametric generator, matching Boundary
Lab's approach. But the existing node-graph editor must not become dead weight,
and it does not have to.

Both front-ends compile to the same intermediate representation:

```
  Node graph  ──┐
  (lumped)      ├──►  compiled system  ──►  solver
  Mesh + class ─┘     (immutable)
```

The node graph is a fast parametric way to describe a system **at low fidelity**
— it is the natural authoring surface when every subsystem is lumped or 1D. The
mesh path is the authoring surface for high fidelity. They are not competing
models; they are two fidelity ranges of one model.

This is Boundary Lab's authoring → compiler → immutable contract pattern with a
second front-end. Its vocabulary is the right one for the mesh path and should
be adopted rather than reinvented:

- **Region** — a connected acoustic domain (bounded FEM / unbounded BEM)
- **Boundary** — a physical role on one tagged surface: rigid, moving, interface
- **Interface** — two domains meeting, with no device
- **Component** — a device with its own equations
- **Excitation port** — an independent physical input

The distinction that matters most is **interface versus component**. In the
current node graph a `waveguide` and a `driver` are both "nodes," but one is a
passage and the other is a device with state. Only components can carry
nonlinearities, host an excitation port, or have thermal state. Encoding that in
the model removes a whole class of invalid systems.

**The 3D enclosure designer is not foreclosed by mesh-only import** — it becomes
an upstream mesh producer feeding the same L0 interface as CAD, rather than a
privileged path into the solver.

---

## 6. L1 — field solvers

**Provided by BEAT Engine**, reused from Boundary Lab: coupled FEM–BEM,
Julia, CPU and CUDA paths, exact Schur condensation of FEM interior unknowns,
already carrying a versioned solve contract (`SYSTEM_SOLVE_REQUEST_VERSION`) and
an HTTP server with newline-delimited JSON result streaming.

Writing an equivalent — production BEM with fast-multipole or H-matrix
acceleration, plus structural FEM, plus meshing — is a multi-year specialist
effort. Reusing it is the single highest-leverage decision in this document.

### 6.1 What must be requested from it

This is the one real integration risk, and it should be settled early.

Boundary Lab asks BEAT for **far-field quantities** — SPL at observation points,
polar data, radiation impedance seen at the terminals. The macromodel instead
needs **the impedance matrix between coupling surfaces**:

```
Z_ij(ω) = pressure on surface i  /  volume velocity on surface j
```

for every pair of coupling surfaces (cone front, cone rear, port mouth, each
chamber interface).

The good news is that this is the *same kind of solve* Boundary Lab already
runs. Its excitation-port basis decomposition — excite each port independently
at a canonical reference, keep the complex responses — is structurally exactly
the multi-port sweep needed. Driving each coupling surface with unit volume
velocity in turn and recording pressure on all surfaces yields `Z` column by
column.

So the likely work is an **additional output quantity**, not a new solver.
`OutputRequest` already carries `quantity` and `target_ids`. Confirm this before
committing to the schedule.

### 6.2 Structural FEM

Needed only when cone fidelity is modal. Produces mode shapes `φ_i`, natural
frequencies `ω_i`, and modal masses. **Modal damping comes from measured loss
factor** — Klippel: "the 3 dB bandwidth of each resonance peak corresponds with
the modal loss factor of the material used." Material parameters are the input
that is hardest for a user to supply, which is why this fidelity level must stay
optional.

---

## 7. L2 — reduction

### 7.1 Matrix vector fitting

Input: `Z(ω)` sampled at the L1 solve frequencies. Output: a rational
approximation with a **common pole set across all matrix entries**,

$$
Z(s) \approx \sum_k \frac{R_k}{s - p_k} + D + sE
$$

converted to a state-space realisation `(A, B, C, D)`. Order is increased until
fit error falls below tolerance; the achieved error is recorded.

### 7.2 Passivity and causality

Non-negotiable, per §2.1. Passivity is checked via the Hamiltonian eigenvalue
test and restored by residue perturbation. Causality follows from stable poles
and a proper form. **A macromodel that fails the passivity check is rejected,
not shipped with a warning** — the failure mode is a divergent time-domain run,
which looks like a physics bug and is miserable to trace.

### 7.3 Modal truncation

For the cone and, optionally, rigid-walled cavities. Keep modes below roughly
twice the band edge; record the truncation frequency in provenance.

Cavities can go either way — modal, or FEM impedance then vector fitting.
**Prefer the impedance route** for uniformity: one reduction mechanism, one
validation path, one class of bug.

---

## 8. L3 — the nonlinear core

The Klippel Figure 7 element set, in full. Approximately ten states.

**Electrical**

$$
u = R_e(T_v)\,i + \frac{d}{dt}\!\left[L_e(x,i)\,i\right] + Bl(x,i)\,v + u_{L_2R_2}
$$

**Mechanical**

$$
M_{ms}\dot v = Bl(x,i)\,i - K_{ms}(x)\,x - R_{ms}(v)\,v - S_d\,\Delta p + F_m(x,i)
$$

**Acoustic** — `S_d·v` drives the macromodel blocks; `Δp` is their reaction.

**Thermal** — two-body (coil, magnet) with `Rtv`, `Rtm` and their heat
capacities, integrated at ~10 Hz.

Against what exists today in `nonlinear.js` (`Bl`, `Cms`/`Kms`, `Le`), the
additions are `Le(i)`, `Rms(v)`, `Rap(qp)`, `Cab(pbox)`, the `L2(x)`/`R2(x)`
eddy-current branch, the reluctance force `Fm(x,i)`, and thermal — with
`Rap(qp)` and thermal being the two that most affect a vented bass system.

---

## 9. L4 — time integration

### 9.1 Exact discretisation of the linear blocks

The macromodels are LTI, so they can be discretised **exactly** by matrix
exponential with zero-order or first-order hold. Consequently they contribute
**no stability constraint and no numerical damping**, regardless of how fast
their poles are.

This matters more than it first appears. A BEM-derived macromodel can carry
poles far above the audio band; integrated by a conventional stepper they would
force a punishing timestep or introduce artificial damping that corrupts exactly
the resonance behaviour being modelled. Exact discretisation removes the
problem — **only the nonlinear core constrains `dt`.**

### 9.2 Multi-rate

Three rates, as established:

| Rate | Contents |
|---|---|
| ~384 kHz | Nonlinear core (~10 states) |
| 48–96 kHz | Linear macromodels, distributed elements |
| ~10 Hz | Thermal |

Segment length is tied to timestep in delay-line formulations, so distributed
work scales as `fs²`. Confining oversampling to the nonlinear core is what keeps
that term from dominating.

### 9.3 Coupling

The interface is implicit — acoustic load depends on cone velocity, cone
velocity depends on acoustic load — so each step needs a Newton iteration on a
small system. The coupled matrix is **banded**, because the network is a chain
of two-ports; exploiting that is O(N) rather than O(N³).

---

## 10. The linear fast path, and the invariant it buys

With every nonlinearity disabled, the system is entirely LTI and can be
assembled and solved **directly in the frequency domain**, skipping time
stepping. This preserves interactive response for ordinary design work.

It also yields the strongest correctness invariant available:

> **Time-domain integration with nonlinearities disabled must reproduce the
> frequency-domain solve, to integration tolerance.**

Cheap to test, and it catches errors in coupling signs, unit conversion,
macromodel realisation, discretisation and the integrator itself. This should be
a permanent test, run at every fidelity combination.

---

## 11. Parameter identification — the real accuracy ceiling

The solver is never the limiting factor. `Bl(x)`, `Kms(x)`, `Le(x,i)`, `Rms(v)`
are **measured** quantities, obtained by system identification from terminal
voltage and current. A perfect solver fed guessed curves is less accurate than a
rough one fed measured curves.

So this layer is a first-class subsystem, not a utility:

- Import of Klippel-format curve data (partly present in `nonlinear.js`)
- Fitting and extrapolation beyond the measured range, with the extrapolation
  region flagged in results
- **Provenance on every parameter**: measured, estimated, or defaulted
- Sensible physical defaults where a curve is absent, clearly labelled as such

A result computed from defaulted curves must be visibly distinguishable from one
computed from measured curves. Everything in this document is wasted otherwise.

---

## 12. Verification

An accuracy claim needs evidence, not assertion.

| Method | Target |
|---|---|
| Analytic benchmarks | Piston in infinite baffle, sealed box, Helmholtz resonator, closed tube modes |
| Method of manufactured solutions | The PDE solvers (largely delegated to BEAT) |
| Convergence studies | Mesh refinement, mode count, fit order, timestep — each must show the expected order |
| Macromodel fidelity | Fitted response vs source FEM/BEM data, per fit, thresholded |
| Cross-path | §10 — TD(linear) ≡ FD |
| Cross-language | Tier 0 golden fixtures shared between JS and C++ |
| Measured comparison | Against real drivers with known Klippel data |

Convergence studies are the ones most likely to be skipped and the ones that
actually substantiate "no shortcuts."

---

## 13. Open questions

- **Can BEAT emit the coupling-surface impedance matrix?** (§6.1) The highest
  integration risk. Probably a new output quantity rather than new solver work,
  but it gates the whole macromodel approach and should be confirmed first.
- **Julia in the deployment.** BEAT is Julia; the time-domain engine is C++.
  That is a second runtime to ship and orchestrate. Acceptable given L1 runs
  once per geometry and can be a separate service, but it is a real cost.
- **Modal versus impedance reduction for cavities** (§7.3). Recommendation is
  impedance for uniformity; worth benchmarking both once.
- **Horn wave steepening** (§2.2). Needs a nonlinear transmission line outside
  the macromodel. Defer, but do not let the interface foreclose it.
- **Where the mesh comes from in practice.** Mesh-only import inherits Boundary
  Lab's usability wall: CAD skills, meshing, physical-group tagging, interface
  conforming. Not a solver problem, but it determines who can use the
  high-fidelity path at all.
