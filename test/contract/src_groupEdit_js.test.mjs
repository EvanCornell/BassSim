// Contract tests for src/groupEdit.js — joining a selection at once, and replacing nodes with a copy.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { planGroupConnect, planReplace, hasHandle, handleName } from '../../src/groupEdit.js'

const node = (id, type, params = {}, selected = false) => ({ id, type, selected, data: { params } })
const join = (source, sourceHandle, target, targetHandle) => ({ source, sourceHandle, target, targetHandle })

test('hasHandle and handleName: only taps can be missing', () => {
  const w = node('w', 'waveguide', { taps: [{ id: 't1', position: 5 }] })
  assert.equal(hasHandle(w, 'mouth'), true)
  assert.equal(hasHandle(w, 'tap:t1'), true)
  assert.equal(hasHandle(w, 'tap:t2'), false)
  assert.equal(handleName('tap:t2'), 'tap t2')
  assert.equal(handleName('mouth'), 'mouth')
})

// CONTRACT: a drag from a node that is not in a selection of two or more is an ordinary single join.
test('planGroupConnect: an unselected start is one join', () => {
  const nodes = [node('a', 'waveguide'), node('b', 'waveguide', {}, true), node('c', 'waveguide', {}, true), node('r', 'radiation')]
  assert.deepEqual(planGroupConnect(nodes, [], join('a', 'mouth', 'r', 'in')), { conns: [join('a', 'mouth', 'r', 'in')] })
})

// CONTRACT: a drag from a selected node joins every selected node from the same handle to the same place.
test('planGroupConnect: joins the whole selection, skipping joins that exist and the target itself', () => {
  const nodes = [node('a', 'waveguide', {}, true), node('b', 'waveguide', {}, true), node('c', 'waveguide', {}, true), node('r', 'radiation')]
  const existing = [{ id: 'e', ...join('r', 'in', 'b', 'mouth') }]
  assert.deepEqual(planGroupConnect(nodes, existing, join('a', 'mouth', 'r', 'in')).conns, [join('a', 'mouth', 'r', 'in'), join('c', 'mouth', 'r', 'in')])
  // ending on a selected node leaves it out
  assert.deepEqual(planGroupConnect(nodes, [], join('a', 'mouth', 'c', 'throat')).conns, [join('a', 'mouth', 'c', 'throat'), join('b', 'mouth', 'c', 'throat')])
})

// CONTRACT: a selection of mixed kinds, or one where a node lacks the tap dragged from, joins nothing and says why.
test('planGroupConnect: mixed kinds and missing taps are refused', () => {
  const mixed = [node('a', 'waveguide', {}, true), node('b', 'chamber', {}, true), node('r', 'radiation')]
  assert.match(planGroupConnect(mixed, [], join('a', 'mouth', 'r', 'in')).error, /mixes Waveguides and Chambers/)
  const taps = [
    node('a', 'waveguide', { label: 'Port', taps: [{ id: 't1', position: 5 }] }, true),
    node('b', 'waveguide', { label: 'Port', taps: [{ id: 't2', position: 5 }] }, true),
    node('r', 'radiation'),
  ]
  assert.equal(planGroupConnect(taps, [], join('a', 'tap:t1', 'r', 'in')).error, "Can't join these together: Port #2 has no tap t1.")
  taps[1].data.params.taps.push({ id: 't1', position: 9 })
  assert.equal(planGroupConnect(taps, [], join('a', 'tap:t1', 'r', 'in')).conns.length, 2)
})

// CONTRACT: each target keeps its id and name and takes the copy's settings; the copy must be one node of the same kind.
test('planReplace: settings from the copy, name kept', () => {
  const nodes = [node('a', 'waveguide', { label: 'Mine', length: 10 }), node('b', 'waveguide', { length: 20 })]
  const clip = { nodes: [{ id: 'x', type: 'waveguide', params: { label: 'Theirs', length: 99 } }] }
  const plan = planReplace(nodes, [], clip, ['a', 'b'])
  assert.deepEqual(plan.params, { a: { label: 'Mine', length: 99 }, b: { length: 99 } })
  assert.equal(plan.dropped, 0)
  assert.match(planReplace(nodes, [], null, ['a']).error, /Copy a node first/)
  assert.match(planReplace(nodes, [], { nodes: [clip.nodes[0], clip.nodes[0]] }, ['a']).error, /single node/)
  assert.match(planReplace(nodes, [], clip, []).error, /Select the nodes/)
  assert.match(planReplace([node('c', 'chamber')], [], clip, ['c']).error, /only be replaced by one of its own kind/)
})

// CONTRACT: joins to a tap the copy also has stay; joins to one it lacks are removed and counted.
test('planReplace: taps need not match', () => {
  const nodes = [node('a', 'waveguide', { taps: [{ id: 't1', position: 1 }, { id: 't2', position: 2 }] }), node('r', 'radiation')]
  const edges = [
    { id: 'e1', ...join('a', 'tap:t1', 'r', 'in') },
    { id: 'e2', ...join('r', 'in', 'a', 'tap:t2') },
    { id: 'e3', ...join('a', 'mouth', 'r', 'in') },
  ]
  const clip = { nodes: [{ id: 'x', type: 'waveguide', params: { taps: [{ id: 't1', position: 7 }] } }] }
  const plan = planReplace(nodes, edges, clip, ['a'])
  assert.deepEqual(plan.edges.map((e) => e.id), ['e1', 'e3'])
  assert.equal(plan.dropped, 1)
})
