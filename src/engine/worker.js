// Simulation worker: the engine's host in the browser.
//
// Everything that turns a project into results lives in `pipeline.js`, which
// the MCP server shares; this module only makes it reachable from the UI
// thread without freezing the canvas during a long sweep.
//
// A sweep is fast enough that cancellation is not worth the cost of tearing
// down and respawning a worker: the store tags every request with an id and
// ignores replies it no longer wants.
//
// SPICE runs go to the page's thread pool (see `pool.js`), which splits the
// sweep across whichever engine workers are free.
import { simulateProject } from './pipeline'
import { installRemoteRunner, isPoolMessage } from './remote'

installRemoteRunner()

/**
 * Handle one simulation request from the store.
 *
 * A project that cannot be simulated comes back as a failed reply rather than
 * an exception, carrying every reason on `projectErrors`.
 *
 * @param {MessageEvent} e - The request, `{id, project}`; the pool's own messages are left to its listener.
 * @returns {Promise<void>} Settles once the reply is posted.
 * @sideEffect Runs the simulation and posts a reply back to the main thread.
 */
self.onmessage = async (e) => {
  if (isPoolMessage(e.data)) return
  const { id, project } = e.data
  try {
    const { results, metrics, warnings } = await simulateProject(project)
    self.postMessage({ id, ok: true, results, metrics, warnings })
  } catch (err) {
    self.postMessage({
      id,
      ok: false,
      error: err.message,
      projectErrors: err.projectErrors || null,
    })
  }
}
