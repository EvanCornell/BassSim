// SpeakerSpice MCP server core: tool/resource registrations, transport-agnostic.
// Entry points: mcp/server.js (stdio) and mcp/http.js (streamable HTTP).
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { simulateProject } from '../src/engine/pipeline.js'
import { migrateProject } from '../src/schema/migrate.js'
import { resolveProject } from '../src/schema/params.js'
import { validateProject } from '../src/schema/validate.js'
import { toEditor, fromEditor } from '../src/schema/editor.js'
import { searchDrivers, BUILDERS, calibratePort, optimizeProject } from './builders.js'
import {
  CORE_FIELDS, EXT_FIELDS, POPULATED_EXT_KEYS, DRIVER_BRANDS, SOURCE_LABELS,
} from '../src/data/drivers.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const GUIDE = readFileSync(join(__dirname, 'guide.md'), 'utf8')

const MAX_NPTS = 1024
const MAX_SWEEP_STEPS = 41

// ---------- helpers ----------

/**
 * Round a number to a fixed significant-figure count for JSON output.
 *
 * Tool responses are read by a language model, and full float precision is
 * noise that costs tokens without adding meaning: 4 significant figures is
 * well past the accuracy of the model producing them.
 *
 * @param {number|null|undefined} v - The value.
 * @param {number} [n=4] - Significant figures.
 * @returns {number|null} The rounded number, or `null` for absent and non-finite values so the JSON carries an explicit "no value" rather than `NaN`.
 * @pure
 */
const sig = (v, n = 4) => (v == null || !isFinite(v) ? null : Number(Number(v).toPrecision(n)))

/**
 * Describe a node as `label (id)`, or just its id when it has no label.
 *
 * Used throughout the tool responses so an agent reads "Port (waveguide_3)"
 * rather than an opaque id.
 *
 * @param {Array<object>} nodes - Hydrated graph nodes, each shaped `{id, type, data: {params}}` — the label lives at `node.data.params.label`.
 * @param {string} id - Node id.
 * @returns {string} A human-readable node reference.
 * @pure
 */
function labelOf(nodes, id) {
  const n = nodes.find((x) => x.id === id)
  return n?.data.params.label ? `${n.data.params.label} (${id})` : id
}

/**
 * Resolve a node reference, which may be an id or a label.
 *
 * Agents naturally refer to "the port" rather than `waveguide_3`, so both
 * work. Ids are matched first, then labels case-insensitively.
 *
 * @param {Array<object>} nodes - Hydrated graph nodes, each shaped `{id, type, data: {params}}` — labels are matched against `node.data.params.label`.
 * @param {string} ref - Node id or label.
 * @param {string[]|null} [types=null] - Restrict to these node types. `null` searches every node.
 * @returns {object} The matching node.
 * @throws {Error} When nothing matches. The message lists the available nodes, so an agent can correct itself without another round-trip.
 * @pure
 */
function resolveNode(nodes, ref, types = null) {
  const pool = types ? nodes.filter((n) => types.includes(n.type)) : nodes
  const hit = pool.find((n) => n.id === ref)
    || pool.find((n) => (n.data.params.label || '').toLowerCase() === String(ref).toLowerCase())
  if (!hit) {
    const avail = pool.map((n) => `${n.id}${n.data.params.label ? ` "${n.data.params.label}"` : ''}`).join(', ')
    throw new Error(`No ${types ? types.join('/') : ''} node matches "${ref}". Available: ${avail || 'none'}`)
  }
  return hit
}

/**
 * Bring a project to the current schema, applying any flat `settings` over it.
 *
 * Tools address sweep and drive settings by their flat names — `voltage`,
 * `fmin`, `npts` — as older files stored them. A current-version project keeps
 * those in its analyses, wiring and display sections instead, so a `settings`
 * object on it is taken as overrides and folded in through the editor bridge.
 *
 * @param {object} projRaw - A serialized project, any schema version.
 * @returns {object} A complete current-version project.
 * @throws {TypeError} When `projRaw` is not an object.
 * @pure
 */
function asCurrent(projRaw) {
  if (!projRaw || typeof projRaw !== 'object') throw new TypeError('project must be an object')
  const proj = migrateProject(projRaw)
  if (Number(projRaw.schemaVersion) >= 3 && projRaw.settings) {
    const ed = toEditor(proj)
    ed.settings = { ...ed.settings, ...projRaw.settings }
    return migrateProject(fromEditor(ed))
  }
  return proj
}

/**
 * A project with a flat `settings` object that tools can read and override.
 *
 * @param {object} projRaw - A serialized project, any schema version.
 * @returns {object} The same project with `settings` filled from its current values when it had none.
 * @pure
 */
function withSettings(projRaw) {
  if (projRaw.settings) return projRaw
  return { ...projRaw, settings: toEditor(migrateProject(projRaw)).settings }
}

/**
 * Hydrate a project and simulate it.
 *
 * The shared entry point behind every simulating tool. Point count is
 * capped at 1024 regardless of what the project asks for, since a tool call
 * is a synchronous request and an agent can otherwise request an
 * arbitrarily expensive sweep.
 *
 * @param {object} projRaw - A serialized project, any schema version.
 * @returns {Promise<{nodes: Array<object>, edges: Array<object>, settings: object, res: object, metrics: object|null}>} The graph in the editor's shape (params at `data.params`), its flat settings, the raw result, and metrics.
 * @throws {Error} When the project cannot be simulated; every reason is on `projectErrors`.
 * @sideEffect Runs the engine, which is the expensive part of every tool call.
 */
async function run(projRaw) {
  const proj = asCurrent(projRaw)
  proj.analyses[0].npts = Math.min(proj.analyses[0].npts || 512, MAX_NPTS)
  const { results, metrics } = await simulateProject(proj)
  const ed = toEditor(proj)
  return { nodes: ed.nodes, edges: ed.edges, settings: ed.settings, res: results, metrics }
}

/**
 * Reduce a curve to about `points` samples for a tool response.
 *
 * A 512-point curve is far more than an agent needs and far more than it
 * should pay for in tokens. The samples are evenly spaced across the
 * window, but the minimum and maximum are always added — without them, an
 * impedance peak or an excursion spike could fall between samples and the
 * agent would conclude the design is fine when it is not.
 *
 * @param {number[]} freqs - Frequency axis, Hz.
 * @param {number[]} arr - Curve sampled on that axis.
 * @param {number} [points=48] - Target sample count. The result may hold up to two more, for the extrema.
 * @param {number|null} [fmin=null] - Window the output to at or above this frequency.
 * @param {number|null} [fmax=null] - Window the output to at or below this frequency.
 * @returns {Array<[number|null, number|null]>} `[frequency, value]` pairs in ascending frequency order, rounded for output.
 * @pre freqs.length === arr.length
 * @pure
 */
function downsample(freqs, arr, points = 48, fmin = null, fmax = null) {
  let i0 = 0, i1 = freqs.length - 1
  if (fmin != null) while (i0 < i1 && freqs[i0] < fmin) i0++
  if (fmax != null) while (i1 > i0 && freqs[i1] > fmax) i1--
  const span = i1 - i0 + 1
  const n = Math.min(points, span)
  const idx = new Set()
  for (let k = 0; k < n; k++) idx.add(i0 + Math.round((k * (span - 1)) / (n - 1 || 1)))
  let iMax = i0, iMin = i0
  for (let i = i0; i <= i1; i++) {
    const v = arr[i]
    if (v == null || !isFinite(v)) continue
    if (arr[iMax] == null || v > arr[iMax]) iMax = i
    if (arr[iMin] == null || v < arr[iMin]) iMin = i
  }
  idx.add(iMax); idx.add(iMin)
  return [...idx].sort((a, b) => a - b).map((i) => [sig(freqs[i]), sig(arr[i])])
}

const QUANTITIES = {
  spl: {
    label: 'SPL combined, dB @ 1 m',
    /**
     * Coherent sum of every radiator in the design — the headline response.
     *
     * @param {object} r - A simulation result.
     * @returns {Array<number>} SPL in dB at 1 m, per frequency.
     * @pure
     */
    get: (r) => r.splCombined,
  },
  spl_driver: {
    label: 'SPL direct driver radiation, dB',
    /**
     * Only the output reaching the listener from a driver's front port, excluding anything radiated by a port or passive radiator.
     *
     * @param {object} r - A simulation result.
     * @returns {Array<number|null>} SPL in dB, `null` where nothing radiates directly.
     * @pure
     */
    get: (r) => r.splDriver,
  },
  spl_port: {
    label: 'SPL of one radiator, dB',
    node: ['waveguide', 'radiation', 'pr'],
    /**
     * Output of a single radiating terminal, for judging how much of the total each contributes.
     *
     * @param {object} r - A simulation result.
     * @param {string} id - Radiator node id.
     * @returns {Array<number|null>|undefined} SPL in dB, or `undefined` when that node radiates nothing.
     * @pure
     */
    get: (r, id) => r.splPorts[id],
  },
  impedance: {
    label: 'Electrical input impedance, ohm',
    /**
     * Impedance magnitude at the amplifier terminals. Its peaks identify the box alignment.
     *
     * @param {object} r - A simulation result.
     * @returns {Array<number>} Impedance magnitude in ohms.
     * @pure
     */
    get: (r) => r.zinMag,
  },
  impedance_phase: {
    label: 'Impedance phase, deg',
    /**
     * Impedance phase angle, which decides how reactive a load the amplifier sees.
     *
     * @param {object} r - A simulation result.
     * @returns {Array<number>} Phase in degrees.
     * @pure
     */
    get: (r) => r.zinPhase,
  },
  excursion: {
    label: 'Cone excursion (worst driver), mm peak',
    /**
     * Largest single-cone displacement at each frequency. Cone travel is not additive, so this reports the worst offender rather than a sum.
     *
     * @param {object} r - A simulation result.
     * @returns {Array<number>} Peak displacement in mm.
     * @pure
     */
    get: (r) => r.excursion,
  },
  excursion_driver: {
    label: 'Cone excursion of one driver, mm peak',
    node: ['driver'],
    /**
     * Displacement of one specific driver, for judging each cone against its own Xmax.
     *
     * @param {object} r - A simulation result.
     * @param {string} id - Driver node id.
     * @returns {Array<number>|undefined} Peak displacement in mm.
     * @pure
     */
    get: (r, id) => r.excursionByDriver[id],
  },
  velocity: {
    label: 'Air velocity in a waveguide, m/s peak',
    node: ['waveguide'],
    /**
     * Peak air speed in a port or duct. Above roughly 17 m/s a port begins to chuff audibly.
     *
     * @param {object} r - A simulation result.
     * @param {string} id - Waveguide node id.
     * @returns {Array<number>|undefined} Peak velocity in m/s.
     * @pure
     */
    get: (r, id) => r.velocity[id],
  },
  spl_interior: {
    label: 'SPL inside a chamber, dB (virtual mic; set params.probe=true on the chamber, position via probePos 0-100%)',
    node: ['chamber'],
    /**
     * Pressure at a virtual microphone inside a chamber — the right measure for in-cabin listening levels. Requires `probe: true` on that chamber.
     *
     * @param {object} r - A simulation result.
     * @param {string} id - Chamber node id.
     * @returns {Array<number|null>|undefined} Interior SPL in dB, or `undefined` when that chamber has no probe.
     * @pure
     */
    get: (r, id) => r.splInterior?.[id],
  },
  acoustic_power: {
    label: 'Radiated acoustic power, W',
    /**
     * Total acoustic power leaving the enclosure, summed over every radiator.
     *
     * @param {object} r - A simulation result.
     * @returns {Array<number>} Acoustic power in watts.
     * @pure
     */
    get: (r) => r.power,
  },
  electrical_power: {
    label: 'Electrical input power (real), W',
    /**
     * Real power drawn at the driver terminals — what the amplifier actually delivers.
     *
     * @param {object} r - A simulation result.
     * @returns {Array<number>} Real power in watts.
     * @pure
     */
    get: (r) => r.peReal,
  },
  apparent_power: {
    label: 'Electrical input power (apparent), VA',
    /**
     * Apparent power, which exceeds the real power wherever the load is reactive.
     *
     * @param {object} r - A simulation result.
     * @returns {Array<number>} Apparent power in VA.
     * @pure
     */
    get: (r) => r.peApparent,
  },
  efficiency: {
    label: 'Acoustic efficiency, %',
    /**
     * Acoustic power as a percentage of electrical input power.
     *
     * Derived rather than stored, since it is the ratio of two series the
     * solver already produces. Guarded against a near-zero denominator at
     * frequencies where the driver draws essentially nothing.
     *
     * @param {object} r - A simulation result.
     * @returns {Array<number|null>} Efficiency in percent, `null` where input power is too small to divide by.
     * @pure
     */
    get: (r) => r.freqs.map((_, i) => (r.peReal[i] > 1e-9 ? (r.power[i] / r.peReal[i]) * 100 : null)),
  },
  phase: {
    label: 'Unwrapped phase, deg',
    /**
     * Phase of the combined pressure, unwrapped so it runs continuously.
     *
     * @param {object} r - A simulation result.
     * @returns {Array<number>} Unwrapped phase in degrees.
     * @pure
     */
    get: (r) => r.phaseUnwrapped,
  },
  group_delay: {
    label: 'Group delay, ms',
    /**
     * Group delay, the derivative of unwrapped phase with respect to frequency.
     *
     * @param {object} r - A simulation result.
     * @returns {Array<number>} Group delay in milliseconds.
     * @pure
     */
    get: (r) => r.groupDelay,
  },
}

/**
 * Reduce computed metrics to a labelled, unit-carrying object for JSON output.
 *
 * Absent figures are omitted rather than emitted as null, so a sealed box's
 * summary simply has no tuning field instead of one saying `null` — which
 * reads to an agent as a missing measurement rather than an inapplicable one.
 *
 * @param {object|null} metrics - Metrics from `computeMetrics`.
 * @returns {object|null} Formatted metrics keyed by name, or `null` when there were none. Values are strings or numbers except `impedance_peaks`, which is an array of one formatted string per peak.
 * @pure
 */
function metricsSummary(metrics) {
  if (!metrics) return null
  const m = {}
  /**
   * Add one metric, skipping it when there is no usable value.
   *
   * @param {string} k - Output key.
   * @param {number|null|undefined} v - The value.
   * @param {string} [unit] - Unit appended to the formatted number. Omit for dimensionless figures.
   * @returns {void}
   * @mutates Adds to the enclosing output object.
   */
  const put = (k, v, unit) => { if (v != null && isFinite(v)) m[k] = unit ? `${sig(v)} ${unit}` : sig(v) }
  put('f3', metrics.f3, 'Hz'); put('f10', metrics.f10, 'Hz')
  put('fb_tuning', metrics.fb, 'Hz'); put('fc_sealed', metrics.fc, 'Hz'); put('qtc', metrics.qtc)
  put('passband_level', metrics.passband, 'dB'); put('peak_spl', metrics.peakSPL, 'dB')
  if (metrics.bwHz) m.bandwidth = `${sig(metrics.bwHz)} Hz (${sig(metrics.bwOct)} octaves)`
  if (metrics.zPeaks?.length) m.impedance_peaks = metrics.zPeaks.map((p) => `${sig(p.f)} Hz / ${sig(p.v)} ohm`)
  if (metrics.xPeak) m.max_excursion = `${sig(metrics.xPeak)} mm pk @ ${sig(metrics.xPeakF)} Hz`
  put('excursion_at_fb', metrics.xAtFb, 'mm'); put('excursion_at_f3', metrics.xAtF3, 'mm')
  if (metrics.maxPower) m.max_power_before_xmax = `${sig(metrics.maxPower)} W (${sig(metrics.vMax)} V)`
  return m
}

/**
 * Build the JSON summary returned by `simulate`.
 *
 * Shaped for an agent rather than a chart: the headline metrics, the
 * validation warnings in plain language, per-radiator peak air velocity,
 * per-driver peak excursion annotated against each cone's own Xmax, and
 * two downsampled curves. Excursion over Xmax is called out in the text as
 * "EXCEEDED" so the agent cannot miss it by not comparing two numbers.
 *
 * A failed simulation returns early with the errors and no curves.
 *
 * @param {object} ctx - The result of `run`.
 * @param {number} [points=40] - Curve downsample resolution.
 * @returns {object} The summary object, ready to serialize.
 * @pure
 */
function summarize({ nodes, settings, res, metrics }, points = 40) {
  const warnings = Object.entries(res.validation?.warnings || {}).flatMap(([id, ws]) =>
    ws.map((w) => `${labelOf(nodes, id)}: ${w}`))
  const out = {
    ok: res.ok,
    drive: `${sig(settings.voltage)} V RMS (${sig((settings.voltage ** 2) / (settings.impedance || 4))} W into ${settings.impedance || 4} ohm nominal), sweep ${settings.fmin}-${settings.fmax} Hz`,
    warnings,
    metrics: metricsSummary(metrics),
  }
  if (!res.ok) { out.errors = res.validation?.errors || []; return out }
  const vmax = {}
  for (const [wid, arr] of Object.entries(res.velocity)) {
    let vi = 0
    for (let i = 1; i < arr.length; i++) if (arr[i] > arr[vi]) vi = i
    if (arr[vi] > 0.01) vmax[labelOf(nodes, wid)] = `${sig(arr[vi])} m/s pk @ ${sig(res.freqs[vi])} Hz`
  }
  if (Object.keys(vmax).length) out.max_air_velocity = vmax
  const exc = {}
  for (const [did, arr] of Object.entries(res.excursionByDriver)) {
    let xi = 0
    for (let i = 1; i < arr.length; i++) if (arr[i] > arr[xi]) xi = i
    const xmax = nodes.find((n) => n.id === did)?.data.params.Xmax
    exc[labelOf(nodes, did)] = `${sig(arr[xi])} mm pk @ ${sig(res.freqs[xi])} Hz` + (xmax ? ` (Xmax ${xmax} mm${arr[xi] > xmax ? ' — EXCEEDED' : ''})` : '')
  }
  out.excursion = exc
  out.curves = {
    note: `[frequency Hz, value] pairs, downsampled to ~${points} points; use get_curve for others/finer`,
    spl_db: downsample(res.freqs, res.splCombined, points),
    impedance_ohm: downsample(res.freqs, res.zinMag, points),
  }
  return out
}

/**
 * Wrap a value as a successful MCP tool result.
 *
 * @param {any} obj - Serializable payload.
 * @returns {{content: Array<{type: string, text: string}>}} An MCP tool result carrying the JSON as text.
 * @pure
 */
const jsonResult = (obj) => ({ content: [{ type: 'text', text: JSON.stringify(obj, null, 1) }] })
/**
 * Wrap an error as a failed MCP tool result.
 *
 * Returned rather than thrown, so the agent receives the message and can
 * correct its input instead of the transport reporting an opaque failure.
 *
 * @param {Error} e - The error.
 * @returns {{isError: boolean, content: Array<{type: string, text: string}>}} An MCP error result.
 * @pure
 */
const errResult = (e) => ({ isError: true, content: [{ type: 'text', text: `Error: ${e.message}` }] })

// ---------- server ----------

/**
 * Build a fully configured MCP server with every tool and resource registered.
 *
 * A factory rather than a singleton because the HTTP transport is
 * stateless: each POST is handled by a fresh instance, which is what makes
 * it safe to run behind a load balancer.
 *
 * @returns {McpServer} A server ready to connect to a transport.
 * @sideEffect Reads `mcp/guide.md` from disk at module load, and registers tools on the new instance.
 */
export function createServer() {
const server = new McpServer(
  { name: 'speakerspice', version: '0.1.0' },
  {
    instructions:
      'SpeakerSpice: loudspeaker enclosure simulation via acoustic transfer matrices. '
      + 'Projects are JSON node graphs (drivers, chambers, waveguides, passive radiators, radiation terminations) '
      + 'compatible with the SpeakerSpice visual editor. Read the design_guide tool/resource FIRST — it documents the '
      + 'schema, units, and topology semantics. Typical flow: build project JSON → validate → simulate → '
      + 'sweep_parameter to tune → report metrics (F3, tuning, port velocity, excursion vs Xmax) against the user\'s goals.',
  },
)

const projectParam = z.record(z.string(), z.any()).describe(
  'SpeakerSpice project JSON: { settings, nodes: [{id, type, params}], edges: [{source, sourceHandle, target, targetHandle}] }. See design_guide.',
)

server.registerTool('design_guide', {
  title: 'SpeakerSpice design guide',
  description: 'Returns the modeling guide: project JSON schema, node types with params and units, topology semantics, and design workflow. Call this before building your first project.',
  inputSchema: {},
}, async () => ({ content: [{ type: 'text', text: GUIDE }] }))

server.registerTool('validate', {
  title: 'Validate a project',
  description: 'Checks a project graph without simulating: schema errors, unknown node types, dangling edges, topology warnings (unconnected ports, multi-fed inputs). Cheap — call after building or editing a graph.',
  inputSchema: { project: projectParam },
}, async ({ project }) => {
  try {
    const { project: resolved, errors: exprErrors } = resolveProject(asCurrent(project))
    const v = validateProject(resolved)
    const nodes = toEditor(resolved).nodes
    return jsonResult({
      ok: exprErrors.length + v.errors.length === 0,
      errors: [...exprErrors, ...v.errors],
      warnings: Object.entries(v.warnings).flatMap(([id, ws]) => ws.map((w) => `${labelOf(nodes, id)}: ${w}`)),
      nodes: nodes.map((n) => `${n.id} [${n.type}] "${n.data.params.label}"`),
    })
  } catch (e) { return errResult(e) }
})

server.registerTool('simulate', {
  title: 'Simulate a project',
  description: 'Runs the full frequency sweep and returns key metrics (F3, tuning, Qtc, impedance peaks, peak SPL, excursion vs Xmax, max port air velocity, max power before Xmax), validation warnings, and downsampled SPL + impedance curves.',
  inputSchema: {
    project: projectParam,
    points: z.number().int().min(8).max(200).optional().describe('Curve downsample resolution (default 40)'),
  },
}, async ({ project, points }) => {
  try { return jsonResult(summarize(await run(project), points || 40)) } catch (e) { return errResult(e) }
})

server.registerTool('get_curve', {
  title: 'Get one response curve',
  description: 'Returns a single quantity vs frequency as [Hz, value] pairs. Quantities: '
    + Object.entries(QUANTITIES).map(([k, q]) => `${k} (${q.label}${q.node ? '; requires node' : ''})`).join(', ')
    + '. Extrema samples are always included.',
  inputSchema: {
    project: projectParam,
    quantity: z.enum(Object.keys(QUANTITIES)),
    node: z.string().optional().describe('Node id or label, for per-node quantities (velocity, spl_port, excursion_driver)'),
    points: z.number().int().min(8).max(400).optional().describe('Downsample resolution (default 64)'),
    fmin: z.number().optional().describe('Window the output to >= this frequency'),
    fmax: z.number().optional().describe('Window the output to <= this frequency'),
  },
}, async ({ project, quantity, node, points, fmin, fmax }) => {
  try {
    const ctx = await run(project)
    if (!ctx.res.ok) return jsonResult(summarize(ctx))
    const q = QUANTITIES[quantity]
    let nodeId = null
    if (q.node) {
      if (!node) throw new Error(`"${quantity}" needs a node (id or label) of type ${q.node.join('/')}.`)
      nodeId = resolveNode(ctx.nodes, node, q.node).id
    }
    const arr = q.get(ctx.res, nodeId)
    if (!arr) throw new Error(`No ${quantity} data for node "${node}".`)
    return jsonResult({
      quantity: q.label,
      node: nodeId ? labelOf(ctx.nodes, nodeId) : undefined,
      data: downsample(ctx.res.freqs, arr, points || 64, fmin, fmax),
    })
  } catch (e) { return errResult(e) }
})

server.registerTool('sweep_parameter', {
  title: 'Sweep one parameter',
  description: 'Re-simulates the project across a range of one node parameter (e.g. waveguide length) or one setting (e.g. voltage) and tabulates key metrics per value: F3, tuning, passband level, peak SPL, max excursion, max port velocity. Use this for tuning instead of calling simulate in a loop.',
  inputSchema: {
    project: projectParam,
    node: z.string().optional().describe('Node id or label to vary. Omit to vary a global setting.'),
    param: z.string().describe('Parameter name on the node (e.g. length, volume, S1) or setting (e.g. voltage) when node is omitted'),
    values: z.array(z.number()).max(MAX_SWEEP_STEPS).optional().describe('Explicit values to test'),
    from: z.number().optional(), to: z.number().optional(),
    steps: z.number().int().min(2).max(MAX_SWEEP_STEPS).optional().describe(`Grid size for from/to (default 9, max ${MAX_SWEEP_STEPS})`),
    log: z.boolean().optional().describe('Log-spaced grid (default linear)'),
  },
}, async ({ project, node, param, values, from, to, steps, log }) => {
  try {
    let grid = values
    if (!grid) {
      if (from == null || to == null) throw new Error('Provide either values[] or from/to.')
      const n = steps || 9
      grid = Array.from({ length: n }, (_, k) =>
        log ? Math.exp(Math.log(from) + ((Math.log(to) - Math.log(from)) * k) / (n - 1))
          : from + ((to - from) * k) / (n - 1))
    }
    // resolve the node reference once against the hydrated graph
    let nodeId = null
    if (node) nodeId = resolveNode(toEditor(asCurrent(project)).nodes, node).id
    const base = withSettings(project)
    const rows = []
    for (const v of grid) rows.push(await (async () => {
      const p = structuredClone(base)
      if (nodeId) {
        const target = p.nodes.find((n) => n.id === nodeId)
        target.params = { ...(target.params || {}), [param]: v }
      } else {
        p.settings = { ...(p.settings || {}), [param]: v }
      }
      let ctx
      try { ctx = await run(p) } catch (e) { return { value: sig(v), error: e.message } }
      if (!ctx.res.ok) return { value: sig(v), error: ctx.res.validation?.errors?.join('; ') || 'simulation failed' }
      const m = ctx.metrics || {}
      let vmax = 0
      for (const arr of Object.values(ctx.res.velocity)) for (const x of arr) if (x > vmax) vmax = x
      return {
        value: sig(v),
        f3_hz: sig(m.f3), fb_hz: sig(m.fb ?? m.fc), passband_db: sig(m.passband),
        peak_spl_db: sig(m.peakSPL), max_excursion_mm: sig(m.xPeak),
        max_port_velocity_ms: vmax > 0.01 ? sig(vmax) : null,
        max_power_before_xmax_w: sig(m.maxPower),
      }
    })())
    return jsonResult({
      swept: nodeId ? `node ${nodeId} param "${param}"` : `setting "${param}"`,
      rows,
    })
  } catch (e) { return errResult(e) }
})

// ---------- phase 2: driver DB, builders, optimizer, compare ----------

server.registerTool('driver_fields', {
  title: 'Describe the driver record schema',
  description: 'Lists every parameter a driver library record can carry: the core T/S set the solver runs on, and the extended catalog parameters (power handling, sensitivity, voice coil and motor construction, recommended enclosure) that some manufacturers publish and others do not. Use it to discover what driver_search can filter on.',
  inputSchema: {},
}, async () => {
  try {
    return jsonResult({
      core: CORE_FIELDS.map((f) => ({ key: f.key, label: f.label, unit: f.unit, usedBySolver: !!f.solver })),
      extended: EXT_FIELDS.map((f) => ({
        key: f.key, group: f.group, label: f.label, unit: f.unit, type: f.type, desc: f.desc,
        populated: POPULATED_EXT_KEYS.includes(f.key),
      })),
      brands: DRIVER_BRANDS,
      sources: SOURCE_LABELS,
      note: 'Extended fields are sparse — check for null. Only fields marked populated appear anywhere in the current library.',
    })
  } catch (e) { return errResult(e) }
})

server.registerTool('driver_search', {
  title: 'Search the driver library',
  description: 'Searches the built-in T/S driver library (pro audio woofers, car audio subwoofers, hi-fi drivers). Returns parameter sets usable directly as driver node params or as build_enclosure driver.db references. Call driver_fields first to see what extended parameters are available to filter on.',
  inputSchema: {
    query: z.string().optional().describe('Substring of brand/model, e.g. "sundown", "18SW115"'),
    brand: z.string().optional().describe('Exact brand, e.g. "B&C"'),
    source: z.enum(['official', 'datasheet']).optional()
      .describe('"official" = imported from the manufacturer\'s own catalog export; "datasheet" = hand transcribed, less reliable'),
    fs_min: z.number().optional().describe('Only drivers with Fs at or above this, Hz'),
    fs_max: z.number().optional().describe('Only drivers with Fs at or below this, Hz'),
    xmax_min: z.number().optional().describe('Only drivers with Xmax at or above this, mm'),
    sd_min: z.number().optional().describe('Minimum cone area, cm² (a 12" is ~480, 15" ~810, 18" ~1140)'),
    sd_max: z.number().optional(),
    ext: z.record(z.string(), z.any()).optional().describe(
      'Extended-parameter filters keyed as in driver_fields. Numbers take { min, max }, '
      + 'text takes a substring: { pNom: { min: 1000 }, magnet: "Neodymium" }'),
    detail: z.enum(['core', 'full']).optional()
      .describe('"core" (default) returns the T/S set only; "full" adds every extended parameter'),
    limit: z.number().optional().describe('Cap the number of drivers returned (default 60)'),
  },
}, async ({ detail, limit, ...filters }) => {
  try {
    const rows = searchDrivers(filters)
    const capped = rows.slice(0, limit ?? 60)
    return jsonResult({
      count: rows.length,
      returned: capped.length,
      truncated: capped.length < rows.length
        ? 'Narrow the filters or raise limit to see the rest.' : undefined,
      units: 'Fs Hz, Vas L, Re ohm, Bl T·m, Mms g, Cms mm/N, Sd cm², Le mH, Xmax mm',
      drivers: capped.map((d) => {
        const { brand, model, ext, source, suspect, name, ...ts } = d
        return {
          name, source, ...ts,
          ...(detail === 'full' ? { ext } : {}),
          ...(suspect ? { suspect } : {}),
        }
      }),
      note: 'source "official" rows come from a manufacturer catalog export; "datasheet" rows are hand transcribed and approximate. A "suspect" field means the row\'s published Qes/Qts/Vas disagree with its own Bl/Re/Mms/Cms — the simulation follows the latter.',
    })
  } catch (e) { return errResult(e) }
})

const driverSpec = z.record(z.string(), z.any()).describe(
  'Driver spec: { db: "UM18" } to use a library driver (see driver_search), and/or explicit T/S params '
  + '(Fs, Qes, Qms, Vas, Re, Bl, Mms, Cms, Sd, Le, Xmax — explicit values override the library). '
  + 'Plus count (drivers in the box) and wiring: series|parallel|series-parallel.',
)

server.registerTool('build_enclosure', {
  title: 'Build an enclosure project',
  description: 'Generates a valid, simulated project for a standard topology. Ported and 4th-order bandpass boxes are auto-calibrated: the port length is bisected until the SIMULATED tuning matches your target (end corrections included), so the returned tuning is real, not textbook-approximate. Returns the project JSON (editable, works with all other tools and the visual editor) plus a simulation summary.',
  inputSchema: {
    topology: z.enum(['sealed', 'ported', 'bandpass4', 'bandpass6']),
    driver: driverSpec,
    volume: z.number().optional().describe('Box volume L (sealed/ported)'),
    front_volume: z.number().optional().describe('Front chamber L (bandpass)'),
    rear_volume: z.number().optional().describe('Rear chamber L (bandpass)'),
    tuning: z.number().optional().describe('Target tuning Hz (ported/bandpass4). Calibrated automatically.'),
    front_tuning: z.number().optional().describe('Front chamber tuning Hz (bandpass6, analytic guess — refine with sweep/optimize)'),
    rear_tuning: z.number().optional().describe('Rear chamber tuning Hz (bandpass6)'),
    port_area: z.number().optional().describe('Port cross-section cm² per port (default ≈ total Sd/4)'),
    port_length: z.number().optional().describe('Fix the port length cm instead of giving a tuning'),
    port_count: z.number().int().min(1).max(4).optional().describe('Split the port into N identical ports (ported only)'),
    voltage: z.number().optional().describe('Drive level V RMS (default 2.83)'),
    name: z.string().optional(),
  },
}, async (args) => {
  try {
    const { topology, voltage, ...rest } = args
    /**
   * Assert that an optional argument was supplied.
   *
   * @param {string} k - Argument name.
   * @returns {void}
   * @throws {Error} When the argument is missing, naming it so the agent can retry correctly.
   * @reads the enclosing tool arguments.
   */
  const need = (k) => { if (rest[k] == null) throw new Error(`"${topology}" needs ${k}.`) }
    if (topology === 'sealed' || topology === 'ported') need('volume')
    if (topology === 'bandpass4' || topology === 'bandpass6') { need('front_volume'); need('rear_volume') }
    const settings = voltage ? { voltage } : {}
    const { project, ports, notes } = BUILDERS[topology]({ ...rest, settings })
    const calibration = {}
    /**
   * Simulate a project and report its tuning, for port calibration.
   *
   * @param {object} p - The project to simulate.
   * @returns {Promise<number|null>} Tuning in Hz — the vented `fb` — or `null` when the simulation failed.
   * @sideEffect Runs the solver.
   */
  const simFb = async (p) => {
    try { const c = await run(p); return c.res.ok ? (c.metrics?.fb ?? null) : null } catch { return null }
  }
    if (rest.tuning && !rest.port_length && (topology === 'ported' || topology === 'bandpass4')) {
      for (const pid of ports) {
        const L = await calibratePort(project, pid, rest.tuning, simFb)
        calibration[pid] = `length ${L} cm → simulated fb ${sig(await simFb(project))} Hz (target ${rest.tuning})`
      }
    }
    return jsonResult({
      notes, calibration: Object.keys(calibration).length ? calibration : undefined,
      summary: summarize(await run(project), 30),
      project,
    })
  } catch (e) { return errResult(e) }
})

// Objective scoring for optimize. Higher = better; constraints are penalties.
/**
 * Sweep indices falling inside a frequency band.
 *
 * @param {number[]} freqs - Frequency axis, Hz.
 * @param {[number, number]} band - Band as `[f1, f2]` Hz.
 * @returns {number[]} Indices inside the band, ascending.
 * @throws {Error} When fewer than three points fall in the band — averaging SPL over one or two samples would produce a confident number from almost no data, so this refuses rather than misleading the optimizer.
 * @pure
 */
function bandIndices(freqs, band) {
  const [f1, f2] = band
  const idx = []
  for (let i = 0; i < freqs.length; i++) if (freqs[i] >= f1 && freqs[i] <= f2) idx.push(i)
  if (idx.length < 3) throw new Error(`Band ${f1}-${f2} Hz covers too few sweep points; widen it or the sweep.`)
  return idx
}

/**
 * Build the objective function the optimizer maximizes.
 *
 * Three objectives: `min_f3` maximizes the negated F3, `max_spl` the mean
 * level across the band, and `flat` the mean minus four times the standard
 * deviation — which trades roughly 4 dB of level for each 1 dB of ripple
 * removed, and is what makes "flat" prefer a smooth response over a loud
 * lumpy one.
 *
 * Constraints are penalties, not hard limits, and are scaled by how far
 * they are exceeded. A design 10% over Xmax loses 3 points rather than
 * being discarded, so the search can still traverse a slightly-invalid
 * region on its way to a better answer instead of being walled off from it.
 *
 * A project that fails to simulate scores −1e9, which is low enough never
 * to win but finite, so it does not poison comparisons.
 *
 * @param {object} spec - Objective spec.
 * @param {'min_f3'|'max_spl'|'flat'} spec.objective - What to maximize.
 * @param {[number, number]} [spec.band] - Frequency band, required for `max_spl` and `flat`.
 * @param {object} [spec.constraints={}] - Penalty settings.
 * @param {number} [spec.constraints.max_port_velocity_ms] - Penalize peak port velocity above this.
 * @param {number} [spec.constraints.max_excursion_mm] - Excursion limit; defaults to each driver's own Xmax.
 * @param {boolean} [spec.constraints.respect_xmax] - Set false to drop the excursion penalty entirely.
 * @returns {(project: object) => Promise<number>} A scoring function; higher is better.
 * @sideEffect The returned function runs a full simulation on every call.
 */
function makeScore({ objective, band, constraints = {} }) {
  return async (projRaw) => {
    let ctx
    try { ctx = await run(projRaw) } catch { return -1e9 }
    if (!ctx.res.ok) return -1e9
    const { res, metrics, nodes } = ctx
    let s
    if (objective === 'min_f3') {
      s = metrics?.f3 ? -metrics.f3 : -1e6
    } else {
      const idx = bandIndices(res.freqs, band)
      const vals = idx.map((i) => res.splCombined[i]).filter((v) => isFinite(v))
      const mean = vals.reduce((a, b) => a + b, 0) / vals.length
      if (objective === 'max_spl') s = mean
      else { // flat
        const sd = Math.sqrt(vals.reduce((a, b) => a + (b - mean) ** 2, 0) / vals.length)
        s = mean - 4 * sd
      }
    }
    const vLimit = constraints.max_port_velocity_ms
    if (vLimit) {
      let vmax = 0
      for (const arr of Object.values(res.velocity)) for (const v of arr) if (v > vmax) vmax = v
      if (vmax > vLimit) s -= 30 * (vmax / vLimit - 1)
    }
    if (constraints.respect_xmax !== false) {
      for (const [did, arr] of Object.entries(res.excursionByDriver)) {
        const xmax = constraints.max_excursion_mm || nodes.find((n) => n.id === did)?.data.params.Xmax
        if (!xmax) continue
        let xm = 0
        for (const x of arr) if (x > xm) xm = x
        if (xm > xmax) s -= 30 * (xm / xmax - 1)
      }
    }
    return s
  }
}

server.registerTool('optimize', {
  title: 'Optimize parameters against a goal',
  description: 'Server-side optimizer: varies up to 3 node parameters or settings within bounds to maximize an objective, with excursion-vs-Xmax and port-velocity constraints applied as penalties. Uses coordinate grid refinement (~100-300 simulations). Returns the best values, the optimized project JSON, and its simulation summary. Objectives: min_f3 (lowest F3), max_spl (highest mean SPL over band), flat (mean SPL minus 4× ripple over band).',
  inputSchema: {
    project: projectParam,
    params: z.array(z.object({
      node: z.string().optional().describe('Node id or label; omit to vary a global setting'),
      param: z.string().describe('e.g. length, volume, S1 — or voltage when node is omitted'),
      min: z.number(), max: z.number(),
    })).min(1).max(3),
    objective: z.enum(['min_f3', 'max_spl', 'flat']),
    band: z.tuple([z.number(), z.number()]).optional().describe('Frequency band [f1, f2] Hz — required for max_spl and flat'),
    max_port_velocity_ms: z.number().optional().describe('Penalize designs whose peak port air velocity exceeds this (17 is a good default at full power)'),
    max_excursion_mm: z.number().optional().describe('Excursion limit; defaults to each driver\'s Xmax'),
    respect_xmax: z.boolean().optional().describe('Set false to disable the excursion penalty'),
    rounds: z.number().int().min(1).max(4).optional(),
    grid: z.number().int().min(5).max(13).optional().describe('Grid points per parameter per round (default 9)'),
  },
}, async ({ project, params, objective, band, rounds, grid, ...constraints }) => {
  try {
    if ((objective === 'max_spl' || objective === 'flat') && !band) {
      throw new Error(`Objective "${objective}" needs a band [f1, f2].`)
    }
    const nodes = toEditor(asCurrent(project)).nodes
    const resolved = params.map((prm) => ({
      ...prm, node: prm.node ? resolveNode(nodes, prm.node).id : undefined,
    }))
    const score = makeScore({ objective, band, constraints })
    const start = withSettings(project)
    const before = await score(start)
    const { best, bestScore, evals, values } = await optimizeProject(start, resolved, score,
      { rounds: rounds || 3, gridN: grid || 9 })
    return jsonResult({
      objective: band ? `${objective} over ${band[0]}-${band[1]} Hz` : objective,
      score_before: sig(before), score_after: sig(bestScore), simulations: evals,
      best_values: resolved.map((prm, i) => ({
        target: prm.node ? `${prm.node}.${prm.param}` : `settings.${prm.param}`,
        value: sig(values[i]),
      })),
      summary: summarize(await run(best), 30),
      project: best,
    })
  } catch (e) { return errResult(e) }
})

server.registerTool('compare', {
  title: 'Compare designs',
  description: 'Simulates 2-6 projects and tabulates their metrics side by side (F3, tuning, passband, peak SPL, excursion, port velocity, max power before Xmax). Give each project a distinct "name" field.',
  inputSchema: {
    projects: z.array(projectParam).min(2).max(6),
  },
}, async ({ projects }) => {
  try {
    const rows = []
    for (const [i, proj] of projects.entries()) rows.push(await (async () => {
      const name = proj.name || `design ${i + 1}`
      try {
        const ctx = await run(proj)
        if (!ctx.res.ok) return { name, error: ctx.res.validation?.errors?.join('; ') }
        let vmax = 0
        for (const arr of Object.values(ctx.res.velocity)) for (const v of arr) if (v > vmax) vmax = v
        return {
          name,
          ...metricsSummary(ctx.metrics),
          max_port_velocity: vmax > 0.01 ? `${sig(vmax)} m/s` : undefined,
        }
      } catch (e) { return { name, error: e.message } }
    })())
    return jsonResult({ comparison: rows })
  } catch (e) { return errResult(e) }
})

server.registerResource('design-guide', 'speakerspice://guide', {
  title: 'SpeakerSpice design guide',
  description: 'Project schema, node types, units, topology semantics',
  mimeType: 'text/markdown',
}, async () => ({ contents: [{ uri: 'speakerspice://guide', mimeType: 'text/markdown', text: GUIDE }] }))

return server
}

// Module-private functions, exposed for the contract test suite only
// (test/contract/*). Not part of this module's public API — application code
// must not import from here, and nothing outside the tests does.
export const __internals = { sig, labelOf, resolveNode, run, downsample, metricsSummary, summarize, jsonResult, errResult }
