// The main thread's end of the simulation thread pool: one pool for the
// page, and the relay that carries a coordinating worker's netlists to it
// and the results back.
import { createPool, poolSize } from './pool.js'

let pool = null

/**
 * Start one engine worker.
 *
 * @returns {Worker} A worker running `spiceWorker.js`.
 * @sideEffect Spawns a worker.
 */
function spawnEngine() {
  return new Worker(new URL('./spiceWorker.js', import.meta.url), { type: 'module' })
}

/**
 * The page's pool, created on first use.
 *
 * @returns {object} The pool (see `createPool`).
 * @sideEffect Creates the pool the first time; its workers start as runs arrive or on `warm`.
 */
export function getPool() {
  if (!pool) {
    pool = createPool({ spawn: spawnEngine, size: poolSize() })
  }
  return pool
}

/**
 * Every buffer in a result, so the relay can move them rather than copy them.
 *
 * @param {Map<string, object>} vectors - A run's vectors.
 * @returns {ArrayBuffer[]} Their buffers.
 * @pure
 */
function buffers(vectors) {
  const out = []
  for (const v of vectors.values()) {
    if (v.re) out.push(v.re.buffer, v.im.buffer)
    else out.push(v.buffer)
  }
  return out
}

/**
 * Serve a coordinating worker's run request from the pool.
 *
 * @param {Worker} worker - The coordinating worker.
 * @param {object} data - A message from it.
 * @param {string} lane - `live` or `td`.
 * @returns {boolean} True when the message was a run request (and is being served); false for any other message.
 * @sideEffect Runs the netlist in the pool and posts `{type: 'spice-reply', …}` back to the worker.
 */
export function relay(worker, data, lane) {
  if (data?.type !== 'spice') return false
  getPool().run(data.netlist, data.kind, lane).then(
    (r) => { try { worker.postMessage({ type: 'spice-reply', rid: data.rid, ok: true, scale: r.scale, vectors: r.vectors }, buffers(r.vectors)) } catch { /* worker gone */ } },
    (err) => { try { worker.postMessage({ type: 'spice-reply', rid: data.rid, ok: false, error: err.message, spiceErrors: err.spiceErrors || [] }) } catch { /* worker gone */ } },
  )
  return true
}

/**
 * Stop every run of a lane, if the pool has started.
 *
 * @param {string} lane - `live` or `td`.
 * @returns {void}
 * @sideEffect Cancels the lane's runs (see `createPool`).
 */
export function cancelLane(lane) {
  if (pool) pool.cancel(lane)
}
