// Contract tests for src/schema/editor.js — file ↔ editor state.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { toEditor, fromEditor } from '../../src/schema/editor.js'
import { migrateProject } from '../../src/schema/migrate.js'

/** A v3 project using sections the editor has no controls for. */
function rich() {
  return migrateProject({
    schemaVersion: 3,
    name: 'rich',
    params: [{ name: 'Vb', value: 60 }],
    nodes: [
      { id: 'd', type: 'driver', position: { x: 1, y: 2 }, params: {} },
      { id: 'c', type: 'chamber', position: { x: 3, y: 4 }, params: { volume: 'Vb', length: 50 } },
    ],
    edges: [{ id: 'e', source: 'd', sourceHandle: 'rear', target: 'c', targetHandle: 'in' }],
    wiring: { masterDb: -6, channels: [{ id: 'a', volts: 20 }, { id: 'b', volts: 5, load: { driver: 'd' } }] },
    analyses: [{ id: 's', type: 'ac', fmin: 12, fmax: 400, npts: 256 }, { id: 't', type: 'transient', duration: 0.5 }],
    probes: [
      { id: 'probe_c', kind: 'pressure', at: { node: 'c', position: 25 } },
      { id: 'v', kind: 'velocity', at: { node: 'c', handle: 'in' } },
    ],
    components: [{ id: 'k', name: 'thing', nodes: [], edges: [] }],
    display: { vThreshold: 22, future: 'kept' },
  })
}

// CONTRACT: "`settings.voltage` is the first channel's output at the current
// master level — the drive the user actually sees."
test('toEditor: the drive shown is the first channel at the master level', () => {
  const ed = toEditor(rich())
  assert.ok(Math.abs(ed.settings.voltage - 20 * Math.pow(10, -6 / 20)) < 1e-12)
  assert.equal(ed.settings.fmin, 12)
  assert.equal(ed.settings.vThreshold, 22)
})

// CONTRACT: "A chamber's first pressure probe becomes its `probe`/`probePos`
// params; any other probe stays in `extras`."
test('toEditor: a chamber probe moves onto the chamber', () => {
  const ed = toEditor(rich())
  const c = ed.nodes.find((n) => n.id === 'c').data.params
  assert.equal(c.probe, true)
  assert.equal(c.probePos, 50)
  assert.deepEqual(ed.extras.probes.map((p) => p.id), ['v'])
  assert.equal(ed.nodes.find((n) => n.id === 'c').data.params.volume, 'Vb', 'expressions are kept, not resolved')
})

// CONTRACT: "a project round-trips through the editor without loss."
test('fromEditor: a project round-trips', () => {
  const orig = rich()
  const back = fromEditor(toEditor(orig))
  const strip = (p) => ({ ...p, modified: undefined })
  assert.deepEqual(strip(back), strip(orig))
})

// CONTRACT: "the flat settings land back in the first analysis, the first
// channel and the display section" — edits made in the editor reach the file.
test('fromEditor: editor edits land in the right sections', () => {
  const ed = toEditor(rich())
  ed.settings.voltage = 10
  ed.settings.npts = 999
  ed.settings.rg = 0.5
  ed.nodes.find((n) => n.id === 'c').data.params.probe = false
  const p = fromEditor(ed)
  assert.ok(Math.abs(p.wiring.channels[0].volts - 10 / Math.pow(10, -6 / 20)) < 1e-12, 'stored at master 0 dB')
  assert.equal(p.wiring.channels[0].outputOhms, 0.5)
  assert.equal(p.wiring.channels[1].volts, 5, 'other channels untouched')
  assert.equal(p.analyses[0].npts, 999)
  assert.equal(p.analyses[1].type, 'transient', 'other analyses untouched')
  assert.deepEqual(p.probes.map((x) => x.id), ['v'])
  assert.equal('probe' in p.nodes.find((n) => n.id === 'c').params, false, 'probe params never reach the file')
})
