# Contract specification: `src/spice/wiring.js`

> Generated from method contracts. This file contains **no implementation code**.
> Write tests against what is claimed here, not against what you expect the code to do.

## Module

Amplifier channels as netlist sources.

Each channel is an AC voltage source at its level (volts at master 0 dB,
scaled by the master), then its DSP, then its output resistance, then a
current sense, then its load: a series/parallel tree whose leaves are
driver nodes. The tree is compiled into terminal nodes for each driver, so
the drivers themselves never need to know how they are wired.

## EXPORTED (1)

### `compileWiring(ctx, proj)`

- **Reachability:** EXPORTED
- **Obtain via:** import { compileWiring } from '../../src/spice/wiring.js'

Compile every channel, and assign each driver its electrical terminals.

A channel whose `load` is `null` drives, in parallel, every driver that no
explicit tree claims. A driver no channel reaches gets terminals of its own
that connect to nothing — an open coil.

**Parameters**

- `ctx` — `object` — Compile context.
- `proj` — `object` — The resolved project.

**Returns**

- `Map<string, {ep: string, em: string}>` — Driver id → its + and − terminal nodes.

**Throws**

- `Error` — When a channel uses a DSP filter, which this compiler cannot yet build.

**Mutates**

- ctx.nl and ctx.map.channels.

## UNREACHABLE (1)

### `compileWiring > wire(tree, a, b)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Wire a load tree between two nodes.

**Parameters**

- `tree` — `object` — `{driver}`, `{parallel: [...]}` or `{series: [...]}`.
- `a` — `string` — The + side.
- `b` — `string` — The − side.

**Returns**

- `void`

**Mutates**

- the enclosing `terms` map and the netlist.
