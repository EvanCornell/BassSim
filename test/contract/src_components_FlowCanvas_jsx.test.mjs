import { test } from 'node:test'
import assert from 'node:assert/strict'
import { __internals } from '../../src/components/FlowCanvas.jsx'

// UNREACHABLE — not covered:
//   FlowCanvas() — EXPORTED, but documented to return `React.ReactElement`;
//                  rendering React components is out of scope for this suite.
//   CanvasInner, CanvasInner > dropPoint — marked UNREACHABLE in the spec.

// ---------------------------------------------------------------------------
// isValidConnection
// ---------------------------------------------------------------------------

// CONTRACT: "The only extra rule is that a node may not connect to itself." /
// "`boolean` — True when the edge may be created."
test('isValidConnection: a node may not connect to itself', () => {
  const r = __internals.isValidConnection({ source: 'n1', target: 'n1' })
  assert.equal(typeof r, 'boolean', 'must return a boolean, not a truthy value')
  assert.equal(r, false)
})

// CONTRACT: "Whether a proposed edge is allowed." / "React Flow already
// enforces source-to-target ... The only extra rule is that a node may not
// connect to itself."
test('isValidConnection: an edge between two different nodes is allowed', () => {
  for (const conn of [
    { source: 'n1', target: 'n2' },
    { source: 'driver-1', target: 'chamber-9' },
    { source: 'a', target: 'A' },
  ]) {
    const r = __internals.isValidConnection(conn)
    assert.equal(typeof r, 'boolean')
    assert.equal(r, true, `${conn.source} -> ${conn.target} should be allowed`)
  }
})

// CONTRACT: "@pure — ... Calling it twice with equal inputs must produce equal
// output and change nothing observable."
test('isValidConnection: @pure — twice-equal results and unmodified arguments', () => {
  const conn = { source: 'n1', target: 'n2' }
  const before = structuredClone(conn)
  const a = __internals.isValidConnection(conn)
  const b = __internals.isValidConnection(structuredClone(before))
  assert.equal(a, b)
  assert.deepStrictEqual(conn, before)
})
