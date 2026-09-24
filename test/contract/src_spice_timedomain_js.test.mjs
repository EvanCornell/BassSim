// Contract tests for src/spice/timedomain.js — the time-domain analyses,
// checked against the linear model and against the physics each nonlinear
// element represents.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { prepareProject } from '../../src/engine/pipeline.js'
import { compileProject } from '../../src/spice/compile.js'
import { normalizeSignal } from '../../src/spice/dsp.js'
import {
  linearResponses, transientRun, transientAnalysis, measureTone, linearLevel, distortionAnalysis,
  logFreqs, brokenLimit, levels, splOf, CEA2010_LIMITS,
} from '../../src/spice/timedomain.js'

const DRV = { Fs: 30, Qts: 0.45, Qes: 0.5, Qms: 5, Vas: 60, Re: 3.6, Bl: 15, Mms: 150, Cms: 0.19, Sd: 480, Le: 1.5, LeExp: 0.7, Xmax: 10, Rms: 4 }

/**
 * A ported box, with optional driver curves and duct exit losses.
 *
 * @param {object} [nl] - Driver curves.
 * @param {object} [wg] - Waveguide param overrides; exit losses off by default.
 * @returns {object} A resolved project.
 */
function box(nl, wg = { throatK: 0, mouthK: 0 }) {
  return prepareProject({
    schemaVersion: 3,
    nodes: [
      { id: 'd', type: 'driver', params: { ...DRV, nl } },
      { id: 'c', type: 'chamber', params: { volume: 60, length: 40 } },
      { id: 'w', type: 'waveguide', params: { S1: 80, S2: 80, length: 30, ...wg } },
    ],
    edges: [
      { source: 'd', sourceHandle: 'rear', target: 'c', targetHandle: 'in' },
      { source: 'c', sourceHandle: 'out', target: 'w', targetHandle: 'throat' },
    ],
  }).project
}

const O = { harmonics: 6, bandwidth: 1000 }

// CONTRACT: the linear responses are "exact for the linear model" and a
// transient run is the same circuit in time — so a linear transient burst
// must equal the burst computed by inverse FFT.
test('linear responses and a linear transient run agree', async () => {
  const p = box()
  const L = await linearResponses(p, { bandwidth: 1000, resolution: 0.5, burstHz: 40, burstCycles: 6.5 })
  const tr = await transientRun(p, { signal: { type: 'burst', hz: 40, cycles: 6.5 }, levelDb: 0, fs: L.fs, tstop: 0.5, bandwidth: 1000, nonlinear: false })
  let err = 0
  let pk = 0
  let xerr = 0
  let xpk = 0
  for (let i = 0; i < tr.t.length; i++) {
    err = Math.max(err, Math.abs(tr.pressure[i] - L.burst.pressure[i]))
    pk = Math.max(pk, Math.abs(L.burst.pressure[i]))
    xerr = Math.max(xerr, Math.abs(tr.excursion.d[i] - L.burst.excursion.d[i]))
    xpk = Math.max(xpk, Math.abs(L.burst.excursion.d[i]))
  }
  assert.ok(err / pk < 2e-3, `pressure ${err / pk}`)
  assert.ok(xerr / xpk < 2e-3, `excursion ${xerr / xpk}`)
  // the step response of excursion settles to the static displacement Bl/(Re·Kms) per volt
  const xs = L.step.excursion.d
  const settled = xs[Math.round(1.5 * L.fs)]
  const expect = (15 / (3.6 * (1 / 0.19e-3))) * 1000
  assert.ok(Math.abs(settled - expect) / expect < 0.02, `static ${settled} vs ${expect} mm/V`)
})

// CONTRACT (measureTone): steady state, whole periods — the fundamental of a
// linear run is the sweep's level, and its distortion is numerical only.
test('measureTone: the linear fundamental is the sweep level, with no distortion', async () => {
  const p = box()
  const m = await measureTone(p, 40, 0, { ...O, nonlinear: false })
  assert.ok(Math.abs(m.spl - await linearLevel(p, 40, 0)) < 0.01)
  assert.ok(m.thd < 1e-4)
})

// CONTRACT: a curve with points of zero gain is flat, and reproduces the linear model.
test('a flat curve is linear', async () => {
  const m = await measureTone(box({ Bl: { points: [{ x: 0, g: 0, w: 5 }] } }), 25, 10, O)
  assert.ok(m.thd < 1e-4, `${m.thd}`)
})

// CONTRACT: symmetric curves make odd harmonics, asymmetric ones even.
test('driver curves: symmetry decides odd or even harmonics', async () => {
  const sym = await measureTone(box({ Bl: { points: [{ x: 10, g: -0.3, w: 5 }], sym: true } }), 25, 10, O)
  assert.ok(sym.harmonics[2].db > -40, `H3 ${sym.harmonics[2].db}`)
  assert.ok(sym.harmonics[1].db < sym.harmonics[2].db - 40, 'H2 far below H3')
  const asym = await measureTone(box({ Bl: { points: [{ x: 8, g: -0.35, w: 5 }] } }), 25, 10, O)
  assert.ok(asym.harmonics[1].db > asym.harmonics[2].db, 'H2 above H3')
  const kms = await measureTone(box({ Kms: { points: [{ x: 10, g: 1, w: 5 }], sym: true } }), 25, 10, O)
  assert.ok(kms.harmonics[2].db > -40 && kms.harmonics[1].db < -80)
  const le = await measureTone(box({ Le: { points: [{ x: -8, g: 0.6, w: 6 }, { x: 8, g: -0.3, w: 6 }] } }), 25, 10, O)
  assert.ok(le.harmonics[1].db > -50, `Le(x) H2 ${le.harmonics[1].db}`)
  // more drive, more distortion
  const symLow = await measureTone(box({ Bl: { points: [{ x: 10, g: -0.3, w: 5 }], sym: true } }), 25, 0, O)
  assert.ok(sym.thd > 3 * symLow.thd)
})

// CONTRACT (exitLoss): "Δp = K·½ρ·v|v|" — odd harmonics and compression
// that grow with level, and nothing at all in a linear run.
test('duct exit loss: odd harmonics and compression, only when nonlinear', async () => {
  const p = box(undefined, { throatK: 1, mouthK: 1 })
  const lo = await measureTone(p, 38, 0, O)
  const hi = await measureTone(p, 38, 12, O)
  assert.ok(hi.harmonics[2].db > hi.harmonics[1].db + 30, 'odd')
  const cLo = lo.spl - await linearLevel(p, 38, 0)
  const cHi = hi.spl - await linearLevel(p, 38, 12)
  assert.ok(cHi < cLo - 0.3, `compression ${cLo} → ${cHi}`)
  const lin = await measureTone(p, 38, 12, { ...O, nonlinear: false })
  assert.ok(lin.thd < 1e-4)
  const { netlist } = compileProject(p, { fmin: 10, fmax: 1000, npts: 50 })
  assert.ok(!/exit loss/.test(netlist), 'never in the sweep')
})

// CONTRACT (compileProject, tran): output on the sample grid, the internal
// step never past the shortest line delay.
test('transient netlist: interpolated output and a step under the line delays', () => {
  const { netlist } = compileProject(box(), { fmin: 10, fmax: 1000, npts: 50 }, {
    tran: { signal: normalizeSignal({ type: 'sine', hz: 40 }), levelDb: 0, fs: 1000, tstop: 0.1, nonlinear: false },
  })
  assert.match(netlist, /\.options interp/)
  const m = /\.tran (\S+) (\S+) 0 (\S+)/.exec(netlist)
  assert.equal(Number(m[1]), 1e-3)
  const tds = [...netlist.matchAll(/TD=(\S+)/g)].map((x) => Number(x[1]))
  assert.ok(Number(m[3]) <= Math.min(...tds))
  assert.ok(!/^B/m.test(netlist.replace(/^B\d+ \S+ 0 V=.*source$/m, '')), 'no behavioural sources but the signal when linear')
})

// CONTRACT (transientAnalysis): "optionally the same run with the nonlinear
// elements off" — only when there is something nonlinear to compare.
test('transientAnalysis: a linear comparison only when something is nonlinear', async () => {
  const opts = { signal: { type: 'burst', hz: 50, cycles: 4 }, duration: 0.2, fs: 4000, compareLinear: true, nonlinear: true }
  const plain = await transientAnalysis(box(), opts)
  assert.equal(plain.linear, null)
  const curved = await transientAnalysis(box({ Bl: { points: [{ x: 5, g: -0.3, w: 4 }] } }), opts)
  assert.ok(curved.linear)
  assert.deepEqual(curved.run.nonlinearDrivers, ['d'])
  assert.equal(curved.run.t.length, curved.linear.t.length)
})

// CONTRACT (distortionAnalysis): the modes and their shapes.
test('distortionAnalysis: thd and max SPL results', async () => {
  const p = box({ Bl: { points: [{ x: 10, g: -0.3, w: 5 }], sym: true } })
  const t = await distortionAnalysis(p, 'thd', { f1: 25, f2: 50, points: 2, levelDb: 6, harmonics: 5 })
  assert.equal(t.rows.length, 2)
  assert.ok(t.rows.every((r) => r.thd > 0 && r.h3 < 0))
  const m = await distortionAnalysis(p, 'maxspl', { bands: [40], xLimit: 1.5 })
  assert.equal(m.rows.length, 1)
  assert.ok(m.rows[0].spl > 90)
  assert.ok(['excursion', 'H2', 'H3', 'H4', 'H5', 'H6', 'H7', 'H8', 'H9', 'H10'].includes(m.rows[0].limit))
  await assert.rejects(distortionAnalysis(p, 'loudness'), /unknown distortion analysis/)
})

// CONTRACT: the small helpers.
test('helpers: logFreqs, brokenLimit, levels, splOf', () => {
  assert.deepEqual(logFreqs(10, 1000, 3), [10, 100, 1000])
  assert.deepEqual(logFreqs(20, 80, 1), [20])
  assert.equal(CEA2010_LIMITS[3], -15)
  const h = (n, db) => ({ n, db })
  assert.equal(brokenLimit({ harmonics: [h(1, 0), h(2, -12), h(3, -14)], xPeak: {} }, 10), 'H3')
  assert.equal(brokenLimit({ harmonics: [h(1, 0), h(2, -12)], xPeak: { d: 11 } }, 10), 'excursion')
  assert.equal(brokenLimit({ harmonics: [h(1, 0), h(2, -12)], xPeak: { d: 9 } }, 10), null)
  assert.deepEqual(levels([3, -4, 0]), { peak: 4, rms: Math.sqrt(25 / 3) })
  assert.ok(Math.abs(splOf(1) - 93.979) < 1e-3)
})
