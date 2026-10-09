// Contract tests for the SPICE engine's small modules: netlist.js, nets.js,
// run.js and adapt.js.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fmt, createNetlist, sense, DC_TIE } from '../../src/spice/netlist.js'
import { buildNets, endCorrection, faceArea } from '../../src/spice/nets.js'
import { isFatal, runNetlist } from '../../src/spice/run.js'
import { phaseAndDelay } from '../../src/spice/adapt.js'
import { migrateProject } from '../../src/schema/migrate.js'
import { junctionCorrection } from '../../src/engine/geometry.js'

// CONTRACT: "Twelve significant figures, exponent form where needed."
test('fmt: twelve significant figures, refusing non-finite values', () => {
  assert.equal(fmt(1 / 3), '0.333333333333')
  assert.equal(fmt(1.5e-12), '1.5e-12')
  assert.throws(() => fmt(NaN))
  assert.throws(() => fmt(Infinity))
})

// CONTRACT: "Element and node names are generated, never taken from the graph,
// so nothing a user types can reach the netlist as syntax."
test('createNetlist: generated names, comments cannot break a line', () => {
  const nl = createNetlist('evil\n.end\nV9 x 0 1')
  const a = nl.node()
  const r = nl.add('R', [a, '0'], '5', 'label\n.end')
  assert.equal(r, 'R1')
  assert.equal(nl.lines.length, 2)
  assert.ok(nl.lines.every((l) => !/^\.end/.test(l)))
})

// CONTRACT: "Current through the source ... is the flow from `a` onward. The
// tie keeps loops of such sources from making the DC solution singular."
test('sense: a 0 V source followed by the DC tie', () => {
  const nl = createNetlist('t')
  const s = sense(nl, 'a', 'x')
  assert.equal(s.name, 'V1')
  assert.match(nl.lines[1], /^V1 a n\d+ DC 0/)
  assert.match(nl.lines[2], new RegExp(`^R1 n\\d+ ${s.out} ${DC_TIE}$`))
  const t = sense(nl, 'b', 'y', 'end')
  assert.equal(t.out, 'end')
})

/** A driver into a chamber into a port. */
const PROJ = migrateProject({
  schemaVersion: 3,
  nodes: [
    { id: 'd', type: 'driver', params: {} },
    { id: 'c', type: 'chamber', params: { volume: 60, length: 40 } },
    { id: 'w', type: 'waveguide', params: { S1: 80, S2: 80 } },
    { id: 'w2', type: 'waveguide', params: { S1: 80, S2: 80 } },
  ],
  edges: [
    { source: 'd', sourceHandle: 'rear', target: 'c', targetHandle: 'in' },
    { source: 'c', sourceHandle: 'out', target: 'w', targetHandle: 'throat' },
    { source: 'w', sourceHandle: 'mouth', target: 'w2', targetHandle: 'throat' },
  ],
})

// CONTRACT: "Every set of handles joined by edges is one netlist node".
test('buildNets: joined handles share a node, others do not', () => {
  const nets = buildNets(PROJ, createNetlist('t'))
  assert.equal(nets.netOf('d', 'rear'), nets.netOf('c', 'in'))
  assert.notEqual(nets.netOf('c', 'in'), nets.netOf('c', 'out'))
  assert.equal(nets.connected('w2', 'mouth'), false)
  assert.deepEqual(nets.neighbours('c', 'out').map((o) => `${o.node.id}:${o.handle}`), ['w:throat'])
})

// CONTRACT: "exactly one side may hold it: the narrower, unless the other side
// is a driver or passive radiator ... An end joined to open air or to a tap
// gets nothing here".
test('endCorrection: the narrower side owns it; an equal-area join has none', () => {
  const nets = buildNets(PROJ, createNetlist('t'))
  const byId = new Map(PROJ.nodes.map((n) => [n.id, n]))
  const c = byId.get('c'); const w = byId.get('w'); const w2 = byId.get('w2')
  assert.equal(endCorrection(nets, c, 'out'), 0, 'the wide chamber does not hold the port junction')
  assert.ok(Math.abs(endCorrection(nets, w, 'throat') - junctionCorrection(0.008, faceArea(c, 'out'))) < 1e-15)
  assert.equal(endCorrection(nets, w, 'mouth'), 0, 'equal areas: no discontinuity')
  assert.equal(endCorrection(nets, w2, 'mouth'), 0, 'open air: the radiation load carries it')
  assert.ok(endCorrection(nets, c, 'in') > 0, 'a driver cannot hold it, so the chamber does')
})

// CONTRACT: "Notes and warnings that the engine recovered from are not failures."
test('isFatal: errors are fatal, notes are not', () => {
  assert.equal(isFatal('Error on line 4'), true)
  assert.equal(isFatal('Warning: singular matrix:  check node x'), true)
  assert.equal(isFatal('Note: v1: has no value, DC 0 assumed'), false)
})

// CONTRACT: "@throws Error When ngspice reports an error; the message lines are
// on `spiceErrors`."
test('runNetlist: a netlist SPICE cannot parse is rejected with its messages', async () => {
  await assert.rejects(runNetlist('* bad\nQ1 a b\n.ac dec 5 10 100\n.end'), (err) => {
    assert.ok(Array.isArray(err.spiceErrors) && err.spiceErrors.length > 0)
    return true
  })
  // and the engine is still usable afterwards
  const ok = await runNetlist('* good\nV1 a 0 DC 0 AC 1\nR1 a 0 2\n.save i(v1)\n.ac dec 2 10 100\n.end')
  assert.ok(Math.abs(ok.vec('i(v1)').re[0] + 0.5) < 1e-12)
})

// CONTRACT: "Unwrap a phase curve and derive group delay."
test('phaseAndDelay: a pure delay unwraps to a straight line of constant delay', () => {
  const freqs = Array.from({ length: 200 }, (_, i) => 10 + i * 5)
  const tau = 0.004
  const wrapped = freqs.map((f) => { let p = -360 * f * tau; while (p <= -180) p += 360; return p })
  const { unwrapped, groupDelay } = phaseAndDelay(wrapped, freqs)
  for (let i = 0; i < freqs.length; i++) {
    if (i) assert.ok(Math.abs((unwrapped[i] - unwrapped[i - 1]) - -360 * (freqs[i] - freqs[i - 1]) * tau) < 1e-9, 'unwrapped is a straight line')
    assert.ok(Math.abs(groupDelay[i] - tau * 1000) < 1e-9, `${freqs[i]} Hz: ${groupDelay[i]} ms`)
  }
})
