// Phase-2 helpers for the MCP server: driver lookup, self-calibrating
// enclosure builders, an optimizer, and comparison scoring.
import { BUILTIN_DRIVERS, driverToParams, EXT_BY_KEY } from '../src/data/drivers.js'
import { C_AIR } from '../src/engine/acoustics.js'

// ---------- driver lookup ----------

/**
 * Query the built-in driver library.
 *
 * Filters are conjunctive and every one is optional, so an empty argument
 * returns the whole library. Text matching on `query` and `brand` is
 * case-insensitive; `query` matches against the joined brand and model.
 *
 * Extended-parameter filtering is generic: a number key accepts `{min}`,
 * `{max}` or an exact value, and a text key matches by substring. That
 * means a new catalog column becomes queryable the moment it is declared in
 * the schema, with no change here or in the tool definition.
 *
 * @param {object} [criteria={}] - Filter criteria.
 * The numeric filters read the record's own field names — `Fs`, `Xmax`, `Sd`,
 * capitalised as the driver schema spells them — and a row missing the field
 * being filtered on is excluded, exactly as for an extended parameter.
 *
 * @param {string} [criteria.query] - Substring of "brand model".
 * @param {string} [criteria.brand] - Exact brand name.
 * @param {'official'|'datasheet'|'custom'} [criteria.source] - Provenance.
 * @param {number} [criteria.fs_min] - Minimum Fs, Hz.
 * @param {number} [criteria.fs_max] - Maximum Fs, Hz.
 * @param {number} [criteria.xmax_min] - Minimum Xmax, mm.
 * @param {number} [criteria.sd_min] - Minimum Sd, cm².
 * @param {number} [criteria.sd_max] - Maximum Sd, cm².
 * @param {Object<string, {min?: number, max?: number}|string|number>} [criteria.ext] - Extended-parameter filters keyed by field.
 * @returns {Array<object>} Matching records, in library order. Rows lacking the extended field being filtered on are excluded rather than passed through.
 * @throws {Error} When `ext` names a field that is not in the schema — a silent empty result would look like "no such driver" rather than "no such column".
 * @post The library is not modified.
 * @pure
 */
export function searchDrivers({
  query, brand, source, fs_min, fs_max, xmax_min, sd_min, sd_max, ext,
} = {}) {
  let rows = BUILTIN_DRIVERS
  if (query) {
    const q = String(query).toLowerCase()
    rows = rows.filter((d) => `${d.brand} ${d.model}`.toLowerCase().includes(q))
  }
  if (brand) {
    const b = String(brand).toLowerCase()
    rows = rows.filter((d) => d.brand.toLowerCase() === b)
  }
  if (source) rows = rows.filter((d) => d.source === source)
  if (fs_min != null) rows = rows.filter((d) => d.Fs >= fs_min)
  if (fs_max != null) rows = rows.filter((d) => d.Fs <= fs_max)
  if (xmax_min != null) rows = rows.filter((d) => d.Xmax >= xmax_min)
  if (sd_min != null) rows = rows.filter((d) => d.Sd >= sd_min)
  if (sd_max != null) rows = rows.filter((d) => d.Sd <= sd_max)

  // Generic extended-parameter filtering, so a new catalog column becomes
  // queryable the moment it is declared in the schema — no tool change.
  // { pNom: { min: 1000 }, magnet: 'Neodymium Inside Slug' }
  for (const [key, want] of Object.entries(ext || {})) {
    const f = EXT_BY_KEY[key]
    if (!f) throw new Error(`Unknown extended parameter "${key}". Call driver_fields to list them.`)
    if (want && typeof want === 'object') {
      if (want.min != null) rows = rows.filter((d) => d.ext[key] != null && d.ext[key] >= want.min)
      if (want.max != null) rows = rows.filter((d) => d.ext[key] != null && d.ext[key] <= want.max)
    } else if (f.type === 'text') {
      const w = String(want).toLowerCase()
      rows = rows.filter((d) => String(d.ext[key] ?? '').toLowerCase().includes(w))
    } else {
      rows = rows.filter((d) => d.ext[key] === want)
    }
  }
  return rows
}

/**
 * Resolve a query to exactly one driver.
 *
 * Ambiguity is an error rather than a silent first-match, because building
 * an enclosure around the wrong driver produces plausible numbers for the
 * wrong thing. An exact match on the full name or the model alone breaks a
 * tie, so "18SW115-4" resolves even though it is a substring of nothing
 * else.
 *
 * Note that "exact" is exact, not longest: a model that is a strict substring of
 * another model resolves only if it matches one of them exactly, so `SA-12` is
 * fine while `SA-1` is ambiguous.
 *
 * @param {string} query - Brand, model, or any substring of "brand model".
 * @returns {object} The single matching driver record.
 * @throws {Error} When nothing matches, or when several do and none is an exact name match. Both messages name the alternatives or point at `driver_search`.
 * @pure
 */
export function findDriver(query) {
  const rows = searchDrivers({ query })
  if (rows.length === 1) return rows[0]
  if (rows.length === 0) {
    throw new Error(`No driver in the library matches "${query}". Use driver_search to browse, or pass explicit T/S params.`)
  }
  const exact = rows.find((d) => `${d.brand} ${d.model}`.toLowerCase() === String(query).toLowerCase()
    || d.model.toLowerCase() === String(query).toLowerCase())
  if (exact) return exact
  throw new Error(`"${query}" is ambiguous: ${rows.map((d) => `${d.brand} ${d.model}`).join('; ')}`)
}

/**
 * Turn a driver spec into Driver node params.
 *
 * A spec may name a library driver, give explicit T/S values, or both — in
 * which case the explicit values win, which is how an agent models a
 * modified or re-coned driver.
 *
 * Only the solver-facing fields are taken from a library row. A database
 * record also carries provenance and construction detail that has no
 * business in a node's params, so this projects through `driverToParams`
 * rather than spreading the record.
 *
 * Wiring defaults to parallel for a multi-driver node, which is the usual
 * intent and, unlike series, does not change the impedance the amplifier
 * sees in a way the caller did not ask for.
 *
 * @param {object} [spec={}] - Driver spec.
 * @param {string} [spec.db] - Library driver to look up.
 * @param {number} [spec.count=1] - Drivers in this node.
 * @param {'single'|'series'|'parallel'|'series-parallel'} [spec.wiring] - Wiring. Defaults to `parallel` when count > 1, `single` otherwise.
 * @param {string} [spec.label] - Node label; defaults to the library model name, or "Driver".
 * @returns {object} Params ready for a driver node.
 * @throws {Error} When `spec.db` matches no driver or is ambiguous.
 * @pure
 */
export function driverParams(spec = {}) {
  let base = {}
  let label = spec.label || 'Driver'
  if (spec.db) {
    const d = findDriver(spec.db)
    // Only the solver-facing fields; a database row also carries provenance
    // and construction detail that has no business in a node's params.
    base = driverToParams(d)
    label = spec.label || d.model
  }
  const { db, count, wiring, ...overrides } = spec
  return {
    ...base, ...overrides, label,
    count: count || 1, wiring: wiring || (count > 1 ? 'parallel' : 'single'),
  }
}

// ---------- project assembly ----------

let bid = 0
/**
 * Sequential node id for a generated project.
 *
 * Ids only need to be unique within the project being built, so a plain
 * counter is enough — and it keeps generated projects readable and diffable.
 *
 * @param {string} t - Node type, used as the prefix.
 * @returns {string} A new node id.
 * @sideEffect Advances the module-level counter.
 */
const nid = (t) => `${t}_${++bid}`
/**
 * Canvas position for a node on a builder's grid.
 *
 * Generated projects are laid out on a fixed grid so they open in the
 * editor already readable rather than piled at the origin.
 *
 * @param {number} col - Grid column, left to right along the signal path.
 * @param {number} [row=0] - Grid row, for parallel branches.
 * @returns {{x: number, y: number}} Canvas position.
 * @pure
 */
const pos = (col, row = 0) => ({ x: 80 + col * 260, y: 120 + row * 200 })

/**
 * An empty project with the builders' default sweep settings.
 *
 * The default range is 10–200 Hz at 256 points rather than the app's
 * 10–1000 at 512: these are subwoofer enclosures, and the narrower sweep
 * resolves the tuning far better for a quarter of the solve cost.
 *
 * @param {string} name - Project name.
 * @param {object} [settings={}] - Settings merged over the defaults.
 * @returns {object} A project with no nodes or edges.
 * @pure
 */
function baseProject(name, settings = {}) {
  return {
    app: 'AcouSim', schemaVersion: 1, name,
    settings: { fmin: 10, fmax: 200, npts: 256, voltage: 2.83, impedance: 4, ...settings },
    nodes: [], edges: [],
  }
}

/**
 * Append a node to a project under construction.
 *
 * @param {object} p - Project being built.
 * @param {string} type - Node type.
 * @param {object} params - Node params.
 * @param {number} col - Grid column.
 * @param {number} [row=0] - Grid row.
 * @returns {string} The new node's id, for wiring it up.
 * @mutates Pushes onto the project's node list.
 * @sideEffect Consumes an id from the module counter.
 */
function addNode(p, type, params, col, row = 0) {
  const id = nid(type)
  p.nodes.push({ id, type, position: pos(col, row), params })
  return id
}

/**
 * Connect two ports in a project under construction.
 *
 * @param {object} p - Project being built.
 * @param {string} source - Source node id.
 * @param {string} sourceHandle - Source handle name.
 * @param {string} target - Target node id.
 * @param {string} targetHandle - Target handle name.
 * @returns {number} The new edge count, as returned by `Array.push` and ignored by callers.
 * @mutates Pushes onto the project's edge list.
 */
const edge = (p, source, sourceHandle, target, targetHandle) =>
  p.edges.push({ source, sourceHandle, target, targetHandle })

/**
 * Analytic Helmholtz port length for a target tuning.
 *
 * A first guess only. The lumped Helmholtz relation ignores the box's own
 * standing waves and the port's interaction with them, so the builders
 * follow it with `calibratePort`, which bisects against the *simulated*
 * impedance minimum. Expect this to be several Hz optimistic on a real box.
 *
 * @param {number} fb - Target tuning, Hz.
 * @param {number} volumeL - Box volume, litres.
 * @param {number} areaCm2 - Total port area, cm².
 * @param {number} [ecFactor=0.85] - End-correction coefficient, applied to both ends. The default is the flanged value, which is what a port gets at a box at one end and at open air at the other.
 * @returns {number} Port length in cm. Never below 1: the required length falls as the port narrows, as the box grows and as the target tuning rises, so a *small* port on a *large* box at a high tuning drives it below the end correction and a negative length is not a port. A returned 1 therefore means "this geometry cannot reach that tuning", not "1 cm will do it". The converse case — a large port on a small box — makes the port longer, not shorter, and can run to metres.
 * @pure
 */
export function portLengthGuess(fb, volumeL, areaCm2, ecFactor = 0.85) {
  const S = areaCm2 * 1e-4
  const V = volumeL * 1e-3
  const w = 2 * Math.PI * fb
  const Leff = (C_AIR * C_AIR * S) / (w * w * V)
  const ec = 2 * ecFactor * Math.sqrt(S / Math.PI) // both ends
  return Math.max((Leff - ec) * 100, 1) // cm
}

/**
 * Tune a port by bisecting its length against the simulated tuning.
 *
 * This is what makes the builders' tunings trustworthy: rather than
 * trusting the analytic guess, it re-simulates and converges on the length
 * that actually puts the impedance minimum where it was asked for.
 *
 * Tuning falls as the port lengthens, but only while the port behaves as a
 * Helmholtz mass: a long enough port acts as a pipe, and its tuning can rise
 * again. So the bracket is found by scanning upward — a quarter, half, one,
 * two and four times the initial guess, then doubling up to three more times
 * — and taking the first length whose tuning is at or below the target. That
 * is always the Helmholtz solution, and a poor initial guess still converges.
 * Fourteen bisections take the interval below a tenth of a percent, and the
 * search stops early once it is within 0.05 Hz.
 *
 * A simulation that returns `null` — a graph with no identifiable tuning —
 * ends the search at the current length rather than looping.
 *
 * @param {object} project - The project to tune. Modified in place.
 * @param {string} portId - Node id of the port to adjust.
 * @param {number} targetFb - Desired tuning, Hz.
 * @param {(project: object) => (number|null|Promise<number|null>)} simulateFb - Simulates a project and returns its tuning in Hz, or `null` when there is none; may return a promise.
 * @returns {Promise<number>} The calibrated port length in cm, rounded to 0.1 cm.
 * @pre The project contains a waveguide node with id `portId`.
 * @mutates Writes the calibrated length into the project's port node.
 * @sideEffect Runs the supplied simulation up to ~22 times, which dominates the cost of building a ported enclosure.
 */
export async function calibratePort(project, portId, targetFb, simulateFb) {
  /**
   * Set the port's length in a project.
   *
   * @param {object} p - Project to modify.
   * @param {number} L - Port length, cm.
   * @returns {void}
   * @mutates The port node's params.
   * @reads the enclosing `portId`.
   */
  const setLen = (p, L) => { p.nodes.find((n) => n.id === portId).params.length = L }
  /**
   * Simulated tuning at a candidate port length.
   *
   * Clones the project so the trial does not disturb the one being
   * calibrated.
   *
   * @param {number} L - Port length to try, cm.
   * @returns {Promise<number|null>} Tuning in Hz, or `null` when the graph has none.
   * @sideEffect Runs the caller's simulation.
   * @reads the enclosing `project` and `simulateFb`.
   */
  const fbAt = async (L) => {
    const p = structuredClone(project)
    setLen(p, L)
    return simulateFb(p)
  }
  const port = project.nodes.find((n) => n.id === portId)
  const L0 = Math.max(port.params.length, 0.5)
  // Scan upward from short lengths for the first crossing. Tuning falls with
  // length only on the Helmholtz branch; once the port is long enough to act
  // as a pipe it can come back up, so a blindly widened bracket may land on
  // a pipe-mode "tuning" several metres long.
  let lo = null
  let hi = null
  let prev = Math.max(L0 / 8, 0.25)
  for (const L of [L0 / 4, L0 / 2, L0, L0 * 2, L0 * 4]) {
    const fb = await fbAt(L)
    if (fb != null && fb <= targetFb) { hi = L; lo = prev; break }
    prev = L
  }
  if (hi == null) {
    hi = L0 * 4
    for (let k = 0; k < 3; k++) { hi *= 2; if (((await fbAt(hi)) ?? 0) <= targetFb) break }
    lo = hi / 2
  }
  let L = L0
  for (let k = 0; k < 14; k++) {
    L = (lo + hi) / 2
    const fb = await fbAt(L)
    if (fb == null) break
    if (Math.abs(fb - targetFb) < 0.05) break
    if (fb > targetFb) lo = L
    else hi = L
  }
  L = Math.round(L * 10) / 10
  setLen(project, L)
  return L
}

// ---------- topologies ----------
// Each builder returns { project, notes: [] }. Ports are built at the
// analytic guess; the server calibrates them afterwards.

/**
 * Build a sealed enclosure.
 *
 * The simplest topology: the driver's rear loads a closed chamber and its
 * front radiates into half space.
 *
 * @param {object} spec - Build spec.
 * @param {object} spec.driver - Driver spec, as `driverParams` accepts.
 * @param {number} spec.volume - Internal volume, litres.
 * @param {string} [spec.name] - Project name.
 * @param {object} [spec.settings] - Sweep settings overrides.
 * @returns {{project: object, notes: string[]}} The project and notes explaining the topology.
 * @throws {Error} When the driver spec names an unknown or ambiguous library driver.
 * @sideEffect Consumes ids from the module counter, so two calls produce projects with different node ids.
 */
export function buildSealedBox({ driver, volume, name, settings }) {
  const p = baseProject(name || 'Sealed box', settings)
  const d = addNode(p, 'driver', driverParams(driver), 0)
  const c = addNode(p, 'chamber', { volume, label: 'Sealed chamber' }, 1)
  edge(p, d, 'rear', c, 'in')
  return { project: p, notes: ['Driver front radiates into half space; rear loads the sealed chamber.'] }
}

/**
 * Build a vented enclosure.
 *
 * Port area defaults to about a quarter of the total cone area, split
 * across the requested number of ports — a common starting point that keeps
 * port velocity reasonable without making the port unmanageably long.
 *
 * The port is built at the analytic guess; the caller is expected to run
 * `calibratePort` against a real simulation afterwards, which is what the
 * MCP server does.
 *
 * @param {object} spec - Build spec.
 * @param {object} spec.driver - Driver spec.
 * @param {number} spec.volume - Internal volume, litres.
 * @param {number} [spec.tuning=32] - Target tuning, Hz. Ignored when `port_length` is given.
 * @param {number} [spec.port_area] - Area of each port, cm². Defaults to Sd/4 shared across the ports.
 * @param {number} [spec.port_length] - Explicit port length, cm, bypassing the tuning calculation.
 * @param {number} [spec.port_count=1] - Number of identical ports.
 * @param {string} [spec.name] - Project name.
 * @param {object} [spec.settings] - Sweep settings overrides.
 * @returns {{project: object, ports: string[], notes: string[]}} The project, the port node ids for calibration, and notes.
 * @throws {Error} When the driver spec names an unknown or ambiguous library driver.
 * @sideEffect Consumes ids from the module counter.
 */
export function buildPortedBox({ driver, volume, tuning, port_area, port_length, port_count = 1, name, settings }) {
  const p = baseProject(name || 'Ported box', settings)
  const dp = driverParams(driver)
  const S = port_area || Math.round(((dp.Sd || 480) * (dp.count || 1)) / 4 / (port_count || 1))
  const L = port_length || portLengthGuess(tuning || 32, volume, S * port_count)
  const d = addNode(p, 'driver', dp, 0)
  const c = addNode(p, 'chamber', { volume, label: 'Box' }, 1)
  edge(p, d, 'rear', c, 'in')
  const ports = []
  for (let k = 0; k < port_count; k++) {
    const w = addNode(p, 'waveguide', { S1: S, S2: S, length: L, flare: 'conical', label: port_count > 1 ? `Port ${k + 1}` : 'Port' }, 2, k)
    edge(p, c, 'out', w, 'throat')
    ports.push(w)
  }
  return {
    project: p, ports,
    notes: [`Port area ${S} cm² each × ${port_count} (default ≈ Sd/4 total when not specified).`],
  }
}

/**
 * Build a 4th-order bandpass enclosure.
 *
 * The driver is buried: its rear loads a sealed chamber and its front vents
 * through a ported one, so *all* output comes from the port. That is what
 * gives the alignment its bandpass shape and its acoustic low-pass — and
 * why the cone itself contributes nothing directly to the SPL.
 *
 * @param {object} spec - Build spec.
 * @param {object} spec.driver - Driver spec.
 * @param {number} spec.front_volume - Ported front chamber volume, litres.
 * @param {number} spec.rear_volume - Sealed rear chamber volume, litres.
 * @param {number} [spec.tuning=45] - Front chamber tuning, Hz.
 * @param {number} [spec.port_area] - Port area, cm². Defaults to Sd/4.
 * @param {string} [spec.name] - Project name.
 * @param {object} [spec.settings] - Sweep settings overrides.
 * @returns {{project: object, ports: string[], notes: string[]}} The project, the port node id, and notes.
 * @throws {Error} When the driver spec names an unknown or ambiguous library driver.
 * @sideEffect Consumes ids from the module counter.
 */
export function buildBandpass4({ driver, front_volume, rear_volume, tuning, port_area, name, settings }) {
  const p = baseProject(name || '4th-order bandpass', settings)
  const dp = driverParams(driver)
  const S = port_area || Math.round(((dp.Sd || 480) * (dp.count || 1)) / 4)
  const d = addNode(p, 'driver', dp, 0)
  const rear = addNode(p, 'chamber', { volume: rear_volume, label: 'Rear sealed' }, 0, 1)
  const front = addNode(p, 'chamber', { volume: front_volume, label: 'Front chamber' }, 1)
  const port = addNode(p, 'waveguide', { S1: S, S2: S, length: portLengthGuess(tuning || 45, front_volume, S), flare: 'conical', label: 'Port' }, 2)
  edge(p, d, 'rear', rear, 'in')
  edge(p, d, 'front', front, 'in')
  edge(p, front, 'out', port, 'throat')
  return {
    project: p, ports: [port],
    notes: ['Driver is buried: rear sealed, front vents through the port. All output comes from the port.'],
  }
}

/**
 * Build a parallel 6th-order bandpass enclosure.
 *
 * Both chambers vent to the outside, and the two tunings set the passband
 * edges: tune the rear port low and the front port high. Steeper skirts
 * than a 4th-order at the cost of a much narrower usable band and far more
 * sensitivity to getting both tunings right.
 *
 * @param {object} spec - Build spec.
 * @param {object} spec.driver - Driver spec.
 * @param {number} spec.front_volume - Front chamber volume, litres.
 * @param {number} spec.rear_volume - Rear chamber volume, litres.
 * @param {number} [spec.front_tuning=55] - Front port tuning, Hz — the passband's upper edge.
 * @param {number} [spec.rear_tuning=30] - Rear port tuning, Hz — the lower edge.
 * @param {number} [spec.port_area] - Area of each port, cm². Defaults to Sd/4.
 * @param {string} [spec.name] - Project name.
 * @param {object} [spec.settings] - Sweep settings overrides.
 * @returns {{project: object, ports: string[], notes: string[]}} The project, both port node ids, and notes.
 * @throws {Error} When the driver spec names an unknown or ambiguous library driver.
 * @sideEffect Consumes ids from the module counter.
 */
export function buildBandpass6({ driver, front_volume, rear_volume, front_tuning, rear_tuning, port_area, name, settings }) {
  const p = baseProject(name || '6th-order bandpass (parallel)', settings)
  const dp = driverParams(driver)
  const S = port_area || Math.round(((dp.Sd || 480) * (dp.count || 1)) / 4)
  const d = addNode(p, 'driver', dp, 0)
  const rear = addNode(p, 'chamber', { volume: rear_volume, label: 'Rear chamber' }, 1, 1)
  const front = addNode(p, 'chamber', { volume: front_volume, label: 'Front chamber' }, 1)
  const fPort = addNode(p, 'waveguide', { S1: S, S2: S, length: portLengthGuess(front_tuning || 55, front_volume, S), flare: 'conical', label: 'Front port' }, 2)
  const rPort = addNode(p, 'waveguide', { S1: S, S2: S, length: portLengthGuess(rear_tuning || 30, rear_volume, S), flare: 'conical', label: 'Rear port' }, 2, 1)
  edge(p, d, 'front', front, 'in')
  edge(p, d, 'rear', rear, 'in')
  edge(p, front, 'out', fPort, 'throat')
  edge(p, rear, 'out', rPort, 'throat')
  return {
    project: p, ports: [fPort, rPort],
    notes: ['Parallel 6th order: both chambers vent outside. Tune the rear port low and the front port high; the two tunings set the passband edges.'],
  }
}

/**
 * Enclosure builders keyed by topology name.
 *
 * The dispatch table `build_enclosure` resolves its `topology` argument
 * against.
 */
export const BUILDERS = {
  sealed: buildSealedBox,
  ported: buildPortedBox,
  bandpass4: buildBandpass4,
  bandpass6: buildBandpass6,
}

/**
 * Search for the best parameter values by coordinate grid refinement.
 *
 * Each round sweeps every free parameter across its current range on a
 * grid, keeps the best value found, then halves the range around it. This
 * converges far faster than a full grid search over all parameters at once
 * — cost is one baseline evaluation of the starting design plus
 * `rounds × params × gridN` for the search itself, rather than `gridN ^
 * params` — at the price of being able to miss a narrow optimum that only
 * appears when two parameters move together.
 *
 * Constraints are the caller's job, folded into `score` as penalties rather
 * than enforced here, which keeps the search unconstrained and lets a
 * design that slightly violates a limit still be ranked against one that
 * badly violates it.
 *
 * A parameter whose starting value is outside its own bounds is moved to
 * mid-range first, so a caller can pass bounds that exclude the current
 * design without the search starting from an invalid point.
 *
 * @param {object} project - Starting project. Not modified.
 * @param {Array<{node?: string, param: string, min: number, max: number}>} params - Free parameters. Omit `node` to target a sweep setting rather than a node param.
 * @param {(project: object) => (number|Promise<number>)} score - Objective; higher is better; may return a promise.
 * @param {object} [opts={}] - Search controls.
 * @param {number} [opts.rounds=3] - Refinement rounds.
 * @param {number} [opts.gridN=9] - Grid points per parameter per round.
 * @returns {Promise<{best: object, bestScore: number, evals: number, values: number[]}>} The best project found, its score, how many evaluations it took — `1 + rounds × params × gridN` — and the winning value of each parameter in the order given.
 * @sideEffect Calls `score` many times; if scoring simulates, this is the expensive part.
 */
export async function optimizeProject(project, params, score, { rounds = 3, gridN = 9 } = {}) {
  /**
   * Read a free parameter's current value from a project.
   *
   * @param {object} p - Project to read from.
   * @param {{node?: string, param: string}} prm - Parameter descriptor.
   * @returns {number} The current value.
   * @pre The named node exists when `prm.node` is set.
   * @pure
   */
  const getVal = (p, prm) => prm.node
    ? p.nodes.find((n) => n.id === prm.node).params[prm.param]
    : p.settings[prm.param]
  /**
   * Write a free parameter's value into a project.
   *
   * Replaces the params object rather than assigning into it, so a candidate
   * built by `structuredClone` cannot share structure with the project it
   * came from.
   *
   * @param {object} p - Project to write to. Modified in place.
   * @param {{node?: string, param: string}} prm - Parameter descriptor.
   * @param {number} v - New value.
   * @returns {void}
   * @mutates The project passed in.
   */
  const setVal = (p, prm, v) => {
    if (prm.node) {
      const n = p.nodes.find((x) => x.id === prm.node)
      n.params = { ...(n.params || {}), [prm.param]: v }
    } else p.settings = { ...(p.settings || {}), [prm.param]: v }
  }
  let best = structuredClone(project)
  // start from mid-range for any param whose current value is outside its bounds
  for (const prm of params) {
    const v = getVal(best, prm)
    if (!(v >= prm.min && v <= prm.max)) setVal(best, prm, (prm.min + prm.max) / 2)
  }
  let bestScore = await score(best)
  let evals = 1
  const ranges = params.map((prm) => [prm.min, prm.max])
  for (let r = 0; r < rounds; r++) {
    for (let pi = 0; pi < params.length; pi++) {
      const [lo, hi] = ranges[pi]
      let cbV = getVal(best, params[pi])
      for (let k = 0; k < gridN; k++) {
        const v = lo + ((hi - lo) * k) / (gridN - 1)
        const cand = structuredClone(best)
        setVal(cand, params[pi], v)
        const s = await score(cand)
        evals++
        if (s > bestScore) { bestScore = s; best = cand; cbV = v }
      }
      // shrink range around the winner
      const span = (hi - lo) / 2
      ranges[pi] = [
        Math.max(params[pi].min, cbV - span / 2),
        Math.min(params[pi].max, cbV + span / 2),
      ]
    }
  }
  return { best, bestScore, evals, values: params.map((prm) => getVal(best, prm)) }
}

// Module-private functions, exposed for the contract test suite only
// (test/contract/*). Not part of this module's public API — application code
// must not import from here, and nothing outside the tests does.
export const __internals = { nid, pos, baseProject, addNode, edge }
