// Dock renderer — turns the layout tree from src/layout.js into DOM.
//
// Three interactions live here:
//   1. splitter drags        (resize two adjacent siblings, others untouched)
//   2. tab drags             (retarget a panel to any stack, edge or tab slot)
//   3. maximize / close      (per-stack chrome)
//
// Panels stay mounted when their tab is inactive — hidden with display:none
// rather than unmounted — so React Flow keeps its viewport and the charts keep
// their zoom when you tab away and back.
import React, { useCallback, useEffect, useRef, useState } from 'react'
import { useStore } from '../../store'
import { PANELS, panelTitle } from './panels'
import { StackContext } from './stackContext'

/**
 * The dataTransfer type marking a panel tab drag.
 */
const DRAG_MIME = 'application/speakerspice-panel'
/**
 * Smallest pane a splitter drag may produce, in pixels.
 */
const MIN_PX = 90        // a pane can never be dragged smaller than this
/**
 * How far into a stack the edge drop zones reach, as a fraction of its size.
 */
const EDGE_FRACTION = 0.28 // outer 28% of a stack docks to that side

/**
 * Whether a drag event is a panel tab drag.
 *
 * The payload decides what a drag means, never the store flag alone: a palette
 * element carries `application/speakerspice-node` and must reach the canvas
 * untouched, even if a previous tab drag left `draggingPanel` set.
 *
 * @param {React.DragEvent} e - The drag event. A panel tab drag is identified by `application/speakerspice-panel` appearing in `dataTransfer.types`.
 * @returns {boolean} True when the drag carries a panel tab.
 * @pure
 */
const isPanelDrag = (e) => !!e.dataTransfer?.types?.includes(DRAG_MIME)

/**
 * Clear the panel-drag flag.
 *
 * Chromium never fires `dragend` when the drag source is removed mid-drag,
 * which is exactly what a successful tab drop does — the tree is rebuilt and
 * the tab disappears. So the flag is cleared as soon as a drop is acted on
 * rather than waiting for an event that will not arrive.
 *
 * @returns {void}
 * @sideEffect Writes store state, if the flag was set.
 */
const endPanelDrag = () => {
  const s = useStore.getState()
  if (s.draggingPanel) s.setDraggingPanel(null)
}

// ---------- panel body ----------

/**
 * Render one panel's component.
 *
 * @param {object} props - Component props.
 * @param {string} props.id - Panel id.
 * @returns {React.ReactElement|null} The panel, or `null` for an unknown id.
 * @pure
 */
function PanelBody({ id }) {
  const def = PANELS[id]
  if (!def) return null
  const Component = def.component
  return <Component />
}

// ---------- one tabbed group ----------

/**
 * One tabbed panel group, with its tab strip and drop targets.
 *
 * Inactive panels stay mounted — hidden with `display: none` rather than
 * unmounted — so React Flow keeps its viewport and the charts keep their
 * zoom when you tab away and back.
 *
 * @param {object} props - Component props.
 * @param {object} props.node - The stack node from the layout tree.
 * @returns {React.ReactElement} The panel group.
 * @sideEffect Subscribes to the store.
 */
function DockStack({ node }) {
  const layoutOps = useStore((s) => s.layoutOps)
  const dragging = useStore((s) => s.draggingPanel)
  const focused = useStore((s) => s.focusedPanel)
  const maximized = useStore((s) => s.maximized)
  const [zone, setZone] = useState(null)
  const [tabDrop, setTabDrop] = useState(null)
  const bodyRef = useRef(null)

  const active = node.panels.includes(node.active) ? node.active : node.panels[0]
  const hasFocus = node.panels.includes(focused)

  /**
   * Which of the five drop targets the cursor is over.
   *
   * The outer 28% of each side docks to that side; anything further in tabs
   * the panel into this stack. When the cursor is in two edge bands at once —
   * a corner — the nearer edge wins.
   *
   * @param {React.DragEvent} e - The drag event.
   * @returns {'left'|'right'|'top'|'bottom'|'center'} The target zone.
   * @sideEffect Reads live element geometry.
   */
  const zoneAt = (e) => {
    const r = bodyRef.current?.getBoundingClientRect()
    if (!r) return 'center'
    const fx = (e.clientX - r.left) / r.width
    const fy = (e.clientY - r.top) / r.height
    const edges = [
      ['left', fx], ['right', 1 - fx], ['top', fy], ['bottom', 1 - fy],
    ].filter(([, d]) => d < EDGE_FRACTION).sort((a, b) => a[1] - b[1])
    return edges.length ? edges[0][0] : 'center'
  }

  /**
   * Track which drop zone a panel drag is over, to highlight it.
   *
   * @param {React.DragEvent} e - The drag event.
   * @returns {void}
   * @sideEffect Updates the highlighted zone, and prevents the default only for panel drags — a palette drag must pass through to the canvas.
   */
  const onBodyDragOver = (e) => {
    if (!dragging || !isPanelDrag(e)) return
    e.preventDefault()
    e.stopPropagation()
    setZone(zoneAt(e))
  }

  /**
   * Dock the dragged panel into this stack at the cursor's zone.
   *
   * @param {React.DragEvent} e - The drop event.
   * @returns {void}
   * @sideEffect Restructures and persists the layout, and clears the drag flag. Ignores drops that are not panel drags.
   */
  const onBodyDrop = (e) => {
    if (!dragging || !isPanelDrag(e)) return
    e.preventDefault()
    e.stopPropagation()
    layoutOps.dock(dragging, node.id, zoneAt(e))
    setZone(null)
    endPanelDrag()
  }

  /**
   * Raise the right-click menu against this stack, or against one of its tabs.
   *
   * The event is consumed so a click on a tab does not also raise the window's
   * own menu on the way up.
   *
   * @param {React.MouseEvent} e - The contextmenu event.
   * @param {string|null} [panelId=null] - The tab that was clicked, or `null` for the window itself.
   * @returns {void}
   * @sideEffect Focuses the stack's front panel and opens the context menu.
   */
  const onContextMenu = (e, panelId = null) => {
    e.preventDefault()
    e.stopPropagation()
    const st = useStore.getState()
    if (active) st.focusPanel(active)
    st.openContextMenu(e.clientX, e.clientY, panelId
      ? { kind: 'tab', stackId: node.id, panelId }
      : { kind: 'stack', stackId: node.id })
  }

  return (
    <StackContext.Provider value={node.id}>
    <div
      className={`dock-stack ${hasFocus ? 'focused' : ''}`}
      style={{ flex: `${node.size} 1 0%` }}
      onMouseDownCapture={() => active && useStore.getState().focusPanel(active)}
    >
      <div className="dock-tabs" onContextMenu={onContextMenu}>
        <div className="dock-tabscroll">
        {node.panels.map((pid, idx) => (
          <div
            key={pid}
            className={`dock-tab ${pid === active ? 'active' : ''} ${tabDrop === idx ? 'dropping' : ''}`}
            draggable
            title={panelTitle(pid)}
            onDragStart={(e) => {
              e.dataTransfer.setData(DRAG_MIME, pid)
              e.dataTransfer.effectAllowed = 'move'
              useStore.getState().setDraggingPanel(pid)
            }}
            onDragEnd={() => { endPanelDrag(); setTabDrop(null) }}
            onDragOver={(e) => {
              if (!dragging || !isPanelDrag(e)) return
              e.preventDefault(); e.stopPropagation(); setTabDrop(idx)
            }}
            onDragLeave={() => setTabDrop(null)}
            onDrop={(e) => {
              if (!dragging || !isPanelDrag(e)) return
              e.preventDefault(); e.stopPropagation()
              setTabDrop(null)
              layoutOps.dropOnTab(dragging, node.id, idx)
              endPanelDrag()
            }}
            onClick={() => { layoutOps.activate(node.id, pid); useStore.getState().focusPanel(pid) }}
            onDoubleClick={() => useStore.getState().toggleMaximize(pid)}
            onContextMenu={(e) => onContextMenu(e, pid)}
          >
            <span className="dt-title">{panelTitle(pid)}</span>
            {PANELS[pid]?.closable !== false && (
              <span className="dt-x" title="Close panel"
                onClick={(e) => { e.stopPropagation(); layoutOps.close(pid) }}>✕</span>
            )}
          </div>
        ))}
        </div>
        <button
          className="dock-chrome-btn"
          title="Open this panel in a new browser tab"
          onClick={() => useStore.getState().popOutPanel(active)}
        >⧉</button>
        <button
          className="dock-chrome-btn"
          title={maximized ? 'Restore layout' : 'Maximize this panel'}
          onClick={() => useStore.getState().toggleMaximize(active)}
        >{maximized ? '❐' : '⛶'}</button>
      </div>

      <div
        ref={bodyRef}
        className="dock-body"
        onDragOver={onBodyDragOver}
        onDragLeave={() => setZone(null)}
        onDrop={onBodyDrop}
        onContextMenu={onContextMenu}
      >
        {node.panels.map((pid) => (
          <div key={pid} className="dock-panel" style={{ display: pid === active ? 'flex' : 'none' }}>
            <PanelBody id={pid} />
          </div>
        ))}
        {dragging && zone && <div className={`drop-hint zone-${zone}`} />}
      </div>
    </div>
    </StackContext.Provider>
  )
}

// ---------- splitter between two siblings ----------

/**
 * The draggable divider between two sibling panes.
 *
 * @param {object} props - Component props.
 * @param {string} props.parentId - Id of the split these panes belong to.
 * @param {number} props.index - Index of the pane before the splitter.
 * @param {'row'|'col'} props.dir - Split direction.
 * @param {React.RefObject} props.containerRef - Ref to the split's DOM element, used to measure the panes.
 * @returns {React.ReactElement} The splitter.
 * @sideEffect Subscribes to the store.
 */
function Splitter({ parentId, index, dir, containerRef }) {
  const layoutOps = useStore((s) => s.layoutOps)

  /**
   * Begin a splitter drag.
   *
   * Measures both panes in pixels at mousedown and converts the drag into new
   * flex weights that preserve the pair's combined share, so panes outside
   * the pair never move. Neither pane can be dragged below the minimum size.
   *
   * Listeners go on the window rather than the splitter so the drag survives
   * the cursor outrunning the element, which it easily does.
   *
   * @param {React.MouseEvent} e - The mousedown event.
   * @returns {void}
   * @sideEffect Reads live element geometry, registers window mousemove and mouseup listeners, and adds a class to the body for the duration of the drag.
   */
  const onDown = useCallback((e) => {
    e.preventDefault()
    const el = containerRef.current
    if (!el) return
    const a = el.children[index * 2]
    const b = el.children[index * 2 + 2]
    if (!a || !b) return
    const horiz = dir === 'row'
    const pxA0 = horiz ? a.offsetWidth : a.offsetHeight
    const pxB0 = horiz ? b.offsetWidth : b.offsetHeight
    const total = pxA0 + pxB0
    const start = horiz ? e.clientX : e.clientY
    const wA = parseFloat(a.style.flexGrow) || 1
    const wB = parseFloat(b.style.flexGrow) || 1
    const wTotal = wA + wB

    /**
     * Apply the in-progress splitter drag.
     *
     * @param {MouseEvent} ev - The mousemove event.
     * @returns {void}
     * @sideEffect Resizes and persists the layout on every mouse move.
     * @reads the geometry captured when the drag started.
     */
    const onMove = (ev) => {
      const d = (horiz ? ev.clientX : ev.clientY) - start
      const pxA = Math.max(MIN_PX, Math.min(total - MIN_PX, pxA0 + d))
      const ratio = pxA / total
      layoutOps.resize(parentId, index, wTotal * ratio, wTotal * (1 - ratio))
    }
    /**
     * End the splitter drag and remove its listeners.
     *
     * @returns {void}
     * @sideEffect Removes the window listeners and the body class.
     */
    const onUp = () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      document.body.classList.remove('resizing')
    }
    document.body.classList.add('resizing')
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }, [parentId, index, dir, containerRef, layoutOps])

  return <div className={`dock-splitter ${dir}`} onMouseDown={onDown} />
}

// ---------- recursive node ----------

/**
 * Render a layout node, recursing through splits down to the stacks.
 *
 * Splitters are interleaved between children, which is why the splitter's
 * own measurement code indexes DOM children at `2i`.
 *
 * @param {object} props - Component props.
 * @param {object} props.node - A stack or split node from the layout tree.
 * @returns {React.ReactElement} The rendered subtree.
 * @pure
 */
function DockNode({ node }) {
  const ref = useRef(null)
  if (node.type === 'stack') return <DockStack node={node} />
  return (
    <div ref={ref} className={`dock-split ${node.dir}`} style={{ flex: `${node.size} 1 0%` }}>
      {node.children.map((child, i) => (
        <React.Fragment key={child.id}>
          <DockNode node={child} />
          {i < node.children.length - 1 && (
            <Splitter parentId={node.id} index={i} dir={node.dir} containerRef={ref} />
          )}
        </React.Fragment>
      ))}
    </div>
  )
}

// ---------- workspace edge drop strips ----------

/**
 * The four drop strips along the outer edges of the workspace.
 *
 * Rendered only during a panel drag, so they never intercept anything else.
 *
 * @returns {React.ReactElement|null} The strips, or `null` when no panel is being dragged.
 * @sideEffect Subscribes to the store.
 */
function EdgeDrops() {
  const dragging = useStore((s) => s.draggingPanel)
  const layoutOps = useStore((s) => s.layoutOps)
  const [hot, setHot] = useState(null)
  if (!dragging) return null
  return (
    <>
      {['left', 'right', 'top', 'bottom'].map((edge) => (
        <div
          key={edge}
          className={`edge-drop ${edge} ${hot === edge ? 'hot' : ''}`}
          onDragOver={(e) => {
            if (!isPanelDrag(e)) return
            e.preventDefault(); e.stopPropagation(); setHot(edge)
          }}
          onDragLeave={() => setHot(null)}
          onDrop={(e) => {
            if (!isPanelDrag(e)) return
            e.preventDefault(); e.stopPropagation()
            setHot(null)
            layoutOps.dockEdge(dragging, edge)
            endPanelDrag()
          }}
        />
      ))}
    </>
  )
}

// ---------- root ----------

/**
 * The workspace dock: renders the layout tree, or the maximized panel alone.
 *
 * Installs a safety net for the drag flag. Whatever a drag turns out to be,
 * once it is over the workspace must not be left in docking mode — a stuck
 * flag keeps the edge strips over the window and turns every later palette
 * drag into a panel move. The listeners are on the bubble phase, so a
 * panel's own drop handler has already read the flag before it is cleared.
 *
 * @returns {React.ReactElement} The dock.
 * @sideEffect Subscribes to the store. Registers window drop and dragend listeners, removed on unmount.
 */
export default function DockLayout() {
  const layout = useStore((s) => s.layout)
  const maximized = useStore((s) => s.maximized)

  useEffect(() => {
    /**
     * Clear the drag flag once any drag ends anywhere in the window.
     *
     * @returns {void}
     * @sideEffect Writes store state, if the flag was set.
     */
    const clear = () => endPanelDrag()
    window.addEventListener('drop', clear)
    window.addEventListener('dragend', clear)
    return () => {
      window.removeEventListener('drop', clear)
      window.removeEventListener('dragend', clear)
    }
  }, [])

  if (maximized && PANELS[maximized]) {
    return (
      <div className="dock-root">
        <div className="dock-stack focused" style={{ flex: '1 1 0%' }}>
          <div className="dock-tabs">
            <div className="dock-tabscroll">
              <div className="dock-tab active">
                <span className="dt-title">{panelTitle(maximized)}</span>
              </div>
            </div>
            <button className="dock-chrome-btn" title="Restore layout"
              onClick={() => useStore.getState().toggleMaximize(maximized)}>❐</button>
          </div>
          <div className="dock-body">
            <div className="dock-panel" style={{ display: 'flex' }}>
              <PanelBody id={maximized} />
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (!layout) return <div className="dock-root" />
  return (
    <div className="dock-root">
      <DockNode node={layout} />
      <EdgeDrops />
    </div>
  )
}

// Module-private functions, exposed for the contract test suite only
// (test/contract/*). Not part of this module's public API — application code
// must not import from here, and nothing outside the tests does.
export const __internals = { isPanelDrag, endPanelDrag }
