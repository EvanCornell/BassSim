import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  uid,
  stack,
  split,
  defaultLayout,
  findNode,
  findPanelStack,
  openPanels,
  isOpen,
  setActive,
  removePanel,
  dockPanel,
  dockToEdge,
  moveTabInStack,
  openPanel,
  resizeChildren,
  sanitize,
  __internals,
} from '../../src/layout.js'

// ---------------------------------------------------------------------------
// Shared helpers
//
// CONTRACT (module): "The workspace is a tree of two node kinds:
//
//   { id, type: 'split', dir: 'row'|'col', size, children: [node, …] }
//   { id, type: 'stack', size, panels: ['canvas', …], active: 'canvas' }"
//
// CONTRACT (module): "Two invariants are maintained after each edit:
//   - a stack always holds at least one panel (empty stacks are pruned)
//   - a split always holds at least two children (a lone child replaces it)"
//
// CONTRACT (module): "Every operation here is pure: it returns a new tree,
// never mutates."
// ---------------------------------------------------------------------------

const isSplit = (n) => n != null && typeof n === 'object' && n.type === 'split'

function checkInvariants(node, path = 'root') {
  assert.ok(node != null && typeof node === 'object', `${path}: node must be an object`)
  assert.ok(
    node.type === 'split' || node.type === 'stack',
    `${path}: a node must be one of the two documented kinds, got ${JSON.stringify(node.type)}`,
  )
  if (node.type === 'split') {
    assert.ok(node.dir === 'row' || node.dir === 'col', `${path}: a split needs dir 'row' or 'col'`)
    assert.ok(Array.isArray(node.children), `${path}: a split must have a children array`)
    assert.ok(
      node.children.length >= 2,
      `${path}: a split must hold at least two children (had ${node.children.length})`,
    )
    node.children.forEach((c, i) => checkInvariants(c, `${path}.children[${i}]`))
  } else {
    assert.ok(Array.isArray(node.panels), `${path}: a stack must have a panels array`)
    assert.ok(
      node.panels.length >= 1,
      `${path}: a stack must hold at least one panel (had ${node.panels.length})`,
    )
  }
}

const clone = (v) => JSON.parse(JSON.stringify(v))

function assertUnchanged(before, after, what) {
  assert.deepEqual(after, before, `${what}: the input tree must not be modified`)
}

const panelsOf = (tree) => openPanels(tree, []).slice().sort()

// A four-panel workspace: row [ stack(a,b) , col [ stack(c) , stack(d) ] ]
function fixture() {
  const left = stack(['pA', 'pB'])
  const c = stack(['pC'])
  const d = stack(['pD'])
  const right = split('col', [c, d])
  const root = split('row', [left, right])
  return { root, left, right, c, d }
}

// ---------------------------------------------------------------------------
// uid
// ---------------------------------------------------------------------------

// CONTRACT: "`p` — `string` (optional, default `'n'`) — Prefix identifying the node kind: 's' for stacks, 'd' for splits."
// CONTRACT: "`string` — A new id, unique within this session."
test('uid: default prefix is n and the result is a string carrying the prefix', () => {
  const id = uid()
  assert.equal(typeof id, 'string')
  assert.ok(id.length > 0)
  assert.ok(id.startsWith('n'), `default-prefixed id should start with 'n', got ${id}`)
  assert.ok(uid('s').startsWith('s'))
  assert.ok(uid('d').startsWith('d'))
})

// CONTRACT: "Advances the module-level counter, so successive calls with the same argument differ."
test('uid: successive calls with the same argument differ', () => {
  const ids = new Set()
  for (let i = 0; i < 500; i++) ids.add(uid('s'))
  assert.equal(ids.size, 500)
})

// ---------------------------------------------------------------------------
// stack
// ---------------------------------------------------------------------------

// CONTRACT: "`panels` — `string[]` — Panel ids in tab order."
// CONTRACT: "`opts.size` — `number` (optional, default `1`)"
// CONTRACT: "`opts.active` — `string` (optional) — Initially visible panel. Defaults to the first, or `null` for an empty stack."
test('stack: documented defaults — size 1, active is the first panel, ids in tab order', () => {
  const s = stack(['pA', 'pB', 'pC'])
  assert.deepEqual(s.panels, ['pA', 'pB', 'pC'])
  assert.equal(s.size, 1)
  assert.equal(s.active, 'pA')
  assert.equal(typeof s.id, 'string')
  assert.ok(s.id.length > 0)
})

// CONTRACT (module): "{ id, type: 'stack', size, panels: ['canvas', …], active: 'canvas' }"
test('stack: builds exactly the documented stack node shape', () => {
  const s = stack(['pA', 'pB'])
  assert.equal(s.type, 'stack')
  assert.deepEqual(Object.keys(s).sort(), ['active', 'id', 'panels', 'size', 'type'])
  // CONTRACT: "`p` — Prefix identifying the node kind: 's' for stacks, 'd' for splits."
  assert.ok(s.id.startsWith('s'), `a stack id should carry the 's' prefix, got ${s.id}`)
})

// CONTRACT: "Defaults to the first, or `null` for an empty stack."
test('stack: an empty stack has a null active panel', () => {
  const s = stack([])
  assert.deepEqual(s.panels, [])
  assert.equal(s.active, null)
})

// CONTRACT: "`opts.id` — `string` (optional) — Explicit id; a fresh one is generated when omitted."
// CONTRACT: "Consumes an id from `uid` unless `opts.id` is supplied."
test('stack: overrides are honoured and a fresh id is generated when omitted', () => {
  const s = stack(['pA'], { id: 'fixed-id', size: 3, active: 'pA' })
  assert.equal(s.id, 'fixed-id')
  assert.equal(s.size, 3)
  assert.equal(s.active, 'pA')

  const a = stack(['pA'])
  const b = stack(['pA'])
  assert.notEqual(a.id, b.id)
})

// CONTRACT: "`opts.active` — Initially visible panel."
test('stack: an explicit active panel overrides the first-panel default', () => {
  const s = stack(['pA', 'pB'], { active: 'pB' })
  assert.equal(s.active, 'pB')
})

// ---------------------------------------------------------------------------
// split
// ---------------------------------------------------------------------------

// CONTRACT: "`dir` — `'row'|'col'` — Layout direction." / "`size` — `number` (optional, default `1`)"
// CONTRACT precondition: "children.length >= 2"
test('split: builds a node with the given direction, children and default size 1', () => {
  const a = stack(['pA'])
  const b = stack(['pB'])
  const s = split('row', [a, b])
  assert.equal(s.dir, 'row')
  assert.equal(s.size, 1)
  assert.equal(s.children.length, 2)
  assert.equal(typeof s.id, 'string')
  checkInvariants(s)

  const t = split('col', [stack(['pC']), stack(['pD'])], 4)
  assert.equal(t.dir, 'col')
  assert.equal(t.size, 4)
  checkInvariants(t)
})

// CONTRACT (module): "{ id, type: 'split', dir: 'row'|'col', size, children: [node, …] }"
test('split: builds exactly the documented split node shape', () => {
  const s = split('col', [stack(['pA']), stack(['pB'])])
  assert.equal(s.type, 'split')
  assert.deepEqual(Object.keys(s).sort(), ['children', 'dir', 'id', 'size', 'type'])
  // CONTRACT: "`p` — Prefix identifying the node kind: 's' for stacks, 'd' for splits."
  assert.ok(s.id.startsWith('d'), `a split id should carry the 'd' prefix, got ${s.id}`)
})

// CONTRACT: "Consumes an id from `uid`."
test('split: consumes an id from uid so two splits differ', () => {
  const a = split('row', [stack(['pA']), stack(['pB'])])
  const b = split('row', [stack(['pA']), stack(['pB'])])
  assert.notEqual(a.id, b.id)
})

// ---------------------------------------------------------------------------
// defaultLayout
// ---------------------------------------------------------------------------

// CONTRACT: "`object` — A freshly built layout tree, safe for the caller to keep."
// CONTRACT: "Consumes ids from `uid`, so two calls return trees with different node ids."
test('defaultLayout: returns a fresh, structurally valid tree with distinct ids each call', () => {
  const a = defaultLayout()
  const b = defaultLayout()
  assert.equal(typeof a, 'object')
  checkInvariants(a)
  checkInvariants(b)

  const ids = (n, acc = []) => {
    acc.push(n.id)
    if (isSplit(n)) n.children.forEach((c) => ids(c, acc))
    return acc
  }
  const idsA = ids(a)
  const idsB = ids(b)
  assert.equal(new Set(idsA).size, idsA.length, 'ids within one tree must be unique')
  idsB.forEach((id) => assert.ok(!idsA.includes(id), `id ${id} was reused between two trees`))
})

// CONTRACT: "The default workspace arrangement." (a workspace holds panels)
test('defaultLayout: holds panels, each open exactly once', () => {
  const t = defaultLayout()
  const p = openPanels(t, [])
  assert.ok(p.length > 0)
  assert.equal(new Set(p).size, p.length, 'a panel must not be open twice')
})

// ---------------------------------------------------------------------------
// findNode
// ---------------------------------------------------------------------------

// CONTRACT: "`object|null` — The node, or `null` when the tree has no such id."
// CONTRACT postcondition: "Returns the live node, not a copy"
test('findNode: finds stacks and splits by id and returns the live node', () => {
  const { root, left, right, c, d } = fixture()
  assert.ok(Object.is(findNode(root, root.id), root))
  assert.ok(Object.is(findNode(root, left.id), left))
  assert.ok(Object.is(findNode(root, right.id), right))
  assert.ok(Object.is(findNode(root, c.id), c))
  assert.ok(Object.is(findNode(root, d.id), d))
})

// CONTRACT: "`object|null` — ... `null` when the tree has no such id." / "`tree` — `object|null`"
test('findNode: returns null for an unknown id and for a null tree', () => {
  const { root } = fixture()
  assert.equal(findNode(root, 'no-such-id'), null)
  assert.equal(findNode(null, 'anything'), null)
})

// CONTRACT: "@pure — ... Calling it twice with equal inputs must produce equal output and change nothing observable."
test('findNode: is pure', () => {
  const { root, c } = fixture()
  const before = clone(root)
  const a = findNode(root, c.id)
  const b = findNode(root, c.id)
  assert.deepEqual(a, b)
  assertUnchanged(before, root, 'findNode')
})

// ---------------------------------------------------------------------------
// findPanelStack
// ---------------------------------------------------------------------------

// CONTRACT: "`object|null` — The containing stack, or `null` when the panel is closed or popped out."
// CONTRACT postcondition: "Returns the live node, not a copy"
test('findPanelStack: returns the live containing stack', () => {
  const { root, left, c } = fixture()
  assert.ok(Object.is(findPanelStack(root, 'pA'), left))
  assert.ok(Object.is(findPanelStack(root, 'pB'), left))
  assert.ok(Object.is(findPanelStack(root, 'pC'), c))
})

// CONTRACT: "`null` when the panel is closed or popped out."
test('findPanelStack: returns null for a panel that is not in the tree', () => {
  const { root } = fixture()
  assert.equal(findPanelStack(root, 'not-open'), null)
  assert.equal(findPanelStack(null, 'pA'), null)
})

// CONTRACT: "@pure"
test('findPanelStack: is pure', () => {
  const { root } = fixture()
  const before = clone(root)
  assert.deepEqual(findPanelStack(root, 'pC'), findPanelStack(root, 'pC'))
  assertUnchanged(before, root, 'findPanelStack')
})

// ---------------------------------------------------------------------------
// openPanels
// ---------------------------------------------------------------------------

// CONTRACT: "`string[]` — The same array, carrying every open panel id in traversal order."
test('openPanels: collects every panel id in traversal order', () => {
  const { root } = fixture()
  assert.deepEqual(openPanels(root, []), ['pA', 'pB', 'pC', 'pD'])
})

// CONTRACT: "`out` — `string[]` (optional, default `[]`) — Accumulator, appended to in place."
// CONTRACT mutates: "The `out` array passed in, which is the recursion's accumulator."
test('openPanels: appends to the accumulator in place and returns that same array', () => {
  const { root } = fixture()
  const acc = ['pre-existing']
  const out = openPanels(root, acc)
  assert.ok(Object.is(out, acc), 'must return the same array it was given')
  assert.deepEqual(acc, ['pre-existing', 'pA', 'pB', 'pC', 'pD'])
})

// CONTRACT: "`tree` — `object|null` — Layout tree to walk." / returns "string[]"
test('openPanels: a null tree yields an empty list, and the accumulator defaults to a new array', () => {
  assert.deepEqual(openPanels(null), [])
  const { root } = fixture()
  const first = openPanels(root)
  const second = openPanels(root)
  assert.deepEqual(first, second)
  assert.ok(!Object.is(first, second), 'the default accumulator must be a fresh array each call')
})

// ---------------------------------------------------------------------------
// isOpen
// ---------------------------------------------------------------------------

// CONTRACT: "`boolean` — True when the panel is open."
test('isOpen: true for a docked panel, false otherwise', () => {
  const { root } = fixture()
  assert.equal(isOpen(root, 'pA'), true)
  assert.equal(isOpen(root, 'pD'), true)
  assert.equal(isOpen(root, 'pZ'), false)
  assert.equal(isOpen(null, 'pA'), false)
})

// CONTRACT: "@pure"
test('isOpen: is pure', () => {
  const { root } = fixture()
  const before = clone(root)
  assert.equal(isOpen(root, 'pA'), isOpen(root, 'pA'))
  assertUnchanged(before, root, 'isOpen')
})

// ---------------------------------------------------------------------------
// setActive
// ---------------------------------------------------------------------------

// CONTRACT: "`object` — A new tree with that stack's `active` updated."
// CONTRACT: "@pure"
test('setActive: brings a panel to the front of its stack without touching the input', () => {
  const { root, left } = fixture()
  const before = clone(root)
  const out = setActive(root, left.id, 'pB')
  assert.equal(findNode(out, left.id).active, 'pB')
  assert.deepEqual(findNode(out, left.id).panels, ['pA', 'pB'])
  assertUnchanged(before, root, 'setActive')
  checkInvariants(out)
})

// CONTRACT: "@pure — Calling it twice with equal inputs must produce equal output"
test('setActive: is pure', () => {
  const { root, left } = fixture()
  const a = setActive(root, left.id, 'pB')
  const b = setActive(root, left.id, 'pB')
  assert.deepEqual(a, b)
})

// CONTRACT: "A new tree" — other stacks are unaffected
test('setActive: leaves other stacks alone', () => {
  const { root, left, c } = fixture()
  const out = setActive(root, left.id, 'pB')
  assert.equal(findNode(out, c.id).active, 'pC')
})

// ---------------------------------------------------------------------------
// removePanel
// ---------------------------------------------------------------------------

// CONTRACT: "Close a panel, pruning any stack or split left empty by its removal."
test('removePanel: closes a tab and leaves its siblings in place', () => {
  const { root, left } = fixture()
  const before = clone(root)
  const out = removePanel(root, 'pB')
  assert.equal(isOpen(out, 'pB'), false)
  assert.deepEqual(findNode(out, left.id).panels, ['pA'])
  assert.deepEqual(panelsOf(out), ['pA', 'pC', 'pD'])
  assertUnchanged(before, root, 'removePanel')
  checkInvariants(out)
})

// CONTRACT: "pruning any stack or split left empty by its removal" + the two structural invariants
test('removePanel: prunes the emptied stack and collapses the one-child split', () => {
  const { root } = fixture()
  const before = clone(root)
  const out = removePanel(root, 'pC')
  assert.equal(isOpen(out, 'pC'), false)
  assert.deepEqual(panelsOf(out), ['pA', 'pB', 'pD'])
  checkInvariants(out)
  assertUnchanged(before, root, 'removePanel')
})

// CONTRACT: "`object|null` — A new tree, or `null` if that panel was the last one open."
test('removePanel: returns null when the last open panel is closed', () => {
  const only = stack(['solo'])
  assert.equal(removePanel(only, 'solo'), null)
})

// CONTRACT: "@pure"
test('removePanel: is pure', () => {
  const { root } = fixture()
  const before = clone(root)
  const a = removePanel(root, 'pC')
  const b = removePanel(root, 'pC')
  assert.deepEqual(a, b)
  assertUnchanged(before, root, 'removePanel')
})

// CONTRACT: "A new tree" — removing a panel that is not open changes nothing observable
test('removePanel: removing a panel that is not open leaves the panel set alone', () => {
  const { root } = fixture()
  const out = removePanel(root, 'not-here')
  assert.deepEqual(panelsOf(out), ['pA', 'pB', 'pC', 'pD'])
  checkInvariants(out)
})

// ---------------------------------------------------------------------------
// dockPanel
// ---------------------------------------------------------------------------

// CONTRACT: "`zone` — ... `center` adds a tab"
test('dockPanel: a center drop tabs the panel into the target stack', () => {
  const { root, c } = fixture()
  const before = clone(root)
  const out = dockPanel(root, 'pA', c.id, 'center')
  assert.deepEqual(panelsOf(out), ['pA', 'pB', 'pC', 'pD'])
  const host = findPanelStack(out, 'pA')
  assert.ok(host.panels.includes('pC'), 'pA must now share the target stack with pC')
  checkInvariants(out)
  assertUnchanged(before, root, 'dockPanel')
})

// CONTRACT: "Dropping a panel back onto its own stack only changes focus."
test('dockPanel: dropping a panel onto its own stack only changes focus', () => {
  const s = stack(['pA', 'pB'], { active: 'pA' })
  const before = clone(s)
  const out = dockPanel(s, 'pB', s.id, 'center')
  assert.deepEqual(out.panels, ['pA', 'pB'], 'tab order must not change')
  assert.equal(out.active, 'pB')
  assertUnchanged(before, s, 'dockPanel')
  checkInvariants(out)
})

// CONTRACT: "`zone` — ... the others split the target."
test('dockPanel: an edge drop splits the target and keeps every panel open', () => {
  for (const zone of ['left', 'right', 'top', 'bottom']) {
    const { root, c } = fixture()
    const before = clone(root)
    const out = dockPanel(root, 'pA', c.id, zone)
    assert.deepEqual(panelsOf(out), ['pA', 'pB', 'pC', 'pD'], `zone ${zone}`)
    checkInvariants(out, `root(${zone})`)
    assertUnchanged(before, root, `dockPanel(${zone})`)
  }
})

// CONTRACT: "Removal happens before insertion ... pruning the panel's old stack can delete the
// very target it was being dropped on. When that happens the panel docks against the right edge
// instead, so the drag still does something rather than silently failing."
test('dockPanel: a panel whose old stack is pruned still lands somewhere in the tree', () => {
  // pC is alone in its stack, so removing it prunes that stack — including when the
  // pruned stack is itself the drop target.
  for (const zone of ['center', 'left', 'right', 'top', 'bottom']) {
    const { root, c } = fixture()
    const out = dockPanel(root, 'pC', c.id, zone)
    assert.deepEqual(panelsOf(out), ['pA', 'pB', 'pC', 'pD'], `zone ${zone}`)
    assert.equal(isOpen(out, 'pC'), true, `zone ${zone}: the dragged panel must still be open`)
    checkInvariants(out, `root(${zone})`)
  }
})

// CONTRACT: "`object` — A new tree, or the original when the move would empty the workspace."
// AMBIGUITY: "the original" is read strictly, as the very same object.
test('dockPanel: returns the original tree when the move would empty the workspace', () => {
  const only = stack(['solo'])
  const out = dockPanel(only, 'solo', 'no-such-stack', 'center')
  assert.ok(Object.is(out, only), 'must return the original tree object')
})

// ---------------------------------------------------------------------------
// dockToEdge
// ---------------------------------------------------------------------------

// CONTRACT: "Dock a panel against an outer edge of the whole workspace."
test('dockToEdge: the root runs in the edge direction and the panel sits on that edge', () => {
  const cases = [
    ['left', 'row', 'first'],
    ['right', 'row', 'last'],
    ['top', 'col', 'first'],
    ['bottom', 'col', 'last'],
  ]
  for (const [edge, dir, where] of cases) {
    const { root } = fixture()
    const before = clone(root)
    const out = dockToEdge(root, 'pA', edge)
    assert.deepEqual(panelsOf(out), ['pA', 'pB', 'pC', 'pD'], `edge ${edge}`)
    checkInvariants(out, `root(${edge})`)
    assert.ok(isSplit(out), `edge ${edge}: the root must be a split`)
    assert.equal(out.dir, dir, `edge ${edge}: root direction`)
    const idx = where === 'first' ? 0 : out.children.length - 1
    assert.ok(
      openPanels(out.children[idx], []).includes('pA'),
      `edge ${edge}: the docked panel must be the ${where} child`,
    )
    assertUnchanged(before, root, `dockToEdge(${edge})`)
  }
})

// CONTRACT: "otherwise a new root split is created giving the newcomer 22% of the width or height."
test('dockToEdge: a newly created root split gives the newcomer 22% of the space', () => {
  // Root is a col; docking left forces a new row root.
  const inner = split('col', [stack(['pA', 'pX']), stack(['pB'])])
  const out = dockToEdge(inner, 'pX', 'left')
  assert.ok(isSplit(out) && out.dir === 'row')
  const total = out.children.reduce((a, ch) => a + ch.size, 0)
  const newcomer = out.children.find((ch) => openPanels(ch, []).includes('pX'))
  assert.ok(
    Math.abs(newcomer.size / total - 0.22) < 1e-9,
    `newcomer share should be 22%, got ${newcomer.size / total}`,
  )
})

// CONTRACT: "When the root split already runs in the right direction the panel joins it as
// a sibling at a quarter of the average weight"
test('dockToEdge: joining an existing root split uses a quarter of the average weight', () => {
  const a = stack(['pA', 'pX'], { size: 1 })
  const b = stack(['pB'], { size: 1 })
  const root = split('row', [a, b])
  const out = dockToEdge(root, 'pX', 'right')
  assert.ok(isSplit(out) && out.dir === 'row')
  // Remaining children weigh 1 and 1, so the average is 1 and a quarter of it is 0.25.
  const newcomer = findPanelStack(out, 'pX')
  assert.equal(newcomer.size, 0.25)
  assert.equal(out.children.length, 3, 'the panel must join the root split as a sibling')
})

// CONTRACT: "`object` — A new tree. Falls back to a lone stack if the panel was the only one open."
test('dockToEdge: falls back to a lone stack when the panel was the only one open', () => {
  const only = stack(['solo'])
  const out = dockToEdge(only, 'solo', 'left')
  assert.ok(!isSplit(out), 'result must be a lone stack, not a split')
  assert.deepEqual(out.panels, ['solo'])
  checkInvariants(out)
})

// ---------------------------------------------------------------------------
// moveTabInStack
// ---------------------------------------------------------------------------

// CONTRACT: "`to` — `number` — Destination index, in the list after the tab is lifted out."
test('moveTabInStack: reorders the tab at the destination index of the lifted list', () => {
  const s = stack(['a', 'b', 'c'])
  const before = clone(s)
  assert.deepEqual(moveTabInStack(s, s.id, 0, 2).panels, ['b', 'c', 'a'])
  assert.deepEqual(moveTabInStack(s, s.id, 2, 0).panels, ['c', 'a', 'b'])
  assert.deepEqual(moveTabInStack(s, s.id, 1, 1).panels, ['a', 'b', 'c'])
  assertUnchanged(before, s, 'moveTabInStack')
})

// CONTRACT preconditions: "Both indices are within the stack's panel list." — boundaries
test('moveTabInStack: works at both boundaries of the panel list', () => {
  const s = stack(['a', 'b', 'c', 'd'])
  assert.deepEqual(moveTabInStack(s, s.id, 0, 0).panels, ['a', 'b', 'c', 'd'])
  assert.deepEqual(moveTabInStack(s, s.id, 3, 0).panels, ['d', 'a', 'b', 'c'])
  assert.deepEqual(moveTabInStack(s, s.id, 0, 3).panels, ['b', 'c', 'd', 'a'])
})

// CONTRACT postcondition: "The stack's `active` panel is unchanged — reordering does not switch tabs."
test('moveTabInStack: the active panel is unchanged', () => {
  const s = stack(['a', 'b', 'c'], { active: 'b' })
  assert.equal(moveTabInStack(s, s.id, 0, 2).active, 'b')
  assert.equal(moveTabInStack(s, s.id, 1, 2).active, 'b')
})

// CONTRACT: "@pure" and nested stacks are reachable by id
test('moveTabInStack: is pure and reaches nested stacks', () => {
  const left = stack(['pA', 'pB'])
  const root = split('row', [left, stack(['pC'])])
  const before = clone(root)
  const a = moveTabInStack(root, left.id, 0, 1)
  const b = moveTabInStack(root, left.id, 0, 1)
  assert.deepEqual(a, b)
  assert.deepEqual(findNode(a, left.id).panels, ['pB', 'pA'])
  assertUnchanged(before, root, 'moveTabInStack')
  checkInvariants(a)
})

// ---------------------------------------------------------------------------
// openPanel
// ---------------------------------------------------------------------------

// CONTRACT: "Show a panel, focusing it if it is already open and docking it if not."
test('openPanel: focuses an already open panel without moving it', () => {
  const { root, left } = fixture()
  const before = clone(root)
  const out = openPanel(root, 'pB')
  assert.deepEqual(panelsOf(out), ['pA', 'pB', 'pC', 'pD'])
  assert.equal(findNode(out, left.id).active, 'pB')
  assert.deepEqual(findNode(out, left.id).panels, ['pA', 'pB'])
  assertUnchanged(before, root, 'openPanel')
  checkInvariants(out)
})

// CONTRACT: "`hint.nextTo` — Preferred neighbour panel id." + "`hint.zone` (optional, default `'center'`)"
test('openPanel: nextTo places the panel beside its neighbour, centred by default', () => {
  const { root, c } = fixture()
  const before = clone(root)
  const out = openPanel(root, 'pNew', { nextTo: 'pC' })
  assert.deepEqual(panelsOf(out), ['pA', 'pB', 'pC', 'pD', 'pNew'])
  assert.equal(findPanelStack(out, 'pNew').id, c.id, 'default zone center tabs it into the neighbour stack')
  assert.equal(findPanelStack(out, 'pNew').active, 'pNew')
  assertUnchanged(before, root, 'openPanel')
  checkInvariants(out)
})

// CONTRACT: "`hint.nextToAny` — Acceptable neighbours, tried in order."
test('openPanel: nextToAny joins the first neighbour that is open', () => {
  const { root, c } = fixture()
  const out = openPanel(root, 'pNew', { nextToAny: ['pNotOpen', 'pC', 'pA'] })
  assert.equal(findPanelStack(out, 'pNew').id, c.id)
  checkInvariants(out)
})

// CONTRACT: "With no candidate available it falls back to an outer edge."
// CONTRACT: "`hint.edge` (optional, default `'bottom'`) — Fallback edge when no neighbour is open."
test('openPanel: falls back to the bottom edge by default when no neighbour is open', () => {
  const { root } = fixture()
  const out = openPanel(root, 'pNew', { nextTo: 'pNotOpen' })
  assert.deepEqual(panelsOf(out), ['pA', 'pB', 'pC', 'pD', 'pNew'])
  assert.ok(isSplit(out))
  assert.equal(out.dir, 'col', 'the bottom edge requires a column root')
  assert.ok(openPanels(out.children[out.children.length - 1], []).includes('pNew'))
  checkInvariants(out)
})

// CONTRACT: "`hint.edge` — `'left'|'right'|'top'|'bottom'` — Fallback edge when no neighbour is open."
test('openPanel: honours an explicit fallback edge', () => {
  const { root } = fixture()
  const out = openPanel(root, 'pNew', { nextTo: 'pNotOpen', edge: 'left' })
  assert.ok(isSplit(out))
  assert.equal(out.dir, 'row')
  assert.ok(openPanels(out.children[0], []).includes('pNew'))
  checkInvariants(out)
})

// CONTRACT: "`hint` — `object` (optional)"
test('openPanel: works with no hint at all', () => {
  const { root } = fixture()
  const before = clone(root)
  const out = openPanel(root, 'pNew')
  assert.deepEqual(panelsOf(out), ['pA', 'pB', 'pC', 'pD', 'pNew'])
  checkInvariants(out)
  assertUnchanged(before, root, 'openPanel')
})

// CONTRACT: "`hint.zone` — `'center'|'left'|'right'|'top'|'bottom'` — How to dock beside the neighbour."
test('openPanel: an edge zone splits beside the neighbour instead of tabbing in', () => {
  const { root, c } = fixture()
  const out = openPanel(root, 'pNew', { nextTo: 'pC', zone: 'bottom' })
  assert.deepEqual(panelsOf(out), ['pA', 'pB', 'pC', 'pD', 'pNew'])
  assert.notEqual(findPanelStack(out, 'pNew').id, findPanelStack(out, 'pC').id)
  checkInvariants(out)
})

// ---------------------------------------------------------------------------
// resizeChildren
// ---------------------------------------------------------------------------

// CONTRACT: "Apply a splitter drag, reweighting two adjacent children."
// CONTRACT (module): "`size` is a flex weight shared among siblings ... which is what lets a
// splitter drag redistribute weight between two neighbours without touching the rest of the tree."
test('resizeChildren: reweights the pair and leaves the other siblings alone', () => {
  const a = stack(['pA'], { size: 1 })
  const b = stack(['pB'], { size: 1 })
  const c = stack(['pC'], { size: 1 })
  const root = split('row', [a, b, c])
  const before = clone(root)
  const out = resizeChildren(root, root.id, 0, 1.5, 0.5)
  assert.equal(out.children[0].size, 1.5)
  assert.equal(out.children[1].size, 0.5)
  assert.equal(out.children[2].size, 1, 'siblings outside the pair must not move')
  assertUnchanged(before, root, 'resizeChildren')
  checkInvariants(out)
})

// CONTRACT: "`splitId` — Split whose children are being resized." — nested splits too
test('resizeChildren: resizes a nested split', () => {
  const { root, right } = fixture()
  const out = resizeChildren(root, right.id, 0, 2, 0.25)
  assert.equal(findNode(out, right.id).children[0].size, 2)
  assert.equal(findNode(out, right.id).children[1].size, 0.25)
  checkInvariants(out)
})

// CONTRACT: "`object` — A new tree. Unchanged when the root is not a split."
test('resizeChildren: a non-split root comes back unchanged', () => {
  const only = stack(['solo'])
  const before = clone(only)
  const out = resizeChildren(only, 'anything', 0, 5, 6)
  assert.deepEqual(out, before)
})

// CONTRACT: "@pure"
test('resizeChildren: is pure', () => {
  const { root, right } = fixture()
  const before = clone(root)
  const a = resizeChildren(root, right.id, 0, 3, 1)
  const b = resizeChildren(root, right.id, 0, 3, 1)
  assert.deepEqual(a, b)
  assertUnchanged(before, root, 'resizeChildren')
})

// CONTRACT preconditions: "index + 1 is a valid child index" — boundary: the last valid pair
test('resizeChildren: works at the last valid pair index', () => {
  const root = split('row', [stack(['pA']), stack(['pB']), stack(['pC'])])
  const out = resizeChildren(root, root.id, 1, 0.75, 1.25)
  assert.equal(out.children[1].size, 0.75)
  assert.equal(out.children[2].size, 1.25)
  checkInvariants(out)
})

// ---------------------------------------------------------------------------
// sanitize
// ---------------------------------------------------------------------------

const KNOWN = ['pA', 'pB', 'pC']

// Persisted-shaped fixtures, following the module section's node kinds:
//   { id, type: 'stack', size, panels, active }
//   { id, type: 'split', dir, size, children }
const rawStack = (o = {}) => ({ type: 'stack', id: 's1', size: 1, panels: ['pA'], active: 'pA', ...o })
const rawSplit = (o = {}) => ({ type: 'split', id: 'd1', size: 1, dir: 'row', children: [], ...o })

// Full postcondition check: "Every returned node has a valid id, a positive numeric size,
// and — for stacks — an `active` panel drawn from its own list."
function assertSane(node, known, path = 'root') {
  checkInvariants(node, path)
  assert.equal(typeof node.id, 'string', `${path}: id must be a string`)
  assert.ok(node.id.length > 0, `${path}: id must not be empty`)
  assert.equal(typeof node.size, 'number', `${path}: size must be numeric`)
  assert.ok(Number.isFinite(node.size), `${path}: size must be finite`)
  assert.ok(node.size > 0, `${path}: size must be positive (was ${node.size})`)
  if (isSplit(node)) {
    assert.ok(node.dir === 'row' || node.dir === 'col', `${path}: dir must be row or col`)
    node.children.forEach((c, i) => assertSane(c, known, `${path}.children[${i}]`))
  } else {
    node.panels.forEach((p) =>
      assert.ok(known.includes(p), `${path}: unknown panel ${p} survived sanitize`),
    )
    assert.ok(
      node.panels.includes(node.active),
      `${path}: active (${node.active}) must be drawn from the stack's own list`,
    )
  }
}

// CONTRACT: "`tree` — `any` — Untrusted layout tree" / "`object|null` — ... `null` when nothing renderable survived."
test('sanitize: non-objects sanitize to null', () => {
  for (const hostile of [null, undefined, 0, 42, '', 'a string', true, false, NaN]) {
    assert.equal(sanitize(hostile, KNOWN), null, `input ${String(hostile)}`)
  }
})

// CONTRACT: "an old or corrupt layout can never wedge the workspace — at worst it sanitizes to `null`"
test('sanitize: an array is not a layout node', () => {
  assert.equal(sanitize([], KNOWN), null)
  assert.equal(sanitize(['pA'], KNOWN), null)
})

// CONTRACT: "`knownPanels` — Panel ids this build knows how to render. Anything else is dropped."
test('sanitize: unknown panel ids are dropped', () => {
  const out = sanitize(rawStack({ panels: ['pA', 'ghost', 'pB'], active: 'pA' }), KNOWN)
  assert.notEqual(out, null, 'a renderable panel survived, so the result must not be null')
  assert.deepEqual(out.panels, ['pA', 'pB'])
  assertSane(out, KNOWN)
})

// CONTRACT: "`null` when nothing renderable survived."
test('sanitize: a tree naming only unknown panels sanitizes to null', () => {
  assert.equal(sanitize(rawStack({ panels: ['ghost', 'gone'], active: 'ghost' }), KNOWN), null)
  assert.equal(sanitize(rawStack(), []), null)
})

// CONTRACT postcondition: "a positive numeric size"
test('sanitize: negative, zero and non-numeric sizes are re-derived as positive numbers', () => {
  for (const size of [-5, 0, -0.0001, 'big', null, undefined, NaN, Infinity, {}, [], true]) {
    const out = sanitize(rawStack({ size }), KNOWN)
    assert.notEqual(out, null, `size ${String(size)}: a renderable panel survived`)
    assertSane(out, KNOWN, `size ${String(size)}`)
  }
})

// CONTRACT postcondition: "for stacks — an `active` panel drawn from its own list"
test('sanitize: an active panel outside its own list is replaced', () => {
  for (const active of ['not-in-list', 'ghost', null, undefined, 7, {}]) {
    const out = sanitize(rawStack({ panels: ['pA', 'pB'], active }), KNOWN)
    assert.notEqual(out, null)
    assertSane(out, KNOWN, `active ${String(active)}`)
  }
})

// CONTRACT: "an `active` panel drawn from its own list" — including when active names a dropped panel
test('sanitize: an active panel that was itself dropped is replaced by a surviving one', () => {
  const out = sanitize(rawStack({ panels: ['ghost', 'pB'], active: 'ghost' }), KNOWN)
  assert.notEqual(out, null)
  assert.deepEqual(out.panels, ['pB'])
  assert.equal(out.active, 'pB')
})

// CONTRACT postcondition: "Every returned node has a valid id"
// CONTRACT sideEffect: "Consumes ids from `uid` for any node that was missing one."
test('sanitize: a node with no id is given one', () => {
  for (const id of [undefined, null, '', 42, {}]) {
    const out = sanitize(rawStack({ id }), KNOWN)
    assert.notEqual(out, null)
    assert.equal(typeof out.id, 'string', `id ${String(id)}`)
    assert.ok(out.id.length > 0)
  }
})

// CONTRACT: "both structural invariants are re-established on the way back up"
test('sanitize: a split left with one usable child does not stay a split', () => {
  const out = sanitize(rawSplit({ children: [rawStack()] }), KNOWN)
  assert.notEqual(out, null)
  assertSane(out, KNOWN)
  assert.deepEqual(openPanels(out, []), ['pA'])
})

// CONTRACT: "both structural invariants are re-established on the way back up"
test('sanitize: an empty stack is dropped and a split whose children all die returns null', () => {
  assert.equal(sanitize(rawStack({ panels: [], active: null }), KNOWN), null)
  assert.equal(
    sanitize(
      rawSplit({
        dir: 'col',
        children: [
          rawStack({ id: 's1', panels: ['ghost'], active: 'ghost' }),
          rawStack({ id: 's2', panels: [], active: null }),
        ],
      }),
      KNOWN,
    ),
    null,
  )
})

// CONTRACT: "have been hand-edited into an invalid shape; every field is re-derived here rather than accepted"
test('sanitize: survives hostile children and hostile field types', () => {
  const hostile = rawSplit({
    size: 'huge',
    dir: 'sideways',
    children: [
      null,
      5,
      'nope',
      [],
      rawStack({ id: 's1', size: -2, panels: ['pA', 7, null, 'ghost'], active: 42 }),
      rawStack({ id: 's2', panels: 'pB', active: 'pB' }),
      rawSplit({ id: 'd2', dir: 'col', children: 'not-an-array' }),
      rawStack({ id: 's3', panels: ['pB', 'pC'], active: 'pC' }),
      { id: 's4', size: 1, panels: ['pA'], active: 'pA' }, // no `type` field at all
      { type: 'wat', id: 's5', size: 1, panels: ['pB'], active: 'pB' }, // unknown kind
    ],
  })
  const before = clone(hostile)
  const out = sanitize(hostile, KNOWN)
  assert.notEqual(out, null, 'renderable panels were present, so something must survive')
  assertSane(out, KNOWN)
  assert.deepEqual(hostile, before, 'sanitize rebuilds; it must not modify its input')
})

// CONTRACT: "Rebuild a persisted layout" — a valid tree round-trips
test('sanitize: a valid tree keeps its panels and structure', () => {
  const tree = rawSplit({
    children: [
      rawStack({ id: 's1', size: 2, panels: ['pA', 'pB'], active: 'pB' }),
      rawStack({ id: 's2', panels: ['pC'], active: 'pC' }),
    ],
  })
  const out = sanitize(clone(tree), KNOWN)
  assertSane(out, KNOWN)
  assert.equal(out.type, 'split')
  assert.equal(out.dir, 'row')
  assert.equal(out.children.length, 2)
  assert.deepEqual(openPanels(out, []), ['pA', 'pB', 'pC'])
  assert.equal(findPanelStack(out, 'pB').active, 'pB')
})

// CONTRACT: "The trust boundary for LocalStorage." — a real default layout must survive it
test('sanitize: a freshly built tree survives sanitizing against its own panels', () => {
  const t = defaultLayout()
  const known = openPanels(t, [])
  const out = sanitize(clone(t), known)
  assert.notEqual(out, null)
  assertSane(out, known)
  assert.deepEqual(openPanels(out, []).sort(), known.slice().sort())
})

// ---------------------------------------------------------------------------
// __internals.mapStacks
// ---------------------------------------------------------------------------

// CONTRACT: "Rebuild the tree with `fn` applied to every stack." / "A new tree. Untouched subtrees are still copied, so identity is not preserved."
test('mapStacks: applies fn to every stack and copies even untouched subtrees', () => {
  const { root, left, right, c, d } = fixture()
  const before = clone(root)
  const seen = []
  const out = __internals.mapStacks(root, (s) => {
    seen.push(s.id)
    return s
  })
  assert.deepEqual(seen.sort(), [left.id, c.id, d.id].sort())
  assert.deepEqual(out, before)
  assert.ok(!Object.is(out, root), 'the root must be a copy')
  assert.ok(!Object.is(out.children[1], right), 'untouched subtrees are still copied')
})

// CONTRACT: "stacks are replaced by whatever `fn` returns"
test('mapStacks: stacks are replaced by whatever fn returns', () => {
  const { root, c } = fixture()
  const out = __internals.mapStacks(root, (s) => (s.id === c.id ? { ...s, active: 'changed' } : s))
  assert.equal(findNode(out, c.id).active, 'changed')
})

// CONTRACT: "@pure"
test('mapStacks: is pure', () => {
  const { root } = fixture()
  const before = clone(root)
  const a = __internals.mapStacks(root, (s) => s)
  const b = __internals.mapStacks(root, (s) => s)
  assert.deepEqual(a, b)
  assertUnchanged(before, root, 'mapStacks')
})

// ---------------------------------------------------------------------------
// __internals.removeRec
// ---------------------------------------------------------------------------

// CONTRACT: "When the removed panel was the active tab, focus moves to the tab that took its index"
test('removeRec: focus moves to the tab that took the removed index', () => {
  const s = stack(['a', 'b', 'c'], { active: 'b' })
  const out = __internals.removeRec(s, 'b')
  assert.deepEqual(out.panels, ['a', 'c'])
  assert.equal(out.active, 'c')
})

// CONTRACT: "— or the last one, if it was at the end."
test('removeRec: removing the last active tab focuses the new last tab', () => {
  const s = stack(['a', 'b', 'c'], { active: 'c' })
  const out = __internals.removeRec(s, 'c')
  assert.deepEqual(out.panels, ['a', 'b'])
  assert.equal(out.active, 'b')
})

// CONTRACT: "a stack emptied by the removal is dropped"
// CONTRACT: "`object|null` — ... `null` when it no longer holds anything."
test('removeRec: an emptied stack becomes null', () => {
  assert.equal(__internals.removeRec(stack(['only']), 'only'), null)
})

// CONTRACT: "a split left with one child collapses into that child, inheriting the split's weight
// so the rest of the layout does not shift."
test('removeRec: a collapsing split hands its weight to the surviving child', () => {
  const survivor = stack(['pC'], { size: 1 })
  const doomed = stack(['pD'], { size: 1 })
  const sp = split('col', [survivor, doomed], 3)
  const out = __internals.removeRec(sp, 'pD')
  assert.ok(!isSplit(out), 'the one-child split must collapse into its child')
  assert.deepEqual(out.panels, ['pC'])
  assert.equal(out.size, 3, "the survivor inherits the split's weight")
})

// CONTRACT: "@pure"
test('removeRec: is pure', () => {
  const { root } = fixture()
  const before = clone(root)
  const a = __internals.removeRec(root, 'pC')
  const b = __internals.removeRec(root, 'pC')
  assert.deepEqual(a, b)
  assertUnchanged(before, root, 'removeRec')
  checkInvariants(a)
})

// ---------------------------------------------------------------------------
// __internals.dirOf / isBefore
// ---------------------------------------------------------------------------

// CONTRACT: "`'row'|'col'` — `row` for horizontal zones, `col` otherwise."
test('dirOf: row for horizontal zones, col otherwise', () => {
  assert.equal(__internals.dirOf('left'), 'row')
  assert.equal(__internals.dirOf('right'), 'row')
  assert.equal(__internals.dirOf('top'), 'col')
  assert.equal(__internals.dirOf('bottom'), 'col')
  assert.equal(__internals.dirOf('center'), 'col')
})

// CONTRACT: "`boolean` — True when the new panel goes first in child order."
test('isBefore: true only for the zones that place the newcomer first', () => {
  assert.equal(__internals.isBefore('left'), true)
  assert.equal(__internals.isBefore('top'), true)
  assert.equal(__internals.isBefore('right'), false)
  assert.equal(__internals.isBefore('bottom'), false)
  assert.equal(__internals.isBefore('center'), false)
})

// CONTRACT: "@pure" (both)
test('dirOf: is pure', () => {
  assert.equal(__internals.dirOf('left'), __internals.dirOf('left'))
  assert.equal(__internals.isBefore('top'), __internals.isBefore('top'))
})

// ---------------------------------------------------------------------------
// __internals.insertRec
// ---------------------------------------------------------------------------

// CONTRACT: "A `center` drop appends a tab and focuses it."
test('insertRec: a center drop appends a tab and focuses it', () => {
  const s = stack(['pA', 'pB'], { active: 'pA' })
  const before = clone(s)
  const out = __internals.insertRec(s, s.id, 'center', 'pNew')
  assert.deepEqual(out.panels, ['pA', 'pB', 'pNew'])
  assert.equal(out.active, 'pNew')
  assertUnchanged(before, s, 'insertRec')
  checkInvariants(out)
})

// CONTRACT: "An edge drop halves the target's weight and puts the newcomer beside it."
test('insertRec: an edge drop halves the target weight and places the newcomer beside it', () => {
  const target = stack(['pA'], { size: 1 })
  const out = __internals.insertRec(target, target.id, 'right', 'pNew')
  assert.ok(isSplit(out), 'an edge drop on a lone stack must produce a split')
  assert.equal(out.dir, 'row')
  const kept = out.children.find((ch) => openPanels(ch, []).includes('pA'))
  assert.equal(kept.size, 0.5, "the target's weight must be halved")
  assert.ok(openPanels(out.children[out.children.length - 1], []).includes('pNew'), 'right places the newcomer last')
  checkInvariants(out)
})

// CONTRACT: "the newcomer beside it" + isBefore: left/top place the newcomer first
test('insertRec: a left drop places the newcomer first', () => {
  const target = stack(['pA'], { size: 2 })
  const out = __internals.insertRec(target, target.id, 'left', 'pNew')
  assert.ok(isSplit(out) && out.dir === 'row')
  assert.ok(openPanels(out.children[0], []).includes('pNew'))
  assert.equal(out.children.find((ch) => openPanels(ch, []).includes('pA')).size, 1)
})

// CONTRACT: "when the target is a direct child of a split that already runs in the requested
// direction, the panel becomes a sibling rather than nesting a new split inside the old one."
test('insertRec: flattens into the parent split when the direction already matches', () => {
  const a = stack(['pA'])
  const b = stack(['pB'])
  const root = split('row', [a, b])
  const out = __internals.insertRec(root, b.id, 'right', 'pNew')
  assert.equal(out.children.length, 3, 'the newcomer must be a sibling, not a nested split')
  out.children.forEach((ch, i) => assert.ok(!isSplit(ch), `child ${i} must still be a stack`))
  assert.ok(out.children[2].panels.includes('pNew'), 'right places the newcomer after the target')
  checkInvariants(out)
})

// CONTRACT: "`object` — A new subtree. Unchanged when `targetId` is not inside it."
test('insertRec: unchanged when the target is not inside the subtree', () => {
  const { root } = fixture()
  const before = clone(root)
  const out = __internals.insertRec(root, 'no-such-stack', 'center', 'pNew')
  assert.deepEqual(out, before)
})
