// The simulation thread pool: one ngspice engine per processor thread.
//
// ngspice solves one circuit at a time on one thread, so the way to use a
// machine's cores is to run many circuits at once. The pool keeps a set of
// engine workers (`spiceWorker.js`) as large as the machine has threads,
// and the workers that coordinate a job — the live sweep's, the time-domain
// analyses' — send it netlists rather than running them. It then:
//
// - runs independent netlists side by side, one per free worker;
// - splits a frequency sweep across the free workers, since every frequency
//   is solved on its own (see `spice/split.js`), and joins the pieces;
// - puts the live sweep ahead of time-domain work, and keeps one worker
//   beyond the thread count for it, so a long distortion run never holds
//   up the frequency response;
// - stops a lane's runs on cancel, terminating the workers they are on.
//
// Workers are started and warmed (their engine loaded) ahead of need, since
// loading takes most of a second.

import { splitAc, mergeAc } from '../spice/split.js'

/** Lanes, in priority order: the live sweep first, then time-domain work. */
export const LANES = ['live', 'td']

/** Workers kept beyond the thread count, for the live sweep only. */
export const RESERVE = 1

/**
 * How many engines to run at once on this machine: one per processor thread.
 *
 * @param {object} [nav] - The `navigator` to read.
 * @returns {number} Logical processors reported, at least 1; 4 when unknown.
 * @reads navigator.hardwareConcurrency.
 */
export function poolSize(nav = globalThis.navigator) {
  return Math.max(1, Math.floor(Number(nav?.hardwareConcurrency) || 4))
}

/**
 * The error a cancelled run rejects with.
 *
 * @returns {Error} Named `Cancelled`.
 * @pure
 */
function cancelled() {
  const err = new Error('Cancelled')
  err.name = 'Cancelled'
  return err
}

/**
 * Create a pool.
 *
 * @param {object} opts - Options.
 * @param {Function} opts.spawn - `() → Worker` running `spiceWorker.js` (or anything with `postMessage`, `onmessage`, `onerror` and `terminate`).
 * @param {number} opts.size - Threads to use; the time-domain lane runs at most this many at once.
 * @returns {{run: Function, warm: Function, cancel: Function, stats: Function, size: number}} The pool.
 * @pure
 */
export function createPool({ spawn, size }) {
  const workers = [] // {w, task, warm}
  const queue = [] // {id, netlist, kind, lane, resolve, reject}
  const active = { live: 0, td: 0 }
  let nextId = 0
  /**
   * Most workers a lane may start.
   *
   * @param {string} lane - The lane.
   * @returns {number} The thread count, plus the reserve for the live sweep.
   * @pure
   */
  const limit = (lane) => (lane === 'live' ? size + RESERVE : size)

  /**
   * Start one worker.
   *
   * @returns {object} Its entry, idle and not yet warm.
   * @sideEffect Spawns a worker.
   * @mutates the pool's worker list.
   */
  const add = () => {
    const entry = { w: spawn(), task: null, warm: false }
    /**
     * A reply from the worker: warmed, or a run finished.
     *
     * @param {MessageEvent} e - `{warm: true}` or `{tid, ok, scale, vectors, error, spiceErrors}`.
     * @returns {void}
     * @sideEffect Settles the run's promise and hands the worker its next run.
     */
    entry.w.onmessage = (e) => {
      entry.warm = true
      if (e.data?.warm) { dispatch(); return }
      const t = entry.task
      if (!t || t.id !== e.data.tid) return
      entry.task = null
      active[t.lane]--
      if (e.data.ok) t.resolve({ scale: e.data.scale, vectors: e.data.vectors })
      else {
        const err = new Error(e.data.error)
        err.spiceErrors = e.data.spiceErrors || []
        t.reject(err)
      }
      dispatch()
    }
    /**
     * The worker died: fail its run and drop it.
     *
     * @returns {void}
     * @sideEffect Rejects the run and dispatches the queue to the remaining workers.
     */
    entry.w.onerror = () => {
      drop(entry)
      if (entry.task) {
        active[entry.task.lane]--
        entry.task.reject(new Error('A simulation thread stopped unexpectedly'))
        entry.task = null
      }
      dispatch()
    }
    workers.push(entry)
    return entry
  }

  /**
   * Terminate a worker and forget it.
   *
   * @param {object} entry - Its entry.
   * @returns {void}
   * @sideEffect Terminates the worker.
   * @mutates the pool's worker list.
   */
  const drop = (entry) => {
    const i = workers.indexOf(entry)
    if (i >= 0) workers.splice(i, 1)
    try { entry.w.terminate() } catch { /* already gone */ }
  }

  /**
   * An idle worker, warm ones first.
   *
   * @returns {object|null} Its entry.
   * @reads the pool's workers.
   */
  const idle = () => workers.find((e) => !e.task && e.warm) || workers.find((e) => !e.task) || null

  /**
   * Hand queued runs to free workers, live sweep first, starting workers up to each lane's limit.
   *
   * @returns {void}
   * @sideEffect Posts runs to workers; may spawn workers.
   * @mutates the queue and the workers' tasks.
   */
  const dispatch = () => {
    for (;;) {
      let placed = false
      for (const lane of LANES) {
        if (lane === 'td' && active.td >= size) continue
        const i = queue.findIndex((t) => t.lane === lane)
        if (i < 0) continue
        let entry = idle()
        if (!entry && workers.length < limit(lane)) entry = add()
        if (!entry) continue
        const [t] = queue.splice(i, 1)
        entry.task = t
        active[lane]++
        entry.w.postMessage({ tid: t.id, netlist: t.netlist, kind: t.kind })
        placed = true
        break
      }
      if (!placed) return
    }
  }

  /**
   * Queue one netlist.
   *
   * @param {string} netlist - The netlist.
   * @param {string} kind - `complex` or `real`.
   * @param {string} lane - `live` or `td`.
   * @returns {Promise<{scale: number[], vectors: Map<string, object>}>} Its result.
   * @sideEffect Queues the run and dispatches.
   */
  const submit = (netlist, kind, lane) => new Promise((resolve, reject) => {
    queue.push({ id: ++nextId, netlist, kind, lane, resolve, reject })
    dispatch()
  })

  /**
   * How many pieces to split a sweep into for a lane, now.
   *
   * @param {string} lane - The lane.
   * @returns {number} For the live sweep, the warm workers free (it never waits on an engine loading); for time-domain work, the lane's free threads.
   * @reads the pool's state.
   */
  const pieces = (lane) => {
    if (lane === 'live') return Math.max(1, workers.filter((e) => !e.task && e.warm).length)
    const queued = queue.filter((t) => t.lane === 'td').length
    return Math.max(1, size - active.td - queued)
  }

  /**
   * Run one netlist, splitting a frequency sweep across the free workers.
   *
   * @param {string} netlist - A complete netlist.
   * @param {string} kind - `complex` for an AC sweep, `real` for a transient run.
   * @param {string} [lane] - `live` or `td`.
   * @returns {Promise<{scale: number[], vectors: Map<string, object>}>} The result, as one run returns it.
   * @throws {Error} When SPICE fails, or the run is cancelled (named `Cancelled`).
   * @sideEffect Runs engines in the pool.
   */
  const run = async (netlist, kind, lane = 'td') => {
    warm(size)
    const parts = kind === 'complex' ? splitAc(netlist, pieces(lane)) : [netlist]
    const results = await Promise.all(parts.map((p) => submit(p, kind, lane)))
    return mergeAc(results)
  }

  /**
   * Start and warm workers up to a count, so the next runs need not wait for an engine to load.
   *
   * @param {number} [n] - Workers wanted; at most the thread count.
   * @returns {void}
   * @sideEffect Spawns workers and posts them a warm-up.
   */
  const warm = (n = size) => {
    while (workers.length < Math.min(n, size)) add().w.postMessage({ warm: true })
  }

  /**
   * Stop every run of a lane: queued ones are dropped, running ones' workers terminated.
   *
   * @param {string} lane - The lane.
   * @returns {void}
   * @sideEffect Rejects the lane's runs as `Cancelled` and terminates their workers; fresh ones start with the next runs.
   * @mutates the queue and the worker list.
   */
  const cancel = (lane) => {
    for (let i = queue.length - 1; i >= 0; i--) {
      if (queue[i].lane === lane) queue.splice(i, 1)[0].reject(cancelled())
    }
    for (const entry of workers.filter((e) => e.task?.lane === lane)) {
      drop(entry)
      entry.task.reject(cancelled())
      entry.task = null
    }
    active[lane] = 0
    dispatch()
  }

  /**
   * The pool's state, for display.
   *
   * @returns {{size: number, workers: number, busy: number, queued: number}} Threads, workers started, workers running, runs waiting.
   * @reads the pool's state.
   */
  const stats = () => ({ size, workers: workers.length, busy: workers.filter((e) => e.task).length, queued: queue.length })

  return { run, warm, cancel, stats, size }
}
