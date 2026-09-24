// An engine worker in the simulation thread pool (see `pool.js`): one
// ngspice instance on its own thread, running whatever netlists the pool
// hands it and sending back the vectors.
import { runLocal } from '../spice/run'

/** A circuit small enough to load the engine with and nothing more. */
const WARM_NETLIST = 'warm\nV1 1 0 dc 0 ac 1\nR1 1 0 1\n.ac lin 1 1 1\n.end'

/**
 * Every buffer in a result, so the reply can move them rather than copy them.
 *
 * @param {Map<string, object>} vectors - The run's vectors.
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
 * Run one netlist, or load the engine, and reply.
 *
 * @param {MessageEvent} e - `{warm: true}`, or `{tid, netlist, kind}`.
 * @returns {Promise<void>} Settles once the reply is posted.
 * @sideEffect Runs the engine and posts `{warm: true}`, or `{tid, ok, scale, vectors}` / `{tid, ok: false, error, spiceErrors}`.
 */
self.onmessage = async (e) => {
  const { tid, netlist, kind, warm } = e.data
  if (warm) {
    try { await runLocal(WARM_NETLIST, 'complex') } catch { /* the next real run reports it */ }
    self.postMessage({ warm: true })
    return
  }
  try {
    const { scale, vectors } = await runLocal(netlist, kind)
    self.postMessage({ tid, ok: true, scale, vectors }, buffers(vectors))
  } catch (err) {
    self.postMessage({ tid, ok: false, error: err.message, spiceErrors: err.spiceErrors || [] })
  }
}
