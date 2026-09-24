# Contract specification: `src/schema/nominal.js`

> Generated from method contracts. This file contains **no implementation code**.
> Write tests against what is claimed here, not against what you expect the code to do.

## Module

Nominal impedances, for showing watts beside volts.

A channel stores volts, never watts. The watts it shows are its voltage
squared over the nominal load its wiring presents — the figure an amplifier
is rated against. Nominal is a label, not a measurement: it comes from each
driver's voice-coil resistance, rounded to the standard ratings, then
combined through the node's own array and the channel's series/parallel
tree. The minimum impedance the simulation finds is shown separately.

## EXPORTED (4)

### `ratingOf(re)`

- **Reachability:** EXPORTED
- **Obtain via:** import { ratingOf } from '../../src/schema/nominal.js'

The nominal rating a voice-coil resistance belongs to.

Re is typically 70–90% of nominal, so the rating is the standard value
nearest Re / 0.85 on a logarithmic scale.

**Parameters**

- `re` — `number` — DC resistance, Ω.

**Returns**

- `number` — The nominal rating, Ω; 0 for a non-positive resistance.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `driverNominal(p)`

- **Reachability:** EXPORTED
- **Obtain via:** import { driverNominal } from '../../src/schema/nominal.js'

The nominal impedance of one driver node as its terminals present it.

Each driver is rated from its coil resistance first, then the node's array
wiring combines those ratings, so four 4 Ω drivers in parallel read 1 Ω.

**Parameters**

- `p` — `object` — Driver params, resolved.

**Returns**

- `number` — Nominal Ω.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `treeNominal(tree, drivers)`

- **Reachability:** EXPORTED
- **Obtain via:** import { treeNominal } from '../../src/schema/nominal.js'

The nominal impedance of a load tree.

**Parameters**

- `tree` — `object|null` — `{driver}`, `{series: [...]}` or `{parallel: [...]}`.
- `drivers` — `Map<string, object>` — Driver node id → resolved params.

**Returns**

- `number` — Nominal Ω; `Infinity` for an empty tree (nothing connected).

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `effectiveLoad(channel, proj)`

- **Reachability:** EXPORTED
- **Obtain via:** import { effectiveLoad } from '../../src/schema/nominal.js'

The load tree a channel actually drives.

An explicit tree is used as it stands. The catch-all channel (`load: null`)
drives every driver no explicit tree claims, in parallel.

**Parameters**

- `channel` — `object` — A wiring channel.
- `proj` — `object` — The project, for its driver nodes and other channels.

**Returns**

- `object` — A load tree.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

## UNREACHABLE (1)

### `coilRe(p)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Re of one driver in a node after its dual voice coil option.

Catalogue figures are both coils in series; parallel quarters Re, one coil
alone halves it.

**Parameters**

- `p` — `object` — Driver params, resolved.

**Returns**

- `number` — Re, Ω.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.
