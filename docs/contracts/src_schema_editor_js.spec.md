# Contract specification: `src/schema/editor.js`

> Generated from method contracts. This file contains **no implementation code**.
> Write tests against what is claimed here, not against what you expect the code to do.

## Module

The bridge between a v3 project file and the editor's working state.

The editor keeps a flat `settings` object for the controls that predate the
v3 sections — sweep range, the toolbar's drive level, display options — and
keeps a chamber's own probe on the chamber node, where its form shows it.
The file keeps those in `analyses`, `wiring`, `display` and `probes`. These
two functions convert in each direction; the rest of those sections — named
params, every channel, the other probes, components — travel in `extras`,
which the Wiring, Project Parameters and Probes panels edit directly.

## EXPORTED (2)

### `toEditor(proj)`

- **Reachability:** EXPORTED
- **Obtain via:** import { toEditor } from '../../src/schema/editor.js'

Split a v3 project into the editor's working state.

`settings.voltage` is the first channel's output at the current master
level — the drive the user actually sees. A chamber's own probe — the one
with id `probe_<chamber id>`, which is what its checkbox writes — becomes its
`probe`/`probePos` params; every other probe stays in `extras`.

**Parameters**

- `proj` — `object` — A complete v3 project (see `migrateProject`).

**Returns**

- `{name: string, nodes: object[], edges: object[], settings: object, extras: object}` — Nodes in React Flow's shape (`{id, type, position, data: {params}}`), edges, the flat settings, and everything else.

**Postconditions (must hold on return)**

- proj is not modified

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `fromEditor(state)`

- **Reachability:** EXPORTED
- **Obtain via:** import { fromEditor } from '../../src/schema/editor.js'

Assemble a v3 project from the editor's working state.

The inverse of `toEditor`: the flat settings land back in the first
analysis, the first channel and the display section, and a probed chamber's
probe becomes an entry in `probes`. A first-channel voltage or output
resistance written as an expression is kept, not overwritten by its value.

**Parameters**

- `state` — `object` — The editor state.
- `state.name` — `string` — Project name.
- `state.nodes` — `object[]` — Nodes in React Flow's shape.
- `state.edges` — `object[]` — Edges.
- `state.settings` — `object` — The flat settings.
- `state.extras` — `object` _(optional)_ — What `toEditor` set aside.

**Returns**

- `object` — A v3 project, without the `modified` stamp.

**Postconditions (must hold on return)**

- state is not modified

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

## UNREACHABLE (2)

### `clone(v)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Deep-copy plain JSON data.

**Parameters**

- `v` — `*` — A JSON-safe value.

**Returns**

- `*` — An independent copy.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `gain(db)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

The linear gain a master level in dB applies.

**Parameters**

- `db` — `number` — Master level, dB.

**Returns**

- `number` — The voltage ratio.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.
