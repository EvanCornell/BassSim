// Contract tests for src/spice/run.js: the runner hooks and the transient
// time axis.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { setRunner, setThreads, threadCount, runNetlist, runTransient, runLocal, isFatal } from '../../src/spice/run.js'
import { isPoolMessage } from '../../src/engine/remote.js'

// CONTRACT (setRunner): "Send every run through another runner, or back to
// this process's engine."
test('setRunner routes runs elsewhere, and null restores the engine', async () => {
  const seen = []
  setRunner(async (netlist, kind) => {
    seen.push(kind)
    return { scale: [1, 2], vectors: new Map([['v(1)', { re: Float64Array.of(3, 4), im: Float64Array.of(0, 0) }]]) }
  })
  try {
    const r = await runNetlist('anything')
    assert.deepEqual(seen, ['complex'])
    assert.deepEqual(Array.from(r.vec('v(1)').re), [3, 4])
  } finally { setRunner(null) }
  const real = await runNetlist('rc\nV1 1 0 DC 0 AC 1\nR1 1 0 1\n.ac lin 10 1 10\n.end')
  assert.equal(real.freqs.length, 10)
  assert.ok(Math.abs(real.freqs[9] - 10) < 1e-9)
})

// CONTRACT (setThreads / threadCount): "at least 1".
test('threadCount follows setThreads, at least 1', () => {
  setThreads(8)
  assert.equal(threadCount(), 8)
  setThreads(0)
  assert.equal(threadCount(), 1)
  setThreads(undefined)
  assert.equal(threadCount(), 1)
})

// CONTRACT (runTransient): "A run started from rest (`.tran … uic`) gets its
// zero sample at t = 0 put back".
test('runTransient: a run from rest starts its time axis at zero', async () => {
  const net = 'rc\nB1 1 0 V=sin(2*3.14159265*50*time)\nR1 1 2 1k\nC1 2 0 1u\n.options interp klu\n.tran 1m 20m 0 1m uic\n.end'
  const r = await runTransient(net)
  assert.equal(r.time[0], 0)
  assert.equal(r.time.length, 21)
  assert.equal(r.vec('v(2)')[0], 0)
  assert.equal(r.vec('v(2)').length, 21)
  const raw = await runLocal(net, 'real')
  assert.ok(raw.scale[0] > 0, 'ngspice itself reports no t = 0 sample')
})

// CONTRACT (isFatal): errors and stalls, not notes.
test('isFatal: stalls and errors are fatal, notes are not', () => {
  assert.ok(isFatal('doAnalyses: TRAN:  Timestep too small; time = 0.1'))
  assert.ok(!isFatal('Note: Starting dynamic gmin stepping'))
})

// CONTRACT (isPoolMessage): the pool's own traffic, not jobs.
test('isPoolMessage tells pool traffic from jobs', () => {
  assert.ok(isPoolMessage({ type: 'spice-reply' }))
  assert.ok(isPoolMessage({ type: 'threads', n: 4 }))
  assert.ok(!isPoolMessage({ id: 1, project: {} }))
  assert.ok(!isPoolMessage(null))
})
