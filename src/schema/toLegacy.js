// Translate a v3 project into the form the legacy solver reads.
//
// The legacy engine (`src/engine/solver.js`) walks the graph as a tree from
// each driver, so it only understands directed edges from an output handle to
// an input handle, one drive voltage, and per-element `Q`. Anything a v3
// project can say that it cannot is refused here with a message pointing at
// the SPICE engine, rather than being quietly approximated.

import { driverChannels } from './validate.js'

/** Handles the legacy engine treats as outputs, by node type. */
const LEGACY_OUT = { driver: ['front', 'rear'], chamber: ['out'], waveguide: ['mouth'] }
/** Handles the legacy engine treats as inputs, by node type. */
const LEGACY_IN = { chamber: ['in'], waveguide: ['throat'], pr: ['in'], radiation: ['in'] }

/**
 * Map a v3 handle to its legacy name.
 *
 * @param {object} node - The node the handle belongs to.
 * @param {string} handle - The v3 handle.
 * @returns {string} The legacy handle name.
 * @pure
 */
const legacyHandle = (node, handle) => (node.type === 'pr' && handle === 'rear' ? 'in' : handle)

/**
 * Orient one undirected v3 edge the way the legacy engine needs it.
 *
 * @param {object} a - One end's node.
 * @param {string} ha - That end's handle, legacy-named.
 * @param {object} b - The other end's node.
 * @param {string} hb - That end's handle, legacy-named.
 * @returns {object|null} `{source, sourceHandle, target, targetHandle}`, or `null` when neither orientation is a legacy output-to-input edge.
 * @pure
 */
function orient(a, ha, b, hb) {
  /**
   * Whether a handle is a legacy output.
   *
   * @param {object} n - Node.
   * @param {string} h - Legacy handle name.
   * @returns {boolean} True for an output.
   * @pure
   */
  const out = (n, h) => (LEGACY_OUT[n.type] || []).includes(h)
  /**
   * Whether a handle is a legacy input.
   *
   * @param {object} n - Node.
   * @param {string} h - Legacy handle name.
   * @returns {boolean} True for an input.
   * @pure
   */
  const inp = (n, h) => (LEGACY_IN[n.type] || []).includes(h)
  if (out(a, ha) && inp(b, hb)) return { source: a.id, sourceHandle: ha, target: b.id, targetHandle: hb }
  if (out(b, hb) && inp(a, ha)) return { source: b.id, sourceHandle: hb, target: a.id, targetHandle: ha }
  return null
}

/**
 * Convert a resolved v3 project into the legacy serialized form.
 *
 * @param {object} proj - A v3 project with expressions resolved.
 * @returns {{nodes: object[], edges: object[], settings: object}} The legacy project, ready for `hydrateProject`.
 * @throws {Error} When the project uses anything the legacy engine cannot represent. Every reason is on the error's `projectErrors` property.
 * @post proj is not modified
 * @pure
 */
export function toLegacy(proj) {
  const why = []
  /**
   * Record a reason the legacy engine cannot run this project.
   *
   * @param {string} msg - What it cannot represent.
   * @returns {void}
   * @mutates the enclosing `why` list.
   */
  const need = (msg) => { why.push(`${msg} — this needs the SPICE engine (Settings → Engine).`) }
  const byId = new Map((proj.nodes || []).map((n) => [n.id, n]))

  const edges = []
  const prFrontUsed = new Set()
  for (const e of proj.edges || []) {
    const a = byId.get(e.source)
    const b = byId.get(e.target)
    if (!a || !b) continue
    if (e.sourceHandle.startsWith('tap:') || e.targetHandle.startsWith('tap:')) { need('A tap is connected'); continue }
    if (a.type === 'pr' && e.sourceHandle === 'front') prFrontUsed.add(a.id)
    if (b.type === 'pr' && e.targetHandle === 'front') prFrontUsed.add(b.id)
    const o = orient(a, legacyHandle(a, e.sourceHandle), b, legacyHandle(b, e.targetHandle))
    if (!o) { need(`${a.params?.label || a.id} ${e.sourceHandle} ↔ ${b.params?.label || b.id} ${e.targetHandle} is not an output-to-input connection`); continue }
    edges.push({ id: e.id, ...o })
  }
  for (const id of prFrontUsed) need(`${byId.get(id).params?.label || id} has its front face connected`)

  // One analysis, one channel, no DSP.
  const analysis = (proj.analyses || []).find((a) => a.type === 'ac')
  if (!analysis) need('There is no frequency sweep')
  const channels = proj.wiring?.channels || []
  const driven = driverChannels(proj)
  const drivers = (proj.nodes || []).filter((n) => n.type === 'driver')
  const used = new Set(driven.values())
  if (used.size > 1) need('Drivers are wired to more than one channel')
  if (drivers.some((d) => !driven.has(d.id))) need('A driver is not wired to any channel')
  const ch = channels.find((c) => used.has(c.id)) || channels[0] || { volts: 2.83, outputOhms: 0 }
  if (ch.load && (!Array.isArray(ch.load.parallel) || ch.load.parallel.some((t) => !t.driver))) {
    need(`${ch.label || ch.id} wires drivers in series`)
  }
  const dsp = ch.dsp || {}
  if ((dsp.polarity ?? 1) !== 1 || Number(dsp.delayMs) || (dsp.filters || []).length) need(`${ch.label || ch.id} uses DSP`)
  if (drivers.some((d) => d.params?.dvc)) need('A driver uses dual voice coil options')

  // Probes: only one pressure probe per chamber, which the legacy engine keeps on the node.
  const probeAt = new Map()
  for (const p of proj.probes || []) {
    const n = byId.get(p.at?.node)
    if (p.kind !== 'pressure' || n?.type !== 'chamber' || p.at.position == null || probeAt.has(n.id)) {
      need(`Probe ${p.label || p.id} is not a single pressure probe inside a chamber`)
      continue
    }
    probeAt.set(n.id, p.at.position)
  }

  const nodes = (proj.nodes || []).map((n) => {
    const p = { ...n.params }
    if (n.type === 'waveguide') {
      p.space = p.mouthSpace
      p.lossless = !(Number(p.loss) > 0)
      p.Q = p.lossless ? 50 : 50 / Number(p.loss)
    } else if (n.type === 'chamber') {
      p.lossless = !(Number(p.leakQL) > 0)
      p.Q = p.lossless ? 50 : Number(p.leakQL)
      if (probeAt.has(n.id)) {
        p.probe = true
        p.probePos = Math.min(Math.max((probeAt.get(n.id) / Number(p.length)) * 100, 0), 100)
      }
    } else if (n.type === 'driver') {
      p.Q = 50; p.lossless = true
    } else if (n.type === 'pr') {
      p.Q = 50; p.lossless = true; p.space = 'half'
      if (Number(p.count) > 1) need(`${p.label || n.id} has a count above one`)
    }
    return { id: n.id, type: n.type, position: n.position, params: p }
  })

  if (why.length) {
    const err = new Error(why.join('; '))
    err.projectErrors = why
    throw err
  }
  const d = proj.display || {}
  const volts = Number(ch.volts) * Math.pow(10, (Number(proj.wiring?.masterDb) || 0) / 20)
  const settings = {
    fmin: analysis.fmin, fmax: analysis.fmax, npts: analysis.npts,
    masking: !!analysis.masking, nlEnabled: !!analysis.nlEnabled,
    voltage: volts, rg: Number(ch.outputOhms) || 0,
    impedance: d.nominalOhms, power: (volts * volts) / (Number(d.nominalOhms) || 4),
    vThreshold: d.vThreshold, unwrapPhase: d.unwrapPhase, delayOffset: d.delayOffset,
  }
  return { nodes, edges, settings }
}
