// Graph → transfer-matrix chain solver.
// Convention: ABCD matrices map [p_in; U_in] = M · [p_out; U_out] with
// p = acoustic pressure (Pa), U = volume velocity (m^3/s).
//
// A node is `{ id, type, data: { params } }` and an edge is
// `{ source, sourceHandle, target, targetHandle }`. Each node type exposes a
// fixed set of named handles, and an edge must name one at each end:
//
//   driver      front (out), rear (out)  — both may fan out
//   chamber     in (in), out (out)
//   waveguide   throat (in), mouth (out)
//   pr          in (in)
//   radiation   in (in)
//
// Ports are directional: an output handle connects to an input handle. An
// unconnected output is not an error — an open waveguide mouth radiates, and a
// chamber with nothing on its outlet is sealed.
import {
  C, ZERO, add, sub, mul, div, inv, abs, arg, jw, jwPow, parallel,
  zInFromMatrix, propagate,
} from './complex.js'
import {
  RHO, C_AIR, SOLID_ANGLES, radiationImpedance, waveguideMatrix, chamberMatrix,
  endCorrectionLength, flareCutoff, combineQ,
} from './acoustics.js'
import { cycleAverage, complianceRatio, hasNL } from './nonlinear.js'

const P_REF = 20e-6

// ---------- unit conversion: node params (display units) → SI ----------

/**
 * Convert a driver node's display-unit parameters into the SI set the solver runs on.
 *
 * This is also where a multi-driver node collapses into one equivalent driver.
 * Series wiring multiplies Re, Le and Bl by the count; parallel wiring divides
 * the electrical terms; series-parallel splits the count into a square grid
 * when it is a perfect square and falls back to plain parallel when it is not.
 * The mechanical side scales with cone count regardless of wiring: Sd, Mms and
 * Rms multiply, Cms divides.
 *
 * Every field has a fallback, so a partially filled node still simulates rather
 * than producing NaN. That is deliberate — the editor lets you drop a driver on
 * the canvas before typing any numbers.
 *
 * @param {object} p - Driver node params in display units (Sd cm², Mms g, Cms mm/N, Le mH, Xmax mm).
 * @returns {{n: number, s: number, par: number, Re: number, Le: number, LeExp: number, Bl: number, Sd: number, Mms: number, Cms: number, Rms: number, Fs: number, Xmax: number, Q: number}} The equivalent single driver in SI units, plus the resolved count and the series/parallel multipliers.
 * @post result.n >= 1
 * @post p is not modified
 * @pure
 */
export function driverSI(p) {
  const n = Math.max(1, Math.round(p.count || 1))
  let s = 1, par = 1
  if (p.wiring === 'series') s = n
  else if (p.wiring === 'parallel') par = n
  else if (p.wiring === 'series-parallel') {
    const r = Math.round(Math.sqrt(n))
    if (r * r === n && r > 1) { s = r; par = r } else { par = n }
  }
  const Sd = (p.Sd || 500) * 1e-4 // cm² → m²
  const Mms = (p.Mms || 100) * 1e-3 // g → kg
  const Cms = (p.Cms || 0.2) * 1e-3 // mm/N → m/N
  return {
    n, s, par,
    Re: ((p.Re || 4) * s) / par,
    Le: (((p.Le || 1) * 1e-3) * s) / par, // mH → H
    LeExp: p.LeExp ?? 1,
    Bl: (p.Bl || 15) * s,
    Sd: Sd * n,
    Mms: Mms * n,
    Cms: Cms / n,
    Rms: (p.Rms || 3) * n,
    Fs: p.Fs || 30,
    Xmax: (p.Xmax || 10) * 1e-3,
    Q: normQ(p),
  }
}

/**
 * Resolve a node's loss factor to a number the element builders can use.
 *
 * Collapses two ways of saying "lossless" — an explicit `lossless` flag and a
 * non-positive Q — onto `Infinity`, which is what `combineQ` and `tlineMatrix`
 * expect. Without this, a Q of 0 read literally would divide by zero.
 *
 * A *missing* Q is not lossless: it falls back to 50, the same moderate loss a
 * new node is created with, so a node whose Q was never set behaves like one
 * that was left at its default rather than like a lossless idealisation.
 *
 * @param {object} p - Any node's params.
 * @param {boolean} [p.lossless] - When true, force `Infinity` regardless of Q.
 * @param {number} [p.Q=50] - The node's loss factor.
 * @returns {number} A positive Q, or `Infinity` for lossless.
 * @post result > 0
 * @pure
 */
function normQ(p) {
  if (p.lossless) return Infinity
  const q = p.Q ?? 50
  return q > 0 ? q : Infinity
}

// ---------- element impedance / matrix builders ----------

/**
 * Mechanical impedance of a driver acting as a passive load rather than a source.
 *
 * When a second driver sits on the same enclosure but is not the one being
 * driven in this superposition pass, it still presents a load: its moving mass,
 * suspension and — through the motor — its blocked electrical impedance
 * reflected back as `Bl²/Ze`. Ignoring that term would let an unpowered cone
 * behave as though its motor were disconnected.
 *
 * @param {object} d - An SI driver from `driverSI`.
 * @param {number} Rg - Amplifier source resistance, Ω, in series with the coil.
 * @param {number} w - Angular frequency ω, rad/s.
 * @returns {Complex} Mechanical impedance, N·s/m, including the reflected electrical term.
 * @pre w > 0 — the compliance term divides by ω
 * @pure
 */
function driverPassiveMechZ(d, Rg, w) {
  // Blocked electrical impedance reflected into mechanical domain
  const Ze = add(C(Rg + d.Re, 0), mul(C(d.Le, 0), jwPow(w, d.LeExp)))
  const Zm = add(
    C(d.Rms + (isFinite(d.Q) ? (2 * Math.PI * d.Fs * d.Mms) / d.Q : 0), 0),
    add(C(0, w * d.Mms), div(C(1, 0), jw(w * d.Cms))),
  )
  return add(Zm, div(C(d.Bl * d.Bl, 0), Ze))
}

// ---------- graph model ----------

/**
 * Build an undirected adjacency index keyed by `nodeId:handle`.
 *
 * Each edge is registered from both ends, so a lookup on either side finds the
 * other. That matters because the solver traverses in both directions: forward
 * for pressure propagation, backward when a downstream element needs to know
 * its load.
 *
 * Edges referencing a missing node are skipped rather than throwing — a project
 * file edited by hand can carry a dangling edge, and it should not stop the
 * whole sweep.
 *
 * @param {Array<{id: string, type: string, data: object}>} nodes - Graph nodes.
 * @param {Array<{source: string, sourceHandle: string, target: string, targetHandle: string}>} edges - Graph edges.
 * @returns {{byId: Map<string, object>, adj: Map<string, Array<{node: object, handle: string}>>}} Node lookup and the adjacency index.
 * @post nodes and edges are not modified
 * @pure
 */
function buildGraph(nodes, edges) {
  const byId = new Map(nodes.map((n) => [n.id, n]))
  const out = new Map() // `${id}:${handle}` -> [{node, handle}]
  for (const e of edges) {
    const src = byId.get(e.source)
    const tgt = byId.get(e.target)
    if (!src || !tgt) continue
    const key = `${e.source}:${e.sourceHandle}`
    if (!out.has(key)) out.set(key, [])
    out.get(key).push({ node: tgt, handle: e.targetHandle })
    const rkey = `${e.target}:${e.targetHandle}`
    if (!out.has(rkey)) out.set(rkey, [])
    out.get(rkey).push({ node: src, handle: e.sourceHandle })
  }
  return { byId, adj: out }
}

/**
 * Check a graph for topology mistakes without simulating it.
 *
 * The distinction the return value draws is the important one: `errors` stop
 * the sweep, `warnings` do not. Most topology problems are legitimate designs
 * the model handles approximately — an unconnected mouth is a working port, not
 * a mistake — so they are surfaced on the node and left alone.
 *
 * The one error is having no driver at all, since there would be nothing to
 * excite the network.
 *
 * @param {Array<object>} nodes - Graph nodes.
 * @param {Array<object>} edges - Graph edges.
 * @returns {{warnings: Object<string, string[]>, errors: string[]}} Warnings keyed by node id, and graph-level errors that block simulation.
 * @post nodes and edges are not modified
 * @pure
 */
export function validateGraph(nodes, edges) {
  const { adj } = buildGraph(nodes, edges)
  const warnings = {}
  const errors = []
  /**
   * Whether a given port has at least one edge attached.
   * @param {string} id - Node id.
   * @param {string} h - Handle name.
   * @returns {boolean} True when the port is connected.
   * @reads the `adj` index built above
   */
  const connected = (id, h) => (adj.get(`${id}:${h}`) || []).length > 0
  // Multiple edges INTO one input port do not form an acoustic junction —
  // branches must fan out from an output port (e.g. two edges leaving a
  // driver's front port). Extra feeders are ignored by the solver, so warn.
  const inCounts = new Map()
  for (const e of edges) {
    const k = `${e.target}:${e.targetHandle}`
    inCounts.set(k, (inCounts.get(k) || 0) + 1)
  }
  const multiFed = new Set(
    [...inCounts.entries()].filter(([, c]) => c > 1).map(([k]) => k.split(':')[0]),
  )
  const drivers = nodes.filter((n) => n.type === 'driver')
  if (drivers.length === 0) errors.push('Add a Driver node to run a simulation.')
  for (const n of nodes) {
    const w = []
    if (multiFed.has(n.id)) {
      w.push('Multiple edges feed this input port. Driven sources are superposed but do not load each other (approximate — OK for e.g. a series-bandpass cabin fed by driver rear + port). A passive side branch (closed stub) here would be ignored: branch stubs FROM an output port instead.')
    }
    if (n.type === 'driver') {
      if (!connected(n.id, 'front') && !connected(n.id, 'rear'))
        w.push('Neither driver port is connected — both radiate into half space by default.')
    } else if (n.type === 'waveguide') {
      if (!connected(n.id, 'throat')) w.push('Throat is not connected.')
      if (!connected(n.id, 'mouth')) w.push('Mouth is unconnected — treated as radiating into half space.')
    } else if (n.type === 'chamber') {
      if (!connected(n.id, 'in')) w.push('Chamber inlet is not connected.')
    } else if (n.type === 'radiation') {
      if (!connected(n.id, 'in')) w.push('Radiation termination has no input.')
    } else if (n.type === 'pr') {
      if (!connected(n.id, 'in')) w.push('Passive radiator is not mounted to anything.')
    }
    if (w.length) warnings[n.id] = w
  }
  return { warnings, errors }
}

// ---------- solve ----------

/**
 * Solve the whole graph across the frequency sweep.
 *
 * The single entry point of the engine. For each of `npts` log-spaced
 * frequencies it builds every element's ABCD matrix, walks the graph backward
 * to find the load each driver sees, solves the coupled electro-mechanical
 * equation for cone velocity, then walks forward again accumulating radiated
 * pressure, port velocity and interior probe pressure.
 *
 * Multiple drivers are handled by **superposition**: each is solved as the sole
 * source with the others present as passive mechanical loads, and the resulting
 * pressures are summed coherently. Excursion is deliberately *not* summed —
 * cones move independently, so `excursion` reports the worst single cone and
 * `excursionRatio` the worst cone relative to its own Xmax.
 *
 * When `settings.nlEnabled` is set and at least one driver has nonlinear
 * curves, the whole sweep runs four times, refining per-frequency Bl/Cms/Le
 * scale factors from the previous pass's excursion by damped fixed-point
 * iteration. This is experimental and roughly quadruples the solve time.
 *
 * @param {Array<object>} nodes - Graph nodes, each `{id, type, data: {params}}`.
 * @param {Array<object>} edges - Graph edges.
 * @param {object} settings - Sweep settings.
 * @param {number} [settings.fmin=10] - Sweep start, Hz.
 * @param {number} [settings.fmax=1000] - Sweep end, Hz.
 * @param {number} [settings.npts=512] - Log-spaced frequency points.
 * @param {number} [settings.voltage=2.83] - Drive voltage, V RMS at the amplifier.
 * @param {number} [settings.rg=0] - Amplifier source resistance, Ω.
 * @param {boolean} [settings.masking] - Replace chambers with lumped compliances, hiding standing-wave artifacts.
 * @param {boolean} [settings.nlEnabled] - Enable the experimental large-signal mode.
 * @returns {object} On success `{ok: true, validation, freqs, splCombined, splDriver, splPorts, splInterior, zinMag, zinPhase, excursion, excursionByDriver, excursionRatio, xmaxByDriver, velocity, power, peReal, peApparent, phase, phaseUnwrapped, groupDelay, nl, elapsedMs}`. On failure `{ok: false, validation, freqs: []}` — returned rather than thrown, because an incomplete graph is the normal state while the user is still wiring it up.
 * @pre settings.npts >= 2 — the log spacing divides by npts - 1
 * @pre settings.fmin > 0 — the sweep is logarithmic
 * @sideEffect Reads `performance.now()` twice to report `elapsedMs`, so the result is not bit-identical across runs.
 * @mutates Stashes solver scratch state on the caller's node objects (`node._Zl`) and on returned impedances (`Z._radS`). Harmless to the graph's meaning, but the input array is not left untouched.
 */
export function runSimulation(nodes, edges, settings) {
  const t0 = performance.now()
  const { byId, adj } = buildGraph(nodes, edges)
  const validation = validateGraph(nodes, edges)
  const drivers = nodes.filter((n) => n.type === 'driver')
  if (drivers.length === 0 || validation.errors.length) {
    return { ok: false, validation, freqs: [] }
  }

  const fmin = settings.fmin || 10
  const fmax = settings.fmax || 1000
  const npts = settings.npts || 512
  const masking = !!settings.masking
  const Eg = settings.voltage || 2.83
  const Rg = settings.rg || 0

  const freqs = new Array(npts)
  const lf0 = Math.log10(fmin)
  const lf1 = Math.log10(fmax)
  for (let i = 0; i < npts; i++) freqs[i] = Math.pow(10, lf0 + ((lf1 - lf0) * i) / (npts - 1))

  const radiators = nodes.filter((n) => n.type === 'radiation' || n.type === 'pr')
  const waveguides = nodes.filter((n) => n.type === 'waveguide')

  // result arrays
  const res = {
    ok: true,
    validation,
    freqs,
    splCombined: new Array(npts),
    splDriver: new Array(npts).fill(null),
    splPorts: {}, // per radiating waveguide-chain terminal node id
    zinMag: new Array(npts),
    zinPhase: new Array(npts),
    excursion: new Array(npts),
    velocity: {}, // waveguide node id -> array m/s
    power: new Array(npts),
    peReal: new Array(npts),     // electrical input power, W (real)
    peApparent: new Array(npts), // electrical input power, VA (apparent)
    phase: new Array(npts),
    groupDelay: new Array(npts),
  }
  for (const wg of waveguides) res.velocity[wg.id] = new Array(npts).fill(0)
  for (const r of radiators) res.splPorts[r.id] = new Array(npts).fill(null)
  // an unconnected waveguide mouth radiates too — give it a port SPL series
  const mouthConnected = new Set(edges.filter((e) => e.sourceHandle === 'mouth').map((e) => e.source))
  for (const wg of waveguides) {
    if (!mouthConnected.has(wg.id)) res.splPorts[wg.id] = new Array(npts).fill(null)
  }

  const driverSIs = new Map(drivers.map((d) => [d.id, driverSI(d.data.params)]))

  // EXPERIMENTAL nonlinear mode: per-driver, per-frequency parameter scale
  // factors, refined by damped fixed-point iteration over full sweeps.
  const nlActive = !!settings.nlEnabled && drivers.some((d) => hasNL(d.data.params.nl))
  const nlScales = new Map() // driver id -> { bl, cms, le: Float64Array }
  for (const d of drivers) {
    nlScales.set(d.id, {
      bl: new Float64Array(npts).fill(1),
      cms: new Float64Array(npts).fill(1),
      le: new Float64Array(npts).fill(1),
    })
  }
  /**
   * The SI driver to use at one frequency point, with nonlinear scaling applied.
   *
   * In linear mode this is the cached `driverSI` result, returned by reference.
   * In nonlinear mode it is a fresh object with Bl, Cms and Le scaled by the
   * factors the previous sweep derived for this frequency, so callers must not
   * rely on identity between calls.
   *
   * @param {string} id - Driver node id.
   * @param {number} i - Frequency index into the sweep.
   * @returns {object} The effective SI driver at that frequency.
   * @reads `nlActive` and the `nlScales` table, which the outer iteration loop rewrites between passes — the same arguments give different results on a later pass.
   */
  const effDriver = (id, i) => {
    const d = driverSIs.get(id)
    if (!nlActive) return d
    const s = nlScales.get(id)
    return { ...d, Bl: d.Bl * s.bl[i], Cms: d.Cms * s.cms[i], Le: d.Le * s.le[i] }
  }
  res.excursionByDriver = {}
  for (const d of drivers) res.excursionByDriver[d.id] = new Array(npts).fill(0)
  // Xmax per driver (mm) so the charts and metrics can judge each cone against
  // its own limit rather than borrowing the first driver's.
  res.xmaxByDriver = {}
  for (const d of drivers) res.xmaxByDriver[d.id] = driverSIs.get(d.id).Xmax * 1000
  // Worst cone as a fraction of its own Xmax — the meaningful headline when
  // drivers differ. Dimensionless, so mixed Xmax values compare directly.
  res.excursionRatio = new Array(npts).fill(0)

  // Interior SPL probes: chambers with params.probe report the acoustic
  // pressure INSIDE the volume (dB SPL at the probe station), read from the
  // transfer-matrix state. Observational only — never loads the circuit.
  const probedChambers = nodes.filter((n) => n.type === 'chamber' && n.data.params.probe)
  res.splInterior = {}
  for (const c of probedChambers) res.splInterior[c.id] = new Array(npts).fill(null)

  // Which radiators are fed (directly or via chain) from a driver FRONT port
  // vs elsewhere, decided during propagation (first pass tags them).

  const combinedPressure = new Array(npts)

  const nlIters = nlActive ? 4 : 1
  for (let nlIter = 0; nlIter < nlIters; nlIter++) {
  for (let i = 0; i < npts; i++) {
    const f = freqs[i]
    const w = 2 * Math.PI * f

    // memoized per-frequency element matrices
    const matCache = new Map()
    /**
     * ABCD matrix of a two-port node at the current frequency, memoized.
     *
     * The cache is per-frequency and is what keeps the cost linear: a chamber
     * reached from three different branches is built once. Throat and mouth
     * areas are stashed on the returned matrix as `S1`/`S2` because downstream
     * radiation and velocity calculations need the geometry and would otherwise
     * have to re-derive it from the params.
     *
     * @param {object} node - A `waveguide` or `chamber` node.
     * @param {number} [Sup] - Upstream exit area, m². Accepted for signature symmetry with `inputZ`; the matrix depends only on the node's own geometry.
     * @returns {ABCD|null} The node's matrix decorated with `S1` and `S2`, or `null` for node types that are not two-ports.
     * @mutates Writes into the per-frequency `matCache`, and sets `S1`/`S2` on the matrix it returns.
     * @reads the current frequency `w` and the `masking` setting from the enclosing scope.
     */
    const getMatrix = (node, Sup) => {
      const key = node.id
      if (matCache.has(key)) return matCache.get(key)
      let M = null
      const p = node.data.params
      if (node.type === 'waveguide') {
        const S1 = Math.max((p.S1 || 50) * 1e-4, 1e-6)
        const S2 = Math.max((p.S2 || 50) * 1e-4, 1e-6)
        const L = Math.max((p.length || 10) * 1e-2, 1e-4)
        const ecT = endCorrectionLength(S1, p.ecOverride ?? 0.0) // throat correction usually small
        const ecM = endCorrectionLength(S2, p.ecFactor ?? 0.732)
        M = waveguideMatrix({ S1, S2, L, flare: p.flare || 'conical', Q: normQ(p), ecThroat: 0, ecMouth: ecM }, w)
        M.S1 = S1; M.S2 = S2
      } else if (node.type === 'chamber') {
        const V = Math.max((p.volume || 20) * 1e-3, 1e-5)
        const L = Math.max((p.length || 30) * 1e-2, 1e-3)
        M = chamberMatrix({ volume: V, length: L, Q: normQ(p), stuffing: p.stuffing || 0 }, w, masking)
        const S = V / L
        M.S1 = S; M.S2 = S
      }
      matCache.set(key, M)
      return M
    }

    // Terminal impedance of a node reached from upstream with exit area Sup
    const zCache = new Map()
    /**
     * Acoustic impedance looking into a node, resolved recursively downstream.
     *
     * This is the backward walk. A two-port asks its downstream neighbours for
     * their impedances, combines parallel branches in shunt, and transforms the
     * result through its own matrix. Terminals answer directly: a radiation
     * node from the piston model, a passive radiator from its own resonance
     * plus radiation loading, and a driver from `driverPassiveMechZ` plus
     * whatever loads its other side.
     *
     * `visited` guards against cycles in the user's graph, which the editor
     * permits — a loop returns a near-infinite impedance so it reads as a
     * blocked path rather than recursing forever.
     *
     * @param {object} node - The node being looked into.
     * @param {string} fromHandle - The handle the caller arrived at, which decides the direction of travel.
     * @param {number|null} Sup - Upstream exit area, m², used as the radiating area when a radiation node has no explicit override.
     * @param {Set<string>} visited - Node ids already on the current path.
     * @returns {Complex} Acoustic impedance, Pa·s/m³.
     * @post `visited` is not modified — each level copies it before recursing.
     * @mutates Writes into the per-frequency `zCache`, stashes the resolved load on `node._Zl`, and tags radiation impedances with `_radS` for the propagation pass.
     * @reads the current frequency `w`, the adjacency index, and the nonlinear scale table via `effDriver`.
     */
    const inputZ = (node, fromHandle, Sup, visited) => {
      const ck = `${node.id}:${fromHandle}`
      if (zCache.has(ck)) return zCache.get(ck)
      if (visited.has(node.id)) return C(1e12, 0) // cycle guard
      const nv = new Set(visited); nv.add(node.id)
      const p = node.data.params
      let Z
      if (node.type === 'radiation') {
        const S = p.areaOverride ? p.areaOverride * 1e-4 : Sup || 1e-2
        Z = radiationImpedance(S, p.space || 'half', w)
        Z._radS = S
      } else if (node.type === 'pr') {
        const Sd = Math.max((p.Sd || 200) * 1e-4, 1e-5)
        const Mm = ((p.Mmd || 50) + (p.addedMass || 0)) * 1e-3
        const Cm = (p.Cms || 0.5) * 1e-3
        const fs = 1 / (2 * Math.PI * Math.sqrt(Mm * Cm))
        const q = normQ(p)
        const Rm = (p.Rms || 2) + (isFinite(q) ? (2 * Math.PI * fs * Mm) / q : 0)
        const Zm = add(C(Rm, 0), add(C(0, w * Mm), div(C(1, 0), jw(w * Cm))))
        const Zrad = radiationImpedance(Sd, p.space || 'half', w)
        Z = add(div(Zm, C(Sd * Sd, 0)), Zrad)
        Z._radS = Sd
      } else if (node.type === 'driver') {
        // Another driver acting as a passive load through one of its ports
        const d = effDriver(node.id, i)
        const otherHandle = fromHandle === 'front' ? 'rear' : 'front'
        const others = adj.get(`${node.id}:${otherHandle}`) || []
        let Zother = others.length
          ? parallel(others.map((o) => inputZ(o.node, o.handle, d.Sd, nv)))
          : radiationImpedance(d.Sd, 'half', w)
        const Zm = driverPassiveMechZ(d, Rg, w)
        Z = add(div(Zm, C(d.Sd * d.Sd, 0)), Zother)
      } else {
        // two-port: waveguide or chamber
        const M = getMatrix(node, Sup)
        const outHandle = node.type === 'waveguide' ? 'mouth' : 'out'
        const downstream = adj.get(`${node.id}:${outHandle}`) || []
        let Zl
        if (downstream.length === 0) {
          Zl = node.type === 'chamber'
            ? C(1e12, 0) // sealed end
            : radiationImpedance(M.S2, 'half', w) // open unconnected duct
        } else {
          Zl = parallel(downstream.map((o) => inputZ(o.node, o.handle, M.S2, nv)))
        }
        node._Zl = Zl // stash for propagation
        Z = zInFromMatrix(M, Zl)
      }
      zCache.set(ck, Z)
      return Z
    }

    // Forward propagation: push (p, U) into a node, record radiator outputs.
    // Volume velocity through each waveguide is accumulated COMPLEX across
    // all propagation passes (a node can be reached from several sources,
    // e.g. a cabin fed by both the driver rear and a port) so the velocity
    // readout stays coherent with the summed SPL.
    const emit = { pressures: [], driverP: ZERO, portP: {}, powers: 0 }
    const wgAcc = new Map() // waveguide id -> { Ut, Um } complex sums
    const probeAcc = new Map() // probed chamber id -> complex interior pressure sum
    /**
     * Push an acoustic state into a node and accumulate everything it radiates.
     *
     * The forward walk, and the counterpart to `inputZ`. Terminals convert
     * volume velocity into far-field pressure at 1 m and add it to the running
     * sums; two-ports carry the state through their matrix and recurse. At a
     * junction the flow is split by admittance, `Uᵢ = p/Zᵢ`.
     *
     * Accumulation is complex, not magnitude, because a node can be reached
     * from several sources — a cabin fed by both a driver's rear and a port —
     * and the port velocity readout has to stay phase-coherent with the summed
     * SPL rather than double-counting.
     *
     * A `rigid` radiation node returns immediately: a closed wall radiates
     * nothing, though it still loaded the circuit during the backward walk.
     *
     * @param {object} node - The node receiving the state.
     * @param {string} fromHandle - Handle the state enters through.
     * @param {Complex} p - Pressure at the entry, Pa.
     * @param {Complex} U - Volume velocity into the entry, m³/s.
     * @param {Set<string>} visited - Node ids already on the current path; revisiting one returns without emitting.
     * @param {boolean} viaFront - Whether this path originates at a driver's front port. Only front-fed radiation counts toward the driver-only SPL overlay.
     * @returns {void}
     * @mutates Accumulates into the enclosing `emit`, `wgAcc` and `probeAcc` collectors, and into the caches `inputZ` and `getMatrix` own.
     * @reads the current frequency `w`, the adjacency index, and the `masking` setting.
     */
    const propagateInto = (node, fromHandle, p, U, visited, viaFront) => {
      if (visited.has(node.id)) return
      const nv = new Set(visited); nv.add(node.id)
      const pd = node.data.params
      if (node.type === 'radiation') {
        if ((pd.space || 'half') === 'rigid') return // no external radiation
        const omega = SOLID_ANGLES[pd.space] ?? 2 * Math.PI
        const pr = mul(C(0, (w * RHO) / (omega * 1.0)), U) // p at 1 m
        emit.pressures.push(pr)
        emit.portP[node.id] = add(emit.portP[node.id] || ZERO, pr)
        if (viaFront) emit.driverP = add(emit.driverP, pr)
        const Zr = inputZ(node, 'in', null, visited)
        emit.powers += abs(U) ** 2 * Zr.re
      } else if (node.type === 'pr') {
        const omega = SOLID_ANGLES[pd.space || 'half'] ?? 2 * Math.PI
        const pr = mul(C(0, (w * RHO) / omega), U)
        emit.pressures.push(pr)
        emit.portP[node.id] = add(emit.portP[node.id] || ZERO, pr)
        const Zr = inputZ(node, 'in', null, visited)
        emit.powers += abs(U) ** 2 * Math.max(Zr.re - 0, 0) * 0 // PR internal losses excluded from radiated power
        const Sd = Math.max((pd.Sd || 200) * 1e-4, 1e-5)
        emit.powers += abs(U) ** 2 * radiationImpedance(Sd, pd.space || 'half', w).re
      } else if (node.type === 'waveguide' || node.type === 'chamber') {
        const M = getMatrix(node)
        const [p2, U2] = propagate(M, p, U)
        if (node.type === 'waveguide') {
          const acc = wgAcc.get(node.id) || { Ut: ZERO, Um: ZERO }
          acc.Ut = add(acc.Ut, U)
          acc.Um = add(acc.Um, U2)
          wgAcc.set(node.id, acc)
        }
        if (node.type === 'chamber' && pd.probe) {
          // Interior pressure at the probe station: propagate through a
          // partial TL matrix covering probePos% of the chamber's length.
          // In masked (lumped) mode pressure is uniform, so the entry value
          // is the probe value.
          const pos = Math.min(Math.max((pd.probePos ?? 100) / 100, 0), 1)
          let px = p
          if (!masking && pos > 1e-3) {
            const pk = `${node.id}:probe`
            let Mx = matCache.get(pk)
            if (!Mx) {
              const V = Math.max((pd.volume || 20) * 1e-3, 1e-5) * pos
              const L = Math.max((pd.length || 30) * 1e-2, 1e-3) * pos
              Mx = chamberMatrix({ volume: V, length: L, Q: normQ(pd), stuffing: pd.stuffing || 0 }, w, false)
              matCache.set(pk, Mx)
            }
            ;[px] = propagate(Mx, p, U)
          }
          probeAcc.set(node.id, add(probeAcc.get(node.id) || ZERO, px))
        }
        const outHandle = node.type === 'waveguide' ? 'mouth' : 'out'
        const downstream = (adj.get(`${node.id}:${outHandle}`) || []).filter((o) => !visited.has(o.node.id))
        if (downstream.length === 0) {
          if (node.type === 'waveguide') {
            // unconnected mouth radiates half-space
            const pr = mul(C(0, (w * RHO) / (2 * Math.PI)), U2)
            emit.pressures.push(pr)
            emit.portP[node.id] = add(emit.portP[node.id] || ZERO, pr)
            if (viaFront) emit.driverP = add(emit.driverP, pr)
            emit.powers += abs(U2) ** 2 * radiationImpedance(M.S2, 'half', w).re
          }
          return
        }
        if (downstream.length === 1) {
          propagateInto(downstream[0].node, downstream[0].handle, p2, U2, nv, viaFront)
        } else {
          // split by admittance at the junction: U_i = p2 / Z_i
          for (const o of downstream) {
            const Zi = inputZ(o.node, o.handle, M.S2, visited)
            const Ui = div(p2, Zi)
            propagateInto(o.node, o.handle, p2, Ui, nv, viaFront)
          }
        }
      }
      // driver-as-passive-load absorbs; no radiation tracked (v1)
    }

    // Superposition over active drivers
    let zinFirst = null
    let excWorst = 0   // largest single-cone displacement, m
    let ratioWorst = 0 // largest displacement as a fraction of that cone's Xmax
    let peReal = 0
    let peApp = 0
    for (const drv of drivers) {
      const d = effDriver(drv.id, i)
      const visited = new Set([drv.id])
      const frontConns = adj.get(`${drv.id}:front`) || []
      const rearConns = adj.get(`${drv.id}:rear`) || []
      const Zfront = frontConns.length
        ? parallel(frontConns.map((o) => inputZ(o.node, o.handle, d.Sd, visited)))
        : radiationImpedance(d.Sd, 'half', w)
      const Zrear = rearConns.length
        ? parallel(rearConns.map((o) => inputZ(o.node, o.handle, d.Sd, visited)))
        : radiationImpedance(d.Sd, 'half', w)

      const Ze = add(C(Rg + d.Re, 0), mul(C(d.Le, 0), jwPow(w, d.LeExp)))
      const RmsEff = d.Rms + (isFinite(d.Q) ? (2 * Math.PI * d.Fs * d.Mms) / d.Q : 0)
      const Zmech = add(C(RmsEff, 0), add(C(0, w * d.Mms), div(C(1, 0), jw(w * d.Cms))))
      const ZmechTot = add(Zmech, mul(C(d.Sd * d.Sd, 0), add(Zfront, Zrear)))
      // cone velocity u = Bl·Eg / (Ze·Zm + Bl²)
      const u = div(mul(C(d.Bl * Eg, 0), C(1, 0)), add(mul(Ze, ZmechTot), C(d.Bl * d.Bl, 0)))
      const U0 = mul(u, C(d.Sd, 0))

      // electrical input impedance (excluding Rg)
      const ZeNoRg = add(C(d.Re, 0), mul(C(d.Le, 0), jwPow(w, d.LeExp)))
      const Zin = add(ZeNoRg, div(C(d.Bl * d.Bl, 0), ZmechTot))
      if (!zinFirst) zinFirst = Zin
      // electrical power drawn at the driver terminals (Eg is RMS)
      const zAbs2 = Zin.re * Zin.re + Zin.im * Zin.im
      peReal += (Eg * Eg * Zin.re) / zAbs2
      peApp += (Eg * Eg) / Math.sqrt(zAbs2)

      const xPk = (abs(u) * Math.SQRT2) / w // peak displacement m
      // Displacements of different cones are not additive — each driver moves
      // its own xPk. The aggregate series reports the worst offender.
      if (xPk > excWorst) excWorst = xPk
      if (d.Xmax > 0) ratioWorst = Math.max(ratioWorst, xPk / d.Xmax)
      res.excursionByDriver[drv.id][i] = xPk * 1000 // mm

      // front branch(es)
      if (frontConns.length) {
        if (frontConns.length === 1) {
          propagateInto(frontConns[0].node, frontConns[0].handle, mul(Zfront, U0), U0, visited, true)
        } else {
          const pf = mul(Zfront, U0)
          for (const o of frontConns) {
            const Zi = inputZ(o.node, o.handle, d.Sd, visited)
            propagateInto(o.node, o.handle, pf, div(pf, Zi), visited, true)
          }
        }
      } else {
        // bare front cone radiates half space
        const pr = mul(C(0, (w * RHO) / (2 * Math.PI)), U0)
        emit.pressures.push(pr)
        emit.driverP = add(emit.driverP, pr)
        emit.powers += abs(U0) ** 2 * radiationImpedance(d.Sd, 'half', w).re
      }
      // rear branch(es), opposite polarity
      const U0r = mul(U0, C(-1, 0))
      if (rearConns.length) {
        const prr = mul(Zrear, U0r)
        if (rearConns.length === 1) {
          propagateInto(rearConns[0].node, rearConns[0].handle, prr, U0r, visited, false)
        } else {
          for (const o of rearConns) {
            const Zi = inputZ(o.node, o.handle, d.Sd, visited)
            propagateInto(o.node, o.handle, prr, div(prr, Zi), visited, false)
          }
        }
      }
    }

    // interior SPL from coherently summed probe pressures
    for (const [cid, psum] of probeAcc) {
      if (res.splInterior[cid]) res.splInterior[cid][i] = 20 * Math.log10(Math.max(abs(psum), 1e-12) / P_REF)
    }

    // waveguide velocities from coherently summed volume velocity
    for (const [wid, acc] of wgAcc) {
      const M = matCache.get(wid)
      if (!M) continue
      const vt = abs(acc.Ut) / M.S1
      const vm = abs(acc.Um) / M.S2
      res.velocity[wid][i] = Math.max(vt, vm) * Math.SQRT2 // peak
    }

    // aggregate
    let pTot = ZERO
    for (const pr of emit.pressures) pTot = add(pTot, pr)
    combinedPressure[i] = pTot
    const mag = abs(pTot)
    res.splCombined[i] = 20 * Math.log10(Math.max(mag, 1e-12) / P_REF)
    const dmag = abs(emit.driverP)
    res.splDriver[i] = dmag > 1e-12 ? 20 * Math.log10(dmag / P_REF) : null
    for (const rid of Object.keys(res.splPorts)) {
      const pp = emit.portP[rid]
      res.splPorts[rid][i] = pp ? 20 * Math.log10(Math.max(abs(pp), 1e-12) / P_REF) : null
    }
    res.zinMag[i] = zinFirst ? abs(zinFirst) : 0
    res.zinPhase[i] = zinFirst ? (arg(zinFirst) * 180) / Math.PI : 0
    res.excursion[i] = excWorst * 1000 // mm
    res.excursionRatio[i] = ratioWorst
    res.power[i] = emit.powers
    res.peReal[i] = peReal
    res.peApparent[i] = peApp
    res.phase[i] = (arg(pTot) * 180) / Math.PI
  }

  // refine nonlinear parameter scales from this sweep's excursions
  if (nlActive && nlIter < nlIters - 1) {
    const DAMP = 0.6
    for (const drv of drivers) {
      const nl = drv.data.params.nl
      if (!hasNL(nl)) continue
      const s = nlScales.get(drv.id)
      const xs = res.excursionByDriver[drv.id]
      const xm = drv.data.params.Xmax || 10
      for (let i = 0; i < npts; i++) {
        const X = xs[i]
        s.bl[i] = s.bl[i] * (1 - DAMP) + DAMP * cycleAverage(nl.Bl, X, xm)
        s.cms[i] = s.cms[i] * (1 - DAMP) + DAMP * complianceRatio(nl, X, xm)
        s.le[i] = s.le[i] * (1 - DAMP) + DAMP * cycleAverage(nl.Le, X, xm)
      }
    }
  }
  } // nl iterations
  res.nl = { active: nlActive, iterations: nlIters }

  // unwrap phase & group delay
  const unwrapped = new Array(npts)
  unwrapped[0] = res.phase[0]
  for (let i = 1; i < npts; i++) {
    let d = res.phase[i] - res.phase[i - 1]
    while (d > 180) d -= 360
    while (d < -180) d += 360
    unwrapped[i] = unwrapped[i - 1] + d
  }
  res.phaseUnwrapped = unwrapped
  for (let i = 0; i < npts; i++) {
    const i0 = Math.max(0, i - 1)
    const i1 = Math.min(npts - 1, i + 1)
    const df = freqs[i1] - freqs[i0]
    res.groupDelay[i] = df > 0 ? (-(unwrapped[i1] - unwrapped[i0]) / 360 / df) * 1000 : 0
  }
  res.elapsedMs = performance.now() - t0
  return res
}

// Module-private functions, exposed for the contract test suite only
// (test/contract/*). Not part of this module's public API — application code
// must not import from here, and nothing outside the tests does.
export const __internals = { normQ, driverPassiveMechZ, buildGraph }
