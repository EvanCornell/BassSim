# Triage of the blind contract suite

`FINDINGS.md` beside this file is generated — it lists every failing assertion
grouped by the contract it contradicts. This file is the human judgement on top
of it: which side was wrong in each case.

**914 tests, 914 passing.** Opened at 795 tests, 84 failing.

Entries marked **verified** were reproduced directly against the implementation.

---

## Read this before trusting the green bar

An earlier version of this file said the suite should stay red until every
entry was decided, because *"a green blind suite would mean the contracts had
been rewritten to match whatever the code does, which is the one outcome that
makes the exercise worthless."* That warning still stands, and the suite is now
green, so the burden is on this file to show the green was earned.

Every failure was closed in exactly one of four ways. Only the first two are
unambiguously good, and the third is where a sceptical reader should push:

1. **The code was wrong and moved.** Eight defects, listed below.
2. **The test was wrong and moved** — it asserted something the contract never
   said, or tripped over its own arithmetic. Nine cases.
3. **The contract was wrong and moved.** Roughly fifty. This is the category
   that can hide a rewrite-to-fit, so each one is characterised below by *how*
   it was wrong, not merely that it changed. A contract that was **false**,
   **self-contradictory**, or **too vacuous to constrain anything** can be
   corrected without weakening the exercise. A contract that was merely
   *inconvenient* may not, and that distinction was applied case by case.
4. **Not closed — recorded as unreachable or unverifiable.** Contract clauses
   that cannot be tested from outside the module are named below and in
   `docs/contracts/AMBIGUITIES.md` with the reason. They are not counted as
   passing, because nothing asserts them.

The two judgement calls worth re-examining are flagged inline as **JUDGEMENT**.

---

## Code defects fixed — 8

**`radiationImpedance` returned negative radiation resistance** — verified.
Physically impossible; it said an opening absorbs energy from the far field.
Between `x = 1e-6` and ~1e-4 the code evaluated `1 − 2·J₁(x)/x`, where the terms
agree to more digits than the Abramowitz & Stegun polynomial carries. The
cancellation left noise that `ρc/S` — order 1e8 for a small opening — amplified
into something visible. The asymptotic threshold moved to `x < 1e-3`. Verified
zero negative results across a grid of areas, frequencies and solid angles; the
MCP physics checks report identical F3 figures, so no real geometry moved.

**`sanitize` threw on hostile input** — verified. It is documented as the trust
boundary for LocalStorage, where "an old or corrupt layout can never wedge the
workspace". A persisted `panels: 'canvas'` — a string, which has `.includes` but
not `.filter` — threw a TypeError, which is precisely the failure the contract
promises cannot happen. Both `panels` and `children` are now shape-checked.

**`sanitize` emitted non-finite flex weights.** `Number(v) > 0` admits Infinity,
which then breaks the flex layout it is fed to. Now finiteness-checked.

**`niceTicks` duplicated every tick below ~0.004 range** — verified. Tick
positions were rounded to a fixed three decimals while the step was smaller than
that. Now rounds to the step's own precision.

**`pushHistory` capped the history at 81, not 80** — verified. It trimmed to the
limit and *then* pushed, so the entry it was making room for put the list one
over.

**`setToolbar` emptied the quick bar instead of falling back** — verified.
`sanitizeToolbar` drops unknown ids individually and returns `[]`, which is
truthy, so the documented `|| DEFAULT_TOOLBAR` fallback never fired for an
all-unknown arrangement. A user importing a foreign layout got a blank bar and
no way back except `resetToolbar`.

> **JUDGEMENT.** The contract said only "falls back to the default", which does
> not say what an explicitly empty `[]` should do. Reading it literally would
> make a deliberately hidden bar impossible. The fix distinguishes "non-empty
> request, nothing survived" (corruption → default) from "empty request"
> (honoured), and that distinction was written *into* the contract rather than
> left implicit. If the intended behaviour was that the bar can never be empty,
> this is the wrong fix and the contract is now wrong with it.

**`updateParams` was not the no-op its contract claims for an unknown id.** It
mapped the node list unconditionally, so `set` installed a fresh array,
re-rendering every node and scheduling a resimulation for an edit that changed
nothing.

**`stripDash` failed behind a leading space.** It trimmed *after* matching
`/^-\s*/`, so `takeName`'s leftover space defeated the dash strip and every
affected parameter description in `docs/api.json` kept its separator. This one
was corrupting the generated documentation itself.

Plus `round5` normalising `-0`, which is cosmetic but made an axis bound render
as "−0".

---

## Contract defects fixed — ~50

Each was a case where the code was correct and the documentation was **false,
self-contradictory, or vacuous** — not merely inconvenient. The categories:

- **Outright false.** `portLengthGuess` named "a large port on a small box" as
  the geometry that hits the 1 cm floor. It is the opposite: that makes the port
  *longer*, sometimes metres long. The author built the documented fixture
  faithfully and got 9330 cm. Also `driver-fields`' header, which said
  `driverSI()` reads eight fields "and nothing else" while `CORE_FIELDS` marks
  nine — two published statements contradicting each other, and the header was
  the wrong one.
- **Self-contradictory.** `normQ`'s prose and its `@param` disagreed about a
  missing `Q`. The Bessel postconditions asserted exact float equality.
  `matIdentity` promised shared constants *and* free mutation.
- **Named a concept, never the identifier.** `computeMetrics` published
  `zPeaks` in a field list while its prose spoke of "the impedance peak count" —
  the field is the peak *list*. `parseJsdoc` described "the contract arrays"
  without naming a field, and its param descriptions live at `desc`, not the
  `description` every author guessed. Ten store actions falsely claimed
  cross-window mirroring for fields `SHARED_KEYS` deliberately excludes.
- **Silent about a result that looks like a bug.** `runSimulation` never said
  `splCombined` is a *complex* sum, so a bare driver radiating from both faces
  reads as silence at every drive voltage. That is a dipole cancelling into a
  shared far field, and the contract now says so and points at the outputs that
  do respond to drive level.
- **Vacuous.** `endCorrectionLength`, `snapLines` and `fmtVal` were all
  satisfiable by a constant-zero implementation.

> **JUDGEMENT.** `dockToEdge` said a joining panel takes "a quarter of the
> average weight"; the code takes a quarter of the *total*. Unlike the cases
> above, neither reading is absurd — this is the one place documentation was
> changed because the code's behaviour seemed more defensible, not because the
> documentation was demonstrably false. A quarter of the total gives the
> newcomer a fifth of the edge whatever the sibling count, matching the 22% the
> other branch gives; a quarter of the average shrinks toward nothing as
> siblings accumulate. That reasoning is stated in the contract now, so the next
> reader can disagree with it on the merits.

---

## Tooling defects fixed — 7

All found *indirectly*, by a blind reader noticing the pack did not cohere and
having no way to explain why:

1. `IGNORE_DIRS` matched the bare name `data`, hiding `src/data/` from the entire
   toolchain — three modules never scanned, linted or specced.
2. `takeName` used `indexOf(']')`, so `[out=[]]` parsed as default `[` with the
   description leaking mid-sentence.
3. Namespace objects were dropped from qualified names, so the pack told authors
   to call `useStore.getState().reset()` — a path that does not resolve.
4. Module headers were only recognised as JSDoc, so **0 of 53** modules had a
   captured description while 30 had `//` headers.
5. Array lengths were reported from the AST, so `[...new Set(xs)]` published as
   "an array of 1 entries".
6. Spread-bearing objects published their literal keys as if complete —
   `COMMANDS` showed 21 of its 26.
7. The pack rendered "an array of **undefined** entries" for a constant whose
   length the extractor deliberately declines to guess. Fix 5 created this one,
   and an author dutifully asserted the undefined length.

---

## Not closed

These pass only in the sense that nothing asserts them.

**Untestable through the public API — 1.** `chamberMatrix`'s stuffing model has
two effects: sound speed saturates at 8 g/L, resistive loss does not. Both feed
the same `tlineMatrix` call and neither is separately exposed, so from outside
the module you cannot hold one fixed while varying the other. The test asserts
the observable half and records the other as unresolved. A test that pretended
to verify it would be theatre.

**Reachable only from a pristine store — 1.** No documented action empties the
clipboard, and `loadSerialized` — the documented reset — does not clear it. So
`pasteClipboard`'s "does nothing when the clipboard is empty" clause is
reachable only before anything has ever copied. The test claims that state by
running first, and **asserts its own precondition**, so reordering the file
produces a loud, explained failure instead of a silent pass. Verified by moving
it to the end of the file, where it fails with its own reason.

**Requires the simulation server — 4.** `scheduleCompute` and the positive paths
of the three snapshot actions.

**Requires a browser — 1.** `popOutPanel`'s `window.open` half. The documented
state change is tested; the browser half is not.

**Unreachable — 61 methods.** Closures nested inside other functions, and React
components needing a renderer. They are labelled in the spec pack, not hidden,
but nothing tests them. This is the honest ceiling of the current harness.

---

## What the exercise cost and returned

| | Start | Now |
|---|---|---|
| Tests | 795 | 914 |
| Failures | 84 | 0 |
| Modules with a captured description | 0 / 53 | 38 / 53 |
| Lint checks | 0 | 13 |

Test count rose by 119 while failures fell to zero, which is the signal worth
trusting: authors strengthened assertions as contracts became specific rather
than deleting the ones that failed. `DEFAULT_SETTINGS` went from a relative
1e-9 tolerance on figures the contract calls display-rounded to pinning the
shipped numbers and requiring the published power to be the rounded one.
`portLengthGuess` gained a test for the corrected sentence, so the claim that a
large port on a small box runs *longer* is now checked rather than asserted in
prose. The MCP author replaced a deliberately weakened `driverParams` check with
the exact projection boundary asserted across every library row in both
directions. The data author rebuilt every audit fixture on discovering its units
were wrong by three to four orders of magnitude — because the contract had never
said whether it read SI or display units.

Eight real code defects, all latent, all found because a blind author asserted a
documented postcondition literally instead of checking what the function
currently returns. Seven tooling defects, none of which a sighted reviewer would
have had reason to look for. And roughly fifty documentation defects, which is
the honest measure of how much of that documentation read well only to someone
who already knew the answers.

The blindness itself is now enforced rather than promised: the thirteenth lint
check fails the build if any implementation line appears verbatim in the spec
pack, and it is verified to fail as well as pass.
