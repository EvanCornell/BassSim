// Contract tests for src/schema/migrate.js — carrying saved projects forward.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { migrateProject, __internals } from '../../src/schema/migrate.js'
import { SCHEMA_VERSION, DEFAULT_PARAMS, DEFAULT_ANALYSIS } from '../../src/schema/version.js'

const { prFs } = __internals

/** A v2 project exercising every conversion rule. */
function v2() {
  return {
    schemaVersion: 2,
    name: 'old',
    settings: {
      fmin: 15, fmax: 500, npts: 300, voltage: 8, impedance: 2, power: 32, rg: 0.1,
      vThreshold: 20, masking: true, unwrapPhase: false, delayOffset: 1.5, nlEnabled: true,
      yScales: { spl: { mode: 'fit' } },
    },
    nodes: [
      { id: 'd', type: 'driver', position: { x: 0, y: 0 }, params: { Fs: 40, Mms: 100, Rms: 2, Q: 10, lossless: false } },
      { id: 'd2', type: 'driver', position: { x: 0, y: 0 }, params: { Rms: 2, Q: 10 } },
      { id: 'c', type: 'chamber', position: { x: 0, y: 0 }, params: { volume: 30, length: 40, Q: 7, probe: true, probePos: 25 } },
      { id: 'c2', type: 'chamber', position: { x: 0, y: 0 }, params: { lossless: true } },
      { id: 'w', type: 'waveguide', position: { x: 0, y: 0 }, params: { S1: 80, S2: 80, length: 30, space: 'quarter', Q: 7, ecFactor: 1.5 } },
      { id: 'w2', type: 'waveguide', position: { x: 0, y: 0 }, params: { lossless: true } },
      { id: 'p', type: 'pr', position: { x: 0, y: 0 }, params: { Mmd: 100, Cms: 0.3, Rms: 2, space: 'quarter' } },
    ],
    edges: [
      { id: 'e1', source: 'd', sourceHandle: 'rear', target: 'c', targetHandle: 'in' },
      { id: 'e2', source: 'c', sourceHandle: 'out', target: 'p', targetHandle: 'in' },
    ],
  }
}

// CONTRACT: "A complete project at `SCHEMA_VERSION`."
test('migrateProject: every section is present at the current version', () => {
  const p = migrateProject(v2())
  assert.equal(p.schemaVersion, SCHEMA_VERSION)
  for (const k of ['air', 'params', 'nodes', 'edges', 'wiring', 'analyses', 'probes', 'components', 'display']) {
    assert.ok(k in p, `missing ${k}`)
  }
  assert.equal('settings' in p, false, 'settings is split, not kept')
})

// CONTRACT: "sweep range, `masking` → one analysis; `voltage` and
// `rg` → one channel; the rest → `display`."
test('migrateProject: settings split into analysis, channel and display', () => {
  const p = migrateProject(v2())
  assert.deepEqual(p.analyses, [{ ...DEFAULT_ANALYSIS, fmin: 15, fmax: 500, npts: 300, masking: true }])
  assert.equal(p.wiring.masterDb, 0)
  assert.equal(p.wiring.channels.length, 1)
  assert.equal(p.wiring.channels[0].volts, 8)
  assert.equal(p.wiring.channels[0].outputOhms, 0.1)
  assert.equal(p.wiring.channels[0].load, null, 'every driver in parallel')
  assert.equal(p.display.vThreshold, 20)
  assert.equal(p.display.unwrapPhase, false)
  assert.equal(p.display.delayOffset, 1.5)
  assert.equal(p.display.nominalOhms, 2)
  assert.deepEqual(p.display.yScales, { spl: { mode: 'fit' } })
})

// CONTRACT: "waveguide `space` → `mouthSpace`; `Q` → `loss: 1` ...; `lossless` → `loss: 0`."
test('migrateProject: waveguide space moves to the mouth and Q becomes loss', () => {
  const p = migrateProject(v2())
  const w = p.nodes.find((n) => n.id === 'w').params
  assert.equal(w.mouthSpace, 'quarter')
  assert.equal(w.throatSpace, 'half')
  assert.equal(w.loss, 1)
  assert.equal(w.ecFactor, 1.5, 'a v2 ecFactor is already a multiplier')
  for (const gone of ['space', 'Q', 'lossless']) assert.equal(gone in w, false, `${gone} must be removed`)
  assert.equal(p.nodes.find((n) => n.id === 'w2').params.loss, 0)
})

// CONTRACT: "chamber `Q` → `leakQL` with the same number ...; `lossless` →
// sealed. `probe`/`probePos` become a pressure probe in `probes`."
test('migrateProject: chamber Q becomes leakage and its probe moves to probes', () => {
  const p = migrateProject(v2())
  const c = p.nodes.find((n) => n.id === 'c').params
  assert.equal(c.leakQL, 7)
  assert.equal(p.nodes.find((n) => n.id === 'c2').params.leakQL, null)
  for (const gone of ['Q', 'lossless', 'probe', 'probePos']) assert.equal(gone in c, false, `${gone} must be removed`)
  assert.deepEqual(p.probes, [{ id: 'probe_c', kind: 'pressure', at: { node: 'c', position: 10 } }])
})

// CONTRACT: "v2 defaulted chambers to lossy, Q 50."
test('migrateProject: a chamber that never set Q gets the old default as QL', () => {
  const p = migrateProject({ schemaVersion: 2, nodes: [{ id: 'c', type: 'chamber', params: {} }] })
  assert.equal(p.nodes[0].params.leakQL, 50)
})

// CONTRACT: "any extra `Q` folds into `Rms` — Rms + 2π·Fs·Mms/Q — so the
// mechanical damping is unchanged." Drivers defaulted to lossless.
test('migrateProject: an explicitly lossy driver folds its Q into Rms', () => {
  const p = migrateProject(v2())
  const d = p.nodes.find((n) => n.id === 'd').params
  assert.ok(Math.abs(d.Rms - (2 + (2 * Math.PI * 40 * 0.1) / 10)) < 1e-12)
  assert.equal(p.nodes.find((n) => n.id === 'd2').params.Rms, 2, 'a driver that never said lossless: false was lossless')
})

// CONTRACT: "A passive radiator's `in` handle becomes `rear`; its front is left
// open, as before." And its default Q of 50 folds into Rms.
test('migrateProject: a passive radiator mounts by its rear and keeps its damping', () => {
  const p = migrateProject(v2())
  const e = p.edges.find((x) => x.id === 'e2')
  assert.equal(e.targetHandle, 'rear')
  const pr = p.nodes.find((n) => n.id === 'p').params
  const Mm = 0.1
  assert.ok(Math.abs(pr.Rms - (2 + (2 * Math.PI * prFs({ Mmd: 100, Cms: 0.3 }) * Mm) / 50)) < 1e-12)
  assert.equal('space' in pr, false)
  assert.equal(pr.count, 1)
})

// CONTRACT (v2 → ecFactor): a v1 coefficient is divided by the old default 0.732.
test('migrateProject: a v1 ecFactor is rescaled to a multiplier', () => {
  const p = migrateProject({ schemaVersion: 1, nodes: [{ id: 'w', type: 'waveguide', params: { ecFactor: 1.464 } }] })
  assert.ok(Math.abs(p.nodes[0].params.ecFactor - 2) < 1e-12)
})

// CONTRACT: "Idempotent: migrating a migrated project changes nothing."
test('migrateProject: idempotent', () => {
  const once = migrateProject(v2())
  assert.deepEqual(migrateProject(once), once)
})

// CONTRACT: "@post proj is not modified"
test('migrateProject: the input is not modified', () => {
  const input = v2()
  const before = JSON.stringify(input)
  migrateProject(input)
  assert.equal(JSON.stringify(input), before)
})

// CONTRACT (normalize): "Node params are merged over `DEFAULT_PARAMS` ... Edges
// without an id get one that no other edge uses."
test('migrateProject: a sparse v3 file is filled from the defaults', () => {
  const p = migrateProject({
    schemaVersion: 3,
    nodes: [{ id: 'w', type: 'waveguide', params: { length: 12 } }],
    edges: [{ id: 'e_0', source: 'w', sourceHandle: 'throat', target: 'w', targetHandle: 'mouth' },
      { source: 'w', sourceHandle: 'mouth', target: 'w', targetHandle: 'throat' }],
  })
  assert.deepEqual(p.nodes[0].params, { ...DEFAULT_PARAMS.waveguide, length: 12 })
  assert.equal(p.edges[1].id, 'e_1')
  assert.deepEqual(p.analyses, [DEFAULT_ANALYSIS])
  assert.equal(p.wiring.channels[0].volts, 2.83)
})

// CONTRACT (normalize): default arrays are copies, never shared between nodes.
test('migrateProject: default tap lists are not shared between nodes', () => {
  const p = migrateProject({ schemaVersion: 3, nodes: [{ id: 'a', type: 'chamber' }, { id: 'b', type: 'chamber' }] })
  p.nodes[0].params.taps.push({ id: 't', position: 1 })
  assert.equal(p.nodes[1].params.taps.length, 0)
  assert.equal(DEFAULT_PARAMS.chamber.taps.length, 0)
})
