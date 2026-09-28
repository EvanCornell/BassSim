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
import { compileProject } from '../spice/compile.js'
import { runNetlist } from '../spice/run.js'
import { adaptResults } from '../spice/adapt.js'

/** The engines `simulateProject` accepts. */
export const ENGINES = ['spice', 'legacy']

/** The engine used when none is named. */
export const DEFAULT_ENGINE = 'spice'

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
 * Run the SPICE engine on a resolved, validated v3 project.
 *
 * @param {object} project - A resolved v3 project.
 * @param {Object<string, string[]>} warnings - The project's warnings, attached to the results.
 * @returns {Promise<{results: object, metrics: object|null, netlist: string}>} The sweep, its metrics, and the netlist that produced it.
 * @throws {Error} When the project uses something the compiler cannot build yet, or SPICE cannot solve it.
 * @sideEffect Runs ngspice.
 */
async function runSpice(project, warnings) {
  const analysis = (project.analyses || []).find((a) => a.type === 'ac')
  const npts = Math.min(analysis.npts || 512, MAX_NPTS)
  const t0 = typeof performance !== 'undefined' ? performance.now() : Date.now()
  const { netlist, map } = compileProject(project, { ...analysis, npts })
  const raw = await runNetlist(netlist)
  const results = adaptResults(raw, map)
  results.validation = { warnings, errors: [] }
  results.elapsedMs = (typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0
  const volts = map.channels[0]?.volts ?? 2.83
  const metrics = computeMetrics(results, { voltage: volts })
  return { results, metrics, netlist }
}

/**
 * Carry a saved project to a resolved, validated v3 project.
 *
 * @param {object} input - A parsed `.speakerspice.json` project, any version.
 * @returns {{project: object, warnings: Object<string, string[]>}} The project with every expression resolved, and its warnings keyed by node id.
 * @throws {Error} When expressions do not resolve or the project cannot be simulated; every reason is on `projectErrors`.
 * @pure
 */
export function prepareProject(input) {
  const { project, errors: exprErrors } = resolveProject(migrateProject(input))
  const { errors, warnings } = validateProject(project)
  const blocking = [...exprErrors, ...errors]
  if (blocking.length) throw projectError(blocking)
  return { project, warnings }
}

/**
 * Simulate a saved project of any schema version.
 *
 * @param {object} input - A parsed `.speakerspice.json` project, any version.
 * @param {object} [opts] - Options.
 * @param {string} [opts.engine] - One of `ENGINES`; defaults to `DEFAULT_ENGINE`.
 * @returns {Promise<{results: object, metrics: object|null, warnings: Object<string, string[]>, netlist?: string}>} The sweep, its metrics, the project's warnings keyed by node id, and — from the SPICE engine — the netlist it ran.
 * @throws {Error} When the project cannot be simulated — unresolvable expressions, structural errors, or an engine that cannot represent it. Every reason is on `projectErrors`.
 * @sideEffect Runs an engine.
 */
export async function simulateProject(input, { engine = DEFAULT_ENGINE } = {}) {
  if (!ENGINES.includes(engine)) throw projectError([`unknown engine "${engine}"`])
  const { project, warnings } = prepareProject(input)
  if (engine === 'spice') {
    try {
      const { results, metrics, netlist } = await runSpice(project, warnings)
      return { results, metrics, warnings, netlist }
    } catch (err) {
      throw projectError([err.message])
    }
  }
  const { results, metrics } = runLegacy(project)
  return { results, metrics, warnings }
}
