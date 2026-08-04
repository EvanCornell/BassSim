import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createServer, __internals } from '../../mcp/acousim.js'
// A real, simulatable project is needed to exercise `run`, `summarize` and
// `metricsSummary`. It is obtained from the documented builder API rather than
// hand-built, so no structural assumption is smuggled in.
import { searchDrivers, buildSealedBox } from '../../mcp/builders.js'

const { sig, labelOf, resolveNode, run, downsample, metricsSummary, summarize, jsonResult, errResult } =
  __internals

// UNREACHABLE — not covered:
//   spl.get, spl_direct.get, spl_node.get, impedance.get, impedance_phase.get,
//   excursion.get, excursion_node.get, velocity_node.get, chamber_spl.get,
//   acoustic_power.get, input_power.get, apparent_power.get, efficiency.get,
//   phase.get, group_delay.get
//   metricsSummary > put
//   createServer > need
//   createServer > simFb
//   createServer > bandIndices
//   createServer > makeScore

// CONTRACT: "### `__internals` — Keys: `sig`, `labelOf`, `resolveNode`, `run`,
// `downsample`, `metricsSummary`, `summarize`, `jsonResult`, `errResult`"
test('__internals: publishes exactly the documented internal helpers', () => {
  assert.deepEqual(
    Object.keys(__internals).sort(),
    ['downsample', 'errResult', 'jsonResult', 'labelOf', 'metricsSummary', 'resolveNode', 'run', 'sig', 'summarize'],
  )
})

// ===========================================================================
// sig
// ===========================================================================

// CONTRACT: "Round a number to a fixed significant-figure count for JSON
// output." / "`n` — _(optional, default `4`)_ — Significant figures."
test('sig: rounds to 4 significant figures by default', () => {
  assert.equal(sig(1.23456), 1.235)
  assert.equal(sig(123456), 123500)
  assert.equal(sig(0.00123456), 0.001235)
  assert.equal(sig(-1.23456), -1.235)
  assert.equal(sig(0), 0)
  assert.equal(sig(1.23456), sig(1.23456, 4))
})

// CONTRACT: "`n` — Significant figures."
test('sig: honours an explicit significant-figure count', () => {
  assert.equal(sig(1.23456, 2), 1.2)
  assert.equal(sig(1.23456, 1), 1)
  assert.equal(sig(1.23456, 6), 1.23456)
})

// CONTRACT: "`number|null` — The rounded number, or `null` for absent and
// non-finite values so the JSON carries an explicit \"no value\" rather than
// `NaN`."
test('sig: absent and non-finite values become null', () => {
  assert.equal(sig(null), null)
  assert.equal(sig(undefined), null)
  assert.equal(sig(NaN), null)
  assert.equal(sig(Infinity), null)
  assert.equal(sig(-Infinity), null)
})

// CONTRACT: @pure
test('sig: @pure — equal inputs give equal output', () => {
  assert.equal(sig(1.23456), sig(1.23456))
  assert.equal(sig(1.23456, 3), sig(1.23456, 3))
})

// ===========================================================================
// labelOf
// ===========================================================================

// CONTRACT: "`nodes` — Hydrated graph nodes, each shaped `{id, type, data:
// {params}}` — the label lives at `node.data.params.label`."

// CONTRACT: "Describe a node as `label (id)`, or just its id when it has no
// label." / "an agent reads \"Port (waveguide_3)\""
test('labelOf: formats a labelled node as "label (id)"', () => {
  const nodes = [{ id: 'waveguide_3', type: 'waveguide', data: { params: { label: 'Port' } } }]
  assert.equal(labelOf(nodes, 'waveguide_3'), 'Port (waveguide_3)')
})

// CONTRACT: "or just its id when it has no label"
test('labelOf: an unlabelled node is described by its id alone', () => {
  const nodes = [{ id: 'waveguide_3', type: 'waveguide', data: { params: {} } }]
  assert.equal(labelOf(nodes, 'waveguide_3'), 'waveguide_3')
})

// CONTRACT: @pure
test('labelOf: @pure — arguments unmodified, equal results', () => {
  const nodes = [{ id: 'a', type: 'chamber', data: { params: { label: 'Box' } } }]
  const snapshot = structuredClone(nodes)
  assert.equal(labelOf(structuredClone(nodes), 'a'), labelOf(structuredClone(nodes), 'a'))
  assert.deepEqual(nodes, snapshot)
})

// ===========================================================================
// resolveNode
// ===========================================================================

// CONTRACT: "`nodes` — Hydrated graph nodes, each shaped `{id, type, data:
// {params}}` — labels are matched against `node.data.params.label`."
const NODES = [
  { id: 'waveguide_3', type: 'waveguide', data: { params: { label: 'Port' } } },
  { id: 'chamber_1', type: 'chamber', data: { params: { label: 'Rear Chamber' } } },
  { id: 'driver_2', type: 'driver', data: { params: { label: 'Woofer' } } },
]

// CONTRACT: "Resolve a node reference, which may be an id or a label. ... Ids
// are matched first, then labels case-insensitively."
test('resolveNode: resolves by id and by label, case-insensitively', () => {
  assert.equal(resolveNode(NODES, 'waveguide_3').id, 'waveguide_3')
  assert.equal(resolveNode(NODES, 'Port').id, 'waveguide_3')
  assert.equal(resolveNode(NODES, 'port').id, 'waveguide_3')
  assert.equal(resolveNode(NODES, 'PORT').id, 'waveguide_3')
  assert.equal(resolveNode(NODES, 'rear chamber').id, 'chamber_1')
})

// CONTRACT: "Ids are matched first, then labels case-insensitively."
test('resolveNode: an id match wins over a label match', () => {
  const nodes = [
    { id: 'Port', type: 'chamber', data: { params: { label: 'Something Else' } } },
    { id: 'waveguide_3', type: 'waveguide', data: { params: { label: 'Port' } } },
  ]
  assert.equal(resolveNode(nodes, 'Port').id, 'Port')
})

// CONTRACT: "`types` — _(optional, default `null`)_ — Restrict to these node
// types. `null` searches every node."
test('resolveNode: types restricts the search and null searches every node', () => {
  assert.equal(resolveNode(NODES, 'Port', null).id, 'waveguide_3')
  assert.equal(resolveNode(NODES, 'Port'), resolveNode(NODES, 'Port', null))
  assert.equal(resolveNode(NODES, 'Port', ['waveguide']).id, 'waveguide_3')
  assert.throws(() => resolveNode(NODES, 'Port', ['chamber']), Error)
})

// CONTRACT: @throws Error "When nothing matches. The message lists the
// available nodes, so an agent can correct itself without another round-trip."
test('resolveNode: an unmatched reference throws, listing the available nodes', () => {
  assert.throws(
    () => resolveNode(NODES, 'no-such-node'),
    (e) =>
      e instanceof Error &&
      NODES.every((n) => e.message.includes(n.id)),
    'the message must list the available nodes',
  )
  // Neighbouring valid input.
  assert.doesNotThrow(() => resolveNode(NODES, 'Port'))
})

// CONTRACT: @pure
test('resolveNode: @pure — arguments unmodified, equal results', () => {
  const snapshot = structuredClone(NODES)
  assert.deepEqual(
    resolveNode(structuredClone(NODES), 'Port'),
    resolveNode(structuredClone(NODES), 'Port'),
  )
  assert.deepEqual(NODES, snapshot)
})

// ===========================================================================
// run
// ===========================================================================

const D0 = searchDrivers()[0]
const DRIVER_NAME = `${D0.brand} ${D0.model}`

function freshProject() {
  return buildSealedBox({ driver: { db: DRIVER_NAME }, volume: 40, name: 'Contract Box' }).project
}

let CTX = null
function ctx() {
  if (!CTX) CTX = run(freshProject())
  return CTX
}

// CONTRACT: "`{nodes, edges, settings, res, metrics}` — The hydrated graph, the
// raw result, and metrics — `null` when the simulation failed."
test('run: returns the hydrated graph, the raw result and metrics', () => {
  const c = ctx()
  assert.ok(Array.isArray(c.nodes))
  assert.ok(Array.isArray(c.edges))
  assert.equal(typeof c.settings, 'object')
  assert.equal(typeof c.res, 'object')
  assert.ok(c.metrics === null || typeof c.metrics === 'object')
})

// CONTRACT: "Point count is capped at 1024 regardless of what the project asks
// for, since a tool call is a synchronous request and an agent can otherwise
// request an arbitrarily expensive sweep."
test('run: point count is capped at 1024', () => {
  const p = freshProject()
  const pointsKey = Object.keys(p.settings).find((k) => p.settings[k] === 256)
  assert.ok(pointsKey, 'the builders default to a 256-point sweep')
  p.settings[pointsKey] = 50000
  const c = run(p)
  // AMBIGUITY: the spec does not say whether the returned `settings` reflects
  // the cap; the strictest defensible reading is that the sweep actually run
  // never exceeds 1024 points, which is what `settings` reports.
  assert.ok(c.settings[pointsKey] <= 1024, `points=${c.settings[pointsKey]}`)
})

// CONTRACT: @throws Error "When the project is structurally invalid,
// propagated from `hydrateProject`."
test('run: a structurally invalid project throws', () => {
  assert.throws(() => run(null), Error)
  assert.throws(() => run({ nodes: [{ id: 'a', type: 'chamber', params: {} }], edges: [{ source: 'a', sourceHandle: 'out', target: 'nope', targetHandle: 'in' }], settings: {} }), Error)
  // Neighbouring valid input.
  assert.doesNotThrow(() => run(freshProject()))
})

// ===========================================================================
// downsample
// ===========================================================================

const FREQS = Array.from({ length: 200 }, (_, i) => 10 + i)
const CURVE = FREQS.map((f) => Math.sin(f / 7) * 10 + 90)
// Put a distinct spike and dip well away from any evenly spaced sample.
CURVE[57] = 999
CURVE[113] = -999

// CONTRACT: "Reduce a curve to about `points` samples for a tool response." /
// "`points` — _(optional, default `48`)_ — Target sample count. The result may
// hold up to two more, for the extrema."
test('downsample: returns about `points` samples, defaulting to 48', () => {
  const out = downsample(FREQS, CURVE, 10)
  assert.ok(Array.isArray(out))
  assert.ok(out.length <= 12, `got ${out.length} samples for points=10`)
  assert.ok(out.length >= 2)
  assert.deepEqual(downsample(FREQS, CURVE), downsample(FREQS, CURVE, 48))
  assert.ok(downsample(FREQS, CURVE).length <= 50)
})

// CONTRACT: "`Array<[number|null, number|null]>` — `[frequency, value]` pairs
// in ascending frequency order, rounded for output."
test('downsample: emits [frequency, value] pairs in ascending frequency order', () => {
  const out = downsample(FREQS, CURVE, 10)
  for (const pair of out) {
    assert.ok(Array.isArray(pair))
    assert.equal(pair.length, 2)
    assert.ok(typeof pair[0] === 'number' || pair[0] === null)
    assert.ok(typeof pair[1] === 'number' || pair[1] === null)
  }
  for (let i = 1; i < out.length; i++) {
    assert.ok(out[i][0] >= out[i - 1][0], `frequency order broken at ${i}`)
  }
})

// CONTRACT: "the minimum and maximum are always added — without them, an
// impedance peak or an excursion spike could fall between samples and the
// agent would conclude the design is fine when it is not."
test('downsample: the minimum and maximum are always included', () => {
  const out = downsample(FREQS, CURVE, 10)
  const values = out.map((p) => p[1])
  const freqs = out.map((p) => p[0])
  assert.ok(freqs.includes(FREQS[57]), 'the maximum sample must be present')
  assert.ok(freqs.includes(FREQS[113]), 'the minimum sample must be present')
  assert.ok(Math.max(...values) >= 999 * 0.999)
  assert.ok(Math.min(...values) <= -999 * 0.999)
})

// CONTRACT: "`fmin` — Window the output to at or above this frequency." /
// "`fmax` — Window the output to at or below this frequency." / defaults null.
test('downsample: fmin and fmax window the output', () => {
  const out = downsample(FREQS, CURVE, 10, 50, 100)
  assert.ok(out.length > 0)
  for (const [f] of out) {
    assert.ok(f >= 50, `${f} is below fmin`)
    assert.ok(f <= 100, `${f} is above fmax`)
  }
  assert.deepEqual(downsample(FREQS, CURVE, 10), downsample(FREQS, CURVE, 10, null, null))
})

// CONTRACT: @pure
test('downsample: @pure — arguments unmodified, equal results', () => {
  const f = structuredClone(FREQS)
  const a = structuredClone(CURVE)
  const fSnap = structuredClone(f)
  const aSnap = structuredClone(a)
  assert.deepEqual(downsample(f, a, 10), downsample(f, a, 10))
  assert.deepEqual(f, fSnap)
  assert.deepEqual(a, aSnap)
})

// ===========================================================================
// metricsSummary
// ===========================================================================

// CONTRACT: "`object|null` — A flat object of formatted metrics, or `null` when
// there were none."
test('metricsSummary: null metrics summarize to null', () => {
  assert.equal(metricsSummary(null), null)
})

// CONTRACT: "Formatted metrics keyed by name ... Values are strings or numbers
// except `impedance_peaks`, which is an array of one formatted string per peak."
test('metricsSummary: values are strings or numbers, except impedance_peaks', () => {
  const c = ctx()
  assert.notEqual(c.metrics, null, 'the sealed-box reference project must simulate')
  const s = metricsSummary(c.metrics)
  assert.equal(typeof s, 'object')
  assert.notEqual(s, null)
  assert.ok(Object.keys(s).length > 0)
  for (const [k, v] of Object.entries(s)) {
    if (k === 'impedance_peaks') {
      assert.ok(Array.isArray(v), 'impedance_peaks must be an array')
      for (const peak of v) assert.equal(typeof peak, 'string', 'each peak is a formatted string')
    } else {
      assert.ok(
        typeof v === 'string' || typeof v === 'number',
        `${k} is ${Array.isArray(v) ? 'an array' : typeof v}, not a string or number`,
      )
    }
  }
})

// CONTRACT: "Absent figures are omitted rather than emitted as null, so a
// sealed box's summary simply has no tuning field instead of one saying
// `null`."
test('metricsSummary: absent figures are omitted rather than emitted as null', () => {
  const c = ctx()
  const s = metricsSummary(c.metrics)
  for (const [k, v] of Object.entries(s)) {
    assert.notEqual(v, null, `${k} was emitted as null`)
    assert.notEqual(v, undefined, `${k} was emitted as undefined`)
  }
  // Metrics that are entirely absent produce no fields at all.
  const allNull = {}
  for (const k of Object.keys(c.metrics)) allNull[k] = null
  assert.deepEqual(metricsSummary(allNull), {})
})

// CONTRACT: @pure
test('metricsSummary: @pure — arguments unmodified, equal results', () => {
  const m = structuredClone(ctx().metrics)
  const snapshot = structuredClone(m)
  assert.deepEqual(metricsSummary(structuredClone(m)), metricsSummary(structuredClone(m)))
  assert.deepEqual(m, snapshot)
})

// ===========================================================================
// summarize
// ===========================================================================

// CONTRACT: "Build the JSON summary returned by `simulate`." / "`points` —
// _(optional, default `40`)_ — Curve downsample resolution." / "The summary
// object, ready to serialize."
test('summarize: returns a serializable summary, defaulting to 40 curve points', () => {
  const c = ctx()
  const s = summarize(c)
  assert.equal(typeof s, 'object')
  assert.notEqual(s, null)
  assert.equal(typeof JSON.stringify(s), 'string')
  assert.deepEqual(s, summarize(c, 40))
})

// CONTRACT: "two downsampled curves" whose resolution is controlled by `points`
test('summarize: points controls the curve downsample resolution', () => {
  const c = ctx()
  const coarse = JSON.stringify(summarize(c, 8))
  const fine = JSON.stringify(summarize(c, 40))
  assert.notEqual(coarse, fine, 'the curve resolution must respond to `points`')
  assert.ok(coarse.length < fine.length)
})

// CONTRACT: @pure — "Calling it twice with equal inputs must produce equal
// output and change nothing observable."
test('summarize: @pure — the run context is not modified', () => {
  const c = ctx()
  const snapshot = structuredClone({ nodes: c.nodes, edges: c.edges, settings: c.settings, metrics: c.metrics })
  const a = summarize(c)
  const b = summarize(c)
  assert.deepEqual(a, b)
  assert.deepEqual(
    structuredClone({ nodes: c.nodes, edges: c.edges, settings: c.settings, metrics: c.metrics }),
    snapshot,
  )
})

// ===========================================================================
// jsonResult / errResult
// ===========================================================================

// CONTRACT: "`{content: Array<{type: string, text: string}>}` — An MCP tool
// result carrying the JSON as text."
test('jsonResult: wraps a value as an MCP tool result carrying the JSON as text', () => {
  const payload = { a: 1, b: ['x', null], c: { d: true } }
  const r = jsonResult(payload)
  assert.ok(Array.isArray(r.content))
  assert.equal(r.content.length, 1)
  assert.equal(r.content[0].type, 'text')
  assert.equal(typeof r.content[0].text, 'string')
  assert.deepEqual(JSON.parse(r.content[0].text), payload)
  assert.equal(r.isError, undefined, 'a successful result is not an error result')
})

// CONTRACT: @pure
test('jsonResult: @pure — equal inputs give equal output', () => {
  const payload = { a: 1 }
  assert.deepEqual(jsonResult(structuredClone(payload)), jsonResult(structuredClone(payload)))
})

// CONTRACT: "Wrap an error as a failed MCP tool result. Returned rather than
// thrown, so the agent receives the message" /
// "`{isError: boolean, content: Array<{type: string, text: string}>}`"
test('errResult: wraps an error as a failed MCP result carrying its message', () => {
  const e = new Error('unique-failure-token')
  const r = errResult(e)
  assert.equal(r.isError, true)
  assert.ok(Array.isArray(r.content))
  assert.equal(r.content.length, 1)
  assert.equal(r.content[0].type, 'text')
  assert.ok(r.content[0].text.includes('unique-failure-token'))
})

// CONTRACT: @pure
test('errResult: @pure — equal inputs give equal output', () => {
  assert.deepEqual(errResult(new Error('x')), errResult(new Error('x')))
})

// ===========================================================================
// createServer
// ===========================================================================

// CONTRACT: "Build a fully configured MCP server with every tool and resource
// registered." / "A factory rather than a singleton because the HTTP transport
// is stateless: each POST is handled by a fresh instance" / "A server ready to
// connect to a transport."
test('createServer: is a factory returning a fresh server ready to connect', () => {
  const a = createServer()
  const b = createServer()
  assert.equal(typeof a, 'object')
  assert.notEqual(a, null)
  assert.notEqual(a, b, 'a factory, not a singleton')
  assert.equal(typeof a.connect, 'function', 'the server must be ready to connect to a transport')
})
