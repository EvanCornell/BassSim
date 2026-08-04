import { test } from 'node:test'
import assert from 'node:assert/strict'
import { driverSI, validateGraph, runSimulation, __internals } from '../../src/engine/solver.js'

const { normQ, driverPassiveMechZ, buildGraph } = __internals

// UNREACHABLE — not covered:
//   validateGraph > connected(id, h)
//   runSimulation > effDriver(id, i)
//   runSimulation > getMatrix(node, Sup)
//   runSimulation > inputZ(node, fromHandle, Sup, visited)
//   runSimulation > propagateInto(node, fromHandle, p, U, visited, viaFront)

// --- fixtures ----------------------------------------------------------
// CONTRACT (module): "Graph → transfer-matrix chain solver. Convention: ABCD
//            matrices map [p_in; U_in] = M · [p_out; U_out] with p = acoustic
//            pressure (Pa), U = volume velocity (m^3/s)."
//
// Node types ARE spec-supported: `getMatrix` names "a `waveguide` or `chamber`
// node", and `inputZ` names "a radiation node", "a passive radiator" and "a
// driver".
//
// AMBIGUITY (UNRESOLVED): handle strings are still nowhere documented. The
// module section added by the regeneration states only the ABCD convention and
// names no handles. `front`/`rear` on a driver comes from the nodes.jsx contract
// ("front/rear ports"); `throat`/`mouth` on a waveguide is the only handle pair
// the solver's own prose supports ("Throat and mouth areas", "an unconnected
// mouth is a working port"). The chamber's and radiation node's handles are
// guesses with no support anywhere in the pack.

const DRIVER_PARAMS = {
  Re: 6, Le: 1, Bl: 10, Sd: 500, Mms: 100, Cms: 0.2,
  Rms: 2, Fs: 30, Xmax: 8, Q: 5, count: 1, wiring: 'single',
}

const driverNode = (id = 'd1') => ({ id, type: 'driver', data: { params: { ...DRIVER_PARAMS } } })
const radNode = (id) => ({ id, type: 'radiation', data: { params: {} } })

// Smallest graph the contract implies: one driver radiating from both faces.
function smallGraph() {
  const nodes = [driverNode('d1'), radNode('r1'), radNode('r2')]
  const edges = [
    { source: 'd1', sourceHandle: 'front', target: 'r1', targetHandle: 'in' },
    { source: 'd1', sourceHandle: 'rear', target: 'r2', targetHandle: 'in' },
  ]
  return { nodes, edges }
}

// A real transfer-matrix *chain*, as the module section describes: the driver's
// rear loads a chamber, the chamber feeds a waveguide, and the waveguide's mouth
// radiates. This puts genuine two-port nodes on the backward walk, which is what
// `inputZ` — the documented writer of `node._Zl` — traverses.
function chainGraph() {
  const nodes = [
    driverNode('d1'),
    radNode('r1'),
    { id: 'c1', type: 'chamber', data: { params: { V: 40, Q: 10 } } },
    { id: 'w1', type: 'waveguide', data: { params: { S1: 50, S2: 50, L: 20, Q: 20 } } },
    radNode('r2'),
  ]
  const edges = [
    { source: 'd1', sourceHandle: 'front', target: 'r1', targetHandle: 'in' },
    { source: 'd1', sourceHandle: 'rear', target: 'c1', targetHandle: 'in' },
    { source: 'c1', sourceHandle: 'out', target: 'w1', targetHandle: 'throat' },
    { source: 'w1', sourceHandle: 'mouth', target: 'r2', targetHandle: 'in' },
  ]
  return { nodes, edges }
}

const SUCCESS_KEYS = [
  'ok', 'validation', 'freqs', 'splCombined', 'splDriver', 'splPorts', 'splInterior',
  'zinMag', 'zinPhase', 'excursion', 'excursionByDriver', 'excursionRatio', 'xmaxByDriver',
  'velocity', 'power', 'peReal', 'peApparent', 'phase', 'phaseUnwrapped', 'groupDelay',
  'nl', 'elapsedMs',
]

// ======================================================================
// driverSI(p)
// ======================================================================

// CONTRACT: "`{n: number, s: number, par: number, Re: number, Le: number,
//            LeExp: number, Bl: number, Sd: number, Mms: number, Cms: number,
//            Rms: number, Fs: number, Xmax: number, Q: number}`"
test('driverSI: returns the documented keys, all numbers', () => {
  const r = driverSI({ ...DRIVER_PARAMS })
  const keys = ['n', 's', 'par', 'Re', 'Le', 'LeExp', 'Bl', 'Sd', 'Mms', 'Cms',
    'Rms', 'Fs', 'Xmax', 'Q']
  for (const k of keys) {
    assert.ok(Object.hasOwn(r, k), `missing key ${k}`)
    assert.equal(typeof r[k], 'number', `${k} is not a number`)
  }
})

// CONTRACT: "Convert a driver node's display-unit parameters into the SI set the
//            solver runs on."
// CONTRACT: "`p` — Driver node params in display units (Sd cm², Mms g,
//            Cms mm/N, Le mH, Xmax mm)."
test('driverSI: converts the display units to SI', () => {
  const r = driverSI({ ...DRIVER_PARAMS, count: 1, wiring: 'single' })
  assert.ok(Math.abs(r.Sd - 0.05) < 1e-12, `Sd ${r.Sd}`) // 500 cm² -> 0.05 m²
  assert.ok(Math.abs(r.Mms - 0.1) < 1e-12, `Mms ${r.Mms}`) // 100 g -> 0.1 kg
  assert.ok(Math.abs(r.Cms - 0.0002) < 1e-15, `Cms ${r.Cms}`) // 0.2 mm/N -> 2e-4 m/N
  assert.ok(Math.abs(r.Le - 0.001) < 1e-15, `Le ${r.Le}`) // 1 mH -> 1e-3 H
  assert.ok(Math.abs(r.Xmax - 0.008) < 1e-15, `Xmax ${r.Xmax}`) // 8 mm -> 8e-3 m
  // fields the spec does not list as display units are already SI
  assert.equal(r.Re, 6)
  assert.equal(r.Bl, 10)
  assert.equal(r.Rms, 2)
  assert.equal(r.Fs, 30)
})

// CONTRACT: "Series wiring multiplies Re, Le and Bl by the count"
test('driverSI: series wiring multiplies Re, Le and Bl by the count', () => {
  const r = driverSI({ ...DRIVER_PARAMS, count: 2, wiring: 'series' })
  assert.equal(r.n, 2)
  assert.equal(r.s, 2)
  assert.equal(r.par, 1)
  assert.ok(Math.abs(r.Re - 12) < 1e-12, `Re ${r.Re}`)
  assert.ok(Math.abs(r.Le - 0.002) < 1e-15, `Le ${r.Le}`)
  assert.ok(Math.abs(r.Bl - 20) < 1e-12, `Bl ${r.Bl}`)
})

// CONTRACT: "parallel wiring divides the electrical terms"
// AMBIGUITY: "the electrical terms" is not enumerated. The sentence names Re, Le
// and Bl for series and then says only "the electrical terms" for parallel, so
// Bl — named separately — is read as unchanged in parallel.
test('driverSI: parallel wiring divides the electrical terms by the count', () => {
  const r = driverSI({ ...DRIVER_PARAMS, count: 2, wiring: 'parallel' })
  assert.equal(r.n, 2)
  assert.equal(r.s, 1)
  assert.equal(r.par, 2)
  assert.ok(Math.abs(r.Re - 3) < 1e-12, `Re ${r.Re}`)
  assert.ok(Math.abs(r.Le - 0.0005) < 1e-15, `Le ${r.Le}`)
  assert.ok(Math.abs(r.Bl - 10) < 1e-12, `Bl ${r.Bl}`)
})

// CONTRACT: "series-parallel splits the count into a square grid when it is a
//            perfect square"
test('driverSI: series-parallel splits a perfect square count into a square grid', () => {
  const r4 = driverSI({ ...DRIVER_PARAMS, count: 4, wiring: 'series-parallel' })
  assert.equal(r4.n, 4)
  assert.equal(r4.s, 2)
  assert.equal(r4.par, 2)
  // s series strings of par groups: Re scales by s and divides by par.
  assert.ok(Math.abs(r4.Re - 6) < 1e-12, `Re ${r4.Re}`)
  assert.ok(Math.abs(r4.Bl - 20) < 1e-12, `Bl ${r4.Bl}`)

  const r9 = driverSI({ ...DRIVER_PARAMS, count: 9, wiring: 'series-parallel' })
  assert.equal(r9.n, 9)
  assert.equal(r9.s, 3)
  assert.equal(r9.par, 3)
})

// CONTRACT: "and falls back to plain parallel when it is not [a perfect square]"
test('driverSI: series-parallel falls back to plain parallel for a non-square count', () => {
  const r = driverSI({ ...DRIVER_PARAMS, count: 2, wiring: 'series-parallel' })
  assert.equal(r.n, 2)
  assert.equal(r.s, 1)
  assert.equal(r.par, 2)
  assert.ok(Math.abs(r.Re - 3) < 1e-12, `Re ${r.Re}`)
})

// CONTRACT: "The mechanical side scales with cone count regardless of wiring:
//            Sd, Mms and Rms multiply, Cms divides."
test('driverSI: the mechanical side scales with cone count regardless of wiring', () => {
  for (const wiring of ['single', 'series', 'parallel', 'series-parallel']) {
    const r = driverSI({ ...DRIVER_PARAMS, count: 4, wiring })
    assert.equal(r.n, 4, `n for ${wiring}`)
    assert.ok(Math.abs(r.Sd - 0.05 * 4) < 1e-12, `Sd for ${wiring}: ${r.Sd}`)
    assert.ok(Math.abs(r.Mms - 0.1 * 4) < 1e-12, `Mms for ${wiring}: ${r.Mms}`)
    assert.ok(Math.abs(r.Rms - 2 * 4) < 1e-12, `Rms for ${wiring}: ${r.Rms}`)
    assert.ok(Math.abs(r.Cms - 0.0002 / 4) < 1e-15, `Cms for ${wiring}: ${r.Cms}`)
  }
})

// CONTRACT: "Every field has a fallback, so a partially filled node still
//            simulates rather than producing NaN."
test('driverSI: every field has a fallback — an empty params object gives no NaN', () => {
  for (const p of [{}, { Re: 4 }, { Sd: 300, count: 2 }]) {
    const r = driverSI(p)
    for (const [k, v] of Object.entries(r)) {
      assert.equal(typeof v, 'number', `${k} is not a number`)
      assert.ok(Number.isFinite(v), `${k} is not finite: ${v}`)
    }
  }
})

// CONTRACT: "@post result.n >= 1"
test('driverSI: result.n >= 1 at and below the boundary', () => {
  assert.ok(driverSI({}).n >= 1)
  assert.ok(driverSI({ count: 1 }).n >= 1)
  assert.ok(driverSI({ count: 0 }).n >= 1)
  assert.ok(driverSI({ count: -3 }).n >= 1)
  assert.equal(driverSI({ count: 1 }).n, 1)
  assert.equal(driverSI({ count: 3 }).n, 3)
})

// CONTRACT: "@post p is not modified"
test('driverSI: p is not modified', () => {
  const p = { ...DRIVER_PARAMS, count: 4, wiring: 'series-parallel' }
  const before = structuredClone(p)
  driverSI(p)
  assert.deepEqual(p, before)
})

// CONTRACT: "@pure — ... Calling it twice with equal inputs must produce equal
//            output and change nothing observable."
test('driverSI: @pure — two calls with equal inputs produce equal output', () => {
  const p = { ...DRIVER_PARAMS, count: 2, wiring: 'parallel' }
  const clone = structuredClone(p)
  assert.deepEqual(driverSI(p), driverSI(clone))
  assert.deepEqual(p, clone)
})

// ======================================================================
// validateGraph(nodes, edges)
// ======================================================================

// CONTRACT: "`{warnings: Object<string, string[]>, errors: string[]}` — Warnings
//            keyed by node id, and graph-level errors that block simulation."
test('validateGraph: returns warnings keyed by node id and an errors array', () => {
  const { nodes, edges } = smallGraph()
  const v = validateGraph(nodes, edges)
  assert.deepEqual(Object.keys(v).sort(), ['errors', 'warnings'])
  assert.ok(Array.isArray(v.errors))
  assert.equal(typeof v.warnings, 'object')
  assert.notEqual(v.warnings, null)
  const ids = new Set(nodes.map((n) => n.id))
  for (const [id, list] of Object.entries(v.warnings)) {
    assert.ok(ids.has(id), `warning key ${id} is not a node id`)
    assert.ok(Array.isArray(list))
    for (const w of list) assert.equal(typeof w, 'string')
  }
  for (const e of v.errors) assert.equal(typeof e, 'string')
})

// CONTRACT: "The one error is having no driver at all, since there would be
//            nothing to excite the network."
test('validateGraph: no driver is an error', () => {
  assert.ok(validateGraph([], []).errors.length >= 1)
  assert.ok(validateGraph([radNode('r1')], []).errors.length >= 1)
})

// CONTRACT: "The one error is having no driver at all" — so any graph that has a
// driver has no errors, however odd its topology.
test('validateGraph: a graph with a driver has no errors', () => {
  assert.deepEqual(validateGraph([driverNode('d1')], []).errors, [])
  const { nodes, edges } = smallGraph()
  assert.deepEqual(validateGraph(nodes, edges).errors, [])
})

// CONTRACT: "Most topology problems are legitimate designs the model handles
//            approximately — an unconnected mouth is a working port, not a
//            mistake — so they are surfaced on the node and left alone."
test('validateGraph: topology problems are warnings, not errors', () => {
  // a lone unconnected driver: odd, but not an error
  const v = validateGraph([driverNode('d1')], [])
  assert.deepEqual(v.errors, [])
})

// CONTRACT: "@post nodes and edges are not modified"
test('validateGraph: nodes and edges are not modified', () => {
  const { nodes, edges } = smallGraph()
  const nb = structuredClone(nodes)
  const eb = structuredClone(edges)
  validateGraph(nodes, edges)
  assert.deepEqual(nodes, nb)
  assert.deepEqual(edges, eb)
})

// CONTRACT: "@pure — ... Calling it twice with equal inputs must produce equal
//            output and change nothing observable."
test('validateGraph: @pure — two calls with equal inputs produce equal output', () => {
  const a = smallGraph()
  const b = smallGraph()
  assert.deepEqual(validateGraph(a.nodes, a.edges), validateGraph(b.nodes, b.edges))
})

// ======================================================================
// runSimulation(nodes, edges, settings)
// ======================================================================

// CONTRACT: "On failure `{ok: false, validation, freqs: []}` — returned rather
//            than thrown, because an incomplete graph is the normal state while
//            the user is still wiring it up."
test('runSimulation: a graph with no driver fails rather than throwing', () => {
  const res = runSimulation([], [], {})
  assert.equal(res.ok, false)
  assert.deepEqual(res.freqs, [])
  assert.ok(Object.hasOwn(res, 'validation'))
  assert.ok(res.validation.errors.length >= 1)
})

// CONTRACT: "On failure `{ok: false, validation, freqs: []}`"
// Read strictly: the failure result carries exactly those three keys.
test('runSimulation: the failure result carries exactly ok, validation and freqs', () => {
  const res = runSimulation([], [], {})
  assert.deepEqual(Object.keys(res).sort(), ['freqs', 'ok', 'validation'])
})

// CONTRACT: "On success `{ok: true, validation, freqs, splCombined, splDriver,
//            splPorts, splInterior, zinMag, zinPhase, excursion,
//            excursionByDriver, excursionRatio, xmaxByDriver, velocity, power,
//            peReal, peApparent, phase, phaseUnwrapped, groupDelay, nl,
//            elapsedMs}`"
test('runSimulation: a valid graph succeeds with the documented result shape', () => {
  const { nodes, edges } = smallGraph()
  const res = runSimulation(nodes, edges, {})
  assert.equal(res.ok, true)
  for (const k of SUCCESS_KEYS) assert.ok(Object.hasOwn(res, k), `missing key ${k}`)
  assert.ok(Array.isArray(res.freqs))
  assert.equal(typeof res.elapsedMs, 'number')
})

// CONTRACT: "For each of `npts` log-spaced frequencies it builds every element's
//            ABCD matrix"
// CONTRACT: "`settings.npts` — `number` _(optional, default `512`)_ —
//            Log-spaced frequency points."
test('runSimulation: npts defaults to 512 and sets the sweep length', () => {
  const a = smallGraph()
  assert.equal(runSimulation(a.nodes, a.edges, {}).freqs.length, 512)
  const b = smallGraph()
  assert.equal(runSimulation(b.nodes, b.edges, { npts: 64 }).freqs.length, 64)
})

// CONTRACT: "`settings.fmin` — _(optional, default `10`)_ — Sweep start, Hz."
// CONTRACT: "`settings.fmax` — _(optional, default `1000`)_ — Sweep end, Hz."
test('runSimulation: fmin and fmax default to 10 and 1000 and bound the sweep', () => {
  const a = smallGraph()
  const def = runSimulation(a.nodes, a.edges, {})
  assert.ok(Math.abs(def.freqs[0] - 10) < 1e-9, `first ${def.freqs[0]}`)
  assert.ok(Math.abs(def.freqs[def.freqs.length - 1] - 1000) < 1e-6,
    `last ${def.freqs[def.freqs.length - 1]}`)

  const b = smallGraph()
  const exp = runSimulation(b.nodes, b.edges, { fmin: 10, fmax: 1000 })
  assert.deepEqual(exp.freqs, def.freqs)

  const c = smallGraph()
  const other = runSimulation(c.nodes, c.edges, { fmin: 20, fmax: 200, npts: 32 })
  assert.ok(Math.abs(other.freqs[0] - 20) < 1e-9)
  assert.ok(Math.abs(other.freqs[31] - 200) < 1e-9)
})

// CONTRACT: "the sweep is logarithmic" (@pre settings.fmin > 0)
test('runSimulation: the sweep is log-spaced', () => {
  const { nodes, edges } = smallGraph()
  const f = runSimulation(nodes, edges, { fmin: 10, fmax: 1000, npts: 3 }).freqs
  assert.equal(f.length, 3)
  assert.ok(Math.abs(f[1] - 100) < 1e-9, `midpoint ${f[1]}`)
})

// CONTRACT (@pre): "settings.npts >= 2 — the log spacing divides by npts - 1"
test('runSimulation: npts at its documented minimum of 2 gives the endpoints', () => {
  const { nodes, edges } = smallGraph()
  const res = runSimulation(nodes, edges, { npts: 2, fmin: 10, fmax: 1000 })
  assert.equal(res.ok, true)
  assert.equal(res.freqs.length, 2)
  assert.ok(Math.abs(res.freqs[0] - 10) < 1e-9)
  assert.ok(Math.abs(res.freqs[1] - 1000) < 1e-9)
})

// CONTRACT (@pre): "settings.fmin > 0 — the sweep is logarithmic"
test('runSimulation: a small positive fmin is honoured', () => {
  const { nodes, edges } = smallGraph()
  const res = runSimulation(nodes, edges, { fmin: 0.5, fmax: 50, npts: 16 })
  assert.equal(res.ok, true)
  assert.ok(Math.abs(res.freqs[0] - 0.5) < 1e-12)
  for (const f of res.freqs) assert.ok(Number.isFinite(f))
})

// CONTRACT: "`settings.voltage` — _(optional, default `2.83`)_ — Drive voltage,
//            V RMS at the amplifier."
test('runSimulation: voltage defaults to 2.83', () => {
  const a = smallGraph()
  const def = runSimulation(a.nodes, a.edges, { npts: 16 })
  const b = smallGraph()
  const exp = runSimulation(b.nodes, b.edges, { npts: 16, voltage: 2.83 })
  assert.deepEqual(exp.splCombined, def.splCombined)
  assert.deepEqual(exp.excursion, def.excursion)
  // and a different voltage really is a different drive level
  const c = smallGraph()
  const loud = runSimulation(c.nodes, c.edges, { npts: 16, voltage: 28.3 })
  assert.notDeepEqual(loud.splCombined, def.splCombined)
})

// CONTRACT: "`settings.rg` — _(optional, default `0`)_ — Amplifier source
//            resistance, Ω."
test('runSimulation: rg defaults to 0', () => {
  const a = smallGraph()
  const def = runSimulation(a.nodes, a.edges, { npts: 16 })
  const b = smallGraph()
  const exp = runSimulation(b.nodes, b.edges, { npts: 16, rg: 0 })
  assert.deepEqual(exp.splCombined, def.splCombined)
  const c = smallGraph()
  const damped = runSimulation(c.nodes, c.edges, { npts: 16, rg: 10 })
  assert.notDeepEqual(damped.splCombined, def.splCombined)
})

// CONTRACT: "Excursion is deliberately *not* summed — cones move independently,
//            so `excursion` reports the worst single cone and `excursionRatio`
//            the worst cone relative to its own Xmax."
test('runSimulation: excursion and excursionRatio are per-frequency arrays', () => {
  const { nodes, edges } = smallGraph()
  const res = runSimulation(nodes, edges, { npts: 16 })
  assert.equal(res.excursion.length, res.freqs.length)
  assert.equal(res.excursionRatio.length, res.freqs.length)
})

// CONTRACT (@mutates): "Stashes solver scratch state on the caller's node
//            objects (`node._Zl`) and on returned impedances (`Z._radS`).
//            Harmless to the graph's meaning, but the input array is not left
//            untouched."
// CONTRACT (module): "Graph → transfer-matrix chain solver" — `_Zl` is written
// by `inputZ`, the backward walk, which is what a two-port chain exercises, so
// the graph here is a full driver → chamber → waveguide → radiation chain rather
// than a bare driver with two terminals.
test('runSimulation: stashes scratch state on the caller\'s node objects', () => {
  const { nodes, edges } = chainGraph()
  const before = structuredClone(nodes)
  runSimulation(nodes, edges, { npts: 8 })
  assert.notDeepEqual(nodes, before, 'the input nodes should not be left untouched')
  assert.ok(nodes.some((n) => Object.hasOwn(n, '_Zl')),
    'at least one node should carry the _Zl scratch load')
})

// CONTRACT (@side-effects): "Reads `performance.now()` twice to report
//            `elapsedMs`"
test('runSimulation: reports elapsedMs as a non-negative number', () => {
  const { nodes, edges } = smallGraph()
  const res = runSimulation(nodes, edges, { npts: 8 })
  assert.equal(typeof res.elapsedMs, 'number')
  assert.ok(res.elapsedMs >= 0)
})

// CONTRACT: "When `settings.nlEnabled` is set and at least one driver has
//            nonlinear curves, the whole sweep runs four times"
// With no nonlinear curves on any driver, enabling the flag must change nothing.
test('runSimulation: nlEnabled changes nothing when no driver has nonlinear curves', () => {
  const a = smallGraph()
  const off = runSimulation(a.nodes, a.edges, { npts: 16 })
  const b = smallGraph()
  const on = runSimulation(b.nodes, b.edges, { npts: 16, nlEnabled: true })
  assert.deepEqual(on.splCombined, off.splCombined)
  assert.deepEqual(on.excursion, off.excursion)
})

// CONTRACT: "`settings.masking` — `boolean` _(optional)_ — Replace chambers with
//            lumped compliances, hiding standing-wave artifacts."
test('runSimulation: masking is accepted and leaves the result shape intact', () => {
  const { nodes, edges } = chainGraph()
  const res = runSimulation(nodes, edges, { npts: 16, masking: true })
  assert.equal(res.ok, true)
  for (const k of SUCCESS_KEYS) assert.ok(Object.hasOwn(res, k), `missing key ${k}`)
})

// CONTRACT: "Replace chambers with lumped compliances, hiding standing-wave
//            artifacts." — a graph containing a chamber must respond to the flag.
test('runSimulation: masking changes the answer for a graph containing a chamber', () => {
  const a = chainGraph()
  const off = runSimulation(a.nodes, a.edges, { npts: 64 })
  const b = chainGraph()
  const on = runSimulation(b.nodes, b.edges, { npts: 64, masking: true })
  assert.equal(off.ok, true)
  assert.equal(on.ok, true)
  assert.notDeepEqual(on.splCombined, off.splCombined)
})

// CONTRACT: "On success `{ok: true, validation, freqs, ...}`" — a chained
// transfer-matrix graph, which the module section describes as the general case,
// produces the same documented result shape.
test('runSimulation: a chained two-port graph succeeds with the documented shape', () => {
  const { nodes, edges } = chainGraph()
  const res = runSimulation(nodes, edges, { npts: 32 })
  assert.equal(res.ok, true)
  for (const k of SUCCESS_KEYS) assert.ok(Object.hasOwn(res, k), `missing key ${k}`)
  assert.equal(res.freqs.length, 32)
  assert.equal(res.splCombined.length, 32)
})

// CONTRACT: "the validation" field of the result, from validateGraph
test('runSimulation: the result carries the validation report', () => {
  const { nodes, edges } = smallGraph()
  const res = runSimulation(nodes, edges, { npts: 8 })
  assert.ok(Array.isArray(res.validation.errors))
  assert.equal(typeof res.validation.warnings, 'object')
})

// ======================================================================
// __internals.normQ(p)
// ======================================================================

// CONTRACT: "Collapses three ways of saying 'lossless' — an explicit `lossless`
//            flag, a missing Q, and a non-positive Q — onto `Infinity`"
test('normQ: an explicit lossless flag gives Infinity', () => {
  assert.equal(normQ({ lossless: true }), Infinity)
  assert.equal(normQ({ lossless: true, Q: 7 }), Infinity)
})

// CONTRACT: "a non-positive Q ... onto `Infinity`"
test('normQ: a non-positive Q gives Infinity', () => {
  assert.equal(normQ({ Q: 0 }), Infinity)
  assert.equal(normQ({ Q: -5 }), Infinity)
})

// CONTRACT: "`p.Q` — `number` _(optional, default `50`)_ — The node's loss factor."
// AMBIGUITY: the prose says a missing Q collapses onto Infinity while the
// parameter block gives Q a default of 50. These cannot both hold. The prose is
// the more specific claim about behaviour, so it is what is asserted; the two
// clauses are self-contradictory.
test('normQ: a missing Q gives Infinity', () => {
  assert.equal(normQ({}), Infinity)
})

// CONTRACT: "`number` — A positive Q, or `Infinity` for lossless."
test('normQ: a positive Q is passed through', () => {
  assert.equal(normQ({ Q: 50 }), 50)
  assert.equal(normQ({ Q: 7 }), 7)
  assert.equal(normQ({ Q: 0.5 }), 0.5)
})

// CONTRACT: "@post result > 0"
test('normQ: result > 0 for every input', () => {
  for (const p of [{}, { Q: 0 }, { Q: -1 }, { Q: 3 }, { lossless: true }, { lossless: false, Q: 2 }]) {
    const r = normQ(p)
    assert.equal(typeof r, 'number')
    assert.ok(r > 0, `normQ gave ${r}`)
  }
})

// CONTRACT: "@pure — ... deterministic in its arguments."
test('normQ: @pure — repeatable and does not modify its argument', () => {
  const p = { Q: 12, lossless: false }
  const before = structuredClone(p)
  assert.equal(normQ(p), normQ(p))
  assert.deepEqual(p, before)
})

// ======================================================================
// __internals.driverPassiveMechZ(d, Rg, w)
// ======================================================================

// CONTRACT: "`Complex` — Mechanical impedance, N·s/m, including the reflected
//            electrical term."
test('driverPassiveMechZ: returns a complex value', () => {
  const d = driverSI({ ...DRIVER_PARAMS })
  const z = driverPassiveMechZ(d, 0, 2 * Math.PI * 40)
  assert.equal(typeof z, 'object')
  assert.equal(typeof z.re, 'number')
  assert.equal(typeof z.im, 'number')
  assert.ok(Number.isFinite(z.re) && Number.isFinite(z.im))
})

// CONTRACT (@pre): "w > 0 — the compliance term divides by ω"
test('driverPassiveMechZ: finite across the satisfied range of w', () => {
  const d = driverSI({ ...DRIVER_PARAMS })
  for (const f of [0.01, 1, 20, 1000, 20000]) {
    const z = driverPassiveMechZ(d, 0, 2 * Math.PI * f)
    assert.ok(Number.isFinite(z.re) && Number.isFinite(z.im), `not finite at ${f} Hz`)
  }
})

// CONTRACT: "its moving mass, suspension and — through the motor — its blocked
//            electrical impedance reflected back as `Bl²/Ze`. Ignoring that term
//            would let an unpowered cone behave as though its motor were
//            disconnected."
test('driverPassiveMechZ: includes the reflected Bl^2/Ze term', () => {
  const w = 2 * Math.PI * 40
  const withMotor = driverPassiveMechZ(driverSI({ ...DRIVER_PARAMS, Bl: 10 }), 0, w)
  const noMotor = driverPassiveMechZ(driverSI({ ...DRIVER_PARAMS, Bl: 0 }), 0, w)
  assert.notEqual(withMotor.re, noMotor.re)
})

// CONTRACT: "`Rg` — `number` — Amplifier source resistance, Ω, in series with
//            the coil."
test('driverPassiveMechZ: Rg is in series with the coil and changes the result', () => {
  const d = driverSI({ ...DRIVER_PARAMS })
  const w = 2 * Math.PI * 40
  const a = driverPassiveMechZ(d, 0, w)
  const b = driverPassiveMechZ(d, 100, w)
  assert.notEqual(a.re, b.re)
})

// CONTRACT: "@pure — ... Calling it twice with equal inputs must produce equal
//            output and change nothing observable."
test('driverPassiveMechZ: @pure — repeatable and does not modify its arguments', () => {
  const d = driverSI({ ...DRIVER_PARAMS })
  const before = structuredClone(d)
  const w = 2 * Math.PI * 40
  const a = driverPassiveMechZ(d, 1, w)
  const b = driverPassiveMechZ(d, 1, w)
  assert.deepEqual({ re: a.re, im: a.im }, { re: b.re, im: b.im })
  assert.deepEqual(d, before)
})

// ======================================================================
// __internals.buildGraph(nodes, edges)
// ======================================================================

// CONTRACT: "`{byId: Map<string, object>, adj: Map<string, Array<{node: object,
//            handle: string}>>}` — Node lookup and the adjacency index."
test('buildGraph: returns byId and adj as Maps', () => {
  const { nodes, edges } = smallGraph()
  const g = buildGraph(nodes, edges)
  assert.ok(g.byId instanceof Map)
  assert.ok(g.adj instanceof Map)
  assert.equal(g.byId.size, nodes.length)
  for (const n of nodes) assert.equal(g.byId.get(n.id), n)
})

// CONTRACT: "Build an undirected adjacency index keyed by `nodeId:handle`."
// CONTRACT: "Each edge is registered from both ends, so a lookup on either side
//            finds the other."
test('buildGraph: each edge is registered from both ends, keyed nodeId:handle', () => {
  const { nodes, edges } = smallGraph()
  const g = buildGraph(nodes, edges)
  const fwd = g.adj.get('d1:front')
  assert.ok(Array.isArray(fwd))
  assert.equal(fwd.length, 1)
  assert.equal(fwd[0].node.id, 'r1')
  assert.equal(fwd[0].handle, 'in')

  const back = g.adj.get('r1:in')
  assert.ok(Array.isArray(back))
  assert.equal(back.length, 1)
  assert.equal(back[0].node.id, 'd1')
  assert.equal(back[0].handle, 'front')
})

// CONTRACT: "Edges referencing a missing node are skipped rather than throwing"
test('buildGraph: an edge referencing a missing node is skipped, not thrown', () => {
  const nodes = [driverNode('d1')]
  const edges = [
    { source: 'd1', sourceHandle: 'front', target: 'ghost', targetHandle: 'in' },
    { source: 'ghost2', sourceHandle: 'out', target: 'd1', targetHandle: 'rear' },
  ]
  let g
  assert.doesNotThrow(() => { g = buildGraph(nodes, edges) })
  assert.equal(g.adj.has('d1:front'), false)
  assert.equal(g.adj.has('d1:rear'), false)
})

// CONTRACT: "@post nodes and edges are not modified"
test('buildGraph: nodes and edges are not modified', () => {
  const { nodes, edges } = smallGraph()
  const nb = structuredClone(nodes)
  const eb = structuredClone(edges)
  buildGraph(nodes, edges)
  assert.deepEqual(nodes, nb)
  assert.deepEqual(edges, eb)
})

// CONTRACT: "@pure — ... Calling it twice with equal inputs must produce equal
//            output and change nothing observable."
test('buildGraph: @pure — two calls with equal inputs produce equal output', () => {
  const a = smallGraph()
  const b = smallGraph()
  const ga = buildGraph(a.nodes, a.edges)
  const gb = buildGraph(b.nodes, b.edges)
  assert.deepEqual([...ga.adj.keys()].sort(), [...gb.adj.keys()].sort())
  assert.deepEqual([...ga.byId.keys()].sort(), [...gb.byId.keys()].sort())
  for (const k of ga.adj.keys()) {
    assert.deepEqual(
      ga.adj.get(k).map((e) => [e.node.id, e.handle]).sort(),
      gb.adj.get(k).map((e) => [e.node.id, e.handle]).sort(),
    )
  }
})
