// Application menu bar — the Eclipse/Windows pattern: a thin strip of menu
// titles, each opening a dropdown of commands.
//
// Behaviour matches native menu bars: click a title to open, then *hover* any
// other title to switch to it without clicking again; Escape or a click
// anywhere else closes. Items carry shortcut hints, check marks and submenus.
import React, { useEffect, useRef, useState } from 'react'
import { useStore, SCHEMA_VERSION } from '../store'
import { isOpen } from '../layout'
import { PANEL_META, PANEL_IDS, MAIN_IDS, CHART_IDS } from '../panelMeta'
import { exportCSV, exportSchematicPNG, exportMetricsTxt } from '../utils/export'
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
  const [showExpWarning, setShowExpWarning] = useState(false)
  const fileRef = useRef(null)
  const workspaceRef = useRef(null)
  const barRef = useRef(null)
  const { settings, updateSettings, layout, layoutOps, layoutPresets, snapshots, poppedOut, bindings } = store

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
   * A schema-version mismatch asks before loading rather than refusing —
   * older files usually still open, since every param falls back to its
   * default.
   *
   * The input's value is cleared afterwards so choosing the same file twice
   * in a row fires a change event the second time.
   *
   * @param {React.ChangeEvent} e - The file input change event.
   * @returns {void}
   * @sideEffect Reads the file, may show a confirmation, replaces the project, and alerts on unparseable input.
   */
  const onLoadFile = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    /**
     * Parse the loaded file and replace the current project with it.
     *
     * @returns {void}
     * @sideEffect Replaces the project, or alerts when the file is not valid project JSON.
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
        if (proj.schemaVersion !== SCHEMA_VERSION) {
          if (!confirm(`This file uses schema v${proj.schemaVersion ?? '?'} but the app expects v${SCHEMA_VERSION}. Attempt to load anyway?`)) return
        }
        store.loadSerialized(proj)
      } catch {
        alert('Could not parse that file as an AcouSim project.')
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
   * @returns {void}
   * @sideEffect Reads the file, may show a confirmation, replaces the workspace, and alerts when the file is not one.
   */
  const onLoadWorkspace = (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (!confirm('Importing replaces the workspace in this browser, including every project in it. Download the current one first if you have not.')) return
    const reader = new FileReader()
    /**
     * Hand the file's text to the store and report a rejection.
     *
     * @returns {void}
     * @sideEffect Replaces the workspace, or alerts when the file is not a workspace.
     */
    reader.onload = () => {
      const result = store.importWorkspaceText(String(reader.result))
      if (!result.ok) alert(result.error)
    }
    reader.readAsText(file)
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

  const nlLocked = !settings.nlEnabled

  const MENUS = [
    ['File', [
      { label: 'New Project', hint: key('project.new'), onClick: store.newProject },
      {
        label: 'Open Project…',
        /**
         * Open the saved-project browser.
         *
         * @returns {*} Whatever the action returns; the menu ignores it.
         * @sideEffect Shows a modal.
         */
        onClick: () => store.setShowProjectManager(true),
      },
      { label: '-' },
      { label: 'Save Project As JSON…', hint: key('project.save'), onClick: store.saveProjectJSON },
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
        disabled: snapshots.length >= 3 || !store.results?.ok,
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
        label: 'Nonlinear Lab',
        disabled: nlLocked,
        hint: nlLocked ? 'experimental' : '',
        /**
         * Open the Nonlinear Lab panel.
         *
         * @returns {*} Whatever the action returns; the menu ignores it.
         * @sideEffect Changes and persists the layout.
         */
        onClick: () => layoutOps.open('nllab'),
      },
      {
        label: 'Experimental features',
        checked: !!settings.nlEnabled,
        /**
         * Turn experimental features on or off.
         *
         * Turning them off also closes the Nonlinear Lab, which would
         * otherwise stay docked with nothing to show. Turning them on shows a
         * warning first rather than enabling immediately.
         *
         * @returns {void}
         * @sideEffect Either changes a setting and closes a panel, or opens the warning dialog.
         */
        onClick: () => {
          if (settings.nlEnabled) {
            updateSettings({ nlEnabled: false })
            layoutOps.close('nllab')
          } else setShowExpWarning(true)
        },
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
        label: 'About AcouSim',
        /**
         * Show the about dialog.
         *
         * @returns {*} Whatever `alert` returns; the menu ignores it.
         * @sideEffect Shows a browser dialog.
         */
        onClick: () => alert(
          'AcouSim — node-based acoustic circuit simulator.\n\n'
          + 'A 1-D electro-acoustic analogous circuit solved by the transfer-matrix\n'
          + '(ABCD) method in [pressure; volume velocity] state.\n\n'
          + 'View ▸ Reset Layout restores the default workspace.',
        ),
      },
    ]],
  ]

  return (
    <div className="menubar" ref={barRef} onClick={() => setOpen(null)}>
      <span className="logo">Acou<span>Sim</span></span>
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
      <input ref={workspaceRef} type="file" accept=".json,application/json" style={{ display: 'none' }} onChange={onLoadWorkspace} />

      {showExpWarning && (
        <div className="modal-backdrop" onClick={() => setShowExpWarning(false)}>
          <div className="modal" style={{ maxWidth: 480, minWidth: 380 }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ color: 'var(--amber)' }}>Experimental features</h3>
            <p style={{ fontSize: 13, lineHeight: 1.55 }}>
              You are enabling <b>large-signal T/S nonlinearity</b> simulation.
            </p>
            <p style={{ fontSize: 12.5, lineHeight: 1.55, color: 'var(--text-2)' }}>
              This feature is experimental. Its accuracy depends entirely on the accuracy
              of the Bl(x), Cms(x) and Le(x) curves you provide — without measured data,
              results are plausible-looking guesses. The solver models power compression
              and resonance drift only; it does not produce harmonic distortion. It may
              interact unexpectedly with complex circuits.
            </p>
            <p style={{ fontSize: 12.5, color: 'var(--text-2)' }}>
              A flat curve at 1.0 reproduces the standard engine exactly.
            </p>
            <div className="close-row">
              <button onClick={() => setShowExpWarning(false)}>Cancel</button>
              <button className="primary" onClick={() => {
                updateSettings({ nlEnabled: true })
                setShowExpWarning(false)
                layoutOps.open('nllab')
              }}>I understand — continue</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
