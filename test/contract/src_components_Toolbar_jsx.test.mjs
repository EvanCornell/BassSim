// Contract tests for src/components/Toolbar.jsx.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { clusters } from '../../src/components/Toolbar.jsx'
import { DEFAULT_TOOLBAR, TOOLBAR_ITEMS } from '../../src/toolbarItems.js'

// CONTRACT (clusters): "Metric ids split into runs of neighbours that share a cluster."
test('clusters: neighbours of one cluster share a pill, in bar order', () => {
  assert.deepEqual(clusters(['m_f3', 'm_f10', 'm_zpeaks', 'm_peakspl', 'm_xf3', 'm_volume']),
    [['m_f3', 'm_f10'], ['m_zpeaks'], ['m_peakspl', 'm_xf3'], ['m_volume']])
  // the same cluster split by another stays split: the bar keeps the user's order
  assert.deepEqual(clusters(['m_f3', 'm_volume', 'm_fb']), [['m_f3'], ['m_volume'], ['m_fb']])
  assert.deepEqual(clusters([]), [])
})

// The shipped bar groups into the four pills of the design: response,
// impedance, limits, volume.
test('the default bar makes four metric pills', () => {
  const metrics = DEFAULT_TOOLBAR.filter((id) => TOOLBAR_ITEMS[id].group === 'metrics')
  assert.deepEqual(clusters(metrics).map((ids) => TOOLBAR_ITEMS[ids[0]].cluster), ['response', 'impedance', 'limits', 'volume'])
})
