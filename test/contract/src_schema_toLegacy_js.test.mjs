// Contract tests for src/schema/toLegacy.js, and the migration's promise that
// old projects keep their results on the legacy engine.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { toLegacy } from '../../src/schema/toLegacy.js'
import { migrateProject } from '../../src/schema/migrate.js'
import { resolveProject } from '../../src/schema/params.js'
import { hydrateProject } from '../../src/engine/project.js'
import { runSimulation } from '../../src/engine/solver.js'
import { simulateProject } from '../../src/engine/pipeline.js'

/** A v2 ported box with a passive radiator, at default losses. */
function v2() {
  return {
    schemaVersion: 2,
    settings: { fmin: 10, fmax: 300, npts: 200, voltage: 4, rg: 0.2, masking: false },
    nodes: [
      { id: 'd', type: 'driver', params: { Fs: 32, Qts: 0.4, Qes: 0.45, Qms: 5, Vas: 60, Re: 3.5, Bl: 16, Mms: 150, Cms: 0.165, Sd: 480, Rms: 6 } },
      { id: 'r', type: 'radiation', params: { space: 'half' } },
      { id: 'c', type: 'chamber', params: { volume: 60, length: 50, Q: 12, probe: true, probePos: 40 } },
      { id: 'w', type: 'waveguide', params: { S1: 100, S2: 100, length: 25, space: 'quarter' } },
      { id: 'p', type: 'pr', params: { Mmd: 120, Cms: 0.3, Rms: 2, Sd: 300 } },
    ],
    edges: [
      { source: 'd', sourceHandle: 'front', target: 'r', targetHandle: 'in' },
      { source: 'd', sourceHandle: 'rear', target: 'c', targetHandle: 'in' },
      { source: 'c', sourceHandle: 'out', target: 'w', targetHandle: 'throat' },
      { source: 'c', sourceHandle: 'out', target: 'p', targetHandle: 'in' },
    ],
  }
}

/**
 * Resolve and convert a project for the legacy engine.
 *
 * @param {object} proj - Any-version project.
 * @returns {object} The legacy form.
 */
const legacyOf = (proj) => toLegacy(resolveProject(migrateProject(proj)).project)

// CONTRACT (migrateProject + toLegacy): an old project at default losses gives
// exactly the results it gave before the format changed.
test('toLegacy: a migrated v2 project simulates identically on the legacy engine', async () => {
  const before = hydrateProject(v2())
  const want = runSimulation(before.nodes, before.edges, before.settings)
  const { results } = await simulateProject(v2(), { engine: 'legacy' })
  assert.deepEqual(results.freqs, want.freqs)
  for (const k of ['splCombined', 'zinMag', 'excursion']) {
    for (let i = 0; i < want.freqs.length; i++) {
      assert.ok(Math.abs(results[k][i] - want[k][i]) <= 1e-9 * Math.max(1, Math.abs(want[k][i])), `${k}[${i}]: ${results[k][i]} vs ${want[k][i]}`)
    }
  }
  assert.deepEqual(Object.keys(results.splInterior), ['c'], 'the chamber probe survives the round trip')
})

// CONTRACT: "`{source, sourceHandle, target, targetHandle}`" — an edge stored
// in either order comes out output-to-input, and a passive radiator's `rear` is
// the legacy `in`.
test('toLegacy: edges are oriented output to input', () => {
  const p = v2()
  p.edges[2] = { source: 'w', sourceHandle: 'throat', target: 'c', targetHandle: 'out' }
  const l = legacyOf(p)
  const e = l.edges.find((x) => x.target === 'w')
  assert.deepEqual([e.source, e.sourceHandle, e.target, e.targetHandle], ['c', 'out', 'w', 'throat'])
  assert.ok(l.edges.some((x) => x.target === 'p' && x.targetHandle === 'in'))
})

// CONTRACT: the drive is the channel's volts at the master level.
test('toLegacy: drive voltage includes the master level', () => {
  const p = migrateProject(v2())
  p.wiring.masterDb = 6
  const l = toLegacy(resolveProject(p).project)
  assert.ok(Math.abs(l.settings.voltage - 4 * Math.pow(10, 6 / 20)) < 1e-12)
  assert.equal(l.settings.rg, 0.2)
})

// CONTRACT: "Anything a v3 project can say that it cannot is refused here with a
// message pointing at the SPICE engine."
test('toLegacy: refuses what the legacy engine cannot represent', () => {
  /**
   * Assert a modified project is refused with a matching reason.
   *
   * @param {Function} edit - Mutates the migrated project.
   * @param {RegExp} why - Expected reason.
   */
  const refuses = (edit, why) => {
    const p = migrateProject(v2())
    edit(p)
    assert.throws(() => toLegacy(resolveProject(p).project), (err) => {
      assert.ok(err.projectErrors.some((m) => why.test(m) && /SPICE engine/.test(m)), err.projectErrors.join('\n'))
      return true
    })
  }
  refuses((p) => { p.edges.push({ id: 'x', source: 'w', sourceHandle: 'mouth', target: 'w', targetHandle: 'mouth' }) }, /not an output-to-input connection/)
  refuses((p) => { p.nodes[2].params.taps = [{ id: 't', position: 10 }]; p.edges.push({ id: 'x', source: 'd', sourceHandle: 'front', target: 'c', targetHandle: 'tap:t' }) }, /tap is connected/)
  refuses((p) => { p.edges.push({ id: 'x', source: 'p', sourceHandle: 'front', target: 'r', targetHandle: 'in' }) }, /front face connected/)
  refuses((p) => { p.wiring.channels[0].load = { series: [{ driver: 'd' }] } }, /in series/)
  refuses((p) => { p.wiring.channels[0].dsp.filters.push({ type: 'highpass', hz: 20 }) }, /uses DSP/)
  refuses((p) => { p.wiring.channels[0].load = { parallel: [] } }, /not wired to any channel/)
  refuses((p) => { p.probes.push({ id: 'x', kind: 'velocity', at: { node: 'w', handle: 'throat' } }) }, /not a single pressure probe/)
})
