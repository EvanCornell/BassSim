// Contract tests for the pure parts of src/components/ExprInput.jsx.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readTyped, shortNum } from '../../src/components/ExprInput.jsx'

// CONTRACT: "Read typed text as a field value: a number, an expression, or neither."
test('readTyped: numbers, expressions, and what is not yet either', () => {
  assert.deepEqual(readTyped(' 12.5 ', {}), { ok: true, value: 12.5 })
  assert.deepEqual(readTyped('-1e3', {}), { ok: true, value: -1000 })
  assert.deepEqual(readTyped('Vb / 2', { Vb: 60 }), { ok: true, value: 'Vb / 2' })
  assert.equal(readTyped('Vb /', { Vb: 60 }).ok, false)
  assert.equal(readTyped('Vc * 2', { Vb: 60 }).ok, false)
  assert.equal(readTyped('', {}).ok, false)
})

// CONTRACT: "Up to six significant figures."
test('shortNum: six significant figures', () => {
  assert.equal(shortNum(1 / 3), '0.333333')
  assert.equal(shortNum(60), '60')
  assert.equal(shortNum(NaN), '—')
})
