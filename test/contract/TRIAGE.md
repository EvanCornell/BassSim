# Triage of the blind contract suite

`FINDINGS.md` beside this file is generated — it lists every failing assertion
grouped by the contract it contradicts. This file is the human judgement on top
of it: which side is wrong in each case.

**795 tests, 740 passing, 55 failing.**

Nothing below has been fixed. The suite is red on arrival and should stay that
way until each entry is decided, because a green suite here would mean the
contracts had been quietly rewritten to match whatever the code does — which is
the one outcome that would make the whole exercise worthless.

Entries marked **verified** were reproduced directly against the implementation.
The rest are read from the failure output and the contract text.

---

## A. Real code defects — fix the code

### A1. `radiationImpedance` returns negative radiation resistance — verified

`src/engine/acoustics.js`. The contract states `@post Re(result) >= 0 for every
solid angle`. It does not hold:

```
S=1e-6 m², w=1 rad/s, free  ->  Re = -0.0307
S=1e-4 m², w=1 rad/s, half  ->  Re = -7.1e-5
```

Negative radiation resistance is physically impossible — it says the opening
absorbs energy from the far field. The cause is the small-argument guard: below
`x = 2ka = 1e-6` the code uses the asymptotic form, but between roughly 1e-6 and
1e-4 it evaluates `R1 = 1 − 2·J₁(x)/x`, where the two terms agree to more digits
than the Abramowitz & Stegun polynomial carries. The subtraction is
catastrophic cancellation and the result is numerical noise, which `ρc/S` — a
number of order 1e8 for a tiny opening — then amplifies into something visible.

Latent in practice: it needs a radiating area around 0.01 cm², far smaller than
any real port. But it is a genuine violation of a documented postcondition and
would surface on a mistyped area. The fix is to raise the asymptotic threshold
to roughly `x < 1e-3`, where `x²/8` is still accurate to well under a part in
1e8.

### A2. `niceTicks` emits duplicate ticks on small ranges — verified

`src/components/NLLab.jsx`. For the range (0, 0.004) it produces
`0, 0.001, 0.001, 0.002, 0.002, 0.003, 0.003, 0.004, 0.004` — every value
duplicated, because tick positions are rounded to three decimals while the
computed step is 0.0005. Any step below 0.001 collapses adjacent ticks together.

Also latent: the Nonlinear Lab's real axis ranges are roughly 0.1–2. The
rounding should scale with the step rather than being fixed at three decimals.

---

## B. Contract is wrong or incomplete — fix the documentation

These are defects in what I wrote, not in the code. The blind tests encode the
contract correctly; the contract does not describe the implementation.

### B1. `normQ` contradicts itself — 1 failure

The prose says a missing `Q` collapses onto `Infinity`; the parameter block says
`[p.Q=50]`. The code follows the parameter block. One of the two sentences has
to go.

### B2. Node label location is undocumented — 7 failures

`labelOf` and `resolveNode` in `mcp/acousim.js` take "hydrated graph nodes" and
read `node.data.params.label`. Nothing in the pack says where a label lives, so
the author used `node.params.label` and every test throws on `undefined`.
Verified: the implementation is correct and the contract is silent.

### B3. `fitDb`'s upper bound is undocumented — 3 failures

The contract describes a window *below* the peak and says nothing about the top.
The code pads by 4 dB and rounds up to a multiple of 5.

### B4. `rawEval`'s symmetric-mode flag is never named — 1 failure

The contract describes the behaviour and omits the property that enables it. Two
independent authors guessed the same wrong spelling. Re-checked against the
regenerated pack: still absent.

### B5. `optimizeProject`'s evaluation budget is off by one — 3 failures

Documented as `rounds × params × gridN`. Actual is one more: an unmentioned
baseline evaluation of the starting design (28 vs 27 for 3×1×9).

### B6. `nearestIdx` does not define tie-breaking — 1 failure

"Index of the nearest sample" is ambiguous when two samples are equidistant. The
code returns the higher index; the natural reading returns the lower.

### B7. `chartPanelComponent` is marked `@pure` but returns a fresh closure — 1 failure

`@pure` promises equal output for equal input. The factory builds a new
component on every call, so two results are never equal. Either it should
memoise or the tag is wrong.

### B8. `areaProfile`'s postcondition asserts exact float equality — 1 failure

`@post result(0) === S1` fails for the conical law at 0.9999999999999999. The
postcondition is true in exact arithmetic and false in floating point; it needs a
tolerance.

### B9. `computeMetrics` claims fields are absent, not null — 2 failures

"Individual fields are absent rather than null when the topology does not define
them" — but `xAtFb` is present and null for a sealed box.

### B10. `metricsSummary` claims a flat object — 1 failure

`impedance_peaks` is an array of strings, so the result is not flat.

### B11. `src/data/drivers.js` documents no exports at all — 2 failures

The module's entire public surface — the driver library itself — is undocumented.
The author had to discover exports from the namespace and consequently iterated
`CORE_FIELDS` as if it were a driver list. Flagged by the data-module author as
the weakest contract in the repo.

### B12. Others in the same family

`searchDrivers` (field name and case of the Fs column), `findDriver` (substring
and tie semantics), `chamberMatrix` (whether "floored at 1e-4" applies to the
length everywhere or only to the derived area — the text says the latter, the
test read the former), `portLengthGuess` (floor semantics), `auditDriver`
(no tolerance and no units stated), `parseJsdoc` and `stripDash` (return shape
only half-enumerated), `runSimulation` (the result does not expose the settings
it used, so documented defaults cannot be observed), `sanitize`, `dockToEdge`,
`COMMANDS`, and several store actions whose contracts name a concept but not the
state key they write.

The last is systemic rather than incidental: **every** `@sideEffect Writes store
state` names what changed conceptually and never which field. Four authors raised
it independently. It is the single highest-value thing to fix in the contracts.

---

## C. Test artifacts — fix the test

### C1. `hydrateProject` — `assert.throws` misuse — 4 failures, verified

The author wrote `const err = assert.throws(...)` and then read `err.projectErrors`.
Node's `assert.throws` returns `undefined`; the error is captured by passing a
validator instead. The implementation throws correctly with `projectErrors`
populated — verified directly. Four failures, no contract or code involvement.

### C2. `round5` — `-0` versus `0` — 2 failures

`Math.ceil(-0.2) * 5` is `-0`, and `assert.strictEqual` uses `Object.is`, so it
differs from `0`. Numerically identical. Arguably the code should normalise, since
a chart axis bound rendering as `-0` would look like a bug — but this is
cosmetic, not a contract disagreement.

---

## Summary

| Category | Failures | Action |
|---|---|---|
| A. Real code defects | 2 | Fix the code |
| B. Contract wrong or incomplete | ~47 | Fix the documentation |
| C. Test artifacts | 6 | Fix the test |

The distribution is the honest result of the exercise. Two genuine code bugs, both
latent and both found only because a blind author asserted a documented
postcondition literally rather than checking what the function currently returns.
Everything else is documentation that reads well to someone who already knows the
code and does not survive contact with someone who does not.
