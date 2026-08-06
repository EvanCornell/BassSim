# Contract specification: `src/engine/metrics.js`

> Generated from method contracts. This file contains **no implementation code**.
> Write tests against what is claimed here, not against what you expect the code to do.

## Module

Derived metrics from a completed sweep.

## Exported constants

Names this module publishes that are not methods. The method contracts
above and below refer to these by role — a command, a node type, a panel —
so this is the vocabulary they assume.

### `__internals`

Keys: `localMaxima`

## EXPORTED (1)

### `computeMetrics(res, settings)`

- **Reachability:** EXPORTED
- **Obtain via:** import { computeMetrics } from '../../src/engine/metrics.js'

Reduce a completed sweep to the scalar figures shown in the quick bar.

Passband level is the median of the top quartile of SPL rather than the peak,
so a single resonance spike cannot drag the reference — and therefore F3 —
off with it. F3 and F10 are then found by linear interpolation at the first
upward crossing of that reference.

The impedance peak count decides how the box is interpreted: two peaks mean a
vented alignment, so the minimum between them is the tuning `fb`; one peak
means sealed, so it is `fc` and `qtc` follows from the exact second-order
high-pass relation between fc and F3. Note that the reported `zPeaks` is the
peak *list*, not the count — `zPeaks.length` is what the branch above turns
on. Zero peaks, or three or more, yield neither `fb` nor `fc`.

Maximum power before Xmax is driven by the per-driver headroom ratio, so a
mixed set of drivers is judged against each cone's own limit; it falls back
to a single global Xmax for results produced before that ratio existed.

**Parameters**

- `res` — `object|null` — A result from `runSimulation`.
- `settings` — `object` — Sweep settings.
- `settings.voltage` — `number` _(optional, default `2.83`)_ — Drive voltage the sweep was run at, V RMS.
- `settings.xmax` — `number` _(optional)_ — Legacy single Xmax, mm, used only when the result carries no per-driver ratio.

**Returns**

- `object|null` — Metrics — any of `passband`, `peakSPL`, `f3`, `f10`, `bwHz`, `bwOct`, `zPeaks` (an array of at most five `{f, v, i}` peak descriptors — frequency in Hz, impedance magnitude in Ω, and the sweep index — in ascending frequency), `fb`, `fbZ`, `fc`, `qtc`, `xPeak`, `xPeakF`, `xAtFb`, `xAtF3`, `xRatioPeak`, `xRatioPeakF`, `xLimitDriver`, `maxPower`, `vMax` — or `null` when the sweep failed or is empty. Most fields are simply absent when the topology does not define them, so a sealed box has no `fb` key at all. The exceptions are `f3`, `f10`, `xPeakF`, `xAtFb` and `xAtF3`, which are always present and carry `null` when undefined — `xAtFb` is null for a sealed box because it is looked up at a tuning that does not exist.

**Postconditions (must hold on return)**

- res and settings are not modified

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

## INTERNAL (1)

### `localMaxima(freqs, vals, minProminence)`

- **Reachability:** INTERNAL
- **Obtain via:** import { __internals } from '../../src/engine/metrics.js'  →  __internals.localMaxima

Find prominent local maxima in a sampled curve.

Used to locate impedance peaks, which is how the tuning frequency and box
alignment are identified. Two filters keep noise out: a peak must rise
`minProminence` above the lowest point within ±40 samples, and peaks closer
together than 5% in frequency are merged to the taller one — a single
physical resonance sampled on a log grid often produces several adjacent
candidates.

The first and last two samples are skipped, so a curve that is still rising
at the edge of the sweep reports no peak there rather than a false one.

**Parameters**

- `freqs` — `number[]` — Frequency axis, Hz, ascending.
- `vals` — `number[]` — Curve sampled on that axis.
- `minProminence` — `number` _(optional, default `1`)_ — Minimum rise above the local floor, in the units of `vals`.

**Returns**

- `Array<{f: number, v: number, i: number}>` — Surviving peaks in ascending frequency order, each with its frequency, value and sample index.

**Preconditions (caller must guarantee)**

- freqs.length === vals.length

**Postconditions (must hold on return)**

- freqs and vals are not modified

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

## UNREACHABLE (2)

### `computeMetrics > findFx(drop)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Frequency at which the response first rises to `drop` dB below passband.

Scans upward and interpolates linearly between the straddling samples, so
the answer is not quantised to the sweep grid.

**Parameters**

- `drop` — `number` — Level below passband to find, dB (3 for F3, 10 for F10).

**Returns**

- `number|null` — The crossing frequency in Hz, or `null` when the response never reaches that level anywhere in the sweep.

**Reads external mutable state**

- the enclosing sweep's `splCombined`, `freqs` and computed `pass` level.

### `computeMetrics > atFreq(f)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Cone excursion at the sweep sample nearest a given frequency.

Nearest is measured in log-frequency, matching the sweep's own spacing, so
the choice is not biased toward the high end of the range.

**Parameters**

- `f` — `number|null` — Frequency of interest, Hz. A falsy value means the caller had no such frequency to look up.

**Returns**

- `number|null` — Excursion in mm, or `null` when `f` is falsy.

**Reads external mutable state**

- the enclosing sweep's `freqs` and `excursion` arrays.
