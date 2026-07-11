// Project (.acousim.json) schema helpers shared by the app and the MCP server.
// A project is plain JSON: { name, settings, nodes: [{id,type,position,params}],
// edges: [{source,sourceHandle,target,targetHandle}] }.

export const SCHEMA_VERSION = 1

export const DEFAULT_PARAMS = {
  driver: {
    Fs: 30, Qts: 0.45, Qes: 0.5, Qms: 5, Vas: 60, Re: 3.6, Bl: 15, Mms: 150,
    Cms: 0.19, Sd: 480, Le: 1.5, LeExp: 1, Xmax: 15, Rms: 4,
    count: 1, wiring: 'single', Q: 50, lossless: true, label: 'Driver',
  },
  chamber: { volume: 30, length: 40, shape: 'rectangular', stuffing: 0, Q: 50, lossless: false, probe: false, probePos: 100, label: 'Chamber' },
  waveguide: { S1: 80, S2: 80, length: 30, flare: 'conical', ecFactor: 0.732, Q: 50, lossless: false, label: 'Port' },
  pr: { Mmd: 85, Cms: 0.35, Rms: 3, Sd: 480, addedMass: 0, Q: 50, lossless: false, space: 'half', label: 'Passive Radiator' },
  radiation: { space: 'half', label: 'Radiation' },
}

export const DEFAULT_SETTINGS = {
  fmin: 10, fmax: 1000, npts: 512,
  voltage: 2.83, impedance: 4, power: 2, rg: 0,
  vThreshold: 17, masking: false, unwrapPhase: true, delayOffset: 0,
  nlEnabled: false,
}

// Serialized project → the {nodes, edges, settings} shape runSimulation expects.
// Unknown node types and missing params get defaults, same as the app's loader.
export function hydrateProject(proj) {
  const errors = []
  const nodes = (proj.nodes || []).map((n, i) => {
    if (!n.id) errors.push(`nodes[${i}] is missing "id"`)
    if (!DEFAULT_PARAMS[n.type]) errors.push(`nodes[${i}] (${n.id}) has unknown type "${n.type}"`)
    return {
      id: n.id, type: n.type,
      position: n.position || { x: 0, y: 0 },
      data: { params: { ...(DEFAULT_PARAMS[n.type] || {}), ...(n.params || {}) } },
    }
  })
  const ids = new Set(nodes.map((n) => n.id))
  const edges = (proj.edges || []).map((e, i) => {
    if (!ids.has(e.source)) errors.push(`edges[${i}] source "${e.source}" is not a node id`)
    if (!ids.has(e.target)) errors.push(`edges[${i}] target "${e.target}" is not a node id`)
    return { id: e.id || `e_${i}`, source: e.source, sourceHandle: e.sourceHandle, target: e.target, targetHandle: e.targetHandle }
  })
  const settings = { ...DEFAULT_SETTINGS, ...(proj.settings || {}) }
  if (errors.length) {
    const err = new Error(errors.join('; '))
    err.projectErrors = errors
    throw err
  }
  return { nodes, edges, settings }
}
