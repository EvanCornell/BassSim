// Contract tests for src/schema/validate.js — errors versus warnings.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { validateProject, nodeHandles, loadLeaves, driverChannels } from '../../src/schema/validate.js'
import { migrateProject } from '../../src/schema/migrate.js'

/** A minimal valid v3 project: driver rear into a port. */
function base(over = {}) {
  return migrateProject({
    schemaVersion: 3,
    nodes: [
      { id: 'd', type: 'driver', params: { label: 'Drv' } },
      { id: 'w', type: 'waveguide', params: { S1: 500, S2: 500, label: 'Port' } },
    ],
    edges: [{ source: 'd', sourceHandle: 'rear', target: 'w', targetHandle: 'throat' }],
    ...over,
  })
}

// CONTRACT: "Handle names an edge may use on it." — taps included.
test('nodeHandles: base handles plus one per tap', () => {
  assert.deepEqual(nodeHandles({ type: 'chamber', params: { taps: [{ id: 'a' }, { id: 'b' }] } }), ['in', 'out', 'tap:a', 'tap:b'])
  assert.deepEqual(nodeHandles({ type: 'pr', params: {} }), ['front', 'rear'])
})

// CONTRACT: "Driver ids in tree order, duplicates included."
test('loadLeaves: collects leaves through nested series and parallel', () => {
  const tree = { parallel: [{ driver: 'a' }, { series: [{ driver: 'b' }, { driver: 'c' }] }, { driver: 'a' }] }
  assert.deepEqual(loadLeaves(tree), ['a', 'b', 'c', 'a'])
  assert.deepEqual(loadLeaves(null), [])
})

// CONTRACT: "The one channel whose `load` is `null` takes every driver no tree
// claimed ... A driver claimed by no channel is undriven."
test('driverChannels: explicit trees claim first, the catch-all takes the rest', () => {
  const p = { nodes: [{ id: 'a', type: 'driver' }, { id: 'b', type: 'driver' }], wiring: { channels: [{ id: 'x', load: { driver: 'a' } }, { id: 'y', load: null }] } }
  assert.deepEqual([...driverChannels(p)], [['a', 'x'], ['b', 'y']])
  const q = { nodes: [{ id: 'a', type: 'driver' }], wiring: { channels: [{ id: 'x', load: { parallel: [] } }] } }
  assert.equal(driverChannels(q).size, 0)
})

// CONTRACT: a valid project has no errors.
test('validateProject: a valid project passes', () => {
  const { errors } = validateProject(base())
  assert.deepEqual(errors, [])
})

// CONTRACT: "An *error* is something that cannot be simulated at all — a missing
// driver, an edge to a node that does not exist, a volume of zero."
test('validateProject: unsimulatable projects are errors', () => {
  assert.match(validateProject(base({ nodes: [], edges: [] })).errors.join(), /Add a Driver node/)
  assert.match(validateProject(base({ edges: [{ source: 'd', sourceHandle: 'rear', target: 'ghost', targetHandle: 'in' }] })).errors.join(), /"ghost" is not a node id/)
  assert.match(validateProject(base({ edges: [{ source: 'd', sourceHandle: 'side', target: 'w', targetHandle: 'throat' }] })).errors.join(), /has no handle "side"/)
  const zero = base()
  zero.nodes[1].params.length = 0
  assert.match(validateProject(zero).errors.join(), /Port: length must be greater than zero/)
})

// CONTRACT: connections carry no direction, so throat-to-throat is valid.
test('validateProject: any handle may join any handle', () => {
  const p = migrateProject({
    schemaVersion: 3,
    nodes: [{ id: 'd', type: 'driver' }, { id: 'a', type: 'waveguide' }, { id: 'b', type: 'waveguide' }],
    edges: [
      { source: 'd', sourceHandle: 'front', target: 'a', targetHandle: 'mouth' },
      { source: 'a', sourceHandle: 'throat', target: 'b', targetHandle: 'throat' },
    ],
  })
  assert.deepEqual(validateProject(p).errors, [])
})

// CONTRACT: "A *warning* is something that can be simulated but is physically
// questionable ... it never blocks a run."
test('validateProject: a driver face on a smaller duct end warns about a throat chamber', () => {
  const p = base()
  p.nodes[1].params.S1 = 80
  const { errors, warnings } = validateProject(p)
  assert.deepEqual(errors, [])
  assert.match(warnings.d.join(), /throat chamber/)
  assert.equal(validateProject(base()).warnings.d?.some((w) => /throat chamber/.test(w)) ?? false, false, 'an end as large as the cone is fine')
})

// CONTRACT: a tap outside its node's length is a warning, never silently moved.
test('validateProject: a tap outside the length warns', () => {
  const p = base()
  p.nodes[1].params.taps = [{ id: 't', position: 45 }]
  assert.match(validateProject(p).warnings.w.join(), /Tap t at 45 cm is not inside the 30 cm length/)
})

// CONTRACT (wiring): a driver wired twice, a leaf that is not a driver, and two
// catch-all channels are errors; an undriven driver is a warning.
test('validateProject: wiring mistakes', () => {
  const twice = base({ wiring: { channels: [{ id: 'a', load: { driver: 'd' } }, { id: 'b', load: { driver: 'd' } }] } })
  assert.match(validateProject(twice).errors.join(), /wired to more than one place/)
  const notDriver = base({ wiring: { channels: [{ id: 'a', load: { driver: 'w' } }] } })
  assert.match(validateProject(notDriver).errors.join(), /"w" is not a driver node/)
  const two = base({ wiring: { channels: [{ id: 'a', load: null }, { id: 'b', load: null }] } })
  assert.match(validateProject(two).errors.join(), /Only one channel may take/)
  const none = base({ wiring: { channels: [{ id: 'a', load: { parallel: [] } }] } })
  assert.deepEqual(validateProject(none).errors, [])
  assert.match(validateProject(none).warnings.d.join(), /Not wired to any amplifier channel/)
})

// CONTRACT (analyses): a sweep needs a positive range and at least two points.
test('validateProject: an impossible sweep is an error', () => {
  const p = base({ analyses: [{ id: 'a', type: 'ac', fmin: 100, fmax: 50, npts: 1 }] })
  const text = validateProject(p).errors.join()
  assert.match(text, /highest frequency must be above the lowest/)
  assert.match(text, /at least two frequency points/)
})

// CONTRACT: probes that point nowhere are warnings keyed `probe:<id>`; an
// unknown kind cannot be simulated and is an error.
test('validateProject: probes are checked', () => {
  const { errors, warnings } = validateProject(base({
    probes: [
      { id: 'a', kind: 'pressure', at: { node: 'nope', handle: 'in' } },
      { id: 'b', kind: 'flow', at: { node: 'w', handle: 'side' } },
      { id: 'c', kind: 'velocity', at: { node: 'w', position: 999 } },
      { id: 'd', kind: 'pressure', at: { node: 'd', position: 1 } },
      { id: 'e', kind: 'loudness', at: { node: 'w', handle: 'mouth' } },
      { id: 'f', kind: 'flow', at: { node: 'w', handle: 'mouth' } },
    ],
  }))
  assert.deepEqual(errors, ['Probe e: unknown kind "loudness"'])
  assert.deepEqual(Object.keys(warnings).filter((k) => k.startsWith('probe:')).sort(), ['probe:a', 'probe:b', 'probe:c', 'probe:d'])
})

// CONTRACT: a DSP filter that cannot be built is an error naming its channel.
test('validateProject: a malformed filter is an error', () => {
  const { errors } = validateProject(base({
    wiring: { channels: [{ id: 'c1', label: 'Amp', volts: 2.83, load: null, dsp: { filters: [{ type: 'highpass', hz: -5 }] } }] },
  }))
  assert.equal(errors.length, 1)
  assert.match(errors[0], /^Amp › filter 1: /)
})
