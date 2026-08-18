// Simulation worker: the engine's host in the browser.
//
// The solver is pure and knows nothing about where it runs, so this module is
// the whole of what makes it usable from the UI thread. It replaces the
// `/api/simulate` endpoint the app used to POST to; the request/response shape
// is deliberately the same, minus the transport.
//
// A sweep is fast enough that cancellation is not worth the cost of tearing
// down and respawning a worker: the store tags every request with an id and
// ignores replies it no longer wants. What the worker buys is that a long
// sweep — a large `npts`, or the iterating large-signal path — cannot freeze
// the canvas mid-drag.
import { runSimulation } from './solver'
import { computeMetrics } from './metrics'
import { hydrateProject } from './project'

// Upper bound on sweep resolution. The server capped this at 1024 because the
// endpoint was unauthenticated and a large sweep was someone else's CPU. Here
// the only cost is the user's own tab, so the cap exists purely to keep a
// mistyped value from appearing to hang the app.
const MAX_NPTS = 8192

/**
 * Run one sweep and derive its metrics.
 *
 * Mirrors what the former `/api/simulate` handler did, so a project that
 * simulated through the server simulates identically here.
 *
 * @param {object} project - A serialized project: `{nodes, edges, settings}`.
 * @returns {{results: object, metrics: object|null}} The raw sweep and its derived metrics, `metrics` being `null` when the simulation failed.
 * @throws {Error} When the project is structurally invalid; the error carries `projectErrors`.
 * @sideEffect Runs the solver.
 */
function simulate(project) {
  const { nodes, edges, settings } = hydrateProject(project)
  settings.npts = Math.min(settings.npts || 512, MAX_NPTS)
  const results = runSimulation(nodes, edges, settings)
  const xmaxNode = nodes.find((n) => n.type === 'driver')
  const metrics = results.ok
    ? computeMetrics(results, { ...settings, xmax: xmaxNode?.data.params.Xmax })
    : null
  return { results, metrics }
}

/**
 * Handle one simulation request from the store.
 *
 * Structural errors come back as a failed reply rather than an exception, so
 * the caller sees a hand-edited project's problems the same way it saw the
 * server's 422 — as a list on `projectErrors`.
 *
 * @param {MessageEvent} e - The request, `{id, project}`.
 * @returns {void}
 * @sideEffect Posts a reply back to the main thread.
 */
self.onmessage = (e) => {
  const { id, project } = e.data
  try {
    const { results, metrics } = simulate(project)
    self.postMessage({ id, ok: true, results, metrics })
  } catch (err) {
    self.postMessage({
      id,
      ok: false,
      error: err.message,
      projectErrors: err.projectErrors || null,
    })
  }
}
