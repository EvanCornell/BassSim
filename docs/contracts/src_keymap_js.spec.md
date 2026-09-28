# Contract specification: `src/keymap.js`

> Generated from method contracts. This file contains **no implementation code**.
> Write tests against what is claimed here, not against what you expect the code to do.

## Module

Keyboard commands and their bindings.

One registry drives everything: the global key handler, the shortcut hints
in the menus, and the rebinding UI in Settings ▸ Keyboard. Adding a command
means one entry in COMMANDS and one default in DEFAULT_BINDINGS — nothing
else needs to change.

A combo is a lowercase string like `mod+shift+z`. `mod` is Ctrl on
Windows/Linux and Command on macOS; Ctrl and Command are treated as the same
modifier so one default set fits both platforms.

Keys come from `event.code` (the physical key) rather than `event.key`, so a
binding does not change meaning when Shift is held — `shift+1` stays
`shift+1` instead of becoming `!`.

Every command carries a `scope`, one of exactly two values:

  global   fires wherever focus is
  canvas   fires only while the Node Editor — panel id `canvas` — holds
           focus, so the Nonlinear Lab and the charts keep Delete, Ctrl+C
           and the bare letter keys for themselves

No command fires while a text field has focus, whatever its scope. Where a
canvas-scoped and a global command share a combo, the canvas one wins while
the Node Editor has focus and the global one applies everywhere else — which
is what `resolve` implements and what `findConflict` treats as a collision.

## Exported constants

Names this module publishes that are not methods. The method contracts
above and below refer to these by role — a command, a node type, a panel —
so this is the vocabulary they assume.

### `IS_MAC`

Whether this browser is running on an Apple platform.

Decides only how combos are *displayed* — Ctrl and Command are treated as one
modifier when matching, so a single default set fits both platforms.

### `COMMANDS`

Keys: `edit.undo`, `edit.redo`, `edit.cut`, `edit.copy`, `edit.paste`, `edit.duplicate`, `edit.selectAll`, `edit.delete`, `drive.up`, `drive.down`, `drive.upFine`, `drive.downFine`, `project.new`, `project.save`, `sim.snapshot`, `sim.mask`, `sim.recompute`, `view.settings`, `view.maximize`, `view.timedomain`, `view.popout`

**This list is incomplete.** Further keys are added at construction
time and are not visible in the source declaration, so treat it as a
subset rather than the full set.

- `edit.undo` holds: `label`, `group`, `scope`, `run`
- `edit.redo` holds: `label`, `group`, `scope`, `run`
- `edit.cut` holds: `label`, `group`, `scope`, `run`
- `edit.copy` holds: `label`, `group`, `scope`, `run`
- `edit.paste` holds: `label`, `group`, `scope`, `run`
- `edit.duplicate` holds: `label`, `group`, `scope`, `run`
- `edit.selectAll` holds: `label`, `group`, `scope`, `run`
- `edit.delete` holds: `label`, `group`, `scope`, `run`
- `drive.up` holds: `label`, `group`, `scope`, `run`
- `drive.down` holds: `label`, `group`, `scope`, `run`
- `drive.upFine` holds: `label`, `group`, `scope`, `run`
- `drive.downFine` holds: `label`, `group`, `scope`, `run`
- `project.new` holds: `label`, `group`, `scope`, `run`
- `project.save` holds: `label`, `group`, `scope`, `run`
- `sim.snapshot` holds: `label`, `group`, `scope`, `run`
- `sim.mask` holds: `label`, `group`, `scope`, `run`
- `sim.recompute` holds: `label`, `group`, `scope`, `run`
- `view.settings` holds: `label`, `group`, `scope`, `run`
- `view.maximize` holds: `label`, `group`, `scope`, `run`
- `view.timedomain` holds: `label`, `group`, `scope`, `run`
- `view.popout` holds: `label`, `group`, `scope`, `run`

### `COMMAND_IDS`

Every command id, in declaration order. The iteration order for lookups and the rebinding UI.

### `COMMAND_GROUPS`

Commands bundled into their display groups, as `[groupName, commandIds]` pairs.

Built by reduction rather than declared, so a new command joins its group
automatically and groups appear in the order their first command does.

### `DEFAULT_BINDINGS`

The default combo (or combos) for each command.

Bare letters are safe here because canvas-scoped commands never fire while a
text field has focus, and they make placing a chain of elements fast.

Keys: `edit.undo`, `edit.redo`, `edit.cut`, `edit.copy`, `edit.paste`, `edit.duplicate`, `edit.selectAll`, `edit.delete`, `add.driver`, `add.chamber`, `add.waveguide`, `add.pr`, `add.radiation`, `drive.up`, `drive.down`, `drive.upFine`, `drive.downFine`, `project.new`, `project.save`, `sim.snapshot`, `sim.mask`, `sim.recompute`, `view.settings`, `view.maximize`, `view.popout`, `view.timedomain`

### `KEYMAP_KEY`

LocalStorage key holding the user's binding overrides.

Value: `"speakerspice:keymap"`

## EXPORTED (7)

### `keyFromEvent(e)`

- **Reachability:** EXPORTED
- **Obtain via:** import { keyFromEvent } from '../../src/keymap.js'

Reduce a keyboard event to the key name used in a combo string.

Reads `event.code` — the physical key — rather than `event.key`, so a binding
does not change meaning when Shift is held: `shift+1` stays `shift+1` instead
of becoming `!`. Layouts whose code is unrecognised fall back to the
character, which keeps non-US keyboards bindable even if not shift-stable.

**Parameters**

- `e` — `KeyboardEvent` — The event.

**Returns**

- `string|null` — The key name, or `null` when the event is a bare modifier press or carries no usable key.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `comboFromEvent(e)`

- **Reachability:** EXPORTED
- **Obtain via:** import { comboFromEvent } from '../../src/keymap.js'

Build the canonical combo string for a keyboard event.

Modifiers are emitted in a fixed order — `mod`, `alt`, `shift` — so the same
physical chord always produces the same string and combos can be compared as
plain strings. Ctrl and Command both map to `mod`.

**Parameters**

- `e` — `KeyboardEvent` — The event.

**Returns**

- `string|null` — A combo like `mod+shift+z`, or `null` when the event has no bindable key.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `formatCombo(combo)`

- **Reachability:** EXPORTED
- **Obtain via:** import { formatCombo } from '../../src/keymap.js'

Render a combo for display in a menu or the rebinding UI.

macOS joins the parts without separators (⌘⇧Z), every other platform uses
`+` (Ctrl+Shift+Z).

**Parameters**

- `combo` — `string|null|undefined` — A combo string.

**Returns**

- `string` — The display form, or `''` when there is no binding.

**Reads external mutable state**

- `IS_MAC`, which is fixed for the session but derived from the environment rather than the argument.

### `loadBindings()`

- **Reachability:** EXPORTED
- **Obtain via:** import { loadBindings } from '../../src/keymap.js'

Load the effective bindings: stored overrides layered over the defaults.

Only differences are persisted, so a command the user never touched picks up
any later change to its default instead of being frozen at whatever it was
when they first opened Settings.

Every command is given an entry whether or not it was stored, and stored
values are filtered to strings, so the result is always complete and
well-typed however corrupt the stored object is.

**Returns**

- `Object<string, string[]>` — Combos for every command id in `COMMAND_IDS`.

**Side effects**

- Reads LocalStorage; falls back to the defaults if it is unreadable or corrupt.

### `saveBindings(bindings)`

- **Reachability:** EXPORTED
- **Obtain via:** import { saveBindings } from '../../src/keymap.js'

Persist the bindings that differ from the defaults.

When nothing differs the key is removed rather than written as an empty
object, so a user who resets everything goes back to tracking future default
changes.

**Parameters**

- `bindings` — `Object<string, string[]>` — The complete current binding set.

**Returns**

- `void`

**Side effects**

- Writes to or removes from LocalStorage. A quota failure is swallowed: losing a shortcut preference should not break the app.

### `findConflict(bindings, combo, exceptId)`

- **Reachability:** EXPORTED
- **Obtain via:** import { findConflict } from '../../src/keymap.js'

Find the command that would fight `exceptId` over a combo.

Two commands can share a combo when their scopes can never both be active —
but a canvas-scoped binding and a global one *would* both want the key while
the canvas has focus, so that counts as a conflict.

**Parameters**

- `bindings` — `Object<string, string[]>` — The current binding set.
- `combo` — `string` — The combo being assigned.
- `exceptId` — `string` — The command being rebound, which cannot conflict with itself.

**Returns**

- `string|null` — The id of the conflicting command, or `null` when the combo is free.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

### `resolve(bindings, combo, focusedPanel)`

- **Reachability:** EXPORTED
- **Obtain via:** import { resolve } from '../../src/keymap.js'

Resolve a combo to the command that should run, given what has focus.

The more specific scope wins: a canvas-scoped binding takes the key while the
Node Editor has focus, and the global command bound to the same combo runs
everywhere else. This is what lets `Ctrl+C` copy nodes on the canvas without
stealing copy from the rest of the app.

**Parameters**

- `bindings` — `Object<string, string[]>` — The current binding set.
- `combo` — `string` — The combo that was pressed.
- `focusedPanel` — `string|null` — Id of the focused panel.

**Returns**

- `string|null` — The command id to run, or `null` when nothing is bound to that combo.

**Purity:** `@pure` — no side effects, no dependence on external mutable state, and deterministic in its arguments. Calling it twice with equal inputs must produce equal output and change nothing observable.

## COMMAND (22)

### `edit.undo > run(s)`

- **Reachability:** COMMAND
- **Obtain via:** import { COMMANDS } from '../../src/keymap.js'  →  COMMANDS['<id>'].run(storeState)

Step back one entry in the undo history.

**Parameters**

- `s` — `object` — The store state, with actions bound.

**Returns**

- `*` — Whatever the store action returns; the key handler ignores it.

**Side effects**

- Delegates to the store, mutating application state.

### `edit.redo > run(s)`

- **Reachability:** COMMAND
- **Obtain via:** import { COMMANDS } from '../../src/keymap.js'  →  COMMANDS['<id>'].run(storeState)

Step forward one entry in the undo history.

**Parameters**

- `s` — `object` — The store state, with actions bound.

**Returns**

- `*` — Whatever the store action returns; the key handler ignores it.

**Side effects**

- Delegates to the store, mutating application state.

### `edit.cut > run(s)`

- **Reachability:** COMMAND
- **Obtain via:** import { COMMANDS } from '../../src/keymap.js'  →  COMMANDS['<id>'].run(storeState)

Copy the selected nodes to the clipboard and delete them.

**Parameters**

- `s` — `object` — The store state, with actions bound.

**Returns**

- `*` — Whatever the store action returns; the key handler ignores it.

**Side effects**

- Delegates to the store, mutating application state.

### `edit.copy > run(s)`

- **Reachability:** COMMAND
- **Obtain via:** import { COMMANDS } from '../../src/keymap.js'  →  COMMANDS['<id>'].run(storeState)

Copy the selected nodes and the edges wholly inside the selection.

**Parameters**

- `s` — `object` — The store state, with actions bound.

**Returns**

- `*` — Whatever the store action returns; the key handler ignores it.

**Side effects**

- Delegates to the store, mutating application state.

### `edit.paste > run(s)`

- **Reachability:** COMMAND
- **Obtain via:** import { COMMANDS } from '../../src/keymap.js'  →  COMMANDS['<id>'].run(storeState)

Paste the clipboard as new nodes, offset from the originals.

**Parameters**

- `s` — `object` — The store state, with actions bound.

**Returns**

- `*` — Whatever the store action returns; the key handler ignores it.

**Side effects**

- Delegates to the store, mutating application state.

### `edit.duplicate > run(s)`

- **Reachability:** COMMAND
- **Obtain via:** import { COMMANDS } from '../../src/keymap.js'  →  COMMANDS['<id>'].run(storeState)

Copy and immediately paste the selection in one step.

**Parameters**

- `s` — `object` — The store state, with actions bound.

**Returns**

- `*` — Whatever the store action returns; the key handler ignores it.

**Side effects**

- Delegates to the store, mutating application state.

### `edit.selectAll > run(s)`

- **Reachability:** COMMAND
- **Obtain via:** import { COMMANDS } from '../../src/keymap.js'  →  COMMANDS['<id>'].run(storeState)

Select every node on the canvas.

**Parameters**

- `s` — `object` — The store state, with actions bound.

**Returns**

- `*` — Whatever the store action returns; the key handler ignores it.

**Side effects**

- Delegates to the store, mutating application state.

### `edit.delete > run(s)`

- **Reachability:** COMMAND
- **Obtain via:** import { COMMANDS } from '../../src/keymap.js'  →  COMMANDS['<id>'].run(storeState)

Delete the selected nodes and any edges attached to them.

**Parameters**

- `s` — `object` — The store state, with actions bound.

**Returns**

- `*` — Whatever the store action returns; the key handler ignores it.

**Side effects**

- Delegates to the store, mutating application state.

### `run(s)`

- **Reachability:** COMMAND
- **Obtain via:** import { COMMANDS } from '../../src/keymap.js'  →  COMMANDS['<id>'].run(storeState)

Add a node of this command's type at the pointer.

**Parameters**

- `s` — `object` — The store state, with actions bound.

**Returns**

- `*` — Whatever the store action returns; the key handler ignores it.

**Side effects**

- Adds a node to the graph, which triggers a resimulation.

**Reads external mutable state**

- The captured `type` from the enclosing NODE_TYPES entry.

### `drive.up > run(s)`

- **Reachability:** COMMAND
- **Obtain via:** import { COMMANDS } from '../../src/keymap.js'  →  COMMANDS['<id>'].run(storeState)

Raise the drive voltage by 1 V.

**Parameters**

- `s` — `object` — The store state, with actions bound.

**Returns**

- `*` — Whatever the store action returns; the key handler ignores it.

**Side effects**

- Changes the drive setting, which triggers a resimulation.

### `drive.down > run(s)`

- **Reachability:** COMMAND
- **Obtain via:** import { COMMANDS } from '../../src/keymap.js'  →  COMMANDS['<id>'].run(storeState)

Lower the drive voltage by 1 V.

**Parameters**

- `s` — `object` — The store state, with actions bound.

**Returns**

- `*` — Whatever the store action returns; the key handler ignores it.

**Side effects**

- Changes the drive setting, which triggers a resimulation.

### `drive.upFine > run(s)`

- **Reachability:** COMMAND
- **Obtain via:** import { COMMANDS } from '../../src/keymap.js'  →  COMMANDS['<id>'].run(storeState)

Raise the drive voltage by 0.1 V.

**Parameters**

- `s` — `object` — The store state, with actions bound.

**Returns**

- `*` — Whatever the store action returns; the key handler ignores it.

**Side effects**

- Changes the drive setting, which triggers a resimulation.

### `drive.downFine > run(s)`

- **Reachability:** COMMAND
- **Obtain via:** import { COMMANDS } from '../../src/keymap.js'  →  COMMANDS['<id>'].run(storeState)

Lower the drive voltage by 0.1 V.

**Parameters**

- `s` — `object` — The store state, with actions bound.

**Returns**

- `*` — Whatever the store action returns; the key handler ignores it.

**Side effects**

- Changes the drive setting, which triggers a resimulation.

### `project.new > run(s)`

- **Reachability:** COMMAND
- **Obtain via:** import { COMMANDS } from '../../src/keymap.js'  →  COMMANDS['<id>'].run(storeState)

Add an empty project to the workspace and open it.

**Parameters**

- `s` — `object` — The store state, with actions bound.

**Returns**

- `*` — Whatever the store action returns; the key handler ignores it.

**Side effects**

- Creates a workspace file, replaces the whole project state and clears the undo history.

### `project.save > run(s)`

- **Reachability:** COMMAND
- **Obtain via:** import { COMMANDS } from '../../src/keymap.js'  →  COMMANDS['<id>'].run(storeState)

Download the project as an `.speakerspice.json` file.

**Parameters**

- `s` — `object` — The store state, with actions bound.

**Returns**

- `*` — Whatever the store action returns; the key handler ignores it.

**Side effects**

- Triggers a browser download.

### `sim.snapshot > run(s)`

- **Reachability:** COMMAND
- **Obtain via:** import { COMMANDS } from '../../src/keymap.js'  →  COMMANDS['<id>'].run(storeState)

Freeze the current result as a labelled reference overlay.

**Parameters**

- `s` — `object` — The store state, with actions bound.

**Returns**

- `*` — Whatever the store action returns; the key handler ignores it.

**Side effects**

- Appends to the snapshot list, which redraws every chart.

### `sim.mask > run(s)`

- **Reachability:** COMMAND
- **Obtain via:** import { COMMANDS } from '../../src/keymap.js'  →  COMMANDS['<id>'].run(storeState)

Toggle chambers between distributed lines and lumped compliances.

**Parameters**

- `s` — `object` — The store state, with actions bound.

**Returns**

- `*` — Whatever the store action returns; the key handler ignores it.

**Side effects**

- Changes a sweep setting, which triggers a resimulation.

**Reads external mutable state**

- The current `settings.masking` value, which it inverts.

### `sim.recompute > run(s)`

- **Reachability:** COMMAND
- **Obtain via:** import { COMMANDS } from '../../src/keymap.js'  →  COMMANDS['<id>'].run(storeState)

Force a resimulation without changing anything.

**Parameters**

- `s` — `object` — The store state, with actions bound.

**Returns**

- `*` — Whatever the store action returns; the key handler ignores it.

**Side effects**

- Runs the solver.

### `view.settings > run(s)`

- **Reachability:** COMMAND
- **Obtain via:** import { COMMANDS } from '../../src/keymap.js'  →  COMMANDS['<id>'].run(storeState)

Open the settings window.

**Parameters**

- `s` — `object` — The store state, with actions bound.

**Returns**

- `*` — Whatever the store action returns; the key handler ignores it.

**Side effects**

- Shows a floating window.

### `view.maximize > run(s)`

- **Reachability:** COMMAND
- **Obtain via:** import { COMMANDS } from '../../src/keymap.js'  →  COMMANDS['<id>'].run(storeState)

Maximize the focused panel, or restore the one already maximized.

**Parameters**

- `s` — `object` — The store state, with actions bound.

**Returns**

- `*` — Whatever the store action returns; the key handler ignores it.

**Side effects**

- Changes the dock layout.

**Reads external mutable state**

- `maximized` and `focusedPanel`, so the same key both maximizes and restores.

### `view.timedomain > run(s)`

- **Reachability:** COMMAND
- **Obtain via:** import { COMMANDS } from '../../src/keymap.js'  →  COMMANDS['<id>'].run(storeState)

Open the time-domain workspace, or return to the editor from it.

**Parameters**

- `s` — `object` — The store state, with actions bound.

**Returns**

- `*` — Whatever the store action returns; the key handler ignores it.

**Side effects**

- Swaps the dock and the time-domain view.

**Reads external mutable state**

- `tdOpen`.

### `view.popout > run(s)`

- **Reachability:** COMMAND
- **Obtain via:** import { COMMANDS } from '../../src/keymap.js'  →  COMMANDS['<id>'].run(storeState)

Pop the focused panel out into its own browser tab.

**Parameters**

- `s` — `object` — The store state, with actions bound.

**Returns**

- `*` — Whatever the store action returns; the key handler ignores it.

**Side effects**

- Opens a browser window and removes the panel from the dock.

**Reads external mutable state**

- `focusedPanel` to decide what to pop out.
