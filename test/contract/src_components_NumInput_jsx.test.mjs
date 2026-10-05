// Contract tests for the pure parts of src/components/NumInput.jsx.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readNumber, readNumberList } from '../../src/components/NumInput.jsx'

// CONTRACT: "The number, or why the text is not one the field takes."
test('readNumber: any text reads, and only valid numbers are values', () => {
  assert.deepEqual(readNumber(' 0.5 '), { ok: true, value: 0.5 })
  assert.deepEqual(readNumber('.5'), { ok: true, value: 0.5 })
  assert.deepEqual(readNumber('2e3'), { ok: true, value: 2000 })
  for (const t of ['', '-', '.', '1e', 'abc', '8x']) assert.equal(readNumber(t).ok, false, t)
  assert.deepEqual(readNumber('', { allowEmpty: true }), { ok: true, value: null })
})

test('readNumber: limits', () => {
  assert.equal(readNumber('0', { above: 0 }).ok, false)
  assert.equal(readNumber('0.001', { above: 0 }).ok, true)
  assert.equal(readNumber('-1', { min: 0 }).ok, false)
  assert.equal(readNumber('0', { min: 0 }).ok, true)
  assert.equal(readNumber('11', { max: 10 }).ok, false)
  assert.equal(readNumber('16.5', { integer: true }).ok, false)
  assert.match(readNumber('5', { validate: (v) => (v < 10 ? 'too small' : null) }).error, /too small/)
  assert.equal(readNumber('15', { validate: (v) => (v < 10 ? 'too small' : null) }).ok, true)
})

// CONTRACT: "The numbers, or why the text is not a list the field takes."
test('readNumberList: commas or spaces, every entry checked', () => {
  assert.deepEqual(readNumberList('0, 6 12;18'), { ok: true, value: [0, 6, 12, 18] })
  assert.equal(readNumberList('').ok, false)
  assert.equal(readNumberList('0, 6, x').ok, false)
  assert.equal(readNumberList('20, 0', { above: 0 }).ok, false)
})
