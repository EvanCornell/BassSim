import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  hydrateProject, SCHEMA_VERSION, DEFAULT_PARAMS, DEFAULT_SETTINGS,
} from '../../src/engine/project.js'

// The module header fixes the on-disk shape: "A project is plain JSON:
// { name, settings, nodes: [{id,type,position,params}],
//   edges: [{source,sourceHandle,target,targetHandle}] }."
// and DEFAULT_PARAMS "doubles as the schema: `hydrateProject` treats a type
// absent from this map as unknown", so its keys are exactly the valid types.
const NODE_TYPES = ['driver', 'chamber', 'waveguide', 'pr', 'radiation']

const node = (id, type, params = {}) => ({ id, type, position: { x: 0, y: 0 }, params })

// Captures the thrown error. `assert.throws` returns undefined, so the error is
// taken from the validator argument, which receives it.
function throwsProjectError(fn, msg = '') {
  let captured = null
  assert.throws(fn, (err) => { captured = err; return true }, msg)
  assert.ok(captured instanceof Error, `${msg} must throw an Error`)
  assert.ok(
    Array.isArray(captured.projectErrors),
    `${msg} error must carry a projectErrors array, got ${typeof captured.projectErrors}`,
  )
  assert.ok(captured.projectErrors.length > 0, `${msg} projectErrors must not be empty`)
  assert.equal(typeof captured.message, 'string')
  assert.ok(captured.message.length > 0, `${msg} error must have a message`)
  // "The full list is on the error's `projectErrors` property as well as its
  // message" — every listed problem must appear in the message too.
  for (const e of captured.projectErrors) {
    if (typeof e === 'string') {
      assert.ok(
        captured.message.includes(e),
        `${msg} message must contain the listed problem ${JSON.stringify(e)}`,
      )
    }
  }
  return captured
}

// ---------------------------------------------------------------------------
// Exported constants

// CONTRACT: "`SCHEMA_VERSION` — Version of the `.acousim.json` project schema
// this build reads and writes. Value: `1`"
test('SCHEMA_VERSION: is 1', () => {
  assert.equal(SCHEMA_VERSION, 1)
})

// CONTRACT: "`DEFAULT_PARAMS` — Default params for each node type, in display
// units. ... Keys: `driver`, `chamber`, `waveguide`, `pr`, `radiation`"
test('DEFAULT_PARAMS: has an entry for each node type', () => {
  assert.deepEqual(Object.keys(DEFAULT_PARAMS).sort(), [...NODE_TYPES].sort())
  for (const type of NODE_TYPES) {
    assert.equal(typeof DEFAULT_PARAMS[type], 'object', `${type} entry must be an object`)
    assert.notEqual(DEFAULT_PARAMS[type], null)
  }
})

// CONTRACT: "`DEFAULT_SETTINGS` — Default sweep and display settings for a new
// project. ... Keys: `fmin`, `fmax`, `npts`, `voltage`, `impedance`, `power`,
// `rg`, `vThreshold`, `masking`, `unwrapPhase`, `delayOffset`, `nlEnabled`"
test('DEFAULT_SETTINGS: has exactly the documented keys', () => {
  assert.deepEqual(
    Object.keys(DEFAULT_SETTINGS).sort(),
    ['delayOffset', 'fmax', 'fmin', 'impedance', 'masking', 'nlEnabled',
      'npts', 'power', 'rg', 'unwrapPhase', 'vThreshold', 'voltage'],
  )
})

// CONTRACT: "`impedance` and `power` are UI conveniences linked to `voltage` by
// P = V²/Z; the solver reads only `voltage`."
test('DEFAULT_SETTINGS: power, voltage and impedance satisfy P = V²/Z', () => {
  const { voltage: V, impedance: Z, power: P } = DEFAULT_SETTINGS
  assert.equal(typeof V, 'number')
  assert.equal(typeof Z, 'number')
  assert.equal(typeof P, 'number')
  // Tolerance 1e-9 relative: the three are stored as rounded display values.
  assert.ok(
    Math.abs(P - (V * V) / Z) <= 1e-9 * Math.abs((V * V) / Z),
    `expected P = V²/Z: P=${P}, V=${V}, Z=${Z}`,
  )
})

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
  // Omitted entirely: every default survives, with its documented value.
  const defaults = hydrateProject({}).settings
  for (const [k, v] of Object.entries(DEFAULT_SETTINGS)) {
    assert.deepEqual(defaults[k], v, `default setting ${k} must come from DEFAULT_SETTINGS`)
  }
  // Partially supplied: supplied values win, the rest still come from defaults.
  const out = hydrateProject({ settings: { fmin: 12, npts: 64 } }).settings
  assert.equal(out.fmin, 12)
  assert.equal(out.npts, 64)
  for (const [k, v] of Object.entries(DEFAULT_SETTINGS)) {
    if (k === 'fmin' || k === 'npts') continue
    assert.deepEqual(out[k], v, `default setting ${k} must survive the merge`)
  }
})

// CONTRACT: "Missing params are filled from `DEFAULT_PARAMS`, so a project that
// specifies only what matters ... hydrates into a complete graph." and
// "every saved node is merged over its entry so a project written by an older
// build gains any parameter added since."
test('hydrateProject: missing params are filled from DEFAULT_PARAMS', () => {
  const proj = { nodes: NODE_TYPES.map((t, i) => node(`n${i}`, t)), edges: [] }
  const out = hydrateProject(proj)
  assert.equal(out.nodes.length, NODE_TYPES.length)
  for (const n of out.nodes) {
    const defaults = DEFAULT_PARAMS[n.type]
    assert.equal(typeof n.params, 'object', `${n.type}: params must be an object`)
    for (const [k, v] of Object.entries(defaults)) {
      assert.deepEqual(n.params[k], v, `${n.type}: param ${k} must be filled from DEFAULT_PARAMS`)
    }
  }
})

// CONTRACT: "every saved node is merged over its entry" — a saved value wins
// over the default, and the other defaults still arrive.
test('hydrateProject: saved params are merged over the defaults', () => {
  const type = 'driver'
  const keys = Object.keys(DEFAULT_PARAMS[type])
  assert.ok(keys.length > 0, 'DEFAULT_PARAMS.driver must define at least one param')
  const overridden = keys[0]
  const out = hydrateProject({
    nodes: [node('n1', type, { [overridden]: '__saved__' })],
    edges: [],
  })
  assert.equal(out.nodes[0].params[overridden], '__saved__', 'a saved param must win')
  for (const k of keys.slice(1)) {
    assert.deepEqual(
      out.nodes[0].params[k], DEFAULT_PARAMS[type][k],
      `param ${k} must still be filled from DEFAULT_PARAMS`,
    )
  }
})

// CONTRACT: "Turn a serialized project into the shape `runSimulation` expects."
// A well-formed project with valid node types and resolvable edges must hydrate.
test('hydrateProject: a well-formed project hydrates without error', () => {
  assert.doesNotThrow(() => hydrateProject({}))
  assert.doesNotThrow(() => hydrateProject({ nodes: [], edges: [], settings: {} }))
  assert.doesNotThrow(() => hydrateProject({
    nodes: [node('n1', 'driver'), node('n2', 'chamber'), node('n3', 'radiation')],
    edges: [
      { source: 'n1', sourceHandle: 'out', target: 'n2', targetHandle: 'in' },
      { source: 'n2', sourceHandle: 'out', target: 'n3', targetHandle: 'in' },
    ],
  }))
  // Every documented node type is accepted.
  for (const type of NODE_TYPES) {
    assert.doesNotThrow(
      () => hydrateProject({ nodes: [node('n1', type)], edges: [] }),
      `node type ${type} must be accepted`,
    )
  }
})

// CONTRACT: "`proj.edges` — `Array<object>` _(optional)_ — Serialized edges.
// Missing ids are assigned positionally."
test('hydrateProject: edges missing ids are assigned positionally', () => {
  const out = hydrateProject({
    nodes: [node('n1', 'driver'), node('n2', 'chamber'), node('n3', 'radiation')],
    edges: [
      { source: 'n1', target: 'n2' },
      { id: 'kept', source: 'n2', target: 'n3' },
      { source: 'n1', target: 'n3' },
    ],
  })
  assert.equal(out.edges.length, 3)
  for (const [i, e] of out.edges.entries()) {
    assert.ok(e.id !== undefined && e.id !== null && e.id !== '', `edge ${i} must have an id`)
  }
  assert.equal(out.edges[1].id, 'kept', 'a supplied edge id must be preserved')
  const ids = out.edges.map((e) => e.id)
  assert.equal(new Set(ids).size, ids.length, 'assigned edge ids must be distinct')
  // "positionally": the id assigned to an edge depends on its index, so the
  // same edge at a different index gets a different id.
  const moved = hydrateProject({
    nodes: [node('n1', 'driver'), node('n2', 'chamber')],
    edges: [{ id: 'kept', source: 'n1', target: 'n2' }, { source: 'n1', target: 'n2' }],
  })
  assert.notEqual(moved.edges[1].id, out.edges[0].id)
})

// CONTRACT: "**Throws** `Error` — When a node lacks an id ... The full list is
// on the error's `projectErrors` property as well as its message."
// The node's type is valid, so a missing id is the only fault.
test('hydrateProject: throws when a node lacks an id', () => {
  const err = throwsProjectError(
    () => hydrateProject({
      nodes: [{ type: 'driver', position: { x: 0, y: 0 }, params: {} }],
      edges: [],
    }),
    'a node without an id:',
  )
  assert.equal(
    err.projectErrors.length, 1,
    `one fault must produce one collected problem, got ${JSON.stringify(err.projectErrors)}`,
  )
  // Neighbouring valid input: the same node with an id must not throw.
  assert.doesNotThrow(() => hydrateProject({ nodes: [node('n1', 'driver')], edges: [] }))
})

// CONTRACT: "**Throws** `Error` — When ... a node has an unknown type ..." and
// "`hydrateProject` treats a type absent from this map as unknown".
test('hydrateProject: throws when a node has an unknown type', () => {
  const err = throwsProjectError(
    () => hydrateProject({ nodes: [node('n1', '__no_such_node_type__')], edges: [] }),
    'a node with an unknown type:',
  )
  assert.equal(
    err.projectErrors.length, 1,
    `one fault must produce one collected problem, got ${JSON.stringify(err.projectErrors)}`,
  )
  // A type absent from DEFAULT_PARAMS is unknown, one that is present is not.
  for (const type of NODE_TYPES) {
    assert.doesNotThrow(
      () => hydrateProject({ nodes: [node('n1', type)], edges: [] }),
      `${type} is a key of DEFAULT_PARAMS and must not be unknown`,
    )
  }
})

// CONTRACT: "**Throws** `Error` — When ... an edge references a missing node."
test('hydrateProject: throws when an edge references a missing node', () => {
  const err = throwsProjectError(
    () => hydrateProject({
      nodes: [node('n1', 'driver')],
      edges: [{ source: 'n1', target: '__ghost__' }],
    }),
    'an edge with a missing target:',
  )
  assert.equal(
    err.projectErrors.length, 1,
    `one fault must produce one collected problem, got ${JSON.stringify(err.projectErrors)}`,
  )
  throwsProjectError(
    () => hydrateProject({
      nodes: [node('n1', 'driver')],
      edges: [{ source: '__ghost__', target: 'n1' }],
    }),
    'an edge with a missing source:',
  )
  // Neighbouring valid input: the same edge between two present nodes.
  assert.doesNotThrow(() => hydrateProject({
    nodes: [node('n1', 'driver'), node('n2', 'radiation')],
    edges: [{ source: 'n1', target: 'n2' }],
  }))
})

// CONTRACT: "Structural problems are collected and reported together rather
// than thrown at the first one, because a hand-edited file usually has more
// than one ... The full list is on the error's `projectErrors` property".
test('hydrateProject: collects several structural problems together', () => {
  const err = throwsProjectError(
    () => hydrateProject({
      nodes: [
        { type: 'driver', position: { x: 0, y: 0 }, params: {} }, // no id
        node('n2', '__no_such_node_type__'), // unknown type
        node('n3', 'chamber'), // fine
      ],
      edges: [{ source: 'n3', target: '__ghost__' }], // missing node
    }),
    'three independent faults:',
  )
  assert.ok(
    err.projectErrors.length >= 3,
    `all three problems must be collected, got ${JSON.stringify(err.projectErrors)}`,
  )
})

// CONTRACT postcondition: "proj is not modified — nodes and params are copied,
// not aliased."
test('hydrateProject: proj is not modified', () => {
  const proj = {
    name: 'p',
    nodes: [node('n1', 'driver', { __custom__: 1 }), node('n2', 'radiation')],
    edges: [{ source: 'n1', target: 'n2' }],
    settings: { fmin: 15, fmax: 350, npts: 128 },
  }
  const before = structuredClone(proj)
  const out = hydrateProject(proj)
  assert.deepEqual(proj, before, 'hydrateProject must not mutate its argument')
  // "copied, not aliased": mutating the result must not reach back into proj.
  out.settings.fmin = -999
  out.nodes[0].params.__custom__ = -999
  out.nodes.push({ id: 'injected' })
  out.edges.push({ id: 'injected' })
  assert.deepEqual(proj, before, 'the result must not alias proj')
})

// CONTRACT: "`DEFAULT_PARAMS` — Default params for each node type" — it is the
// shared schema, so a hydrated node must not alias it either.
test('hydrateProject: hydrated params do not alias DEFAULT_PARAMS', () => {
  const before = structuredClone(DEFAULT_PARAMS)
  const out = hydrateProject({ nodes: [node('n1', 'driver')], edges: [] })
  const key = Object.keys(DEFAULT_PARAMS.driver)[0]
  out.nodes[0].params[key] = '__mutated__'
  assert.deepEqual(DEFAULT_PARAMS, before, 'DEFAULT_PARAMS must not be aliased by the result')
})

// CONTRACT: "**Purity:** `@pure` ... Calling it twice with equal inputs must
// produce equal output and change nothing observable."
test('hydrateProject: @pure — equal inputs give equal outputs', () => {
  const proj = {
    nodes: [node('n1', 'driver'), node('n2', 'chamber')],
    edges: [{ source: 'n1', target: 'n2' }],
    settings: { fmin: 15 },
  }
  const clone = structuredClone(proj)
  const a = hydrateProject(proj)
  const b = hydrateProject(clone)
  assert.deepEqual(a, b)
  assert.deepEqual(proj, clone, 'neither call may modify its argument')
})

// UNREACHABLE — not covered:
// (none — the single export of src/engine/project.js is marked EXPORTED/testable)
