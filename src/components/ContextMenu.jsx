// The right-click menu.
//
// One component for every context in the app. The store records only *what*
// was right-clicked — a node, an edge, the canvas background, a docked window,
// one of its tabs — and this module decides what that target can do. Keeping
// the menu's contents out of state is what lets an item's enabled or checked
// state be correct at the moment it is drawn rather than at the moment the menu
// opened.
//
// Rows come from MenuItem.jsx, shared with the menu bar, so a command offered
// in both places looks the same in both.
//
// The browser's own menu is suppressed everywhere except in text fields, where
// it is genuinely the better menu: spell-check suggestions and the system
// clipboard are things this app cannot offer.
import React, { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useStore } from '../store'
import { PANEL_META, MAIN_IDS, CHART_IDS, panelTitle } from '../panelMeta'
import { findNode, isOpen } from '../layout'
import { formatCombo } from '../keymap'
import { NODE_KINDS } from '../nodeKinds'
import { ItemList } from './MenuItem'

/** Gap kept between the menu and the window edge when it has to be nudged back on screen. */
const EDGE_PAD = 6

/**
 * Whether an element takes typed input, and so keeps the browser's own menu.
 *
 * The native menu is the better menu in a text field — it offers spell-check
 * corrections and the system clipboard, neither of which this app has — so it
 * is left alone there rather than replaced with something less useful.
 *
 * @param {EventTarget|null} el - The right-clicked element.
 * @returns {boolean} True when the native menu should be left alone.
 * @pure
 */
function isTextField(el) {
  const tag = el?.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || !!el?.isContentEditable
}

/**
 * Panels that may be offered as a new view, given the current settings.
 *
 * Experimental panels are hidden rather than shown disabled: a panel gated
 * behind a setting the user has not turned on is not a thing they are meant to
 * be reaching for yet.
 *
 * @param {string[]} ids - Candidate panel ids.
 * @param {object} settings - Current sweep and feature settings.
 * @returns {string[]} The offerable ids.
 * @pure
 */
function offerable(ids, settings) {
  return ids.filter((id) => !PANEL_META[id].requires || settings[PANEL_META[id].requires])
}

/**
 * The floating right-click menu.
 *
 * Renders nothing until something opens it. While open it closes on Escape, on
 * any pointer press outside itself, and on a scroll or resize — all three being
 * ways the menu would otherwise end up pointing at something that has moved.
 *
 * @returns {React.ReactElement|null} The menu, or `null` when none is open.
 * @sideEffect Subscribes to the store, and registers window listeners for the suppression of the native menu and for dismissal.
 */
export default function ContextMenu() {
  const store = useStore()
  const menu = store.contextMenu
  const close = store.closeContextMenu
  const ref = useRef(null)
  const [pos, setPos] = useState(null)

  // Suppress the browser's menu app-wide. A capture listener on the window
  // runs before React's own handlers, so the components below still get to
  // open their menu — this only takes the native one away.
  useEffect(() => {
    /**
     * Take the browser's context menu away outside text fields.
     *
     * @param {MouseEvent} e - The contextmenu event.
     * @returns {void}
     * @sideEffect Prevents the event's default, which is what stops the native menu appearing.
     */
    const suppress = (e) => { if (!isTextField(e.target)) e.preventDefault() }
    window.addEventListener('contextmenu', suppress, true)
    return () => window.removeEventListener('contextmenu', suppress, true)
  }, [])

  // Measure once drawn and nudge back on screen. Done in a layout effect so
  // the correction lands before the browser paints — measuring after paint
  // would show the menu jumping.
  useLayoutEffect(() => {
    if (!menu) { setPos(null); return }
    const r = ref.current?.getBoundingClientRect()
    if (!r) return
    const x = Math.max(EDGE_PAD, Math.min(menu.x, window.innerWidth - r.width - EDGE_PAD))
    const y = Math.max(EDGE_PAD, Math.min(menu.y, window.innerHeight - r.height - EDGE_PAD))
    setPos({ x, y })
  }, [menu])

  useEffect(() => {
    if (!menu) return
    /**
     * Close the menu when the pointer goes down outside it.
     *
     * @param {MouseEvent} e - The pointerdown event.
     * @returns {void}
     * @sideEffect Closes the menu.
     */
    const away = (e) => { if (!ref.current?.contains(e.target)) close() }
    /**
     * Close the menu on Escape.
     *
     * @param {KeyboardEvent} e - The keydown event.
     * @returns {void}
     * @sideEffect Closes the menu.
     */
    const esc = (e) => { if (e.key === 'Escape') close() }
    window.addEventListener('pointerdown', away, true)
    window.addEventListener('keydown', esc)
    window.addEventListener('resize', close)
    window.addEventListener('scroll', close, true)
    return () => {
      window.removeEventListener('pointerdown', away, true)
      window.removeEventListener('keydown', esc)
      window.removeEventListener('resize', close)
      window.removeEventListener('scroll', close, true)
    }
  }, [menu, close])

  if (!menu) return null

  const { target } = menu
  const { settings, layout, layoutOps, maximized, bindings } = store

  /**
   * The display hint for a command's first binding.
   *
   * Read live rather than baked in, so rebinding a command in Settings updates
   * the right-click menu too.
   *
   * @param {string} id - Command id.
   * @returns {string} The formatted combo, or `''` when unbound.
   * @reads the current bindings from the store.
   */
  const key = (id) => formatCombo(bindings[id]?.[0])

  // The stack the click landed in, if any. A right-click in a popped-out tab
  // has no stack, and neither does one on a maximized panel — the tree it
  // would name is not what is on screen.
  const stackId = maximized ? null : target.stackId || null
  const stackNode = stackId ? findNode(layout, stackId) : null
  const stackPanels = stackNode?.type === 'stack' ? stackNode.panels : []

  /**
   * Submenu offering every view that could be added to the clicked window.
   *
   * Panels already in this stack are left out — adding one where it already is
   * would be a no-op the user had to discover by trying it. Charts are nested
   * one level down, matching the View menu, because there are nine of them.
   *
   * @returns {Array<object>} Item descriptors for the Add View submenu.
   * @reads the current layout and settings.
   */
  const addViewItems = () => {
    /**
     * One Add View row.
     *
     * @param {string} id - Panel id.
     * @returns {object} An item descriptor that docks the panel into the clicked stack.
     * @reads the clicked stack id.
     */
    const row = (id) => ({
      label: panelTitle(id),
      hint: isOpen(layout, id) ? 'move here' : '',
      /**
       * Add this view to the clicked window.
       *
       * @returns {void}
       * @sideEffect Changes and persists the layout, and closes the menu.
       */
      onClick: () => { store.addViewToStack(id, stackId); close() },
    })
    const main = offerable(MAIN_IDS, settings).filter((id) => !stackPanels.includes(id))
    const charts = offerable(CHART_IDS, settings).filter((id) => !stackPanels.includes(id))
    const items = main.map(row)
    if (charts.length) {
      if (items.length) items.push({ label: '-' })
      items.push({ label: 'Charts', submenu: charts.map(row) })
    }
    return items.length ? items : [{ label: '(every view is already here)', disabled: true }]
  }

  /**
   * The items a popped-out browser tab offers about itself.
   *
   * A popped-out tab has no dock, so none of the docking commands apply — but
   * it is still a window, and the thing a window most needs to be able to do
   * is gain a view without spawning another window. So it offers the same Add
   * View Here a docked stack does, alongside switching which view is in front,
   * spawning a further tab, and handing its views back — which it does by
   * closing, the same path a user closing the tab by hand takes.
   *
   * @param {string[]} here - The panel ids this tab holds.
   * @param {string} front - The view currently showing.
   * @returns {Array<object>} Item descriptors.
   * @reads the current settings, to leave out views gated behind one.
   */
  const popoutItems = (here, front) => {
    const elsewhere = offerable([...MAIN_IDS, ...CHART_IDS], settings).filter((id) => !here.includes(id))
    /**
     * One row offering a view this tab does not yet hold.
     *
     * @param {(id: string) => void} act - What to do with the chosen panel.
     * @returns {(id: string) => object} A row builder.
     * @sideEffect The row's handler runs `act` and closes the menu.
     */
    const rowsFor = (act) => (id) => ({
      label: panelTitle(id),
      /**
       * Act on this view.
       *
       * @returns {void}
       * @sideEffect Runs the chosen action and closes the menu.
       */
      onClick: () => { act(id); close() },
    })
    /**
     * Split a list of offerable views into a menu, charts nested one level down.
     *
     * Nine charts flattened into one list makes a menu nobody can scan, which
     * is why the View menu nests them too.
     *
     * @param {(id: string) => object} row - Row builder for one panel.
     * @param {string} empty - What to say when nothing is left to offer.
     * @returns {Array<object>} Item descriptors.
     * @pure
     */
    const grouped = (row, empty) => {
      const main = elsewhere.filter((id) => MAIN_IDS.includes(id))
      const charts = elsewhere.filter((id) => CHART_IDS.includes(id))
      const out = main.map(row)
      if (charts.length) {
        if (out.length) out.push({ label: '-' })
        out.push({ label: 'Charts', submenu: charts.map(row) })
      }
      return out.length ? out : [{ label: empty, disabled: true }]
    }

    return [
      {
        label: 'Add View Here',
        submenu: grouped(rowsFor(store.addViewToPopout), '(every view is already here)'),
      },
      ...(here.length > 1 ? [{
        label: 'Show View',
        submenu: here.map((id) => ({
          label: panelTitle(id),
          checked: id === front,
          /**
           * Bring this view to the front of the tab.
           *
           * @returns {void}
           * @sideEffect Writes store state and closes the menu.
           */
          onClick: () => { store.setPopoutActive(id); store.focusPanel(id); close() },
        })),
      }] : []),
      { label: '-' },
      {
        label: 'Open a View in a New Tab',
        submenu: grouped(rowsFor(store.popOutPanel), '(every view is already open here)'),
      },
      {
        label: `Close “${panelTitle(front)}”`,
        hint: here.length === 1 ? 'closes this tab' : '',
        /**
         * Close the view in front, handing it back to the main window.
         *
         * @returns {void}
         * @sideEffect Writes store state, or closes the browser tab when this was its last view.
         */
        onClick: () => { close(); store.closeViewInPopout(front) },
      },
      { label: '-' },
      {
        label: here.length > 1 ? 'Return These Views to the Main Window' : 'Return This View to the Main Window',
        /**
         * Close this tab, which hands its views back to the main window.
         *
         * The handover is the tab's own closing announcement rather than
         * anything done here — the same path a user closing the tab by hand
         * takes, so there is only one way it can happen.
         *
         * @returns {void}
         * @sideEffect Closes the browser tab.
         */
        onClick: () => { close(); window.close() },
      },
    ]
  }

  /**
   * The items describing whichever window the click landed in.
   *
   * A docked stack gets the docking commands; a popped-out tab gets its own
   * set; a maximized panel gets neither, since the stack it would name is not
   * what is on screen. One builder, so every target can end with "and whatever
   * this window can do" without caring which kind it is.
   *
   * @returns {Array<object>} Item descriptors, empty when the click belongs to no window.
   * @reads the clicked stack, the current layout and the window's own URL.
   */
  const windowItems = () => {
    if (!stackNode) {
      const here = store.popoutIds
      return here.length ? popoutItems(here, store.popoutActive || here[0]) : []
    }
    return [
      { label: 'Add View Here', submenu: addViewItems() },
      { label: '-' },
      {
        label: `Open This Window in a New Tab (${stackPanels.length} view${stackPanels.length === 1 ? '' : 's'})`,
        /**
         * Send the whole clicked window, tabs and all, to one browser tab.
         *
         * @returns {void}
         * @sideEffect Opens a browser window, changes and persists the layout, and closes the menu.
         */
        onClick: () => { store.popOutStack(stackId); close() },
      },
      {
        label: 'Open a View in a New Tab',
        submenu: stackPanels.map((id) => ({
          label: panelTitle(id),
          /**
           * Send this one view to its own browser tab.
           *
           * @returns {void}
           * @sideEffect Opens a browser window, changes and persists the layout, and closes the menu.
           */
          onClick: () => { store.popOutPanel(id); close() },
        })),
      },
    ]
  }

  /**
   * Run a store action and dismiss the menu.
   *
   * Every command in this menu ends the same way, so the pairing is written
   * once rather than at each call site.
   *
   * @param {Function} fn - The action to run.
   * @returns {Function} A click handler.
   * @sideEffect The returned handler runs the action and closes the menu.
   */
  const run = (fn) => () => { fn(); close() }

  /**
   * The rows for whatever was right-clicked.
   *
   * @returns {Array<object>} Item descriptors, in display order.
   * @reads the whole store — nearly every row's enabled or checked state depends on current state.
   */
  const items = () => {
    const hasClip = !!store.clipboard?.nodes?.length
    const hasSel = store.nodes.some((n) => n.selected)
    // A separator is only a separator when there is something on both sides of
    // it: a maximized panel contributes no window items, and a trailing rule
    // under the last command reads as a menu that failed to finish drawing.
    const win = windowItems()
    const tail = win.length ? [{ label: '-' }, ...win] : []

    if (target.kind === 'node' || target.kind === 'pane') {
      const onNode = target.kind === 'node'
      const editRows = [
        { label: 'Cut', hint: key('edit.cut'), disabled: !hasSel, onClick: run(store.cutSelection) },
        { label: 'Copy', hint: key('edit.copy'), disabled: !hasSel, onClick: run(store.copySelection) },
        {
          label: 'Paste',
          hint: key('edit.paste'),
          disabled: !hasClip,
          /**
           * Paste the clipboard where the menu was opened.
           *
           * @returns {void}
           * @sideEffect Adds nodes, schedules a resimulation and closes the menu.
           */
          onClick: () => { store.pasteClipboard(target.flowPos); close() },
        },
        { label: 'Duplicate', hint: key('edit.duplicate'), disabled: !hasSel, onClick: run(store.duplicateSelected) },
        { label: '-' },
        { label: 'Delete', hint: key('edit.delete'), danger: true, disabled: !hasSel, onClick: run(store.deleteSelected) },
      ]
      if (onNode) return [...editRows, ...tail]
      return [
        ...editRows,
        { label: '-' },
        { label: 'Select All Nodes', hint: key('edit.selectAll'), onClick: run(store.selectAll) },
        {
          label: 'Add Node',
          submenu: NODE_KINDS.map((k) => ({
            label: k.name,
            /**
             * Create this element where the menu was opened.
             *
             * @returns {void}
             * @sideEffect Adds a node, schedules a resimulation and closes the menu.
             */
            onClick: () => { store.addNode(k.type, target.flowPos); close() },
          })),
        },
        ...tail,
      ]
    }

    if (target.kind === 'popout') return popoutItems(target.ids || [], target.panelId)

    if (target.kind === 'edge') {
      return [{
        label: 'Delete Connection',
        danger: true,
        /**
         * Remove the right-clicked edge.
         *
         * @returns {void}
         * @sideEffect Changes the graph, schedules a resimulation and closes the menu.
         */
        onClick: () => { store.onEdgesChange([{ id: target.edgeId, type: 'remove' }]); close() },
      }]
    }

    if (target.kind === 'tab') {
      const id = target.panelId
      const pinned = PANEL_META[id]?.closable === false
      const others = stackPanels.filter((p) => p !== id && PANEL_META[p]?.closable !== false)
      return [
        {
          label: `Open “${panelTitle(id)}” in a New Tab`,
          /**
           * Send the right-clicked view to its own browser tab.
           *
           * @returns {void}
           * @sideEffect Opens a browser window, changes and persists the layout, and closes the menu.
           */
          onClick: () => { store.popOutPanel(id); close() },
        },
        {
          label: maximized === id ? 'Restore Panel Sizes' : 'Maximize This View',
          hint: key('view.maximize'),
          /**
           * Maximize the right-clicked view, or restore the layout.
           *
           * @returns {void}
           * @sideEffect Changes the dock layout and closes the menu.
           */
          onClick: () => { store.toggleMaximize(id); close() },
        },
        { label: '-' },
        {
          label: 'Close',
          disabled: pinned,
          hint: pinned ? 'the workspace' : '',
          /**
           * Close the right-clicked view.
           *
           * @returns {void}
           * @sideEffect Changes and persists the layout, and closes the menu.
           */
          onClick: () => { layoutOps.close(id); close() },
        },
        {
          label: 'Close Other Views',
          disabled: !others.length,
          /**
           * Close every other view in this window.
           *
           * @returns {void}
           * @sideEffect Changes and persists the layout, and closes the menu.
           */
          onClick: () => { others.forEach((p) => layoutOps.close(p)); close() },
        },
        ...tail,
      ]
    }

    // A bare window: the tab strip's empty space, or a panel's own body.
    const front = stackNode?.active
    return [
      ...win,
      ...(win.length ? [{ label: '-' }] : []),
      {
        label: maximized ? 'Restore Panel Sizes' : 'Maximize This View',
        hint: key('view.maximize'),
        disabled: !front,
        /**
         * Maximize the window's front view, or restore the layout.
         *
         * @returns {void}
         * @sideEffect Changes the dock layout and closes the menu.
         */
        onClick: () => { store.toggleMaximize(maximized || front); close() },
      },
      {
        label: 'Reset Layout',
        /**
         * Restore the default workspace arrangement.
         *
         * @returns {void}
         * @sideEffect Replaces and persists the layout, and closes the menu.
         */
        onClick: () => { layoutOps.reset(); close() },
      },
    ]
  }

  // Submenus open away from the nearer window edge, so a menu raised on the
  // right-hand side of the screen does not push its children off it.
  const side = menu.x > window.innerWidth / 2 ? 'left' : 'right'

  return (
    <div
      ref={ref}
      className="ctx-menu menu-dropdown"
      style={{
        left: pos ? pos.x : menu.x,
        top: pos ? pos.y : menu.y,
        // Invisible for the one frame between mounting and being measured,
        // rather than drawn in the wrong place and corrected.
        visibility: pos ? 'visible' : 'hidden',
      }}
      onClick={close}
      onContextMenu={(e) => e.preventDefault()}
    >
      <ItemList items={items()} submenuSide={side} />
    </div>
  )
}

// Module-private functions, exposed for the contract test suite only
// (test/contract/*). Not part of this module's public API — application code
// must not import from here, and nothing outside the tests does.
export const __internals = { isTextField, offerable }
