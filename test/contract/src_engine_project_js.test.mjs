import { test } from 'node:test'
import assert from 'node:assert/strict'
import { hydrateProject } from '../../src/engine/project.js'

// AMBIGUITY (documented here rather than softened away): the contract for
// `hydrateProject` never enumerates the valid node `type` values, nor the field
// names of a serialized edge ("Serialized edges. Missing ids are assigned
// positionally." says nothing about how an edge names its endpoints). The tests
// below therefore only assert what the contract itself states: the returned
// shape, the merge of `DEFAULT_SETTINGS`, non-mutation of `proj`, and that the
// three documented structural problems throw an Error carrying `projectErrors`.
// Edge endpoints are written with the React-Flow field names `source`/`target`,
// which is the only convention the spec pack hints at; an edge whose endpoints
// cannot be resolved is a missing-node reference under any reading.

// ---------------------------------------------------------------------------
// hydrateProject(proj)

// CONTRACT: "`{nodes: Array<object>, edges: Array<object>, settings: object}` —
// The hydrated graph."
test('hydrateProject: returns {nodes, edges, settings}', () => {
  const out = hydrateProject({ nodes: [], edges: [] })
  assert.ok(Array.isArray(out.nodes), 'nodes must be an array')
  assert.ok(Array.isArray(out.edges), 'edges must be an array')
  assert.equal(typeof out.settings, 'object')
  assert.notEqual(out.settings, null, 'settings must be an object')
})

// CONTRACT: "`proj.nodes` — `Array<object>` _(optional)_" /
// "`proj.edges` — `Array<object>` _(optional)_" /
// "`proj.settings` — `object` _(optional)_"
test('hydrateProject: nodes, edges and settings are all optional', () => {
  const out = hydrateProject({})
  assert.ok(Array.isArray(out.nodes))
  assert.ok(Array.isArray(out.edges))
  assert.equal(typeof out.settings, 'object')
  assert.equal(out.nodes.length, 0)
  assert.equal(out.edges.length, 0)
})

// CONTRACT: "`proj.settings` — `object` _(optional)_ — Sweep settings, merged
// over `DEFAULT_SETTINGS`."
test('hydrateProject: settings are merged over DEFAULT_SETTINGS', () => {
  const defaults = hydrateProject({}).settings
  const keys = Object.keys(defaults)
  assert.ok(keys.length > 0, 'DEFAULT_SETTINGS must supply at least one key')

  // Supplied values win over the defaults...
  const overridden = hydrateProject({ settings: { [keys[0]]: '__override__' } }).settings
  assert.equal(overridden[keys[0]], '__override__')

  // ...and every default key survives a partial settings object.
  for (const k of keys) {
    assert.ok(k in overridden, `default setting ${k} must survive the merge`)
    if (k !== keys[0]) {
      assert.deepEqual(overridden[k], defaults[k], `default setting ${k} must be preserved`)
    }
  }
})

// CONTRACT: "Missing params are filled from `DEFAULT_PARAMS`, so a project that
// specifies only what matters ... hydrates into a complete graph."
// AMBIGUITY: with no valid node type documented, the only blind check of the
// fill-in is that an empty project still hydrates without error.
test('hydrateProject: a minimal project hydrates without error', () => {
  assert.doesNotThrow(() => hydrateProject({}))
  assert.doesNotThrow(() => hydrateProject({ nodes: [], edges: [], settings: {} }))
})

// CONTRACT: "**Throws** `Error` — When a node lacks an id ... The full list is
// on the error's `projectErrors` property as well as its message."
test('hydrateProject: throws when a node lacks an id', () => {
  const err = assert.throws(
    () => hydrateProject({ nodes: [{ type: 'driver', position: { x: 0, y: 0 }, params: {} }] }),
    Error,
  )
  assert.ok(Array.isArray(err.projectErrors), 'projectErrors must be an array')
  assert.ok(err.projectErrors.length > 0, 'projectErrors must list the problem')
  assert.ok(typeof err.message === 'string' && err.message.length > 0)
})

// CONTRACT: "**Throws** `Error` — When ... a node has an unknown type ..."
test('hydrateProject: throws when a node has an unknown type', () => {
  const err = assert.throws(
    () => hydrateProject({
      nodes: [{ id: 'n1', type: '__no_such_node_type__', position: { x: 0, y: 0 }, params: {} }],
    }),
    Error,
  )
  assert.ok(Array.isArray(err.projectErrors))
  assert.ok(err.projectErrors.length > 0)
})

// CONTRACT: "**Throws** `Error` — When ... an edge references a missing node."
test('hydrateProject: throws when an edge references a missing node', () => {
  const err = assert.throws(
    () => hydrateProject({ nodes: [], edges: [{ id: 'e1', source: 'nope', target: 'alsoNope' }] }),
    Error,
  )
  assert.ok(Array.isArray(err.projectErrors))
  assert.ok(err.projectErrors.length > 0)
  // Neighbouring valid input: no edges at all must not throw.
  assert.doesNotThrow(() => hydrateProject({ nodes: [], edges: [] }))
})

// CONTRACT: "Structural problems are collected and reported together rather
// than thrown at the first one, because a hand-edited file usually has more
// than one ... The full list is on the error's `projectErrors` property".
test('hydrateProject: collects several structural problems together', () => {
  const err = assert.throws(
    () => hydrateProject({
      nodes: [
        { type: '__no_such_node_type__', position: { x: 0, y: 0 }, params: {} },
        { id: 'n2', type: '__also_no_such_type__', position: { x: 0, y: 0 }, params: {} },
      ],
      edges: [{ id: 'e1', source: 'ghost', target: 'phantom' }],
    }),
    Error,
  )
  assert.ok(Array.isArray(err.projectErrors))
  assert.ok(
    err.projectErrors.length >= 2,
    `expected several collected problems, got ${JSON.stringify(err.projectErrors)}`,
  )
})

// CONTRACT postcondition: "proj is not modified — nodes and params are copied,
// not aliased."
test('hydrateProject: proj is not modified', () => {
  const proj = {
    nodes: [],
    edges: [],
    settings: { fMin: 15, fMax: 350, points: 128 },
  }
  const before = structuredClone(proj)
  const out = hydrateProject(proj)
  assert.deepEqual(proj, before, 'hydrateProject must not mutate its argument')
  // Not aliased either: mutating the result must not reach back into proj.
  out.settings.fMin = -999
  out.nodes.push({ id: 'injected' })
  out.edges.push({ id: 'injected' })
  assert.deepEqual(proj, before, 'the result must not alias proj')
})

// CONTRACT: "**Purity:** `@pure` ... Calling it twice with equal inputs must
// produce equal output and change nothing observable."
test('hydrateProject: @pure — equal inputs give equal outputs', () => {
  const proj = { nodes: [], edges: [], settings: { fMin: 15 } }
  const clone = structuredClone(proj)
  const a = hydrateProject(proj)
  const b = hydrateProject(clone)
  assert.deepEqual(a, b)
  assert.deepEqual(proj, clone, 'neither call may modify its argument')
})

// UNREACHABLE — not covered:
// (none — the single export of src/engine/project.js is marked EXPORTED/testable)
