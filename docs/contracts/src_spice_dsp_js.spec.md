# Contract specification: `src/spice/dsp.js`

> Generated from method contracts. This file contains **no implementation code**.
> Write tests against what is claimed here, not against what you expect the code to do.

## Module

Signal processing for the time-domain analyses: test signals, FFTs,
harmonic measurement and display decimation.

Each test signal exists twice, as the same formula: a behavioural-source
expression over `time` that drives the circuit, and a JavaScript function
that samples it for the linear (FFT) path and for measurement. Keeping them
side by side is what lets a transient run be checked against the linear
response of the same model.

## Exported constants

Names this module publishes that are not methods. The method contracts
above and below refer to these by role — a command, a node type, a panel —
so this is the vocabulary they assume.

### `SIGNAL_TYPES`

Signal types a transient analysis may use.

Values: `sine`, `burst`, `sweep`, `noise`

## EXPORTED (13)

### `normalizeSignal(sig)`

- **Reachability:** EXPORTED
- **Obtain via:** import { normalizeSignal } from '../../src/spice/dsp.js'

Fill in a signal's defaults.

- `sine`: `hz`, faded in over `fade` cycles (default 2) so the start does
  not ring the box.
- `burst`: `hz`, `cycles` (default 6.5), Hann-windowed — the CEA-2010 shape.
- `sweep`: exponential from `f1` to `f2` over `length` s.
- `noise`: pink, `f1`–`f2` band, `length` s, seeded so a run repeats.

**Parameters**

- `sig` — `object` — A signal, possibly sparse.

**Returns**

- `object` — The complete signal.

**Throws**

- `Error` — For an unknown type or a non-positive frequency.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `signalLength(sig)`

- **Reachability:** EXPORTED
- **Obtain via:** import { signalLength } from '../../src/spice/dsp.js'

How long a signal lasts before it is silent, s.

**Parameters**

- `sig` — `object` — A normalised signal.

**Returns**

- `number` — The active length; `Infinity` for a sine.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `signalFunction(sig, fs)`

- **Reachability:** EXPORTED
- **Obtain via:** import { signalFunction } from '../../src/spice/dsp.js'

The signal as a function of time, peak amplitude 1 (noise: RMS 1).

**Parameters**

- `sig` — `object` — A normalised signal.
- `fs` — `number` _(optional)_ — Sample rate, Hz — needed for noise only.

**Returns**

- `Function` — `t → value`.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `signalExpression(sig, amp)`

- **Reachability:** EXPORTED
- **Obtain via:** import { signalExpression } from '../../src/spice/dsp.js'

The signal as a behavioural-source expression over `time`.

Only functions verified in this ngspice build appear: `sin`, `cos`, `exp`,
comparisons and the conditional. Noise is not an expression; it is given
as sampled points instead (see `signalPoints`).

**Parameters**

- `sig` — `object` — A normalised signal, not noise.
- `amp` — `number` — Peak amplitude, V.

**Returns**

- `string` — The expression.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `signalPoints(sig, amp, fs)`

- **Reachability:** EXPORTED
- **Obtain via:** import { signalPoints } from '../../src/spice/dsp.js'

Sampled points of a signal, for a PWL source.

**Parameters**

- `sig` — `object` — A normalised signal.
- `amp` — `number` — Scale, V (peak for tones, RMS for noise).
- `fs` — `number` — Sample rate, Hz.

**Returns**

- `number[]` — Alternating time, value pairs, ending in silence.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `pinkNoise(sig, fs)`

- **Reachability:** EXPORTED
- **Obtain via:** import { pinkNoise } from '../../src/spice/dsp.js'

Band-limited pink noise, RMS 1, repeatable from its seed.

Built in the frequency domain: random phases, amplitude ∝ 1/√f inside
f1–f2 and zero outside, so the band edges are exact.

**Parameters**

- `sig` — `object` — A normalised noise signal.
- `fs` — `number` — Sample rate, Hz.

**Returns**

- `Float64Array` — The samples.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `nextPow2(n)`

- **Reachability:** EXPORTED
- **Obtain via:** import { nextPow2 } from '../../src/spice/dsp.js'

The smallest power of two at least n.

**Parameters**

- `n` — `number` — A count.

**Returns**

- `number` — The power of two.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `fft(re, im, inverse)`

- **Reachability:** EXPORTED
- **Obtain via:** import { fft } from '../../src/spice/dsp.js'

In-place radix-2 FFT.

**Parameters**

- `re` — `Float64Array` — Real parts; length a power of two.
- `im` — `Float64Array` — Imaginary parts.
- `inverse` — `boolean` _(optional)_ — Inverse transform, scaled by 1/n.

**Returns**

- `void`

**Mutates**

- re and im.

### `irfft(re, im)`

- **Reachability:** EXPORTED
- **Obtain via:** import { irfft } from '../../src/spice/dsp.js'

A real signal from its one-sided spectrum.

**Parameters**

- `re` — `Float64Array` — Real parts at bins 0 … n/2.
- `im` — `Float64Array` — Imaginary parts at bins 0 … n/2.

**Returns**

- `Float64Array` — The n real samples.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `rfft(x, n)`

- **Reachability:** EXPORTED
- **Obtain via:** import { rfft } from '../../src/spice/dsp.js'

The one-sided spectrum of real samples, zero-padded to a power of two.

**Parameters**

- `x` — `ArrayLike<number>` — Samples.
- `n` — `number` _(optional)_ — Transform length; the next power of two by default.

**Returns**

- `{re: Float64Array, im: Float64Array}` — Bins 0 … n/2.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `harmonics(x, fs, f, count, periods)`

- **Reachability:** EXPORTED
- **Obtain via:** import { harmonics } from '../../src/spice/dsp.js'

The amplitude of each harmonic of f in a steady-state stretch of signal.

A direct Fourier sum at each harmonic over a whole number of fundamental
periods, so there is no leakage from the window as long as the stretch
really is periodic.

**Parameters**

- `x` — `ArrayLike<number>` — Samples.
- `fs` — `number` — Sample rate, Hz.
- `f` — `number` — Fundamental, Hz.
- `count` — `number` — Harmonics to measure, from the fundamental.
- `periods` — `number` — Whole periods to analyse, taken from the end of `x`.

**Returns**

- `Array<{n: number, hz: number, amp: number, phase: number}>` — Peak amplitude and phase of each harmonic.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `thd(h)`

- **Reachability:** EXPORTED
- **Obtain via:** import { thd } from '../../src/spice/dsp.js'

Total harmonic distortion from harmonic amplitudes.

**Parameters**

- `h` — `Array<{amp: number}>` — From `harmonics`; the first is the fundamental.

**Returns**

- `number` — THD as a fraction of the fundamental.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `decimate(t, ys, max)`

- **Reachability:** EXPORTED
- **Obtain via:** import { decimate } from '../../src/spice/dsp.js'

Thin a long series for drawing, keeping each bucket's extremes.

**Parameters**

- `t` — `ArrayLike<number>` — Sample times.
- `ys` — `Array<ArrayLike<number>>` — Series sharing those times.
- `max` — `number` — Most points to keep.

**Returns**

- `{t: number[], ys: number[][]}` — The thinned times and series. With more samples than `max`, each bucket keeps two points — its first series' minimum and maximum, in time order — so peaks survive.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

## UNREACHABLE (2)

### `signalExpression > n(v)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

A number written for the netlist.

**Parameters**

- `v` — `number` — The value.

**Returns**

- `string` — Twelve significant figures.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `rng(seed)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

A small seeded random generator (mulberry32).

**Parameters**

- `seed` — `number` — Seed.

**Returns**

- `Function` — `() → [0, 1)`.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.
