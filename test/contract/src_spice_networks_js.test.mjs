// Contract tests for src/spice/networks.js — fitted networks, checked by
// running the generated netlist through ngspice against the exact formula.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  halfSpaceRadiationFit, radiationScale, radiationLoad, fractionalSeries, fitBand,
} from '../../src/spice/networks.js'
import { fitZ, logspace } from '../../src/spice/fit.js'
import { createNetlist, DC_TIE } from '../../src/spice/netlist.js'
import { runNetlist } from '../../src/spice/run.js'
import { RHO, C_AIR } from '../../src/engine/geometry.js'
import { pistonImpedance } from '../../src/spice/physics.js'

/**
 * Impedance of a one-port network between `in` and ground, as SPICE sees it.
 *
 * @param {Function} build - Adds the network to the builder, from node `in`.
 * @param {number} f1 - Lowest frequency, Hz.
 * @param {number} f2 - Highest frequency, Hz.
 * @returns {Promise<Array<{f: number, re: number, im: number}>>} Z at each sweep point.
 */
async function measure(build, f1, f2) {
  const nl = createNetlist('one-port')
  // The DC tie keeps an inductive network across the ideal source from being
  // a zero-resistance loop, exactly as the compiler's sense sources do.
  nl.lines.push('V1 src 0 DC 0 AC 1', `Rtie src in ${DC_TIE}`)
  build(nl)
  nl.lines.push('.save i(v1)', `.ac dec 20 ${f1} ${f2}`, '.end')
  const raw = await runNetlist(nl.text())
  const I = raw.vec('i(v1)')
  return raw.freqs.map((f, i) => {
    // Z = 1 / (−I): SPICE reports the source current flowing into its + pin.
    const ir = -I.re[i]
    const ii = -I.im[i]
    const d = ir * ir + ii * ii
    return { f, re: ir / d, im: -ii / d }
  })
}

// CONTRACT: "fitted over 0.003 ≤ ka ≤ 12 with both parts weighted by their own
// size" — within 0.5% in |Z| and in resistance up to ka = 3.
test('halfSpaceRadiationFit: within 0.5% of the flanged piston up to ka = 3', () => {
  const fit = halfSpaceRadiationFit()
  const z0 = (RHO * C_AIR) / Math.PI
  for (const q of logspace(0.005, 3, 300)) {
    const exact = pistonImpedance(Math.PI, q * C_AIR)
    const z = fitZ(fit, q)
    const ez = Math.hypot(z.re * z0 - exact.re, z.im * z0 - exact.im) / Math.hypot(exact.re, exact.im)
    const er = Math.abs((z.re * z0) / exact.re - 1)
    assert.ok(ez < 0.005, `ka=${q.toFixed(3)} |Z| off ${(ez * 100).toFixed(3)}%`)
    assert.ok(er < 0.005, `ka=${q.toFixed(3)} R off ${(er * 100).toFixed(3)}%`)
  }
})

// CONTRACT: "`Z_Ω(S) = n·Z_half(n·S)` ... At low ka that multiplies the
// radiation resistance by n and the mass by √n; at high ka every case tends to
// ρc/S."
test('radiationScale: the image-source model scales resistance by n and mass by √n', () => {
  const S = 0.01
  const fit = halfSpaceRadiationFit()
  /**
   * The fitted impedance for a solid angle at ω.
   *
   * @param {string} space - Solid angle name.
   * @param {number} w - ω, rad/s.
   * @returns {{re: number, im: number}} Z, Pa·s/m³.
   */
  const Z = (space, w) => {
    const { zScale, omegaScale } = radiationScale(S, space)
    const z = fitZ(fit, w / omegaScale)
    return { re: z.re * zScale, im: z.im * zScale }
  }
  const w = 2 * Math.PI * 5
  for (const [space, n] of [['free', 0.5], ['quarter', 2], ['eighth', 4]]) {
    const r = Z(space, w).re / Z('half', w).re
    const x = Z(space, w).im / Z('half', w).im
    assert.ok(Math.abs(r / n - 1) < 0.01, `${space}: R ratio ${r}`)
    assert.ok(Math.abs(x / Math.sqrt(n) - 1) < 0.01, `${space}: X ratio ${x}`)
    // ka = 8 for the image piston, inside the fitted range.
    const { omegaScale } = radiationScale(S, space)
    const hi = Z(space, 8 * omegaScale)
    assert.ok(Math.abs(hi.re / ((RHO * C_AIR) / S) - 1) < 0.1, `${space} at high ka: ${hi.re}`)
  }
})

// CONTRACT: "Add a radiation load from a node to the reference." — the netlist
// SPICE actually solves reproduces the image-source impedance.
test('radiationLoad: ngspice sees the intended radiation impedance', async () => {
  const S = 0.008
  for (const space of ['half', 'quarter']) {
    const n = space === 'quarter' ? 2 : 1
    const rows = await measure((nl) => radiationLoad(nl, 'in', S, space), 5, 2000)
    for (const { f, re, im } of rows) {
      const exact = pistonImpedance(n * S, 2 * Math.PI * f)
      const want = { re: n * exact.re, im: n * exact.im }
      const e = Math.hypot(re - want.re, im - want.im) / Math.hypot(want.re, want.im)
      assert.ok(e < 0.005, `${space} ${f.toFixed(1)} Hz: off ${(e * 100).toFixed(3)}%`)
    }
  }
})

// CONTRACT: "`rigid` adds nothing — a closed end. `anechoic` is the resistance ρc/S."
test('radiationLoad: rigid is open circuit, anechoic is ρc/S', () => {
  const nl = createNetlist('t')
  assert.equal(radiationLoad(nl, 'in', 0.01, 'rigid'), null)
  assert.equal(nl.lines.length, 1)
  radiationLoad(nl, 'in', 0.01, 'anechoic')
  const [name, a, b, v] = nl.lines[1].split(' ')
  assert.deepEqual([name, a, b], ['R1', 'in', '0'])
  assert.ok(Math.abs(Number(v) / ((RHO * C_AIR) / 0.01) - 1) < 1e-9)
})

// CONTRACT: "Add a series impedance `coeff·(jω)^α` between two nodes." — as
// SPICE solves it, within 0.5% across the band.
test('fractionalSeries: ngspice sees coeff·(jω)^α across the band', async () => {
  const band = fitBand(10, 1000)
  for (const alpha of [0.5, 0.75]) {
    const coeff = 3.7
    const rows = await measure((nl) => fractionalSeries(nl, 'in', '0', alpha, coeff, band, 'x', 3), 10, 1000)
    for (const { f, re, im } of rows) {
      const w = 2 * Math.PI * f
      const m = coeff * Math.pow(w, alpha)
      const want = { re: m * Math.cos((alpha * Math.PI) / 2), im: m * Math.sin((alpha * Math.PI) / 2) }
      const e = Math.hypot(re - want.re, im - want.im) / m
      assert.ok(e < 0.005, `α=${alpha} ${f.toFixed(1)} Hz: off ${(e * 100).toFixed(3)}%`)
    }
  }
})

// CONTRACT: "Half an octave-and-a-bit beyond the sweep on each side, never below 0.5 Hz."
test('fitBand: widens the sweep and never goes below 0.5 Hz', () => {
  assert.deepEqual(fitBand(10, 1000), { f1: 5, f2: 2000 })
  assert.equal(fitBand(0.5, 100).f1, 0.5)
})
