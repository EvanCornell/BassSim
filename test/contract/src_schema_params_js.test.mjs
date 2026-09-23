// Contract tests for src/schema/params.js — named parameters and expressions.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  isExpression, isValidParamName, evaluateParams, evaluateExpression, isNumericField, resolveProject,
} from '../../src/schema/params.js'
import { migrateProject } from '../../src/schema/migrate.js'

// CONTRACT: "True for a string — the only form an expression takes."
test('isExpression: strings are expressions, numbers are not', () => {
  assert.equal(isExpression('Vb/2'), true)
  assert.equal(isExpression(3), false)
  assert.equal(isExpression(null), false)
})

// CONTRACT: "An identifier that does not collide with a constant or a function name."
test('isValidParamName: identifiers only, never a constant or function', () => {
  for (const ok of ['Vb', '_x', 'port2', 'A_b']) assert.equal(isValidParamName(ok), true, ok)
  for (const bad of ['2x', 'a-b', '', 'pi', 'e', 'sqrt', 'max', null]) assert.equal(isValidParamName(bad), false, String(bad))
})

// CONTRACT: "Parameters may reference each other." Resolved in dependency order,
// whatever order they are listed in.
test('evaluateParams: references resolve regardless of order', () => {
  const r = evaluateParams([{ name: 'L', value: 'Vb / 2 + sqrt(4)' }, { name: 'Vb', value: 60 }])
  assert.deepEqual(r.errors, [])
  assert.deepEqual(r.values, { L: 32, Vb: 60 })
})

// CONTRACT: "A reference to an unknown name, a cycle, a duplicate or invalid
// name, or a result that is not a finite number is reported, and that parameter
// (with anything depending on it) is left out of `values`."
test('evaluateParams: every failure is reported and left out', () => {
  const r = evaluateParams([
    { name: 'a', value: 'b + 1' }, { name: 'b', value: 'a' },
    { name: 'u', value: 'nope * 2' },
    { name: 'dup', value: 1 }, { name: 'dup', value: 2 },
    { name: 'pi', value: 3 },
    { name: 'inf', value: '1 / 0' },
    { name: 'dep', value: 'u + 1' },
    { name: 'ok', value: 5 },
  ])
  assert.deepEqual(Object.keys(r.values).sort(), ['dup', 'ok'])
  const text = r.errors.join('\n')
  assert.match(text, /cycle: a → b → a/)
  assert.match(text, /"u" refers to "nope"/)
  assert.match(text, /"dup" is defined more than once/)
  assert.match(text, /"pi" is not a valid parameter name/)
  assert.match(text, /"inf" does not evaluate to a finite number/)
})

// CONTRACT (the language): "nothing can assign, define a function, reach a unit
// or call anything else."
test('evaluateExpression: only the permitted language is accepted', () => {
  for (const bad of ['x = 3', 'f(x) = x', '2 cm', 'import(1)', 'a > b', '"text"', '3!', '[1, 2]']) {
    const r = evaluateExpression(bad, { a: 1, b: 2, x: 1 })
    assert.ok(Number.isNaN(r.value), `${bad} must not evaluate`)
    assert.ok(r.error, `${bad} must report why`)
  }
  assert.equal(evaluateExpression('max(a, 3) * 2 ^ 2 - -1', { a: 1 }).value, 13)
  assert.ok(Math.abs(evaluateExpression('pi * e', {}).value - Math.PI * Math.E) < 1e-12)
})

// CONTRACT: "True when the field's default is a number, or it is a numeric
// field that defaults to `null`."
test('isNumericField: numeric by default type, plus nullable numerics', () => {
  assert.equal(isNumericField('chamber', 'volume'), true)
  assert.equal(isNumericField('chamber', 'leakQL'), true)
  assert.equal(isNumericField('chamber', 'label'), false)
  assert.equal(isNumericField('waveguide', 'flare'), false)
  assert.equal(isNumericField('nope', 'volume'), false)
})

// CONTRACT: "Covers node params, tap positions, the master level, channel volts
// and output resistance, DSP delay and filter values, analysis ranges and probe
// positions."
test('resolveProject: every numeric place is resolved', () => {
  const proj = migrateProject({
    schemaVersion: 3,
    params: [{ name: 'Vb', value: 60 }, { name: 'V', value: 20 }],
    nodes: [{ id: 'c', type: 'chamber', params: { volume: 'Vb', length: 'Vb / 2', label: 'Vb', taps: [{ id: 't', position: 'Vb / 4' }] } }],
    wiring: { masterDb: '0 - 3', channels: [{ id: 'ch', volts: 'V', outputOhms: '0.1', dsp: { delayMs: '1 + 1', filters: [{ type: 'highpass', hz: 'Vb / 3', order: 4 }] } }] },
    analyses: [{ id: 'a', type: 'ac', fmin: '10', fmax: 'V * 50', npts: 100 }],
    probes: [{ id: 'p', kind: 'pressure', at: { node: 'c', position: 'Vb / 6' } }],
  })
  const { project, errors } = resolveProject(proj)
  assert.deepEqual(errors, [])
  const c = project.nodes[0].params
  assert.equal(c.volume, 60); assert.equal(c.length, 30); assert.equal(c.label, 'Vb', 'text fields are left alone')
  assert.equal(c.taps[0].position, 15)
  assert.equal(project.wiring.masterDb, -3)
  assert.equal(project.wiring.channels[0].volts, 20)
  assert.equal(project.wiring.channels[0].outputOhms, 0.1)
  assert.equal(project.wiring.channels[0].dsp.delayMs, 2)
  assert.equal(project.wiring.channels[0].dsp.filters[0].hz, 20)
  assert.equal(project.analyses[0].fmin, 10); assert.equal(project.analyses[0].fmax, 1000)
  assert.equal(project.probes[0].at.position, 10)
})

// CONTRACT: "Anything that cannot be resolved is reported with where it is, and
// left as `NaN`."
test('resolveProject: an unresolvable field is reported with its location and left NaN', () => {
  const proj = migrateProject({ schemaVersion: 3, nodes: [{ id: 'c', type: 'chamber', params: { volume: 'missing * 2', label: 'Box' } }] })
  const { project, errors } = resolveProject(proj)
  assert.ok(Number.isNaN(project.nodes[0].params.volume))
  assert.equal(errors.length, 1)
  assert.match(errors[0], /^Box › volume: /)
})

// CONTRACT: "@post proj is not modified"
test('resolveProject: the input is not modified', () => {
  const proj = migrateProject({ schemaVersion: 3, params: [{ name: 'a', value: 2 }], nodes: [{ id: 'c', type: 'chamber', params: { volume: 'a' } }] })
  const before = JSON.stringify(proj)
  resolveProject(proj)
  assert.equal(JSON.stringify(proj), before)
})
