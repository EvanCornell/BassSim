#!/usr/bin/env node
// AcouSim MCP server — exposes the simulation engine to AI agents over stdio.
// Run: node mcp/server.js   (see mcp/README.md for client configuration)
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'
import { runSimulation, validateGraph } from '../src/engine/solver.js'
import { computeMetrics } from '../src/engine/metrics.js'
import { hydrateProject } from '../src/engine/project.js'

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

server.registerResource('design-guide', 'acousim://guide', {
  title: 'AcouSim design guide',
  description: 'Project schema, node types, units, topology semantics',
  mimeType: 'text/markdown',
}, async () => ({ contents: [{ uri: 'acousim://guide', mimeType: 'text/markdown', text: GUIDE }] }))

await server.connect(new StdioServerTransport())
console.error('AcouSim MCP server ready (stdio)')
