# Triage of the blind contract suite

`FINDINGS.md` beside this file is generated — it lists every failing assertion
grouped by the contract it contradicts. This file is the human judgement on top
of it: which side is wrong in each case.

**912 tests, 889 passing, 23 failing.** Opened at 84 failing.

The suite is still red, and should stay red until each remaining entry is
decided. A green blind suite would mean the contracts had been rewritten to
match whatever the code does, which is the one outcome that makes the exercise
worthless.

Entries marked **verified** were reproduced directly against the implementation.

---

## Resolved since the first triage

### Code defects fixed — 4

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

Plus `round5` normalising `-0`, which is cosmetic but made an axis bound render
as "−0".

### Contract defects fixed — ~40

Every one a case where the code was correct and the documentation was
incomplete, contradictory, or too weak to constrain anything. The full list is
in the commit history; the categories were:

- **Self-contradictions.** `normQ`'s prose and its `@param` disagreed about a
  missing `Q`. The Bessel postconditions asserted exact float equality.
  `matIdentity` promised shared constants *and* free mutation.
- **Undocumented behaviour.** `fitDb`'s upper bound, `optimizeProject`'s baseline
  evaluation, `nearestIdx`'s tie-breaking, `rawEval`'s `sym` flag.
- **Vacuous contracts.** `endCorrectionLength`, `snapLines` and `fmtVal` were all
  satisfiable by a constant-zero implementation.
- **Named a concept, never the identifier.** Ten store actions falsely claimed
  cross-window mirroring for fields `SHARED_KEYS` deliberately excludes;
  `isPanelDrag` and `loadCustom` never named the payload type or storage key;
  labels were never said to live at `node.data.params.label`.

### Tooling defects fixed — 6

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

---

## Still failing — 23

### A. Test-harness artifacts — 6

**`hydrateProject` — 4.** The author writes `const err = assert.throws(...)` and
reads `err.projectErrors`. Node's `assert.throws` returns `undefined`. Verified:
the implementation throws correctly with `projectErrors` populated. The engine
author was asked to fix this and corrected its throw tests; these four are the
*non-throw* tests, which fail on the same misunderstanding of the return shape.

**`round5` — 2.** Now that `-0` is normalised, these encode a different claim
than the current contract. Needs one more author pass.

### B. Contracts I have not yet decided — ~13

`parseJsdoc` and `stripDash` (return shape still only half-enumerated),
`portLengthGuess`, `EXT_GROUPS`, `CORE_FIELDS`, `DEFAULT_SETTINGS`,
`computeMetrics`, `dockToEdge`, `setToolbar`, `pushHistory`, `updateParams`,
`pasteClipboard`.

Several of these are new — they appeared only once the exported-constants
sections were published, because the authors could finally assert counts and key
sets that were previously unknowable. That is the mechanism working: making the
documentation specific creates new opportunities for it to be wrong.

Two I want to single out as genuinely undecided rather than merely unexamined:

- **`setToolbar`.** The contract says an arrangement of unknown ids "falls back
  to the default". `sanitizeToolbar` returns `[]` for an all-unknown array, not
  `null` — so a store that only falls back on `null` would produce an empty
  toolbar. The author left this standing deliberately. It may be a real defect.
- **`normalizeTag`.** The alias table is still not enumerated anywhere, so the
  alias→canonical mapping cannot be tested blind at all.

### C. Environment-dependent — 1

**`popOutPanel`.** Needed `window.open`, which the shim lacked; now stubbed. The
documented state half (the panel leaving the dock) is testable; the browser half
is not.

### D. Genuinely untestable, for a stated reason — 3

**`recomputeNow`.** Its only synchronous effect is clearing `_lastSig`, which the
store's own module contract declares outside any action's observable surface.
Asserting on it would contradict the contract under test. The author refused to
write a hollow test and said so, which is the right call.

**`scheduleCompute`** and the positive paths of the three snapshot actions —
all require the simulation server, which does not exist under test.

---

## What the exercise cost and returned

| | Start | Now |
|---|---|---|
| Tests | 795 | 912 |
| Failures | 84 | 23 |
| Modules with a captured description | 0 / 53 | 38 / 53 |

Test count rose while failures fell, which is the signal worth trusting: authors
strengthened assertions as contracts became specific rather than deleting the
ones that failed. The MCP author replaced a deliberately weakened `driverParams`
check with the exact projection boundary asserted across every library row in
both directions. The data author rebuilt every audit fixture on discovering its
units were wrong by three to four orders of magnitude — because the contract had
never said whether it read SI or display units.

Four real code defects, all latent, all found because a blind author asserted a
documented postcondition literally instead of checking what the function
currently returns. Six tooling defects, none of which a sighted reviewer would
have had reason to look for. And roughly forty documentation defects, which is
the honest measure of how much of that documentation read well only to someone
who already knew the answers.
