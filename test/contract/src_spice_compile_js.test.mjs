// Contract tests for the SPICE compiler (src/spice/compile.js, line.js,
// elements.js, wiring.js, nets.js) — each element against the exact physics it
// represents, and the compiler's own rules. The solver itself is ngspice's and
// is not under test here.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { compileProject, pointsPerDecade } from '../../src/spice/compile.js'
import { compileLine } from '../../src/spice/line.js'
import { applyDvc } from '../../src/spice/elements.js'
import { filterSections, sectionsResponse } from '../../src/spice/filters.js'
import { createNetlist, DC_TIE } from '../../src/spice/netlist.js'
import { fitBand } from '../../src/spice/networks.js'
import { runNetlist } from '../../src/spice/run.js'
import { RHO, C_AIR, perimeter, viscousCoeff, thermalCoeff } from '../../src/spice/physics.js'
import { simulateProject } from '../../src/engine/pipeline.js'
import { migrateProject } from '../../src/schema/migrate.js'
import { resolveProject } from '../../src/schema/params.js'
import { radiationImpedance, waveguideMatrix } from '../../src/engine/acoustics.js'
import { junctionCorrection } from '../../src/engine/geometry.js'

// ---------- helpers ----------

/**
 * Complex arithmetic on {re, im}.
 */
const cx = {
  add: (a, b) => ({ re: a.re + b.re, im: a.im + b.im }),
  mul: (a, b) => ({ re: a.re * b.re - a.im * b.im, im: a.re * b.im + a.im * b.re }),
  div: (a, b) => { const d = b.re * b.re + b.im * b.im; return { re: (a.re * b.re + a.im * b.im) / d, im: (a.im * b.re - a.re * b.im) / d } },
  sqrt: (a) => { const r = Math.hypot(a.re, a.im); const t = Math.atan2(a.im, a.re) / 2; return { re: Math.sqrt(r) * Math.cos(t), im: Math.sqrt(r) * Math.sin(t) } },
  abs: (a) => Math.hypot(a.re, a.im),
  pow: (w, alpha) => ({ re: Math.pow(w, alpha) * Math.cos((alpha * Math.PI) / 2), im: Math.pow(w, alpha) * Math.sin((alpha * Math.PI) / 2) }),
}

/**
 * Input impedance of a line compiled on its own, far end terminated in ZL.
 *
 * @param {object} spec - `compileLine` spec (points default to []).
 * @param {number} ZL - Terminating resistance.
 * @param {number} f1 - Lowest frequency.
 * @param {number} f2 - Highest frequency.
 * @returns {Promise<Array<{f: number, z: object}>>} Z at each point.
 */
async function lineZ(spec, ZL, f1, f2) {
  const nl = createNetlist('line')
  const ctx = { nl, band: fitBand(f1, f2), fmax: f2 }
  const line = compileLine(ctx, { points: [], ...spec })
  nl.lines.push('V1 src 0 DC 0 AC 1', `Rtie src ${line.start} ${DC_TIE}`, `RL ${line.end} 0 ${ZL}`)
  nl.lines.push('.save i(v1)', `.ac dec 20 ${f1} ${f2}`, '.end')
  const raw = await runNetlist(nl.text())
  const I = raw.vec('i(v1)')
  return raw.freqs.map((f, i) => ({ f, z: cx.div({ re: 1, im: 0 }, { re: -I.re[i], im: -I.im[i] }) }))
}

/**
 * Exact input impedance of a uniform line with per-metre Z′ and Y′.
 *
 * @param {object} Zp - Series impedance per metre.
 * @param {object} Yp - Shunt admittance per metre.
 * @param {number} L - Length.
 * @param {number} ZL - Termination.
 * @returns {object} Zin.
 */
function exactLine(Zp, Yp, L, ZL) {
  const g = cx.sqrt(cx.mul(Zp, Yp))
  const Zc = cx.sqrt(cx.div(Zp, Yp))
  const gl = { re: g.re * L, im: g.im * L }
  // tanh(gl)
  const e2 = { re: Math.exp(-2 * gl.re) * Math.cos(-2 * gl.im), im: Math.exp(-2 * gl.re) * Math.sin(-2 * gl.im) }
  const t = cx.div({ re: 1 - e2.re, im: -e2.im }, { re: 1 + e2.re, im: e2.im })
  const zl = { re: ZL, im: 0 }
  return cx.mul(Zc, cx.div(cx.add(zl, cx.mul(Zc, t)), cx.add(Zc, cx.mul(zl, t))))
}

/** A driver in display units. */
const DRV = { Fs: 30, Qts: 0.45, Qes: 0.5, Qms: 5, Vas: 60, Re: 3.6, Bl: 15, Mms: 150, Cms: 0.19, Sd: 480, Le: 1.5, LeExp: 0.7, Xmax: 15, Rms: 4 }

/**
 * Run a sparse v3 project on the SPICE engine.
 *
 * @param {object} p - Sparse v3 project.
 * @returns {Promise<object>} `{results, metrics}`.
 */
const sim = (p) => simulateProject({ schemaVersion: 3, analyses: [{ id: 'a', type: 'ac', fmin: 10, fmax: 1000, npts: 201 }], ...p }, { engine: 'spice' })

// ---------- tests ----------

// CONTRACT: "ngspice's decade sweep includes both ends, so it yields
// ppd·decades + 1 points."
test('pointsPerDecade: closest to the requested count', () => {
  assert.equal(pointsPerDecade(10, 1000, 201), 100)
  assert.equal(pointsPerDecade(10, 1000, 512), 256)
  assert.equal(pointsPerDecade(10, 11, 2), 24)
})

// CONTRACT (line.js): "A uniform lossless piece is one exact SPICE transmission line."
test('compileLine: a lossless duct is the exact transmission line', async () => {
  const S = 0.008, L = 0.6, ZL = (RHO * C_AIR) / S / 3
  const rows = await lineZ({ note: 'duct', L, area: () => S, c: C_AIR, shape: 'round', viscous: 0, thermal: 0, flowResistance: 0, stepped: false, lumped: false, volume: 0 }, ZL, 10, 2000)
  for (const { f, z } of rows) {
    const w = 2 * Math.PI * f
    const want = exactLine({ re: 0, im: (w * RHO) / S }, { re: 0, im: (w * S) / (RHO * C_AIR * C_AIR) }, L, ZL)
    assert.ok(cx.abs(cx.add(z, { re: -want.re, im: -want.im })) / cx.abs(want) < 1e-4, `${f.toFixed(1)} Hz`)
  }
})

// CONTRACT (line.js): "A flared piece is stepped into slices along its area
// profile." — the same stepping the legacy engine's waveguideMatrix uses.
test('compileLine: a flared horn matches the stepped-line matrix', async () => {
  const S1 = 0.005, S2 = 0.05, L = 1.2, ZL = (RHO * C_AIR) / S2
  const { areaProfile } = await import('../../src/engine/geometry.js')
  const rows = await lineZ({ note: 'horn', L, area: areaProfile('exponential', S1, S2, L), c: C_AIR, shape: 'round', viscous: 0, thermal: 0, flowResistance: 0, stepped: true, lumped: false, volume: 0 }, ZL, 20, 1000)
  for (const { f, z } of rows) {
    const M = waveguideMatrix({ S1, S2, L, flare: 'exponential', Q: Infinity }, 2 * Math.PI * f, 24)
    const zl = { re: ZL, im: 0 }
    const want = cx.div(cx.add(cx.mul(M[0][0], zl), M[0][1]), cx.add(cx.mul(M[1][0], zl), M[1][1]))
    assert.ok(cx.abs(cx.add(z, { re: -want.re, im: -want.im })) / cx.abs(want) < 1e-3, `${f.toFixed(1)} Hz`)
  }
})

// CONTRACT (line.js): wall loss "follows the geometry and scales with length
// the way friction and heat exchange do" — the distributed lumps reproduce an
// exactly lossy line with Z′ = jωρ/S + A√(jω) and Y′ = jωS/ρc² + B√(jω).
test('compileLine: distributed wall loss matches the exact lossy line within 1%', async () => {
  const S = 0.004, L = 2, ZL = (RHO * C_AIR) / S / 2
  const P = perimeter(S)
  const A = viscousCoeff(S, P), B = thermalCoeff(P)
  const rows = await lineZ({ note: 'lossy', L, area: () => S, c: C_AIR, shape: 'round', viscous: 1, thermal: 1, flowResistance: 0, stepped: false, lumped: false, volume: 0 }, ZL, 10, 1000)
  for (const { f, z } of rows) {
    const w = 2 * Math.PI * f
    const want = exactLine(
      cx.add({ re: 0, im: (w * RHO) / S }, cx.mul({ re: A, im: 0 }, cx.pow(w, 0.5))),
      cx.add({ re: 0, im: (w * S) / (RHO * C_AIR * C_AIR) }, cx.mul({ re: B, im: 0 }, cx.pow(w, 0.5))),
      L, ZL)
    const e = cx.abs(cx.add(z, { re: -want.re, im: -want.im })) / cx.abs(want)
    assert.ok(e < 0.01, `${f.toFixed(1)} Hz: off ${(e * 100).toFixed(2)}%`)
  }
})

// CONTRACT (compileDriver, compileChamber, radiation, wiring, adapt): a sealed
// box — driver rear into a lumped chamber, front radiating into half space —
// against a closed-form model of the same physics built independently here:
//   Zin = Re + Le(jω)^n + Bl² / (Zm + Sd²·(Zrad + Zbox)),
//   Zbox = jωρΔ/Sc + 1 / (jωC + B·L·√(jω)),  p = jωρ·Sd·u / 2π,
// Δ the step correction where the cone meets the wider box face.
test('sealed box: impedance, SPL and excursion match the closed-form model', async () => {
  const V = 0.05, len = 0.3
  const { results: r } = await sim({
    nodes: [
      { id: 'd', type: 'driver', params: DRV },
      { id: 'c', type: 'chamber', params: { volume: V * 1000, length: len * 100 } },
    ],
    edges: [{ source: 'd', sourceHandle: 'rear', target: 'c', targetHandle: 'in' }],
    analyses: [{ id: 'a', type: 'ac', fmin: 10, fmax: 1000, npts: 201, masking: true }],
    wiring: { channels: [{ id: 'ch', volts: 2.83 }] },
  })
  const Re = 3.6, Le = 1.5e-3, n = 0.7, Bl = 15, Mms = 0.15, Cms = 0.19e-3, Rms = 4, Sd = 0.048
  const C = V / (RHO * C_AIR * C_AIR)
  const Bt = thermalCoeff(perimeter(V / len, 'rectangular')) * len
  // The cone meets a wider box face; the box holds the step's mass, since a
  // driver has nowhere to put it.
  const Sc = V / len
  const Mstep = (RHO * junctionCorrection(Sc, Sd)) / Sc
  r.freqs.forEach((f, i) => {
    const w = 2 * Math.PI * f
    const Zbox = cx.add({ re: 0, im: w * Mstep }, cx.div({ re: 1, im: 0 }, cx.add({ re: 0, im: w * C }, cx.mul({ re: Bt, im: 0 }, cx.pow(w, 0.5)))))
    const Zrad = radiationImpedance(Sd, 'half', w)
    const Zm = cx.add({ re: Rms, im: w * Mms - 1 / (w * Cms) }, cx.mul({ re: Sd * Sd, im: 0 }, cx.add(Zrad, Zbox)))
    const Zin = cx.add({ re: Re, im: 0 }, cx.add(cx.mul({ re: Le, im: 0 }, cx.pow(w, n)), cx.div({ re: Bl * Bl, im: 0 }, Zm)))
    const eZ = Math.abs(r.zinMag[i] / cx.abs(Zin) - 1)
    assert.ok(eZ < 0.005, `${f.toFixed(1)} Hz |Z|: ${r.zinMag[i]} vs ${cx.abs(Zin)}`)
    const u = cx.div(cx.mul({ re: Bl, im: 0 }, cx.div({ re: 2.83, im: 0 }, Zin)), Zm)
    const p = (w * RHO * Sd * cx.abs(u)) / (2 * Math.PI)
    const want = 20 * Math.log10(p / 20e-6)
    assert.ok(Math.abs(r.splCombined[i] - want) < 0.05, `${f.toFixed(1)} Hz SPL: ${r.splCombined[i]} vs ${want}`)
    assert.ok(Math.abs(r.excursion[i] / ((cx.abs(u) * Math.SQRT2 * 1000) / w) - 1) < 0.005, `${f.toFixed(1)} Hz excursion`)
  })
})

// CONTRACT (nets.js): "Every set of handles joined by edges is one netlist
// node" — five ports between two chambers are five branches between the same
// two nodes.
test('compileProject: parallel ports share their junction nodes', () => {
  const nodes = [{ id: 'd', type: 'driver', params: DRV }, { id: 'a', type: 'chamber', params: {} }, { id: 'b', type: 'chamber', params: {} }]
  const edges = [{ source: 'd', sourceHandle: 'rear', target: 'a', targetHandle: 'in' }]
  for (let k = 0; k < 5; k++) {
    nodes.push({ id: `p${k}`, type: 'waveguide', params: { length: 200, loss: 0 } })
    edges.push({ source: 'a', sourceHandle: 'out', target: `p${k}`, targetHandle: 'throat' })
    edges.push({ source: `p${k}`, sourceHandle: 'mouth', target: 'b', targetHandle: 'in' })
  }
  const { project } = resolveProject(migrateProject({ schemaVersion: 3, nodes, edges }))
  const { netlist } = compileProject(project, project.analyses[0])
  const firstPin = (re) => [...new Set(netlist.split('\n').filter((l) => re.test(l)).map((l) => l.split(' ')[1]))]
  assert.equal(firstPin(/throat flow/).length, 1, 'all five throats on one node')
  assert.equal(firstPin(/mouth flow/).length, 1, 'all five mouths on one node')
})

// CONTRACT (junction rule): a straight lossless duct split into equal-area
// pieces is the same duct — no correction at a join of equal areas.
test('compileProject: a lossless duct split into pieces is unchanged', async () => {
  /**
   * A driver into a box into a 60 cm port drawn as `k` pieces.
   *
   * @param {number} k - Pieces.
   * @returns {object} The project.
   */
  const box = (k) => {
    const nodes = [{ id: 'd', type: 'driver', params: DRV }, { id: 'c', type: 'chamber', params: { volume: 60, length: 40 } }]
    const edges = [{ source: 'd', sourceHandle: 'rear', target: 'c', targetHandle: 'in' }]
    let prev = ['c', 'out']
    for (let i = 0; i < k; i++) {
      nodes.push({ id: `w${i}`, type: 'waveguide', params: { length: 60 / k, loss: 0 } })
      edges.push({ source: prev[0], sourceHandle: prev[1], target: `w${i}`, targetHandle: 'throat' })
      prev = [`w${i}`, 'mouth']
    }
    return { nodes, edges }
  }
  const one = (await sim(box(1))).results
  for (const k of [2, 5]) {
    const split = (await sim(box(k))).results
    for (let i = 0; i < one.freqs.length; i++) {
      assert.ok(Math.abs(split.zinMag[i] / one.zinMag[i] - 1) < 1e-4, `${k} pieces, ${one.freqs[i].toFixed(1)} Hz`)
      assert.ok(Math.abs(split.splCombined[i] - one.splCombined[i]) < 1e-3, `${k} pieces SPL`)
    }
  }
})

// CONTRACT (connections have no direction; ids are only names): reversing an
// edge's direction and renaming every node give the same answer.
test('compileProject: edge direction and node names do not matter', async () => {
  const a = await sim({
    nodes: [{ id: 'd', type: 'driver', params: DRV }, { id: 'c', type: 'chamber', params: {} }, { id: 'w', type: 'waveguide', params: {} }],
    edges: [{ source: 'd', sourceHandle: 'rear', target: 'c', targetHandle: 'in' }, { source: 'c', sourceHandle: 'out', target: 'w', targetHandle: 'throat' }],
  })
  const b = await sim({
    nodes: [{ id: 'zz', type: 'waveguide', params: {} }, { id: 'yy', type: 'chamber', params: {} }, { id: 'xx', type: 'driver', params: DRV }],
    edges: [{ source: 'zz', sourceHandle: 'throat', target: 'yy', targetHandle: 'out' }, { source: 'yy', sourceHandle: 'in', target: 'xx', targetHandle: 'rear' }],
  })
  for (let i = 0; i < a.results.freqs.length; i++) {
    assert.ok(Math.abs(a.results.zinMag[i] / b.results.zinMag[i] - 1) < 1e-6)
    assert.ok(Math.abs(a.results.splCombined[i] - b.results.splCombined[i]) < 1e-5)
  }
})

// CONTRACT (passivity): a passive box never presents a negative resistance, and
// never radiates more power than the amplifier delivers.
test('compileProject: impedance is passive and efficiency stays below 1', async () => {
  const nodes = [{ id: 'd', type: 'driver', params: DRV }, { id: 'a', type: 'chamber', params: {} }, { id: 'b', type: 'chamber', params: {} },
    { id: 'o', type: 'waveguide', params: {} }]
  const edges = [{ source: 'd', sourceHandle: 'rear', target: 'a', targetHandle: 'in' }, { source: 'b', sourceHandle: 'out', target: 'o', targetHandle: 'throat' }]
  for (let k = 0; k < 3; k++) {
    nodes.push({ id: `p${k}`, type: 'waveguide', params: { length: 150 } })
    edges.push({ source: 'a', sourceHandle: 'out', target: `p${k}`, targetHandle: 'throat' }, { source: `p${k}`, sourceHandle: 'mouth', target: 'b', targetHandle: 'in' })
  }
  const { results: r } = await sim({ nodes, edges })
  for (let i = 0; i < r.freqs.length; i++) {
    assert.ok(Math.abs(r.zinPhase[i]) <= 90 + 1e-6, `${r.freqs[i]} Hz phase ${r.zinPhase[i]}`)
    assert.ok(r.power[i] <= r.peReal[i] * (1 + 1e-6), `${r.freqs[i]} Hz: radiated ${r.power[i]} > electrical ${r.peReal[i]}`)
  }
})

// CONTRACT (applyDvc): "Parallel quarters Re and Le and halves Bl, leaving
// Bl²/Re — and so Qes and the response shape — unchanged." Parallel coils at
// half the voltage give the series response exactly, at a quarter the impedance.
test('dual voice coil: parallel is the series driver at a quarter the impedance', async () => {
  assert.deepEqual(applyDvc({ Re: 4, Bl: 20, Le: 2 }), { Re: 4, Bl: 20, Le: 2 })
  assert.deepEqual(applyDvc({ Re: 4, Bl: 20, Le: 2, dvc: { coils: 'one' } }), { Re: 2, Bl: 10, Le: 0.5, dvc: { coils: 'one' } })
  /**
   * A sealed box with the driver's coils wired one way, at a given drive.
   *
   * @param {string} coils - DVC wiring.
   * @param {number} volts - Drive.
   * @returns {Promise<object>} Results.
   */
  const run = async (coils, volts) => (await sim({
    nodes: [{ id: 'd', type: 'driver', params: { ...DRV, dvc: { coilOhms: 4, coils } } }, { id: 'c', type: 'chamber', params: {} }],
    edges: [{ source: 'd', sourceHandle: 'rear', target: 'c', targetHandle: 'in' }],
    wiring: { channels: [{ id: 'ch', volts }] },
  })).results
  const s = await run('series', 4)
  const p = await run('parallel', 2)
  for (let i = 0; i < s.freqs.length; i++) {
    assert.ok(Math.abs(p.zinMag[i] * 4 / s.zinMag[i] - 1) < 1e-6)
    assert.ok(Math.abs(p.splCombined[i] - s.splCombined[i]) < 1e-6)
  }
})

// CONTRACT (taps): a tap is a node partway along a line. A driver at the middle
// of a closed pipe sits on the pressure node of the pipe's odd modes and does
// not excite them; off-centre it does. The even modes are excited either way.
test('taps: where a driver joins a closed pipe decides which modes it excites', async () => {
  /**
   * Resonance peaks of the pressure at the far end of a closed 1 m pipe driven at `x` cm.
   *
   * @param {number} x - Tap position, cm.
   * @returns {Promise<number[]>} Peak frequencies, Hz.
   */
  const peaks = async (x) => {
    const r = (await sim({
      nodes: [
        { id: 'd', type: 'driver', params: DRV },
        { id: 'c', type: 'chamber', params: { volume: 10, length: 100, taps: [{ id: 't', position: x }] } },
      ],
      edges: [{ source: 'd', sourceHandle: 'front', target: 'c', targetHandle: 'tap:t' }],
      probes: [{ id: 'far', kind: 'pressure', at: { node: 'c', position: 100 } }],
      analyses: [{ id: 'a', type: 'ac', fmin: 20, fmax: 800, npts: 400 }],
    })).results
    const p = r.splInterior.far
    return r.freqs.filter((f, i) => i > 0 && i < p.length - 1 && p[i] > p[i - 1] && p[i] > p[i + 1])
  }
  const inBand = (fs, lo, hi) => fs.some((f) => f > lo && f < hi)
  const off = await peaks(20)
  const mid = await peaks(50)
  assert.ok(inBand(off, 150, 250), `off-centre excites the first mode: ${off.map((f) => f.toFixed(0))}`)
  assert.ok(!inBand(mid, 150, 250), `centred does not: ${mid.map((f) => f.toFixed(0))}`)
  assert.ok(inBand(off, 300, 400) && inBand(mid, 300, 400), 'both excite the second mode')
})

// CONTRACT (wiring): polarity flips the output's phase and not its level.
test('wiring: channel polarity inverts phase only', async () => {
  const base = {
    nodes: [{ id: 'd', type: 'driver', params: DRV }, { id: 'c', type: 'chamber', params: {} }],
    edges: [{ source: 'd', sourceHandle: 'rear', target: 'c', targetHandle: 'in' }],
  }
  const a = (await sim({ ...base, wiring: { channels: [{ id: 'ch', volts: 2.83 }] } })).results
  const b = (await sim({ ...base, wiring: { channels: [{ id: 'ch', volts: 2.83, dsp: { polarity: -1 } }] } })).results
  for (let i = 0; i < a.freqs.length; i++) {
    assert.ok(Math.abs(a.splCombined[i] - b.splCombined[i]) < 1e-9)
    const d = ((b.phase[i] - a.phase[i]) % 360 + 360) % 360
    assert.ok(Math.abs(d - 180) < 1e-6, `${a.freqs[i]} Hz phase shift ${d}`)
  }
})

// CONTRACT (filters.js): every filter is "a cascade of first- and
// second-order sections, each one a real R-L-C network". The compiled chain
// must reproduce the analytic cascade: the SPL difference with and without
// the filters is exactly the filters' own magnitude, and a bypassed filter is
// not in the signal.
test('wiring: DSP filters are the analytic cascade, in circuit', async () => {
  const filters = [
    { type: 'highpass', shape: 'linkwitz-riley', order: 4, hz: 25 },
    { type: 'lowpass', shape: 'butterworth', order: 3, hz: 300 },
    { type: 'peq', hz: 50, q: 3, db: 6 },
    { type: 'lowshelf', hz: 40, q: 0.7, db: -4 },
    { type: 'highshelf', hz: 200, q: 0.9, db: 3 },
    { type: 'peq', hz: 80, q: 1, db: 12, bypass: true },
  ]
  const base = { nodes: [{ id: 'd', type: 'driver', params: DRV }], edges: [] }
  const a = (await sim(base)).results
  const b = (await sim({ ...base, wiring: { channels: [{ id: 'ch', volts: 2.83, dsp: { filters } }] } })).results
  const secs = filters.filter((f) => !f.bypass).flatMap(filterSections)
  for (let i = 0; i < a.freqs.length; i++) {
    const h = sectionsResponse(secs, a.freqs[i])
    const want = 20 * Math.log10(Math.hypot(h.re, h.im))
    assert.ok(Math.abs(b.splCombined[i] - a.splCombined[i] - want) < 1e-6, `${a.freqs[i]} Hz`)
  }
})

// CONTRACT (compileWiring): "@throws Error When a channel's DSP filter is
// malformed" — and validation refuses it before it gets that far.
test('wiring: a malformed filter is an error naming the channel', async () => {
  await assert.rejects(sim({
    nodes: [{ id: 'd', type: 'driver', params: DRV }],
    edges: [],
    wiring: { channels: [{ id: 'ch', label: 'Sub amp', volts: 2.83, dsp: { filters: [{ type: 'bandstop', hz: 20 }] } }] },
  }), /Sub amp › filter 1: unknown filter type/)
})

// CONTRACT (adaptResults): "Impedance is the load each channel sees"; the
// first channel's is `zinMag`.
test('wiring: each channel reports the impedance it sees', async () => {
  const { results: r } = await sim({
    nodes: [{ id: 'a', type: 'driver', params: DRV }, { id: 'b', type: 'driver', params: DRV }, { id: 'c', type: 'driver', params: DRV }],
    edges: [],
    wiring: { channels: [
      { id: 'c1', label: 'One', volts: 2.83, load: { driver: 'a' } },
      { id: 'c2', label: 'Two', volts: 2.83, outputOhms: 1, load: { series: [{ driver: 'b' }, { driver: 'c' }] } },
    ] },
  })
  assert.deepEqual(Object.keys(r.zinByChannel), ['c1', 'c2'])
  assert.equal(r.zinByChannel.c2.label, 'Two')
  assert.deepEqual(r.zinByChannel.c1.mag, r.zinMag)
  for (let i = 0; i < r.freqs.length; i++) {
    // two identical drivers in series, in free air, each see the same motion:
    // twice the impedance, and the output resistance is not part of the load
    assert.ok(Math.abs(r.zinByChannel.c2.mag[i] / r.zinByChannel.c1.mag[i] - 2) < 1e-6, `${r.freqs[i]} Hz`)
  }
})

// ---------- probes ----------

/** A driver into a tapped chamber whose tap feeds a port. */
const TAPPED = {
  nodes: [
    { id: 'd', type: 'driver', params: DRV },
    { id: 'c', type: 'chamber', params: { volume: 60, length: 40, taps: [{ id: 't1', position: 20 }] } },
    { id: 'w', type: 'waveguide', params: { S1: 80, S2: 80, length: 30 } },
  ],
  edges: [
    { source: 'd', sourceHandle: 'rear', target: 'c', targetHandle: 'in' },
    { source: 'w', sourceHandle: 'throat', target: 'c', targetHandle: 'tap:t1' },
  ],
}

// CONTRACT (probes): "`kind`: `pressure`, `flow`, `velocity`"; "`at`: a
// handle (an end or a tap), or a `position`". Flow through a handle is the
// flow the element's own sense source carries; velocity is that over the
// area. Probes observe and never change the result.
test('probes: flow and velocity at handles and along a line', async () => {
  const plain = (await sim(TAPPED)).results
  const { results: r } = await sim({
    ...TAPPED,
    probes: [
      { id: 'mouthV', kind: 'velocity', at: { node: 'w', handle: 'mouth' } },
      { id: 'midV', kind: 'velocity', at: { node: 'w', position: 15 } },
      { id: 'endV', kind: 'velocity', at: { node: 'w', position: 30 } },
      { id: 'tapQ', kind: 'flow', at: { node: 'c', handle: 'tap:t1' } },
      { id: 'throatQ', kind: 'flow', at: { node: 'w', handle: 'throat' } },
      { id: 'coneQ', kind: 'flow', at: { node: 'd', handle: 'rear' } },
      { id: 'wallQ', kind: 'flow', at: { node: 'c', handle: 'out' } },
      { id: 'tapP', kind: 'pressure', at: { node: 'c', handle: 'tap:t1' } },
      { id: 'posP', kind: 'pressure', at: { node: 'c', position: 20 } },
    ],
  })
  for (let i = 0; i < r.freqs.length; i++) {
    // A flow probe along a line cuts it, which re-slices the lossy line
    // around the cut: a discretisation change far below anything audible.
    assert.ok(Math.abs(r.splCombined[i] - plain.splCombined[i]) < 1e-4, 'probes never change the result')
    // the duct's own velocity readout is the faster of its two ends
    const ends = Math.max(r.probeFlow.mouthV.values[i], r.probeFlow.throatQ.values[i] / 80e-4)
    assert.ok(Math.abs(ends - r.velocity.w[i]) <= 1e-9 * r.velocity.w[i] + 1e-15, `${r.freqs[i]} Hz`)
    assert.equal(r.probeFlow.endV.values[i], r.probeFlow.mouthV.values[i], 'a position at the end is that end')
    assert.ok(Math.abs(r.probeFlow.tapQ.values[i] - r.probeFlow.throatQ.values[i]) <= 1e-9 * Math.max(1, r.probeFlow.tapQ.values[i]) + 1e-12, 'what leaves the tap enters the port')
    assert.equal(r.probeFlow.wallQ.values[i], 0, 'a closed end has no flow')
    // apart from the DC tie's millionth of an ohm-equivalent in between
    assert.ok(Math.abs(r.splInterior.tapP[i] - r.splInterior.posP[i]) < 1e-4, 'the tap handle is the point on the line')
  }
  // at low frequency the port moves at least as much air as the cone near tuning, and at 1 kHz much less
  const u = (k, i) => r.probeFlow[k].values[i]
  const hi = r.freqs.length - 1
  assert.ok(u('coneQ', hi) > u('tapQ', hi))
  assert.ok(r.probeFlow.midV.values.every((v) => v >= 0 && isFinite(v)))
  assert.equal(r.probeFlow.mouthV.kind, 'velocity')
  assert.equal(r.probeFlow.tapQ.kind, 'flow')
})

// CONTRACT (compilePR): "a driver without a motor", with `count` identical
// units. A driver and two passive radiators on a lumped box, against a closed
// form built here: the PR branch is (Rm + jωMm + 1/jωCm)/Spr² + Zrad(Spr), each
// face meeting the wider box face through the box's step mass.
test('passive radiators: impedance and SPL match the closed-form model', async () => {
  const V = 0.05, len = 0.3
  const PR = { Mmd: 120, Cms: 0.3, Rms: 2, Sd: 480, addedMass: 30, count: 2 }
  const { results: r } = await sim({
    nodes: [
      { id: 'd', type: 'driver', params: DRV },
      { id: 'c', type: 'chamber', params: { volume: V * 1000, length: len * 100 } },
      { id: 'p', type: 'pr', params: PR },
    ],
    edges: [
      { source: 'd', sourceHandle: 'rear', target: 'c', targetHandle: 'in' },
      { source: 'c', sourceHandle: 'out', target: 'p', targetHandle: 'rear' },
    ],
    analyses: [{ id: 'a', type: 'ac', fmin: 10, fmax: 500, npts: 150, masking: true }],
    wiring: { channels: [{ id: 'ch', volts: 2.83 }] },
  })
  const Re = 3.6, Le = 1.5e-3, Bl = 15, Mms = 0.15, Cms = 0.19e-3, Rms = 4, Sd = 0.048
  const Spr = 0.048 * 2, Mm = 0.15 * 2, Cm = 0.3e-3 / 2, Rm = 2 * 2
  const Sc = V / len
  const C = V / (RHO * C_AIR * C_AIR)
  const Bt = thermalCoeff(perimeter(Sc, 'rectangular')) * len
  const M1 = (RHO * junctionCorrection(Sc, Sd)) / Sc
  const M2 = (RHO * junctionCorrection(Sc, Spr)) / Sc
  const one = { re: 1, im: 0 }
  r.freqs.forEach((f, i) => {
    const w = 2 * Math.PI * f
    const Zpr = cx.add(cx.div({ re: Rm, im: w * Mm - 1 / (w * Cm) }, { re: Spr * Spr, im: 0 }), radiationImpedance(Spr, 'half', w))
    const Zbranch = cx.add({ re: 0, im: w * M2 }, Zpr)
    const Ybox = cx.add(cx.add({ re: 0, im: w * C }, cx.mul({ re: Bt, im: 0 }, cx.pow(w, 0.5))), cx.div(one, Zbranch))
    const Zrear = cx.add({ re: 0, im: w * M1 }, cx.div(one, Ybox))
    const Zm = cx.add({ re: Rms, im: w * Mms - 1 / (w * Cms) }, cx.mul({ re: Sd * Sd, im: 0 }, cx.add(radiationImpedance(Sd, 'half', w), Zrear)))
    const Zin = cx.add({ re: Re, im: 0 }, cx.add(cx.mul({ re: Le, im: 0 }, cx.pow(w, 0.7)), cx.div({ re: Bl * Bl, im: 0 }, Zm)))
    assert.ok(Math.abs(r.zinMag[i] / cx.abs(Zin) - 1) < 0.005, `${f.toFixed(1)} Hz |Z|: ${r.zinMag[i]} vs ${cx.abs(Zin)}`)
    const U = cx.mul({ re: Sd, im: 0 }, cx.div(cx.mul({ re: Bl, im: 0 }, cx.div({ re: 2.83, im: 0 }, Zin)), Zm))
    const pb = cx.mul({ re: -1, im: 0 }, cx.div(U, Ybox))
    const Upr = cx.div(pb, Zbranch)
    const p = ((w * RHO) / (2 * Math.PI)) * cx.abs(cx.add(U, Upr))
    const want = 20 * Math.log10(p / 20e-6)
    assert.ok(Math.abs(r.splCombined[i] - want) < 0.05, `${f.toFixed(1)} Hz SPL: ${r.splCombined[i]} vs ${want}`)
  })
})

// CONTRACT (compileChamber): leakage "as a resistance to outside split between
// its two ends", R = QL / (2π·f·C_box); stuffing slows sound in the line.
test('chamber: leakage resistance and stuffed sound speed', () => {
  const { project } = resolveProject(migrateProject({
    schemaVersion: 3,
    nodes: [{ id: 'd', type: 'driver', params: DRV }, { id: 'c', type: 'chamber', params: { volume: 40, length: 50, leakQL: 7, leakHz: 30, stuffing: 8 } }],
    edges: [{ source: 'd', sourceHandle: 'rear', target: 'c', targetHandle: 'in' }],
  }))
  const { netlist } = compileProject(project, project.analyses[0])
  const c = C_AIR * 0.845
  const R = 7 / (2 * Math.PI * 30 * (0.04 / (RHO * c * c)))
  const leaks = netlist.split('\n').filter((l) => /leak/.test(l)).map((l) => Number(l.split(' ')[3]))
  assert.equal(leaks.length, 2)
  for (const v of leaks) assert.ok(Math.abs(v / (2 * R) - 1) < 1e-9, `leak ${v} vs ${2 * R}`)
  const tds = netlist.split('\n').filter((l) => /^T\d+ .*Chamber/.test(l) || /^T\d+ /.test(l)).map((l) => Number(l.match(/TD=([\d.e-]+)/)[1]))
  const total = tds.reduce((a, b) => a + b, 0)
  assert.ok(Math.abs(total - 0.5 / c) < 1e-9, `line delay ${total} vs ${0.5 / c}`)
  assert.ok(netlist.includes('stuffing'), 'stuffing adds flow resistance')
})
