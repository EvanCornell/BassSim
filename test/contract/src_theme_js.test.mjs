// Contract tests for src/theme.js.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { THEMES, loadTheme, applyTheme, saveTheme } from '../../src/theme.js'

// CONTRACT (loadTheme): "`system` when nothing valid is stored".
test('loadTheme: the stored choice, or system', () => {
  localStorage.removeItem('acousim:theme')
  assert.equal(loadTheme(), 'system')
  localStorage.setItem('acousim:theme', 'light')
  assert.equal(loadTheme(), 'light')
  localStorage.setItem('acousim:theme', 'purple')
  assert.equal(loadTheme(), 'system')
  localStorage.removeItem('acousim:theme')
  assert.deepEqual(THEMES.map(([k]) => k), ['system', 'dark', 'light'])
})

// CONTRACT (applyTheme): "Sets or removes `data-theme` on the root element."
test('applyTheme: pins dark or light, and system follows the OS', () => {
  const root = { dataset: {} }
  applyTheme('light', root)
  assert.equal(root.dataset.theme, 'light')
  applyTheme('dark', root)
  assert.equal(root.dataset.theme, 'dark')
  applyTheme('system', root)
  assert.equal('theme' in root.dataset, false)
  applyTheme('light', null) // no document: nothing to do, no throw
})

// CONTRACT (saveTheme): "Writes LocalStorage and applies the theme to the page."
test('saveTheme: remembered for the next load', () => {
  saveTheme('dark')
  assert.equal(loadTheme(), 'dark')
  saveTheme('system')
  assert.equal(loadTheme(), 'system')
})
