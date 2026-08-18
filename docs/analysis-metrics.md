# Time-domain analysis metrics

Status: **tunable.** This is not a contract and not an architectural decision.
The metric set is expected to change as the tool is used and as it becomes
clear which numbers engineers actually act on.

What makes that safe is `metricSetVersion`, which participates in the result
cache key (`ARCHITECTURE.md` §6.4). Adding, removing or redefining a metric
bumps the version; old cached results stay valid for old versions and are
recomputed on demand for new ones. There is no backfill and no silent staleness,
so nothing here needs to be got right first time.

The architectural commitments are only these, and they live in `ARCHITECTURE.md`:
summaries rather than waveforms, reduction inside the engine in a single pass,
bounded output, and re-run-with-detail as a supported operation.

---

## 1. Why summaries rather than waveforms

A 3-minute track at solver rate across several signals is ~2.2 GB. The reduction
below is ~3–4 MB. That is not lossy compression of a signal — it is a clean
split between what is kept and what is discarded:

| Preserved exactly | Approximated | Discarded |
|---|---|---|
| Band energy over time | Peak values (frame-quantised) | Waveform phase |
| RMS / peak power | Crest factor within a frame | Perceptual audibility |
| Thermal compression trajectory | Transients shorter than a frame | Harmonic phase structure |
| Excursion envelope and headroom | | |
| Nonlinear residual energy | | |

For the questions this tool exists to answer — headroom, compression, where the
distortion comes from — the summary is not a 90% approximation. It is complete,
because those are all energy-domain quantities on timescales far longer than a
frame. What is genuinely lost is *what it sounds like*, which needs the waveform
and is recovered by re-running a window.

Since simulation is deterministic and the model, stimulus and spec are retained,
discarded detail is always reconstructible for a few core-seconds. The choice is
never "store it or lose it" — only "store it or regenerate it."

---

## 2. Streaming metrics

All of these are online estimators with O(1) state. None require buffering.

### Per band, per frame

- RMS power
- Peak power
- Crest factor (peak ÷ RMS within the frame) — recovers most of what frame
  averaging destroys about transients, at one extra float
- Real and apparent power (running mean of `v·i`; running RMS of each)
- Compression gain `g` (see §3)
- Nonlinear residual ratio (see §3)

### Per band, whole run

- Distortion exceedance histogram (§4)
- Per-mechanism attribution (§5)

### Per run

- Scalar aggregates: overall RMS and peak power, worst-case headroom margin,
  peak excursion, final coil temperature
- Excursion histogram, 32 bins — distinguishes "hit Xmax once on a transient"
  from "sat at Xmax for thirty seconds," which are entirely different
  engineering conclusions, for ~128 bytes

Scalar aggregates are a separate top-level block so a UI can render a verdict
without parsing the matrices.

---

## 3. Compression and distortion require a linear reference

Both are defined *against* something: the same model, linearised, with the coil
cold. So a time-domain analysis is a **paired run** — the nonlinear simulation
and its linear reference on the same stimulus. The reference is cheap (no
oversampling, no Newton iteration), roughly 30–50% of the nonlinear cost.

Per band, per frame, fit the gain `g` that best matches linear to nonlinear:

```
compression = g
distortion  = RMS(y_nonlinear − g·y_linear) / RMS(g·y_linear)
```

**The gain separation is the point.** Without it, "the driver got 3 dB quieter
as it heated" and "the driver is distorting 3%" are indistinguishable. Both
quantities come from running cross-correlation and energy sums.

### THD belongs to the sweep, not to music

For a sine sweep, THD is well defined: drive at *f*, measure energy at 2*f*,
3*f*. For music there is no single fundamental — harmonics of one note land on
top of other notes — and classical THD is not meaningful.

So the division is:

| Stimulus | Distortion metric |
|---|---|
| Sine sweep | THD, and harmonic orders H2/H3, vs frequency and level |
| Music / arbitrary | Nonlinear residual vs the linear reference, over time |

### Thermal initial conditions are part of the spec

Compression is largely thermal, with time constants of seconds to minutes.
Starting cold and starting pre-heated give materially different answers and
neither is wrong, so initial coil temperature — or a declared pre-conditioning
period — must be an explicit `AnalysisSpec` field. Left as an engine default it
makes results irreproducible and users will report it as a bug.

---

## 4. Exceedance histograms

Average distortion is weakly useful; it hides exactly the transient stress that
matters. The better primitive is **time spent above fixed thresholds**, which is
a pure accumulator and therefore O(1) in track length.

| Structure | Size |
|---|---|
| bands × thresholds × 4 B | ~1 KB |
| bands × output-level bins × thresholds × 4 B | ~8 KB |

The level-conditioned form is worth the extra 7 KB: it directly answers *at what
drive level does this band start to break down*, which is the question a user
actually has.

Thresholds are fixed and log-spaced (0.3, 1, 3, 10, 30%); level bins in dB.
Both are tunable — they are the most likely thing here to change with use.

---

## 5. Mechanism attribution

The differentiating output, and cheaper than it looks. Each nonlinearity is an
identifiable term in the ODE, so split each into its linear part plus a
deviation:

| Term | Linear part | Deviation |
|---|---|---|
| `Bl(x)·i` | `Bl₀·i` | `(Bl(x) − Bl₀)·i` |
| `Kms(x)·x` | `Kms₀·x` | `(Kms(x) − Kms₀)·x` |
| `Le(x)·di/dt` | `Le₀·di/dt` | `(Le(x) − Le₀)·di/dt` |
| port / thermal | small-signal | remainder |

Accumulating the energy of each deviation per band gives **per-mechanism
attribution from a single run** — one running sum per mechanism, ~600 bytes of
output. No ablation runs needed.

**Caveat to surface in the UI:** the mechanisms interact, so contributions do not
sum exactly to the total. This is attribution, not an exact decomposition.
Directionally it is what tells a user "your 40 Hz distortion is suspension, your
80 Hz distortion is `Le`" — the insight that makes the feature worth paying for.

---

## 6. Resolution

Two knobs, both tunable, both currently guesses:

**Bands.** Third-octave is too coarse below 100 Hz for a bass tool — only ~7
bands between 20 and 100 Hz, while port and chamber resonances are narrow. Use
finer resolution below 200 Hz and coarser above. Non-uniform bands cost nothing
and improve resolution exactly where the tool is used.

**Frames.** 50 ms resolves program dynamics and is far finer than thermal needs.
Compression develops on a slow curve, so log-spaced frames capture it better at
equal cost — which realistically means two series at different rates rather than
one compromise.

### Budget

| Component | Size (3-minute track) |
|---|---|
| Per-band × per-frame matrices | ~1–3 MB |
| Exceedance histograms | ~8 KB |
| Mechanism attribution | ~600 B |
| Scalar aggregates and histograms | ~1 KB |
| **Total** | **~3–4 MB** |

Against ~2.2 GB of raw waveform: roughly 1000× smaller, with everything the
listed questions require.

### Cost

| Item | Cost |
|---|---|
| Nonlinear run | 1.0× |
| Linear reference | +0.3–0.5× |
| Filterbank on both (~20 bands, 2 biquads each ≈ 10 Mflop/s at 48 kHz) | +5–10% |
| Residual, histograms, attribution accumulators | negligible |
| **Total** | **~1.5×** |

The filterbank is ~5% against a solver running 100–300 Mflop/s. Everything else
in this document is free by comparison — the metrics are not what makes a
time-domain analysis expensive.
