// Derived metrics from a completed sweep.

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

export function computeMetrics(res, settings) {
  if (!res || !res.ok || !res.freqs.length) return null
  const { freqs, splCombined, zinMag, excursion } = res
  const n = freqs.length
  const m = {}

  // Passband level: median of the top quartile of SPL
  const sorted = [...splCombined].filter((v) => isFinite(v)).sort((a, b) => b - a)
  const pass = sorted[Math.floor(sorted.length * 0.15)] ?? 0
  m.passband = pass
  m.peakSPL = sorted[0] ?? 0

  // F3 / F10: lowest frequency where response last rises through pass-3
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
  const xmax = settings.xmax || null
  let xPk = 0, xPkF = null
  for (let i = 0; i < n; i++) {
    if (excursion[i] > xPk) { xPk = excursion[i]; xPkF = freqs[i] }
  }
  m.xPeak = xPk
  m.xPeakF = xPkF
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

  // Max power before Xmax (displacement scales linearly with voltage)
  if (xmax && xPk > 0) {
    const vNow = settings.voltage || 2.83
    const vMax = (vNow * xmax) / xPk
    const zMin = Math.min(...zinMag.filter((v) => v > 0.1))
    m.maxPower = (vMax * vMax) / zMin
    m.vMax = vMax
  }
  return m
}
