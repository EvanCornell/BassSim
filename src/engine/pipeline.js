// One simulation, from a saved project to results, for any engine.
//
// The worker and the MCP server both call `simulateProject`, so a project
// simulates identically in the browser and over the API. The stages are the
// same whichever engine runs:
//
//   migrate → resolve expressions → validate → engine → metrics
//
// Validation errors stop the run; warnings travel with the results.

import { migrateProject } from '../schema/migrate.js'
import { resolveProject } from '../schema/params.js'
import { validateProject } from '../schema/validate.js'
import { toLegacy } from '../schema/toLegacy.js'
import { hydrateProject } from './project.js'
import { runSimulation } from './solver.js'
import { computeMetrics } from './metrics.js'

/** The engines `simulateProject` accepts. */
export const ENGINES = ['legacy']

/** The engine used when none is named. */
export const DEFAULT_ENGINE = 'legacy'

// Upper bound on sweep resolution. The cap exists purely to keep a mistyped
// value from appearing to hang the app.
const MAX_NPTS = 8192

/**
 * Build the error `simulateProject` throws for a project it cannot run.
 *
 * @param {string[]} reasons - Every problem found.
 * @returns {Error} An error whose message joins them and whose `projectErrors` lists them.
 * @pure
 */
function projectError(reasons) {
  const err = new Error(reasons.join('; '))
  err.projectErrors = reasons
  return err
}

/**
 * Run the legacy engine on a resolved, validated v3 project.
 *
 * @param {object} project - A resolved v3 project.
 * @returns {{results: object, metrics: object|null}} The sweep and its metrics.
 * @throws {Error} When the project uses anything the legacy engine cannot represent.
 * @sideEffect Runs the legacy solver.
 */
function runLegacy(project) {
  // schemaVersion 2 so the legacy loader does not rescale `ecFactor` again.
  const { nodes, edges, settings } = hydrateProject({ schemaVersion: 2, ...toLegacy(project) })
  settings.npts = Math.min(settings.npts || 512, MAX_NPTS)
  const results = runSimulation(nodes, edges, settings)
  const xmaxNode = nodes.find((n) => n.type === 'driver')
  const metrics = results.ok
    ? computeMetrics(results, { ...settings, xmax: xmaxNode?.data.params.Xmax })
    : null
  return { results, metrics }
}

/**
 * Simulate a saved project of any schema version.
 *
 * @param {object} input - A parsed `.acousim.json` project, any version.
 * @param {object} [opts] - Options.
 * @param {string} [opts.engine] - One of `ENGINES`; defaults to `DEFAULT_ENGINE`.
 * @returns {Promise<{results: object, metrics: object|null, warnings: Object<string, string[]>}>} The sweep, its metrics, and the project's warnings keyed by node id.
 * @throws {Error} When the project cannot be simulated — unresolvable expressions, structural errors, or an engine that cannot represent it. Every reason is on `projectErrors`.
 * @sideEffect Runs an engine.
 */
export async function simulateProject(input, { engine = DEFAULT_ENGINE } = {}) {
  if (!ENGINES.includes(engine)) throw projectError([`unknown engine "${engine}"`])
  const { project, errors: exprErrors } = resolveProject(migrateProject(input))
  const { errors, warnings } = validateProject(project)
  const blocking = [...exprErrors, ...errors]
  if (blocking.length) throw projectError(blocking)
  const { results, metrics } = runLegacy(project)
  return { results, metrics, warnings }
}
