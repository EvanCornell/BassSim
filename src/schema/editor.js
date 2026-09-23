// The bridge between a v3 project file and the editor's working state.
//
// The editor still keeps a flat `settings` object for the controls it has
// today — sweep range, drive level, display options — and keeps a chamber's
// probe on the chamber node, where its form shows it. The file keeps those in
// `analyses`, `wiring`, `display` and `probes`. These two functions convert
// in each direction; everything the editor has no control for yet (named
// params, further channels, other probes, components) rides along untouched
// in `extras`, so a project round-trips through the editor without loss.

import { DEFAULT_ANALYSIS, DEFAULT_CHANNEL, DEFAULT_DISPLAY, SCHEMA_VERSION } from './version.js'

/**
 * Deep-copy plain JSON data.
 *
 * @param {*} v - A JSON-safe value.
 * @returns {*} An independent copy.
 * @pure
 */
const clone = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)))

/**
 * The linear gain a master level in dB applies.
 *
 * @param {number} db - Master level, dB.
 * @returns {number} The voltage ratio.
 * @pure
 */
const gain = (db) => Math.pow(10, (Number(db) || 0) / 20)

/**
 * Split a v3 project into the editor's working state.
 *
 * `settings.voltage` is the first channel's output at the current master
 * level — the drive the user actually sees. A chamber's first pressure probe
 * becomes its `probe`/`probePos` params; any other probe stays in `extras`.
 *
 * @param {object} proj - A complete v3 project (see `migrateProject`).
 * @returns {{name: string, nodes: object[], edges: object[], settings: object, extras: object}} Nodes in React Flow's shape (`{id, type, position, data: {params}}`), edges, the flat settings, and everything else.
 * @post proj is not modified
 * @pure
 */
export function toEditor(proj) {
  const analysis = proj.analyses?.[0] || DEFAULT_ANALYSIS
  const channel = proj.wiring?.channels?.[0] || DEFAULT_CHANNEL
  const display = { ...DEFAULT_DISPLAY, ...(proj.display || {}) }
  const lengths = new Map((proj.nodes || []).filter((n) => n.type === 'chamber').map((n) => [n.id, Number(n.params?.length)]))
  const chamberProbe = new Map()
  const otherProbes = []
  for (const p of proj.probes || []) {
    const id = p.at?.node
    if (p.kind === 'pressure' && lengths.has(id) && p.at.position != null && !chamberProbe.has(id) && !p.label) {
      chamberProbe.set(id, p.at.position)
    } else {
      otherProbes.push(clone(p))
    }
  }
  const nodes = (proj.nodes || []).map((n) => {
    const params = clone(n.params || {})
    if (n.type === 'chamber') {
      params.probe = chamberProbe.has(n.id)
      params.probePos = chamberProbe.has(n.id)
        ? Math.min(Math.max((Number(chamberProbe.get(n.id)) / lengths.get(n.id)) * 100, 0), 100)
        : 100
    }
    return { id: n.id, type: n.type, position: clone(n.position) || { x: 0, y: 0 }, data: { params } }
  })
  const voltage = Number(channel.volts) * gain(proj.wiring?.masterDb)
  const settings = {
    fmin: analysis.fmin, fmax: analysis.fmax, npts: analysis.npts,
    masking: !!analysis.masking, nlEnabled: !!analysis.nlEnabled,
    voltage, rg: Number(channel.outputOhms) || 0,
    impedance: display.nominalOhms, power: (voltage * voltage) / (Number(display.nominalOhms) || 4),
    vThreshold: display.vThreshold, unwrapPhase: display.unwrapPhase, delayOffset: display.delayOffset,
  }
  if (display.yScales) settings.yScales = clone(display.yScales)
  return {
    name: proj.name || '',
    nodes,
    edges: clone(proj.edges || []),
    settings,
    extras: {
      air: clone(proj.air),
      params: clone(proj.params || []),
      wiring: clone(proj.wiring),
      analyses: clone(proj.analyses || []),
      probes: otherProbes,
      components: clone(proj.components || []),
      display: clone(proj.display || {}),
    },
  }
}

/**
 * Assemble a v3 project from the editor's working state.
 *
 * The inverse of `toEditor`: the flat settings land back in the first
 * analysis, the first channel and the display section, and a probed chamber's
 * probe becomes an entry in `probes`.
 *
 * @param {object} state - The editor state.
 * @param {string} state.name - Project name.
 * @param {object[]} state.nodes - Nodes in React Flow's shape.
 * @param {object[]} state.edges - Edges.
 * @param {object} state.settings - The flat settings.
 * @param {object} [state.extras] - What `toEditor` set aside.
 * @returns {object} A v3 project, without the `modified` stamp.
 * @post state is not modified
 * @pure
 */
export function fromEditor({ name, nodes, edges, settings, extras = {} }) {
  const s = settings || {}
  const probes = []
  const outNodes = (nodes || []).map((n) => {
    const params = clone(n.data?.params || {})
    if (n.type === 'chamber') {
      if (params.probe) {
        const pos = Math.min(Math.max(Number(params.probePos ?? 100), 0), 100)
        probes.push({ id: `probe_${n.id}`, kind: 'pressure', at: { node: n.id, position: (pos / 100) * Number(params.length) } })
      }
      delete params.probe
      delete params.probePos
    }
    return { id: n.id, type: n.type, position: clone(n.position), params }
  })
  const analyses = clone(extras.analyses?.length ? extras.analyses : [DEFAULT_ANALYSIS])
  analyses[0] = {
    ...analyses[0],
    fmin: s.fmin ?? analyses[0].fmin, fmax: s.fmax ?? analyses[0].fmax, npts: s.npts ?? analyses[0].npts,
    masking: !!s.masking, nlEnabled: !!s.nlEnabled,
  }
  const wiring = clone(extras.wiring || { masterDb: 0, channels: [DEFAULT_CHANNEL] })
  if (!wiring.channels?.length) wiring.channels = [clone(DEFAULT_CHANNEL)]
  wiring.channels[0] = {
    ...wiring.channels[0],
    volts: Number(s.voltage ?? wiring.channels[0].volts) / gain(wiring.masterDb),
    outputOhms: Number(s.rg) || 0,
  }
  const display = {
    ...clone(extras.display || {}),
    vThreshold: s.vThreshold ?? DEFAULT_DISPLAY.vThreshold,
    unwrapPhase: s.unwrapPhase ?? DEFAULT_DISPLAY.unwrapPhase,
    delayOffset: s.delayOffset ?? DEFAULT_DISPLAY.delayOffset,
    nominalOhms: s.impedance ?? DEFAULT_DISPLAY.nominalOhms,
  }
  if (s.yScales) display.yScales = clone(s.yScales)
  else delete display.yScales
  return {
    schemaVersion: SCHEMA_VERSION,
    app: 'AcouSim',
    name: name || '',
    air: clone(extras.air),
    params: clone(extras.params || []),
    nodes: outNodes,
    edges: (edges || []).map((e) => ({ id: e.id, source: e.source, sourceHandle: e.sourceHandle, target: e.target, targetHandle: e.targetHandle })),
    wiring,
    analyses,
    probes: [...probes, ...clone(extras.probes || [])],
    components: clone(extras.components || []),
    display,
  }
}
