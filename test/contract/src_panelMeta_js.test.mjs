import { test } from 'node:test'
import assert from 'node:assert/strict'
import { panelTitle } from '../../src/panelMeta.js'

// CONTRACT (constants): "`PANEL_META` — Metadata for every panel the workspace knows how to
// render. Keys: `palette`, `canvas`, `params`, `nllab`, `spl`, `zin`, `exc`, `vel`, `int`,
// `pow`, `eff`, `pe`, `ph`"
const PANEL_IDS = [
  'palette', 'canvas', 'params', 'nllab', 'spl', 'zin', 'exc',
  'vel', 'int', 'pow', 'eff', 'pe', 'ph',
]

// CONTRACT: "`string` — The registered title, falling back to the raw id so an unknown panel
// still labels its tab with something."
test('panelTitle: an unknown panel id falls back to the raw id', () => {
  assert.equal(panelTitle('no-such-panel'), 'no-such-panel')
  assert.equal(panelTitle('__definitely_not_a_panel__'), '__definitely_not_a_panel__')
})

// CONTRACT: "`string` — The registered title" — every panel in the registry has one
test('panelTitle: every known panel id has a registered title', () => {
  for (const id of PANEL_IDS) {
    const t = panelTitle(id)
    assert.equal(typeof t, 'string', `panelTitle(${id}) must be a string`)
    assert.ok(t.length > 0, `panelTitle(${id}) must not be empty`)
  }
})

// CONTRACT: "Display title for a panel." — a title names one panel in a tab strip, so no two
// panels in the registry may carry the same one.
test('panelTitle: registered titles are distinct across panels', () => {
  const titles = PANEL_IDS.map(panelTitle)
  assert.equal(new Set(titles).size, titles.length, `duplicate panel titles: ${titles.join(', ')}`)
})

// CONTRACT: "@pure — ... Calling it twice with equal inputs must produce equal output and change
// nothing observable."
test('panelTitle: is pure', () => {
  for (const id of [...PANEL_IDS, 'unknown-thing']) {
    assert.equal(panelTitle(id), panelTitle(id))
  }
})
