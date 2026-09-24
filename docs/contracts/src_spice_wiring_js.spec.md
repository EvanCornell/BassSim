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

- `Error` — When a channel's DSP filter is malformed.

**Mutates**

- ctx.nl and ctx.map.channels.

## UNREACHABLE (2)

### `transientSource(ctx, node, volts, label)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

A channel's source for a transient run: the test signal at the channel's level.

The channel's volts are RMS, as in the sweep: a tone's peak is √2 times
them, and noise has them as its RMS. The run's `levelDb` moves every
channel together, like the master.

**Parameters**

- `ctx` — `object` — Compile context carrying `tran: {signal, levelDb, fs}`.
- `node` — `string` — The source node.
- `volts` — `number` — The channel's RMS volts at the master level, negative for inverted polarity.
- `label` — `string` — Channel label, for the comment.

**Returns**

- `void`

**Mutates**

- ctx.nl.

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
