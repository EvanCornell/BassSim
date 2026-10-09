// Derived metrics from a completed sweep.

/**
 * Find prominent local maxima in a sampled curve.
 *
 * Used to locate impedance peaks, which is how the tuning frequency and box
 * alignment are identified. Two filters keep noise out: a peak must rise
 * `minProminence` above the lowest point within ±40 samples, and peaks closer
 * together than 5% in frequency are merged to the taller one — a single
 * physical resonance sampled on a log grid often produces several adjacent
 * candidates.
 *
 * The first and last two samples are skipped, so a curve that is still rising
 * at the edge of the sweep reports no peak there rather than a false one.
 *
 * @param {number[]} freqs - Frequency axis, Hz, ascending.
 * @param {number[]} vals - Curve sampled on that axis.
 * @param {number} [minProminence=1] - Minimum rise above the local floor, in the units of `vals`.
 * @returns {Array<{f: number, v: number, i: number}>} Surviving peaks in ascending frequency order, each with its frequency, value and sample index.
 * @pre freqs.length === vals.length
 * @post freqs and vals are not modified
 * @pure
 */
function localMaxima(freqs, vals, minProminence = 1) {
  const peaks = []
  for (let i = 2; i < vals.length - 2; i++) {
    if (vals[i] > vals[i - 1] && vals[i] >= vals[i + 1]) {
      // prominence check against neighborhood
      let lo = vals[i]
      for (let j = Math.max(0, i - 40); j < Math.min(vals.length, i + 40); j++) lo = Math.min(lo, vals[j])
      if (vals[i] - lo >= minProminence) peaks.push({ f: freqs[i], v: vals[i], i })
    }
  }
  // merge peaks closer than 5%
  const merged = []
  for (const p of peaks) {
    const last = merged[merged.length - 1]
    if (last && p.f / last.f < 1.05) {
      if (p.v > last.v) merged[merged.length - 1] = p
    } else merged.push(p)
  }
  return merged
}

/**
 * Reduce a completed sweep to the scalar figures shown in the quick bar.
 *
 * Passband level is the median of the top quartile of SPL rather than the peak,
 * so a single resonance spike cannot drag the reference — and therefore F3 —
 * off with it. F3 and F10 are then found by linear interpolation at the first
 * upward crossing of that reference.
 *
 * The impedance peak count decides how the box is interpreted: two peaks mean a
 * vented alignment, so the minimum between them is the tuning `fb`; one peak
 * means sealed, so it is `fc` and `qtc` follows from the exact second-order
 * high-pass relation between fc and F3. Note that the reported `zPeaks` is the
 * peak *list*, not the count — `zPeaks.length` is what the branch above turns
 * on. Zero peaks, or three or more, yield neither `fb` nor `fc`.
 *
 * Maximum power before Xmax is driven by the per-driver headroom ratio, so a
 * mixed set of drivers is judged against each cone's own limit.
 *
 * @param {object|null} res - A sweep result, as `simulateProject` returns it.
 * @param {object} settings - Sweep settings.
 * @param {number} [settings.voltage=2.83] - Drive voltage the sweep was run at, V RMS.
 * @returns {object|null} Metrics — any of `passband`, `peakSPL`, `f3`, `f10`, `bwHz`, `bwOct`, `zPeaks` (an array of at most five `{f, v, i}` peak descriptors — frequency in Hz, impedance magnitude in Ω, and the sweep index — in ascending frequency), `fb`, `fbZ`, `fc`, `qtc`, `xPeak`, `xPeakF`, `xAtFb`, `xAtF3`, `xRatioPeak`, `xRatioPeakF`, `xLimitDriver`, `maxPower`, `vMax` — or `null` when the sweep failed or is empty. Most fields are simply absent when the topology does not define them, so a sealed box has no `fb` key at all. The exceptions are `f3`, `f10`, `xPeakF`, `xAtFb` and `xAtF3`, which are always present and carry `null` when undefined — `xAtFb` is null for a sealed box because it is looked up at a tuning that does not exist.
 * @post res and settings are not modified
 * @pure
 */
export function computeMetrics(res, settings) {
  if (!res || !res.ok || !res.freqs.length) return null
  const { freqs, splCombined, zinMag, excursion, excursionRatio, excursionByDriver } = res
  const n = freqs.length
  const m = {}

  // Passband level: median of the top quartile of SPL
  const sorted = [...splCombined].filter((v) => isFinite(v)).sort((a, b) => b - a)
  const pass = sorted[Math.floor(sorted.length * 0.15)] ?? 0
  m.passband = pass
  m.peakSPL = sorted[0] ?? 0

  // F3 / F10: lowest frequency where response last rises through pass-3
  /**
   * Frequency at which the response first rises to `drop` dB below passband.
   *
   * Scans upward and interpolates linearly between the straddling samples, so
   * the answer is not quantised to the sweep grid.
   *
   * @param {number} drop - Level below passband to find, dB (3 for F3, 10 for F10).
   * @returns {number|null} The crossing frequency in Hz, or `null` when the response never reaches that level anywhere in the sweep.
   * @reads the enclosing sweep's `splCombined`, `freqs` and computed `pass` level.
   */
  const findFx = (drop) => {
    const target = pass - drop
    for (let i = 0; i < n; i++) {
      if (splCombined[i] >= target) {
        if (i === 0) return freqs[0]
        const a = splCombined[i - 1]
        const b = splCombined[i]
        const t = (target - a) / (b - a)
        return freqs[i - 1] + t * (freqs[i] - freqs[i - 1])
      }
    }
    return null
  }
  m.f3 = findFx(3)
  m.f10 = findFx(10)

  // upper -3 dB point for bandwidth
  let fHi = null
  for (let i = n - 1; i >= 0; i--) {
    if (splCombined[i] >= pass - 3) { fHi = freqs[i]; break }
  }
  if (m.f3 && fHi && fHi > m.f3) {
    m.bwHz = fHi - m.f3
    m.bwOct = Math.log2(fHi / m.f3)
  }

  // Impedance peaks + Fb (minimum between two lowest peaks)
  const zPeaks = localMaxima(freqs, zinMag, Math.max(1, Math.max(...zinMag) * 0.05))
  m.zPeaks = zPeaks.slice(0, 5)
  if (zPeaks.length >= 2) {
    const [p1, p2] = zPeaks
    let minV = Infinity, minF = null
    for (let i = p1.i; i <= p2.i; i++) {
      if (zinMag[i] < minV) { minV = zinMag[i]; minF = freqs[i] }
    }
    m.fb = minF
    m.fbZ = minV
  } else if (zPeaks.length === 1) {
    // Sealed-box: system resonance = impedance peak; Qtc from the exact
    // 2nd-order high-pass relation between fc and the measured F3:
    // with u = (F3/fc)²,  1/Q² = (2u² − (1−u)²)/u
    const pk = zPeaks[0]
    m.fc = pk.f
    if (m.f3) {
      const u = Math.pow(m.f3 / pk.f, 2)
      const d = 2 * u * u - Math.pow(1 - u, 2)
      if (d > 0 && u > 0.1 && u < 10) m.qtc = Math.sqrt(u / d)
    }
  }

  // Excursion diagnostics
  let xPk = 0, xPkF = null
  for (let i = 0; i < n; i++) {
    if (excursion[i] > xPk) { xPk = excursion[i]; xPkF = freqs[i] }
  }
  m.xPeak = xPk
  m.xPeakF = xPkF
  /**
   * Cone excursion at the sweep sample nearest a given frequency.
   *
   * Nearest is measured in log-frequency, matching the sweep's own spacing, so
   * the choice is not biased toward the high end of the range.
   *
   * @param {number|null} f - Frequency of interest, Hz. A falsy value means the caller had no such frequency to look up.
   * @returns {number|null} Excursion in mm, or `null` when `f` is falsy.
   * @reads the enclosing sweep's `freqs` and `excursion` arrays.
   */
  const atFreq = (f) => {
    if (!f) return null
    let best = 0, bd = Infinity
    for (let i = 0; i < n; i++) {
      const d = Math.abs(Math.log(freqs[i] / f))
      if (d < bd) { bd = d; best = i }
    }
    return excursion[best]
  }
  m.xAtFb = atFreq(m.fb)
  m.xAtF3 = atFreq(m.f3)

  // Peak headroom: the closest any single cone comes to its own Xmax. With one
  // driver this is just xPeak/Xmax; with several it picks whichever runs out
  // first, which need not be the one moving furthest.
  let rPk = 0, rPkF = null
  if (excursionRatio) {
    for (let i = 0; i < n; i++) {
      if (excursionRatio[i] > rPk) { rPk = excursionRatio[i]; rPkF = freqs[i] }
    }
  }
  if (rPk > 0) {
    m.xRatioPeak = rPk
    m.xRatioPeakF = rPkF
    // which driver is the limiting one at that frequency
    if (excursionByDriver && res.xmaxByDriver) {
      const at = freqs.indexOf(rPkF)
      let worst = null, worstR = 0
      for (const [id, arr] of Object.entries(excursionByDriver)) {
        const xm = res.xmaxByDriver[id]
        if (!(xm > 0) || at < 0) continue
        const r = arr[at] / xm
        if (r > worstR) { worstR = r; worst = id }
      }
      m.xLimitDriver = worst
    }
  }

  // Max power before Xmax (displacement scales linearly with voltage). Driven
  // by the headroom ratio so a mixed set of drivers is judged per driver.
  const vNow = settings.voltage || 2.83
  const vMax = rPk > 0 ? vNow / rPk : null
  if (vMax) {
    const zMin = Math.min(...zinMag.filter((v) => v > 0.1))
    m.maxPower = (vMax * vMax) / zMin
    m.vMax = vMax
  }
  return m
}

// Module-private functions, exposed for the contract test suite only
// (test/contract/*). Not part of this module's public API — application code
// must not import from here, and nothing outside the tests does.
export const __internals = { localMaxima }
