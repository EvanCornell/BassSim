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
  logFreqs, brokenLimit, levels, splOf, CEA2010_LIMITS, maxLevel, linearPoint, scaleLinear,
} from '../../src/spice/timedomain.js'
import { setThreads, setRunner, runLocal } from '../../src/spice/run.js'

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

// CONTRACT (measureTone, linearPoint): a linear run's excursion, port
// velocity, impedance, powers and efficiency are the linear model's.
test('measureTone: a linear run gives the linear model\'s figures', async () => {
  const p = box()
  for (const hz of [25, 38, 80]) {
    const m = await measureTone(p, hz, 6, { ...O, nonlinear: false })
    const l = await linearPoint(p, hz, 6)
    const near = (a, b, tol, what) => assert.ok(Math.abs(a - b) <= tol * Math.abs(b), `${hz} Hz ${what}: ${a} vs ${b}`)
    near(m.xPeak.d, l.xPeak.d, 5e-3, 'excursion')
    near(m.vPeak.w, l.vPeak.w, 5e-3, 'velocity')
    near(m.z.ch1.mag, l.z.ch1.mag, 5e-3, '|Z|')
    assert.ok(Math.abs(m.z.ch1.phase - l.z.ch1.phase) < 0.5, `${hz} Hz phase`)
    near(m.pe, l.pe, 5e-3, 'electrical power')
    near(m.pa, l.pa, 5e-3, 'acoustic power')
    near(m.efficiency, l.efficiency, 5e-3, 'efficiency')
  }
})

// CONTRACT (scaleLinear): excursion and velocity scale with the drive,
// power with its square; impedance and efficiency do not change.
test('scaleLinear', () => {
  const lin = { spl: 90, xPeak: { d: 1 }, vPeak: { w: 2 }, z: { ch1: { mag: 6, phase: 10 } }, pe: 1, pa: 0.01, efficiency: 0.01 }
  const s = scaleLinear(lin, 20)
  assert.equal(s.spl, 110)
  assert.ok(Math.abs(s.xPeak.d - 10) < 1e-12 && Math.abs(s.vPeak.w - 20) < 1e-12)
  assert.ok(Math.abs(s.pe - 100) < 1e-9 && Math.abs(s.pa - 1) < 1e-9)
  assert.deepEqual(s.z, lin.z)
  assert.equal(s.efficiency, lin.efficiency)
})

// CONTRACT (distortionAnalysis compression): every point carries its
// measured figures and the linear model's at the same level; exit losses
// hold the port velocity and efficiency below the linear model's, more so
// at higher level.
test('compression across level: the figures, against the linear model', async () => {
  const p = box(undefined, { throatK: 1, mouthK: 1 })
  const res = await distortionAnalysis(p, 'compression', { ...O, f1: 38, f2: 38, points: 1, levels: [0, 12] })
  const [row] = res.rows
  for (const L of [0, 12]) {
    assert.ok(row.at[L] && row.linear[L], `level ${L}`)
    assert.equal(row.at[L].cmp, row[`cmp${L}`])
    for (const k of ['xPeak', 'vPeak', 'z']) assert.ok(Object.keys(row.at[L][k]).length, k)
  }
  const ratio = (L) => row.at[L].vPeak.w / row.linear[L].vPeak.w
  assert.ok(ratio(12) < ratio(0) && ratio(12) < 0.95, `velocity ratio ${ratio(0)} → ${ratio(12)}`)
  assert.ok(row.at[12].efficiency < row.linear[12].efficiency, 'efficiency falls')
  assert.ok(Math.abs(row.linear[12].pe / row.linear[0].pe - Math.pow(10, 1.2)) < 1e-6, 'linear power scales with the square')
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

// CONTRACT (compileProject, tran; line.js segment): output on the sample
// grid; lines as L-C ladders, not ideal lines, so their delays never limit
// or stall the step; the internal step at most an eighth of a period at the
// model bandwidth.
test('transient netlist: interpolated output, ladders for lines, a bounded step', () => {
  const { netlist } = compileProject(box(), { fmin: 10, fmax: 1000, npts: 50 }, {
    tran: { signal: normalizeSignal({ type: 'sine', hz: 40 }), levelDb: 0, fs: 1000, tstop: 0.1, nonlinear: false },
  })
  assert.match(netlist, /\.options interp klu\n/)
  assert.match(netlist, /\.tran .* uic\n/)
  const m = /\.tran (\S+) (\S+) 0 (\S+)/.exec(netlist)
  assert.equal(Number(m[1]), 1e-3)
  assert.ok(Number(m[3]) <= 1 / 8000 + 1e-15)
  assert.ok(!/^T/m.test(netlist), 'no ideal lines')
  const { netlist: ac } = compileProject(box(), { fmin: 10, fmax: 1000, npts: 50 })
  assert.ok(/^T/m.test(ac), 'the sweep keeps the exact line')
  const robust = compileProject(box(), { fmin: 10, fmax: 1000, npts: 50 }, {
    tran: { signal: normalizeSignal({ type: 'sine', hz: 40 }), fs: 1000, tstop: 0.1, robust: true },
  }).netlist
  assert.match(robust, /method=gear/)
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

// The cases that used to stall ("timestep too small"): sharp-edged signals —
// pink noise, a sweep's end — through ducts, and a nonlinear driver pushed
// past its curves' range.
test('hard signals run without stalling', async () => {
  const p = box({ Bl: { points: [{ x: 8, g: -0.5, w: 4 }], sym: true }, Kms: { points: [{ x: 8, g: 2, w: 4 }], sym: true } }, { throatK: 1, mouthK: 1 })
  for (const signal of [
    { type: 'noise', f1: 10, f2: 300, length: 0.3 },
    { type: 'sweep', f1: 10, f2: 300, length: 0.3 },
    { type: 'burst', hz: 30, cycles: 6.5 },
  ]) {
    for (const nonlinear of [false, true]) {
      const r = await transientRun(p, { signal, levelDb: 12, fs: 8000, tstop: 0.35, bandwidth: 1000, nonlinear })
      assert.equal(r.t.length, Math.round(0.35 * 8000) + 1, `${signal.type} ${nonlinear}`)
      assert.ok(r.pressure.every(Number.isFinite))
    }
  }
})

// CONTRACT (maxLevel): "the highest passing level below the lowest breaking
// one", to 0.25 dB, whatever the width; wider rounds need no more of them.
test('maxLevel: finds the threshold, in fewer rounds when wider', async () => {
  for (const T of [7.3, -5.1, 0.1]) {
    const rounds = {}
    for (const width of [1, 3, 8]) {
      let n = 0
      const r = await maxLevel({
        start: 0, top: 30, bottom: -48, width: () => width,
        test: async (L) => ({ broke: L > T ? 'H3' : null }),
        onRound: () => { n++ },
      })
      assert.ok(r.lo.L <= T && T - r.lo.L <= 0.25, `T ${T} width ${width}: lo ${r.lo.L}`)
      assert.ok(r.hi.L > T && r.hi.L - r.lo.L <= 0.25)
      assert.equal(r.hi.broke, 'H3')
      rounds[width] = n
    }
    assert.ok(rounds[8] <= rounds[3] && rounds[3] < rounds[1], JSON.stringify(rounds))
  }
})

// CONTRACT (maxLevel): the range bounds the search: nothing breaks → no
// `hi`; everything breaks → no `lo`.
test('maxLevel: limits of the range', async () => {
  const none = await maxLevel({ start: 0, top: 12, bottom: -48, width: () => 4, test: async () => ({ broke: null }) })
  assert.equal(none.hi, null)
  assert.equal(none.lo.L, 12)
  const all = await maxLevel({ start: 0, top: 12, bottom: -9, width: () => 2, test: async () => ({ broke: 'excursion' }) })
  assert.equal(all.lo, null)
  assert.equal(all.hi.L, -9)
})

// CONTRACT (distortionAnalysis maxspl, transientAnalysis): the parallel
// forms give the same answers as one run at a time.
test('maxspl with several threads matches one thread', async () => {
  const opts = { bands: [30, 45], bandwidth: 400, xLimit: 1.5, maxBoostDb: 18 }
  const p = box({ Bl: { points: [{ x: 6, g: -0.35, w: 5 }], symmetric: true } })
  setThreads(1)
  const one = await distortionAnalysis(p, 'maxspl', opts)
  setThreads(6)
  try {
    const many = await distortionAnalysis(p, 'maxspl', opts)
    one.rows.forEach((r, i) => {
      assert.equal(many.rows[i].limit, r.limit)
      assert.ok(Math.abs(many.rows[i].levelDb - r.levelDb) <= 0.25, `${r.hz} Hz: ${r.levelDb} vs ${many.rows[i].levelDb}`)
    })
  } finally { setThreads(1) }
})

// CONTRACT (transientRun, SOLVER_SETTINGS): "A run that fails is tried
// again with each of SOLVER_SETTINGS in turn; only when every one fails does
// the run fail, with ngspice's own message from the first."
test('transientRun falls back through the solver settings', async () => {
  const seen = []
  setRunner((netlist, kind) => {
    const opts = /^\.options interp(.*)$/m.exec(netlist)[1].trim()
    seen.push(opts)
    if (/klu/.test(opts)) return Promise.reject(new Error('SPICE could not solve this circuit: Timestep too small; time = 0.01'))
    return runLocal(netlist, kind)
  })
  try {
    const r = await transientRun(box(), { signal: { type: 'sine', hz: 40 }, fs: 2000, tstop: 0.05, bandwidth: 400 })
    assert.equal(seen.length, 2)
    assert.equal(seen[1], '', 'then ngspice\'s default solver, as before KLU')
    assert.equal(r.t[0], 0)
    assert.ok(r.pressure.some((v) => Math.abs(v) > 0))
    seen.length = 0
    setRunner(() => Promise.reject(new Error('SPICE could not solve this circuit: singular matrix')))
    await assert.rejects(transientRun(box(), { signal: { type: 'sine', hz: 40 }, fs: 2000, tstop: 0.05, bandwidth: 400 }), /singular matrix/)
  } finally { setRunner(null) }
})

// CONTRACT (distortionAnalysis): a point no setting can solve is "left out
// and listed in `failed`"; only when every point fails does the analysis fail.
test('distortion: an unsolvable point is listed, the rest complete', async () => {
  const w45 = String(2 * Math.PI * 45).slice(0, 8)
  setRunner((netlist, kind) => (netlist.includes(`sin(${w45}`) ? Promise.reject(new Error('SPICE could not solve this circuit: stuck')) : runLocal(netlist, kind)))
  try {
    const r = await distortionAnalysis(box(), 'thd', { f1: 30, f2: 60, points: 3, harmonics: 4, bandwidth: 400 })
    assert.deepEqual(r.rows.map((x) => x.hz), [30, 42.4, 60])
    const bad = await distortionAnalysis(box(), 'thd', { f1: 45, f2: 45, points: 1, harmonics: 4, bandwidth: 400 }).catch((e) => e)
    assert.match(bad.message, /No point could be solved\. 45 Hz: .*stuck/)
    const some = await distortionAnalysis(box(), 'thd', { f1: 30, f2: 67.5, points: 3, harmonics: 4, bandwidth: 400 })
    assert.deepEqual(some.rows.map((x) => x.hz), [30, 45, 67.5])
    assert.equal(some.rows[1].thd, null)
    assert.ok(some.rows[0].thd > 0 && some.rows[2].thd > 0)
    assert.equal(some.failed.length, 1)
    assert.match(some.failed[0].label, /^45 Hz$/)
    assert.match(some.failed[0].error, /stuck/)
  } finally { setRunner(null) }
})
