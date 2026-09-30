# Contract specification: `src/spice/schematic.js`

> Generated from method contracts. This file contains **no implementation code**.
> Write tests against what is claimed here, not against what you expect the code to do.

## Module

A SPICE netlist → a circuit diagram, drawn by netlistsvg.

The diagram is the raw circuit, part for part: every element of the
netlist is one symbol, every node one wire, laid out automatically by ELK.
It is not meant to be read like a hand-drawn schematic — it is the netlist
the engine solves, shown as a picture.

netlistsvg reads the JSON netlist format of the Yosys synthesis tool:
cells, each with named ports and the numbered nets they connect to. Two-
terminal parts use the analog skin's symbols; the rest — controlled
sources, behavioural sources, transmission lines — are labelled boxes.

## EXPORTED (2)

### `netlistToYosys(netlist)`

- **Reachability:** EXPORTED
- **Obtain via:** import { netlistToYosys } from '../../src/spice/schematic.js'

Convert a SPICE netlist to the JSON netlist netlistsvg draws.

Comments, control lines and the title are skipped. Each element becomes a
cell named as in the netlist, labelled with its value; each node becomes a
net. Ground is drawn as its own symbol at every terminal that touches it,
as a schematic would, rather than one wire to every part.

**Parameters**

- `netlist` — `string` — The netlist text.

**Returns**

- `{modules: {circuit: {ports: object, cells: object}}}, elements: number` — } The JSON netlist, and how many elements it holds.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `netlistToSvg(netlist, lib)`

- **Reachability:** EXPORTED
- **Obtain via:** import { netlistToSvg } from '../../src/spice/schematic.js'
- **Async:** returns a Promise

Draw a SPICE netlist as an SVG circuit diagram.

**Parameters**

- `netlist` — `string` — The netlist text.
- `lib` — `object` — The renderer: `{render, skin}` — netlistsvg's `render` and the text of its analog skin.

**Returns**

- `Promise<string>` — The SVG document.

**Throws**

- `Error` — When the netlist has no elements, or the layout fails.

**Side effects**

- Runs the layout engine.

## UNREACHABLE (3)

### `short(text)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

A number written short, for a label.

**Parameters**

- `text` — `string` — A SPICE number.

**Returns**

- `string` — Four significant figures when it is a plain number; the text unchanged otherwise.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `valueOf(letter, rest)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

The value label for one element.

**Parameters**

- `letter` — `string` — The element letter.
- `rest` — `string[]` — The tokens after its nodes.

**Returns**

- `string` — A short label; at most 48 characters.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `netlistToYosys > netOf(node)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

The net for a node, connecting a new ground symbol when it is ground.

**Parameters**

- `node` — `string` — The node name.

**Returns**

- `number` — Its net number.

**Mutates**

- the enclosing nets and cells.
