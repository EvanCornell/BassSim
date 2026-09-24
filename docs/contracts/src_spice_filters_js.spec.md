# Contract specification: `src/spice/filters.js`

> Generated from method contracts. This file contains **no implementation code**.
> Write tests against what is claimed here, not against what you expect the code to do.

## Module

DSP filters as ordinary circuit parts.

The ngspice build has no transfer-function block, so every filter is a
cascade of first- and second-order sections, each one a real R-L-C network
read out through controlled sources. That keeps the filter an ordinary
circuit, valid in the frequency sweep and in a later transient run alike.

A second-order section H(s) = (b2·s² + b1·s + b0) / (s² + a1·s + a0) is a
series L-R-C driven by the section's input: the voltage across L is
s²/D(s), across R a1·s/D(s) and across C a0/D(s), so any numerator is a sum
of those three voltages with fixed gains. A first-order section
(b1·s + b0) / (s + a0) is the same with an R-C divider.

## Exported constants

Names this module publishes that are not methods. The method contracts
above and below refer to these by role — a command, a node type, a panel —
so this is the vocabulary they assume.

### `FILTER_TYPES`

Filter types a channel's DSP may hold.

Values: `highpass`, `lowpass`, `peq`, `lowshelf`, `highshelf`

### `FILTER_SHAPES`

Alignments for high- and low-pass filters.

Values: `butterworth`, `linkwitz-riley`

## EXPORTED (4)

### `butterworthStages(order)`

- **Reachability:** EXPORTED
- **Obtain via:** import { butterworthStages } from '../../src/spice/filters.js'

The Q of each second-order stage of a Butterworth filter, and whether it has a first-order stage.

**Parameters**

- `order` — `number` — Filter order, 1 or more.

**Returns**

- `{qs: number[], first: boolean}` — Stage Qs, and whether a first-order stage completes an odd order.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `filterSections(f)`

- **Reachability:** EXPORTED
- **Obtain via:** import { filterSections } from '../../src/spice/filters.js'

Break one filter into first- and second-order sections.

Coefficients are for H(s) with s in rad/s; each section is normalised so
its denominator is monic. Linkwitz-Riley of order 2n is two Butterworth
filters of order n in cascade, so an odd Linkwitz-Riley order is rounded up
to the next even one. Gains for the parametric and shelving filters are in
dB and follow the analogue prototypes behind the common audio "cookbook"
biquads.

**Parameters**

- `f` — `object` — A filter: `{type, shape, order, hz}` for high/low pass; `{type, hz, q, db}` for `peq`, `lowshelf`, `highshelf`.

**Returns**

- `Array<{order: 1|2, b: number[], a: number[]}>` — Sections in cascade. Second order: `b = [b2, b1, b0]`, `a = [a1, a0]`. First order: `b = [b1, b0]`, `a = [a0]`.

**Throws**

- `Error` — When the filter type is unknown or a value is out of range.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `sectionsResponse(sections, hz)`

- **Reachability:** EXPORTED
- **Obtain via:** import { sectionsResponse } from '../../src/spice/filters.js'

Evaluate a cascade of sections at one frequency.

**Parameters**

- `sections` — `Array<object>` — From `filterSections`.
- `hz` — `number` — Frequency, Hz.

**Returns**

- `{re: number, im: number}` — The complex response.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `compileSections(nl, input, sections, note)`

- **Reachability:** EXPORTED
- **Obtain via:** import { compileSections } from '../../src/spice/filters.js'

Add a cascade of sections to a netlist, from a driven node to a new one.

Each section reads its input as a node voltage and drives its output from
an ideal controlled source, so sections never load one another. Element
values are scaled to the section's natural frequency to stay near unity.

**Parameters**

- `nl` — `object` — The netlist builder.
- `input` — `string` — A node driven by an ideal source.
- `sections` — `Array<object>` — From `filterSections`.
- `note` — `string` — Comment naming the channel.

**Returns**

- `string` — The node carrying the filtered signal.

**Mutates**

- nl.
