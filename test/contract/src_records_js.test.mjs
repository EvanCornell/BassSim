// Contract tests for src/records.js — numbered save states in a project file.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  recordContent, readRecords, saveRecord, addRecord, deleteRecord, selectRecord, readRecord, recordTimes,
  branchPoint, addRun, readRun, deleteRuns, addRecordFrom,
} from '../../src/records.js'

const proj = (v) => ({ name: 'box', modified: 'x', schemaVersion: 3, nodes: [{ id: 'd', type: 'driver', params: { Re: v } }], edges: [] })

// CONTRACT (recordContent): name, save stamp and records are not recorded.
test('recordContent', () => {
  assert.deepEqual(recordContent({ ...proj(1), records: { list: [] } }), { schemaVersion: 3, nodes: proj(1).nodes, edges: [] })
})

// CONTRACT (readRecords): a usable records field, or null.
test('readRecords', () => {
  assert.equal(readRecords(undefined), null)
  assert.equal(readRecords({ list: [] }), null)
  assert.equal(readRecords({ list: ['nothex'], objects: {} }), null)
  const oid = 'a'.repeat(40)
  const r = readRecords({ list: [oid, oid], selected: 9, objects: { [oid]: 'x' } })
  assert.deepEqual({ ...r, ids: undefined }, { list: [oid, oid], ids: undefined, selected: 1, objects: { [oid]: 'x' }, runs: [] })
  assert.equal(new Set(r.ids).size, 2, 'an id per record, made up when the file has none')
  assert.deepEqual(readRecords({ list: [oid], ids: ['r-a'], objects: { [oid]: 'x' } }).ids, ['r-a'])
  // runs whose commit is not in the file are dropped
  assert.deepEqual(readRecords({ list: [oid], objects: { [oid]: 'x' }, runs: [{ id: 'run-1', oid }, { id: 'run-2', oid: 'b'.repeat(40) }] }).runs.map((x) => x.id), ['run-1'])
})

// CONTRACT: records are content-addressed — the same design is stored once;
// a record saved unchanged keeps its commit.
test('saveRecord and addRecord: content-addressed', async () => {
  const r1 = await saveRecord(null, proj(1), 1e12)
  assert.equal(r1.list.length, 1)
  assert.equal(Object.keys(r1.objects).length, 3, 'commit, tree, blob')
  assert.equal(await saveRecord(r1, proj(1), 2e12), r1, 'unchanged: the same records')
  const r2 = await addRecord(r1, proj(1), 1e12)
  assert.deepEqual([r2.list.length, r2.selected], [2, 1])
  assert.notEqual(r2.list[0], r2.list[1])
  assert.equal(Object.keys(r2.objects).length, 4, 'the two records share tree and blob')
  assert.deepEqual(await readRecord(r2, 0), recordContent(proj(1)))
  assert.deepEqual(await recordTimes(r2), [1e12, 1e12 + 1000])
})

// CONTRACT (selectRecord): the selected record is saved with the working
// copy before another is selected; objects no record reaches are dropped.
test('selectRecord saves the working copy first', async () => {
  let r = await addRecord(await saveRecord(null, proj(1), 1e12), proj(1), 1e12)
  const { records, content } = await selectRecord(r, proj(2), 0, 3e12)
  assert.equal(records.selected, 0)
  assert.deepEqual(content, recordContent(proj(1)))
  assert.deepEqual(await readRecord(records, 1), recordContent(proj(2)))
  assert.equal(Object.keys(records.objects).length, 6, 'two commits, two trees, two blobs; the old commit of record 2 is gone')
  await assert.rejects(selectRecord(records, proj(1), 5), /no record 6/)
  r = records
})

// CONTRACT (deleteRecord): selects the one before; never deletes the last.
test('deleteRecord', async () => {
  const r = await addRecord(await addRecord(await saveRecord(null, proj(1)), proj(2)), proj(3))
  assert.equal(r.list.length, 3)
  const d = await deleteRecord({ ...r, selected: 1 })
  assert.deepEqual([d.list.length, d.selected], [2, 0])
  assert.deepEqual(d.list, [r.list[0], r.list[2]])
  const first = await deleteRecord({ ...d, selected: 0 })
  assert.equal(first.selected, 0)
  await assert.rejects(deleteRecord(first), /at least one record/)
  // every remaining object is reachable, and readable
  assert.deepEqual(await readRecord(first, 0), recordContent(proj(3)))
})

// CONTRACT (runs): a run is a branch off the record it was queued from. It
// keeps the project as it was run while the record changes, survives the
// record being saved and deleted, and can be restored as a new record.
test('runs: branch, survive edits, restore as a record, delete', async () => {
  const bp = await branchPoint(null, proj(1), 1e12)
  assert.equal(bp.records.list.length, 1)
  assert.equal(bp.parent, bp.records.list[0])
  assert.equal(bp.recordId, bp.records.ids[0])
  // the record is edited while the run is queued
  let r = await saveRecord(bp.records, proj(2), 2e12)
  r = await addRun(r, { id: 'run-a', parent: bp.parent, recordId: bp.recordId, content: bp.content, data: { result: [1, 2] }, meta: { title: 'Burst' } }, 3e12)
  assert.deepEqual(r.runs.map((x) => [x.id, x.title, x.recordId, x.at]), [['run-a', 'Burst', bp.recordId, 3e12]])
  assert.deepEqual(await readRun(r, r.runs[0].oid), { content: recordContent(proj(1)), data: { result: [1, 2] } })
  // later saves keep everything the run reaches
  r = await saveRecord(r, proj(3), 4e12)
  assert.deepEqual((await readRun(r, r.runs[0].oid)).content, recordContent(proj(1)))
  // restoring adds a record at the end with the run's project, and selects it
  const run = await readRun(r, r.runs[0].oid)
  const restored = await addRecordFrom(r, proj(3), run.content, 5e12)
  assert.deepEqual([restored.list.length, restored.selected, restored.ids.length], [2, 1, 2])
  assert.deepEqual(await readRecord(restored, 1), recordContent(proj(1)))
  assert.deepEqual(await readRecord(restored, 0), recordContent(proj(3)), 'the working copy was saved first')
  assert.equal(restored.runs.length, 1)
  // deleting the run drops the objects only it reached
  const before = Object.keys(restored.objects).length
  const gone = await deleteRuns(restored, ['run-a'])
  assert.equal(gone.runs.length, 0)
  assert.ok(Object.keys(gone.objects).length < before)
  assert.deepEqual(await readRecord(gone, 1), recordContent(proj(1)))
  // a file written and read back keeps its ids and runs
  const back = readRecords(JSON.parse(JSON.stringify(restored)))
  assert.deepEqual(back.ids, restored.ids)
  assert.equal(back.runs[0].id, 'run-a')
})
