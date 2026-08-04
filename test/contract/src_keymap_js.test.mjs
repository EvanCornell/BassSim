import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  keyFromEvent,
  comboFromEvent,
  formatCombo,
  loadBindings,
  saveBindings,
  findConflict,
  resolve,
  COMMANDS,
} from '../../src/keymap.js'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const clone = (v) => JSON.parse(JSON.stringify(v))

// A combo no sane default would claim, used as "free" in conflict/resolve tests.
const FREE_COMBO = 'mod+alt+shift+f19'

// CONTRACT (module): "A combo is a lowercase string like `mod+shift+z`."
// CONTRACT: "Modifiers are emitted in a fixed order — `mod`, `alt`, `shift`"
const CANONICAL_COMBO = /^(mod\+)?(alt\+)?(shift\+)?[^+]+$/

function assertCanonicalCombo(combo, what) {
  assert.equal(typeof combo, 'string', `${what}: a combo must be a string`)
  assert.equal(combo, combo.toLowerCase(), `${what}: a combo must be lowercase (${combo})`)
  assert.match(combo, CANONICAL_COMBO, `${what}: ${combo} is not a canonical combo string`)
  // CONTRACT (module): "`mod` is Ctrl on Windows/Linux and Command on macOS; Ctrl and Command
  // are treated as the same modifier so one default set fits both platforms."
  for (const banned of ['ctrl', 'meta', 'cmd', 'command']) {
    assert.ok(
      !combo.split('+').slice(0, -1).includes(banned),
      `${what}: ${combo} names ${banned} instead of the platform-neutral mod`,
    )
  }
}

function storageKeys() {
  const out = []
  for (let i = 0; i < localStorage.length; i++) out.push(localStorage.key(i))
  return out
}

// CONTRACT (constants): "`KEYMAP_KEY` — LocalStorage key holding the user's binding overrides.
// Value: `"acousim:keymap"`"
const KEYMAP_KEY = 'acousim:keymap'

// CONTRACT (constants): "`COMMANDS` — Keys: `edit.undo`, `edit.redo`, `edit.cut`, `edit.copy`,
// `edit.paste`, `edit.duplicate`, `edit.selectAll`, `edit.delete`, `drive.up`, `drive.down`,
// `drive.upFine`, `drive.downFine`, `project.new`, `project.save`, `project.open`,
// `sim.snapshot`, `sim.mask`, `sim.recompute`, `view.settings`, `view.maximize`, `view.popout`"
const LISTED_COMMAND_KEYS = [
  'edit.undo', 'edit.redo', 'edit.cut', 'edit.copy', 'edit.paste', 'edit.duplicate',
  'edit.selectAll', 'edit.delete', 'drive.up', 'drive.down', 'drive.upFine', 'drive.downFine',
  'project.new', 'project.save', 'project.open', 'sim.snapshot', 'sim.mask', 'sim.recompute',
  'view.settings', 'view.maximize', 'view.popout',
]

// CONTRACT (constants): "`DEFAULT_BINDINGS` — The default combo (or combos) for each command.
// Keys: `edit.undo`, … `add.driver`, `add.chamber`, `add.waveguide`, `add.pr`, `add.radiation`, …"
// CONTRACT (module): "Adding a command means one entry in COMMANDS and one default in
// DEFAULT_BINDINGS", so every DEFAULT_BINDINGS key is also a command id.
const ADD_COMMAND_IDS = ['add.driver', 'add.chamber', 'add.waveguide', 'add.pr', 'add.radiation']
const DEFAULT_BINDING_KEYS = [
  'edit.undo', 'edit.redo', 'edit.cut', 'edit.copy', 'edit.paste', 'edit.duplicate',
  'edit.selectAll', 'edit.delete', ...ADD_COMMAND_IDS,
  'drive.up', 'drive.down', 'drive.upFine', 'drive.downFine',
  'project.new', 'project.save', 'project.open', 'sim.snapshot', 'sim.mask', 'sim.recompute',
  'view.settings', 'view.maximize', 'view.popout',
]

function ev(over = {}) {
  return { code: undefined, key: undefined, ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, ...over }
}

// ---------------------------------------------------------------------------
// keyFromEvent
// ---------------------------------------------------------------------------

// CONTRACT: "Reads `event.code` — the physical key — rather than `event.key`, so a binding does not
// change meaning when Shift is held: `shift+1` stays `shift+1` instead of becoming `!`."
test('keyFromEvent: reads event.code, so a shifted digit is still its digit', () => {
  assert.equal(keyFromEvent(ev({ code: 'Digit1', key: '!', shiftKey: true })), '1')
  assert.equal(keyFromEvent(ev({ code: 'Digit1', key: '1' })), '1')
})

// CONTRACT: "Reduce a keyboard event to the key name used in a combo string." (combos read like `mod+shift+z`)
test('keyFromEvent: letters reduce to their lowercase letter regardless of shift', () => {
  assert.equal(keyFromEvent(ev({ code: 'KeyZ', key: 'z' })), 'z')
  assert.equal(keyFromEvent(ev({ code: 'KeyZ', key: 'Z', shiftKey: true })), 'z')
})

// CONTRACT: "`string|null` — The key name, or `null` when the event is a bare modifier press"
test('keyFromEvent: a bare modifier press yields null', () => {
  for (const [code, key] of [
    ['ShiftLeft', 'Shift'],
    ['ShiftRight', 'Shift'],
    ['ControlLeft', 'Control'],
    ['ControlRight', 'Control'],
    ['AltLeft', 'Alt'],
    ['AltRight', 'Alt'],
    ['MetaLeft', 'Meta'],
    ['MetaRight', 'Meta'],
  ]) {
    assert.equal(keyFromEvent(ev({ code, key })), null, `${code} must not be bindable on its own`)
  }
})

// CONTRACT: "or `null` when the event ... carries no usable key."
test('keyFromEvent: an event with no usable key yields null', () => {
  assert.equal(keyFromEvent(ev()), null)
  assert.equal(keyFromEvent(ev({ code: '', key: '' })), null)
})

// CONTRACT: "Layouts whose code is unrecognised fall back to the character, which keeps non-US
// keyboards bindable even if not shift-stable."
test('keyFromEvent: an unrecognised code falls back to the character', () => {
  assert.equal(keyFromEvent(ev({ code: 'IntlSomethingWeird', key: 'é' })), 'é')
})

// CONTRACT: "@pure"
test('keyFromEvent: is pure', () => {
  const e = ev({ code: 'KeyZ', key: 'z' })
  const before = clone(e)
  assert.equal(keyFromEvent(e), keyFromEvent(e))
  assert.deepEqual(e, before)
})

// ---------------------------------------------------------------------------
// comboFromEvent
// ---------------------------------------------------------------------------

// CONTRACT: "Modifiers are emitted in a fixed order — `mod`, `alt`, `shift`" / "Ctrl and Command both map to `mod`."
test('comboFromEvent: modifiers are emitted as mod, alt, shift in that order', () => {
  assert.equal(comboFromEvent(ev({ code: 'KeyZ', key: 'z', ctrlKey: true, shiftKey: true })), 'mod+shift+z')
  assert.equal(comboFromEvent(ev({ code: 'KeyZ', key: 'z', metaKey: true, shiftKey: true })), 'mod+shift+z')
  assert.equal(
    comboFromEvent(ev({ code: 'KeyZ', key: 'z', ctrlKey: true, altKey: true, shiftKey: true })),
    'mod+alt+shift+z',
  )
  assert.equal(comboFromEvent(ev({ code: 'KeyZ', key: 'z', altKey: true })), 'alt+z')
  assert.equal(comboFromEvent(ev({ code: 'KeyZ', key: 'z', shiftKey: true })), 'shift+z')
  assert.equal(comboFromEvent(ev({ code: 'KeyZ', key: 'z' })), 'z')
})

// CONTRACT: "`string|null` — ... `null` when the event has no bindable key."
test('comboFromEvent: a bare modifier or keyless event yields null', () => {
  assert.equal(comboFromEvent(ev({ code: 'ShiftLeft', key: 'Shift', shiftKey: true })), null)
  assert.equal(comboFromEvent(ev({ code: 'ControlLeft', key: 'Control', ctrlKey: true })), null)
  assert.equal(comboFromEvent(ev()), null)
})

// CONTRACT: "the same physical chord always produces the same string and combos can be compared as plain strings"
test('comboFromEvent: the same chord always produces the same string', () => {
  const a = comboFromEvent(ev({ code: 'Digit1', key: '!', ctrlKey: true, shiftKey: true }))
  const b = comboFromEvent(ev({ code: 'Digit1', key: '1', ctrlKey: true, shiftKey: true }))
  assert.equal(a, b)
  assert.equal(a, 'mod+shift+1')
})

// CONTRACT (module): "A combo is a lowercase string like `mod+shift+z`. `mod` is Ctrl on
// Windows/Linux and Command on macOS; Ctrl and Command are treated as the same modifier so one
// default set fits both platforms."
test('comboFromEvent: every combo it builds is a canonical lowercase combo string', () => {
  const events = [
    ev({ code: 'KeyZ', key: 'z' }),
    ev({ code: 'KeyZ', key: 'Z', shiftKey: true }),
    ev({ code: 'Digit1', key: '!', ctrlKey: true, shiftKey: true }),
    ev({ code: 'F5', key: 'F5' }),
    ev({ code: 'Escape', key: 'Escape' }),
    ev({ code: 'ArrowUp', key: 'ArrowUp', altKey: true }),
    ev({ code: 'Slash', key: '/', metaKey: true }),
    ev({ code: 'UnknownLayoutCode', key: 'É', ctrlKey: true, altKey: true, shiftKey: true }),
  ]
  for (const e of events) {
    const combo = comboFromEvent(e)
    assert.notEqual(combo, null, `${e.code} should be bindable`)
    assertCanonicalCombo(combo, `comboFromEvent(${e.code})`)
  }
})

// CONTRACT: "@pure"
test('comboFromEvent: is pure', () => {
  const e = ev({ code: 'KeyZ', key: 'z', ctrlKey: true })
  const before = clone(e)
  assert.equal(comboFromEvent(e), comboFromEvent(e))
  assert.deepEqual(e, before)
})

// ---------------------------------------------------------------------------
// formatCombo
// ---------------------------------------------------------------------------

// CONTRACT: "`string` — The display form, or `''` when there is no binding."
test('formatCombo: an absent binding renders as the empty string', () => {
  assert.equal(formatCombo(null), '')
  assert.equal(formatCombo(undefined), '')
  assert.equal(formatCombo(''), '')
})

// CONTRACT: "macOS joins the parts without separators (⌘⇧Z), every other platform uses `+` (Ctrl+Shift+Z)."
// AMBIGUITY: IS_MAC is read from the environment, not the argument, so the test accepts exactly
// the two forms the contract documents and nothing else.
test('formatCombo: renders the documented display form for the platform', () => {
  const out = formatCombo('mod+shift+z')
  assert.ok(
    out === 'Ctrl+Shift+Z' || out === '⌘⇧Z',
    `expected one of the two documented display forms, got ${JSON.stringify(out)}`,
  )
})

// CONTRACT: "`string` — The display form" — always a string
test('formatCombo: always returns a string', () => {
  for (const c of ['z', 'mod+z', 'alt+shift+f5', FREE_COMBO]) {
    assert.equal(typeof formatCombo(c), 'string')
    assert.ok(formatCombo(c).length > 0, `a real combo must render to something: ${c}`)
  }
})

// ---------------------------------------------------------------------------
// loadBindings / saveBindings
//
// AMBIGUITY: the LocalStorage key is never named in the contract, so it is
// discovered here by observing which key saveBindings writes.
// AMBIGUITY: `COMMAND_IDS` is named in the contract but is not listed as an
// export. The module section says "Adding a command means one entry in COMMANDS
// and one default in DEFAULT_BINDINGS", so the id set is taken from `COMMANDS`.
// ---------------------------------------------------------------------------

const COMMAND_IDS = Object.keys(COMMANDS)

// CONTRACT: "`Object<string, string[]>` — Combos for every command id in `COMMAND_IDS`."
// CONTRACT: "Every command is given an entry whether or not it was stored"
test('loadBindings: every command id gets a well-typed entry', () => {
  localStorage.clear()
  const b = loadBindings()
  assert.equal(typeof b, 'object')
  assert.notEqual(b, null)
  for (const id of COMMAND_IDS) {
    assert.ok(Object.prototype.hasOwnProperty.call(b, id), `missing entry for command ${id}`)
    assert.ok(Array.isArray(b[id]), `entry for ${id} must be an array`)
    b[id].forEach((c) => assert.equal(typeof c, 'string', `combo for ${id} must be a string`))
  }
})

// CONTRACT (module): "Adding a command means one entry in COMMANDS and one default in
// DEFAULT_BINDINGS — nothing else needs to change."
test('loadBindings: every command carries at least one default combo', () => {
  localStorage.clear()
  const b = loadBindings()
  for (const id of COMMAND_IDS) {
    assert.ok(b[id].length > 0, `command ${id} has no default binding`)
  }
})

// CONTRACT (module): "A combo is a lowercase string like `mod+shift+z`. `mod` is Ctrl on
// Windows/Linux and Command on macOS ... so one default set fits both platforms."
test('loadBindings: every default combo is a canonical lowercase, platform-neutral combo', () => {
  localStorage.clear()
  const b = loadBindings()
  for (const id of COMMAND_IDS) {
    b[id].forEach((combo) => assertCanonicalCombo(combo, `default binding of ${id}`))
  }
})

// CONTRACT: "Reads LocalStorage; falls back to the defaults if it is unreadable or corrupt."
// CONTRACT: "Only differences are persisted"
// CONTRACT: "When nothing differs the key is removed rather than written as an empty object"
test('saveBindings: persists only the differences and removes the key when nothing differs', () => {
  localStorage.clear()
  const defaults = loadBindings()
  const id = COMMAND_IDS[0]
  const modified = { ...clone(defaults), [id]: ['mod+alt+shift+f9'] }

  saveBindings(modified)
  const keys = storageKeys()
  assert.equal(keys.length, 1, 'saving a difference must write exactly one LocalStorage key')
  const KEY = keys[0]

  const stored = JSON.parse(localStorage.getItem(KEY))
  assert.deepEqual(stored, { [id]: ['mod+alt+shift+f9'] }, 'only the differing command may be persisted')

  // Stored overrides layer over the defaults.
  const reloaded = loadBindings()
  assert.deepEqual(reloaded, modified)

  // Saving the defaults again removes the key entirely.
  saveBindings(defaults)
  assert.equal(localStorage.getItem(KEY), null, 'the key must be removed, not written as {}')
  assert.deepEqual(loadBindings(), defaults)
})

// CONTRACT: "stored values are filtered to strings, so the result is always complete and
// well-typed however corrupt the stored object is."
test('loadBindings: corrupt stored values are filtered to strings and every command still has an entry', () => {
  localStorage.clear()
  const defaults = loadBindings()
  const id = COMMAND_IDS[0]
  saveBindings({ ...clone(defaults), [id]: ['mod+alt+shift+f9'] })
  const KEY = storageKeys()[0]

  localStorage.setItem(KEY, JSON.stringify({ [id]: ['a', 5, null, {}, ['x'], 'b'], 'not-a-command': ['q'] }))
  const b = loadBindings()
  assert.deepEqual(b[id], ['a', 'b'], 'non-string combos must be filtered out')
  for (const cid of COMMAND_IDS) {
    assert.ok(Array.isArray(b[cid]), `missing entry for ${cid}`)
    b[cid].forEach((c) => assert.equal(typeof c, 'string'))
  }
})

// CONTRACT: "falls back to the defaults if it is unreadable or corrupt."
test('loadBindings: unparseable storage falls back to the defaults', () => {
  localStorage.clear()
  const defaults = loadBindings()
  const id = COMMAND_IDS[0]
  saveBindings({ ...clone(defaults), [id]: ['mod+alt+shift+f9'] })
  const KEY = storageKeys()[0]

  for (const junk of ['not json at all', '[1,2,3]', 'null', '"a string"', '42']) {
    localStorage.setItem(KEY, junk)
    assert.deepEqual(loadBindings(), defaults, `stored value ${junk} must fall back to the defaults`)
  }
  localStorage.clear()
})

// CONTRACT: "A quota failure is swallowed: losing a shortcut preference should not break the app."
test('saveBindings: a storage failure is swallowed', () => {
  localStorage.clear()
  const defaults = loadBindings()
  const realSet = localStorage.setItem
  const realRemove = localStorage.removeItem
  localStorage.setItem = () => {
    throw new Error('QuotaExceededError')
  }
  localStorage.removeItem = () => {
    throw new Error('QuotaExceededError')
  }
  saveBindings({ ...clone(defaults), [COMMAND_IDS[0]]: ['mod+alt+shift+f9'] })
  saveBindings(defaults)
  localStorage.setItem = realSet
  localStorage.removeItem = realRemove
})

// CONTRACT: "a command the user never touched picks up any later change to its default"
test('loadBindings: untouched commands keep their default combos after another command is rebound', () => {
  localStorage.clear()
  const defaults = loadBindings()
  const [first, second] = COMMAND_IDS
  saveBindings({ ...clone(defaults), [first]: ['mod+alt+shift+f9'] })
  const reloaded = loadBindings()
  assert.deepEqual(reloaded[second], defaults[second])
  localStorage.clear()
})

// ---------------------------------------------------------------------------
// findConflict
// ---------------------------------------------------------------------------

// CONTRACT: "`exceptId` — The command being rebound, which cannot conflict with itself."
test('findConflict: a command never conflicts with itself', () => {
  localStorage.clear()
  const bindings = loadBindings()
  for (const id of COMMAND_IDS) {
    for (const combo of bindings[id]) {
      assert.notEqual(findConflict(bindings, combo, id), id, `${id} conflicted with itself on ${combo}`)
    }
  }
})

// CONTRACT: "`string|null` — The id of the conflicting command, or `null` when the combo is free."
test('findConflict: an unbound combo is free', () => {
  localStorage.clear()
  const bindings = loadBindings()
  for (const id of COMMAND_IDS) {
    assert.equal(findConflict(bindings, FREE_COMBO, id), null, `${id} claimed a conflict on a free combo`)
  }
})

// CONTRACT: "Find the command that would fight `exceptId` over a combo."
// AMBIGUITY: command scopes are still not documented — the module section names COMMANDS and
// DEFAULT_BINDINGS but no scope vocabulary, and no command's scope is given anywhere in the
// pack. The only thing assertable for a deliberately shared combo is that the answer is
// another command that holds it.
test('findConflict: a reported conflict is always another command that holds the combo', () => {
  localStorage.clear()
  const bindings = loadBindings()
  const shared = {}
  for (const id of COMMAND_IDS) shared[id] = [FREE_COMBO]
  let anyConflict = false
  for (const id of COMMAND_IDS) {
    const c = findConflict(shared, FREE_COMBO, id)
    assert.notEqual(c, id)
    if (c !== null) {
      anyConflict = true
      assert.ok(COMMAND_IDS.includes(c), `${c} is not a known command id`)
      assert.ok(shared[c].includes(FREE_COMBO), `${c} does not hold the combo it supposedly fights over`)
    }
  }
  assert.ok(anyConflict, 'with every command sharing one combo, at least one pair must conflict')
  assert.deepEqual(Object.keys(bindings).sort(), COMMAND_IDS.slice().sort())
})

// CONTRACT: "@pure"
test('findConflict: is pure', () => {
  localStorage.clear()
  const bindings = loadBindings()
  const before = clone(bindings)
  const id = COMMAND_IDS[0]
  const combo = bindings[id][0] ?? FREE_COMBO
  assert.equal(findConflict(bindings, combo, id), findConflict(bindings, combo, id))
  assert.deepEqual(bindings, before, 'findConflict must not modify its arguments')
})

// ---------------------------------------------------------------------------
// resolve
// ---------------------------------------------------------------------------

// CONTRACT: "`string|null` — The command id to run, or `null` when nothing is bound to that combo."
test('resolve: a resolved command is always one that holds the combo', () => {
  localStorage.clear()
  const bindings = loadBindings()
  let resolvedSomething = false
  for (const id of COMMAND_IDS) {
    for (const combo of bindings[id]) {
      for (const focus of [null, 'some-panel', id]) {
        const got = resolve(bindings, combo, focus)
        if (got === null) continue
        resolvedSomething = true
        assert.ok(COMMAND_IDS.includes(got), `${got} is not a known command id`)
        assert.ok(
          bindings[got].includes(combo),
          `resolve returned ${got} for ${combo}, which ${got} is not bound to`,
        )
      }
    }
  }
  assert.ok(resolvedSomething, 'at least one default combo must resolve to a command')
})

// CONTRACT: "`null` when nothing is bound to that combo."
test('resolve: an unbound combo resolves to null whatever has focus', () => {
  localStorage.clear()
  const bindings = loadBindings()
  for (const focus of [null, 'canvas', 'some-panel']) {
    assert.equal(resolve(bindings, FREE_COMBO, focus), null)
  }
})

// CONTRACT: "The more specific scope wins: a canvas-scoped binding takes the key while the Node
// Editor has focus, and the global command bound to the same combo runs everywhere else."
// AMBIGUITY: neither the panel id of the Node Editor nor the scope of any command is documented
// — the regenerated module section adds the combo format and the `mod` convention but no scope
// vocabulary — so this asserts the weaker consequence that focus can only ever change the answer
// to another command that holds the same combo.
test('resolve: focus only ever swaps in another holder of the same combo', () => {
  localStorage.clear()
  const bindings = loadBindings()
  for (const id of COMMAND_IDS) {
    for (const combo of bindings[id]) {
      const unfocused = resolve(bindings, combo, null)
      const focused = resolve(bindings, combo, 'canvas')
      for (const got of [unfocused, focused]) {
        if (got !== null) assert.ok(bindings[got].includes(combo))
      }
    }
  }
})

// CONTRACT: "@pure"
test('resolve: is pure', () => {
  localStorage.clear()
  const bindings = loadBindings()
  const before = clone(bindings)
  const id = COMMAND_IDS[0]
  const combo = bindings[id][0] ?? FREE_COMBO
  assert.equal(resolve(bindings, combo, null), resolve(bindings, combo, null))
  assert.deepEqual(bindings, before, 'resolve must not modify its arguments')
})

// ---------------------------------------------------------------------------
// COMMANDS['<id>'].run(storeState)
//
// AMBIGUITY: the contract renders every command as `run(s)` and its "Obtain via" line as
// COMMANDS['<id>'] — the actual ids are never given, so a command cannot be addressed by name.
// These tests therefore drive every command with a recording stub store and assert the
// delegation each contract claims across the whole command set.
// ---------------------------------------------------------------------------

// Store actions named by the command contracts, cross-referenced with the
// src/store.js contract's STORE ACTION list:
//   "Step back one entry in the undo history."                  -> undo
//   "Step forward one entry in the undo history."               -> redo
//   "Copy the selected nodes to the clipboard and delete them." -> cutSelection
//   "Copy the selected nodes and the edges wholly inside ..."   -> copySelection
//   "Paste the clipboard as new nodes ..."                      -> pasteClipboard
//   "Copy and immediately paste the selection in one step."     -> duplicateSelected
//   "Select every node on the canvas."                          -> selectAll
//   "Delete the selected nodes and any edges attached to them." -> deleteSelected
//   "Add a node of this command's type at the pointer."         -> addNodeAtCursor
//   "Raise/Lower the drive voltage by 1 V / 0.1 V."             -> nudgeVoltage
//   "Discard the current graph and start an empty project."     -> newProject
//   "Download the project as an `.acousim.json` file."          -> saveProjectJSON
//   "Open the saved-project browser."                           -> setShowProjectManager
//   "Freeze the current result as a labelled reference overlay." -> takeSnapshot
//   "Toggle chambers between distributed lines and lumped ..."  -> updateSettings
//   "Force a resimulation without changing anything."           -> recomputeNow
//   "Open the settings window."                                 -> setShowSettings
//   "Maximize the focused panel, or restore ..."                -> toggleMaximize
//   "Pop the focused panel out into its own browser tab."       -> popOutPanel
const EXPECTED_ACTIONS = [
  'undo',
  'redo',
  'cutSelection',
  'copySelection',
  'pasteClipboard',
  'duplicateSelected',
  'selectAll',
  'deleteSelected',
  'addNodeAtCursor',
  'nudgeVoltage',
  'newProject',
  'saveProjectJSON',
  'setShowProjectManager',
  'takeSnapshot',
  'updateSettings',
  'recomputeNow',
  'setShowSettings',
  'toggleMaximize',
  'popOutPanel',
]

function makeStub() {
  const calls = []
  const data = {
    nodes: [],
    edges: [],
    selected: null,
    clipboard: null,
    snapshots: [],
    settings: { masking: false, drive: 2.83 },
    focusedPanel: 'a-panel',
    maximized: null,
    history: [],
    future: [],
    projectName: 'test',
  }
  const fns = new Map()
  const state = new Proxy(data, {
    get(target, prop) {
      if (typeof prop !== 'string') return Reflect.get(target, prop)
      if (prop in target) return target[prop]
      if (!fns.has(prop)) fns.set(prop, (...args) => calls.push({ name: prop, args }))
      return fns.get(prop)
    },
    has: () => true,
  })
  return { state, calls }
}

function runAll() {
  const perCommand = []
  for (const [id, cmd] of Object.entries(COMMANDS)) {
    if (typeof cmd.run !== 'function') continue
    const { state, calls } = makeStub()
    cmd.run(state)
    perCommand.push({ id, calls })
  }
  return perCommand
}

// CONTRACT: the spec documents 22 COMMAND-reachable `run(s)` methods, each obtained via
// "COMMANDS['<id>'].run(storeState)".
test('COMMANDS: exposes 22 runnable commands, each taking the store state', () => {
  const runnable = Object.values(COMMANDS).filter((c) => c && typeof c.run === 'function')
  assert.equal(runnable.length, 22)
})

// CONTRACT: "Delegates to the store, mutating application state." (every command)
test('COMMANDS: every command delegates at least one call to the store state it is given', () => {
  for (const { id, calls } of runAll()) {
    assert.ok(calls.length > 0, `command ${id} delegated nothing to the store`)
  }
})

// CONTRACT: each command's documented behaviour names a store action (see the mapping above).
test('COMMANDS: the command set delegates to every action its contracts name', () => {
  const called = new Set()
  for (const { calls } of runAll()) calls.forEach((c) => called.add(c.name))
  for (const action of EXPECTED_ACTIONS) {
    assert.ok(called.has(action), `no command delegated to ${action}`)
  }
})

// CONTRACT: "Raise the drive voltage by 1 V." / "Lower the drive voltage by 1 V." /
// "Raise the drive voltage by 0.1 V." / "Lower the drive voltage by 0.1 V."
// (src/store.js: "nudgeVoltage(delta) — Change the drive voltage by a fixed step, for the
// keyboard shortcuts. delta — Change in volts; negative lowers.")
test('COMMANDS: the four drive commands nudge by +1, -1, +0.1 and -0.1 volts', () => {
  const deltas = []
  for (const { calls } of runAll()) {
    calls.filter((c) => c.name === 'nudgeVoltage').forEach((c) => deltas.push(c.args[0]))
  }
  for (const d of [1, -1, 0.1, -0.1]) {
    assert.ok(deltas.includes(d), `no command nudged the drive by ${d} V (saw ${JSON.stringify(deltas)})`)
  }
})

// CONTRACT: "Toggle chambers between distributed lines and lumped compliances." +
// "Reads external mutable state: The current `settings.masking` value, which it inverts."
test('COMMANDS: the masking command inverts the current settings.masking value', () => {
  for (const start of [false, true]) {
    let seen = null
    for (const [, cmd] of Object.entries(COMMANDS)) {
      if (typeof cmd.run !== 'function') continue
      const { state, calls } = makeStub()
      state.settings.masking = start
      cmd.run(state)
      const call = calls.find((c) => c.name === 'updateSettings' && c.args[0] && 'masking' in c.args[0])
      if (call) seen = call.args[0].masking
    }
    assert.equal(seen, !start, `masking should have been inverted from ${start}`)
  }
})

// CONTRACT: "Maximize the focused panel, or restore the one already maximized." +
// "Reads external mutable state: `maximized` and `focusedPanel`"
test('COMMANDS: the maximize command toggles using the focused panel', () => {
  let seen
  for (const [, cmd] of Object.entries(COMMANDS)) {
    if (typeof cmd.run !== 'function') continue
    const { state, calls } = makeStub()
    cmd.run(state)
    const call = calls.find((c) => c.name === 'toggleMaximize')
    if (call) seen = call.args[0]
  }
  assert.equal(seen, 'a-panel', 'toggleMaximize must be passed the focused panel id')
})

// CONTRACT: "Pop the focused panel out into its own browser tab." +
// "Reads external mutable state: `focusedPanel` to decide what to pop out."
test('COMMANDS: the pop-out command pops out the focused panel', () => {
  let seen
  for (const [, cmd] of Object.entries(COMMANDS)) {
    if (typeof cmd.run !== 'function') continue
    const { state, calls } = makeStub()
    cmd.run(state)
    const call = calls.find((c) => c.name === 'popOutPanel')
    if (call) seen = call.args[0]
  }
  assert.equal(seen, 'a-panel', 'popOutPanel must be passed the focused panel id')
})

// CONTRACT: "Open the settings window." / "Open the saved-project browser."
// (src/store.js: setShowSettings(v, section) — "v — Whether to show the window.";
//  setShowProjectManager(v))
test('COMMANDS: the window-opening commands ask for the window to be shown', () => {
  const shows = { setShowSettings: [], setShowProjectManager: [] }
  for (const { calls } of runAll()) {
    calls.forEach((c) => {
      if (c.name in shows) shows[c.name].push(c.args[0])
    })
  }
  assert.ok(shows.setShowSettings.includes(true), 'the settings command must open, not close, the window')
  assert.ok(shows.setShowProjectManager.includes(true), 'the project browser command must open the browser')
})

// CONTRACT: "Add a node of this command's type at the pointer." +
// "Reads external mutable state: The captured `type` from the enclosing NODE_TYPES entry."
test('COMMANDS: the add-node commands pass a node type', () => {
  const types = []
  for (const { calls } of runAll()) {
    calls.filter((c) => c.name === 'addNodeAtCursor').forEach((c) => types.push(c.args[0]))
  }
  assert.ok(types.length > 0, 'no command added a node at the cursor')
  types.forEach((t) => {
    assert.equal(typeof t, 'string')
    assert.ok(t.length > 0)
  })
})
