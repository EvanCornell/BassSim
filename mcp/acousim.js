// AcouSim MCP server core: tool/resource registrations, transport-agnostic.
// Entry points: mcp/server.js (stdio) and mcp/http.js (streamable HTTP).
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { runSimulation, validateGraph } from '../src/engine/solver.js'
import { computeMetrics } from '../src/engine/metrics.js'
import { hydrateProject } from '../src/engine/project.js'
import { searchDrivers, BUILDERS, calibratePort, optimizeProject } from './builders.js'
import {
  CORE_FIELDS, EXT_FIELDS, POPULATED_EXT_KEYS, DRIVER_BRANDS, SOURCE_LABELS,
} from '../src/data/drivers.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const GUIDE = readFileSync(join(__dirname, 'guide.md'), 'utf8')

const MAX_NPTS = 1024
const MAX_SWEEP_STEPS = 41

// ---------- helpers ----------

const sig = (v, n = 4) => (v == null || !isFinite(v) ? null : Number(Number(v).toPrecision(n)))

function labelOf(nodes, id) {
  const n = nodes.find((x) => x.id === id)
  return n?.data.params.label ? `${n.data.params.label} (${id})` : id
}

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

function run(projRaw) {
  const { nodes, edges, settings } = hydrateProject(projRaw)
  settings.npts = Math.min(settings.npts || 512, MAX_NPTS)
  const res = runSimulation(nodes, edges, settings)
  const xmaxNode = nodes.find((n) => n.type === 'driver')
  const metrics = res.ok ? computeMetrics(res, { ...settings, xmax: xmaxNode?.data.params.Xmax }) : null
  return { nodes, edges, settings, res, metrics }
}

// Downsample a curve to ~points, always keeping the extremum sample.
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
  spl: { label: 'SPL combined, dB @ 1 m', get: (r) => r.splCombined },
  spl_driver: { label: 'SPL direct driver radiation, dB', get: (r) => r.splDriver },
  spl_port: { label: 'SPL of one radiator, dB', get: (r, id) => r.splPorts[id], node: ['waveguide', 'radiation', 'pr'] },
  impedance: { label: 'Electrical input impedance, ohm', get: (r) => r.zinMag },
  impedance_phase: { label: 'Impedance phase, deg', get: (r) => r.zinPhase },
  excursion: { label: 'Cone excursion (worst driver), mm peak', get: (r) => r.excursion },
  excursion_driver: { label: 'Cone excursion of one driver, mm peak', get: (r, id) => r.excursionByDriver[id], node: ['driver'] },
  velocity: { label: 'Air velocity in a waveguide, m/s peak', get: (r, id) => r.velocity[id], node: ['waveguide'] },
  spl_interior: { label: 'SPL inside a chamber, dB (virtual mic; set params.probe=true on the chamber, position via probePos 0-100%)', get: (r, id) => r.splInterior?.[id], node: ['chamber'] },
  acoustic_power: { label: 'Radiated acoustic power, W', get: (r) => r.power },
  electrical_power: { label: 'Electrical input power (real), W', get: (r) => r.peReal },
  apparent_power: { label: 'Electrical input power (apparent), VA', get: (r) => r.peApparent },
  efficiency: {
    label: 'Acoustic efficiency, %',
    get: (r) => r.freqs.map((_, i) => (r.peReal[i] > 1e-9 ? (r.power[i] / r.peReal[i]) * 100 : null)),
  },
  phase: { label: 'Unwrapped phase, deg', get: (r) => r.phaseUnwrapped },
  group_delay: { label: 'Group delay, ms', get: (r) => r.groupDelay },
}

function metricsSummary(metrics) {
  if (!metrics) return null
  const m = {}
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

const jsonResult = (obj) => ({ content: [{ type: 'text', text: JSON.stringify(obj, null, 1) }] })
const errResult = (e) => ({ isError: true, content: [{ type: 'text', text: `Error: ${e.message}` }] })

// ---------- server ----------

export function createServer() {
const server = new McpServer(
  { name: 'acousim', version: '0.1.0' },
  {
    instructions:
      'AcouSim: loudspeaker enclosure simulation via acoustic transfer matrices. '
      + 'Projects are JSON node graphs (drivers, chambers, waveguides, passive radiators, radiation terminations) '
      + 'compatible with the AcouSim visual editor. Read the design_guide tool/resource FIRST — it documents the '
      + 'schema, units, and topology semantics. Typical flow: build project JSON → validate → simulate → '
      + 'sweep_parameter to tune → report metrics (F3, tuning, port velocity, excursion vs Xmax) against the user\'s goals.',
  },
)

const projectParam = z.record(z.string(), z.any()).describe(
  'AcouSim project JSON: { settings, nodes: [{id, type, params}], edges: [{source, sourceHandle, target, targetHandle}] }. See design_guide.',
)

server.registerTool('design_guide', {
  title: 'AcouSim design guide',
  description: 'Returns the modeling guide: project JSON schema, node types with params and units, topology semantics, and design workflow. Call this before building your first project.',
  inputSchema: {},
}, async () => ({ content: [{ type: 'text', text: GUIDE }] }))

server.registerTool('validate', {
  title: 'Validate a project',
  description: 'Checks a project graph without simulating: schema errors, unknown node types, dangling edges, topology warnings (unconnected ports, multi-fed inputs). Cheap — call after building or editing a graph.',
  inputSchema: { project: projectParam },
}, async ({ project }) => {
  try {
    const { nodes, edges } = hydrateProject(project)
    const v = validateGraph(nodes, edges)
    return jsonResult({
      ok: v.errors.length === 0,
      errors: v.errors,
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
  try { return jsonResult(summarize(run(project), points || 40)) } catch (e) { return errResult(e) }
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
    const ctx = run(project)
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
    if (node) {
      const { nodes } = hydrateProject(project)
      nodeId = resolveNode(nodes, node).id
    }
    const rows = grid.map((v) => {
      const p = structuredClone(project)
      if (nodeId) {
        const target = p.nodes.find((n) => n.id === nodeId)
        target.params = { ...(target.params || {}), [param]: v }
      } else {
        p.settings = { ...(p.settings || {}), [param]: v }
      }
      const ctx = run(p)
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
    })
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
    const need = (k) => { if (rest[k] == null) throw new Error(`"${topology}" needs ${k}.`) }
    if (topology === 'sealed' || topology === 'ported') need('volume')
    if (topology === 'bandpass4' || topology === 'bandpass6') { need('front_volume'); need('rear_volume') }
    const settings = voltage ? { voltage } : {}
    const { project, ports, notes } = BUILDERS[topology]({ ...rest, settings })
    const calibration = {}
    const simFb = (p) => { const c = run(p); return c.res.ok ? (c.metrics?.fb ?? null) : null }
    if (rest.tuning && !rest.port_length && (topology === 'ported' || topology === 'bandpass4')) {
      for (const pid of ports) {
        const L = calibratePort(project, pid, rest.tuning, simFb)
        calibration[pid] = `length ${L} cm → simulated fb ${sig(simFb(project))} Hz (target ${rest.tuning})`
      }
    }
    return jsonResult({
      notes, calibration: Object.keys(calibration).length ? calibration : undefined,
      summary: summarize(run(project), 30),
      project,
    })
  } catch (e) { return errResult(e) }
})

// Objective scoring for optimize. Higher = better; constraints are penalties.
function bandIndices(freqs, band) {
  const [f1, f2] = band
  const idx = []
  for (let i = 0; i < freqs.length; i++) if (freqs[i] >= f1 && freqs[i] <= f2) idx.push(i)
  if (idx.length < 3) throw new Error(`Band ${f1}-${f2} Hz covers too few sweep points; widen it or the sweep.`)
  return idx
}

function makeScore({ objective, band, constraints = {} }) {
  return (projRaw) => {
    let ctx
    try { ctx = run(projRaw) } catch { return -1e9 }
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
    const { nodes } = hydrateProject(project)
    const resolved = params.map((prm) => ({
      ...prm, node: prm.node ? resolveNode(nodes, prm.node).id : undefined,
    }))
    const score = makeScore({ objective, band, constraints })
    const before = score(project)
    const { best, bestScore, evals, values } = optimizeProject(project, resolved, score,
      { rounds: rounds || 3, gridN: grid || 9 })
    return jsonResult({
      objective: band ? `${objective} over ${band[0]}-${band[1]} Hz` : objective,
      score_before: sig(before), score_after: sig(bestScore), simulations: evals,
      best_values: resolved.map((prm, i) => ({
        target: prm.node ? `${prm.node}.${prm.param}` : `settings.${prm.param}`,
        value: sig(values[i]),
      })),
      summary: summarize(run(best), 30),
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
    const rows = projects.map((proj, i) => {
      const name = proj.name || `design ${i + 1}`
      try {
        const ctx = run(proj)
        if (!ctx.res.ok) return { name, error: ctx.res.validation?.errors?.join('; ') }
        let vmax = 0
        for (const arr of Object.values(ctx.res.velocity)) for (const v of arr) if (v > vmax) vmax = v
        return {
          name,
          ...metricsSummary(ctx.metrics),
          max_port_velocity: vmax > 0.01 ? `${sig(vmax)} m/s` : undefined,
        }
      } catch (e) { return { name, error: e.message } }
    })
    return jsonResult({ comparison: rows })
  } catch (e) { return errResult(e) }
})

server.registerResource('design-guide', 'acousim://guide', {
  title: 'AcouSim design guide',
  description: 'Project schema, node types, units, topology semantics',
  mimeType: 'text/markdown',
}, async () => ({ contents: [{ uri: 'acousim://guide', mimeType: 'text/markdown', text: GUIDE }] }))

return server
}
