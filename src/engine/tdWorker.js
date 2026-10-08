// Time-domain worker: runs the long analyses — transient runs, distortion
// sweeps — away from both the UI thread and the live sweep's worker, so the
// frequency response keeps updating while a distortion sweep runs.
//
// Cancelling a job terminates this worker; the store spawns a fresh one for
// the next job. That is the only way to stop ngspice mid-run.
//
// The analyses run no SPICE here: every netlist goes to the page's thread
// pool (see `pool.js`), and the analyses start as many at once as the pool
// has threads, which each job message carries.
import { prepareProject } from './pipeline'
import { installRemoteRunner, isPoolMessage } from './remote'
import { setThreads } from '../spice/run'
import { linearResponses, transientAnalysis, distortionAnalysis, levelRun } from '../spice/timedomain'

installRemoteRunner()

/**
 * Run one time-domain job and post its progress and result.
 *
 * @param {MessageEvent} e - The request: `{id, kind, project, opts, mode, threads}` — `kind` is `linear`, `transient`, `distortion` or `level`; `mode` the distortion analysis; `threads` the pool's size. The pool's own messages are left to its listener.
 * @returns {Promise<void>} Settles once the reply is posted.
 * @sideEffect Runs the engine and posts `progress` messages, then one `done` or `error` message.
 */
self.onmessage = async (e) => {
  if (isPoolMessage(e.data)) return
  const { id, kind, project, opts, mode, threads } = e.data
  setThreads(threads || 1)
  /**
   * Report progress to the store.
   *
   * @param {number} fraction - 0–1.
   * @param {string} message - What is running.
   * @returns {void}
   * @sideEffect Posts a message.
   */
  const progress = (fraction, message) => self.postMessage({ id, type: 'progress', fraction, message })
  try {
    const { project: p, warnings } = prepareProject(project)
    let result
    if (kind === 'linear') result = await linearResponses(p, opts, progress)
    else if (kind === 'transient') result = await transientAnalysis(p, opts, progress)
    else if (kind === 'distortion') result = await distortionAnalysis(p, mode, opts, progress)
    else if (kind === 'level') result = await levelRun(p, opts, progress)
    else throw new Error(`unknown time-domain job "${kind}"`)
    self.postMessage({ id, type: 'done', kind, mode, result, warnings })
  } catch (err) {
    self.postMessage({ id, type: 'error', error: err.message, projectErrors: err.projectErrors || null })
  }
}
