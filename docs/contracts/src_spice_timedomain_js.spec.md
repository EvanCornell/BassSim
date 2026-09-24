# Contract specification: `src/spice/timedomain.js`

> Generated from method contracts. This file contains **no implementation code**.
> Write tests against what is claimed here, not against what you expect the code to do.

## Module

Time-domain analyses, on the same circuit the frequency sweep solves.

- Linear responses — impulse, step, tone burst, cumulative spectral decay —
  by inverse FFT of a fine linear frequency sweep. Exact for the linear
  model, and quick.
- Transient runs — any test signal through the circuit in time, with the
  nonlinear elements (driver curves, port exit loss) switched on or off.
- Distortion — harmonics of a steady tone, THD across frequency,
  compression across level, and a CEA-2010-style burst maximum SPL — each
  a series of transient runs, measured.

Every analysis takes a resolved, validated project (see `prepareProject`)
and reports progress through an optional callback, so a worker can show it
and the caller can abandon the run.

Runs that do not depend on each other are started together: where the
engine sits behind a thread pool (see `run.js`), they go side by side, one
per thread; in a single process they simply queue.

## Exported constants

Names this module publishes that are not methods. The method contracts
above and below refer to these by role — a command, a node type, a panel —
so this is the vocabulary they assume.

### `LINEAR_DEFAULTS`

Defaults for the linear time responses.

`bandwidth` is the highest frequency simulated (and half the sample rate
of the responses); `resolution` the frequency step, whose inverse is the
length of the responses in seconds.

Keys: `bandwidth`, `resolution`, `burstHz`, `burstCycles`, `csdSlices`, `csdStepMs`

### `TRANSIENT_DEFAULTS`

Defaults for a transient run.

Keys: `signal`, `levelDb`, `fs`, `duration`, `bandwidth`, `nonlinear`

- `signal` holds: `type`, `hz`, `cycles`

### `CEA2010_LIMITS`

CEA-2010 distortion limits: harmonic → allowed level relative to the fundamental, dB.

Keys: `2`, `3`, `4`, `5`, `6`, `7`, `8`, `9`, `10`

### `DISTORTION_DEFAULTS`

Defaults for the distortion analyses.

Keys: `hz`, `levelDb`, `harmonics`, `bandwidth`, `f1`, `f2`, `points`, `levels`, `bands`, `xLimit`, `maxBoostDb`

## EXPORTED (13)

### `splOf(p)`

- **Reachability:** EXPORTED
- **Obtain via:** import { splOf } from '../../src/spice/timedomain.js'

dB SPL of an RMS pressure.

**Parameters**

- `p` — `number` — RMS pressure, Pa.

**Returns**

- `number` — dB re 20 µPa, floored at 1e-12 Pa.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `complexOutputs(raw, map)`

- **Reachability:** EXPORTED
- **Obtain via:** import { complexOutputs } from '../../src/spice/timedomain.js'

Complex outputs of an AC run: far-field pressure, driver-only pressure, excursion and channel current.

The same quantities the transient run makes as circuit nodes, so the two
can be compared sample for sample.

**Parameters**

- `raw` — `object` — From `runNetlist`.
- `map` — `object` — From `compileProject`.

**Returns**

- `{freqs: number[], pressure: object, driverPressure: object, excursion: Object<string, object>, current: object|null}` — `{re, im}` arrays per quantity; pressure in Pa at 1 m, excursion in m, current in A (first channel).

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `linearResponses(project, opts, onProgress)`

- **Reachability:** EXPORTED
- **Obtain via:** import { linearResponses } from '../../src/spice/timedomain.js'
- **Async:** returns a Promise

Impulse, step, tone burst and cumulative spectral decay from a fine sweep.

The response at DC is taken as zero for pressure (a box cannot hold a
steady pressure at a distance) and as the lowest bin's value for
excursion and current. The top tenth of the band is tapered with a
half-Hann to keep the band edge from ringing. Pressure is at 1 m, with
every radiator 1 m from the listener; time zero is when the signal starts.

**Parameters**

- `project` — `object` — A resolved, validated project.
- `opts` — `object` _(optional)_ — Settings; see `LINEAR_DEFAULTS`.
- `onProgress` — `Function` _(optional)_ — Called with `(fraction, message)`.

**Returns**

- `Promise<object>` — `{fs, t, impulse: {pressure, driverPressure, excursion}, step: {…}, burst: {signal, pressure, driverPressure, excursion}, csd: {freqs, slices: [{ms, db}]}, spectrum: {freqs, pressure}}` — pressure in Pa, excursion in mm (per driver id), time in s. Impulse and step are per volt of the first channel (every channel keeping its relative level); the burst is at the channels' own level, as a transient run would play it.

**Throws**

- `Error` — When SPICE cannot solve the circuit.

**Side effects**

- Runs the engine.

### `transientRun(project, run)`

- **Reachability:** EXPORTED
- **Obtain via:** import { transientRun } from '../../src/spice/timedomain.js'
- **Async:** returns a Promise

Run one transient simulation and collect its waveforms.

**Parameters**

- `project` — `object` — A resolved, validated project.
- `run` — `object` — `{signal, levelDb, fs, tstop, bandwidth, nonlinear}`.

**Returns**

- `Promise<object>` — `{t, pressure, driverPressure, excursion: {id: mm[]}, current: {ch: A[]}, voltage: {ch: V[]}, velocity: {wg: m/s[]}, probes: {id: {kind, values}}}` — pressure in Pa at 1 m.

**Throws**

- `Error` — When SPICE cannot solve the circuit.

**Side effects**

- Runs the engine.

### `levels(x)`

- **Reachability:** EXPORTED
- **Obtain via:** import { levels } from '../../src/spice/timedomain.js'

Summary figures of a waveform.

**Parameters**

- `x` — `ArrayLike<number>` — Samples.

**Returns**

- `{peak: number, rms: number}` — Largest magnitude and RMS.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `transientAnalysis(project, opts, onProgress)`

- **Reachability:** EXPORTED
- **Obtain via:** import { transientAnalysis } from '../../src/spice/timedomain.js'
- **Async:** returns a Promise

A transient analysis: one signal through the circuit, and optionally the same run with the nonlinear elements off, for comparison.

**Parameters**

- `project` — `object` — A resolved, validated project.
- `opts` — `object` _(optional)_ — See `TRANSIENT_DEFAULTS`; `duration` s is the run length, `compareLinear` adds the linear run.
- `onProgress` — `Function` _(optional)_ — Called with `(fraction, message)`.

**Returns**

- `Promise<{run: object, linear: object|null, signal: object, fs: number}>` — The run, the linear run when asked for and different, the signal used and the sample rate.

**Throws**

- `Error` — When SPICE cannot solve the circuit.

**Side effects**

- Runs the engine.

### `measureTone(project, hz, levelDb, o)`

- **Reachability:** EXPORTED
- **Obtain via:** import { measureTone } from '../../src/spice/timedomain.js'
- **Async:** returns a Promise

One steady tone through the circuit, measured.

The run lasts long enough for the box to settle — the longer of 0.3 s and
ten periods — then a whole number of periods is analysed. The sample rate
is a whole multiple of the tone, so every analysed period has the same
samples and there is no leakage.

**Parameters**

- `project` — `object` — A resolved, validated project.
- `hz` — `number` — Frequency, Hz.
- `levelDb` — `number` — Level offset, dB, over every channel's level.
- `o` — `object` — Distortion options: `harmonics`, `bandwidth`, `nonlinear`.

**Returns**

- `Promise<object>` — `{hz, levelDb, harmonics: [{n, hz, amp, db}], thd, spl, xPeak: {id: mm}, currentPeak, voltagePeak}` — `amp` in Pa at 1 m, `db` relative to the fundamental, `spl` the fundamental's level.

**Throws**

- `Error` — When SPICE cannot solve the circuit.

**Side effects**

- Runs the engine.

### `linearLevel(project, hz, levelDb)`

- **Reachability:** EXPORTED
- **Obtain via:** import { linearLevel } from '../../src/spice/timedomain.js'
- **Async:** returns a Promise

The linear model's fundamental level at one frequency, for compression.

**Parameters**

- `project` — `object` — A resolved project.
- `hz` — `number` — Frequency, Hz.
- `levelDb` — `number` — Level offset, dB.

**Returns**

- `Promise<number>` — dB SPL at 1 m.

**Throws**

- `Error` — When SPICE cannot solve the circuit.

**Side effects**

- Runs the engine.

### `logFreqs(f1, f2, n)`

- **Reachability:** EXPORTED
- **Obtain via:** import { logFreqs } from '../../src/spice/timedomain.js'

Logarithmically spaced frequencies.

**Parameters**

- `f1` — `number` — Lowest, Hz.
- `f2` — `number` — Highest, Hz.
- `n` — `number` — Count, at least 1.

**Returns**

- `number[]` — The frequencies, rounded to 0.1 Hz.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `brokenLimit(m, xLimitMm)`

- **Reachability:** EXPORTED
- **Obtain via:** import { brokenLimit } from '../../src/spice/timedomain.js'

Whether a burst measurement breaks a limit, and which.

**Parameters**

- `m` — `object` — From `measureBurst`.
- `xLimitMm` — `number` — Excursion limit, mm per driver id, or a number for all.

**Returns**

- `string|null` — The limit broken — `H<n>` or `excursion` — or `null`.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `measureBurst(project, hz, levelDb, o)`

- **Reachability:** EXPORTED
- **Obtain via:** import { measureBurst } from '../../src/spice/timedomain.js'
- **Async:** returns a Promise

A Hann-windowed 6.5-cycle burst through the circuit, measured as CEA-2010 does in spirit.

Harmonic levels are the response spectrum's magnitude at each multiple
of the burst frequency, relative to the fundamental's; the level reported
is the peak pressure of the response as an RMS-equivalent (peak/√2).

**Parameters**

- `project` — `object` — A resolved, validated project.
- `hz` — `number` — Burst frequency, Hz.
- `levelDb` — `number` — Level offset, dB.
- `o` — `object` — Distortion options.

**Returns**

- `Promise<{hz: number, levelDb: number, spl: number, harmonics: object[], xPeak: object}>` — The measurement.

**Throws**

- `Error` — When SPICE cannot solve the circuit.

**Side effects**

- Runs the engine.

### `maxLevel(s)`

- **Reachability:** EXPORTED
- **Obtain via:** import { maxLevel } from '../../src/spice/timedomain.js'
- **Async:** returns a Promise

The highest level that breaks no limit, searched with several levels tested at once.

Levels are assumed to break limits from some threshold up. Until a level
that passes and one that breaks are both known, the search steps 3 dB
at a time from `start` — upward from a pass, downward from a failure,
`width()` steps per round; then it tests `width()` evenly spaced levels
inside the bracket each round, narrowing it by that many plus one, until
it is 0.25 dB wide. With a width of 1 this is a plain step-then-halve search.

**Parameters**

- `s` — `object` — The search.
- `s.start` — `number` — First level, dB.
- `s.top` — `number` — Highest level to try, dB.
- `s.bottom` — `number` — Lowest level to try, dB.
- `s.test` — `Function` — `(L) → Promise<{broke: string|null, …}>`.
- `s.width` — `Function` — `() → number`: levels to test per round, now.
- `s.onRound` — `Function` _(optional)_ — Called with the search's progress, 0–1, after each round.

**Returns**

- `Promise<{lo: object|null, hi: object|null, tried: number}>` — The highest passing level below the lowest breaking one — each `{L, …test's result}` — and the number of levels tested.

**Side effects**

- Calls `test`, several at a time.

### `distortionAnalysis(project, mode, opts, onProgress)`

- **Reachability:** EXPORTED
- **Obtain via:** import { distortionAnalysis } from '../../src/spice/timedomain.js'
- **Async:** returns a Promise

Distortion analyses.

- `harmonics`: one tone at `hz`, `levelDb` — its harmonic levels, THD and
  the last periods of its waveform.
- `thd`: tones at `points` log-spaced frequencies from `f1` to `f2` — THD,
  H2 and H3 against frequency.
- `compression`: tones at the same frequencies at each of `levels` (dB
  over the channels' level) — the fundamental's level against the linear
  model's, as compression in dB.
- `maxspl`: for each band frequency, the highest burst level that breaks
  neither the CEA-2010 distortion limits nor `xLimit` × Xmax of excursion,
  found by stepping 3 dB then narrowing to 0.25 dB (see `maxLevel`),
  every band at once.

**Parameters**

- `project` — `object` — A resolved, validated project.
- `mode` — `string` — `harmonics`, `thd`, `compression` or `maxspl`.
- `opts` — `object` _(optional)_ — See `DISTORTION_DEFAULTS`.
- `onProgress` — `Function` _(optional)_ — Called with `(fraction, message)`.

**Returns**

- `Promise<object>` — The mode's results, with `mode` set.

**Throws**

- `Error` — For an unknown mode, or when SPICE cannot solve the circuit.

**Side effects**

- Runs the engine, many times.

## UNREACHABLE (20)

### `sweepOf(project)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

The frequency sweep a project carries, for its model settings.

**Parameters**

- `project` — `object` — A resolved project.

**Returns**

- `object` — Its first `ac` analysis.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `complexOutputs > z()`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

A zeroed complex array.

**Returns**

- `{re: Float64Array, im: Float64Array}` — The array.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `linearResponses > taper(k)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

The taper applied at bin k (1-based), easing the top tenth of the band to zero.

**Parameters**

- `k` — `number` — Bin.

**Returns**

- `number` — Weight 0–1.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `linearResponses > spectrum(H, dcFromLowest)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

A one-sided spectrum with its DC bin set, from the sweep's bins 1…N.

**Parameters**

- `H` — `{re: ArrayLike<number>, im: ArrayLike<number>}` — Complex values at df … fmax.
- `dcFromLowest` — `boolean` — Take DC as the lowest bin's real part rather than zero.

**Returns**

- `{re: Float64Array, im: Float64Array}` — Bins 0 … N.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `linearResponses > impulse(S)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Impulse response: the inverse transform, scaled from a DFT of unit impulse to a continuous-time response.

**Parameters**

- `S` — `object` — One-sided spectrum.

**Returns**

- `Float64Array` — h[n]·(1/dt) so that Σ h·dt is the DC gain.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `linearResponses > stepOf(h)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Running integral of an impulse response.

**Parameters**

- `h` — `Float64Array` — Impulse response.

**Returns**

- `Float64Array` — The step response.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `linearResponses > burstOf(S, B)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Response to the tone burst, by multiplying spectra.

**Parameters**

- `S` — `object` — One-sided spectrum of the system.
- `B` — `object` — One-sided spectrum of the burst.

**Returns**

- `Float64Array` — The response samples.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `linearResponses > mm(a)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Metres to millimetres.

**Parameters**

- `a` — `ArrayLike<number>` — Samples, m.

**Returns**

- `Float64Array|number[]` — Samples, mm.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `modelFor(project, bandwidth)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

The sweep settings a transient run compiles its model from.

The line slicing and loss-network fits follow the model bandwidth, not
the sample rate, so a higher sample rate does not multiply the circuit.

**Parameters**

- `project` — `object` — A resolved project.
- `bandwidth` — `number` — Highest frequency the model must represent, Hz.

**Returns**

- `object` — An `ac`-shaped analysis for `compileProject`.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `transientRun > attempt(robust)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.
- **Async:** returns a Promise

Compile and run with the given solver robustness.

**Parameters**

- `robust` — `boolean` — Use the slower, more forgiving settings.

**Returns**

- `Promise<{raw: object, map: object}>` — The run and its map.

**Side effects**

- Runs the engine.

### `transientRun > zeros()`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

A silent series, one sample per time step.

**Returns**

- `Float64Array` — Zeros.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `hasExitLoss(project)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Whether any waveguide end carries a flow loss.

**Parameters**

- `project` — `object` — A resolved project.

**Returns**

- `boolean` — True when some waveguide has a positive `throatK` or `mouthK`.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `hasCurves(project, bandwidth)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Whether any driver in the project carries a large-signal curve.

**Parameters**

- `project` — `object` — A resolved project.
- `bandwidth` — `number` — The model bandwidth, Hz, as the run compiles it.

**Returns**

- `boolean` — True when some driver compiles as nonlinear.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `measureTone > peakOf(x)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Largest magnitude over the analysed periods.

**Parameters**

- `x` — `ArrayLike<number>` — Samples.

**Returns**

- `number` — The peak.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `measureBurst > mag(f)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

The response's spectral magnitude at one frequency (a direct Fourier sum).

**Parameters**

- `f` — `number` — Frequency, Hz.

**Returns**

- `number` — |P(f)|.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `maxLevel > bracket()`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

The current bracket: the lowest breaking level, and the highest passing one below it.

**Returns**

- `{lo: object|null, hi: object|null}` — Either may be missing.

**Reads external mutable state**

- the levels tried.

### `distortionAnalysis > report(message)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Report the search's progress: bands finished, and how far along the rest are.

**Parameters**

- `message` — `string` — What is running.

**Returns**

- `void`

**Side effects**

- Calls `onProgress`.

### `distortionAnalysis > test(L)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.
- **Async:** returns a Promise

Test one level at this band.

**Parameters**

- `L` — `number` — Level offset, dB.

**Returns**

- `Promise<{m: object, broke: string|null}>` — The measurement and the limit it breaks.

**Side effects**

- Runs the engine.

### `distortionAnalysis > width()`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

How many levels this band may test at once: its share of the threads.

**Returns**

- `number` — At least 1.

**Reads external mutable state**

- the thread count and the bands still searching.

### `distortionAnalysis > onRound(fraction)`

- **Reachability:** UNREACHABLE
- **Obtain via:** Not importable: a closure nested inside another function, or a module-private with no test surface. Test its behaviour through its caller, or skip it.

Note a round's end.

**Parameters**

- `fraction` — `number` — How far this band's search has come, 0–1.

**Returns**

- `void`

**Side effects**

- Reports progress.
