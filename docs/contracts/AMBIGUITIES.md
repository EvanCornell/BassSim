# Contract defects found by blind authorship

Every entry here was raised by an agent writing tests **from the contract alone**,
with no access to the implementation. That is what makes the list worth having: a
sighted reviewer resolves an ambiguous contract by glancing at the code and never
notices the ambiguity existed. A blind author cannot, so every place the
documentation is incomplete, contradictory or unverifiable surfaces as a question.

Most of the original list is now fixed. What remains is recorded here so the next
author does not have to rediscover it, and so the pattern stays visible.

---

## The pattern, stated once

Almost every defect found was one thing wearing different hats: **the contract
named a concept and never the identifier.**

- Store actions said "writes store state" — never which field
- `rawEval` described "symmetric mode" — never the flag
- `isPanelDrag` described a panel drag — never the payload type
- `loadCustom` described reading storage — never the key
- All 22 commands rendered as `COMMANDS['<id>']` — no real id anywhere
- Node types and handle names appeared nowhere, so solver fixtures were guesswork

This reads perfectly well if you already know the answers, which is exactly why
it survived. Four authors reported it independently before it was fixed.

The corollary is worth keeping in mind when writing new contracts: **if a clause
cannot be tested by someone who cannot read the code, it is not yet a contract.**

---

## Resolved

Contradictions fixed: `normQ`'s prose versus its `@param`; the Bessel
postconditions asserting exact float equality; `matIdentity` promising both
shared constants and free mutation; ten store actions falsely claiming
cross-window mirroring; `EXT_GROUPS` published with the wrong count; `COMMANDS`
published with 21 of its 26 keys.

Undocumented behaviour now stated: `fitDb`'s upper bound; `optimizeProject`'s
baseline evaluation; `nearestIdx`'s tie-breaking; `rawEval`'s `sym` flag and its
near-centre rule; `chamberMatrix`'s floor scope and its asymmetric stuffing
saturation; `hydrateProject`'s hydrated node shape; `auditDriver`'s units,
tolerances and air constants; `BUILTIN_DRIVERS`' collation; `struveH1`'s accuracy;
`rigid`'s actual magnitude; `flareCutoff`'s exponential family.

Vacuous contracts strengthened: `endCorrectionLength`, `snapLines`, `fmtVal` —
each was satisfiable by a constant-zero implementation.

Vocabulary published: command ids, command scopes, node types and their
parameters, node handle names, panel ids, quick-bar item ids, store state fields,
LocalStorage keys, the driver library's exports, the core T/S field set.

---

## Still open

### Cannot be tested blind at all

- **`normalizeTag`'s alias table.** "Resolve a tag alias to its canonical name"
  with no alias listed anywhere. The canonical set is now knowable via `TAGS`,
  but the mapping is not, so only passthrough and idempotence are assertable.
- **`formatExt`'s unit strings.** `EXT_BY_KEY` gives the valid keys, so the
  positive branch is now reachable, but no extended field's unit is stated —
  "with its unit appended" stays half-checkable.
- **`systemVolume`'s node shape.** Node type names are documented; which field
  carries a chamber's volume is not.
- **`isPanelDrag`'s positive branch.** The payload type is now named, but
  constructing a `DataTransfer` blind remains impractical.

### Underspecified

- **`calibratePort`'s "up to ~22 times"** is approximate in a contract that
  otherwise states exact bounds. Tested as ≤ 22.
- **`optimizeProject`'s grid endpoints** — inclusive of `min`/`max`, or not?
- **`run`'s 1024-point cap** — does the returned `settings` reflect the cap or
  the request?
- **`normalizeTable`'s 0.5–2 bounds** — inclusive? And what "the detected x = 0
  value" means for a table with no row at x = 0.
- **`curveHasContent` with `table: []`** — is an empty table content?
- **`freeSpotNear`'s distance metric** — Euclidean or Chebyshev, and does the
  boundary count as occupied?
- **`setAmp` on an impedance edit** — which of voltage/power is held and which
  derived? And what rounding applies to derived figures.
- **`dockPanel`'s "returns the original"** — identity or deep equality? In mild
  tension with the same method being `@pure` and documented as returning a new
  tree.
- **`serialize`'s `modified` format** — "string" only.
- **`driverToParams`'s label source** — now says it reads `model`, but the
  record's own field list is documented in a different module.
- **`parseJsdoc`'s return shape** — "the contract arrays" is still not
  enumerated, and whether `throws` is a list is unstated.
- **`takeType`'s remaining-text whitespace** — trimmed or not?

### Structural

- **`IS_MAC` and `formatCombo`** are environment-derived, so only the two output
  forms can be asserted, not which one is correct here.
- **Command scopes** now have a documented vocabulary, but no per-command scope
  is published — `COMMANDS`' nested keys show the field exists without its value.
- **A wrapped opening paragraph** may land wholly in `moduleDoc.summary` or spill
  into `description`; the contract does not say which.
- **Sixty-one methods remain unreachable** — closures nested inside other
  functions, and React components needing a renderer. They are labelled, not
  hidden, but nothing tests them.
