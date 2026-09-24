// Contract tests for the pure parts of src/components/WiringPanel.jsx.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { editAt } from '../../src/components/WiringPanel.jsx'

// CONTRACT: "Replace the subtree at a path in a load tree" — `null` removes it.
test('editAt: replaces or removes the subtree at a path', () => {
  const tree = { parallel: [{ driver: 'a' }, { series: [{ driver: 'b' }, { driver: 'c' }] }] }
  assert.deepEqual(editAt(tree, [1, 0], () => null), { parallel: [{ driver: 'a' }, { series: [{ driver: 'c' }] }] })
  assert.deepEqual(editAt(tree, [1], (t) => ({ parallel: t.series })), { parallel: [{ driver: 'a' }, { parallel: [{ driver: 'b' }, { driver: 'c' }] }] })
  assert.deepEqual(editAt(tree, [], (t) => ({ series: t.parallel })).series.length, 2)
  assert.deepEqual(tree.parallel[1].series.length, 2, 'the input is not modified')
})
