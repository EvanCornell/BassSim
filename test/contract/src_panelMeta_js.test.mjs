import { test } from 'node:test'
import assert from 'node:assert/strict'
import { panelTitle } from '../../src/panelMeta.js'

// CONTRACT: "`string` — The registered title, falling back to the raw id so an unknown panel
// still labels its tab with something."
test('panelTitle: an unknown panel id falls back to the raw id', () => {
  assert.equal(panelTitle('no-such-panel'), 'no-such-panel')
  assert.equal(panelTitle('__definitely_not_a_panel__'), '__definitely_not_a_panel__')
})

// CONTRACT: "`string` — The registered title" — a title is always a non-empty string for a
// non-empty id, since the fallback is the id itself.
test('panelTitle: always returns a string', () => {
  for (const id of ['spl', 'impedance', 'canvas', 'params', 'unknown-thing']) {
    const t = panelTitle(id)
    assert.equal(typeof t, 'string', `panelTitle(${id}) must be a string`)
    assert.ok(t.length > 0, `panelTitle(${id}) must not be empty`)
  }
})

// CONTRACT: "@pure — ... Calling it twice with equal inputs must produce equal output and change
// nothing observable."
test('panelTitle: is pure', () => {
  for (const id of ['spl', 'unknown-thing']) {
    assert.equal(panelTitle(id), panelTitle(id))
  }
})
