// Blind contract tests for `src/store.js`.
//
// Written from docs/contracts/ alone. No implementation file was read and no
// test was ever executed, so every assertion encodes what the contract CLAIMS
// rather than what the code happens to do.
//
// The spec's "## Module" section names the state fields directly, so these
// tests read state back by name:
//   project    nodes, edges, projectName, selectedNodeId, settings
//   results    results, metrics, snapshots, simError
//   history    history, future, clipboard
//   workspace  layout, layoutPresets, maximized, focusedPanel, draggingPanel,
//              poppedOut, toolbar, bindings, xZoom
//   modals     showDriverDB, showTSCalc, showSettings, settingsSection,
//              workspacePrompt, velocityPopupNodeId
//
// Underscore-prefixed fields (`_lastSig`, `_abort`, `_computeTimer`,
// `_flowApi`, `_lastSavedName`, `_nameTimer`) are documented as solver and
// persistence bookkeeping that is "not part of any action's observable
// contract", so `snap()` below excludes them. Every "does nothing" clause is
// still asserted as *zero* observable keys written, which is stronger than
// naming one field.
//
// The nine dock-editing methods — activate, dock, dockEdge, resize, dropOnTab,
// close, open, toggle, reset — live in the store's `layoutOps` namespace and
// are reached as `useStore.getState().layoutOps.<name>(…)`, per their
// "Obtain via" lines.

import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'

import { useStore, nextId, __internals } from '../../src/store.js'
import {
  stack, split, defaultLayout, findNode, findPanelStack, openPanels, isOpen,
} from '../../src/layout.js'
import { loadBindings, findConflict } from '../../src/keymap.js'
import { PANEL_IDS } from '../../src/panelMeta.js'
import { SCHEMA_VERSION, DEFAULT_PARAMS, DEFAULT_SETTINGS } from '../../src/engine/project.js'
import { SHARED_KEYS } from '../../src/popout.js'

const st = () => useStore.getState()

// ---------------------------------------------------------------- helpers ---

// Node types are the keys of DEFAULT_PARAMS: driver, chamber, waveguide, pr,
// radiation. `addNode` documents that "its entry in `DEFAULT_PARAMS` supplies
// the initial params".
const T_DRIVER = 'driver'
const T_CHAMBER = 'chamber'

// `closable: false` pins the canvas open — "the canvas is the workspace
// itself" (src/panelMeta.js).
const CANVAS = 'canvas'

// LocalStorage keys, all prefixed `acousim:` per the spec's Module section.
const LS_LAYOUT = 'acousim:layout'
const LS_PRESETS = 'acousim:layoutPresets'
const LS_TOOLBAR = 'acousim:toolbar'
const LS_KEYMAP = 'acousim:keymap'

const ls = () => globalThis.localStorage

function blank(over = {}) {
  return {
    schemaVersion: SCHEMA_VERSION,
    app: 'acousim',
    name: 'contract-test',
    modified: new Date().toISOString(),
    settings: { ...DEFAULT_SETTINGS },
    nodes: [],
    edges: [],
    ...over,
  }
}

/**
 * Snapshot of every observable state value. Underscore-prefixed bookkeeping
 * fields are excluded: the spec states they "are not part of any action's
 * observable contract".
 */
function snap() {
  const out = {}
  for (const [k, v] of Object.entries(st())) {
    if (typeof v === 'function') continue
    if (k.startsWith('_')) continue
    out[k] = v
  }
  return out
}

/** Keys whose value identity changed between two snapshots. */
function changedKeys(before, after) {
  const keys = new Set([...Object.keys(before), ...Object.keys(after)])
  return [...keys].filter((k) => !Object.is(before[k], after[k]))
}

/** Run `fn`, return the list of observable state keys it changed. */
function keysWrittenBy(fn) {
  const before = snap()
  fn()
  return changedKeys(before, snap())
}

const tree = () => st().layout
const nodesOf = () => st().nodes
const edgesOf = () => st().edges
const nodeById = (id) => nodesOf().find((n) => n.id === id)
const paramsOf = (id) => nodeById(id).data.params
const selectedNodes = () => nodesOf().filter((n) => n.selected)

/** Distinct stacks in a layout tree, via the documented layout helpers. */
function stacksOf(t) {
  const seen = new Map()
  for (const p of openPanels(t)) {
    const s = findPanelStack(t, p)
    if (s && !seen.has(s.id)) seen.set(s.id, s)
  }
  return [...seen.values()]
}

function stackWithAtLeast(t, n) {
  return stacksOf(t).find((s) => s.panels.length >= n)
}

/** A panel in the default layout that is not the pinned-open canvas. */
function closablePanel() {
  const p = openPanels(defaultLayout()).find((x) => x !== CANVAS)
  assert.ok(p, 'the default layout must contain a panel besides the canvas')
  return p
}

beforeEach(() => {
  st().loadSerialized(blank())
})

// CONTRACT (copySelection): "An empty selection leaves the previous clipboard
// in place rather than clearing it, so a stray copy with nothing selected
// cannot lose what you copied a moment ago. There is no action that empties
// the clipboard." (pasteClipboard): "Does nothing when the clipboard is
// empty."
//
// AMBIGUITY (RESOLVED via reachability): no documented action ever empties
// the clipboard once it holds something, and `loadSerialized` — the reset
// this file's `beforeEach` uses between tests — is documented to clear
// "History, redo, snapshots and selection", but the clipboard is conspicuously
// absent from that list. So an empty clipboard is reachable only in the
// store's pristine, never-copied-to state, which is why this test is placed
// ahead of every other test in the file.
//
// Placement alone would make it order-dependent, so it asserts its own
// precondition rather than assuming it: `clipboard` is documented observable
// state (the store header groups it with history and future), so the test can
// see whether the state it needs still exists and fail loudly with the reason
// if it does not, instead of silently testing nothing. A caller with a
// `clearClipboard` action would not need any of this.
test('pasteClipboard: does nothing when the clipboard has never been populated', () => {
  assert.ok(
    !st().clipboard?.nodes?.length,
    'precondition unreachable: something populated the clipboard before this test ran, '
    + 'and no documented action empties it again — this test must stay first in the file',
  )
  const id = st().addNode(T_DRIVER, { x: 0, y: 0 })
  const before = nodesOf().length
  const keys = keysWrittenBy(() => st().pasteClipboard())
  assert.deepEqual(keys, [], 'pasting from a never-populated clipboard must write nothing')
  assert.equal(nodesOf().length, before, 'no node may have been pasted')
  assert.ok(nodeById(id), 'the pre-existing node must be untouched')
})

// ============================================================== EXPORTED ====

// CONTRACT: "Generate a unique node or edge id." / "`type` — Node type, used
// as the id's prefix." / "`string` — A new id, unique within this session."
test('nextId: returns a string prefixed with the type', () => {
  const id = nextId(T_DRIVER)
  assert.equal(typeof id, 'string')
  assert.ok(id.startsWith(T_DRIVER), `id ${id} must start with its type prefix`)
})

// CONTRACT: "so ids stay unique across a paste that creates several nodes in
// the same millisecond" / "Advances the module-level counter."
test('nextId: successive ids in the same millisecond are unique', () => {
  const ids = new Set()
  for (let i = 0; i < 50; i++) ids.add(nextId(T_DRIVER))
  assert.equal(ids.size, 50)
})

// ============================================================== INTERNAL ====

// CONTRACT: "`object` — A usable layout tree."
test('loadLayout: returns a usable non-empty layout tree', () => {
  const t = __internals.loadLayout()
  assert.equal(typeof t, 'object')
  assert.notEqual(t, null)
  assert.ok(openPanels(t).length > 0, 'a usable layout must contain panels')
})

// CONTRACT: "Three things can invalidate a stored layout: a version mismatch, a
// panel this build no longer has, or corrupt JSON. All three land on the
// default rather than throwing."
test('loadLayout: corrupt stored JSON falls back to the default layout', () => {
  ls().setItem(LS_LAYOUT, '{ not json at all')
  const t = __internals.loadLayout()
  assert.deepEqual(
    openPanels(t).slice().sort(),
    openPanels(defaultLayout()).slice().sort(),
    'corrupt JSON must land on the default layout',
  )
  st().layoutOps.reset()
})

// CONTRACT: "The canvas check is the last guard — a layout without the Node
// Editor would leave the workspace with nothing to edit, so it is rejected even
// if it is otherwise valid."
test('loadLayout: a valid layout without the canvas is rejected for the default', () => {
  // Persisted through the documented write path, so the stored format is
  // whatever the store itself writes — only its content is canvas-free.
  const others = PANEL_IDS.filter((p) => p !== CANVAS).slice(0, 2)
  st()._commitLayout(split('row', [stack([others[0]]), stack([others[1]])]))
  assert.ok(ls().getItem(LS_LAYOUT), 'precondition: it was persisted to acousim:layout')

  const t = __internals.loadLayout()
  assert.ok(
    openPanels(t).includes(CANVAS),
    'a layout without the canvas must be rejected in favour of the default',
  )
  st().layoutOps.reset()
})

// CONTRACT: "Array<{name: string, tree: object}> — Saved presets, or an empty
// list when absent or corrupt."
test('loadPresets: returns the saved presets as {name, tree} entries', () => {
  const name = '__loadPresets_probe__'
  st().saveLayoutPreset(name)
  const list = __internals.loadPresets()
  assert.ok(Array.isArray(list))
  const entry = list.find((p) => p.name === name)
  assert.ok(entry, 'a saved preset must be readable back')
  assert.equal(typeof entry.tree, 'object')
  assert.notEqual(entry.tree, null)
  st().deleteLayoutPreset(name)
})

// CONTRACT: "Saved presets, or an empty list when absent or corrupt."
test('loadPresets: corrupt storage yields an empty list', () => {
  ls().setItem(LS_PRESETS, 'not json')
  assert.deepEqual(__internals.loadPresets(), [])
  ls().removeItem(LS_PRESETS)
})

// CONTRACT: "`string[]` — Quick-bar item ids, falling back to the default
// arrangement."
test('loadToolbar: returns an array of item id strings', () => {
  const ids = __internals.loadToolbar()
  assert.ok(Array.isArray(ids))
  for (const id of ids) assert.equal(typeof id, 'string')
})

// CONTRACT: "falling back to the default arrangement."
test('loadToolbar: corrupt storage falls back to the default arrangement', () => {
  st().resetToolbar()
  const defaults = st().toolbar.slice()
  ls().setItem(LS_TOOLBAR, 'not json')
  assert.deepEqual(__internals.loadToolbar(), defaults)
  st().resetToolbar()
})

// CONTRACT: "`{x: number, y: number}` — A position to place the node at." plus
// "steps down-right until the spot is clear."
test('freeSpotNear: an unoccupied preferred spot is returned unchanged', () => {
  const spot = { x: 100, y: 200 }
  assert.deepEqual(__internals.freeSpotNear(spot, []), { x: 100, y: 200 })
})

// CONTRACT: "Adding several elements without moving the mouse would stack them
// all on one point, so this steps down-right until the spot is clear."
// AMBIGUOUS: the spec does not say whether "within one step" is measured with
// Euclidean or Chebyshev distance, nor whether the boundary counts as
// occupied, so the exact number of steps taken is not derivable. Only the
// documented direction and step quantum are asserted.
test('freeSpotNear: an occupied spot steps down-right by whole steps', () => {
  const step = 20
  const spot = { x: 0, y: 0 }
  const got = __internals.freeSpotNear(spot, [{ id: 'a', position: { x: 0, y: 0 } }], step)
  assert.ok(got.x > spot.x, 'must step right')
  assert.ok(got.y > spot.y, 'must step down')
  assert.equal((got.x - spot.x) % step, 0, 'offsets are whole steps')
  assert.equal((got.y - spot.y) % step, 0, 'offsets are whole steps')
})

// CONTRACT: "spot and nodes are not modified"
test('freeSpotNear: does not modify spot or nodes', () => {
  const spot = { x: 5, y: 7 }
  const nodes = [{ id: 'a', position: { x: 5, y: 7 } }]
  __internals.freeSpotNear(spot, nodes, 15)
  assert.deepEqual(spot, { x: 5, y: 7 })
  assert.deepEqual(nodes, [{ id: 'a', position: { x: 5, y: 7 } }])
})

// CONTRACT: "@pure — Calling it twice with equal inputs must produce equal
// output and change nothing observable."
test('freeSpotNear: is deterministic in its arguments', () => {
  const nodes = [
    { id: 'a', position: { x: 0, y: 0 } },
    { id: 'b', position: { x: 30, y: 30 } },
  ]
  const a = __internals.freeSpotNear({ x: 0, y: 0 }, nodes, 30)
  const b = __internals.freeSpotNear({ x: 0, y: 0 }, nodes, 30)
  assert.deepEqual(a, b)
})

// CONTRACT: "`string` — A JSON signature, compared by equality against the last
// solved one."
test('graphSignature: returns a JSON string', () => {
  const sig = __internals.graphSignature(
    [{ id: 'a', type: T_DRIVER, data: { params: { ...DEFAULT_PARAMS[T_DRIVER] } } }],
    [],
    { ...DEFAULT_SETTINGS },
  )
  assert.equal(typeof sig, 'string')
  JSON.parse(sig) // must be JSON, per "A JSON signature"
})

// CONTRACT: "@pure — Calling it twice with equal inputs must produce equal
// output"
test('graphSignature: is deterministic in its arguments', () => {
  const nodes = [{ id: 'a', type: T_DRIVER, data: { params: { ...DEFAULT_PARAMS[T_DRIVER] } } }]
  const edges = [{ id: 'e', source: 'a', sourceHandle: 'a1', target: 'a', targetHandle: 'a2' }]
  const s = { ...DEFAULT_SETTINGS }
  assert.equal(
    __internals.graphSignature(nodes, edges, s),
    __internals.graphSignature(nodes, edges, s),
  )
})

// CONTRACT: "Deliberately excludes everything the solver ignores — node
// positions, selection, labels — so dragging a node around the canvas does not
// re-run the sweep."
test('graphSignature: ignores node positions', () => {
  const p = { ...DEFAULT_PARAMS[T_DRIVER] }
  const a = [{ id: 'a', type: T_DRIVER, position: { x: 0, y: 0 }, data: { params: p } }]
  const b = [{ id: 'a', type: T_DRIVER, position: { x: 900, y: 900 }, data: { params: p } }]
  assert.equal(
    __internals.graphSignature(a, [], DEFAULT_SETTINGS),
    __internals.graphSignature(b, [], DEFAULT_SETTINGS),
  )
})

// CONTRACT: "Deliberately excludes ... selection ..."
test('graphSignature: ignores selection', () => {
  const p = { ...DEFAULT_PARAMS[T_DRIVER] }
  const a = [{ id: 'a', type: T_DRIVER, selected: false, data: { params: p } }]
  const b = [{ id: 'a', type: T_DRIVER, selected: true, data: { params: p } }]
  assert.equal(
    __internals.graphSignature(a, [], DEFAULT_SETTINGS),
    __internals.graphSignature(b, [], DEFAULT_SETTINGS),
  )
})

// CONTRACT: "Deliberately excludes ... labels ..."
test('graphSignature: ignores node labels', () => {
  const p = { ...DEFAULT_PARAMS[T_DRIVER] }
  const a = [{ id: 'a', type: T_DRIVER, data: { label: 'One', params: p } }]
  const b = [{ id: 'a', type: T_DRIVER, data: { label: 'Two', params: p } }]
  assert.equal(
    __internals.graphSignature(a, [], DEFAULT_SETTINGS),
    __internals.graphSignature(b, [], DEFAULT_SETTINGS),
  )
})

// CONTRACT: "A value that changes exactly when the simulation would produce a
// different result."
test('graphSignature: changes when a node parameter changes', () => {
  const key = Object.keys(DEFAULT_PARAMS[T_DRIVER])[0]
  const base = { ...DEFAULT_PARAMS[T_DRIVER] }
  const a = [{ id: 'a', type: T_DRIVER, data: { params: base } }]
  const b = [{ id: 'a', type: T_DRIVER, data: { params: { ...base, [key]: 'changed' } } }]
  assert.notEqual(
    __internals.graphSignature(a, [], DEFAULT_SETTINGS),
    __internals.graphSignature(b, [], DEFAULT_SETTINGS),
  )
})

// CONTRACT: "A value that changes exactly when the simulation would produce a
// different result." — `voltage` and the sweep bounds are solver inputs.
test('graphSignature: changes when a solver-read setting changes', () => {
  const nodes = [{ id: 'a', type: T_DRIVER, data: { params: { ...DEFAULT_PARAMS[T_DRIVER] } } }]
  const sig = (s) => __internals.graphSignature(nodes, [], s)
  const base = { ...DEFAULT_SETTINGS }
  assert.notEqual(sig(base), sig({ ...base, voltage: base.voltage + 1 }))
  assert.notEqual(sig(base), sig({ ...base, fmin: base.fmin + 1 }))
  assert.notEqual(sig(base), sig({ ...base, fmax: base.fmax + 1 }))
  assert.notEqual(sig(base), sig({ ...base, npts: base.npts + 1 }))
})

// CONTRACT: "A value that changes *exactly* when the simulation would produce a
// different result. ... Deliberately excludes everything the solver ignores",
// combined with DEFAULT_SETTINGS: "`impedance` and `power` are UI conveniences
// linked to `voltage` by P = V²/Z; the solver reads only `voltage`."
// Changing either alone cannot change the result, so it must not change the
// signature. This is the strictest reading of "exactly".
test('graphSignature: ignores the UI-only impedance and power settings', () => {
  const nodes = [{ id: 'a', type: T_DRIVER, data: { params: { ...DEFAULT_PARAMS[T_DRIVER] } } }]
  const sig = (s) => __internals.graphSignature(nodes, [], s)
  const base = { ...DEFAULT_SETTINGS }
  assert.equal(sig(base), sig({ ...base, impedance: base.impedance * 2 }))
  assert.equal(sig(base), sig({ ...base, power: base.power * 2 }))
})

// CONTRACT: "A value that changes exactly when the simulation would produce a
// different result." (topology is a simulation input)
test('graphSignature: changes when the edge list changes', () => {
  const nodes = [
    { id: 'a', type: T_DRIVER, data: { params: { ...DEFAULT_PARAMS[T_DRIVER] } } },
    { id: 'b', type: T_CHAMBER, data: { params: { ...DEFAULT_PARAMS[T_CHAMBER] } } },
  ]
  assert.notEqual(
    __internals.graphSignature(nodes, [], DEFAULT_SETTINGS),
    __internals.graphSignature(
      nodes,
      [{ id: 'e', source: 'a', sourceHandle: 'a1', target: 'b', targetHandle: 'b1' }],
      DEFAULT_SETTINGS,
    ),
  )
})

// ========================================================= STORE ACTIONS ====

// CONTRACT: "Record which panel is mid tab-drag" / "`id` — Panel id, or `null`
// when the drag ends."
test('setDraggingPanel: records the panel, and null clears it', () => {
  st().setDraggingPanel(CANVAS)
  assert.equal(st().draggingPanel, CANVAS)
  st().setDraggingPanel(null)
  assert.equal(st().draggingPanel, null)
})

// CONTRACT: "Give a panel keyboard focus" / "Writes store state"
test('focusPanel: records the focused panel', () => {
  st().focusPanel(CANVAS)
  assert.equal(st().focusedPanel, CANVAS)
})

// CONTRACT: "Guarded against redundant writes because focus changes on every
// click and an unchanged write would still broadcast."
test('focusPanel: a redundant focus performs no store write', () => {
  st().focusPanel(CANVAS)
  let writes = 0
  const unsub = useStore.subscribe(() => { writes++ })
  st().focusPanel(CANVAS)
  unsub()
  assert.equal(writes, 0, 'refocusing the already-focused panel must not write')
})

// CONTRACT: "Maximize a panel full-bleed, or restore it if it is already
// maximized."
test('toggleMaximize: maximizes, then restores on a second call', () => {
  st().toggleMaximize(null)
  st().toggleMaximize(CANVAS)
  assert.equal(st().maximized, CANVAS)
  st().toggleMaximize(CANVAS)
  assert.ok(!st().maximized, 'a second toggle must restore')
})

// CONTRACT: "Open or close the settings window, optionally jumping to a
// section." / "`v` — Whether to show the window."
test('setShowSettings: writes the visibility flag and the requested section', () => {
  st().setShowSettings(false)
  st().setShowSettings(true, '__section_a__')
  assert.equal(st().showSettings, true)
  assert.equal(st().settingsSection, '__section_a__')
})

// CONTRACT: "`section` — Section to select. The current section is kept when
// omitted."
test('setShowSettings: keeps the current section when omitted', () => {
  st().setShowSettings(true, '__section_keep__')
  st().setShowSettings(false)
  st().setShowSettings(true)
  assert.equal(st().showSettings, true)
  assert.equal(st().settingsSection, '__section_keep__', 'the section must be kept')
})

// CONTRACT: "Switch the settings window to a section." / "`id` — Section id."
test('setSettingsSection: writes the section id', () => {
  st().setSettingsSection('__section_y__')
  assert.equal(st().settingsSection, '__section_y__')
})

// CONTRACT: "Replace a command's combos wholesale." / "`combos` — The command's
// complete new combo list."
test('setBinding: replaces the command combos wholesale', () => {
  const id = Object.keys(st().bindings)[0]
  st().setBinding(id, ['mod+shift+f9'])
  assert.deepEqual(st().bindings[id], ['mod+shift+f9'])
  st().resetBindings()
})

// CONTRACT: "Writes store state and persists the bindings to LocalStorage."
test('setBinding: persists the bindings to acousim:keymap', () => {
  const id = Object.keys(st().bindings)[0]
  st().resetBindings()
  st().setBinding(id, ['mod+shift+f10'])
  const stored = ls().getItem(LS_KEYMAP)
  assert.ok(stored, 'the binding change must reach acousim:keymap')
  assert.ok(stored.includes('mod+shift+f10'), 'the stored value must carry the new combo')
  st().resetBindings()
})

// CONTRACT: "Give a command a combo, taking it from whatever held it before." /
// "`string|null` — The id of the command the combo was taken from"
test('assignBinding: steals the combo and reports the previous holder', () => {
  st().resetBindings()
  const combo = 'mod+shift+f11'
  const ids = Object.keys(st().bindings)
  const holder = ids[0]
  st().setBinding(holder, [combo])
  // Pick a taker that genuinely conflicts with the holder, per keymap's own
  // scope rules, so the contract's "whatever held it before" is well defined.
  const taker = ids.find((id) => id !== holder && findConflict(st().bindings, combo, id) === holder)
  assert.ok(taker, 'the binding set must contain two commands that can conflict')

  const stolen = st().assignBinding(taker, combo)
  assert.equal(stolen, holder)
  assert.ok(st().bindings[taker].includes(combo), 'the taker receives the combo')
  assert.ok(!st().bindings[holder].includes(combo), 'the previous holder loses it')
  st().resetBindings()
})

// CONTRACT: "`string|null` — ... or `null` when it was free."
test('assignBinding: returns null when the combo was free', () => {
  st().resetBindings()
  const id = Object.keys(st().bindings)[0]
  const combo = 'mod+alt+shift+f12'
  assert.equal(findConflict(st().bindings, combo, id), null, 'precondition: combo is free')
  assert.equal(st().assignBinding(id, combo), null)
  assert.ok(st().bindings[id].includes(combo))
  st().resetBindings()
})

// CONTRACT: "Remove one combo from a command, leaving its others in place."
test('removeBinding: removes only the named combo', () => {
  const id = Object.keys(st().bindings)[0]
  st().setBinding(id, ['mod+shift+f7', 'mod+shift+f8'])
  st().removeBinding(id, 'mod+shift+f7')
  assert.deepEqual(st().bindings[id], ['mod+shift+f8'])
  st().resetBindings()
})

// CONTRACT: "Restore every command to its default combos."
test('resetBindings: restores the default combos for every command', () => {
  const id = Object.keys(st().bindings)[0]
  st().setBinding(id, ['mod+shift+f6'])
  st().resetBindings()
  assert.deepEqual(st().bindings, loadBindings())
})

// CONTRACT: "persists the bindings to LocalStorage, which removes the stored
// overrides entirely."
test('resetBindings: removes acousim:keymap entirely', () => {
  const id = Object.keys(st().bindings)[0]
  st().setBinding(id, ['mod+shift+f5'])
  assert.ok(ls().getItem(LS_KEYMAP), 'precondition: the override was stored')
  st().resetBindings()
  assert.equal(
    ls().getItem(LS_KEYMAP), null,
    'reset must remove the stored overrides entirely, not write an empty object',
  )
})

// CONTRACT: "Adopt a new layout tree and persist it." / "Writes store state and
// LocalStorage."
test('_commitLayout: adopts the tree and persists it to acousim:layout', () => {
  const t = split('row', [stack([CANVAS]), stack([closablePanel()])])
  ls().removeItem(LS_LAYOUT)
  st()._commitLayout(t)
  assert.equal(st().layout, t, 'the committed tree becomes the layout')
  assert.ok(ls().getItem(LS_LAYOUT), 'the layout must be persisted to acousim:layout')
  st().layoutOps.reset()
})

// CONTRACT: "A `null` tree — the result of an edit that would have emptied the
// workspace — is ignored rather than applied."
test('_commitLayout: a null tree is ignored', () => {
  st().layoutOps.reset()
  const before = st().layout
  const keys = keysWrittenBy(() => st()._commitLayout(null))
  assert.equal(st().layout, before, 'the layout must be untouched')
  assert.deepEqual(keys, [], 'a null tree must not write state')
})

// CONTRACT: "Bring a panel to the front of its stack."
test('layoutOps.activate: makes the named panel the stack\'s active tab', () => {
  st().layoutOps.reset()
  const s = stackWithAtLeast(tree(), 2)
  assert.ok(s, 'the default layout must contain a stack with two tabs')
  const other = s.panels.find((p) => p !== s.active)
  st().layoutOps.activate(s.id, other)
  assert.equal(findNode(tree(), s.id).active, other)
})

// CONTRACT: "Move a panel onto a target stack." / "`zone` — 'center' ... Where
// relative to the target."
test('layoutOps.dock: a center drop moves the panel into the target stack', () => {
  st().layoutOps.reset()
  const stacks = stacksOf(tree())
  const target = stacks[0]
  const mover = stacks.slice(1).flatMap((s) => s.panels).find(Boolean)
  assert.ok(mover, 'the default layout must have a panel outside the target stack')
  st().layoutOps.dock(mover, target.id, 'center')
  assert.equal(findPanelStack(tree(), mover).id, target.id)
})

// CONTRACT: "Dock a panel against an outer edge of the workspace."
test('layoutOps.dockEdge: a left-edge dock puts the panel first in traversal order', () => {
  st().layoutOps.reset()
  const panels = openPanels(tree())
  const mover = panels[panels.length - 1]
  st().layoutOps.dockEdge(mover, 'left')
  assert.ok(isOpen(tree(), mover), 'the panel stays open')
  assert.equal(openPanels(tree())[0], mover, 'a left dock places it at the far left')
})

// CONTRACT: "Apply a splitter drag, reweighting two adjacent children." /
// "`a` — New weight for that child." / "`b` — New weight for the next one."
test('layoutOps.resize: writes both new child weights', () => {
  st().layoutOps.reset()
  const root = tree()
  assert.ok(Array.isArray(root.children), 'the default layout root is a split')
  st().layoutOps.resize(root.id, 0, 3, 1)
  const after = findNode(tree(), root.id)
  assert.equal(after.children[0].size, 3)
  assert.equal(after.children[1].size, 1)
})

// CONTRACT: "dropping within the panel's own stack reorders it"
test('layoutOps.dropOnTab: a drop inside the panel\'s own stack reorders the tabs', () => {
  st().layoutOps.reset()
  const s = stackWithAtLeast(tree(), 2)
  assert.ok(s)
  const moving = s.panels[s.panels.length - 1]
  st().layoutOps.dropOnTab(moving, s.id, 0)
  assert.equal(findNode(tree(), s.id).panels[0], moving)
})

// CONTRACT: "dropping from elsewhere tabs it in."
test('layoutOps.dropOnTab: a drop from another stack tabs the panel in', () => {
  st().layoutOps.reset()
  const stacks = stacksOf(tree())
  const target = stacks[0]
  const mover = stacks.slice(1).flatMap((x) => x.panels).find(Boolean)
  assert.ok(mover)
  st().layoutOps.dropOnTab(mover, target.id, 0)
  assert.equal(findPanelStack(tree(), mover).id, target.id)
})

// CONTRACT: "A drop on its own current position does nothing."
test('layoutOps.dropOnTab: a drop on the panel\'s own current position does nothing', () => {
  st().layoutOps.reset()
  const s = stackWithAtLeast(tree(), 2)
  assert.ok(s)
  const idx = 0
  const panel = s.panels[idx]
  const keys = keysWrittenBy(() => st().layoutOps.dropOnTab(panel, s.id, idx))
  assert.deepEqual(keys, [], 'a no-op drop must not write state')
})

// CONTRACT: "Close a panel."
test('layoutOps.close: removes the panel from the layout', () => {
  st().layoutOps.reset()
  const p = closablePanel()
  st().layoutOps.close(p)
  assert.ok(!isOpen(tree(), p))
  st().layoutOps.reset()
})

// CONTRACT: "Panels marked `closable: false` — the canvas, which is the
// workspace itself — are refused"
test('layoutOps.close: refuses to close the canvas', () => {
  st().layoutOps.reset()
  const keys = keysWrittenBy(() => st().layoutOps.close(CANVAS))
  assert.ok(isOpen(tree(), CANVAS), 'the canvas is pinned open')
  assert.deepEqual(keys, [], 'a refused close must not write state')
})

// CONTRACT: "as is a close that would empty the layout."
test('layoutOps.close: never empties the layout', () => {
  st().layoutOps.reset()
  for (const p of openPanels(tree())) st().layoutOps.close(p)
  const left = openPanels(tree())
  assert.ok(left.length > 0, 'closing everything must never empty the layout')
  assert.ok(left.includes(CANVAS), 'the canvas is what survives')
  st().layoutOps.reset()
})

// CONTRACT: "Show a panel and give it focus, docking it if it is not already
// open."
test('layoutOps.open: docks a closed panel and focuses it', () => {
  st().layoutOps.reset()
  const p = closablePanel()
  st().layoutOps.close(p)
  assert.ok(!isOpen(tree(), p), 'precondition: the panel is closed')
  st().layoutOps.open(p)
  assert.ok(isOpen(tree(), p), 'the panel must be docked again')
  assert.equal(st().focusedPanel, p, 'opening focuses the panel')
  st().layoutOps.reset()
})

// CONTRACT: "Un-maximizes first, since opening a panel behind a maximized one
// would otherwise appear to do nothing."
test('layoutOps.open: clears the maximized panel', () => {
  st().layoutOps.reset()
  st().toggleMaximize(CANVAS)
  assert.equal(st().maximized, CANVAS, 'precondition: something is maximized')
  st().layoutOps.open(closablePanel())
  assert.ok(!st().maximized, 'opening must un-maximize')
  st().layoutOps.reset()
})

// CONTRACT: "Open a panel, or close it if it is already open."
test('layoutOps.toggle: closes an open panel and reopens a closed one', () => {
  st().layoutOps.reset()
  const p = closablePanel()
  st().layoutOps.toggle(p)
  assert.ok(!isOpen(tree(), p), 'toggling an open panel closes it')
  st().layoutOps.toggle(p)
  assert.ok(isOpen(tree(), p), 'toggling a closed panel opens it')
  st().layoutOps.reset()
})

// CONTRACT: "Restore the default workspace arrangement."
test('layoutOps.reset: restores the default set of panels', () => {
  st().layoutOps.dockEdge(closablePanel(), 'bottom')
  st().layoutOps.reset()
  assert.deepEqual(
    openPanels(tree()).slice().sort(),
    openPanels(defaultLayout()).slice().sort(),
  )
})

// CONTRACT: "Save the current arrangement under a name, replacing any preset
// with that name."
test('saveLayoutPreset: saves under the name, replacing a preset of that name', () => {
  const name = '__preset_replace__'
  st().layoutOps.reset()
  st().saveLayoutPreset(name)
  st().saveLayoutPreset(name)
  assert.equal(
    st().layoutPresets.filter((p) => p.name === name).length,
    1,
    'a second save with the same name replaces rather than appends',
  )
  st().deleteLayoutPreset(name)
})

// CONTRACT: "Writes store state and LocalStorage." (saveLayoutPreset)
test('saveLayoutPreset: persists to acousim:layoutPresets', () => {
  const name = '__preset_persist__'
  st().layoutOps.reset()
  st().saveLayoutPreset(name)
  const stored = ls().getItem(LS_PRESETS)
  assert.ok(stored, 'presets must be persisted to acousim:layoutPresets')
  assert.ok(stored.includes(name))
  st().deleteLayoutPreset(name)
})

// CONTRACT: "Apply a saved arrangement."
test('applyLayoutPreset: restores the arrangement that was saved', () => {
  const name = '__preset_apply__'
  st().layoutOps.reset()
  st().layoutOps.dockEdge(closablePanel(), 'bottom')
  const wanted = openPanels(tree()).slice().sort()
  st().saveLayoutPreset(name)
  st().layoutOps.reset()
  st().applyLayoutPreset(name)
  assert.deepEqual(openPanels(tree()).slice().sort(), wanted)
  st().deleteLayoutPreset(name)
  st().layoutOps.reset()
})

// CONTRACT: "The preset is sanitized before use — it may name panels a later
// build dropped — and the canvas is docked back in if sanitizing removed it, so
// a stale preset can never leave the workspace without its editor."
test('applyLayoutPreset: a stale preset still leaves the canvas docked', () => {
  const name = '__preset_stale__'
  // Build — through the documented write path — a layout naming only panels
  // this build does not have, and save it as a preset.
  st()._commitLayout(split('row', [stack(['__gone_a__']), stack(['__gone_b__'])]))
  st().saveLayoutPreset(name)
  st().layoutOps.reset()
  st().applyLayoutPreset(name)
  assert.ok(
    openPanels(tree()).includes(CANVAS),
    'a stale preset can never leave the workspace without its editor',
  )
  st().deleteLayoutPreset(name)
  st().layoutOps.reset()
})

// CONTRACT: "`name` — Preset name. An unknown name is ignored."
test('applyLayoutPreset: an unknown name is ignored', () => {
  st().layoutOps.reset()
  const keys = keysWrittenBy(() => st().applyLayoutPreset('__no_such_preset__'))
  assert.deepEqual(keys, [], 'an unknown preset must not write state')
})

// CONTRACT: "Replace the quick-bar arrangement."
test('setToolbar: replaces the arrangement with the given ids', () => {
  st().resetToolbar()
  const ids = st().toolbar.slice(0, 2)
  st().setToolbar(ids)
  assert.deepEqual(st().toolbar, ids)
  st().resetToolbar()
})

// CONTRACT: "Sanitized on the way in, so an arrangement carrying unknown ids
// falls back to the default rather than rendering a broken bar."
test('setToolbar: an arrangement of unknown ids falls back to the default', () => {
  st().resetToolbar()
  const defaults = st().toolbar.slice()
  st().setToolbar(['__not_an_item__', '__nor_this__'])
  assert.deepEqual(st().toolbar, defaults)
})

// CONTRACT: "Add an item to the quick bar, or remove it if it is already
// there." / "Newly added items go to the end"
test('toggleToolbarItem: removes a present item and re-adds it at the end', () => {
  st().resetToolbar()
  const id = st().toolbar[0]
  st().toggleToolbarItem(id)
  assert.ok(!st().toolbar.includes(id), 'toggling a present item removes it')
  st().toggleToolbarItem(id)
  assert.equal(st().toolbar[st().toolbar.length - 1], id, 'a re-added item goes to the end')
  st().resetToolbar()
})

// CONTRACT: "Writes store state and persists the toolbar." (toggleToolbarItem)
test('toggleToolbarItem: persists the toolbar to acousim:toolbar', () => {
  st().resetToolbar()
  ls().removeItem(LS_TOOLBAR)
  const id = st().toolbar[0]
  st().toggleToolbarItem(id)
  const stored = ls().getItem(LS_TOOLBAR)
  assert.ok(stored, 'the toolbar must be persisted to acousim:toolbar')
  assert.ok(!JSON.parse(stored).includes(id), 'the stored bar reflects the removal')
  st().resetToolbar()
})

// CONTRACT: "Move an item along the quick bar by swapping it with its
// neighbour." / "-1 is left, 1 is right."
test('moveToolbarItem: swaps the item with its neighbour', () => {
  st().resetToolbar()
  const [a, b] = st().toolbar
  st().moveToolbarItem(a, 1)
  assert.deepEqual(st().toolbar.slice(0, 2), [b, a])
  st().moveToolbarItem(a, -1)
  assert.deepEqual(st().toolbar.slice(0, 2), [a, b])
  st().resetToolbar()
})

// CONTRACT: "Does nothing when the item is absent or the move would run off
// either end."
test('moveToolbarItem: does nothing for an absent item', () => {
  st().resetToolbar()
  const keys = keysWrittenBy(() => st().moveToolbarItem('__not_an_item__', 1))
  assert.deepEqual(keys, [])
})

// CONTRACT: "Does nothing when the item is absent or the move would run off
// either end."
test('moveToolbarItem: does nothing when the move runs off either end', () => {
  st().resetToolbar()
  const bar = st().toolbar
  const first = bar[0]
  const last = bar[bar.length - 1]
  assert.deepEqual(keysWrittenBy(() => st().moveToolbarItem(first, -1)), [])
  assert.deepEqual(keysWrittenBy(() => st().moveToolbarItem(last, 1)), [])
})

// CONTRACT: "Restore the default quick-bar arrangement."
test('resetToolbar: restores the default arrangement', () => {
  st().resetToolbar()
  const defaults = st().toolbar.slice()
  st().setToolbar(defaults.slice(0, 1))
  st().resetToolbar()
  assert.deepEqual(st().toolbar, defaults)
})

// CONTRACT: "Delete a saved arrangement."
test('deleteLayoutPreset: removes the preset', () => {
  const name = '__preset_delete__'
  st().saveLayoutPreset(name)
  assert.ok(st().layoutPresets.some((p) => p.name === name), 'precondition: it exists')
  st().deleteLayoutPreset(name)
  assert.ok(!st().layoutPresets.some((p) => p.name === name))
})

// CONTRACT: "Writes store state and LocalStorage." (deleteLayoutPreset)
test('deleteLayoutPreset: the deletion reaches acousim:layoutPresets', () => {
  const name = '__preset_delete_ls__'
  st().saveLayoutPreset(name)
  assert.ok(ls().getItem(LS_PRESETS).includes(name), 'precondition: it was persisted')
  st().deleteLayoutPreset(name)
  assert.ok(!ls().getItem(LS_PRESETS).includes(name))
})

// CONTRACT: "Store one chart's X-axis zoom range, set by drag-selecting on the
// plot." / "`range` — Frequency range, or `null` to reset."
test('setXZoom: stores the range under the chart id and null resets it', () => {
  st().setXZoom('spl', [20, 200])
  assert.deepEqual(st().xZoom.spl, [20, 200])
  st().setXZoom('spl', null)
  assert.ok(!st().xZoom.spl, 'null must reset the chart zoom')
})

// CONTRACT: "Not persisted: zoom is a transient view of the current result."
test('setXZoom: is not persisted to LocalStorage', () => {
  const before = ls().getItem(LS_LAYOUT)
  st().setXZoom('zin', [30, 300])
  assert.equal(ls().getItem('acousim:xZoom'), null, 'zoom has no LocalStorage key')
  assert.equal(ls().getItem(LS_LAYOUT), before, 'and it does not disturb the layout key')
})

// CONTRACT: "Record the current graph as an undo point. Called before a
// mutation rather than after, so the entry is the state to return *to*."
test('pushHistory: the pushed entry is the state undo returns to', () => {
  const a = st().addNode(T_DRIVER, { x: 0, y: 0 })
  st().pushHistory()
  st().addNode(T_CHAMBER, { x: 50, y: 50 })
  st().undo()
  assert.deepEqual(nodesOf().map((n) => n.id), [a])
})

// CONTRACT: "Deep-copies nodes and edges, since undo must not hand back objects
// a later edit has since mutated."
test('pushHistory: the recorded graph is a deep copy', () => {
  const a = st().addNode(T_DRIVER, { x: 0, y: 0 })
  const key = Object.keys(DEFAULT_PARAMS[T_DRIVER])[0]
  const original = { ...paramsOf(a) }
  st().pushHistory()
  st().updateParams(a, { [key]: 'mutated' })
  assert.equal(paramsOf(a)[key], 'mutated', 'precondition: the param was changed')
  st().undo()
  assert.deepEqual(paramsOf(a), original, 'undo must restore the pre-edit params')
})

// CONTRACT: "Pushing clears the redo stack, which is the standard linear-history
// behaviour."
test('pushHistory: clears the redo stack', () => {
  st().addNode(T_DRIVER, { x: 0, y: 0 })
  st().undo()
  assert.equal(st().future.length, 1, 'precondition: there is something to redo')
  st().pushHistory()
  assert.equal(st().future.length, 0, 'pushing must clear the redo stack')
  const keys = keysWrittenBy(() => st().redo())
  assert.deepEqual(keys, [], 'redo must then do nothing')
})

// CONTRACT: "The history is capped at 80 entries, oldest discarded."
test('pushHistory: the history is capped at 80 entries', () => {
  for (let i = 0; i < 85; i++) st().addNode(T_DRIVER, { x: i, y: i })
  assert.equal(nodesOf().length, 85)
  assert.equal(st().history.length, 80, 'the history is capped at 80 entries')
  for (let i = 0; i < 85; i++) st().undo()
  assert.equal(nodesOf().length, 5, 'only the last 80 additions can be undone')
})

// CONTRACT: "Step back one entry in the history."
test('undo: steps back one entry', () => {
  const a = st().addNode(T_DRIVER, { x: 0, y: 0 })
  st().addNode(T_CHAMBER, { x: 10, y: 10 })
  st().undo()
  assert.deepEqual(nodesOf().map((n) => n.id), [a])
})

// CONTRACT: "Does nothing when the history is empty."
test('undo: does nothing when the history is empty', () => {
  // loadSerialized (beforeEach) clears the history.
  assert.equal(st().history.length, 0, 'precondition: the history is empty')
  const keys = keysWrittenBy(() => st().undo())
  assert.deepEqual(keys, [])
})

// CONTRACT: "Step forward one entry in the history."
test('redo: steps forward one entry', () => {
  st().addNode(T_DRIVER, { x: 0, y: 0 })
  st().undo()
  assert.equal(nodesOf().length, 0)
  st().redo()
  assert.equal(nodesOf().length, 1)
})

// CONTRACT: "Does nothing when the redo stack is empty."
test('redo: does nothing when the redo stack is empty', () => {
  assert.equal(st().future.length, 0, 'precondition: the redo stack is empty')
  const keys = keysWrittenBy(() => st().redo())
  assert.deepEqual(keys, [])
})

// CONTRACT: "Apply React Flow's node changes — drags, selections, removals."
test('onNodesChange: applies a position change', () => {
  const a = st().addNode(T_DRIVER, { x: 0, y: 0 })
  st().onNodesChange([{ id: a, type: 'position', position: { x: 111, y: 222 } }])
  assert.deepEqual(nodeById(a).position, { x: 111, y: 222 })
})

// CONTRACT: "Apply React Flow's node changes — drags, selections, removals."
test('onNodesChange: applies a selection change', () => {
  const a = st().addNode(T_DRIVER, { x: 0, y: 0 })
  st().onNodesChange([{ id: a, type: 'select', selected: false }])
  assert.equal(selectedNodes().length, 0)
  st().onNodesChange([{ id: a, type: 'select', selected: true }])
  assert.deepEqual(selectedNodes().map((n) => n.id), [a])
})

// CONTRACT: "Apply React Flow's node changes — ... removals."
test('onNodesChange: applies a removal', () => {
  const a = st().addNode(T_DRIVER, { x: 0, y: 0 })
  st().onNodesChange([{ id: a, type: 'remove' }])
  assert.equal(nodesOf().length, 0)
})

// CONTRACT: "Note that this does not push history, because it fires
// continuously during a drag."
test('onNodesChange: does not push history', () => {
  st().loadSerialized(blank({
    nodes: [{ id: 'n1', type: T_DRIVER, position: { x: 0, y: 0 }, params: {} }],
  }))
  st().onNodesChange([{ id: 'n1', type: 'remove' }])
  assert.equal(nodesOf().length, 0)
  assert.equal(st().history.length, 0, 'no history entry may have been recorded')
})

// CONTRACT: "Removals push history and schedule a resimulation, since deleting
// an edge changes the topology."
test('onEdgesChange: a removal records history so undo restores the edge', () => {
  st().loadSerialized(blank({
    nodes: [
      { id: 'n1', type: T_DRIVER, position: { x: 0, y: 0 }, params: {} },
      { id: 'n2', type: T_CHAMBER, position: { x: 100, y: 0 }, params: {} },
    ],
    edges: [{ id: 'e1', source: 'n1', sourceHandle: 'a', target: 'n2', targetHandle: 'b' }],
  }))
  st().onEdgesChange([{ id: 'e1', type: 'remove' }])
  assert.equal(edgesOf().length, 0)
  assert.equal(st().history.length, 1, 'the removal must have been recorded')
  st().undo()
  assert.equal(edgesOf().length, 1)
})

// CONTRACT: "Add an edge from a completed port-to-port drag."
test('onConnect: adds the connecting edge', () => {
  const a = st().addNode(T_DRIVER, { x: 0, y: 0 })
  const b = st().addNode(T_CHAMBER, { x: 100, y: 0 })
  st().onConnect({ source: a, sourceHandle: 'h1', target: b, targetHandle: 'h2' })
  assert.equal(edgesOf().length, 1)
  const e = edgesOf()[0]
  assert.equal(e.source, a)
  assert.equal(e.target, b)
  assert.equal(e.sourceHandle, 'h1')
  assert.equal(e.targetHandle, 'h2')
})

// CONTRACT: "Records history, writes store state and schedules a resimulation."
test('onConnect: records history so undo removes the edge', () => {
  const a = st().addNode(T_DRIVER, { x: 0, y: 0 })
  const b = st().addNode(T_CHAMBER, { x: 100, y: 0 })
  st().onConnect({ source: a, sourceHandle: 'h1', target: b, targetHandle: 'h2' })
  st().undo()
  assert.equal(edgesOf().length, 0)
})

// CONTRACT: "Select a node, which drives what the Parameters panel edits." /
// "`id` — Node id, or `null` to clear."
test('setSelected: writes selectedNodeId and null clears it', () => {
  const a = st().addNode(T_DRIVER, { x: 0, y: 0 })
  st().setSelected(a)
  assert.equal(st().selectedNodeId, a)
  st().setSelected(null)
  assert.equal(st().selectedNodeId, null)
})

// CONTRACT: "`string` — The new node's id" / "Add a node of the given type at a
// canvas position."
test('addNode: returns the new node id and places the node as asked', () => {
  const id = st().addNode(T_DRIVER, { x: 12, y: 34 })
  assert.equal(typeof id, 'string')
  const n = nodeById(id)
  assert.ok(n, 'the node must be in the graph')
  assert.equal(n.type, T_DRIVER)
  assert.deepEqual(n.position, { x: 12, y: 34 })
})

// CONTRACT: "its entry in `DEFAULT_PARAMS` supplies the initial params."
test('addNode: the new node carries its type\'s DEFAULT_PARAMS entry', () => {
  const id = st().addNode(T_DRIVER, { x: 0, y: 0 })
  const p = paramsOf(id)
  for (const [k, v] of Object.entries(DEFAULT_PARAMS[T_DRIVER])) {
    assert.deepEqual(p[k], v, `param ${k} must come from DEFAULT_PARAMS.driver`)
  }
})

// CONTRACT: "The new node arrives selected — and alone in the selection — so it
// can be copied, nudged or deleted straight away without clicking it first."
test('addNode: the new node is selected, and alone in the selection', () => {
  st().addNode(T_CHAMBER, { x: 0, y: 0 })
  const id = st().addNode(T_DRIVER, { x: 60, y: 60 })
  assert.deepEqual(selectedNodes().map((n) => n.id), [id])
})

// CONTRACT: "The new node arrives selected ... so it can be copied, nudged or
// deleted straight away without clicking it first." The Parameters panel edits
// `selectedNodeId`, so arriving "selected" must set that pointer too.
test('addNode: the new node becomes the selected node id', () => {
  const id = st().addNode(T_DRIVER, { x: 0, y: 0 })
  assert.equal(st().selectedNodeId, id)
})

// CONTRACT: "Records history, writes store state and schedules a resimulation."
test('addNode: records history so undo removes the node', () => {
  st().addNode(T_DRIVER, { x: 0, y: 0 })
  assert.equal(st().history.length, 1)
  st().undo()
  assert.equal(nodesOf().length, 0)
})

// CONTRACT: "Merge a patch into one node's parameters."
test('updateParams: merges the patch over the existing params', () => {
  const id = st().addNode(T_DRIVER, { x: 0, y: 0 })
  const key = Object.keys(DEFAULT_PARAMS[T_DRIVER])[0]
  st().updateParams(id, { [key]: 'patched' })
  const after = paramsOf(id)
  assert.equal(after[key], 'patched')
  for (const k of Object.keys(DEFAULT_PARAMS[T_DRIVER])) {
    assert.ok(k in after, `existing param ${k} must survive the merge`)
  }
})

// CONTRACT: "`id` — Node id. An unknown id is a no-op."
test('updateParams: an unknown id is a no-op', () => {
  st().addNode(T_DRIVER, { x: 0, y: 0 })
  const keys = keysWrittenBy(() => st().updateParams('__no_such_node__', { x: 1 }))
  assert.deepEqual(keys, [], 'no observable state may be written for an unknown id')
})

// CONTRACT: "Delete the selected nodes and edges."
test('deleteSelected: deletes the selected nodes', () => {
  st().addNode(T_CHAMBER, { x: 0, y: 0 })
  st().addNode(T_DRIVER, { x: 80, y: 80 }) // arrives alone in the selection
  st().deleteSelected()
  assert.equal(nodesOf().length, 1)
  assert.equal(nodesOf()[0].type, T_CHAMBER)
})

// CONTRACT: "Edges attached to a deleted node go with it, whether or not they
// were themselves selected — leaving a dangling edge would corrupt the graph."
test('deleteSelected: edges attached to a deleted node go with it', () => {
  const keep = st().addNode(T_CHAMBER, { x: 0, y: 0 })
  const doomed = st().addNode(T_DRIVER, { x: 80, y: 80 }) // selected, alone
  st().onConnect({ source: doomed, sourceHandle: 'h1', target: keep, targetHandle: 'h2' })
  assert.equal(edgesOf().length, 1, 'precondition: the edge exists')
  st().deleteSelected()
  assert.deepEqual(nodesOf().map((n) => n.id), [keep])
  assert.equal(edgesOf().length, 0, 'the attached edge must be deleted too')
})

// CONTRACT: "Does nothing when the selection is empty."
test('deleteSelected: does nothing when the selection is empty', () => {
  const id = st().addNode(T_DRIVER, { x: 0, y: 0 })
  st().onNodesChange([{ id, type: 'select', selected: false }])
  const keys = keysWrittenBy(() => st().deleteSelected())
  assert.deepEqual(keys, [])
  assert.equal(nodesOf().length, 1)
})

// CONTRACT: "Copy the selected nodes in place, offset down-right."
test('duplicateSelected: copies the selection, offset down-right', () => {
  const id = st().addNode(T_DRIVER, { x: 10, y: 10 })
  st().duplicateSelected()
  assert.equal(nodesOf().length, 2)
  const copy = nodesOf().find((n) => n.id !== id)
  assert.notEqual(copy.id, id, 'the copy gets a fresh id')
  assert.ok(copy.position.x > 10, 'offset right')
  assert.ok(copy.position.y > 10, 'offset down')
})

// CONTRACT: "Deep-copies each node's params so the duplicate is independent"
test('duplicateSelected: the duplicate\'s params are independent of the original', () => {
  const id = st().addNode(T_DRIVER, { x: 10, y: 10 })
  st().duplicateSelected()
  const copy = nodesOf().find((n) => n.id !== id)
  const key = Object.keys(DEFAULT_PARAMS[T_DRIVER])[0]
  const was = paramsOf(copy.id)[key]
  st().updateParams(id, { [key]: 'changed-on-original' })
  assert.deepEqual(paramsOf(copy.id)[key], was, 'the copy must not share params')
})

// CONTRACT: "moves the selection to the copies"
test('duplicateSelected: the selection moves to the copies', () => {
  const id = st().addNode(T_DRIVER, { x: 10, y: 10 })
  st().duplicateSelected()
  const sel = selectedNodes().map((n) => n.id)
  assert.equal(sel.length, 1)
  assert.notEqual(sel[0], id, 'the original is no longer selected')
})

// CONTRACT: "Edges are not duplicated; `copySelection` and `pasteClipboard` are
// the path that preserves them."
test('duplicateSelected: edges are not duplicated', () => {
  const a = st().addNode(T_CHAMBER, { x: 0, y: 0 })
  const b = st().addNode(T_DRIVER, { x: 80, y: 0 })
  st().onConnect({ source: b, sourceHandle: 'h1', target: a, targetHandle: 'h2' })
  st().selectAll()
  st().duplicateSelected()
  assert.equal(edgesOf().length, 1, 'the edge count must be unchanged')
  assert.equal(nodesOf().length, 4, 'both nodes were duplicated')
})

// CONTRACT: "Does nothing when the selection is empty."
test('duplicateSelected: does nothing when the selection is empty', () => {
  const id = st().addNode(T_DRIVER, { x: 0, y: 0 })
  st().onNodesChange([{ id, type: 'select', selected: false }])
  const keys = keysWrittenBy(() => st().duplicateSelected())
  assert.deepEqual(keys, [])
})

// CONTRACT: "Select every node on the canvas."
test('selectAll: selects every node', () => {
  st().addNode(T_DRIVER, { x: 0, y: 0 })
  st().addNode(T_CHAMBER, { x: 80, y: 0 })
  st().addNode(T_CHAMBER, { x: 160, y: 0 })
  st().selectAll()
  assert.equal(selectedNodes().length, 3)
})

// CONTRACT: "`number` — How many nodes were copied; 0 when the selection was
// empty."
test('copySelection: returns the number of nodes copied', () => {
  st().addNode(T_DRIVER, { x: 0, y: 0 })
  st().addNode(T_CHAMBER, { x: 80, y: 0 })
  st().selectAll()
  assert.equal(st().copySelection(), 2)
})

// CONTRACT: "0 when the selection was empty."
test('copySelection: returns 0 for an empty selection', () => {
  const id = st().addNode(T_DRIVER, { x: 0, y: 0 })
  st().onNodesChange([{ id, type: 'select', selected: false }])
  assert.equal(st().copySelection(), 0)
})

// CONTRACT: "An empty selection leaves the previous clipboard in place rather
// than clearing it, so a stray copy with nothing selected cannot lose what you
// copied a moment ago."
test('copySelection: an empty selection leaves the previous clipboard in place', () => {
  const a = st().addNode(T_DRIVER, { x: 0, y: 0 })
  st().addNode(T_CHAMBER, { x: 80, y: 0 })
  st().selectAll()
  assert.equal(st().copySelection(), 2, 'precondition: something is on the clipboard')
  const before = structuredClone(st().clipboard)

  // Deselect everything, then copy again with nothing selected.
  for (const n of nodesOf()) st().onNodesChange([{ id: n.id, type: 'select', selected: false }])
  assert.equal(st().copySelection(), 0, 'the stray copy reports nothing copied')
  assert.deepEqual(st().clipboard, before, 'the previous clipboard must be left untouched')
  assert.ok(nodeById(a))
})

// CONTRACT: "Copy the selected nodes and their internal edges to the in-app
// clipboard." / "Only edges wholly inside the selection are taken — a dangling
// half-edge would have nothing to reconnect to on paste."
// The clipboard's `{nodes, edges}` shape is inferred from that sentence; the
// spec names the field but not its layout.
test('copySelection: the clipboard holds the nodes and only the internal edges', () => {
  const a = st().addNode(T_DRIVER, { x: 0, y: 0 })
  const b = st().addNode(T_CHAMBER, { x: 80, y: 0 })
  const c = st().addNode(T_CHAMBER, { x: 160, y: 0 })
  st().onConnect({ source: a, sourceHandle: 'h1', target: b, targetHandle: 'h2' })
  st().onConnect({ source: b, sourceHandle: 'h3', target: c, targetHandle: 'h4' })
  st().selectAll()
  st().onNodesChange([{ id: c, type: 'select', selected: false }])
  assert.equal(st().copySelection(), 2)

  assert.equal(st().clipboard.nodes.length, 2)
  assert.equal(st().clipboard.edges.length, 1, 'only the a-b edge is wholly inside')
  assert.equal(st().clipboard.edges[0].source, a)
  assert.equal(st().clipboard.edges[0].target, b)
})

// CONTRACT: "Only edges wholly inside the selection are taken" — observed
// through a paste, which is where the dangling edge would have shown up.
test('copySelection: a half-selected edge is not pasted back', () => {
  const a = st().addNode(T_DRIVER, { x: 0, y: 0 })
  const b = st().addNode(T_CHAMBER, { x: 80, y: 0 })
  const c = st().addNode(T_CHAMBER, { x: 160, y: 0 })
  st().onConnect({ source: a, sourceHandle: 'h1', target: b, targetHandle: 'h2' })
  st().onConnect({ source: b, sourceHandle: 'h3', target: c, targetHandle: 'h4' })
  st().selectAll()
  st().onNodesChange([{ id: c, type: 'select', selected: false }])
  st().copySelection()
  st().pasteClipboard()
  assert.equal(nodesOf().length, 5, 'two nodes pasted')
  assert.equal(edgesOf().length, 3, 'only the a-b edge was inside the selection')
})

// CONTRACT: "Copy the selection, then delete it."
test('cutSelection: copies the selection and deletes it', () => {
  st().addNode(T_CHAMBER, { x: 0, y: 0 })
  const b = st().addNode(T_DRIVER, { x: 80, y: 0 }) // selected, alone
  st().cutSelection()
  assert.ok(!nodesOf().some((n) => n.id === b), 'the cut node is gone')
  assert.equal(nodesOf().length, 1)
  assert.equal(st().clipboard.nodes.length, 1, 'the cut selection is on the clipboard')
  st().pasteClipboard()
  assert.equal(nodesOf().length, 2)
})

// CONTRACT: "Deletes only if the copy found something, so an empty selection
// cannot delete anything."
test('cutSelection: an empty selection deletes nothing', () => {
  const id = st().addNode(T_DRIVER, { x: 0, y: 0 })
  st().onNodesChange([{ id, type: 'select', selected: false }])
  st().cutSelection()
  assert.equal(nodesOf().length, 1)
})

// CONTRACT: "Paste the clipboard as new nodes, offset down-right." / "Every
// pasted node gets a fresh id"
test('pasteClipboard: pastes fresh nodes offset down-right', () => {
  const a = st().addNode(T_DRIVER, { x: 10, y: 10 })
  st().copySelection()
  st().pasteClipboard()
  assert.equal(nodesOf().length, 2)
  const copy = nodesOf().find((n) => n.id !== a)
  assert.notEqual(copy.id, a, 'pasted nodes get fresh ids')
  assert.ok(copy.position.x > 10 && copy.position.y > 10, 'offset down-right')
})

// CONTRACT: "the copied edges are rewired through a remap table so they connect
// the copies rather than the originals."
test('pasteClipboard: copied edges are rewired onto the copies', () => {
  const a = st().addNode(T_DRIVER, { x: 0, y: 0 })
  const b = st().addNode(T_CHAMBER, { x: 80, y: 0 })
  st().onConnect({ source: a, sourceHandle: 'h1', target: b, targetHandle: 'h2' })
  st().selectAll()
  st().copySelection()
  st().pasteClipboard()

  const originals = new Set([a, b])
  const newEdges = edgesOf().filter((e) => !originals.has(e.source) || !originals.has(e.target))
  assert.equal(newEdges.length, 1, 'exactly one pasted edge')
  const e = newEdges[0]
  assert.ok(!originals.has(e.source), 'the pasted edge must not reference an original')
  assert.ok(!originals.has(e.target), 'the pasted edge must not reference an original')
  assert.ok(nodesOf().some((n) => n.id === e.source))
  assert.ok(nodesOf().some((n) => n.id === e.target))
})

// CONTRACT: "Params are merged over the current defaults, so pasting into a
// newer build fills in any parameter added since the copy was made."
test('pasteClipboard: pasted params are the copied values over the defaults', () => {
  const a = st().addNode(T_DRIVER, { x: 0, y: 0 })
  const key = Object.keys(DEFAULT_PARAMS[T_DRIVER])[0]
  st().updateParams(a, { [key]: 'edited' })
  st().copySelection()
  st().pasteClipboard()
  const copy = nodesOf().find((n) => n.id !== a)
  const p = paramsOf(copy.id)
  assert.equal(p[key], 'edited', 'the copied value wins over the default')
  for (const k of Object.keys(DEFAULT_PARAMS[T_DRIVER])) {
    assert.ok(k in p, `default param ${k} must be filled in`)
  }
})

// CONTRACT (pasteClipboard): "Does nothing when the clipboard is empty."
//
// The reachable exercise of this clause — pasting before the clipboard has
// ever been populated — is tested at the very top of this file, as
// `pasteClipboard: does nothing when the clipboard has never been populated`,
// specifically so it runs before any other test's `copySelection` or
// `cutSelection` call can populate the clipboard. See the AMBIGUITY note
// there: `copySelection`'s own contract says an empty selection "leaves the
// previous clipboard in place rather than clearing it" and states outright
// "There is no action that empties the clipboard", so once any test in this
// process has copied something, an empty clipboard can no longer be reached
// through the documented API at all.

// CONTRACT: "Add a node under the pointer, or at a default spot when it is
// off-canvas." / "`string` — The new node's id."
test('addNodeAtCursor: returns the new node id and adds the node', () => {
  const id = st().addNodeAtCursor(T_DRIVER)
  assert.equal(typeof id, 'string')
  const n = nodeById(id)
  assert.ok(n, 'the node must be added to the graph')
  assert.equal(n.type, T_DRIVER)
  assert.equal(typeof n.position.x, 'number')
  assert.equal(typeof n.position.y, 'number')
})

// CONTRACT: "Overlapping nodes are stepped down-right by `freeSpotNear`."
test('addNodeAtCursor: a second node does not land on top of the first', () => {
  const a = st().addNodeAtCursor(T_DRIVER)
  const b = st().addNodeAtCursor(T_DRIVER)
  assert.notDeepEqual(nodeById(a).position, nodeById(b).position)
})

// CONTRACT: "Reads the live React Flow viewport, records history, writes store
// state and schedules a resimulation."
test('addNodeAtCursor: records history so undo removes the node', () => {
  st().addNodeAtCursor(T_DRIVER)
  assert.equal(st().history.length, 1)
  st().undo()
  assert.equal(nodesOf().length, 0)
})

// CONTRACT: "Change the drive voltage by a fixed step" / "`delta` — Change in
// volts; negative lowers."
test('nudgeVoltage: moves the drive voltage by the delta', () => {
  const before = st().settings.voltage
  st().nudgeVoltage(0.5)
  assert.equal(st().settings.voltage, Number((before + 0.5).toFixed(2)))
  st().nudgeVoltage(-0.5)
  assert.equal(st().settings.voltage, Number(before.toFixed(2)))
})

// CONTRACT: "Clamped at zero"
test('nudgeVoltage: is clamped at zero', () => {
  st().nudgeVoltage(-1e6)
  assert.equal(st().settings.voltage, 0)
})

// CONTRACT: "rounded to two decimals so repeated nudges do not accumulate
// floating-point drift into the displayed value."
test('nudgeVoltage: the result is rounded to two decimals', () => {
  for (let i = 0; i < 8; i++) st().nudgeVoltage(0.1)
  const v = st().settings.voltage
  assert.equal(v, Number(v.toFixed(2)), 'the stored value must carry at most two decimals')
})

// CONTRACT: "Force a resimulation even though nothing has changed."
// The cached signature it clears is `_lastSig`, which the spec places outside
// any action's observable contract, so what is asserted here is the other half:
// forcing a resolve must not disturb the project itself.
test('recomputeNow: forces a resolve without altering the project', () => {
  const a = st().addNode(T_DRIVER, { x: 5, y: 5 })
  const nodesBefore = nodesOf()
  const edgesBefore = edgesOf()
  const settingsBefore = st().settings
  st().recomputeNow()
  assert.equal(nodesOf(), nodesBefore, 'nodes untouched')
  assert.equal(edgesOf(), edgesBefore, 'edges untouched')
  assert.equal(st().settings, settingsBefore, 'settings untouched')
  assert.equal(st().history.length, 1, 'and it records no new undo point')
  assert.ok(nodeById(a))
})

// CONTRACT: "Merge a patch into the sweep settings."
test('updateSettings: merges the patch and keeps the other settings', () => {
  st().updateSettings({ masking: !DEFAULT_SETTINGS.masking })
  assert.equal(st().settings.masking, !DEFAULT_SETTINGS.masking)
  for (const k of Object.keys(DEFAULT_SETTINGS)) {
    assert.ok(k in st().settings, `existing setting ${k} must survive the merge`)
  }
})

// CONTRACT: "it is the field the user typed in that stays exactly as typed."
test('setAmp: the edited field is stored exactly as typed', () => {
  st().setAmp('voltage', 12.345)
  assert.equal(st().settings.voltage, 12.345)
  st().setAmp('impedance', 6.5)
  assert.equal(st().settings.impedance, 6.5)
  st().setAmp('power', 77.25)
  assert.equal(st().settings.power, 77.25)
})

// CONTRACT: "Set one amplifier field and re-derive the others from P = V²/Z."
// AMBIGUOUS: for an impedance edit the spec does not say which of voltage and
// power is held and which is derived, so only the relation itself is asserted.
test('setAmp: P = V²/Z holds after editing each field', () => {
  const holds = () => {
    const { voltage: v, impedance: z, power: p } = st().settings
    assert.equal(typeof v, 'number')
    assert.equal(typeof z, 'number')
    assert.equal(typeof p, 'number')
    // 1% tolerance, since the spec allows the derived figures to be rounded
    // for display but never says by how much.
    assert.ok(
      Math.abs(p - (v * v) / z) <= Math.max(0.01, Math.abs(p) * 0.01),
      `P = V^2/Z must hold: V=${v} Z=${z} P=${p}`,
    )
  }
  st().setAmp('voltage', 20)
  holds()
  st().setAmp('impedance', 4)
  holds()
  st().setAmp('power', 100)
  holds()
})

// CONTRACT: "Does nothing without a successful result, or once three snapshots
// exist."
test('takeSnapshot: does nothing without a successful result', () => {
  assert.ok(!st().results, 'precondition: there is no result under test')
  assert.deepEqual(st().snapshots, [], 'precondition: no snapshots after a fresh load')
  const keys = keysWrittenBy(() => st().takeSnapshot())
  assert.deepEqual(keys, [], 'with no result there is nothing to freeze')
  assert.deepEqual(st().snapshots, [])
})

// CONTRACT: "Discard a reference overlay." (`id` — Snapshot id.)
test('removeSnapshot: an unknown id leaves the snapshot list alone', () => {
  const before = st().snapshots
  st().removeSnapshot(-1)
  assert.deepEqual(st().snapshots, before)
})

// CONTRACT: "Relabel a reference overlay."
test('renameSnapshot: an unknown id leaves the snapshot list alone', () => {
  const before = st().snapshots
  st().renameSnapshot(-1, 'nope')
  assert.deepEqual(st().snapshots, before)
})

// CONTRACT: "Open or close the port-velocity popup for a waveguide node." /
// "`id` — Waveguide node id, or `null` to close."
test('setVelocityPopup: writes velocityPopupNodeId and null closes it', () => {
  st().setVelocityPopup('__wg__')
  assert.equal(st().velocityPopupNodeId, '__wg__')
  st().setVelocityPopup(null)
  assert.equal(st().velocityPopupNodeId, null)
})

// CONTRACT: "Show or hide the driver database modal."
test('setShowDriverDB: writes showDriverDB', () => {
  st().setShowDriverDB(true)
  assert.equal(st().showDriverDB, true)
  st().setShowDriverDB(false)
  assert.equal(st().showDriverDB, false)
})

// CONTRACT: "Show or hide the Thiele/Small parameter solver."
test('setShowTSCalc: writes showTSCalc', () => {
  st().setShowTSCalc(true)
  assert.equal(st().showTSCalc, true)
  st().setShowTSCalc(false)
  assert.equal(st().showTSCalc, false)
})

// CONTRACT: "`object` — The serialized project: `{schemaVersion, app, name,
// modified, settings, nodes, edges}`."
test('serialize: returns the documented project shape', () => {
  const p = st().serialize()
  assert.deepEqual(
    Object.keys(p).slice().sort(),
    ['app', 'edges', 'modified', 'name', 'nodes', 'schemaVersion', 'settings'].sort(),
  )
  assert.equal(p.schemaVersion, SCHEMA_VERSION)
  assert.equal(p.name, st().projectName, 'the project name is carried through')
  assert.ok(Array.isArray(p.nodes))
  assert.ok(Array.isArray(p.edges))
  assert.equal(typeof p.settings, 'object')
})

// CONTRACT: "Node positions are included — they are editor state, but losing
// the layout of a saved graph would be worse than carrying it." The
// `.acousim.json` node shape is `{id, type, position, params}`.
test('serialize: nodes carry id, type, position and params', () => {
  st().addNode(T_DRIVER, { x: 21, y: 43 })
  const p = st().serialize()
  assert.equal(p.nodes.length, 1)
  assert.deepEqual(p.nodes[0].position, { x: 21, y: 43 })
  assert.equal(p.nodes[0].type, T_DRIVER)
  assert.equal(typeof p.nodes[0].id, 'string')
  assert.equal(typeof p.nodes[0].params, 'object')
})

// CONTRACT: "Reads the current time for the `modified` stamp."
test('serialize: the modified stamp is the current time', () => {
  const p = st().serialize()
  assert.equal(typeof p.modified, 'string')
  const t = Date.parse(p.modified)
  assert.ok(Number.isFinite(t), `modified must be a parseable timestamp: ${p.modified}`)
  assert.ok(Math.abs(Date.now() - t) < 60_000, 'the stamp must be the current time')
})

// CONTRACT: "Replace the current project with a deserialized one."
test('loadSerialized: replaces nodes, edges, settings and name', () => {
  st().addNode(T_DRIVER, { x: 0, y: 0 })
  st().loadSerialized(blank({
    name: 'loaded',
    nodes: [{ id: 'x1', type: T_CHAMBER, position: { x: 9, y: 9 }, params: {} }],
  }))
  assert.deepEqual(nodesOf().map((n) => n.id), ['x1'])
  assert.deepEqual(nodeById('x1').position, { x: 9, y: 9 })
  assert.equal(st().projectName, 'loaded')
})

// CONTRACT: "Params are merged over the current defaults, so a project saved by
// an older build gains any parameter added since."
test('loadSerialized: params are merged over the current defaults', () => {
  st().loadSerialized(blank({
    nodes: [{ id: 'x1', type: T_DRIVER, position: { x: 0, y: 0 }, params: {} }],
  }))
  for (const [k, v] of Object.entries(DEFAULT_PARAMS[T_DRIVER])) {
    assert.deepEqual(paramsOf('x1')[k], v, `param ${k} must be filled from the defaults`)
  }
})

// CONTRACT: "Edges missing an id get one, which hand-written and MCP-generated
// projects routinely need."
test('loadSerialized: edges missing an id are given one', () => {
  st().loadSerialized(blank({
    nodes: [
      { id: 'x1', type: T_DRIVER, position: { x: 0, y: 0 }, params: {} },
      { id: 'x2', type: T_CHAMBER, position: { x: 80, y: 0 }, params: {} },
    ],
    edges: [{ source: 'x1', sourceHandle: 'h1', target: 'x2', targetHandle: 'h2' }],
  }))
  assert.equal(edgesOf().length, 1)
  assert.equal(typeof edgesOf()[0].id, 'string')
  assert.ok(edgesOf()[0].id.length > 0)
})

// CONTRACT: "History, redo, snapshots and selection are all cleared: they
// describe the project being replaced and would be meaningless against the new
// one."
test('loadSerialized: history, redo, snapshots and selection are cleared', () => {
  st().addNode(T_DRIVER, { x: 0, y: 0 })
  st().undo() // leaves something on the redo stack
  st().addNode(T_CHAMBER, { x: 0, y: 0 })

  st().loadSerialized(blank({
    nodes: [{ id: 'x1', type: T_DRIVER, position: { x: 0, y: 0 }, params: {} }],
  }))

  assert.deepEqual(st().history, [], 'history cleared')
  assert.deepEqual(st().future, [], 'redo cleared')
  assert.deepEqual(st().snapshots, [], 'snapshots cleared')
  assert.equal(st().selectedNodeId, null, 'selection cleared')
  assert.equal(selectedNodes().length, 0, 'no node is left flagged selected')
})

// CONTRACT: "Send a panel to its own browser tab and remove it from the dock."
test('popOutPanel: removes the panel from the dock and tracks it as popped out', () => {
  st().layoutOps.reset()
  const p = closablePanel()
  st().popOutPanel(p)
  assert.ok(!isOpen(tree(), p), 'a popped-out panel is no longer in the dock')
  assert.ok(st().poppedOut.includes(p), 'and it is tracked as popped out')
  st()._reattachPanel(p)
  st().layoutOps.reset()
})

// CONTRACT: "Mark a panel as popped out and close it in this window's dock." /
// "Tracking which panels are out keeps the View menu honest about what is
// actually visible."
test('_detachPanel: marks the panel popped out and closes it in the dock', () => {
  st().layoutOps.reset()
  const p = closablePanel()
  st()._detachPanel(p)
  assert.ok(!isOpen(tree(), p))
  assert.ok(st().poppedOut.includes(p), 'the panel is tracked as popped out')
  st()._reattachPanel(p)
  st().layoutOps.reset()
})

// CONTRACT: "Take a panel back into the dock when its tab closes."
test('_reattachPanel: puts a popped-out panel back into the dock', () => {
  st().layoutOps.reset()
  const p = closablePanel()
  st()._detachPanel(p)
  st()._reattachPanel(p)
  assert.ok(isOpen(tree(), p), 'the panel returns to the dock')
  assert.ok(!st().poppedOut.includes(p), 'and is no longer tracked as popped out')
  st().layoutOps.reset()
})

// CONTRACT: "`id` — Panel id. Ignored when the panel was not popped out."
test('_reattachPanel: is ignored when the panel was not popped out', () => {
  st().layoutOps.reset()
  const keys = keysWrittenBy(() => st()._reattachPanel('__never_popped_out__'))
  assert.deepEqual(keys, [])
})

// CONTRACT: "Apply state mirrored from another window without echoing it back."
// `projectName` is in SHARED_KEYS, so it is a genuine shared-state delta.
test('_applyRemote: applies the patch to store state', () => {
  st()._applyRemote({ projectName: '__from_other_window__' })
  assert.equal(st().projectName, '__from_other_window__')
})

// CONTRACT: "The flag is cleared in a `finally` so a throwing subscriber cannot
// leave sync permanently muted." — i.e. normal local writes still work after.
test('_applyRemote: leaves local writes working afterwards', () => {
  st()._applyRemote({ projectName: '__remote2__' })
  st().loadSerialized(blank({ name: '__local__' }))
  assert.equal(st().projectName, '__local__')
})

// CONTRACT: "`object` — Every key in `SHARED_KEYS` with its current value."
test('_sharedSnapshot: is exactly SHARED_KEYS with their current values', () => {
  st().loadSerialized(blank({ name: '__shared__' }))
  st().addNode(T_DRIVER, { x: 0, y: 0 })
  const shot = st()._sharedSnapshot()
  assert.equal(typeof shot, 'object')
  assert.notEqual(shot, null)
  assert.deepEqual(
    Object.keys(shot).slice().sort(),
    SHARED_KEYS.slice().sort(),
    'the snapshot must be exactly the shared slice',
  )
  const live = st()
  for (const k of SHARED_KEYS) {
    assert.equal(shot[k], live[k], `shared key ${k} must be the store's current value`)
  }
})

// UNREACHABLE — not covered:
//   freeSpotNear > taken(x, y)
//   set(partial, replace)
//   channel.onmessage(arg0)
//
// NOT TESTABLE HERE (see the report):
//   scheduleCompute()  — the whole contract is the debounced POST to
//     /api/simulate, which does not exist under test; it has no synchronous
//     observable state change of its own that the contract names.
