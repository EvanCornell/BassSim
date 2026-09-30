// Application menu bar — the Eclipse/Windows pattern: a thin strip of menu
// titles, each opening a dropdown of commands.
//
// Behaviour matches native menu bars: click a title to open, then *hover* any
// other title to switch to it without clicking again; Escape or a click
// anywhere else closes. Items carry shortcut hints, check marks and submenus.
import React, { useEffect, useRef, useState } from 'react'
import { useStore, SCHEMA_VERSION, SNAPSHOT_LIMIT } from '../store'
import { readSnapshots } from '../workspace'
import { supportsFolders } from '../utils/folder'
import { connectFolderWithPrompt, disconnectFolderWithPrompt } from '../utils/folderPrompts'
import { isOpen } from '../layout'
import { PANEL_META, PANEL_IDS, MAIN_IDS, CHART_IDS } from '../panelMeta'
import { exportCSV, exportSchematicPNG, exportMetricsTxt, exportCircuitSVG } from '../utils/export'
import { formatCombo } from '../keymap'
import { ItemList } from './MenuItem'


// ---------- dropdown primitives ----------

// The row itself lives in MenuItem.jsx, shared with the right-click menu, so a
// command offered in both places renders identically in both.

/**
 * One menu title with its dropdown.
 *
 * `onHover` is what gives the bar its native feel: once any menu is open,
 * moving across a title switches to it without a second click.
 *
 * @param {object} props - Component props.
 * @param {string} props.title - Menu title.
 * @param {Array<object>} props.items - Dropdown items.
 * @param {boolean} props.open - Whether this dropdown is showing.
 * @param {Function} props.onOpen - Called when the title is clicked.
 * @param {Function} props.onHover - Called when the pointer enters the title.
 * @returns {React.ReactElement} The menu.
 * @pure
 */
function Menu({ title, items, open, onOpen, onHover }) {
  return (
    <div className="menu-root">
      <button
        className={`menu-title ${open ? 'open' : ''}`}
        onClick={(e) => { e.stopPropagation(); onOpen() }}
        onMouseEnter={onHover}
      >{title}</button>
      {open && (
        <div className="menu-dropdown">
          <ItemList items={items} />
        </div>
      )}
    </div>
  )
}

// ---------- the bar ----------

/**
 * The open project's name, centred in the bar, with a dot for the state of its result.
 *
 * Green once the result is current, amber while a sweep is running, red
 * when the project cannot be simulated, grey when nothing is open.
 *
 * @returns {React.ReactElement|null} The title, or `null` when no project is open.
 * @sideEffect Subscribes to the store.
 */
function ProjectTitle() {
  const name = useStore((s) => s.projectName)
  const open = useStore((s) => !!s.activeFile)
  const busy = useStore((s) => s.simBusy)
  const failed = useStore((s) => !!s.simError || !!s.results?.validation?.errors?.length)
  const empty = useStore((s) => !s.nodes.length)
  if (!open) return null
  const state = failed ? 'error' : busy ? 'busy' : empty ? 'none' : 'ok'
  const tip = { error: 'The project cannot be simulated — see the message below the bar', busy: 'Simulating…', none: 'Nothing to simulate yet', ok: 'Result is up to date' }[state]
  return (
    <div className="mb-project" title={tip}>
      <span className={`mb-dot ${state}`} />
      <span className="mb-name">{name || 'Untitled'}</span>
    </div>
  )
}

/**
 * The application menu bar.
 *
 * Follows the native pattern: click a title to open, then hover any other
 * title to switch without clicking again; Escape or a click anywhere else
 * closes.
 *
 * Subscribes to the whole store rather than a slice — the menus read most
 * of it, and the enabled/checked state of nearly every item depends on
 * current state.
 *
 * @returns {React.ReactElement} The menu bar.
 * @sideEffect Subscribes to the store. Registers window mousedown and keydown listeners while a menu is open.
 */
export default function MenuBar() {
  const store = useStore()
  const [open, setOpen] = useState(null)
  const fileRef = useRef(null)
  const workspaceRef = useRef(null)
  const barRef = useRef(null)
  const { settings, updateSettings, layout, layoutOps, layoutPresets, poppedOut, bindings } = store
  const snapshots = readSnapshots(store.workspace)

  /**
   * The display hint for a command's first binding.
   *
   * Read live rather than baked in, so rebinding a command in Settings
   * updates every menu that mentions it.
   *
   * @param {string} id - Command id.
   * @returns {string} The formatted combo, or `''` when unbound.
   * @reads the current bindings from the store.
   */
  const key = (id) => formatCombo(bindings[id]?.[0])

  /**
   * Build the View-menu entry for one panel.
   *
   * A popped-out panel is neither open in the dock nor closed, so it is shown
   * checked with an "in a tab" hint, and clicking it brings that tab to the
   * front rather than toggling the dock.
   *
   * @param {string} id - Panel id.
   * @returns {object} A menu item descriptor.
   * @reads the current layout, popped-out list and settings.
   */
  const panelItem = (id) => ({
    label: PANEL_META[id].title,
    checked: isOpen(layout, id) || poppedOut.includes(id),
    hint: poppedOut.includes(id) ? 'in a tab' : '',
    disabled: PANEL_META[id].closable === false
      || (PANEL_META[id].requires && !settings[PANEL_META[id].requires]),
    /**
     * Bring a popped-out panel's tab to the front, or toggle a docked one.
     *
     * @returns {*} Whatever the action returns; the menu ignores it.
     * @sideEffect Focuses a browser tab, or opens/closes the panel in the dock.
     */
    onClick: () => (poppedOut.includes(id) ? store.popOutPanel(id) : layoutOps.toggle(id)),
  })

  useEffect(() => {
    if (!open) return
    /**
     * Close the menu when the pointer goes down outside the bar.
     *
     * @param {MouseEvent} e - The mousedown event.
     * @returns {void}
     * @sideEffect Closes the open menu.
     */
    const away = (e) => { if (!barRef.current?.contains(e.target)) setOpen(null) }
    /**
     * Close the menu on Escape.
     *
     * @param {KeyboardEvent} e - The keydown event.
     * @returns {void}
     * @sideEffect Closes the open menu.
     */
    const esc = (e) => { if (e.key === 'Escape') setOpen(null) }
    window.addEventListener('mousedown', away)
    window.addEventListener('keydown', esc)
    return () => { window.removeEventListener('mousedown', away); window.removeEventListener('keydown', esc) }
  }, [open])

  /**
   * Import a project from a chosen file.
   *
   * The project is added to the workspace as a new file rather than dropped
   * onto the canvas: a project belonging to no file is the one thing that can
   * be edited and then lost.
   *
   * A schema-version mismatch asks before loading rather than refusing —
   * older files usually still open, since every param falls back to its
   * default.
   *
   * The input's value is cleared afterwards so choosing the same file twice
   * in a row fires a change event the second time.
   *
   * @param {React.ChangeEvent} e - The file input change event.
   * @returns {void}
   * @sideEffect Reads the file, may show a confirmation, adds a workspace file, and alerts on unparseable input.
   */
  const onLoadFile = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    /**
     * Parse the loaded file and add it to the workspace.
     *
     * @returns {void}
     * @sideEffect Adds a workspace file and opens it, or alerts when the file is not valid project JSON.
     */
    reader.onload = () => {
      try {
        const proj = JSON.parse(reader.result)
        // A workspace is also valid JSON with a schemaVersion, and it has no
        // `nodes`, so it would load as a silently empty project. Naming the
        // mistake is the difference between "that did nothing" and knowing
        // which menu item to use instead.
        if (proj.kind === 'workspace') {
          alert('That is a workspace, not a project. Use File ▸ Import Workspace… to open it.')
          return
        }
        // Older files are carried forward on load; only a newer one may hold
        // something this build cannot represent.
        if (Number(proj.schemaVersion) > SCHEMA_VERSION) {
          if (!confirm(`This file was saved by a newer SpeakerSpice (schema v${proj.schemaVersion}); this build reads up to v${SCHEMA_VERSION}. Anything it does not understand may be lost. Load anyway?`)) return
        }
        store.importProject(proj, file.name)
      } catch {
        alert('Could not parse that file as a SpeakerSpice project.')
      }
    }
    reader.readAsText(file)
    e.target.value = ''
  }

  /**
   * Read a chosen workspace file and replace the current workspace with it.
   *
   * Confirmed first, and pointedly: importing replaces every project in the
   * browser, and the copy being replaced may be the only one that exists.
   *
   * @param {React.ChangeEvent} e - The file input change event.
   * @returns {Promise<void>} Resolves once the import has been attempted.
   * @sideEffect Reads the file, may show a confirmation, replaces the workspace, and alerts when the file is not one.
   */
  const onLoadWorkspace = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (!confirm('Importing replaces the workspace in this browser, including every project in it. Download the current one first if you have not.')) return
    const result = await store.importWorkspaceFile(file)
    if (!result.ok) alert(result.error)
    else if (result.skipped?.length) alert(`Imported. These files could not be read and were skipped:\n\n${result.skipped.join('\n')}`)
  }

  /**
   * Save the current window arrangement under a prompted name.
   *
   * @returns {void}
   * @sideEffect Prompts for a name, then stores the preset. Does nothing if cancelled or blank.
   */
  const savePreset = () => {
    const name = prompt('Save the current window arrangement as:', `Layout ${layoutPresets.length + 1}`)
    if (name?.trim()) store.saveLayoutPreset(name.trim())
  }

  const MENUS = [
    ['File', [
      {
        label: 'New Project',
        hint: key('project.new'),
        /**
         * Add an empty project to the workspace and open it.
         *
         * @returns {*} Whatever the action returns; the menu ignores it.
         * @sideEffect Creates a workspace file and replaces what is on the canvas.
         */
        onClick: () => store.newFile(''),
      },
      { label: '-' },
      { label: 'Export Project as JSON…', hint: key('project.save'), onClick: store.saveProjectJSON },
      {
        label: 'Import Project JSON…',
        /**
         * Open the file picker to import a project.
         *
         * @returns {*} Whatever the action returns; the menu ignores it.
         * @sideEffect Clicks the hidden file input.
         */
        onClick: () => fileRef.current?.click(),
      },
      { label: '-' },
      {
        label: 'Download Workspace…',
        /**
         * Download the whole workspace as one file.
         *
         * @returns {*} Whatever the action returns; the menu ignores it.
         * @sideEffect Triggers a browser download and records when it happened.
         */
        onClick: () => store.downloadWorkspace(),
      },
      {
        label: 'Import Workspace…',
        /**
         * Open the file picker to replace the workspace.
         *
         * @returns {*} Whatever the action returns; the menu ignores it.
         * @sideEffect Clicks the hidden workspace file input.
         */
        onClick: () => workspaceRef.current?.click(),
      },
      ...(supportsFolders() ? [{
        label: store.folderStatus === 'off' ? 'Keep Workspace in a Folder…' : `Stop Saving to “${store.folderName}”`,
        /**
         * Connect the workspace to a folder on disk, or disconnect it.
         *
         * @returns {*} Whatever the action returns; the menu ignores it.
         * @sideEffect Shows a picker or a confirmation, and writes to the user's filesystem.
         */
        onClick: () => (store.folderStatus === 'off' ? connectFolderWithPrompt() : disconnectFolderWithPrompt()),
      }] : []),
      { label: '-' },
      {
        label: 'Export',
        submenu: [
          {
            label: 'Response data (CSV)',
            /**
             * Download every result series as a CSV.
             *
             * @returns {*} Whatever the action returns; the menu ignores it.
             * @sideEffect Triggers a browser download.
             */
            onClick: () => exportCSV(store.results, store.nodes, store.projectName),
          },
          {
            label: 'Schematic (PNG)',
            /**
             * Download a PNG of the node canvas.
             *
             * @returns {*} Whatever the action returns; the menu ignores it.
             * @sideEffect Rasterizes the live canvas and triggers a browser download.
             */
            onClick: () => exportSchematicPNG(store.projectName),
          },
          {
            label: 'Circuit diagram (SVG)',
            /**
             * Download the circuit the sweep solves, every element drawn, as an SVG.
             *
             * @returns {Promise<void>} Resolves once the download has started, or once the failure has been shown.
             * @sideEffect Compiles the project, lays out the diagram and triggers a browser download; shows a dialog when it cannot.
             */
            onClick: () => exportCircuitSVG(store.serialize()).catch((err) => alert(`Could not draw the circuit: ${err.message}`)),
          },
          {
            label: 'Metrics summary (TXT)',
            /**
             * Download a plain-text metrics summary.
             *
             * @returns {*} Whatever the action returns; the menu ignores it.
             * @sideEffect Triggers a browser download.
             */
            onClick: () => exportMetricsTxt(store.metrics, settings, store.projectName),
          },
        ],
      },
    ]],

    ['Edit', [
      { label: 'Undo', hint: key('edit.undo'), disabled: !store.history.length, onClick: store.undo },
      { label: 'Redo', hint: key('edit.redo'), disabled: !store.future.length, onClick: store.redo },
      { label: '-' },
      { label: 'Duplicate Selection', hint: key('edit.duplicate'), onClick: store.duplicateSelected },
      { label: 'Select All Nodes', hint: key('edit.selectAll'), onClick: store.selectAll },
      { label: 'Delete Selection', hint: key('edit.delete'), danger: true, onClick: store.deleteSelected },
    ]],

    ['View', [
      ...MAIN_IDS.map(panelItem),
      { label: '-' },
      { label: 'Charts', submenu: CHART_IDS.map(panelItem) },
      { label: '-' },
      {
        label: 'Open Focused Panel in New Tab',
        hint: key('view.popout'),
        /**
         * Pop the focused panel out into its own browser tab.
         *
         * @returns {*} Whatever the action returns; the menu ignores it.
         * @sideEffect Opens a browser window and removes the panel from the dock.
         */
        onClick: () => store.popOutPanel(store.focusedPanel),
      },
      {
        label: 'Open in New Tab',
        submenu: PANEL_IDS
          .filter((id) => !PANEL_META[id].requires || settings[PANEL_META[id].requires])
          .map((id) => ({
            label: PANEL_META[id].title,
            checked: poppedOut.includes(id),
            /**
             * Pop this specific panel out into its own browser tab.
             *
             * @returns {*} Whatever the action returns; the menu ignores it.
             * @sideEffect Opens a browser window and removes the panel from the dock.
             */
            onClick: () => store.popOutPanel(id),
          })),
      },
      { label: '-' },
      {
        label: store.maximized ? 'Restore Panel Sizes' : 'Maximize Focused Panel',
        hint: key('view.maximize'),
        /**
         * Maximize the focused panel, or restore the one already maximized.
         *
         * @returns {*} Whatever the action returns; the menu ignores it.
         * @sideEffect Changes the dock layout.
         */
        onClick: () => store.toggleMaximize(store.maximized ? store.maximized : store.focusedPanel),
      },
      { label: '-' },
      {
        label: 'Reset Layout',
        /**
         * Restore the default workspace arrangement.
         *
         * @returns {*} Whatever the action returns; the menu ignores it.
         * @sideEffect Replaces and persists the layout.
         */
        onClick: () => layoutOps.reset(),
      },
      { label: 'Save Layout As…', onClick: savePreset },
      {
        label: 'Apply Saved Layout',
        disabled: !layoutPresets.length,
        submenu: layoutPresets.length
          ? layoutPresets.map((p) => ({
            label: p.name,
            /**
             * Apply this saved arrangement.
             *
             * @returns {*} Whatever the action returns; the menu ignores it.
             * @sideEffect Replaces and persists the layout.
             */
            onClick: () => store.applyLayoutPreset(p.name),
          }))
          : [{ label: '(none saved)', disabled: true }],
      },
      {
        label: 'Delete Saved Layout',
        disabled: !layoutPresets.length,
        submenu: layoutPresets.length
          ? layoutPresets.map((p) => ({
            label: p.name,
            danger: true,
            /**
             * Delete this saved arrangement.
             *
             * @returns {*} Whatever the action returns; the menu ignores it.
             * @sideEffect Removes the preset and persists the change.
             */
            onClick: () => store.deleteLayoutPreset(p.name),
          }))
          : [{ label: '(none saved)', disabled: true }],
      },
    ]],

    ['Simulate', [
      {
        label: 'Mask chamber resonances',
        checked: settings.masking,
        /**
         * Toggle resonance masking, which lumps chambers to hide standing-wave artifacts.
         *
         * @returns {*} Whatever the action returns; the menu ignores it.
         * @sideEffect Changes a sweep setting, which triggers a resimulation.
         */
        onClick: () => updateSettings({ masking: !settings.masking }),
      },
      {
        label: 'Unwrap phase',
        checked: settings.unwrapPhase,
        /**
         * Toggle phase unwrapping on the phase chart.
         *
         * @returns {*} Whatever the action returns; the menu ignores it.
         * @sideEffect Changes a display setting.
         */
        onClick: () => updateSettings({ unwrapPhase: !settings.unwrapPhase }),
      },
      { label: '-' },
      {
        label: 'Take Snapshot',
        hint: key('sim.snapshot'),
        disabled: snapshots.length >= SNAPSHOT_LIMIT || !store.results?.ok,
        onClick: store.takeSnapshot,
      },
      {
        label: 'Clear All Snapshots',
        disabled: !snapshots.length,
        /**
         * Discard every reference overlay.
         *
         * @returns {*} Whatever the action returns; the menu ignores it.
         * @sideEffect Clears the snapshot list, which redraws every chart.
         */
        onClick: () => snapshots.forEach((s) => store.removeSnapshot(s.id)),
      },
      { label: '-' },
      { label: 'Recompute Now', hint: key('sim.recompute'), onClick: store.recomputeNow },
    ]],

    ['Tools', [
      {
        label: 'Driver Database…',
        /**
         * Open the driver library browser.
         *
         * @returns {*} Whatever the action returns; the menu ignores it.
         * @sideEffect Shows a modal.
         */
        onClick: () => store.setShowDriverDB(true),
      },
      {
        label: 'T/S Parameter Solver…',
        /**
         * Open the Thiele/Small parameter solver.
         *
         * @returns {*} Whatever the action returns; the menu ignores it.
         * @sideEffect Shows a modal.
         */
        onClick: () => store.setShowTSCalc(true),
      },
      { label: '-' },
      {
        label: 'Time Domain & Distortion',
        hint: key('view.timedomain'),
        /**
         * Open the time-domain workspace.
         *
         * @returns {*} Whatever the action returns; the menu ignores it.
         * @sideEffect Replaces the dock with the time-domain view.
         */
        onClick: () => store.openTimeDomain(),
      },
      {
        label: 'Driver Nonlinearity (Bl, Kms, Le)',
        /**
         * Open the time-domain workspace at the driver curve editor.
         *
         * @returns {*} Whatever the action returns; the menu ignores it.
         * @sideEffect Replaces the dock with the time-domain view.
         */
        onClick: () => store.openTimeDomain('nonlinear'),
      },
    ]],

    ['Help', [
      {
        label: 'Keyboard Shortcuts…',
        hint: key('view.settings'),
        /**
         * Open Settings at the keyboard section.
         *
         * @returns {*} Whatever the action returns; the menu ignores it.
         * @sideEffect Shows the settings window.
         */
        onClick: () => store.setShowSettings(true, 'keyboard'),
      },
      {
        label: 'About SpeakerSpice',
        /**
         * Show the about dialog.
         *
         * @returns {*} Whatever `alert` returns; the menu ignores it.
         * @sideEffect Shows a browser dialog.
         */
        onClick: () => alert(
          'SpeakerSpice — open-source loudspeaker design.\n\n'
          + 'Every design is an electro-acoustic circuit, solved in the browser\n'
          + 'by ngspice.\n\n'
          + 'View ▸ Reset Layout restores the default workspace.',
        ),
      },
    ]],
  ]

  return (
    <div className="menubar" ref={barRef} onClick={() => setOpen(null)}>
      <span className="logo">Speaker<span>Spice</span></span>
      <ProjectTitle />
      {MENUS.map(([title, items]) => (
        <Menu
          key={title}
          title={title}
          items={items}
          open={open === title}
          onOpen={() => setOpen(open === title ? null : title)}
          onHover={() => { if (open) setOpen(title) }}
        />
      ))}
      {/* Settings is a section of its own rather than an item buried in a
          menu: one click opens the window, no dropdown in between. */}
      <button
        className="menu-title"
        onClick={(e) => { e.stopPropagation(); setOpen(null); store.setShowSettings(true) }}
        onMouseEnter={() => { if (open) setOpen(null) }}
      >Settings</button>
      <input ref={fileRef} type="file" accept=".json,application/json" style={{ display: 'none' }} onChange={onLoadFile} />
      <input ref={workspaceRef} type="file" accept=".zip,.json,application/zip,application/json" style={{ display: 'none' }} onChange={onLoadWorkspace} />

    </div>
  )
}
