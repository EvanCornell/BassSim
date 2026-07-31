// The chain solver is the oracle for the nodal solver.
//
// On any topology that branches outward from the drivers, the transfer-matrix
// walk is exact — so the nodal solver must reproduce it to rounding error.
// Where the two are *supposed* to differ (junctions with several sources) the
// nodal answer is checked against an independent construction instead: the
// chain solver's array model, which lumps N identical cones onto one shared
// enclosure and therefore gets the mutual loading right by a different route.
//
//   node test/engine-parity.mjs
import { hydrateProject } from '../src/engine/project.js'
import { runSimulation } from '../src/engine/solver.js'

let failures = 0
const pass = (msg) => console.log(`PASS  ${msg}`)
const fail = (msg) => { failures++; console.log(`FAIL  ${msg}`) }

const run = (proj, solver) => {
  const { nodes, edges, settings } = hydrateProject(structuredClone(proj))
  return runSimulation(nodes, edges, { ...settings, solver })
}

const worst = (a, b, key) => {
  let d = 0
  for (let i = 0; i < a.freqs.length; i++) {
    const x = a[key][i], y = b[key][i]
    if (x == null || y == null || !isFinite(x) || !isFinite(y)) continue
    d = Math.max(d, Math.abs(x - y))
  }
  return d
}

// Series compared and how close they must be. The tolerances are far below
// anything audible or visible on a chart; they exist to catch a wrong stamp,
// not to paper over one.
const CHECKS = [
  ['splCombined', 1e-9, 'dB'],
  ['zinMag', 1e-9, 'Ω'],
  ['excursion', 1e-9, 'mm'],
  ['power', 1e-9, 'W'],
  ['peReal', 1e-9, 'W'],
  ['phase', 1e-7, '°'],
]

function parity(name, proj) {
  const a = run(proj, 'chain')
  const b = run(proj, 'nodal')
  if (!a.ok || !b.ok) return fail(`${name}: solver returned not-ok (chain=${a.ok} nodal=${b.ok})`)
  let bad = null
  for (const [key, tol, unit] of CHECKS) {
    const d = worst(a, b, key)
    if (d > tol) bad = `${key} differs by ${d.toExponential(2)} ${unit} (tol ${tol})`
  }
  for (const wid of Object.keys(a.velocity)) {
    let d = 0
    for (let i = 0; i < a.freqs.length; i++) d = Math.max(d, Math.abs(a.velocity[wid][i] - b.velocity[wid][i]))
    if (d > 1e-9) bad = `velocity[${wid}] differs by ${d.toExponential(2)} m/s`
  }
  for (const cid of Object.keys(a.splInterior || {})) {
    let d = 0
    for (let i = 0; i < a.freqs.length; i++) d = Math.max(d, Math.abs(a.splInterior[cid][i] - b.splInterior[cid][i]))
    if (d > 1e-9) bad = `splInterior[${cid}] differs by ${d.toExponential(2)} dB`
  }
  if (bad) fail(`${name} — ${bad}`)
  else pass(`${name} — solvers agree`)
}

// ---------- fixtures ----------

const driver = (id, over = {}) => ({
  id, type: 'driver',
  params: { Fs: 30, Qts: 0.45, Vas: 60, Re: 3.6, Bl: 15, Mms: 150, Cms: 0.19, Sd: 480, Le: 1.5, Xmax: 15, Rms: 4, ...over },
})
const SETTINGS = { fmin: 10, fmax: 1000, npts: 256, voltage: 2.83, rg: 0 }
const project = (nodes, edges, settings = {}) => ({ nodes, edges, settings: { ...SETTINGS, ...settings } })

const sealed = project(
  [driver('d1'), { id: 'r1', type: 'radiation', params: { space: 'half' } },
    { id: 'c1', type: 'chamber', params: { volume: 60, length: 50, Q: 30 } }],
  [{ source: 'd1', sourceHandle: 'front', target: 'r1', targetHandle: 'in' },
    { source: 'd1', sourceHandle: 'rear', target: 'c1', targetHandle: 'in' }],
)

const ported = project(
  [driver('d1'), { id: 'r1', type: 'radiation', params: { space: 'half' } },
    { id: 'c1', type: 'chamber', params: { volume: 60, length: 50, Q: 30 } },
    { id: 'w1', type: 'waveguide', params: { S1: 100, S2: 100, length: 25, flare: 'conical', Q: 50 } },
    { id: 'r2', type: 'radiation', params: { space: 'half' } }],
  [{ source: 'd1', sourceHandle: 'front', target: 'r1', targetHandle: 'in' },
    { source: 'd1', sourceHandle: 'rear', target: 'c1', targetHandle: 'in' },
    { source: 'c1', sourceHandle: 'out', target: 'w1', targetHandle: 'throat' },
    { source: 'w1', sourceHandle: 'mouth', target: 'r2', targetHandle: 'in' }],
)

const bandpass = project(
  [driver('d1'),
    { id: 'cf', type: 'chamber', params: { volume: 30, length: 40, Q: 25 } },
    { id: 'cr', type: 'chamber', params: { volume: 45, length: 45, Q: 30 } },
    { id: 'w1', type: 'waveguide', params: { S1: 120, S2: 120, length: 20, flare: 'conical', Q: 50 } },
    { id: 'r1', type: 'radiation', params: { space: 'half' } }],
  [{ source: 'd1', sourceHandle: 'front', target: 'cf', targetHandle: 'in' },
    { source: 'cf', sourceHandle: 'out', target: 'w1', targetHandle: 'throat' },
    { source: 'w1', sourceHandle: 'mouth', target: 'r1', targetHandle: 'in' },
    { source: 'd1', sourceHandle: 'rear', target: 'cr', targetHandle: 'in' }],
)

const withPR = project(
  [driver('d1'), { id: 'r1', type: 'radiation', params: { space: 'half' } },
    { id: 'c1', type: 'chamber', params: { volume: 50, length: 45, Q: 30 } },
    { id: 'pr1', type: 'pr', params: { Sd: 500, Mmd: 120, addedMass: 60, Cms: 0.4, Rms: 2, Q: 20, space: 'half' } }],
  [{ source: 'd1', sourceHandle: 'front', target: 'r1', targetHandle: 'in' },
    { source: 'd1', sourceHandle: 'rear', target: 'c1', targetHandle: 'in' },
    { source: 'c1', sourceHandle: 'out', target: 'pr1', targetHandle: 'in' }],
)

const horn = project(
  [driver('d1'), { id: 'cr', type: 'chamber', params: { volume: 20, length: 30, Q: 25 } },
    { id: 'w1', type: 'waveguide', params: { S1: 200, S2: 1400, length: 120, flare: 'exponential', Q: 60 } },
    { id: 'r1', type: 'radiation', params: { space: 'quarter' } }],
  [{ source: 'd1', sourceHandle: 'front', target: 'w1', targetHandle: 'throat' },
    { source: 'w1', sourceHandle: 'mouth', target: 'r1', targetHandle: 'in' },
    { source: 'd1', sourceHandle: 'rear', target: 'cr', targetHandle: 'in' }],
)

const probed = structuredClone(ported)
Object.assign(probed.nodes.find((n) => n.id === 'c1').params, { probe: true, probePos: 60 })

// ---------- tree topologies: the solvers must agree ----------

parity('sealed', sealed)
parity('ported', ported)
parity('4th-order bandpass', bandpass)
parity('passive radiator', withPR)
parity('exponential horn, quarter space', horn)
parity('probed chamber', probed)
parity('masked resonances', { ...structuredClone(ported), settings: { ...SETTINGS, masking: true } })
parity('amplifier source resistance', { ...structuredClone(ported), settings: { ...SETTINGS, rg: 0.5 } })
parity('anechoic termination', (() => {
  const p = structuredClone(ported)
  p.nodes.find((n) => n.id === 'r2').params.space = 'anechoic'
  return p
})())
parity('rigid cap on the duct', (() => {
  const p = structuredClone(ported)
  p.nodes.find((n) => n.id === 'r2').params.space = 'rigid'
  return p
})())
parity('driver array (count=4)', (() => {
  const p = structuredClone(ported)
  Object.assign(p.nodes.find((n) => n.id === 'd1').params, { count: 4, wiring: 'series-parallel' })
  return p
})())
parity('two independent enclosures', project(
  [driver('d1'), driver('d2', { Fs: 40, Sd: 300, Bl: 12 }),
    { id: 'r1', type: 'radiation', params: { space: 'half' } },
    { id: 'r2', type: 'radiation', params: { space: 'half' } },
    { id: 'c1', type: 'chamber', params: { volume: 60, length: 50, Q: 30 } },
    { id: 'c2', type: 'chamber', params: { volume: 25, length: 35, Q: 30 } }],
  [{ source: 'd1', sourceHandle: 'front', target: 'r1', targetHandle: 'in' },
    { source: 'd1', sourceHandle: 'rear', target: 'c1', targetHandle: 'in' },
    { source: 'd2', sourceHandle: 'front', target: 'r2', targetHandle: 'in' },
    { source: 'd2', sourceHandle: 'rear', target: 'c2', targetHandle: 'in' }],
))

// ---------- shared junction: checked against the array model instead ----------

// Two identical drivers on one 60 L box, fronts to the same baffle. The chain
// solver superposes them without mutual loading; the nodal solver must instead
// land on the answer the array model gives, which shares the box correctly.
const twoNodes = project(
  [driver('d1'), driver('d2'),
    { id: 'r1', type: 'radiation', params: { space: 'half' } },
    { id: 'c1', type: 'chamber', params: { volume: 60, length: 50, Q: 30 } }],
  [{ source: 'd1', sourceHandle: 'front', target: 'r1', targetHandle: 'in' },
    { source: 'd1', sourceHandle: 'rear', target: 'c1', targetHandle: 'in' },
    { source: 'd2', sourceHandle: 'front', target: 'r1', targetHandle: 'in' },
    { source: 'd2', sourceHandle: 'rear', target: 'c1', targetHandle: 'in' }],
)
const asArray = project(
  [driver('d1', { count: 2, wiring: 'parallel' }),
    { id: 'r1', type: 'radiation', params: { space: 'half' } },
    { id: 'c1', type: 'chamber', params: { volume: 60, length: 50, Q: 30 } }],
  [{ source: 'd1', sourceHandle: 'front', target: 'r1', targetHandle: 'in' },
    { source: 'd1', sourceHandle: 'rear', target: 'c1', targetHandle: 'in' }],
)
{
  const n = run(twoNodes, 'nodal')
  const a = run(asArray, 'chain')
  const dSpl = worst(a, n, 'splCombined')
  const dExc = worst(a, n, 'excursion')
  if (dSpl < 1e-9 && dExc < 1e-9) pass(`shared chamber — nodal matches the array model (ΔSPL ${dSpl.toExponential(1)} dB)`)
  else fail(`shared chamber — nodal vs array model: ΔSPL ${dSpl.toExponential(2)} dB, Δx ${dExc.toExponential(2)} mm`)

  // and it must NOT match the chain solver's own two-node result, or nothing
  // has actually been fixed
  const c = run(twoNodes, 'chain')
  const gap = worst(c, n, 'splCombined')
  if (gap > 1) pass(`shared chamber — mutual loading changes the answer by ${gap.toFixed(2)} dB vs superposition`)
  else fail(`shared chamber — nodal is still within ${gap.toFixed(3)} dB of unloaded superposition`)
}

// An unpowered cone in the box wall: nothing drives it but box pressure, so it
// should move. The chain solver treats it as a pure absorber.
{
  const proj = project(
    [driver('d1'), driver('d2', { Bl: 0.001 }),
      { id: 'r1', type: 'radiation', params: { space: 'half' } },
      { id: 'c1', type: 'chamber', params: { volume: 60, length: 50, Q: 30 } }],
    [{ source: 'd1', sourceHandle: 'front', target: 'r1', targetHandle: 'in' },
      { source: 'd1', sourceHandle: 'rear', target: 'c1', targetHandle: 'in' },
      { source: 'd2', sourceHandle: 'front', target: 'r1', targetHandle: 'in' },
      { source: 'd2', sourceHandle: 'rear', target: 'c1', targetHandle: 'in' }],
  )
  const n = run(proj, 'nodal')
  const x = Math.max(...n.excursionByDriver.d2)
  if (x > 0.1) pass(`unpowered cone is driven by box pressure — ${x.toFixed(2)} mm peak`)
  else fail(`unpowered cone barely moves (${x.toExponential(2)} mm) — is it coupled at all?`)
}

console.log(failures ? `\n${failures} check(s) failed` : '\nAll checks passed')
process.exit(failures ? 1 : 0)
