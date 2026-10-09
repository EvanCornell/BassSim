// Contract tests for src/nodeNames.js — the names components are shown by.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { TYPE_NAMES, baseName, nameNumbers, displayNames, displayName } from '../../src/nodeNames.js'

const ed = (id, type, label) => ({ id, type, data: { params: label == null ? {} : { label } } })
const saved = (id, type, label) => ({ id, type, params: label == null ? {} : { label } })

test('baseName: the label, trimmed, else the kind', () => {
  assert.equal(baseName(ed('d1', 'driver', ' Woofer ')), 'Woofer')
  assert.equal(baseName(saved('c1', 'chamber')), 'Chamber')
  assert.equal(baseName(ed('p1', 'pr', '   ')), TYPE_NAMES.pr)
  assert.equal(baseName({ id: 'x', type: 'mystery' }), 'x')
})

// CONTRACT: a shared name is numbered in the order the components were added; a unique one is not.
test('nameNumbers and displayNames: shared names numbered in order', () => {
  const nodes = [ed('a', 'driver', 'Woofer'), ed('b', 'chamber'), ed('c', 'driver', 'Woofer'), ed('d', 'chamber'), ed('e', 'waveguide', 'Port')]
  assert.deepEqual(nameNumbers(nodes), { a: 1, b: 1, c: 2, d: 2, e: 0 })
  assert.deepEqual(displayNames(nodes), { a: 'Woofer #1', b: 'Chamber #1', c: 'Woofer #2', d: 'Chamber #2', e: 'Port' })
})

test('names are shared across kinds, and the number goes once the name is unique', () => {
  const nodes = [saved('a', 'chamber', 'Box'), saved('b', 'waveguide', 'Box')]
  assert.deepEqual(displayNames(nodes), { a: 'Box #1', b: 'Box #2' })
  assert.deepEqual(displayNames([nodes[0], saved('b', 'waveguide', 'Port')]), { a: 'Box', b: 'Port' })
})

test('displayName: one component, or the id when there is none', () => {
  const nodes = [ed('a', 'driver', 'W'), ed('b', 'driver', 'W')]
  assert.equal(displayName(nodes, 'b'), 'W #2')
  assert.equal(displayName(nodes, 'zz'), 'zz')
  assert.equal(displayName(undefined, 'a'), 'a')
})

test('nameNumbers: not an array gives nothing', () => {
  assert.deepEqual(nameNumbers(null), {})
})
