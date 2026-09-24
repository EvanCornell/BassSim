// Time-domain worker: runs the long analyses — transient runs, distortion
// sweeps — away from both the UI thread and the live sweep's worker, so the
// frequency response keeps updating while a distortion sweep runs.
//
// Cancelling a job terminates this worker; the store spawns a fresh one for
// the next job. That is the only way to stop ngspice mid-run.
import { prepareProject } from './pipeline'
import { linearResponses, transientAnalysis, distortionAnalysis } from '../spice/timedomain'

/**
 * Run one time-domain job and post its progress and result.
 *
 * @param {MessageEvent} e - The request: `{id, kind, project, opts, mode}` — `kind` is `linear`, `transient` or `distortion`; `mode` the distortion analysis.
 * @returns {Promise<void>} Settles once the reply is posted.
 * @sideEffect Runs the engine and posts `progress` messages, then one `done` or `error` message.
 */
self.onmessage = async (e) => {
  const { id, kind, project, opts, mode } = e.data
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
    else throw new Error(`unknown time-domain job "${kind}"`)
    self.postMessage({ id, type: 'done', kind, mode, result, warnings })
  } catch (err) {
    self.postMessage({ id, type: 'error', error: err.message, projectErrors: err.projectErrors || null })
  }
}
