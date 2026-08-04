// Blind contract tests for `src/store.js`.
//
// Written from docs/contracts/src_store_js.spec.md alone. No implementation
// file was read and no test was ever executed, so every assertion encodes what
// the contract CLAIMS rather than what the code happens to do.
//
// Naming note: the spec documents the store's ACTIONS but never names the
// state fields they write, so wherever a field name was not confirmed by some
// contract in the pack, the test derives the key by diffing
// `useStore.getState()` across the call instead of guessing. Field names that
// ARE confirmed elsewhere in the pack and are therefore used directly:
//   `focusedPanel`, `maximized`  (src/keymap.js spec)
//   `bindings`                   (src/components/MenuBar.jsx spec)
//   `draggingPanel`              (src/components/dock/DockLayout.jsx spec)
//   `toolbar`                    (src/components/Toolbar.jsx spec: `store.toolbar`)
//   `snapshots`                  (src/components/OutputPanel.jsx spec)
//   `settings`                   (src/components/ParamPanel.jsx spec)
//   `nodes` / `edges`, each node `{id, type, position, data: {params}}`
//                                (src/engine/solver.js spec)
//   `_flowApi`                   (src/components/FlowCanvas.jsx spec)

import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'

import { useStore, nextId, listSavedProjects, __internals } from '../../src/store.js'
import {
  stack, split, defaultLayout, findNode, findPanelStack, openPanels, isOpen,
} from '../../src/layout.js'
import { loadBindings, findConflict } from '../../src/keymap.js'

const st = () => useStore.getState()

// ---------------------------------------------------------------- helpers ---

// Node types used below. The spec never enumerates them; `driver`, `chamber`
// and `waveguide` are the three named across the contract pack (mcp/builders.js
// speaks of "driver node", "chamber", and "a waveguide node with id portId").
const T_DRIVER = 'driver'
const T_CHAMBER = 'chamber'

// The project shape the store itself produces, captured before any test runs so
// that `blank()` always rebuilds the same known starting point.
const BASE = st().serialize()

function blank(over = {}) {
  return {
    ...BASE,
    name: 'contract-test',
    settings: { ...BASE.settings },
    nodes: [],
    edges: [],
    ...over,
  }
}

/** Snapshot of every non-function value in the store state. */
function snap() {
  const out = {}
  for (const [k, v] of Object.entries(st())) {
    if (typeof v !== 'function') out[k] = v
  }
  return out
}

/** Keys whose value identity changed between two snapshots. */
function changedKeys(before, after) {
  const keys = new Set([...Object.keys(before), ...Object.keys(after)])
  return [...keys].filter((k) => !Object.is(before[k], after[k]))
}

/** Run `fn`, return the list of state keys it changed. */
function keysWrittenBy(fn) {
  const before = snap()
  fn()
  return changedKeys(before, snap())
}

/** Snapshot of LocalStorage as a plain object. */
function lsSnap() {
  const ls = globalThis.localStorage
  const out = {}
  if (!ls) return out
  if (typeof ls.length === 'number' && typeof ls.key === 'function') {
    for (let i = 0; i < ls.length; i++) {
      const k = ls.key(i)
      out[k] = ls.getItem(k)
    }
  } else {
    for (const k of Object.keys(ls)) out[k] = ls.getItem(k)
  }
  return out
}

function lsChangedKeys(before, after) {
  const keys = new Set([...Object.keys(before), ...Object.keys(after)])
  return [...keys].filter((k) => before[k] !== after[k])
}

/** The state key holding the dock layout tree, derived through `_commitLayout`. */
let LAYOUT_KEY = null
function layoutKey() {
  if (LAYOUT_KEY) return LAYOUT_KEY
  const panels = openPanels(defaultLayout())
  const probe = split('row', [stack([panels[0]]), stack([panels[1]])])
  const before = snap()
  st()._commitLayout(probe)
  const after = snap()
  LAYOUT_KEY = changedKeys(before, after).find((k) => Object.is(after[k], probe))
  assert.ok(LAYOUT_KEY, '_commitLayout must store the tree it was given in state')
  st().reset()
  return LAYOUT_KEY
}

const tree = () => st()[layoutKey()]

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

/** The state key holding the layout presets, derived through `saveLayoutPreset`. */
let PRESET_KEY = null
function presetKey() {
  if (PRESET_KEY) return PRESET_KEY
  const name = '__probe_preset__'
  const before = snap()
  st().saveLayoutPreset(name)
  const after = snap()
  PRESET_KEY = changedKeys(before, after).find(
    (k) => Array.isArray(after[k]) && after[k].some((p) => p && p.name === name),
  )
  assert.ok(PRESET_KEY, 'saveLayoutPreset must record the preset by name in state')
  st().deleteLayoutPreset(name)
  return PRESET_KEY
}

const presets = () => st()[presetKey()]

const nodesOf = () => st().nodes
const edgesOf = () => st().edges
const nodeById = (id) => nodesOf().find((n) => n.id === id)
const paramsOf = (id) => nodeById(id).data.params
const selectedNodes = () => nodesOf().filter((n) => n.selected)

beforeEach(() => {
  st().loadSerialized(blank())
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

// CONTRACT: "Saved projects, sorted by modification time descending."
test('listSavedProjects: returns entries sorted by modified descending', () => {
  st().loadSerialized(blank({ name: 'ls-sort-a' }))
  st().addNode(T_DRIVER, { x: 0, y: 0 })
  st().autoSave()
  st().loadSerialized(blank({ name: 'ls-sort-b' }))
  st().addNode(T_DRIVER, { x: 0, y: 0 })
  st().autoSave()

  const list = listSavedProjects()
  assert.ok(Array.isArray(list))
  for (let i = 1; i < list.length; i++) {
    assert.ok(
      String(list[i - 1].modified) >= String(list[i].modified),
      'list must be sorted newest first',
    )
  }
})

// CONTRACT: "Array<{key: string, name: string, modified: string, nodeCount:
// number, proj: object}>"
test('listSavedProjects: every entry has the documented shape', () => {
  st().loadSerialized(blank({ name: 'ls-shape' }))
  st().addNode(T_DRIVER, { x: 1, y: 2 })
  st().addNode(T_CHAMBER, { x: 3, y: 4 })
  st().autoSave()

  const entry = listSavedProjects().find((e) => e.name === 'ls-shape')
  assert.ok(entry, 'an auto-saved project must be listed')
  assert.equal(typeof entry.key, 'string')
  assert.equal(typeof entry.name, 'string')
  assert.equal(typeof entry.modified, 'string')
  assert.equal(typeof entry.nodeCount, 'number')
  assert.equal(entry.nodeCount, 2)
  assert.equal(typeof entry.proj, 'object')
  assert.notEqual(entry.proj, null)
})

// CONTRACT: "Corrupt entries are skipped rather than throwing, so one bad
// record cannot hide every other project from the manager."
test('listSavedProjects: a corrupt record is skipped, the good ones survive', () => {
  st().loadSerialized(blank({ name: 'ls-corrupt' }))
  st().addNode(T_DRIVER, { x: 0, y: 0 })
  const before = lsSnap()
  st().autoSave()
  const written = lsChangedKeys(before, lsSnap())
  assert.ok(written.length > 0, 'autoSave must write LocalStorage')

  // A sibling key sharing the auto-save prefix, holding unparseable JSON.
  const bad = written[0] + '-corrupt'
  globalThis.localStorage.setItem(bad, '{ this is not json')
  try {
    const list = listSavedProjects()
    assert.ok(Array.isArray(list))
    assert.ok(list.some((e) => e.name === 'ls-corrupt'))
  } finally {
    globalThis.localStorage.removeItem(bad)
  }
})

// ============================================================== INTERNAL ====

// CONTRACT: "`object` — A usable layout tree." / "The canvas check is the last
// guard — a layout without the Node Editor would leave the workspace with
// nothing to edit, so it is rejected even if it is otherwise valid."
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
  st().reset()
  const before = lsSnap()
  st()._commitLayout(split('row', [
    stack(openPanels(defaultLayout()).slice(0, 1)),
    stack(openPanels(defaultLayout()).slice(1, 2)),
  ]))
  const key = lsChangedKeys(before, lsSnap())[0]
  assert.ok(key, '_commitLayout must persist the layout to LocalStorage')

  globalThis.localStorage.setItem(key, '{ not json at all')
  const t = __internals.loadLayout()
  assert.deepEqual(
    openPanels(t).slice().sort(),
    openPanels(defaultLayout()).slice().sort(),
    'corrupt JSON must land on the default layout',
  )
  st().reset()
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
  const name = '__loadPresets_corrupt__'
  const before = lsSnap()
  st().saveLayoutPreset(name)
  const key = lsChangedKeys(before, lsSnap())[0]
  assert.ok(key, 'saveLayoutPreset must write LocalStorage')
  globalThis.localStorage.setItem(key, 'not json')
  assert.deepEqual(__internals.loadPresets(), [])
  globalThis.localStorage.removeItem(key)
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

  const before = lsSnap()
  st().toggleToolbarItem(defaults[0]) // persists the toolbar
  const key = lsChangedKeys(before, lsSnap())[0]
  assert.ok(key, 'toggleToolbarItem must persist the toolbar to LocalStorage')

  globalThis.localStorage.setItem(key, 'not json')
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
    [{ id: 'a', type: T_DRIVER, data: { params: { Fs: 30 } } }],
    [],
    { ...BASE.settings },
  )
  assert.equal(typeof sig, 'string')
  JSON.parse(sig) // must be JSON, per "A JSON signature"
})

// CONTRACT: "@pure — Calling it twice with equal inputs must produce equal
// output"
test('graphSignature: is deterministic in its arguments', () => {
  const nodes = [{ id: 'a', type: T_DRIVER, data: { params: { Fs: 30 } } }]
  const edges = [{ id: 'e', source: 'a', sourceHandle: 'a1', target: 'a', targetHandle: 'a2' }]
  const s = { ...BASE.settings }
  assert.equal(
    __internals.graphSignature(nodes, edges, s),
    __internals.graphSignature(nodes, edges, s),
  )
})

// CONTRACT: "Deliberately excludes everything the solver ignores — node
// positions, selection, labels — so dragging a node around the canvas does not
// re-run the sweep."
test('graphSignature: ignores node positions', () => {
  const a = [{ id: 'a', type: T_DRIVER, position: { x: 0, y: 0 }, data: { params: { Fs: 30 } } }]
  const b = [{ id: 'a', type: T_DRIVER, position: { x: 900, y: 900 }, data: { params: { Fs: 30 } } }]
  assert.equal(
    __internals.graphSignature(a, [], BASE.settings),
    __internals.graphSignature(b, [], BASE.settings),
  )
})

// CONTRACT: "Deliberately excludes ... selection ..."
test('graphSignature: ignores selection', () => {
  const a = [{ id: 'a', type: T_DRIVER, selected: false, data: { params: { Fs: 30 } } }]
  const b = [{ id: 'a', type: T_DRIVER, selected: true, data: { params: { Fs: 30 } } }]
  assert.equal(
    __internals.graphSignature(a, [], BASE.settings),
    __internals.graphSignature(b, [], BASE.settings),
  )
})

// CONTRACT: "Deliberately excludes ... labels ..."
test('graphSignature: ignores node labels', () => {
  const a = [{ id: 'a', type: T_DRIVER, data: { label: 'One', params: { Fs: 30 } } }]
  const b = [{ id: 'a', type: T_DRIVER, data: { label: 'Two', params: { Fs: 30 } } }]
  assert.equal(
    __internals.graphSignature(a, [], BASE.settings),
    __internals.graphSignature(b, [], BASE.settings),
  )
})

// CONTRACT: "A value that changes exactly when the simulation would produce a
// different result."
test('graphSignature: changes when a parameter changes', () => {
  const a = [{ id: 'a', type: T_DRIVER, data: { params: { Fs: 30 } } }]
  const b = [{ id: 'a', type: T_DRIVER, data: { params: { Fs: 31 } } }]
  assert.notEqual(
    __internals.graphSignature(a, [], BASE.settings),
    __internals.graphSignature(b, [], BASE.settings),
  )
})

// CONTRACT: "A value that changes exactly when the simulation would produce a
// different result." (settings are a simulation input)
test('graphSignature: changes when the sweep settings change', () => {
  const nodes = [{ id: 'a', type: T_DRIVER, data: { params: { Fs: 30 } } }]
  assert.notEqual(
    __internals.graphSignature(nodes, [], { ...BASE.settings, __probe: 1 }),
    __internals.graphSignature(nodes, [], { ...BASE.settings, __probe: 2 }),
  )
})

// CONTRACT: "A value that changes exactly when the simulation would produce a
// different result." (topology is a simulation input)
test('graphSignature: changes when the edge list changes', () => {
  const nodes = [
    { id: 'a', type: T_DRIVER, data: { params: {} } },
    { id: 'b', type: T_CHAMBER, data: { params: {} } },
  ]
  assert.notEqual(
    __internals.graphSignature(nodes, [], BASE.settings),
    __internals.graphSignature(
      nodes,
      [{ id: 'e', source: 'a', sourceHandle: 'a1', target: 'b', targetHandle: 'b1' }],
      BASE.settings,
    ),
  )
})

// ========================================================= STORE ACTIONS ====

// CONTRACT: "Record which panel is mid tab-drag" / "`id` — Panel id, or `null`
// when the drag ends."
test('setDraggingPanel: records the panel, and null clears it', () => {
  st().setDraggingPanel('probe-panel')
  assert.equal(st().draggingPanel, 'probe-panel')
  st().setDraggingPanel(null)
  assert.equal(st().draggingPanel, null)
})

// CONTRACT: "Give a panel keyboard focus" / "Writes store state"
test('focusPanel: records the focused panel', () => {
  st().focusPanel('panel-a')
  assert.equal(st().focusedPanel, 'panel-a')
})

// CONTRACT: "Guarded against redundant writes because focus changes on every
// click and an unchanged write would still broadcast."
test('focusPanel: a redundant focus performs no store write', () => {
  st().focusPanel('panel-guard')
  let writes = 0
  const unsub = useStore.subscribe(() => { writes++ })
  st().focusPanel('panel-guard')
  unsub()
  assert.equal(writes, 0, 'refocusing the already-focused panel must not write')
})

// CONTRACT: "Maximize a panel full-bleed, or restore it if it is already
// maximized."
test('toggleMaximize: maximizes, then restores on a second call', () => {
  const p = openPanels(defaultLayout())[0]
  st().toggleMaximize(null)
  st().toggleMaximize(p)
  assert.equal(st().maximized, p)
  st().toggleMaximize(p)
  assert.ok(!st().maximized, 'a second toggle must restore')
})

// CONTRACT: "Open or close the settings window" / "`v` — Whether to show the
// window." / "`section` — Section to select."
test('setShowSettings: writes the visibility flag and the requested section', () => {
  st().setShowSettings(false)
  const keys = keysWrittenBy(() => st().setShowSettings(true, '__section_a__'))
  assert.equal(keys.length, 2, 'exactly the visibility flag and the section change')
  const after = snap()
  const values = keys.map((k) => after[k])
  assert.ok(values.includes(true), 'the window is shown')
  assert.ok(values.includes('__section_a__'), 'the requested section is selected')
})

// CONTRACT: "`section` — Section to select. The current section is kept when
// omitted."
test('setShowSettings: keeps the current section when omitted', () => {
  st().setShowSettings(true, '__section_keep__')
  st().setShowSettings(false)
  const keys = keysWrittenBy(() => st().setShowSettings(true))
  assert.equal(keys.length, 1, 'only the visibility flag may change')
  assert.equal(snap()[keys[0]], true)
})

// CONTRACT: "Switch the settings window to a section." / "`id` — Section id."
test('setSettingsSection: writes the section id', () => {
  st().setSettingsSection('__section_x__')
  const keys = keysWrittenBy(() => st().setSettingsSection('__section_y__'))
  assert.equal(keys.length, 1)
  assert.equal(snap()[keys[0]], '__section_y__')
})

// CONTRACT: "Replace a command's combos wholesale." / "`combos` — The command's
// complete new combo list."
test('setBinding: replaces the command combos wholesale', () => {
  const id = Object.keys(st().bindings)[0]
  st().setBinding(id, ['mod+shift+f9'])
  assert.deepEqual(st().bindings[id], ['mod+shift+f9'])
})

// CONTRACT: "Writes store state and persists the bindings to LocalStorage."
test('setBinding: persists the bindings to LocalStorage', () => {
  const id = Object.keys(st().bindings)[0]
  st().resetBindings()
  const before = lsSnap()
  st().setBinding(id, ['mod+shift+f10'])
  const after = lsSnap()
  const written = lsChangedKeys(before, after)
  assert.ok(written.length > 0, 'the binding change must reach LocalStorage')
  assert.ok(
    written.some((k) => String(after[k]).includes('mod+shift+f10')),
    'the stored value must carry the new combo',
  )
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
test('resetBindings: removes the stored overrides from LocalStorage', () => {
  const id = Object.keys(st().bindings)[0]
  st().setBinding(id, ['mod+shift+f5'])
  assert.ok(
    Object.values(lsSnap()).some((v) => String(v).includes('mod+shift+f5')),
    'precondition: the override was stored',
  )
  st().resetBindings()
  assert.ok(
    !Object.values(lsSnap()).some((v) => String(v).includes('mod+shift+f5')),
    'reset must remove the stored overrides entirely',
  )
})

// CONTRACT: "Adopt a new layout tree and persist it." / "Writes store state and
// LocalStorage."
test('_commitLayout: adopts the tree and persists it', () => {
  const panels = openPanels(defaultLayout())
  const t = split('row', [stack([panels[0]]), stack([panels[1]])])
  const before = lsSnap()
  st()._commitLayout(t)
  assert.equal(tree(), t, 'the committed tree becomes the layout')
  assert.ok(lsChangedKeys(before, lsSnap()).length > 0, 'the layout must be persisted')
  st().reset()
})

// CONTRACT: "A `null` tree — the result of an edit that would have emptied the
// workspace — is ignored rather than applied."
test('_commitLayout: a null tree is ignored', () => {
  st().reset()
  const before = tree()
  const keys = keysWrittenBy(() => st()._commitLayout(null))
  assert.equal(tree(), before, 'the layout must be untouched')
  assert.deepEqual(keys, [], 'a null tree must not write state')
})

// CONTRACT: "Bring a panel to the front of its stack."
test('activate: makes the named panel the stack\'s active tab', () => {
  st().reset()
  const s = stackWithAtLeast(tree(), 2)
  assert.ok(s, 'the default layout must contain a stack with two tabs')
  const other = s.panels.find((p) => p !== s.active)
  st().activate(s.id, other)
  assert.equal(findNode(tree(), s.id).active, other)
})

// CONTRACT: "Move a panel onto a target stack." / "`zone` — 'center' ... Where
// relative to the target."
test('dock: a center drop moves the panel into the target stack', () => {
  st().reset()
  const stacks = stacksOf(tree())
  const target = stacks[0]
  const mover = stacks.slice(1).flatMap((s) => s.panels).find(Boolean)
  assert.ok(mover, 'the default layout must have a panel outside the target stack')
  st().dock(mover, target.id, 'center')
  assert.equal(findPanelStack(tree(), mover).id, target.id)
})

// CONTRACT: "Dock a panel against an outer edge of the workspace."
test('dockEdge: a left-edge dock puts the panel first in traversal order', () => {
  st().reset()
  const panels = openPanels(tree())
  const mover = panels[panels.length - 1]
  st().dockEdge(mover, 'left')
  assert.ok(isOpen(tree(), mover), 'the panel stays open')
  assert.equal(openPanels(tree())[0], mover, 'a left dock places it at the far left')
})

// CONTRACT: "Apply a splitter drag, reweighting two adjacent children." /
// "`a` — New weight for that child." / "`b` — New weight for the next one."
test('resize: writes both new child weights', () => {
  st().reset()
  const root = tree()
  assert.ok(Array.isArray(root.children), 'the default layout root is a split')
  st().resize(root.id, 0, 3, 1)
  const after = findNode(tree(), root.id)
  assert.equal(after.children[0].size, 3)
  assert.equal(after.children[1].size, 1)
})

// CONTRACT: "dropping within the panel's own stack reorders it"
test('dropOnTab: a drop inside the panel\'s own stack reorders the tabs', () => {
  st().reset()
  const s = stackWithAtLeast(tree(), 2)
  assert.ok(s)
  const moving = s.panels[s.panels.length - 1]
  st().dropOnTab(moving, s.id, 0)
  assert.equal(findNode(tree(), s.id).panels[0], moving)
})

// CONTRACT: "dropping from elsewhere tabs it in."
test('dropOnTab: a drop from another stack tabs the panel in', () => {
  st().reset()
  const stacks = stacksOf(tree())
  const target = stacks[0]
  const mover = stacks.slice(1).flatMap((x) => x.panels).find(Boolean)
  assert.ok(mover)
  st().dropOnTab(mover, target.id, 0)
  assert.equal(findPanelStack(tree(), mover).id, target.id)
})

// CONTRACT: "A drop on its own current position does nothing."
test('dropOnTab: a drop on the panel\'s own current position does nothing', () => {
  st().reset()
  const s = stackWithAtLeast(tree(), 2)
  assert.ok(s)
  const idx = 0
  const panel = s.panels[idx]
  const keys = keysWrittenBy(() => st().dropOnTab(panel, s.id, idx))
  assert.deepEqual(keys, [], 'a no-op drop must not write state')
})

// CONTRACT: "Close a panel."
test('close: removes the panel from the layout', () => {
  st().reset()
  const target = openPanels(tree()).find((p) => {
    st().reset()
    st().close(p)
    return !isOpen(tree(), p)
  })
  assert.ok(target, 'at least one panel must be closable')
  assert.ok(!isOpen(tree(), target))
  st().reset()
})

// CONTRACT: "Panels marked `closable: false` — the canvas, which is the
// workspace itself — are refused, as is a close that would empty the layout."
test('close: refuses the non-closable canvas and never empties the layout', () => {
  st().reset()
  const panels = openPanels(tree())
  for (const p of panels) st().close(p)
  const left = openPanels(tree())
  assert.ok(left.length > 0, 'closing everything must never empty the layout')
  st().reset()
})

// CONTRACT: "Show a panel and give it focus, docking it if it is not already
// open."
test('open: docks a closed panel and focuses it', () => {
  st().reset()
  const panels = openPanels(tree())
  const p = panels.find((x) => {
    st().reset()
    st().close(x)
    return !isOpen(tree(), x)
  })
  assert.ok(p, 'need a closable panel')
  st().open(p)
  assert.ok(isOpen(tree(), p), 'the panel must be docked again')
  assert.equal(st().focusedPanel, p, 'opening focuses the panel')
  st().reset()
})

// CONTRACT: "Un-maximizes first, since opening a panel behind a maximized one
// would otherwise appear to do nothing."
test('open: clears the maximized panel', () => {
  st().reset()
  const panels = openPanels(tree())
  st().toggleMaximize(panels[0])
  assert.equal(st().maximized, panels[0], 'precondition: something is maximized')
  st().open(panels[1])
  assert.ok(!st().maximized, 'opening must un-maximize')
  st().reset()
})

// CONTRACT: "Open a panel, or close it if it is already open."
test('toggle: closes an open panel and reopens a closed one', () => {
  st().reset()
  const p = openPanels(tree()).find((x) => {
    st().reset()
    st().close(x)
    return !isOpen(tree(), x)
  })
  assert.ok(p, 'need a closable panel')
  st().reset()
  st().toggle(p)
  assert.ok(!isOpen(tree(), p), 'toggling an open panel closes it')
  st().toggle(p)
  assert.ok(isOpen(tree(), p), 'toggling a closed panel opens it')
  st().reset()
})

// CONTRACT: "Restore the default workspace arrangement."
test('reset: restores the default set of panels', () => {
  const p = openPanels(defaultLayout())[0]
  st().dockEdge(p, 'bottom')
  st().reset()
  assert.deepEqual(
    openPanels(tree()).slice().sort(),
    openPanels(defaultLayout()).slice().sort(),
  )
})

// CONTRACT: "Save the current arrangement under a name, replacing any preset
// with that name."
test('saveLayoutPreset: saves under the name, replacing a preset of that name', () => {
  const name = '__preset_replace__'
  st().reset()
  st().saveLayoutPreset(name)
  st().saveLayoutPreset(name)
  assert.equal(
    presets().filter((p) => p.name === name).length,
    1,
    'a second save with the same name replaces rather than appends',
  )
  st().deleteLayoutPreset(name)
})

// CONTRACT: "Apply a saved arrangement."
test('applyLayoutPreset: restores the arrangement that was saved', () => {
  const name = '__preset_apply__'
  st().reset()
  const p = openPanels(tree())[openPanels(tree()).length - 1]
  st().dockEdge(p, 'bottom')
  const wanted = openPanels(tree()).slice().sort()
  st().saveLayoutPreset(name)
  st().reset()
  st().applyLayoutPreset(name)
  assert.deepEqual(openPanels(tree()).slice().sort(), wanted)
  st().deleteLayoutPreset(name)
  st().reset()
})

// CONTRACT: "the canvas is docked back in if sanitizing removed it, so a stale
// preset can never leave the workspace without its editor."
test('applyLayoutPreset: a preset of unknown panels still leaves the canvas docked', () => {
  const name = '__preset_stale__'
  // Build — through the documented write path — a layout naming only panels
  // this build does not have, and save it as a preset. Applying it must
  // sanitize the unknowns away and dock the canvas back in.
  st()._commitLayout(split('row', [stack(['__gone_a__']), stack(['__gone_b__'])]))
  st().saveLayoutPreset(name)
  st().reset()
  st().applyLayoutPreset(name)
  assert.ok(
    openPanels(tree()).length > 0,
    'a stale preset can never leave the workspace without its editor',
  )
  st().deleteLayoutPreset(name)
  st().reset()
})

// CONTRACT: "`name` — Preset name. An unknown name is ignored."
test('applyLayoutPreset: an unknown name is ignored', () => {
  st().reset()
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
  assert.ok(presets().some((p) => p.name === name), 'precondition: the preset exists')
  st().deleteLayoutPreset(name)
  assert.ok(!presets().some((p) => p.name === name))
})

// CONTRACT: "Writes store state and LocalStorage." (deleteLayoutPreset)
test('deleteLayoutPreset: the deletion reaches LocalStorage', () => {
  const name = '__preset_delete_ls__'
  st().saveLayoutPreset(name)
  assert.ok(
    Object.values(lsSnap()).some((v) => String(v).includes(name)),
    'precondition: the preset was persisted',
  )
  st().deleteLayoutPreset(name)
  assert.ok(!Object.values(lsSnap()).some((v) => String(v).includes(name)))
})

// CONTRACT: "Store one chart's X-axis zoom range" / "`range` — Frequency range,
// or `null` to reset."
test('setXZoom: stores the range under the chart id and null resets it', () => {
  const before = snap()
  st().setXZoom('__chart__', [20, 200])
  const after = snap()
  const keys = changedKeys(before, after)
  assert.equal(keys.length, 1, 'exactly one state key holds the chart zooms')
  assert.deepEqual(after[keys[0]]['__chart__'], [20, 200])

  st().setXZoom('__chart__', null)
  assert.ok(!st()[keys[0]]['__chart__'], 'null must reset the chart zoom')
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
  const original = { ...paramsOf(a) }
  st().pushHistory()
  st().updateParams(a, { __probe: 12345 })
  assert.equal(paramsOf(a).__probe, 12345, 'precondition: the param was changed')
  st().undo()
  assert.deepEqual(paramsOf(a), original, 'undo must restore the pre-edit params')
})

// CONTRACT: "Pushing clears the redo stack, which is the standard linear-history
// behaviour."
test('pushHistory: clears the redo stack', () => {
  st().addNode(T_DRIVER, { x: 0, y: 0 })
  st().undo()
  assert.equal(nodesOf().length, 0, 'precondition: there is something to redo')
  st().pushHistory()
  const keys = keysWrittenBy(() => st().redo())
  assert.deepEqual(keys, [], 'redo must do nothing once the redo stack is cleared')
  assert.equal(nodesOf().length, 0)
})

// CONTRACT: "The history is capped at 80 entries, oldest discarded."
test('pushHistory: the history is capped at 80 entries', () => {
  for (let i = 0; i < 85; i++) st().addNode(T_DRIVER, { x: i, y: i })
  assert.equal(nodesOf().length, 85)
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
    edges: [],
  }))
  st().onNodesChange([{ id: 'n1', type: 'remove' }])
  assert.equal(nodesOf().length, 0)
  st().undo()
  assert.equal(nodesOf().length, 0, 'no history entry may have been recorded')
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
  st().undo()
  assert.equal(edgesOf().length, 1, 'the removal must have been recorded in history')
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
test('setSelected: records the node id and null clears it', () => {
  const before = snap()
  st().setSelected('__node__')
  const after = snap()
  const keys = changedKeys(before, after)
  assert.equal(keys.length, 1)
  assert.equal(after[keys[0]], '__node__')
  st().setSelected(null)
  assert.equal(st()[keys[0]], null)
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
test('addNode: the new node carries its type\'s default params', () => {
  const id = st().addNode(T_DRIVER, { x: 0, y: 0 })
  const p = paramsOf(id)
  assert.equal(typeof p, 'object')
  assert.ok(Object.keys(p).length > 0, 'defaults must supply the initial params')
})

// CONTRACT: "The new node arrives selected — and alone in the selection"
test('addNode: the new node is selected, and alone in the selection', () => {
  st().addNode(T_CHAMBER, { x: 0, y: 0 })
  const id = st().addNode(T_DRIVER, { x: 60, y: 60 })
  assert.deepEqual(selectedNodes().map((n) => n.id), [id])
})

// CONTRACT: "Records history, writes store state and schedules a resimulation."
test('addNode: records history so undo removes the node', () => {
  st().addNode(T_DRIVER, { x: 0, y: 0 })
  st().undo()
  assert.equal(nodesOf().length, 0)
})

// CONTRACT: "Merge a patch into one node's parameters."
test('updateParams: merges the patch over the existing params', () => {
  const id = st().addNode(T_DRIVER, { x: 0, y: 0 })
  const keysBefore = Object.keys(paramsOf(id))
  st().updateParams(id, { __probe: 7 })
  const after = paramsOf(id)
  assert.equal(after.__probe, 7)
  for (const k of keysBefore) {
    assert.ok(k in after, `existing param ${k} must survive the merge`)
  }
})

// CONTRACT: "`id` — Node id. An unknown id is a no-op."
test('updateParams: an unknown id is a no-op', () => {
  st().addNode(T_DRIVER, { x: 0, y: 0 })
  const before = nodesOf()
  st().updateParams('__no_such_node__', { __probe: 1 })
  assert.equal(nodesOf(), before, 'no state may be written for an unknown id')
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
  st().updateParams(id, { __probe: 1 })
  assert.equal(paramsOf(copy.id).__probe, undefined, 'the copy must not share params')
})

// CONTRACT: "moves the selection to the copies"
test('duplicateSelected: the selection moves to the copies', () => {
  const id = st().addNode(T_DRIVER, { x: 10, y: 10 })
  st().duplicateSelected()
  const sel = selectedNodes().map((n) => n.id)
  assert.equal(sel.length, 1)
  assert.notEqual(sel[0], id, 'the original is no longer selected')
})

// CONTRACT: "Edges are not duplicated"
test('duplicateSelected: edges are not duplicated', () => {
  const a = st().addNode(T_CHAMBER, { x: 0, y: 0 })
  const b = st().addNode(T_DRIVER, { x: 80, y: 0 })
  st().onConnect({ source: b, sourceHandle: 'h1', target: a, targetHandle: 'h2' })
  st().selectAll()
  st().duplicateSelected()
  assert.equal(edgesOf().length, 1, 'the edge count must be unchanged')
  assert.ok(a && b)
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

// CONTRACT: "Only edges wholly inside the selection are taken — a dangling
// half-edge would have nothing to reconnect to on paste."
test('copySelection: only edges wholly inside the selection are taken', () => {
  const a = st().addNode(T_DRIVER, { x: 0, y: 0 })
  const b = st().addNode(T_CHAMBER, { x: 80, y: 0 })
  const c = st().addNode(T_CHAMBER, { x: 160, y: 0 })
  st().onConnect({ source: a, sourceHandle: 'h1', target: b, targetHandle: 'h2' })
  st().onConnect({ source: b, sourceHandle: 'h3', target: c, targetHandle: 'h4' })
  st().selectAll()
  st().onNodesChange([{ id: c, type: 'select', selected: false }])
  assert.equal(st().copySelection(), 2)

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
  st().pasteClipboard()
  assert.equal(nodesOf().length, 2, 'the cut selection is on the clipboard')
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
test('pasteClipboard: pasted params carry the copied values over the defaults', () => {
  const a = st().addNode(T_DRIVER, { x: 0, y: 0 })
  st().updateParams(a, { __probe: 99 })
  st().copySelection()
  st().pasteClipboard()
  const copy = nodesOf().find((n) => n.id !== a)
  assert.equal(paramsOf(copy.id).__probe, 99)
  assert.ok(Object.keys(paramsOf(copy.id)).length >= Object.keys(paramsOf(a)).length)
})

// CONTRACT: "Does nothing when the clipboard is empty."
test('pasteClipboard: does nothing when the clipboard is empty', () => {
  const id = st().addNode(T_DRIVER, { x: 0, y: 0 })
  st().onNodesChange([{ id, type: 'select', selected: false }])
  st().copySelection() // copies nothing, leaving the clipboard empty
  const keys = keysWrittenBy(() => st().pasteClipboard())
  assert.deepEqual(keys, [])
  assert.equal(nodesOf().length, 1)
})

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

// CONTRACT: "Records history, writes store state and schedules a resimulation."
test('addNodeAtCursor: records history so undo removes the node', () => {
  st().addNodeAtCursor(T_DRIVER)
  st().undo()
  assert.equal(nodesOf().length, 0)
})

// CONTRACT: "Change the drive voltage by a fixed step" / "`delta` — Change in
// volts; negative lowers."
test('nudgeVoltage: moves the drive voltage by the delta', () => {
  const before = { ...st().settings }
  st().nudgeVoltage(0.5)
  const after = st().settings
  const moved = Object.keys(before).filter(
    (k) => typeof before[k] === 'number' && after[k] === Number((before[k] + 0.5).toFixed(2)),
  )
  assert.ok(moved.length > 0, 'a settings field must have risen by exactly the delta')
})

// CONTRACT: "Clamped at zero"
test('nudgeVoltage: is clamped at zero', () => {
  const before = { ...st().settings }
  st().nudgeVoltage(0.5)
  const after1 = st().settings
  const field = Object.keys(before).find(
    (k) => typeof before[k] === 'number' && after1[k] === Number((before[k] + 0.5).toFixed(2)),
  )
  assert.ok(field, 'precondition: the voltage field was identified')
  st().nudgeVoltage(-1e6)
  assert.equal(st().settings[field], 0)
})

// CONTRACT: "rounded to two decimals so repeated nudges do not accumulate
// floating-point drift into the displayed value."
test('nudgeVoltage: the result is rounded to two decimals', () => {
  const before = { ...st().settings }
  st().nudgeVoltage(0.1)
  const after1 = st().settings
  const field = Object.keys(before).find(
    (k) => typeof before[k] === 'number' && after1[k] === Number((before[k] + 0.1).toFixed(2)),
  )
  assert.ok(field, 'precondition: the voltage field was identified')
  for (let i = 0; i < 7; i++) st().nudgeVoltage(0.1)
  const v = st().settings[field]
  assert.equal(v, Number(v.toFixed(2)), 'the stored value must carry at most two decimals')
})

// CONTRACT: "Clears the cached graph signature, which is what normally
// suppresses a redundant solve."
test('recomputeNow: leaves no cached signature matching the current graph', () => {
  st().addNode(T_DRIVER, { x: 0, y: 0 })
  st().recomputeNow()
  const sig = __internals.graphSignature(nodesOf(), edgesOf(), st().settings)
  for (const [k, v] of Object.entries(snap())) {
    assert.notEqual(v, sig, `state key ${k} still holds the cached signature`)
  }
})

// CONTRACT: "Merge a patch into the sweep settings."
test('updateSettings: merges the patch and keeps the other settings', () => {
  const before = { ...st().settings }
  st().updateSettings({ __probe: 5 })
  const after = st().settings
  assert.equal(after.__probe, 5)
  for (const k of Object.keys(before)) {
    assert.ok(k in after, `existing setting ${k} must survive the merge`)
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
test('setVelocityPopup: records the node id and null closes it', () => {
  const before = snap()
  st().setVelocityPopup('__wg__')
  const after = snap()
  const keys = changedKeys(before, after)
  assert.equal(keys.length, 1)
  assert.equal(after[keys[0]], '__wg__')
  st().setVelocityPopup(null)
  assert.equal(st()[keys[0]], null)
})

// CONTRACT: "Show or hide the driver database modal."
test('setShowDriverDB: writes the visibility flag', () => {
  st().setShowDriverDB(false)
  const keys = keysWrittenBy(() => st().setShowDriverDB(true))
  assert.equal(keys.length, 1)
  assert.equal(snap()[keys[0]], true)
  st().setShowDriverDB(false)
  assert.equal(st()[keys[0]], false)
})

// CONTRACT: "Show or hide the project manager modal."
test('setShowProjectManager: writes the visibility flag', () => {
  st().setShowProjectManager(false)
  const keys = keysWrittenBy(() => st().setShowProjectManager(true))
  assert.equal(keys.length, 1)
  assert.equal(snap()[keys[0]], true)
  st().setShowProjectManager(false)
  assert.equal(st()[keys[0]], false)
})

// CONTRACT: "Show or hide the Thiele/Small parameter solver."
test('setShowTSCalc: writes the visibility flag', () => {
  st().setShowTSCalc(false)
  const keys = keysWrittenBy(() => st().setShowTSCalc(true))
  assert.equal(keys.length, 1)
  assert.equal(snap()[keys[0]], true)
  st().setShowTSCalc(false)
  assert.equal(st()[keys[0]], false)
})

// CONTRACT: "Set the prompt offering to restore an auto-saved project." /
// "`v` — The candidate project, or `null` to dismiss."
test('setRestorePrompt: stores the candidate project and null dismisses it', () => {
  const candidate = { name: '__candidate__' }
  st().setRestorePrompt(null)
  const keys = keysWrittenBy(() => st().setRestorePrompt(candidate))
  assert.equal(keys.length, 1)
  assert.equal(snap()[keys[0]], candidate)
  st().setRestorePrompt(null)
  assert.equal(st()[keys[0]], null)
})

// CONTRACT: "`object` — The serialized project: `{schemaVersion, app, name,
// modified, settings, nodes, edges}`."
test('serialize: returns the documented project shape', () => {
  const p = st().serialize()
  assert.deepEqual(
    Object.keys(p).slice().sort(),
    ['app', 'edges', 'modified', 'name', 'nodes', 'schemaVersion', 'settings'].sort(),
  )
  assert.ok(Array.isArray(p.nodes))
  assert.ok(Array.isArray(p.edges))
  assert.equal(typeof p.settings, 'object')
  assert.equal(typeof p.name, 'string')
})

// CONTRACT: "Node positions are included — they are editor state, but losing
// the layout of a saved graph would be worse than carrying it."
test('serialize: node positions are included', () => {
  st().addNode(T_DRIVER, { x: 21, y: 43 })
  const p = st().serialize()
  assert.equal(p.nodes.length, 1)
  assert.deepEqual(p.nodes[0].position, { x: 21, y: 43 })
  assert.equal(p.nodes[0].type, T_DRIVER)
  assert.equal(typeof p.nodes[0].id, 'string')
  assert.equal(typeof p.nodes[0].params, 'object')
})

// CONTRACT: "Reads the current time for the `modified` stamp."
test('serialize: the modified stamp advances between calls', () => {
  const a = st().serialize().modified
  const start = Date.now()
  while (Date.now() - start < 3) { /* let the clock move on */ }
  const b = st().serialize().modified
  assert.ok(String(b) >= String(a), 'the stamp must track the current time')
})

// CONTRACT: "Replace the current project with a deserialized one."
test('loadSerialized: replaces nodes, edges and settings', () => {
  st().addNode(T_DRIVER, { x: 0, y: 0 })
  st().loadSerialized(blank({
    name: 'loaded',
    nodes: [{ id: 'x1', type: T_CHAMBER, position: { x: 9, y: 9 }, params: {} }],
    edges: [],
  }))
  assert.deepEqual(nodesOf().map((n) => n.id), ['x1'])
  assert.deepEqual(nodeById('x1').position, { x: 9, y: 9 })
  assert.equal(st().serialize().name, 'loaded')
})

// CONTRACT: "Params are merged over the current defaults, so a project saved by
// an older build gains any parameter added since."
test('loadSerialized: params are merged over the current defaults', () => {
  st().loadSerialized(blank({
    nodes: [{ id: 'x1', type: T_DRIVER, position: { x: 0, y: 0 }, params: {} }],
    edges: [],
  }))
  assert.ok(
    Object.keys(paramsOf('x1')).length > 0,
    'an empty params object must be filled from the defaults',
  )
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

// CONTRACT: "History, redo, snapshots and selection are all cleared"
test('loadSerialized: history, redo, snapshots and selection are cleared', () => {
  st().addNode(T_DRIVER, { x: 0, y: 0 })
  st().undo() // leaves something on the redo stack
  st().addNode(T_CHAMBER, { x: 0, y: 0 })

  st().loadSerialized(blank({
    nodes: [{ id: 'x1', type: T_DRIVER, position: { x: 0, y: 0 }, params: {} }],
    edges: [],
  }))

  assert.deepEqual(st().snapshots, [], 'snapshots cleared')
  assert.equal(selectedNodes().length, 0, 'selection cleared')
  assert.deepEqual(keysWrittenBy(() => st().undo()), [], 'history cleared')
  assert.deepEqual(keysWrittenBy(() => st().redo()), [], 'redo cleared')
})

// CONTRACT: "Rename the project" / "`name` — The new project name."
test('setProjectName: renames the project', () => {
  st().setProjectName('a new name')
  assert.equal(st().serialize().name, 'a new name')
})

// CONTRACT: "Start an empty project" / "Shows a confirmation dialog, then
// replaces store state" (confirm is stubbed true under test)
test('newProject: empties the graph', () => {
  st().addNode(T_DRIVER, { x: 0, y: 0 })
  st().onConnect({ source: nodesOf()[0].id, sourceHandle: 'h1', target: nodesOf()[0].id, targetHandle: 'h2' })
  st().newProject()
  assert.deepEqual(nodesOf(), [])
  assert.deepEqual(edgesOf(), [])
})

// CONTRACT: "The new project is named with the current time so it cannot
// silently overwrite the auto-save of the one being replaced."
test('newProject: names the new project after the current time', () => {
  st().loadSerialized(blank({ name: 'the old one' }))
  st().newProject()
  const name = st().serialize().name
  assert.equal(typeof name, 'string')
  assert.notEqual(name, 'the old one')
  assert.ok(name.length > 0)
})

// CONTRACT: "Download the project as a file, auto-saving it first." / "Writes
// LocalStorage and triggers a browser download."
test('saveProjectJSON: auto-saves the project to LocalStorage first', () => {
  st().loadSerialized(blank({
    name: 'download-me',
    nodes: [{ id: 'x1', type: T_DRIVER, position: { x: 0, y: 0 }, params: {} }],
    edges: [],
  }))
  const before = lsSnap()
  st().saveProjectJSON()
  const written = lsChangedKeys(before, lsSnap())
  assert.ok(written.length > 0, 'the project must be auto-saved before download')
  assert.ok(listSavedProjects().some((e) => e.name === 'download-me'))
})

// CONTRACT: "Write the project to LocalStorage under its name."
test('autoSave: writes the project under its name', () => {
  st().loadSerialized(blank({
    name: 'autosave-name',
    nodes: [{ id: 'x1', type: T_DRIVER, position: { x: 0, y: 0 }, params: {} }],
    edges: [],
  }))
  const before = lsSnap()
  st().autoSave()
  const written = lsChangedKeys(before, lsSnap())
  assert.ok(written.length > 0, 'autoSave must write LocalStorage')
  assert.ok(written.some((k) => k.includes('autosave-name')), 'stored under its name')
})

// CONTRACT: "Renaming *moves* the save rather than copying it: the previous key
// is removed once the new one is written, so a renamed project does not leave a
// duplicate behind under its old name."
test('autoSave: renaming moves the save rather than copying it', () => {
  st().loadSerialized(blank({
    name: 'move-me-from',
    nodes: [{ id: 'x1', type: T_DRIVER, position: { x: 0, y: 0 }, params: {} }],
    edges: [],
  }))
  st().autoSave()
  assert.ok(listSavedProjects().some((e) => e.name === 'move-me-from'))

  st().setProjectName('move-me-to')
  st().autoSave()
  assert.ok(listSavedProjects().some((e) => e.name === 'move-me-to'), 'the new name is saved')
  assert.ok(
    !listSavedProjects().some((e) => e.name === 'move-me-from'),
    'the old key must be removed, not left as a duplicate',
  )
})

// CONTRACT: "Empty projects are skipped so an accidental new-project does not
// overwrite a real save with nothing."
test('autoSave: an empty project is skipped', () => {
  st().loadSerialized(blank({ name: 'empty-skip', nodes: [], edges: [] }))
  const before = lsSnap()
  st().autoSave()
  assert.deepEqual(lsChangedKeys(before, lsSnap()), [], 'an empty project must not be written')
})

// CONTRACT: "Send a panel to its own browser tab and remove it from the dock."
test('popOutPanel: removes the panel from the dock', () => {
  st().reset()
  const p = openPanels(tree()).find((x) => {
    st().reset()
    st().close(x)
    return !isOpen(tree(), x)
  })
  assert.ok(p, 'need a panel that can leave the dock')
  st().reset()
  st().popOutPanel(p)
  assert.ok(!isOpen(tree(), p), 'a popped-out panel is no longer in the dock')
  st().reset()
})

// CONTRACT: "Mark a panel as popped out and close it in this window's dock."
test('_detachPanel: closes the panel in this window\'s dock', () => {
  st().reset()
  const p = openPanels(tree()).find((x) => {
    st().reset()
    st().close(x)
    return !isOpen(tree(), x)
  })
  assert.ok(p)
  st().reset()
  st()._detachPanel(p)
  assert.ok(!isOpen(tree(), p))
  st()._reattachPanel(p)
  st().reset()
})

// CONTRACT: "Take a panel back into the dock when its tab closes."
test('_reattachPanel: puts a popped-out panel back into the dock', () => {
  st().reset()
  const p = openPanels(tree()).find((x) => {
    st().reset()
    st().close(x)
    return !isOpen(tree(), x)
  })
  assert.ok(p)
  st().reset()
  st()._detachPanel(p)
  st()._reattachPanel(p)
  assert.ok(isOpen(tree(), p), 'the panel returns to the dock')
  st().reset()
})

// CONTRACT: "`id` — Panel id. Ignored when the panel was not popped out."
test('_reattachPanel: is ignored when the panel was not popped out', () => {
  st().reset()
  const keys = keysWrittenBy(() => st()._reattachPanel('__never_popped_out__'))
  assert.deepEqual(keys, [])
})

// CONTRACT: "Apply state mirrored from another window without echoing it back."
test('_applyRemote: applies the patch to store state', () => {
  st()._applyRemote({ draggingPanel: '__remote__' })
  assert.equal(st().draggingPanel, '__remote__')
  st()._applyRemote({ draggingPanel: null })
})

// CONTRACT: "The flag is cleared in a `finally` so a throwing subscriber cannot
// leave sync permanently muted." — i.e. normal local writes still work after.
test('_applyRemote: leaves local writes working afterwards', () => {
  st()._applyRemote({ draggingPanel: '__remote2__' })
  st().setDraggingPanel('__local__')
  assert.equal(st().draggingPanel, '__local__')
  st().setDraggingPanel(null)
})

// CONTRACT: "`object` — Every key in `SHARED_KEYS` with its current value."
test('_sharedSnapshot: returns the shared keys with their current values', () => {
  st().setDraggingPanel('__shared__')
  const shot = st()._sharedSnapshot()
  assert.equal(typeof shot, 'object')
  assert.notEqual(shot, null)
  assert.ok(Object.keys(shot).length > 0, 'the shared slice must not be empty')
  assert.equal(shot.draggingPanel, '__shared__', 'a mirrored key carries its current value')
  const live = st()
  for (const [k, v] of Object.entries(shot)) {
    assert.equal(v, live[k], `shared key ${k} must be the store's current value`)
  }
  st().setDraggingPanel(null)
})

// UNREACHABLE — not covered:
//   freeSpotNear > taken(x, y)
//   set(partial, replace)
//   channel.onmessage(arg0)
//
// NOT TESTABLE HERE (see the report):
//   scheduleCompute()  — the whole contract is the debounced POST to
//     /api/simulate, which does not exist under test; it has no synchronous
//     state change of its own that the contract names.
