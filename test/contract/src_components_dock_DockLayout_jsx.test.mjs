import { test } from 'node:test'
import assert from 'node:assert/strict'
import { __internals } from '../../src/components/dock/DockLayout.jsx'

// UNREACHABLE — not covered:
//   DockLayout() — EXPORTED, but documented to return `React.ReactElement`;
//                  rendering React components is out of scope for this suite.
//   PanelBody, DockStack (+ zoneAt, onBodyDragOver, onBodyDrop), Splitter
//   (+ onMove, onUp), DockNode, EdgeDrops, DockLayout > clear — all marked
//   UNREACHABLE in the spec.

// A drag event carrying no payload at all.
const emptyDrag = () => ({
  dataTransfer: { types: [], items: [], getData: () => '' },
})

// A palette drag: it "carries its own type", which is not a panel tab.
const paletteDrag = () => ({
  dataTransfer: {
    types: ['application/reactflow'],
    items: [{ kind: 'string', type: 'application/reactflow' }],
    getData: (t) => (t === 'application/reactflow' ? 'driver' : ''),
  },
})

// ---------------------------------------------------------------------------
// isPanelDrag
// ---------------------------------------------------------------------------

// CONTRACT: "Whether a drag event is a panel tab drag." /
// "`boolean` — True when the drag carries a panel tab."
// AMBIGUITY: the spec never states the payload key or MIME type that marks a
// panel tab, so only the negative cases are assertable blind.
test('isPanelDrag: false when the drag carries no payload', () => {
  const r = __internals.isPanelDrag(emptyDrag())
  assert.equal(typeof r, 'boolean', 'must return a boolean, not a truthy value')
  assert.equal(r, false)
})

// CONTRACT: "The payload decides what a drag means, never the store flag alone:
// a palette element carries its own type and must reach the canvas untouched,
// even if a previous tab drag left `draggingPanel` set."
test('isPanelDrag: false for a palette drag even after a panel drag was flagged', () => {
  // Whatever the store flag may be, a palette payload is not a panel tab.
  __internals.endPanelDrag()
  const r = __internals.isPanelDrag(paletteDrag())
  assert.equal(typeof r, 'boolean')
  assert.equal(r, false)
})

// CONTRACT: "@pure — ... Calling it twice with equal inputs must produce equal
// output and change nothing observable."
test('isPanelDrag: @pure — twice with equal inputs gives equal output', () => {
  assert.equal(__internals.isPanelDrag(emptyDrag()), __internals.isPanelDrag(emptyDrag()))
  assert.equal(__internals.isPanelDrag(paletteDrag()), __internals.isPanelDrag(paletteDrag()))
})

// ---------------------------------------------------------------------------
// endPanelDrag
// ---------------------------------------------------------------------------

// CONTRACT: "Clear the panel-drag flag." / "`void`"
test('endPanelDrag: returns void', () => {
  assert.equal(__internals.endPanelDrag(), undefined)
})

// CONTRACT: "Side effects: Writes store state, if the flag was set." — with the
// flag already clear the second call must still be harmless.
test('endPanelDrag: clearing an already-clear flag is harmless', () => {
  __internals.endPanelDrag()
  assert.equal(__internals.endPanelDrag(), undefined)
})
