// Graph → nodal admittance solver.
//
// Where solver.js walks the graph — combining impedances back from the
// termination, then pushing pressure and volume velocity forward — this solver
// writes one conservation equation per acoustic junction and solves them
// simultaneously:
//
//     Y · p = U        Y  admittance matrix over junctions ("nets")
//                      p  unknown pressures
//                      U  volume velocity injected by the sources
//
// Same physics, same component models, different bookkeeping. The walk is
// exact on a tree and both solvers agree there to rounding error, but it
// cannot express a junction where two sources meet: two drivers whose rears
// enter one chamber have to be superposed independently, so neither feels the
// other stiffening the box. Nodal analysis has no such restriction — every
// element is present in one system of equations, so mutual loading, a driver
// being shaken by its neighbour, and any topology with loops all fall out of
// the solution rather than needing special cases.
//
// Conventions match solver.js: pressure p (Pa) is the across variable, volume
// velocity U (m³/s) the through variable, and "ground" is the ambient outside
// the system, p = 0.
import {
  C, ZERO, add, sub, mul, div, inv, abs, arg, jw, solveLinear,
} from './complex.js'
import {
  RHO, SOLID_ANGLES, radiationImpedance, waveguideMatrix, chamberMatrix,
  endCorrectionLength,
} from './acoustics.js'
import {
  driverSI, normQ, driverZe, driverZm, buildGraph, validateGraph,
  outHandleOf, inHandleOf,
} from './network.js'
import { cycleAverage, complianceRatio, hasNL } from './nonlinear.js'

const P_REF = 20e-6
const SEALED_Y = C(1e-12, 0) // a dead end leaks as little as the chain solver's 1e12 Ω

// Handles each node type exposes, in [input, output] order.
const HANDLES = {
  driver: ['front', 'rear'],
  chamber: ['in', 'out'],
  waveguide: ['throat', 'mouth'],
  radiation: ['in'],
  pr: ['in'],
}

// ---------- nets: which handles share a junction ----------

// Every handle joined by an edge is the same acoustic point. Union-find gives
// each group one index; those indices are the unknowns of the linear system.
function buildNets(nodes, edges, shorted = new Set()) {
  const parent = new Map()
  const find = (k) => {
    let r = k
    while (parent.get(r) !== r) r = parent.get(r)
    while (parent.get(k) !== r) { const nx = parent.get(k); parent.set(k, r); k = nx }
    return r
  }
  const union = (a, b) => {
    const ra = find(a), rb = find(b)
    if (ra !== rb) parent.set(ra, rb)
  }
  const byId = new Map(nodes.map((n) => [n.id, n]))
  for (const n of nodes) for (const h of HANDLES[n.type] || []) parent.set(`${n.id}:${h}`, `${n.id}:${h}`)
  for (const e of edges) {
    const a = `${e.source}:${e.sourceHandle}`
    const b = `${e.target}:${e.targetHandle}`
    if (!byId.has(e.source) || !byId.has(e.target)) continue
    if (!parent.has(a) || !parent.has(b)) continue
    union(a, b)
  }
  // A lumped element has no length, so its two faces are the same acoustic
  // point. Merging the nets is exact where a large bridging admittance would
  // only approximate the short.
  for (const id of shorted) {
    const n = byId.get(id)
    if (n) union(`${id}:${inHandleOf(n.type)}`, `${id}:${outHandleOf(n.type)}`)
  }
  const index = new Map() // root -> net index
  const netOf = new Map() // endpoint -> net index
  for (const key of parent.keys()) {
    const r = find(key)
    if (!index.has(r)) index.set(r, index.size)
    netOf.set(key, index.get(r))
  }
  return { netOf, count: index.size }
}

// Cross-sectional area a handle presents, used to size a radiation load that
// does not carry an explicit area of its own.
function handleArea(node, handle) {
  const p = node.data.params
  if (node.type === 'driver') return driverSI(p).Sd
  if (node.type === 'waveguide') {
    return Math.max((handle === 'throat' ? p.S1 : p.S2) * 1e-4 || 1e-4, 1e-6)
  }
  if (node.type === 'chamber') {
    const V = Math.max((p.volume || 20) * 1e-3, 1e-5)
    const L = Math.max((p.length || 30) * 1e-2, 1e-3)
    return V / L
  }
  if (node.type === 'pr') return Math.max((p.Sd || 200) * 1e-4, 1e-5)
  return 1e-2
}

export function runSimulationNodal(nodes, edges, settings) {
  const t0 = performance.now()
  const { adj } = buildGraph(nodes, edges)
  const validation = validateGraph(nodes, edges, 'nodal')
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
  const twoPorts = nodes.filter((n) => n.type === 'waveguide' || n.type === 'chamber')
  // Masking replaces every chamber transmission line with a pure compliance:
  // a shunt with no through path, so its ports collapse onto one net.
  const lumped = new Set(masking ? nodes.filter((n) => n.type === 'chamber').map((n) => n.id) : [])
  const { netOf, count: nNets } = buildNets(nodes, edges, lumped)
  const connected = (id, h) => (adj.get(`${id}:${h}`) || []).length > 0

  const res = {
    ok: true,
    validation,
    freqs,
    splCombined: new Array(npts),
    splDriver: new Array(npts).fill(null),
    splPorts: {},
    zinMag: new Array(npts),
    zinPhase: new Array(npts),
    excursion: new Array(npts),
    velocity: {},
    power: new Array(npts),
    peReal: new Array(npts),
    peApparent: new Array(npts),
    phase: new Array(npts),
    groupDelay: new Array(npts),
    solver: 'nodal',
  }
  for (const wg of waveguides) res.velocity[wg.id] = new Array(npts).fill(0)
  for (const r of radiators) res.splPorts[r.id] = new Array(npts).fill(null)
  const mouthConnected = new Set(edges.filter((e) => e.sourceHandle === 'mouth').map((e) => e.source))
  for (const wg of waveguides) {
    if (!mouthConnected.has(wg.id)) res.splPorts[wg.id] = new Array(npts).fill(null)
  }
  res.excursionByDriver = {}
  res.xmaxByDriver = {}
  const driverSIs = new Map(drivers.map((d) => [d.id, driverSI(d.data.params)]))
  for (const d of drivers) {
    res.excursionByDriver[d.id] = new Array(npts).fill(0)
    res.xmaxByDriver[d.id] = driverSIs.get(d.id).Xmax * 1000
  }
  res.excursionRatio = new Array(npts).fill(0)
  const probedChambers = nodes.filter((n) => n.type === 'chamber' && n.data.params.probe)
  res.splInterior = {}
  for (const c of probedChambers) res.splInterior[c.id] = new Array(npts).fill(null)

  // Which radiating elements sit on the front side of a driver. The chain
  // solver learns this while propagating; here it is a property of the graph,
  // found once by walking outward from each front port without passing through
  // another driver.
  const frontFed = new Set()
  for (const drv of drivers) {
    const seen = new Set([drv.id])
    const queue = (adj.get(`${drv.id}:front`) || []).map((o) => o.node)
    while (queue.length) {
      const n = queue.shift()
      if (seen.has(n.id)) continue
      seen.add(n.id)
      frontFed.add(n.id)
      if (n.type === 'driver') continue // a driver is a boundary, not a conduit
      for (const h of HANDLES[n.type] || []) {
        for (const o of adj.get(`${n.id}:${h}`) || []) if (!seen.has(o.node.id)) queue.push(o.node)
      }
    }
  }

  // ---- nonlinear scale factors, refined between sweeps (same scheme as the
  // chain solver: quasi-linear, so it models compression and resonance drift,
  // never harmonics) ----
  const nlActive = !!settings.nlEnabled && drivers.some((d) => hasNL(d.data.params.nl))
  const nlScales = new Map()
  for (const d of drivers) {
    nlScales.set(d.id, {
      bl: new Float64Array(npts).fill(1),
      cms: new Float64Array(npts).fill(1),
      le: new Float64Array(npts).fill(1),
    })
  }
  const effDriver = (id, i) => {
    const d = driverSIs.get(id)
    if (!nlActive) return d
    const s = nlScales.get(id)
    return { ...d, Bl: d.Bl * s.bl[i], Cms: d.Cms * s.cms[i], Le: d.Le * s.le[i] }
  }

  // Two-port matrices depend only on frequency, so build them once per point.
  const matrixFor = (node, w) => {
    const p = node.data.params
    if (node.type === 'waveguide') {
      const S1 = Math.max((p.S1 || 50) * 1e-4, 1e-6)
      const S2 = Math.max((p.S2 || 50) * 1e-4, 1e-6)
      const L = Math.max((p.length || 10) * 1e-2, 1e-4)
      const ecM = endCorrectionLength(S2, p.ecFactor ?? 0.732)
      const M = waveguideMatrix({ S1, S2, L, flare: p.flare || 'conical', Q: normQ(p), ecThroat: 0, ecMouth: ecM }, w)
      M.S1 = S1; M.S2 = S2
      return M
    }
    const V = Math.max((p.volume || 20) * 1e-3, 1e-5)
    const L = Math.max((p.length || 30) * 1e-2, 1e-3)
    const M = chamberMatrix({ volume: V, length: L, Q: normQ(p), stuffing: p.stuffing || 0 }, w, masking)
    const S = V / L
    M.S1 = S; M.S2 = S
    return M
  }

  // Shunt impedance of a passive radiator: its mechanical branch referred to
  // the acoustic domain, in series with what its cone radiates into.
  const prImpedance = (p, w) => {
    const Sd = Math.max((p.Sd || 200) * 1e-4, 1e-5)
    const Mm = ((p.Mmd || 50) + (p.addedMass || 0)) * 1e-3
    const Cm = (p.Cms || 0.5) * 1e-3
    const fs = 1 / (2 * Math.PI * Math.sqrt(Mm * Cm))
    const q = normQ(p)
    const Rm = (p.Rms || 2) + (isFinite(q) ? (2 * Math.PI * fs * Mm) / q : 0)
    const Zm = add(C(Rm, 0), add(C(0, w * Mm), div(C(1, 0), jw(w * Cm))))
    const Z = add(div(Zm, C(Sd * Sd, 0)), radiationImpedance(Sd, p.space || 'half', w))
    Z._radS = Sd
    return Z
  }

  const combinedPressure = new Array(npts)
  const nlIters = nlActive ? 4 : 1

  for (let nlIter = 0; nlIter < nlIters; nlIter++) {
  for (let i = 0; i < npts; i++) {
    const f = freqs[i]
    const w = 2 * Math.PI * f

    // ---- assemble ----
    const Y = Array.from({ length: nNets }, () => new Array(nNets).fill(ZERO))
    const I = new Array(nNets).fill(ZERO)
    const stampY = (a, b, y) => { // admittance between two nets
      Y[a][a] = add(Y[a][a], y)
      Y[b][b] = add(Y[b][b], y)
      Y[a][b] = sub(Y[a][b], y)
      Y[b][a] = sub(Y[b][a], y)
    }
    const stampShunt = (a, y) => { Y[a][a] = add(Y[a][a], y) } // net → ambient
    const stampI = (from, to, cur) => { // volume velocity source, from → to
      I[to] = add(I[to], cur)
      I[from] = sub(I[from], cur)
    }

    const mats = new Map()
    for (const n of twoPorts) mats.set(n.id, matrixFor(n, w))

    // Terminations for handles left unconnected: a duct end radiates, a
    // chamber end is sealed, a bare driver side sees half space.
    const shunts = new Map() // `${id}:${handle}` -> { Z, S, space, radiates }
    const addShunt = (key, net, Z, opts = {}) => {
      shunts.set(key, { net, Z, ...opts })
      stampShunt(net, inv(Z))
    }
    for (const n of nodes) {
      for (const h of HANDLES[n.type] || []) {
        if (connected(n.id, h)) continue
        const net = netOf.get(`${n.id}:${h}`)
        if (n.type === 'chamber') { stampShunt(net, SEALED_Y); continue }
        if (n.type === 'radiation' || n.type === 'pr') continue // element itself is the shunt
        const S = handleArea(n, h)
        addShunt(`${n.id}:${h}`, net, radiationImpedance(S, 'half', w), {
          S, space: 'half', radiates: true, owner: n.id, implicit: true, handle: h,
        })
      }
    }

    // Radiation terminations and passive radiators: a shunt to ambient.
    for (const n of radiators) {
      const net = netOf.get(`${n.id}:in`)
      const p = n.data.params
      if (n.type === 'radiation') {
        const space = p.space || 'half'
        const feeds = adj.get(`${n.id}:in`) || []
        // Several sources arriving at one termination are one opening of their
        // combined area — two cones on a baffle radiate as the pair, not as
        // whichever happened to be wired first.
        const S = p.areaOverride
          ? p.areaOverride * 1e-4
          : (feeds.length ? feeds.reduce((a, o) => a + handleArea(o.node, o.handle), 0) : 1e-2)
        addShunt(`${n.id}:in`, net, radiationImpedance(S, space, w), {
          S, space, radiates: space !== 'rigid', owner: n.id,
        })
      } else {
        const Z = prImpedance(p, w)
        addShunt(`${n.id}:in`, net, Z, {
          S: Z._radS, space: p.space || 'half', radiates: true, owner: n.id, isPr: true,
        })
      }
    }

    // Two-ports as Y-parameters. ABCD [p1;U1] = M·[p2;U2] converts to
    //   Y11 = D/B, Y12 = -(AD-BC)/B, Y21 = -1/B, Y22 = A/B
    // with both port currents defined as flowing into the element. B vanishes
    // for a pure shunt (a masked chamber is exactly that), so that case is
    // stamped directly instead.
    const yParams = new Map()
    for (const n of twoPorts) {
      const M = mats.get(n.id)
      const nIn = netOf.get(`${n.id}:${inHandleOf(n.type)}`)
      const nOut = netOf.get(`${n.id}:${outHandleOf(n.type)}`)
      const [A, B] = M[0]
      const [Cc, D] = M[1]
      if (B.abs() < 1e-12) {
        // No through path: the ports already share a net (see buildNets), so
        // all that remains is the shunt to ambient.
        stampShunt(nIn, Cc)
        yParams.set(n.id, { shunt: true, Y: Cc, nIn, nOut })
        continue
      }
      const y11 = div(D, B)
      const y12 = div(sub(mul(Cc, B), mul(A, D)), B)
      const y21 = div(C(-1, 0), B)
      const y22 = div(A, B)
      Y[nIn][nIn] = add(Y[nIn][nIn], y11)
      Y[nIn][nOut] = add(Y[nIn][nOut], y12)
      Y[nOut][nIn] = add(Y[nOut][nIn], y21)
      Y[nOut][nOut] = add(Y[nOut][nOut], y22)
      yParams.set(n.id, { y11, y12, y21, y22, nIn, nOut })
    }

    // Drivers. Force balance on the cone with pressure on both faces:
    //   U = Sd·Bl·Eg/(Ze·Zmt) − (Sd²/Zmt)·(p_front − p_rear)
    // which is a volume-velocity source in parallel with Sd²/Zmt — the cone's
    // own mobility, and the path by which one driver shakes another.
    const drvStamp = new Map()
    for (const drv of drivers) {
      const d = effDriver(drv.id, i)
      const nF = netOf.get(`${drv.id}:front`)
      const nR = netOf.get(`${drv.id}:rear`)
      const Ze = driverZe(d, Rg, w)
      const Zmt = add(driverZm(d, w), div(C(d.Bl * d.Bl, 0), Ze))
      const Yd = div(C(d.Sd * d.Sd, 0), Zmt)
      const Isc = div(C(d.Sd * d.Bl * Eg, 0), mul(Ze, Zmt))
      stampY(nF, nR, Yd)
      stampI(nR, nF, Isc) // pushes out of the front, draws in at the rear
      drvStamp.set(drv.id, { d, nF, nR, Ze, Zmt, Yd, Isc })
    }

    // ---- solve ----
    const p = solveLinear(Y, I)
    if (!p) { // singular: leave this point empty rather than emitting garbage
      res.splCombined[i] = null
      combinedPressure[i] = ZERO
      res.zinMag[i] = 0; res.zinPhase[i] = 0
      res.excursion[i] = 0; res.excursionRatio[i] = 0
      res.power[i] = 0; res.peReal[i] = 0; res.peApparent[i] = 0; res.phase[i] = 0
      continue
    }

    // ---- read the answer back out ----
    let pTot = ZERO
    let driverP = ZERO
    let powers = 0
    let peReal = 0, peApp = 0
    let zinFirst = null
    let excWorst = 0, ratioWorst = 0

    for (const drv of drivers) {
      const st = drvStamp.get(drv.id)
      const dp = sub(p[st.nF], p[st.nR])
      const U = sub(st.Isc, mul(st.Yd, dp))       // volume velocity out of the front face
      const u = div(U, C(st.d.Sd, 0))             // cone velocity
      const xPk = (abs(u) * Math.SQRT2) / w
      if (xPk > excWorst) excWorst = xPk
      if (st.d.Xmax > 0) ratioWorst = Math.max(ratioWorst, xPk / st.d.Xmax)
      res.excursionByDriver[drv.id][i] = xPk * 1000

      // terminal current from the motor equation, then the impedance the
      // amplifier actually sees
      const cur = div(sub(C(Eg, 0), mul(C(st.d.Bl, 0), u)), st.Ze)
      const Zin = sub(div(C(Eg, 0), cur), C(Rg, 0))
      if (!zinFirst) zinFirst = Zin
      const zAbs2 = Zin.re * Zin.re + Zin.im * Zin.im
      if (zAbs2 > 1e-12) {
        peReal += (Eg * Eg * Zin.re) / zAbs2
        peApp += (Eg * Eg) / Math.sqrt(zAbs2)
      }
    }

    // Radiating shunts: whatever flows into one leaves the system as sound.
    const portP = {}
    for (const [, sh] of shunts) {
      if (!sh.radiates) continue
      const U = div(p[sh.net], sh.Z)
      const omega = SOLID_ANGLES[sh.space] ?? 2 * Math.PI
      const pr = mul(C(0, (w * RHO) / omega), U) // pressure at 1 m
      pTot = add(pTot, pr)
      portP[sh.owner] = add(portP[sh.owner] || ZERO, pr)
      // "Driver" SPL is what the cones put into the room directly: a bare
      // front face, or anything downstream of one.
      if (frontFed.has(sh.owner) || sh.handle === 'front') driverP = add(driverP, pr)
      const Zrad = sh.isPr ? radiationImpedance(sh.S, sh.space, w) : sh.Z
      powers += abs(U) ** 2 * Zrad.re
    }

    // Duct velocities, from the volume velocity at each end.
    for (const wg of waveguides) {
      const yp = yParams.get(wg.id)
      const M = mats.get(wg.id)
      if (!yp || !M) continue
      let Ut, Um
      if (yp.shunt) {
        Ut = mul(p[yp.nIn], yp.Y); Um = Ut
      } else {
        Ut = add(mul(yp.y11, p[yp.nIn]), mul(yp.y12, p[yp.nOut]))
        Um = mul(add(mul(yp.y21, p[yp.nIn]), mul(yp.y22, p[yp.nOut])), C(-1, 0))
      }
      res.velocity[wg.id][i] = Math.max(abs(Ut) / M.S1, abs(Um) / M.S2) * Math.SQRT2
    }

    // Interior probes: step the partial line matrix from the chamber inlet.
    for (const ch of probedChambers) {
      const yp = yParams.get(ch.id)
      if (!yp) continue
      const pd = ch.data.params
      const p1 = p[yp.nIn]
      const U1 = yp.shunt ? mul(p1, yp.Y) : add(mul(yp.y11, p1), mul(yp.y12, p[yp.nOut]))
      const pos = Math.min(Math.max((pd.probePos ?? 100) / 100, 0), 1)
      let px = p1
      if (!masking && pos > 1e-3) {
        const V = Math.max((pd.volume || 20) * 1e-3, 1e-5) * pos
        const L = Math.max((pd.length || 30) * 1e-2, 1e-3) * pos
        const Mx = chamberMatrix({ volume: V, length: L, Q: normQ(pd), stuffing: pd.stuffing || 0 }, w, false)
        const det = sub(mul(Mx[0][0], Mx[1][1]), mul(Mx[0][1], Mx[1][0]))
        px = div(sub(mul(Mx[1][1], p1), mul(Mx[0][1], U1)), det)
      }
      res.splInterior[ch.id][i] = 20 * Math.log10(Math.max(abs(px), 1e-12) / P_REF)
    }

    combinedPressure[i] = pTot
    res.splCombined[i] = 20 * Math.log10(Math.max(abs(pTot), 1e-12) / P_REF)
    const dmag = abs(driverP)
    res.splDriver[i] = dmag > 1e-12 ? 20 * Math.log10(dmag / P_REF) : null
    for (const rid of Object.keys(res.splPorts)) {
      const pp = portP[rid]
      res.splPorts[rid][i] = pp ? 20 * Math.log10(Math.max(abs(pp), 1e-12) / P_REF) : null
    }
    res.zinMag[i] = zinFirst ? abs(zinFirst) : 0
    res.zinPhase[i] = zinFirst ? (arg(zinFirst) * 180) / Math.PI : 0
    res.excursion[i] = excWorst * 1000
    res.excursionRatio[i] = ratioWorst
    res.power[i] = powers
    res.peReal[i] = peReal
    res.peApparent[i] = peApp
    res.phase[i] = (arg(pTot) * 180) / Math.PI
  }

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
