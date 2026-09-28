// Project (.speakerspice.json) schema helpers shared by the app and the MCP server.
// A project is plain JSON: { name, settings, nodes: [{id,type,position,params}],
// edges: [{source,sourceHandle,target,targetHandle}] }.

/**
 * Version of the `.speakerspice.json` project schema this build reads and writes.
 *
 * Bumped only for changes a loader cannot absorb by falling back to defaults.
 *
 * v2 changed what `ecFactor` means. It was a coefficient — the added length at
 * a port's mouth was `ecFactor · a`, applied whatever the mouth opened into.
 * End corrections are now derived from the junction, and `ecFactor` scales what
 * that comes to, so the neutral value is 1 rather than 0.732. `migrateParams`
 * rescales stored values so a project keeps the correction its author asked for
 * relative to the default.
 */
export const SCHEMA_VERSION = 2

/**
 * The `ecFactor` that used to mean "no adjustment".
 *
 * Every project written before v2 carries this unless its author changed it,
 * and it is the divisor that turns an old coefficient into a new multiplier.
 */
const LEGACY_EC_FACTOR = 0.732

/**
 * Default params for each node type, in display units.
 *
 * Doubles as the schema: `hydrateProject` treats a type absent from this map as
 * unknown, and every saved node is merged over its entry so a project written by
 * an older build gains any parameter added since.
 */
export const DEFAULT_PARAMS = {
  driver: {
    Fs: 30, Qts: 0.45, Qes: 0.5, Qms: 5, Vas: 60, Re: 3.6, Bl: 15, Mms: 150,
    Cms: 0.19, Sd: 480, Le: 1.5, LeExp: 1, Xmax: 15, Rms: 4,
    count: 1, wiring: 'single', Q: 50, lossless: true, label: 'Driver',
  },
  chamber: { volume: 30, length: 40, shape: 'rectangular', stuffing: 0, Q: 50, lossless: false, probe: false, probePos: 100, label: 'Chamber' },
  waveguide: { S1: 80, S2: 80, length: 30, flare: 'conical', ecFactor: 1, space: 'half', Q: 50, lossless: false, label: 'Port' },
  pr: { Mmd: 85, Cms: 0.35, Rms: 3, Sd: 480, addedMass: 0, Q: 50, lossless: false, space: 'half', label: 'Passive Radiator' },
  radiation: { space: 'half', label: 'Radiation' },
}

/**
 * Default sweep and display settings for a new project.
 *
 * `impedance` and `power` are UI conveniences linked to `voltage` by P = V²/Z;
 * the solver reads only `voltage`. The shipped defaults are rounded for
 * display — 2.83 V into 4 Ω is 2.002 W, published as 2 — so the identity holds
 * to within rounding here and exactly only after `setAmp` recomputes it.
 */
export const DEFAULT_SETTINGS = {
  fmin: 10, fmax: 1000, npts: 512,
  voltage: 2.83, impedance: 4, power: 2, rg: 0,
  vThreshold: 17, masking: false, unwrapPhase: true, delayOffset: 0,
  nlEnabled: false,
}

/**
 * Bring one node's saved params up to the current schema.
 *
 * Only `ecFactor` needs it so far, and only because the quantity changed
 * meaning rather than merely changing default. Before v2 it was the whole
 * correction — `ΔL = ecFactor · a` at the mouth, and nothing at the throat.
 * Now the geometry decides the correction and `ecFactor` scales it, so the old
 * shipped default of 0.732 is today's 1. Dividing by that default carries the
 * author's intent across: a port left alone comes out neutral, and one that had
 * been given twice the standard correction still has twice.
 *
 * Everything else survives on its own, since an unrecognised or missing param
 * falls back through `DEFAULT_PARAMS`.
 *
 * @param {string} type - Node type.
 * @param {object} params - The node's saved params, in display units.
 * @param {number} from - Schema version the project was written with.
 * @returns {object} The params to merge over the defaults; the same object when nothing needed changing.
 * @post params is not modified
 * @pure
 */
export function migrateParams(type, params, from) {
  if (from >= 2 || type !== 'waveguide' || params.ecFactor == null) return params
  const k = Number(params.ecFactor)
  if (!isFinite(k) || k < 0) return params
  return { ...params, ecFactor: k / LEGACY_EC_FACTOR }
}

/**
 * Turn a serialized project into the shape `runSimulation` expects.
 *
 * Missing params are filled from `DEFAULT_PARAMS`, so a project that specifies
 * only what matters — which is how the MCP tools and hand-written JSON tend to
 * arrive — hydrates into a complete graph. This mirrors the app's own loader, so
 * a file behaves identically whether opened in the editor or posted to the API.
 *
 * Structural problems are collected and reported together rather than thrown at
 * the first one, because a hand-edited file usually has more than one and fixing
 * them one round-trip at a time is miserable.
 *
 * @param {object} proj - A parsed `.speakerspice.json` project.
 * @param {Array<object>} [proj.nodes] - Serialized nodes, each `{id, type, position, params}`.
 * @param {Array<object>} [proj.edges] - Serialized edges. Missing ids are assigned positionally.
 * @param {object} [proj.settings] - Sweep settings, merged over `DEFAULT_SETTINGS`.
 * @returns {{nodes: Array<object>, edges: Array<object>, settings: object}} The hydrated graph. Nodes come back in the solver's shape — `{id, type, position, data: {params}}` — so params sit at `node.data.params`, not at `node.params` as they do in the serialized form.
 * @throws {Error} When a node lacks an id, a node has an unknown type, or an edge references a missing node. The full list is on the error's `projectErrors` property as well as its message.
 * @post proj is not modified — nodes and params are copied, not aliased.
 * @pure
 */
export function hydrateProject(proj) {
  const errors = []
  const from = Number(proj.schemaVersion) || 1
  const nodes = (proj.nodes || []).map((n, i) => {
    if (!n.id) errors.push(`nodes[${i}] is missing "id"`)
    if (!DEFAULT_PARAMS[n.type]) errors.push(`nodes[${i}] (${n.id}) has unknown type "${n.type}"`)
    return {
      id: n.id, type: n.type,
      position: n.position || { x: 0, y: 0 },
      data: { params: { ...(DEFAULT_PARAMS[n.type] || {}), ...migrateParams(n.type, n.params || {}, from) } },
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
