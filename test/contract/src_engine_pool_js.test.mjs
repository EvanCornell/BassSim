// Contract tests for src/engine/pool.js, with stand-in workers.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createPool, poolSize, RESERVE } from '../../src/engine/pool.js'

/**
 * A stand-in engine worker that records what it is sent and replies when told.
 */
class FakeWorker {
  constructor() { this.sent = []; this.terminated = false; this.onmessage = null; this.onerror = null }
  postMessage(m) { this.sent.push(m) }
  terminate() { this.terminated = true }
  /** The run it is on, if any. */
  get current() { return [...this.sent].reverse().find((m) => m.tid != null) }
  /** Finish its current run with a result carrying the run's netlist. */
  finish(scale = [1], extra = {}) {
    const t = this.current
    this.onmessage({ data: { tid: t.tid, ok: true, scale, vectors: new Map([['x', Float64Array.from(scale)]]), ...extra } })
  }
  warmed() { this.onmessage({ data: { warm: true } }) }
}

/**
 * A pool of stand-ins, and the list of workers it spawned.
 *
 * @param {number} size - Threads.
 * @returns {{pool: object, workers: FakeWorker[]}} Both.
 */
function fake(size) {
  const workers = []
  const pool = createPool({ size, spawn: () => { const w = new FakeWorker(); workers.push(w); return w } })
  return { pool, workers }
}

/** Let settled promises run their continuations. */
const tick = () => new Promise((r) => setTimeout(r, 0))

/** Workers that have not been terminated. */
const alive = (ws) => ws.filter((w) => !w.terminated)

// CONTRACT (poolSize): "one per processor thread"; 4 when unknown.
test('poolSize: the processor thread count', () => {
  assert.equal(poolSize({ hardwareConcurrency: 12 }), 12)
  assert.equal(poolSize({}), 4)
  assert.equal(poolSize(undefined), 4)
})

// CONTRACT (createPool): "runs independent netlists side by side, one per
// free worker"; time-domain work "at most this many at once".
test('time-domain runs go side by side, up to the thread count', async () => {
  const { pool, workers } = fake(3)
  const runs = [1, 2, 3, 4, 5].map((i) => pool.run(`t${i}\n.tran 1 1\n.end`, 'real', 'td'))
  await tick()
  const busy = () => workers.filter((w) => w.current && !w.done)
  assert.equal(workers.length, 3)
  assert.equal(pool.stats().queued, 2)
  // finishing one hands the next run to that worker
  const first = workers[0]
  first.finish([10])
  await tick()
  assert.equal(pool.stats().queued, 1)
  assert.match(first.current.netlist, /^t4/)
  for (const w of workers) w.finish([20])
  await tick()
  workers[0].finish([30])
  const out = await Promise.all(runs)
  assert.deepEqual(out[0].scale, [10])
  assert.equal(out.length, 5)
  assert.equal(busy().length, 3) // every worker was used
})

// CONTRACT (createPool): "puts the live sweep ahead of time-domain work, and
// keeps one worker beyond the thread count for it".
test('the live sweep jumps the queue and has a reserve worker', async () => {
  const { pool, workers } = fake(2)
  pool.run('a\n.tran 1 1\n.end', 'real', 'td')
  pool.run('b\n.tran 1 1\n.end', 'real', 'td')
  pool.run('c\n.tran 1 1\n.end', 'real', 'td')
  await tick()
  assert.equal(workers.length, 2)
  const live = pool.run('live\n.ac lin 4 1 10\n.end', 'complex', 'live')
  await tick()
  assert.equal(workers.length, 2 + RESERVE)
  assert.match(workers[2].current.netlist, /^live/)
  workers[2].finish([1, 2, 3, 4])
  assert.deepEqual((await live).scale, [1, 2, 3, 4])
  // the reserve takes no time-domain work while two are running
  await tick()
  assert.equal(workers[2].sent.filter((m) => m.tid != null).length, 1)
  assert.equal(pool.stats().queued, 1)
})

// CONTRACT (createPool): "splits a frequency sweep across the free workers …
// and joins the pieces".
test('a sweep is split across the free threads and joined in order', async () => {
  const { pool, workers } = fake(4)
  const r = pool.run('s\n.ac lin 200 1 200\n.end', 'complex', 'td')
  await tick()
  const pieces = workers.filter((w) => w.current)
  assert.equal(pieces.length, 4)
  const lines = pieces.map((w) => /\.ac lin (\d+) (\S+) (\S+)/.exec(w.current.netlist))
  assert.equal(lines.reduce((a, m) => a + Number(m[1]), 0), 200)
  // reply out of order; the result is still in sweep order
  for (const w of [...pieces].reverse()) {
    const m = /\.ac lin (\d+) (\S+) (\S+)/.exec(w.current.netlist)
    const n = Number(m[1])
    const f0 = Number(m[2])
    const scale = Array.from({ length: n }, (_, i) => f0 + i)
    w.onmessage({ data: { tid: w.current.tid, ok: true, scale, vectors: new Map([['i(v1)', { re: Float64Array.from(scale), im: new Float64Array(n) }]]) } })
  }
  const out = await r
  assert.equal(out.scale.length, 200)
  out.scale.forEach((f, i) => assert.equal(f, i + 1))
  assert.equal(out.vectors.get('i(v1)').re[150], 151)
})

// CONTRACT (createPool): the live sweep "never waits on an engine loading" —
// it splits only across warm, free workers.
test('the live sweep splits only across warm workers', async () => {
  const { pool, workers } = fake(4)
  const first = pool.run('s\n.ac lin 200 1 200\n.end', 'complex', 'live')
  await tick()
  assert.equal(workers.filter((w) => w.current).length, 1, 'nothing warm yet: one piece')
  for (const w of workers) if (!w.current) w.warmed()
  workers.find((w) => w.current).finish(Array.from({ length: 200 }, (_, i) => i))
  await first
  pool.run('s\n.ac lin 200 1 200\n.end', 'complex', 'live')
  await tick()
  assert.equal(workers.filter((w) => w.sent.filter((m) => m.tid != null).length && w.current.tid > 1).length, 4)
})

// CONTRACT (warm): "Start and warm workers up to a count".
test('warm starts workers up to the thread count', () => {
  const { pool, workers } = fake(3)
  pool.warm(10)
  assert.equal(workers.length, 3)
  assert.ok(workers.every((w) => w.sent[0].warm))
  pool.warm()
  assert.equal(workers.length, 3)
})

// CONTRACT (cancel): "queued ones are dropped, running ones' workers
// terminated"; the other lane carries on.
test('cancel stops one lane and leaves the other', async () => {
  const { pool, workers } = fake(2)
  const td = [pool.run('a\n.tran 1 1\n.end', 'real', 'td'), pool.run('b\n.tran 1 1\n.end', 'real', 'td'), pool.run('c\n.tran 1 1\n.end', 'real', 'td')]
  const live = pool.run('l\n.tran 1 1\n.end', 'real', 'live')
  await tick()
  pool.cancel('td')
  for (const p of td) await assert.rejects(p, { name: 'Cancelled' })
  assert.equal(workers.filter((w) => w.terminated).length, 2)
  const reserve = alive(workers)[0]
  reserve.finish([7])
  assert.deepEqual((await live).scale, [7])
  assert.equal(pool.stats().queued, 0)
  // the next time-domain run starts a fresh worker
  const again = pool.run('d\n.tran 1 1\n.end', 'real', 'td')
  await tick()
  const w = alive(workers).find((x) => x.current?.netlist.startsWith('d'))
  w.finish([1])
  assert.deepEqual((await again).scale, [1])
})

// CONTRACT (createPool): a SPICE failure rejects with its message and lines;
// a worker that dies fails its run and is replaced.
test('failures reject; a crashed worker is replaced', async () => {
  const { pool, workers } = fake(1)
  const bad = pool.run('x\n.tran 1 1\n.end', 'real', 'td')
  await tick()
  workers[0].onmessage({ data: { tid: workers[0].current.tid, ok: false, error: 'SPICE could not solve this circuit: singular', spiceErrors: ['singular'] } })
  await assert.rejects(bad, (err) => /singular/.test(err.message) && err.spiceErrors[0] === 'singular')
  const dies = pool.run('y\n.tran 1 1\n.end', 'real', 'td')
  const next = pool.run('z\n.tran 1 1\n.end', 'real', 'td')
  await tick()
  workers[0].onerror(new Event('error'))
  await assert.rejects(dies, /stopped unexpectedly/)
  await tick()
  assert.equal(workers.length, 2)
  assert.ok(workers[0].terminated)
  workers[1].finish([5])
  assert.deepEqual((await next).scale, [5])
})
