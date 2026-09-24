// The coordinator's side of the simulation thread pool.
//
// A worker that coordinates a job — the live sweep's, the time-domain
// analyses' — compiles netlists and reads results, but runs none itself:
// each netlist goes to the main thread, which hands it to the pool (see
// `pool.js` and `poolHost.js`), and the vectors come back.
import { setRunner, setThreads } from '../spice/run.js'

/**
 * Send this worker's runs to the pool through the main thread.
 *
 * Replies arrive as `{type: 'spice-reply', rid, …}` messages; the worker's
 * own message handler must ignore them.
 *
 * @param {object} [scope] - The worker's global scope.
 * @returns {void}
 * @sideEffect Installs a message listener and swaps the SPICE runner.
 */
export function installRemoteRunner(scope = self) {
  const pending = new Map()
  let rid = 0
  scope.addEventListener('message', (e) => {
    const d = e.data
    if (d?.type === 'threads') { setThreads(d.n); return }
    if (d?.type !== 'spice-reply') return
    const p = pending.get(d.rid)
    if (!p) return
    pending.delete(d.rid)
    if (d.ok) p.resolve({ scale: d.scale, vectors: d.vectors })
    else {
      const err = new Error(d.error)
      err.spiceErrors = d.spiceErrors || []
      p.reject(err)
    }
  })
  setRunner((netlist, kind) => new Promise((resolve, reject) => {
    const id = ++rid
    pending.set(id, { resolve, reject })
    scope.postMessage({ type: 'spice', rid: id, netlist, kind })
  }))
}

/**
 * Whether a message is the pool's, not a job for the worker.
 *
 * @param {object} data - A message's data.
 * @returns {boolean} True for pool traffic.
 * @pure
 */
export function isPoolMessage(data) {
  return data?.type === 'spice-reply' || data?.type === 'threads'
}
