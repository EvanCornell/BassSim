// Contract tests for src/spice/dsp.js.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  normalizeSignal, signalLength, signalFunction, signalPoints, pinkNoise, nextPow2, fft, irfft, rfft, harmonics, thd, decimate, SIGNAL_TYPES,
} from '../../src/spice/dsp.js'

// CONTRACT (fft): "In-place radix-2 FFT"; inverse "scaled by 1/n".
test('fft: forward then inverse is the identity, and a tone lands in its bin', () => {
  const n = 64
  const re = Float64Array.from({ length: n }, (_, i) => Math.cos((2 * Math.PI * 5 * i) / n) + 0.3)
  const im = new Float64Array(n)
  const keep = Float64Array.from(re)
  fft(re, im)
  assert.ok(Math.abs(re[5] - n / 2) < 1e-9 && Math.abs(re[0] - 0.3 * n) < 1e-9)
  fft(re, im, true)
  keep.forEach((v, i) => assert.ok(Math.abs(re[i] - v) < 1e-12 && Math.abs(im[i]) < 1e-12))
})

// CONTRACT (rfft / irfft): one-sided spectrum and back.
test('rfft and irfft round-trip a real signal', () => {
  const x = Float64Array.from({ length: 32 }, (_, i) => Math.sin(i) + i / 10)
  const { re, im } = rfft(x)
  assert.equal(re.length, 17)
  const y = irfft(re, im)
  x.forEach((v, i) => assert.ok(Math.abs(y[i] - v) < 1e-12))
  assert.equal(nextPow2(33), 64)
  assert.equal(nextPow2(1), 1)
})

// CONTRACT (harmonics): "a direct Fourier sum at each harmonic over a whole
// number of fundamental periods, so there is no leakage".
test('harmonics and thd: exact on a synthetic distorted tone', () => {
  const fs = 4000
  const f = 50
  const x = Float64Array.from({ length: 4000 }, (_, i) => {
    const t = i / fs
    return 2 * Math.sin(2 * Math.PI * f * t) + 0.2 * Math.sin(2 * Math.PI * 2 * f * t + 1) + 0.02 * Math.sin(2 * Math.PI * 3 * f * t)
  })
  const h = harmonics(x, fs, f, 4, 10)
  assert.ok(Math.abs(h[0].amp - 2) < 1e-9)
  assert.ok(Math.abs(h[1].amp - 0.2) < 1e-9)
  assert.ok(Math.abs(h[2].amp - 0.02) < 1e-9)
  assert.ok(h[3].amp < 1e-9)
  assert.ok(Math.abs(thd(h) - Math.hypot(0.2, 0.02) / 2) < 1e-9)
})

// CONTRACT (signals): burst "Hann-windowed — the CEA-2010 shape"; sine "faded
// in over `fade` cycles"; noise "pink … RMS 1, repeatable from its seed".
test('signals: shapes, lengths and noise level', () => {
  assert.deepEqual(SIGNAL_TYPES, ['sine', 'burst', 'sweep', 'noise'])
  const burst = normalizeSignal({ type: 'burst', hz: 40 })
  assert.equal(burst.cycles, 6.5)
  assert.ok(Math.abs(signalLength(burst) - 6.5 / 40) < 1e-15)
  const b = signalFunction(burst)
  assert.equal(b(0), 0)
  assert.equal(b(signalLength(burst) + 1e-6), 0)
  const sine = signalFunction(normalizeSignal({ type: 'sine', hz: 10 }))
  assert.ok(Math.abs(sine(0.225) - 1) < 1e-12, 'full amplitude once faded in')
  assert.equal(signalLength(normalizeSignal({ type: 'sine' })), Infinity)
  const noise = normalizeSignal({ type: 'noise', f1: 20, f2: 200, length: 0.5, seed: 3 })
  const a = pinkNoise(noise, 4000)
  const again = pinkNoise(noise, 4000)
  assert.deepEqual(a, again)
  let e = 0
  const mid = a.slice(200, a.length - 200)
  for (const v of mid) e += v * v
  assert.ok(Math.abs(Math.sqrt(e / mid.length) - 1) < 0.1)
  const pts = signalPoints(burst, 2, 1000)
  assert.equal(pts.length % 2, 0)
  assert.equal(pts[pts.length - 1], 0)
  assert.throws(() => normalizeSignal({ type: 'square' }))
})

// CONTRACT (decimate): "each bucket keeps … its first series' minimum and
// maximum, in time order — so peaks survive".
test('decimate: thins, keeping the peaks', () => {
  const t = Array.from({ length: 10000 }, (_, i) => i)
  const y = t.map((i) => (i === 4321 ? 50 : i === 777 ? -40 : Math.sin(i / 100)))
  const d = decimate(t, [y], 400)
  assert.ok(d.t.length <= 400)
  assert.equal(Math.max(...d.ys[0]), 50)
  assert.equal(Math.min(...d.ys[0]), -40)
  for (let i = 1; i < d.t.length; i++) assert.ok(d.t[i] > d.t[i - 1], 'strictly increasing time')
})
