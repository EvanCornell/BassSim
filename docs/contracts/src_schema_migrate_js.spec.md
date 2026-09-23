# Contract specification: `src/schema/migrate.js`

> Generated from method contracts. This file contains **no implementation code**.
> Write tests against what is claimed here, not against what you expect the code to do.

## Module

Carry any saved project forward to the current format in one step.

v1 and v2 files kept everything the engine needed in one flat `settings`
object and gave every element a `Q`. v3 splits settings by purpose and
replaces `Q` with loss that has a physical meaning per element. The rules,
each chosen so an old project keeps doing what its author meant:

  waveguide   `space` → `mouthSpace`; `Q` → `loss: 1` (the old value
              described a frequency law that no longer exists); `lossless`
              → `loss: 0`.
  chamber     `Q` → `leakQL` with the same number, since that is how it has
              been used; `lossless` → sealed. `probe`/`probePos` become a
              pressure probe in `probes`.
  driver, pr  any extra `Q` folds into `Rms` — Rms + 2π·Fs·Mms/Q — so the
              mechanical damping is unchanged. A passive radiator's `in`
              handle becomes `rear`; its front is left open, as before.
  settings    sweep range, `masking`, `nlEnabled` → one analysis; `voltage`
              and `rg` → one channel; the rest → `display`.

## Exported constants

Names this module publishes that are not methods. The method contracts
above and below refer to these by role — a command, a node type, a panel —
so this is the vocabulary they assume.

### `__internals`

Keys: `migrateNodeParams`, `splitSettings`, `normalize`, `prFs`

## EXPORTED (1)

### `migrateProject(proj)`

- **Reachability:** EXPORTED
- **Obtain via:** import { migrateProject } from '../../src/schema/migrate.js'

Bring any saved project to the current format.

v1 and v2 files are converted (see the rules at the top of this module); a
v3 file is only normalized. A file from a newer build is normalized as if
it were v3 — whatever this build does not understand is kept where it can
be, and the caller decides whether to warn.

Idempotent: migrating a migrated project changes nothing.

**Parameters**

- `proj` — `object` — A parsed `.acousim.json` project of any version.

**Returns**

- `object` — A complete project at `SCHEMA_VERSION`.

**Postconditions (must hold on return)**

- proj is not modified

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

## INTERNAL (4)

### `prFs(p)`

- **Reachability:** INTERNAL
- **Obtain via:** import { __internals } from '../../src/schema/migrate.js'  →  __internals.prFs

Resonance of a passive radiator from its display-unit params.

**Parameters**

- `p` — `object` — Passive radiator params: `Mmd` and `addedMass` in g, `Cms` in mm/N.

**Returns**

- `number` — Fs in Hz.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `migrateNodeParams(node, from)`

- **Reachability:** INTERNAL
- **Obtain via:** import { __internals } from '../../src/schema/migrate.js'  →  __internals.migrateNodeParams

Convert one node's params from the v1/v2 layout to v3.

Params are converted in place on a copy; fields v3 no longer has are
removed so they cannot be mistaken for live settings later. A chamber's
probe is returned separately because v3 keeps probes at project level.

**Parameters**

- `node` — `object` — A serialized v1/v2 node: `{id, type, position, params}`.
- `from` — `number` — Schema version the file was written with.

**Returns**

- `{params: object, probe: object|null}` — The v3 params, and a probe entry when the node was a probed chamber.

**Postconditions (must hold on return)**

- node is not modified

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `splitSettings(s)`

- **Reachability:** INTERNAL
- **Obtain via:** import { __internals } from '../../src/schema/migrate.js'  →  __internals.splitSettings

Split a v1/v2 `settings` object into v3's analyses, wiring and display.

**Parameters**

- `s` — `object` — The old settings; missing fields take their old defaults.

**Returns**

- `{analyses: object[], wiring: object, display: object}` — The v3 sections.

**Postconditions (must hold on return)**

- s is not modified

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `normalize(proj)`

- **Reachability:** INTERNAL
- **Obtain via:** import { __internals } from '../../src/schema/migrate.js'  →  __internals.normalize

Fill every section of a v3 project from the defaults.

Node params are merged over `DEFAULT_PARAMS` so a file gains any parameter
added since it was written; channels over `DEFAULT_CHANNEL`; the rest over
their own defaults. Edges without an id get one that no other edge uses.

**Parameters**

- `proj` — `object` — A v3 project, possibly sparse — MCP tools and hand-written files usually are.

**Returns**

- `object` — A complete v3 project.

**Postconditions (must hold on return)**

- proj is not modified

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

## UNREACHABLE (3)

### `clone(v)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Deep-copy plain JSON data.

**Parameters**

- `v` — `*` — A JSON-safe value.

**Returns**

- `*` — An independent copy.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `splitSettings > pick(k, d)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

One old setting, or its old default when absent.

**Parameters**

- `k` — `string` — Setting name.
- `d` — `*` — Default.

**Returns**

- `*` — The value.

**Reads external mutable state**

- the enclosing settings.

### `normalize > freshId()`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

An edge id no other edge in this project uses.

**Returns**

- `string` — The id.

**Mutates**

- the local `used` set and counter.
