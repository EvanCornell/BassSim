# Contract defects found by blind authorship

Every entry here was raised by an agent writing tests **from the contract alone**,
with no access to the implementation. That is what makes the list worth having: a
sighted reviewer resolves an ambiguous contract by glancing at the code and never
notices the ambiguity existed. A blind author cannot, so every place the
documentation is incomplete, contradictory or unverifiable surfaces as a question.

This is a review of the documentation, not of the code. Entries are grouped by how
they should be resolved.

---

## A. Contract contradicts itself — must be fixed

### `normQ` (src/engine/solver.js)

The prose says a missing `Q` collapses onto `Infinity`. The parameter block says
`@param {number} [p.Q=50]`. Both cannot be true, and they imply opposite
behaviour for `normQ({})`.

### `besselJ1` / `besselJ0` (src/engine/acoustics.js)

The postconditions are written with exact equality on floating-point results
(`result === -J1(-x)`). That holds only if the implementation reduces to `|x|`
before evaluating; if it evaluates the polynomial on the signed argument the claim
is false by a few ulps. Either the contract should state a tolerance or it is
asserting something stronger than intended.

### `matIdentity` (src/engine/complex.js)

"Newly allocated matrix sharing the ZERO/ONE constants" combined with "callers are
free to overwrite it" cannot both hold for the entries. If the entries are shared
singletons, overwriting them corrupts every other matrix — the contract invites an
aliasing bug.

---

## B. Contract is incomplete — the behaviour exists but is undocumented

### `fitDb` (src/components/OutputPanel.jsx)

Documents a window *below* the peak and says nothing about the upper bound. The
implementation pads the top and rounds to a multiple of 5. A blind author asserted
`[peak − windowDb, peak]`, which is the only reading the text supports.

### `rawEval` (src/engine/nonlinear.js)

Describes "symmetric mode" without ever naming the property that enables it. Two
independent agents guessed `curve.symmetric`; the real flag is spelled differently.

### `nearestIdx` (src/components/OutputPanel.jsx)

"Index of the nearest sample" does not say how ties resolve. The implementation and
a reasonable blind reading pick opposite ends of a tie.

### `hydrateProject` (src/engine/project.js)

Never enumerates valid node `type` values, never states an edge's field names, and
references `DEFAULT_PARAMS`/`DEFAULT_SETTINGS` without either being specified. Its
two documented throw conditions are consequently **not independently testable**: a
node missing only an id also trips the unknown-type branch.

### `driverSI` (src/engine/solver.js)

Documents no field name for the driver count or the wiring mode; both had to be
borrowed from the `mcp/builders.js` contract. "Parallel wiring divides the
electrical terms" never enumerates which terms.

### `radiationImpedance` (src/engine/acoustics.js)

"Rigid returns a near-infinite impedance" gives no magnitude, so the claim cannot
be checked without inventing a threshold. The `solidAngle` union also mixes two
different kinds of thing — actual solid angles and termination models — and the
`2π/Ω` relation has no defined Ω for `rigid` or `anechoic`.

### `isPanelDrag` (src/components/dock/DockLayout.jsx)

The payload key identifying a panel drag is never stated, so only the negative
cases are testable. Flagged as the weakest contract in its group.

### `loadCustom` (src/components/DriverDB.jsx)

The LocalStorage key is not documented, so the corrupt-data branch cannot be set up
blind. Only "absent → `[]`" is coverable.

---

## C. Contract is too weak to constrain the implementation

### `endCorrectionLength` (src/engine/geometry.js)

Its only postcondition — `result >= 0 when factor >= 0` — is satisfied by a
constant-zero implementation. Nearly vacuous. Monotonicity in both arguments is
derivable from the prose and should be stated.

### `struveH1` (src/engine/acoustics.js)

No accuracy claim, while its Bessel siblings state "roughly 1e-8". The
approximation is materially looser and nothing says how much.

### `snapLines` (src/components/OutputPanel.jsx)

Neither the line-descriptor field names nor the snapshot shape are documented.
"Dashed and thinner than the live trace" is not checkable from the contract.

### `fmtVal` (src/components/NLLab.jsx)

"Readable precision for its magnitude" fixes no digit count.

### `cycleAverage` (src/engine/nonlinear.js)

"24 points sampled uniformly in phase" states no phase offset, so the exact average
is not derivable — only offset-independent properties are assertable.

---

## D. Genuinely underdetermined edge cases

- `normalizeTable` — whether the 0.5–2 bounds are inclusive; and what "the detected
  x = 0 value" means for a table with no row at x = 0.
- `curveHasContent` — whether `table: []` counts as content.
- `flareCutoff` — never says which flares are "exponential-family". Only conical and
  parabolic are stated to return `null`, while `areaProfile` describes tractrix and
  Le Cléac'h as hyperbolic-exponential approximations. If either returns `null` the
  two contracts contradict each other.
- `jwPow` — the precondition `w >= 0` admits `w = 0`, but `(j·0)ⁿ` is undefined on
  the principal branch as usually implemented. If the code returns NaN there, the
  precondition should exclude zero.
- `div` — "division by zero yields Infinity/NaN rather than throwing" is a
  `@returns`-level guarantee stated inside a `@pre`.
- `LeExp` — appears in a return type with no description at all.
- `tlineMatrix` — the `c` default is `C_AIR`, which is not documented as an export,
  so a blind author cannot verify the default's value.
- `chartPanelComponent` — `@pure` on a factory returning a fresh component each call
  can only mean identical output if the factory memoises. As written the claim is
  either false or requires memoisation the contract does not mention.
