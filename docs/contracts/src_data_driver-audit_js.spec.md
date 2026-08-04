# Contract specification: `src/data/driver-audit.js`

> Generated from method contracts. This file contains **no implementation code**.
> Write tests against what is claimed here, not against what you expect the code to do.

## Module

Internal-consistency audit for a driver record.

A T/S set is over-determined: Qes, Qts and Vas are all implied by the
parameters the solver actually runs on (Bl, Re, Mms, Cms, Rms, Sd). When a
published value disagrees with the one implied by its siblings, the row is
describing two different drivers, and the simulation will follow the
solver's set — not the headline Qts a buyer recognises.

That is worth surfacing rather than silently correcting: the fix requires
knowing which column was mis-transcribed, which only the datasheet can say.
So the audit labels the row and the UI warns. The importer runs this at
generation time and the test suite enforces that any row failing an audit
carries its label, so a bad import cannot land unannounced.

## Exported constants

Names this module publishes that are not methods. The method contracts
above and below refer to these by role — a command, a node type, a panel —
so this is the vocabulary they assume.

### `TOL`

Per-parameter tolerances for the consistency audit, as relative differences.

Set above the rounding noise of a published table — a catalog quoting Q to two
decimals cannot be held tighter than a few percent — and below the level at
which a mismatch changes the predicted alignment. Vas is loosest because
manufacturers disagree on how much of the surround counts toward Sd, and Sd
enters the relation squared.

Keys: `Qes`, `Qts`, `Vas`

## EXPORTED (1)

### `auditDriver(d)`

- **Reachability:** EXPORTED
- **Obtain via:** import { auditDriver } from '../../src/data/driver-audit.js'

Check a driver record against the identities its own parameters imply.

A T/S set is over-determined: Qes, Qts and Vas all follow from the Bl, Re,
Mms, Cms and Sd the solver actually runs on. When a published value disagrees
with the one implied by its siblings, the row describes two different drivers,
and the simulation will follow the solver's set rather than the headline
figure a buyer recognises.

Discrepancies are returned as human-readable sentences rather than codes
because they are shown verbatim in the database browser and committed into the
generated data as `suspect` labels. Nothing is corrected here — the fix
requires knowing which column was mis-transcribed, which only the datasheet
can say.

Each check is skipped unless every value it needs is present and positive, so
a sparse hand-transcribed row is audited on whatever it does provide instead
of being flagged for what it omits.

Three identities are checked, each only when every value it needs is present
and positive: Qes against ωs·Mms·Re/Bl², Qts against Qes ∥ Qms, and Vas
against ρc²·Sd²·Cms. Fields are read in the database's own display units —
Mms in grams, Cms in mm/N, Sd in cm², Vas in litres — and converted
internally. The tolerances live in `TOL` and are relative, not absolute.

**Parameters**

- `d` — `object` — A driver record. Reads `Fs`, `Qes`, `Qts`, `Qms`, `Vas`, `Re`, `Bl`, `Mms`, `Cms` and `Sd`.

**Returns**

- `string[]` — One sentence per inconsistency found, empty when the record is self-consistent. Wording is for humans and is not a stable interface.

**Postconditions (must hold on return)**

- d is not modified.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

## UNREACHABLE (2)

### `rel(a, b)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Relative difference between a computed value and a published one.

**Parameters**

- `a` — `number` — The computed value.
- `b` — `number` — The published value, used as the denominator.

**Returns**

- `number` — `|a - b| / |b|`, so 0.1 is a 10% disagreement.

**Preconditions (caller must guarantee)**

- b is non-zero — every caller guards with `> 0` first

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `pct(a, b)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

The same difference as a whole percentage, for the message text.

**Parameters**

- `a` — `number` — The computed value.
- `b` — `number` — The published value.

**Returns**

- `number` — The difference in percent, rounded.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.
