# Contract specification: `src/spice/netlist.js`

> Generated from method contracts. This file contains **no implementation code**.
> Write tests against what is claimed here, not against what you expect the code to do.

## Module

A small builder for SPICE netlists.

Element and node names are generated, never taken from the graph, so
nothing a user types can reach the netlist as syntax. Each element may carry
a comment naming the graph node it came from, which is what makes a netlist
readable when it is exported or debugged.

Domain conventions (impedance analogy): acoustic nets carry pressure (Pa) as
voltage and volume velocity (m³/s) as current; mechanical nets force (N) and
velocity (m/s); electrical nets volts and amps. Node `0` is the common
reference — ambient pressure, rest, and electrical ground.

## Exported constants

Names this module publishes that are not methods. The method contracts
above and below refer to these by role — a command, a node type, a panel —
so this is the vocabulary they assume.

### `DC_TIE`

Acoustic resistance, Pa·s/m³, put in series with every acoustic element
that is a short circuit at DC (inductors, transmission lines, sense
sources). Without it a loop of such elements — two ducts in parallel, two
radiators on one junction — makes SPICE's DC operating point singular. It
is about a millionth of any acoustic impedance in a loudspeaker model.

Value: `0.001`

## EXPORTED (4)

### `fmt(v)`

- **Reachability:** EXPORTED
- **Obtain via:** import { fmt } from '../../src/spice/netlist.js'

Format a number for a netlist.

**Parameters**

- `v` — `number` — The value.

**Returns**

- `string` — Twelve significant figures, exponent form where needed.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `createNetlist(title)`

- **Reachability:** EXPORTED
- **Obtain via:** import { createNetlist } from '../../src/spice/netlist.js'

Start an empty netlist.

**Parameters**

- `title` — `string` — The title line.

**Returns**

- `object` — The builder: `node`, `add`, `comment`, `text`, and `lines` for inspection.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `resistor(nl, a, b, R, note)`

- **Reachability:** EXPORTED
- **Obtain via:** import { resistor } from '../../src/spice/netlist.js'

Add a series resistor.

**Parameters**

- `nl` — `object` — A netlist builder.
- `a` — `string` — One node.
- `b` — `string` — The other node.
- `R` — `number` — Resistance.
- `note` — `string` _(optional)_ — Comment.

**Returns**

- `string` — The element name.

**Mutates**

- nl.

### `sense(nl, a, note, to)`

- **Reachability:** EXPORTED
- **Obtain via:** import { sense } from '../../src/spice/netlist.js'

Add a 0 V sense source followed by the DC tie, from `a` to a new node.

Current through the source, `i(name)`, is the flow from `a` onward. The tie
keeps loops of such sources from making the DC solution singular.

**Parameters**

- `nl` — `object` — A netlist builder.
- `a` — `string` — The node the flow leaves.
- `note` — `string` _(optional)_ — Comment.
- `to` — `string` _(optional)_ — An existing node to end on; a new one by default.

**Returns**

- `{name: string, out: string}` — The source's name and the node beyond the tie.

**Mutates**

- nl.

## UNREACHABLE (4)

### `createNetlist > node()`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

A fresh node name.

**Returns**

- `string` — The name.

**Mutates**

- the builder's node counter.

### `createNetlist > add(letter, pins, value, note)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Add one element.

**Parameters**

- `letter` — `string` — SPICE element letter (R, L, C, V, E, F, H, T).
- `pins` — `string[]` — Node names, and for H/F the controlling source name last.
- `value` — `string` — Everything after the pins: a value, or keyword parameters.
- `note` — `string` _(optional)_ — A comment appended to the line.

**Returns**

- `string` — The element's name.

**Mutates**

- the builder's lines and counters.

### `createNetlist > comment(text)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Add a comment line.

**Parameters**

- `text` — `string` — The comment.

**Returns**

- `void`

**Mutates**

- the builder's lines.

### `createNetlist > text()`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

The netlist so far, as text.

**Returns**

- `string` — Newline-joined lines.

**Reads external mutable state**

- the builder's lines.
