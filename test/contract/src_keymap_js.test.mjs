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
// Value: `"speakerspice:keymap"`"
const KEYMAP_KEY = 'speakerspice:keymap'

// CONTRACT (constants): "`COMMANDS` — Keys: `edit.undo`, `edit.redo`, `edit.cut`, `edit.copy`,
// `edit.paste`, `edit.duplicate`, `edit.selectAll`, `edit.delete`, `drive.up`, `drive.down`,
// `drive.upFine`, `drive.downFine`, `project.new`, `project.save`,
// `sim.snapshot`, `sim.mask`, `sim.recompute`, `view.settings`, `view.maximize`, `view.popout`"
const LISTED_COMMAND_KEYS = [
  'edit.undo', 'edit.redo', 'edit.cut', 'edit.copy', 'edit.paste', 'edit.duplicate',
  'edit.selectAll', 'edit.delete', 'drive.up', 'drive.down', 'drive.upFine', 'drive.downFine',
  'project.new', 'project.save', 'sim.snapshot', 'sim.mask', 'sim.recompute',
  'view.settings', 'view.maximize', 'view.popout', 'view.timedomain',
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
  'project.new', 'project.save', 'sim.snapshot', 'sim.mask', 'sim.recompute',
  'view.settings', 'view.maximize', 'view.popout', 'view.timedomain',
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
// CONTRACT (constants): "`COMMAND_IDS` — Every command id, in declaration order."
// The ids themselves are now documented, so the binding set is checked against the
// documented vocabulary rather than against whatever the module happens to hold.
// ---------------------------------------------------------------------------

const COMMAND_IDS = DEFAULT_BINDING_KEYS

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
  // CONTRACT (constants): "`KEYMAP_KEY` — LocalStorage key holding the user's binding
  // overrides. Value: `"speakerspice:keymap"`"
  assert.deepEqual(storageKeys(), [KEYMAP_KEY], 'the overrides must live under the documented key')
  const KEY = KEYMAP_KEY

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
  const KEY = KEYMAP_KEY

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
  const KEY = KEYMAP_KEY

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

// CONTRACT: "Two commands can share a combo when their scopes can never both be active — but a
// canvas-scoped binding and a global one *would* both want the key while the canvas has focus,
// so that counts as a conflict."
// CONTRACT (constants, DEFAULT_BINDINGS): "Bare letters are safe here because canvas-scoped
// commands never fire while a text field has focus, and they make placing a chain of elements
// fast." — the add.* commands are the canvas-scoped, bare-letter family, so two of them always
// share a scope and must therefore conflict.
test('findConflict: two commands of the same scope sharing a combo conflict with each other', () => {
  localStorage.clear()
  const defaults = loadBindings()
  const [a, b] = ADD_COMMAND_IDS
  const shared = { ...clone(defaults), [a]: ['mod+alt+shift+f14'], [b]: ['mod+alt+shift+f14'] }
  assert.equal(findConflict(shared, 'mod+alt+shift+f14', a), b)
  assert.equal(findConflict(shared, 'mod+alt+shift+f14', b), a)
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
// CONTRACT (src/panelMeta.js constants): "`PANEL_META` — Keys: `palette`, `canvas`, …" and
// (src/components/FlowCanvas.jsx) "The Node Editor panel" — the Node Editor's panel id is `canvas`.
// CONTRACT (constants, DEFAULT_BINDINGS): "canvas-scoped commands never fire while a text field
// has focus" — the bare-letter add.* family is the canvas-scoped one.
test('resolve: a canvas-scoped command takes its combo while the Node Editor has focus', () => {
  localStorage.clear()
  const bindings = loadBindings()
  for (const id of ADD_COMMAND_IDS) {
    for (const combo of bindings[id]) {
      assert.equal(
        resolve(bindings, combo, 'canvas'),
        id,
        `${combo} should run ${id} while the Node Editor has focus`,
      )
    }
  }
})

// CONTRACT: "a canvas-scoped binding takes the key while the Node Editor has focus, and the
// global command bound to the same combo runs everywhere else. This is what lets `Ctrl+C` copy
// nodes on the canvas without stealing copy from the rest of the app."
test('resolve: a canvas-scoped command does not fire while another panel has focus', () => {
  localStorage.clear()
  const bindings = loadBindings()
  for (const id of ADD_COMMAND_IDS) {
    for (const combo of bindings[id]) {
      for (const focus of ['spl', 'params', 'zin', null]) {
        assert.notEqual(
          resolve(bindings, combo, focus),
          id,
          `${id} must not fire while ${String(focus)} has focus`,
        )
      }
    }
  }
})

// CONTRACT: "The more specific scope wins" — with the Node Editor focused both the canvas-scoped
// and the global bindings are live, so every bound combo must resolve to something.
test('resolve: every bound combo resolves while the Node Editor has focus', () => {
  localStorage.clear()
  const bindings = loadBindings()
  for (const id of COMMAND_IDS) {
    for (const combo of bindings[id]) {
      assert.notEqual(resolve(bindings, combo, 'canvas'), null, `${combo} (${id}) resolved to nothing`)
    }
  }
})

// CONTRACT: "The more specific scope wins: a canvas-scoped binding takes the key while the Node
// Editor has focus, and the global command bound to the same combo runs everywhere else."
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
// The command ids are now documented, so every command is addressed by name and
// checked against the store action its own contract names. The store action
// names come from the src/store.js contract's STORE ACTION list.
// ---------------------------------------------------------------------------

function makeStub(over = {}) {
  const calls = []
  const data = {
    nodes: [],
    edges: [],
    selected: null,
    clipboard: null,
    snapshots: [],
    settings: { masking: false, drive: 2.83 },
    focusedPanel: 'canvas',
    maximized: null,
    history: [],
    future: [],
    projectName: 'test',
    ...over,
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

function runCommand(id, over) {
  const cmd = COMMANDS[id]
  assert.ok(cmd, `COMMANDS has no entry for ${id}`)
  assert.equal(typeof cmd.run, 'function', `COMMANDS['${id}'].run must be a function`)
  const { state, calls } = makeStub(over)
  const returned = cmd.run(state)
  return { calls, returned }
}

// Assert the command delegated to exactly the named store action, with the given arguments
// when `args` is supplied.
function assertDelegates(id, action, args, over) {
  const { calls } = runCommand(id, over)
  assert.ok(calls.length > 0, `${id} delegated nothing to the store`)
  const hit = calls.filter((c) => c.name === action)
  assert.ok(
    hit.length > 0,
    `${id} did not delegate to ${action} (called ${JSON.stringify(calls.map((c) => c.name))})`,
  )
  if (args !== undefined) {
    assert.deepEqual(hit[0].args, args, `${id} called ${action} with the wrong arguments`)
  }
}

// CONTRACT (constants): the documented keys of COMMANDS, plus the DEFAULT_BINDINGS keys, which
// the module says are the same set: "Adding a command means one entry in COMMANDS and one
// default in DEFAULT_BINDINGS — nothing else needs to change."
test('COMMANDS: holds exactly the documented command ids, each with a run handler', () => {
  for (const id of LISTED_COMMAND_KEYS) {
    assert.ok(Object.prototype.hasOwnProperty.call(COMMANDS, id), `COMMANDS is missing ${id}`)
  }
  for (const id of DEFAULT_BINDING_KEYS) {
    assert.ok(
      Object.prototype.hasOwnProperty.call(COMMANDS, id),
      `${id} has a default binding but no COMMANDS entry`,
    )
    assert.equal(typeof COMMANDS[id].run, 'function', `COMMANDS['${id}'].run must be a function`)
  }
  assert.deepEqual(Object.keys(COMMANDS).slice().sort(), DEFAULT_BINDING_KEYS.slice().sort())
})

// CONTRACT: "`edit.undo > run(s)` — Step back one entry in the undo history."
test("COMMANDS: edit.undo steps back one entry in the undo history", () => {
  assertDelegates('edit.undo', 'undo')
})

// CONTRACT: "`edit.redo > run(s)` — Step forward one entry in the undo history."
test('COMMANDS: edit.redo steps forward one entry in the undo history', () => {
  assertDelegates('edit.redo', 'redo')
})

// CONTRACT: "`edit.cut > run(s)` — Copy the selected nodes to the clipboard and delete them."
test('COMMANDS: edit.cut cuts the selection', () => {
  assertDelegates('edit.cut', 'cutSelection')
})

// CONTRACT: "`edit.copy > run(s)` — Copy the selected nodes and the edges wholly inside the selection."
test('COMMANDS: edit.copy copies the selection', () => {
  assertDelegates('edit.copy', 'copySelection')
})

// CONTRACT: "`edit.paste > run(s)` — Paste the clipboard as new nodes, offset from the originals."
test('COMMANDS: edit.paste pastes the clipboard', () => {
  assertDelegates('edit.paste', 'pasteClipboard')
})

// CONTRACT: "`edit.duplicate > run(s)` — Copy and immediately paste the selection in one step."
test('COMMANDS: edit.duplicate duplicates the selection', () => {
  assertDelegates('edit.duplicate', 'duplicateSelected')
})

// CONTRACT: "`edit.selectAll > run(s)` — Select every node on the canvas."
test('COMMANDS: edit.selectAll selects every node', () => {
  assertDelegates('edit.selectAll', 'selectAll')
})

// CONTRACT: "`edit.delete > run(s)` — Delete the selected nodes and any edges attached to them."
test('COMMANDS: edit.delete deletes the selection', () => {
  assertDelegates('edit.delete', 'deleteSelected')
})

// CONTRACT: "Add a node of this command's type at the pointer." + "Reads external mutable state:
// The captured `type` from the enclosing NODE_TYPES entry."
// (src/components/nodes.jsx constants: "`nodeTypes` — Keys: `driver`, `chamber`, `waveguide`,
// `pr`, `radiation`" — the same suffixes the add.* command ids carry.)
test('COMMANDS: each add.* command adds a node of its own type at the cursor', () => {
  for (const id of ADD_COMMAND_IDS) {
    assertDelegates(id, 'addNodeAtCursor', [id.slice('add.'.length)])
  }
})

// CONTRACT: "`drive.up > run(s)` — Raise the drive voltage by 1 V."
// (src/store.js: "nudgeVoltage(delta) — Change the drive voltage by a fixed step, for the
// keyboard shortcuts. `delta` — Change in volts; negative lowers.")
test('COMMANDS: drive.up raises the drive voltage by 1 V', () => {
  assertDelegates('drive.up', 'nudgeVoltage', [1])
})

// CONTRACT: "`drive.down > run(s)` — Lower the drive voltage by 1 V."
test('COMMANDS: drive.down lowers the drive voltage by 1 V', () => {
  assertDelegates('drive.down', 'nudgeVoltage', [-1])
})

// CONTRACT: "`drive.upFine > run(s)` — Raise the drive voltage by 0.1 V."
test('COMMANDS: drive.upFine raises the drive voltage by 0.1 V', () => {
  assertDelegates('drive.upFine', 'nudgeVoltage', [0.1])
})

// CONTRACT: "`drive.downFine > run(s)` — Lower the drive voltage by 0.1 V."
test('COMMANDS: drive.downFine lowers the drive voltage by 0.1 V', () => {
  assertDelegates('drive.downFine', 'nudgeVoltage', [-0.1])
})

// CONTRACT: "`project.new > run(s)` — Add an empty project to the workspace and open it."
test('COMMANDS: project.new adds a project to the workspace', () => {
  assertDelegates('project.new', 'newFile', [''])
})

// CONTRACT: "`project.save > run(s)` — Download the project as an `.speakerspice.json` file."
test('COMMANDS: project.save downloads the project', () => {
  assertDelegates('project.save', 'saveProjectJSON')
})

// CONTRACT: "`sim.snapshot > run(s)` — Freeze the current result as a labelled reference overlay."
test('COMMANDS: sim.snapshot takes a snapshot', () => {
  assertDelegates('sim.snapshot', 'takeSnapshot')
})

// CONTRACT: "`sim.mask > run(s)` — Toggle chambers between distributed lines and lumped
// compliances." + "Reads external mutable state: The current `settings.masking` value, which it
// inverts." (src/store.js: "updateSettings(patch)")
test('COMMANDS: sim.mask inverts the current masking setting', () => {
  for (const start of [false, true]) {
    const { calls } = runCommand('sim.mask', { settings: { masking: start, drive: 2.83 } })
    const hit = calls.find((c) => c.name === 'updateSettings')
    assert.ok(hit, `sim.mask did not update the settings (called ${JSON.stringify(calls.map((c) => c.name))})`)
    assert.equal(hit.args[0].masking, !start, `masking must be inverted from ${start}`)
  }
})

// CONTRACT: "`sim.recompute > run(s)` — Force a resimulation without changing anything."
test('COMMANDS: sim.recompute forces a resimulation', () => {
  assertDelegates('sim.recompute', 'recomputeNow')
})

// CONTRACT: "`view.settings > run(s)` — Open the settings window."
// (src/store.js: "setShowSettings(v, section) — `v` — Whether to show the window.")
test('COMMANDS: view.settings opens the settings window', () => {
  const { calls } = runCommand('view.settings')
  const hit = calls.find((c) => c.name === 'setShowSettings')
  assert.ok(hit, `view.settings did not open the window (called ${JSON.stringify(calls.map((c) => c.name))})`)
  assert.equal(hit.args[0], true, 'view.settings must show the window, not hide it')
})

// CONTRACT: "`view.maximize > run(s)` — Maximize the focused panel, or restore the one already
// maximized." + "Reads external mutable state: `maximized` and `focusedPanel`, so the same key
// both maximizes and restores." (src/store.js: "toggleMaximize(id)")
test('COMMANDS: view.maximize toggles the focused panel', () => {
  assertDelegates('view.maximize', 'toggleMaximize', ['spl'], { focusedPanel: 'spl', maximized: null })
})

// CONTRACT: "Maximize the focused panel, or restore the one already maximized." — the same key
// restores when a panel is already maximized.
test('COMMANDS: view.maximize restores the panel that is already maximized', () => {
  const { calls } = runCommand('view.maximize', { focusedPanel: 'spl', maximized: 'spl' })
  const hit = calls.find((c) => c.name === 'toggleMaximize')
  assert.ok(hit, 'view.maximize must still delegate when a panel is maximized')
  assert.equal(hit.args[0], 'spl')
})

// CONTRACT: "`view.popout > run(s)` — Pop the focused panel out into its own browser tab." +
// "Reads external mutable state: `focusedPanel` to decide what to pop out."
// (src/store.js: "popOutPanel(id)")
test('COMMANDS: view.popout pops out the focused panel', () => {
  assertDelegates('view.popout', 'popOutPanel', ['zin'], { focusedPanel: 'zin' })
})

// CONTRACT: "Delegates to the store, mutating application state." (every command)
test('COMMANDS: every command delegates at least one call to the store state it is given', () => {
  for (const id of DEFAULT_BINDING_KEYS) {
    const { calls } = runCommand(id)
    assert.ok(calls.length > 0, `command ${id} delegated nothing to the store`)
  }
})
