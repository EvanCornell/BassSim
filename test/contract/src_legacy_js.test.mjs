// Contract tests for src/legacy.js — data saved under the app's former name.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { migrateStorage, modernPath, stripLegacySuffix } from '../../src/legacy.js'
import { parseWorkspace, entriesToWorkspace } from '../../src/workspace.js'

/** A minimal Storage. */
function storage(init = {}, { failOn } = {}) {
  const m = new Map(Object.entries(init))
  return {
    get length() { return m.size },
    key: (i) => [...m.keys()][i] ?? null,
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { if (failOn === k) throw new Error('quota'); m.set(k, String(v)) },
    removeItem: (k) => { m.delete(k) },
    dump: () => Object.fromEntries(m),
  }
}

// CONTRACT (migrateStorage): every key moves to the new prefix; one already
// there is kept; a write that fails puts the old key back.
test('migrateStorage: keys move to the new prefix', () => {
  const s = storage({ 'acousim:theme': 'dark', 'acousim:layout': '{}', 'speakerspice:layout': '{"kept":1}', other: 'x' })
  assert.equal(migrateStorage(s), 1)
  assert.deepEqual(s.dump(), { 'speakerspice:theme': 'dark', 'speakerspice:layout': '{"kept":1}', other: 'x' })
  assert.equal(migrateStorage(s), 0, 'a second run does nothing')
  const full = storage({ 'acousim:workspace': 'big' }, { failOn: 'speakerspice:workspace' })
  assert.equal(migrateStorage(full), 0)
  assert.deepEqual(full.dump(), { 'acousim:workspace': 'big' })
  assert.equal(migrateStorage(null), 0)
})

// CONTRACT (modernPath): the system folder, what is in it, and project files.
test('modernPath', () => {
  const m = (p) => modernPath(p, '.speakerspice', '.speakerspice')
  assert.equal(m('.acousim'), '.speakerspice')
  assert.equal(m('.acousim/drivers.json'), '.speakerspice/drivers.json')
  assert.equal(m('boxes/a.acousim'), 'boxes/a.speakerspice')
  assert.equal(m('boxes/notes.json'), 'boxes/notes.json')
  assert.equal(m('boxes/a.speakerspice'), 'boxes/a.speakerspice')
})

// CONTRACT (stripLegacySuffix)
test('stripLegacySuffix', () => {
  assert.equal(stripLegacySuffix('box.acousim.json'), 'box')
  assert.equal(stripLegacySuffix('workspace.acousim'), 'workspace')
  assert.equal(stripLegacySuffix('box.json'), 'box.json')
})

// CONTRACT: a stored or downloaded workspace from the former name reads
// under the current names, the current one winning a clash.
test('workspaces saved under the former name read under the current one', () => {
  const raw = {
    schemaVersion: 1, app: 'AcouSim', kind: 'workspace', name: 'w',
    folders: ['.acousim', 'empty'],
    files: {
      'a.acousim': { kind: 'project', data: { name: 'a' } },
      '.acousim/drivers.json': { kind: 'drivers', data: [] },
      'b.acousim': { kind: 'project', data: { name: 'old b' } },
      'b.speakerspice': { kind: 'project', data: { name: 'b' } },
    },
  }
  const r = parseWorkspace(JSON.stringify(raw))
  assert.equal(r.ok, true)
  assert.deepEqual(Object.keys(r.workspace.files).sort(), ['.speakerspice/drivers.json', 'a.speakerspice', 'b.speakerspice'])
  assert.deepEqual(r.workspace.files['b.speakerspice'].data, { name: 'b' })
  assert.deepEqual(r.workspace.folders, ['.speakerspice', 'empty'])
  const enc = (o) => new TextEncoder().encode(JSON.stringify(o))
  const z = entriesToWorkspace([
    { path: '.acousim/workspace.json', data: enc({ schemaVersion: 1, name: 'zipped' }), folder: false },
    { path: 'x.acousim', data: enc({ name: 'x' }), folder: false },
  ], 'fallback')
  assert.equal(z.workspace.name, 'zipped')
  assert.deepEqual(Object.keys(z.workspace.files), ['x.speakerspice'])
  assert.deepEqual(z.renamed, [
    { from: '.acousim/workspace.json', to: '.speakerspice/workspace.json', folder: false },
    { from: 'x.acousim', to: 'x.speakerspice', folder: false },
  ])
})
