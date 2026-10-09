// Carry any saved project forward to the current format in one step.
//
// v1 and v2 files kept everything the engine needed in one flat `settings`
// object and gave every element a `Q`. v3 splits settings by purpose and
// replaces `Q` with loss that has a physical meaning per element. The rules,
// each chosen so an old project keeps doing what its author meant:
//
//   waveguide   `space` → `mouthSpace`; `Q` → `loss: 1` (the old value
//               described a frequency law that no longer exists); `lossless`
//               → `loss: 0`.
//   chamber     `Q` → `leakQL` with the same number, since that is how it has
//               been used; `lossless` → sealed. `probe`/`probePos` become a
//               pressure probe in `probes`.
//   driver, pr  any extra `Q` folds into `Rms` — Rms + 2π·Fs·Mms/Q — so the
//               mechanical damping is unchanged. A passive radiator's `in`
//               handle becomes `rear`; its front is left open, as before.
//   settings    sweep range, `masking` → one analysis; `voltage`
//               and `rg` → one channel; the rest → `display`.

import {
  SCHEMA_VERSION, DEFAULT_PARAMS, DEFAULT_ANALYSIS, DEFAULT_CHANNEL, DEFAULT_WIRING,
  DEFAULT_DISPLAY, DEFAULT_AIR,
} from './version.js'

/**
 * The `ecFactor` that meant "no adjustment" before v2.
 *
 * v2 made `ecFactor` a multiplier on a junction-derived correction; dividing
 * an old value by this carries its author's intent across.
 */
const LEGACY_EC_FACTOR = 0.732

/**
 * Deep-copy plain JSON data.
 *
 * @param {*} v - A JSON-safe value.
 * @returns {*} An independent copy.
 * @pure
 */
const clone = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)))

/**
 * Resonance of a passive radiator from its display-unit params.
 *
 * @param {object} p - Passive radiator params: `Mmd` and `addedMass` in g, `Cms` in mm/N.
 * @returns {number} Fs in Hz.
 * @pure
 */
function prFs(p) {
  const Mm = ((Number(p.Mmd) || 50) + (Number(p.addedMass) || 0)) * 1e-3
  const Cm = (Number(p.Cms) || 0.5) * 1e-3
  return 1 / (2 * Math.PI * Math.sqrt(Mm * Cm))
}

/**
 * Convert one node's params from the v1/v2 layout to v3.
 *
 * Params are converted in place on a copy; fields v3 no longer has are
 * removed so they cannot be mistaken for live settings later. A chamber's
 * probe is returned separately because v3 keeps probes at project level.
 *
 * @param {object} node - A serialized v1/v2 node: `{id, type, position, params}`.
 * @param {number} from - Schema version the file was written with.
 * @returns {{params: object, probe: object|null}} The v3 params, and a probe entry when the node was a probed chamber.
 * @post node is not modified
 * @pure
 */
function migrateNodeParams(node, from) {
  const p = { ...clone(node.params || {}) }
  let probe = null
  if (node.type === 'waveguide' && from < 2 && p.ecFactor != null) {
    const k = Number(p.ecFactor)
    if (isFinite(k) && k >= 0) p.ecFactor = k / LEGACY_EC_FACTOR
  }
  if (node.type === 'waveguide') {
    if (p.space != null) p.mouthSpace = p.space
    p.loss = p.lossless ? 0 : 1
    delete p.space; delete p.Q; delete p.lossless
  } else if (node.type === 'chamber') {
    // v2 defaulted chambers to lossy, Q 50.
    p.leakQL = p.lossless ? null : (Number(p.Q) > 0 ? Number(p.Q) : 50)
    if (p.probe) {
      const length = Number(p.length) || DEFAULT_PARAMS.chamber.length
      const pos = Math.min(Math.max(Number(p.probePos ?? 100), 0), 100)
      probe = {
        id: `probe_${node.id}`, kind: 'pressure',
        at: { node: node.id, position: (pos / 100) * length },
      }
    }
    delete p.Q; delete p.lossless; delete p.probe; delete p.probePos
  } else if (node.type === 'driver') {
    // v2 defaulted drivers to lossless, so only an explicit false adds loss.
    const Q = Number(p.Q ?? 50)
    if (p.lossless === false && Q > 0 && isFinite(Q)) {
      const Fs = Number(p.Fs ?? DEFAULT_PARAMS.driver.Fs)
      const Mms = Number(p.Mms ?? DEFAULT_PARAMS.driver.Mms) * 1e-3
      p.Rms = Number(p.Rms ?? DEFAULT_PARAMS.driver.Rms) + (2 * Math.PI * Fs * Mms) / Q
    }
    delete p.Q; delete p.lossless
  } else if (node.type === 'pr') {
    // v2 defaulted passive radiators to lossy, Q 50.
    const Q = Number(p.Q ?? 50)
    if (p.lossless !== true && Q > 0 && isFinite(Q)) {
      const merged = { ...DEFAULT_PARAMS.pr, ...p }
      const Mm = (Number(merged.Mmd) + (Number(merged.addedMass) || 0)) * 1e-3
      p.Rms = Number(merged.Rms) + (2 * Math.PI * prFs(merged) * Mm) / Q
    }
    delete p.Q; delete p.lossless; delete p.space
  }
  return { params: p, probe }
}

/**
 * Split a v1/v2 `settings` object into v3's analyses, wiring and display.
 *
 * @param {object} s - The old settings; missing fields take their old defaults.
 * @returns {{analyses: object[], wiring: object, display: object}} The v3 sections.
 * @post s is not modified
 * @pure
 */
function splitSettings(s = {}) {
  /**
   * One old setting, or its old default when absent.
   *
   * @param {string} k - Setting name.
   * @param {*} d - Default.
   * @returns {*} The value.
   * @reads the enclosing settings.
   */
  const pick = (k, d) => (s[k] ?? d)
  const analyses = [{
    ...DEFAULT_ANALYSIS,
    fmin: pick('fmin', DEFAULT_ANALYSIS.fmin),
    fmax: pick('fmax', DEFAULT_ANALYSIS.fmax),
    npts: pick('npts', DEFAULT_ANALYSIS.npts),
    masking: !!pick('masking', false),
  }]
  const wiring = {
    masterDb: 0,
    channels: [{
      ...clone(DEFAULT_CHANNEL),
      volts: pick('voltage', DEFAULT_CHANNEL.volts),
      outputOhms: pick('rg', 0),
    }],
  }
  const display = {
    ...DEFAULT_DISPLAY,
    vThreshold: pick('vThreshold', DEFAULT_DISPLAY.vThreshold),
    unwrapPhase: pick('unwrapPhase', DEFAULT_DISPLAY.unwrapPhase),
    delayOffset: pick('delayOffset', DEFAULT_DISPLAY.delayOffset),
    nominalOhms: pick('impedance', DEFAULT_DISPLAY.nominalOhms),
  }
  if (s.yScales) display.yScales = clone(s.yScales)
  return { analyses, wiring, display }
}

/**
 * Fill every section of a v3 project from the defaults.
 *
 * Node params are merged over `DEFAULT_PARAMS` so a file gains any parameter
 * added since it was written; channels over `DEFAULT_CHANNEL`; the rest over
 * their own defaults. Edges without an id get one that no other edge uses.
 *
 * @param {object} proj - A v3 project, possibly sparse — MCP tools and hand-written files usually are.
 * @returns {object} A complete v3 project.
 * @post proj is not modified
 * @pure
 */
function normalize(proj) {
  const nodes = (proj.nodes || []).map((n) => ({
    id: n.id, type: n.type,
    position: clone(n.position) || { x: 0, y: 0 },
    params: { ...clone(DEFAULT_PARAMS[n.type] || {}), ...clone(n.params || {}) },
  }))
  const used = new Set((proj.edges || []).map((e) => e.id).filter(Boolean))
  let k = 0
  /**
   * An edge id no other edge in this project uses.
   *
   * @returns {string} The id.
   * @mutates the local `used` set and counter.
   */
  const freshId = () => {
    while (used.has(`e_${k}`)) k++
    used.add(`e_${k}`)
    return `e_${k}`
  }
  const edges = (proj.edges || []).map((e) => ({
    id: e.id || freshId(),
    source: e.source, sourceHandle: e.sourceHandle,
    target: e.target, targetHandle: e.targetHandle,
  }))
  const w = proj.wiring || {}
  const channels = (w.channels && w.channels.length ? w.channels : DEFAULT_WIRING.channels).map((c) => ({
    ...clone(DEFAULT_CHANNEL),
    ...clone(c),
    dsp: { ...clone(DEFAULT_CHANNEL.dsp), ...clone(c.dsp || {}) },
  }))
  const analyses = (proj.analyses && proj.analyses.length ? proj.analyses : [DEFAULT_ANALYSIS])
    .map((a) => ({ ...(a.type === 'ac' || !a.type ? DEFAULT_ANALYSIS : {}), ...clone(a) }))
  const out = {
    schemaVersion: SCHEMA_VERSION,
    app: proj.app || 'SpeakerSpice',
    name: proj.name || '',
    air: { ...DEFAULT_AIR, ...clone(proj.air || {}) },
    params: clone(proj.params || []),
    nodes,
    edges,
    wiring: { masterDb: typeof w.masterDb === 'string' ? w.masterDb : Number(w.masterDb) || 0, channels },
    analyses,
    probes: clone(proj.probes || []),
    components: clone(proj.components || []),
    display: { ...DEFAULT_DISPLAY, ...clone(proj.display || {}) },
  }
  if (proj.modified) out.modified = proj.modified
  return out
}

/**
 * Bring any saved project to the current format.
 *
 * v1 and v2 files are converted (see the rules at the top of this module); a
 * v3 file is only normalized. A file from a newer build is normalized as if
 * it were v3 — whatever this build does not understand is kept where it can
 * be, and the caller decides whether to warn.
 *
 * Idempotent: migrating a migrated project changes nothing.
 *
 * @param {object} proj - A parsed `.speakerspice.json` project of any version.
 * @returns {object} A complete project at `SCHEMA_VERSION`.
 * @post proj is not modified
 * @pure
 */
export function migrateProject(proj) {
  const from = Number(proj?.schemaVersion) || 1
  if (from >= 3) return normalize(proj || {})
  const probes = []
  const prIds = new Set((proj.nodes || []).filter((n) => n.type === 'pr').map((n) => n.id))
  const nodes = (proj.nodes || []).map((n) => {
    const { params, probe } = migrateNodeParams(n, from)
    if (probe) probes.push(probe)
    return { ...n, params }
  })
  const edges = (proj.edges || []).map((e) => ({
    ...e,
    sourceHandle: prIds.has(e.source) && e.sourceHandle === 'in' ? 'rear' : e.sourceHandle,
    targetHandle: prIds.has(e.target) && e.targetHandle === 'in' ? 'rear' : e.targetHandle,
  }))
  const { analyses, wiring, display } = splitSettings(proj.settings)
  return normalize({ ...proj, nodes, edges, analyses, wiring, display, probes })
}

// Module-private functions, exposed for the contract test suite only
// (test/contract/*). Not part of this module's public API — application code
// must not import from here, and nothing outside the tests does.
export const __internals = { migrateNodeParams, splitSettings, normalize, prFs }
