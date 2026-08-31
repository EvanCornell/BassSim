import React, { useCallback, useEffect, useRef, useState } from 'react'
import ReactFlow, { Background, Controls, MiniMap, useReactFlow, ReactFlowProvider } from 'reactflow'
import { useStore } from '../store'
import { nodeTypes } from './nodes'
import { useStackId } from './dock/stackContext'
import { distance, marqueeRect, nodesInMarquee, MARQUEE_THRESHOLD } from '../selection'
import { NODE_DRAG_TYPE } from '../nodeKinds'

/**
 * Whether a proposed edge is allowed.
 *
 * React Flow already enforces source-to-target, which is what keeps the
 * pressure-out to pressure-in pairing correct. The only extra rule is that
 * a node may not connect to itself.
 *
 * @param {{source: string, target: string}} conn - The proposed connection.
 * @returns {boolean} True when the edge may be created.
 * @pure
 */
function isValidConnection(conn) {
  return conn.source !== conn.target
}

/**
 * Discard the one `contextmenu` event that trails a completed right-drag.
 *
 * The browser fires it whatever the drag was for, and on whatever element the
 * pointer happened to be over when the button came up — which after a sweep
 * across the workspace is often not the canvas at all. Left alone it raises
 * that element's menu on top of the selection just made.
 *
 * Swallowed at the window in the capture phase, so the event never reaches the
 * handler that would act on it, and only ever once: the listener stands down
 * on the next turn of the loop whether or not the event arrived, which is what
 * keeps a drag that ends outside the window from eating a later, deliberate
 * right-click.
 *
 * @returns {void}
 * @sideEffect Registers a one-shot window contextmenu listener and schedules its removal.
 */
function swallowNextContextMenu() {
  /**
   * Consume the trailing event.
   *
   * @param {MouseEvent} e - The contextmenu event.
   * @returns {void}
   * @sideEffect Prevents the event's default and stops it propagating.
   */
  const eat = (e) => { e.preventDefault(); e.stopPropagation() }
  window.addEventListener('contextmenu', eat, { capture: true, once: true })
  setTimeout(() => window.removeEventListener('contextmenu', eat, true), 0)
}

/**
 * The node editor canvas.
 *
 * Must render inside a `ReactFlowProvider`, which is why `FlowCanvas` wraps
 * it — `useReactFlow` is only available below the provider.
 *
 * Tracks the pointer so a keyboard-added node can land where the user is
 * looking, and publishes that as `_flowApi` on the store for
 * `addNodeAtCursor` to read.
 *
 * The right mouse button does two jobs here, told apart by how far it travels:
 * a click raises the context menu, a drag sweeps a marquee over the elements
 * it crosses. Panning is therefore restricted to the left and middle buttons,
 * so a right-drag is unambiguously a selection.
 *
 * @returns {React.ReactElement} The canvas.
 * @sideEffect Subscribes to the store, writes `_flowApi` into it on mount and clears it on unmount, and tracks pointer position in a ref.
 */
function CanvasInner() {
  const nodes = useStore((s) => s.nodes)
  const edges = useStore((s) => s.edges)
  const onNodesChange = useStore((s) => s.onNodesChange)
  const onEdgesChange = useStore((s) => s.onEdgesChange)
  const onConnect = useStore((s) => s.onConnect)
  const addNode = useStore((s) => s.addNode)
  const setSelected = useStore((s) => s.setSelected)
  const { screenToFlowPosition } = useReactFlow()
  const stackId = useStackId()
  const wrapper = useRef(null)
  const pointer = useRef(null)
  // The marquee in wrapper-relative pixels, for the overlay. The selection
  // itself is computed in canvas coordinates, so it stays correct under a zoom
  // that changes mid-drag.
  const [marquee, setMarquee] = useState(null)
  const lasso = useRef(null)

  useEffect(() => {
    /**
     * Where a keyboard-added node should land, in canvas coordinates.
     *
     * Under the pointer when it is over the canvas, otherwise the middle of the
     * visible area — so a shortcut pressed with the mouse elsewhere still puts
     * the node somewhere sensible.
     *
     * @returns {{x: number, y: number}|null} Canvas position, or `null` before the wrapper has mounted.
     * @sideEffect Reads live element geometry and the tracked pointer position.
     */
    const dropPoint = () => {
      const rect = wrapper.current?.getBoundingClientRect()
      if (!rect) return null
      const p = pointer.current
      const inside = p && p.x >= rect.left && p.x <= rect.right && p.y >= rect.top && p.y <= rect.bottom
      return screenToFlowPosition(inside ? p : { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 })
    }
    useStore.setState({ _flowApi: { dropPoint } })
    return () => useStore.setState({ _flowApi: null })
  }, [screenToFlowPosition])

  /**
   * Create a node from a palette drag dropped on the canvas.
   *
   * Ignores drops that do not carry the palette's own data type, so a file or
   * a text selection dragged onto the canvas does nothing.
   *
   * @param {React.DragEvent} e - The drop event.
   * @returns {void}
   * @sideEffect Adds a node to the graph and returns keyboard focus to the canvas — the drag began in the palette, which took focus with it, and the node just dropped should be immediately copyable.
   */
  const onDrop = useCallback((e) => {
    e.preventDefault()
    const type = e.dataTransfer.getData(NODE_DRAG_TYPE)
    if (!type) return
    const pos = screenToFlowPosition({ x: e.clientX, y: e.clientY })
    addNode(type, pos)
    useStore.getState().focusPanel('canvas')
  }, [screenToFlowPosition, addNode])

  /**
   * Begin a right-drag, which may turn out to be a marquee or a click.
   *
   * Nothing is committed at mousedown: which of the two this is only becomes
   * clear once the pointer has moved, or failed to. Listeners go on the window
   * rather than the canvas so the drag survives the cursor leaving it, which a
   * sweep across the whole graph routinely does.
   *
   * @param {React.MouseEvent} e - The mousedown event.
   * @returns {void}
   * @sideEffect Reads live element geometry and registers window mousemove and mouseup listeners, both removed when the drag ends.
   */
  const onRightDown = (e) => {
    if (e.button !== 2) return
    // A right-press on an element is aimed at that element's menu, not at a
    // marquee that would start underneath it.
    if (e.target?.closest?.('.react-flow__node, .react-flow__edge')) return
    const rect = wrapper.current?.getBoundingClientRect()
    if (!rect) return
    const start = { x: e.clientX, y: e.clientY }
    lasso.current = { start, startFlow: screenToFlowPosition(start), rect, moved: false, additive: e.shiftKey }

    /**
     * Grow the marquee, once the pointer has moved far enough to mean one.
     *
     * @param {MouseEvent} ev - The mousemove event.
     * @returns {void}
     * @sideEffect Updates the overlay rectangle.
     * @mutates The in-progress drag record.
     */
    const onMove = (ev) => {
      const d = lasso.current
      if (!d) return
      const here = { x: ev.clientX, y: ev.clientY }
      if (!d.moved && distance(d.start, here) < MARQUEE_THRESHOLD) return
      d.moved = true
      setMarquee(marqueeRect(
        { x: d.start.x - d.rect.left, y: d.start.y - d.rect.top },
        { x: here.x - d.rect.left, y: here.y - d.rect.top },
      ))
    }
    /**
     * Finish the gesture: select what the marquee caught, or let the menu open.
     *
     * @param {MouseEvent} ev - The mouseup event.
     * @returns {void}
     * @sideEffect Removes the window listeners, clears the overlay, swallows the trailing contextmenu event and — for a drag — replaces the node selection.
     * @mutates The in-progress drag record.
     */
    const onUp = (ev) => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      const d = lasso.current
      lasso.current = null
      setMarquee(null)
      const st = useStore.getState()
      if (!d?.moved) {
        // A plain right-click. On platforms that fire `contextmenu` at
        // mousedown the event has already been held back by `openMenu`, and
        // raising the menu is this handler's job; where it fires at mouseup it
        // has not arrived yet and will raise the menu itself.
        if (d?.held) st.openContextMenu(d.held.x, d.held.y, d.held.target)
        return
      }
      swallowNextContextMenu()
      const rect = marqueeRect(d.startFlow, screenToFlowPosition({ x: ev.clientX, y: ev.clientY }))
      st.setSelection(nodesInMarquee(st.nodes, rect), d.additive)
      st.focusPanel('canvas')
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  /**
   * Raise the context menu against something on the canvas.
   *
   * Held back rather than raised when a right-press on the background is still
   * in progress, because the two platforms disagree about when `contextmenu`
   * arrives: Windows fires it once the button comes up, by which time a drag
   * has declared itself, but Linux and macOS fire it at mousedown — before
   * anyone can know whether this is a click or the start of a marquee. Raising
   * it there would put a menu over every sweep the user drew. So when a gesture
   * is pending the menu is stashed on it, and the mouseup that finds no
   * movement is what finally opens it.
   *
   * The event is consumed either way, so the docked window's own menu does not
   * open behind this one on the way up.
   *
   * @param {React.MouseEvent} e - The contextmenu event.
   * @param {object} target - What was clicked: `{kind: 'pane'|'node'|'edge', …}`.
   * @returns {void}
   * @sideEffect Focuses the canvas and either opens the context menu or defers it to the pending gesture.
   * @mutates The in-progress drag record, when there is one.
   */
  const openMenu = (e, target) => {
    e.preventDefault()
    e.stopPropagation()
    const st = useStore.getState()
    st.focusPanel('canvas')
    const full = {
      ...target,
      stackId,
      flowPos: screenToFlowPosition({ x: e.clientX, y: e.clientY }),
    }
    if (lasso.current) {
      lasso.current.held = { x: e.clientX, y: e.clientY, target: full }
      return
    }
    st.openContextMenu(e.clientX, e.clientY, full)
  }

  return (
    <div
      ref={wrapper}
      style={{ width: '100%', height: '100%', position: 'relative' }}
      onPointerMove={(e) => { pointer.current = { x: e.clientX, y: e.clientY } }}
      onPointerLeave={() => { pointer.current = null }}
      onMouseDown={onRightDown}
    >
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        isValidConnection={isValidConnection}
        onDrop={onDrop}
        onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move' }}
        onNodeClick={(_, n) => setSelected(n.id)}
        onNodeContextMenu={(e, n) => {
          // Right-clicking outside the current selection retargets it, so Cut,
          // Copy and Delete act on the node under the cursor rather than on
          // whatever happened to be selected before.
          if (!n.selected) useStore.getState().setSelection([n.id])
          else setSelected(n.id)
          openMenu(e, { kind: 'node', nodeId: n.id })
        }}
        onEdgeContextMenu={(e, ed) => openMenu(e, { kind: 'edge', edgeId: ed.id })}
        onPaneContextMenu={(e) => openMenu(e, { kind: 'pane' })}
        onPaneClick={() => setSelected(null)}
        deleteKeyCode={null}
        // The right button draws the marquee, so panning is left and middle
        // only — sharing the button would make every sweep also move the view.
        panOnDrag={[0, 1]}
        // React Flow defaults additive selection to Meta alone, which leaves
        // Windows and Linux with no way to click a second node — and without a
        // multi-node selection, copying a subgraph is unreachable.
        multiSelectionKeyCode={['Meta', 'Control']}
        selectionKeyCode="Shift"
        selectionOnDrag={false}
        fitView
        minZoom={0.15}
        maxZoom={2.5}
        proOptions={{ hideAttribution: true }}
        defaultEdgeOptions={{ style: { stroke: '#5598e7' } }}
      >
        <Background color="#232b3a" gap={22} />
        <Controls position="bottom-left" />
        <MiniMap
          position="bottom-right"
          pannable zoomable
          style={{ background: 'var(--surface)' }}
          nodeColor={(n) => ({ driver: '#3987e5', chamber: '#199e70', waveguide: '#c98500', pr: '#9085e9', radiation: '#d55181' }[n.type] || '#888')}
          maskColor="rgba(13,17,23,0.7)"
        />
      </ReactFlow>
      {marquee && (
        <div
          className="rf-marquee"
          style={{ left: marquee.x, top: marquee.y, width: marquee.w, height: marquee.h }}
        />
      )}
    </div>
  )
}

/**
 * The Node Editor panel, wrapping the canvas in its React Flow provider.
 *
 * @returns {React.ReactElement} The canvas panel.
 * @pure
 */
export default function FlowCanvas() {
  return (
    <ReactFlowProvider>
      <CanvasInner />
    </ReactFlowProvider>
  )
}

// Module-private functions, exposed for the contract test suite only
// (test/contract/*). Not part of this module's public API — application code
// must not import from here, and nothing outside the tests does.
export const __internals = { isValidConnection }
