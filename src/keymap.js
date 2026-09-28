// Keyboard commands and their bindings.
//
// One registry drives everything: the global key handler, the shortcut hints
// in the menus, and the rebinding UI in Settings ▸ Keyboard. Adding a command
// means one entry in COMMANDS and one default in DEFAULT_BINDINGS — nothing
// else needs to change.
//
// A combo is a lowercase string like `mod+shift+z`. `mod` is Ctrl on
// Windows/Linux and Command on macOS; Ctrl and Command are treated as the same
// modifier so one default set fits both platforms.
//
// Keys come from `event.code` (the physical key) rather than `event.key`, so a
// binding does not change meaning when Shift is held — `shift+1` stays
// `shift+1` instead of becoming `!`.
//
// Every command carries a `scope`, one of exactly two values:
//
//   global   fires wherever focus is
//   canvas   fires only while the Node Editor — panel id `canvas` — holds
//            focus, so the Nonlinear Lab and the charts keep Delete, Ctrl+C
//            and the bare letter keys for themselves
//
// No command fires while a text field has focus, whatever its scope. Where a
// canvas-scoped and a global command share a combo, the canvas one wins while
// the Node Editor has focus and the global one applies everywhere else — which
// is what `resolve` implements and what `findConflict` treats as a collision.

/**
 * Whether this browser is running on an Apple platform.
 *
 * Decides only how combos are *displayed* — Ctrl and Command are treated as one
 * modifier when matching, so a single default set fits both platforms.
 */
export const IS_MAC = typeof navigator !== 'undefined'
  && /mac|iphone|ipad/i.test(navigator.platform || navigator.userAgent || '')

// ---------- commands ----------

/** Node types that get a bare-letter add shortcut, paired with their menu label. */
const NODE_TYPES = [
  ['driver', 'Driver'],
  ['chamber', 'Chamber'],
  ['waveguide', 'Waveguide Segment'],
  ['pr', 'Passive Radiator'],
  ['radiation', 'Radiation Termination'],
]

export const COMMANDS = {
  'edit.undo': {
    label: 'Undo',
    group: 'Edit',
    scope: 'global',
    /**
     * Step back one entry in the undo history.
     * @param {object} s - The store state, with actions bound.
     * @returns {*} Whatever the store action returns; the key handler ignores it.
     * @sideEffect Delegates to the store, mutating application state.
     */
    run: (s) => s.undo(),
  },
  'edit.redo': {
    label: 'Redo',
    group: 'Edit',
    scope: 'global',
    /**
     * Step forward one entry in the undo history.
     * @param {object} s - The store state, with actions bound.
     * @returns {*} Whatever the store action returns; the key handler ignores it.
     * @sideEffect Delegates to the store, mutating application state.
     */
    run: (s) => s.redo(),
  },
  'edit.cut': {
    label: 'Cut nodes',
    group: 'Edit',
    scope: 'canvas',
    /**
     * Copy the selected nodes to the clipboard and delete them.
     * @param {object} s - The store state, with actions bound.
     * @returns {*} Whatever the store action returns; the key handler ignores it.
     * @sideEffect Delegates to the store, mutating application state.
     */
    run: (s) => s.cutSelection(),
  },
  'edit.copy': {
    label: 'Copy nodes',
    group: 'Edit',
    scope: 'canvas',
    /**
     * Copy the selected nodes and the edges wholly inside the selection.
     * @param {object} s - The store state, with actions bound.
     * @returns {*} Whatever the store action returns; the key handler ignores it.
     * @sideEffect Delegates to the store, mutating application state.
     */
    run: (s) => s.copySelection(),
  },
  'edit.paste': {
    label: 'Paste nodes',
    group: 'Edit',
    scope: 'canvas',
    /**
     * Paste the clipboard as new nodes, offset from the originals.
     * @param {object} s - The store state, with actions bound.
     * @returns {*} Whatever the store action returns; the key handler ignores it.
     * @sideEffect Delegates to the store, mutating application state.
     */
    run: (s) => s.pasteClipboard(),
  },
  'edit.duplicate': {
    label: 'Duplicate selection',
    group: 'Edit',
    scope: 'canvas',
    /**
     * Copy and immediately paste the selection in one step.
     * @param {object} s - The store state, with actions bound.
     * @returns {*} Whatever the store action returns; the key handler ignores it.
     * @sideEffect Delegates to the store, mutating application state.
     */
    run: (s) => s.duplicateSelected(),
  },
  'edit.selectAll': {
    label: 'Select all nodes',
    group: 'Edit',
    scope: 'canvas',
    /**
     * Select every node on the canvas.
     * @param {object} s - The store state, with actions bound.
     * @returns {*} Whatever the store action returns; the key handler ignores it.
     * @sideEffect Delegates to the store, mutating application state.
     */
    run: (s) => s.selectAll(),
  },
  'edit.delete': {
    label: 'Delete selection',
    group: 'Edit',
    scope: 'canvas',
    /**
     * Delete the selected nodes and any edges attached to them.
     * @param {object} s - The store state, with actions bound.
     * @returns {*} Whatever the store action returns; the key handler ignores it.
     * @sideEffect Delegates to the store, mutating application state.
     */
    run: (s) => s.deleteSelected(),
  },

  ...Object.fromEntries(NODE_TYPES.map(([type, label]) => [
    `add.${type}`,
    {
      label: `Add ${label}`,
      group: 'Add node',
      scope: 'canvas',
      /**
       * Add a node of this command's type at the pointer.
       * @param {object} s - The store state, with actions bound.
       * @returns {*} Whatever the store action returns; the key handler ignores it.
       * @sideEffect Adds a node to the graph, which triggers a resimulation.
       * @reads The captured `type` from the enclosing NODE_TYPES entry.
       */
      run: (s) => s.addNodeAtCursor(type),
    },
  ])),

  'drive.up': {
    label: 'Drive +1 V',
    group: 'Drive level',
    scope: 'global',
    /**
     * Raise the drive voltage by 1 V.
     * @param {object} s - The store state, with actions bound.
     * @returns {*} Whatever the store action returns; the key handler ignores it.
     * @sideEffect Changes the drive setting, which triggers a resimulation.
     */
    run: (s) => s.nudgeVoltage(1),
  },
  'drive.down': {
    label: 'Drive −1 V',
    group: 'Drive level',
    scope: 'global',
    /**
     * Lower the drive voltage by 1 V.
     * @param {object} s - The store state, with actions bound.
     * @returns {*} Whatever the store action returns; the key handler ignores it.
     * @sideEffect Changes the drive setting, which triggers a resimulation.
     */
    run: (s) => s.nudgeVoltage(-1),
  },
  'drive.upFine': {
    label: 'Drive +0.1 V',
    group: 'Drive level',
    scope: 'global',
    /**
     * Raise the drive voltage by 0.1 V.
     * @param {object} s - The store state, with actions bound.
     * @returns {*} Whatever the store action returns; the key handler ignores it.
     * @sideEffect Changes the drive setting, which triggers a resimulation.
     */
    run: (s) => s.nudgeVoltage(0.1),
  },
  'drive.downFine': {
    label: 'Drive −0.1 V',
    group: 'Drive level',
    scope: 'global',
    /**
     * Lower the drive voltage by 0.1 V.
     * @param {object} s - The store state, with actions bound.
     * @returns {*} Whatever the store action returns; the key handler ignores it.
     * @sideEffect Changes the drive setting, which triggers a resimulation.
     */
    run: (s) => s.nudgeVoltage(-0.1),
  },

  'project.new': {
    label: 'New project',
    group: 'Project',
    scope: 'global',
    /**
     * Add an empty project to the workspace and open it.
     * @param {object} s - The store state, with actions bound.
     * @returns {*} Whatever the store action returns; the key handler ignores it.
     * @sideEffect Creates a workspace file, replaces the whole project state and clears the undo history.
     */
    run: (s) => s.newFile(''),
  },
  'project.save': {
    label: 'Export project as JSON',
    group: 'Project',
    scope: 'global',
    /**
     * Download the project as an `.speakerspice.json` file.
     * @param {object} s - The store state, with actions bound.
     * @returns {*} Whatever the store action returns; the key handler ignores it.
     * @sideEffect Triggers a browser download.
     */
    run: (s) => s.saveProjectJSON(),
  },
  'sim.snapshot': {
    label: 'Take snapshot',
    group: 'Simulate',
    scope: 'global',
    /**
     * Freeze the current result as a labelled reference overlay.
     * @param {object} s - The store state, with actions bound.
     * @returns {*} Whatever the store action returns; the key handler ignores it.
     * @sideEffect Appends to the snapshot list, which redraws every chart.
     */
    run: (s) => s.takeSnapshot(),
  },
  'sim.mask': {
    label: 'Toggle resonance masking',
    group: 'Simulate',
    scope: 'global',
    /**
     * Toggle chambers between distributed lines and lumped compliances.
     * @param {object} s - The store state, with actions bound.
     * @returns {*} Whatever the store action returns; the key handler ignores it.
     * @sideEffect Changes a sweep setting, which triggers a resimulation.
     * @reads The current `settings.masking` value, which it inverts.
     */
    run: (s) => s.updateSettings({ masking: !s.settings.masking }),
  },
  'sim.recompute': {
    label: 'Recompute now',
    group: 'Simulate',
    scope: 'global',
    /**
     * Force a resimulation without changing anything.
     * @param {object} s - The store state, with actions bound.
     * @returns {*} Whatever the store action returns; the key handler ignores it.
     * @sideEffect Runs the solver.
     */
    run: (s) => s.recomputeNow(),
  },

  'view.settings': {
    label: 'Open settings',
    group: 'View',
    scope: 'global',
    /**
     * Open the settings window.
     * @param {object} s - The store state, with actions bound.
     * @returns {*} Whatever the store action returns; the key handler ignores it.
     * @sideEffect Shows a floating window.
     */
    run: (s) => s.setShowSettings(true),
  },
  'view.maximize': {
    label: 'Maximize / restore panel',
    group: 'View',
    scope: 'global',
    /**
     * Maximize the focused panel, or restore the one already maximized.
     * @param {object} s - The store state, with actions bound.
     * @returns {*} Whatever the store action returns; the key handler ignores it.
     * @sideEffect Changes the dock layout.
     * @reads `maximized` and `focusedPanel`, so the same key both maximizes and restores.
     */
    run: (s) => s.toggleMaximize(s.maximized || s.focusedPanel),
  },
  'view.timedomain': {
    label: 'Time domain & distortion',
    group: 'View',
    scope: 'global',
    /**
     * Open the time-domain workspace, or return to the editor from it.
     * @param {object} s - The store state, with actions bound.
     * @returns {*} Whatever the store action returns; the key handler ignores it.
     * @sideEffect Swaps the dock and the time-domain view.
     * @reads `tdOpen`.
     */
    run: (s) => (s.tdOpen ? s.closeTimeDomain() : s.openTimeDomain()),
  },
  'view.popout': {
    label: 'Open focused panel in a new tab',
    group: 'View',
    scope: 'global',
    /**
     * Pop the focused panel out into its own browser tab.
     * @param {object} s - The store state, with actions bound.
     * @returns {*} Whatever the store action returns; the key handler ignores it.
     * @sideEffect Opens a browser window and removes the panel from the dock.
     * @reads `focusedPanel` to decide what to pop out.
     */
    run: (s) => s.popOutPanel(s.focusedPanel),
  },
}

/** Every command id, in declaration order. The iteration order for lookups and the rebinding UI. */
export const COMMAND_IDS = Object.keys(COMMANDS)

/**
 * Commands bundled into their display groups, as `[groupName, commandIds]` pairs.
 *
 * Built by reduction rather than declared, so a new command joins its group
 * automatically and groups appear in the order their first command does.
 */
export const COMMAND_GROUPS = COMMAND_IDS.reduce((acc, id) => {
  const g = COMMANDS[id].group
  if (!acc.some(([name]) => name === g)) acc.push([g, []])
  acc.find(([name]) => name === g)[1].push(id)
  return acc
}, [])

/**
 * The default combo (or combos) for each command.
 *
 * Bare letters are safe here because canvas-scoped commands never fire while a
 * text field has focus, and they make placing a chain of elements fast.
 */
export const DEFAULT_BINDINGS = {
  'edit.undo': ['mod+z'],
  'edit.redo': ['mod+shift+z', 'mod+y'],
  'edit.cut': ['mod+x'],
  'edit.copy': ['mod+c'],
  'edit.paste': ['mod+v'],
  'edit.duplicate': ['mod+d'],
  'edit.selectAll': ['mod+a'],
  'edit.delete': ['delete', 'backspace'],

  'add.driver': ['d'],
  'add.chamber': ['c'],
  'add.waveguide': ['w'],
  'add.pr': ['p'],
  'add.radiation': ['r'],

  'drive.up': ['alt+up'],
  'drive.down': ['alt+down'],
  'drive.upFine': ['alt+shift+up'],
  'drive.downFine': ['alt+shift+down'],

  'project.new': ['mod+n'],
  'project.save': ['mod+s'],

  'sim.snapshot': ['alt+s'],
  'sim.mask': ['alt+m'],
  'sim.recompute': ['mod+enter'],

  'view.settings': ['mod+,'],
  'view.maximize': ['alt+enter'],
  'view.popout': ['alt+o'],
  'view.timedomain': ['alt+t'],
}

// ---------- combos ----------

/**
 * Physical `event.code` values mapped to the names used inside a combo string.
 *
 * Only keys whose code is not mechanically derivable need an entry; letters,
 * digits, numpad digits and function keys are handled by pattern in
 * `keyFromEvent`.
 */
const CODE_MAP = {
  ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
  Minus: '-', Equal: '=', BracketLeft: '[', BracketRight: ']', Backslash: '\\',
  Semicolon: ';', Quote: "'", Comma: ',', Period: '.', Slash: '/', Backquote: '`',
  Space: 'space', Enter: 'enter', NumpadEnter: 'enter', Escape: 'esc',
  Backspace: 'backspace', Delete: 'delete', Tab: 'tab',
  Home: 'home', End: 'end', PageUp: 'pageup', PageDown: 'pagedown',
  NumpadAdd: '=', NumpadSubtract: '-',
}

/** Keys that only ever modify another key, and so can never be a combo's subject. */
const MODIFIER_KEYS = new Set(['Control', 'Shift', 'Alt', 'Meta'])

/**
 * Reduce a keyboard event to the key name used in a combo string.
 *
 * Reads `event.code` — the physical key — rather than `event.key`, so a binding
 * does not change meaning when Shift is held: `shift+1` stays `shift+1` instead
 * of becoming `!`. Layouts whose code is unrecognised fall back to the
 * character, which keeps non-US keyboards bindable even if not shift-stable.
 *
 * @param {KeyboardEvent} e - The event.
 * @returns {string|null} The key name, or `null` when the event is a bare modifier press or carries no usable key.
 * @pure
 */
export function keyFromEvent(e) {
  if (MODIFIER_KEYS.has(e.key)) return null
  const c = e.code || ''
  if (/^Key[A-Z]$/.test(c)) return c.slice(3).toLowerCase()
  if (/^Digit[0-9]$/.test(c)) return c.slice(5)
  if (/^Numpad[0-9]$/.test(c)) return `num${c.slice(6)}`
  if (/^F\d{1,2}$/.test(c)) return c.toLowerCase()
  if (CODE_MAP[c]) return CODE_MAP[c]
  // layouts whose physical code we don't recognise still bind by character
  return e.key && e.key.length === 1 ? e.key.toLowerCase() : null
}

/**
 * Build the canonical combo string for a keyboard event.
 *
 * Modifiers are emitted in a fixed order — `mod`, `alt`, `shift` — so the same
 * physical chord always produces the same string and combos can be compared as
 * plain strings. Ctrl and Command both map to `mod`.
 *
 * @param {KeyboardEvent} e - The event.
 * @returns {string|null} A combo like `mod+shift+z`, or `null` when the event has no bindable key.
 * @pure
 */
export function comboFromEvent(e) {
  const key = keyFromEvent(e)
  if (!key) return null
  const parts = []
  if (e.ctrlKey || e.metaKey) parts.push('mod')
  if (e.altKey) parts.push('alt')
  if (e.shiftKey) parts.push('shift')
  parts.push(key)
  return parts.join('+')
}

/** Combo parts rewritten for display, using Apple's glyphs on macOS. */
const DISPLAY = {
  mod: IS_MAC ? '⌘' : 'Ctrl',
  alt: IS_MAC ? '⌥' : 'Alt',
  shift: IS_MAC ? '⇧' : 'Shift',
  up: '↑', down: '↓', left: '←', right: '→',
  enter: 'Enter', esc: 'Esc', space: 'Space', tab: 'Tab',
  delete: 'Del', backspace: 'Backspace',
  pageup: 'PgUp', pagedown: 'PgDn', home: 'Home', end: 'End',
}

/**
 * Render a combo for display in a menu or the rebinding UI.
 *
 * macOS joins the parts without separators (⌘⇧Z), every other platform uses
 * `+` (Ctrl+Shift+Z).
 *
 * @param {string|null|undefined} combo - A combo string.
 * @returns {string} The display form, or `''` when there is no binding.
 * @reads `IS_MAC`, which is fixed for the session but derived from the environment rather than the argument.
 */
export function formatCombo(combo) {
  if (!combo) return ''
  const parts = combo.split('+').map((p) => DISPLAY[p] || (p.length === 1 ? p.toUpperCase() : p))
  return IS_MAC ? parts.join('') : parts.join('+')
}

// ---------- stored bindings ----------

/** LocalStorage key holding the user's binding overrides. */
export const KEYMAP_KEY = 'speakerspice:keymap'

/**
 * Load the effective bindings: stored overrides layered over the defaults.
 *
 * Only differences are persisted, so a command the user never touched picks up
 * any later change to its default instead of being frozen at whatever it was
 * when they first opened Settings.
 *
 * Every command is given an entry whether or not it was stored, and stored
 * values are filtered to strings, so the result is always complete and
 * well-typed however corrupt the stored object is.
 *
 * @returns {Object<string, string[]>} Combos for every command id in `COMMAND_IDS`.
 * @sideEffect Reads LocalStorage; falls back to the defaults if it is unreadable or corrupt.
 */
export function loadBindings() {
  let overrides = {}
  try {
    const raw = JSON.parse(localStorage.getItem(KEYMAP_KEY))
    if (raw && typeof raw === 'object') overrides = raw
  } catch { /* corrupt — fall back to the defaults */ }
  const out = {}
  for (const id of COMMAND_IDS) {
    const v = overrides[id]
    out[id] = Array.isArray(v) ? v.filter((c) => typeof c === 'string') : [...(DEFAULT_BINDINGS[id] || [])]
  }
  return out
}

/**
 * Persist the bindings that differ from the defaults.
 *
 * When nothing differs the key is removed rather than written as an empty
 * object, so a user who resets everything goes back to tracking future default
 * changes.
 *
 * @param {Object<string, string[]>} bindings - The complete current binding set.
 * @returns {void}
 * @sideEffect Writes to or removes from LocalStorage. A quota failure is swallowed: losing a shortcut preference should not break the app.
 */
export function saveBindings(bindings) {
  const diff = {}
  for (const id of COMMAND_IDS) {
    const def = DEFAULT_BINDINGS[id] || []
    const cur = bindings[id] || []
    if (cur.length !== def.length || cur.some((c, i) => c !== def[i])) diff[id] = cur
  }
  try {
    if (Object.keys(diff).length) localStorage.setItem(KEYMAP_KEY, JSON.stringify(diff))
    else localStorage.removeItem(KEYMAP_KEY)
  } catch { /* quota */ }
}

/**
 * Find the command that would fight `exceptId` over a combo.
 *
 * Two commands can share a combo when their scopes can never both be active —
 * but a canvas-scoped binding and a global one *would* both want the key while
 * the canvas has focus, so that counts as a conflict.
 *
 * @param {Object<string, string[]>} bindings - The current binding set.
 * @param {string} combo - The combo being assigned.
 * @param {string} exceptId - The command being rebound, which cannot conflict with itself.
 * @returns {string|null} The id of the conflicting command, or `null` when the combo is free.
 * @pure
 */
export function findConflict(bindings, combo, exceptId) {
  const scope = COMMANDS[exceptId]?.scope
  for (const id of COMMAND_IDS) {
    if (id === exceptId) continue
    if (!bindings[id]?.includes(combo)) continue
    // a canvas-scoped binding and a global one with the same combo would both
    // want the key while the canvas has focus, so treat that as a conflict too
    if (COMMANDS[id].scope === scope || scope === 'global' || COMMANDS[id].scope === 'global') return id
  }
  return null
}

/**
 * Resolve a combo to the command that should run, given what has focus.
 *
 * The more specific scope wins: a canvas-scoped binding takes the key while the
 * Node Editor has focus, and the global command bound to the same combo runs
 * everywhere else. This is what lets `Ctrl+C` copy nodes on the canvas without
 * stealing copy from the rest of the app.
 *
 * @param {Object<string, string[]>} bindings - The current binding set.
 * @param {string} combo - The combo that was pressed.
 * @param {string|null} focusedPanel - Id of the focused panel.
 * @returns {string|null} The command id to run, or `null` when nothing is bound to that combo.
 * @pure
 */
export function resolve(bindings, combo, focusedPanel) {
  let fallback = null
  for (const id of COMMAND_IDS) {
    if (!bindings[id]?.includes(combo)) continue
    const scope = COMMANDS[id].scope
    if (scope === 'canvas') {
      if (focusedPanel === 'canvas') return id // the more specific scope wins
    } else if (!fallback) fallback = id
  }
  return fallback
}
