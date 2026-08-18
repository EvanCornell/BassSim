import React, { useCallback, useEffect, useRef, useState } from 'react'
import ReactFlow, { Background, Controls, MiniMap, useReactFlow, ReactFlowProvider } from 'reactflow'
import { useStore } from '../store'
import { nodeTypes } from './nodes'
import { useStackId } from './dock/stackContext'
import { distance, marqueeRect, nodesInMarquee, MARQUEE_THRESHOLD } from '../selection'

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
 * Elements a press must miss for it to mean "drag a box over the background".
 *
 * A press on any of these is already about that thing — moving a node, pulling
 * a connection, working the zoom controls — and starting a marquee underneath
 * it would fight whatever the user actually meant.
 */
const NOT_BACKGROUND = [
  '.react-flow__node',
  '.react-flow__edge',
  '.react-flow__handle',
  '.react-flow__controls',
  '.react-flow__minimap',
  '.react-flow__panel',
].join(', ')

/**
 * Discard the one `click` event that trails a completed marquee drag.
 *
 * A press and release on the same element is a click whatever happened in
 * between, so the browser fires one at the end of every sweep. React Flow's
 * pane handles that click by clearing the selection — which is right for a
 * click on empty space and exactly wrong here, since it would wipe the
 * selection the sweep had just made.
 *
 * Swallowed at the window in the capture phase, so the event never reaches the
 * handler that would act on it, and only ever once: the listener stands down on
 * the next turn of the loop whether or not the event arrived, so a drag that
 * ends outside the window cannot eat a later, deliberate click.
 *
 * @returns {void}
 * @sideEffect Registers a one-shot window click listener and schedules its removal.
 */
function swallowNextClick() {
  /**
   * Consume the trailing event.
   *
   * @param {MouseEvent} e - The click event.
   * @returns {void}
   * @sideEffect Stops the event propagating to the handlers that would act on it.
   */
  const eat = (e) => { e.stopPropagation(); e.preventDefault() }
  window.addEventListener('click', eat, { capture: true, once: true })
  setTimeout(() => window.removeEventListener('click', eat, true), 0)
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
 * The mouse follows the convention every other node editor uses: dragging the
 * background with the left button sweeps a marquee over the elements it
 * crosses, the middle button — or the left with Space held — pans, and the
 * right button raises the context menu. Left-dragging cannot both select and
 * pan, so panning is what moves aside.
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
  // Space turns the left button back into a pan, which React Flow handles
  // itself — so the marquee has to know to stand aside for it.
  const panKeyHeld = useRef(false)

  useEffect(() => {
    /**
     * Note that Space is down, which makes the left button pan.
     *
     * @param {KeyboardEvent} e - The keydown event.
     * @returns {void}
     * @mutates The held-key flag.
     */
    const down = (e) => { if (e.code === 'Space') panKeyHeld.current = true }
    /**
     * Note that Space is up.
     *
     * @param {KeyboardEvent} e - The keyup event.
     * @returns {void}
     * @mutates The held-key flag.
     */
    const up = (e) => { if (e.code === 'Space') panKeyHeld.current = false }
    /**
     * Forget the key when the window loses focus.
     *
     * A keyup delivered to another window never arrives here, which would
     * otherwise leave the canvas convinced Space is still down.
     *
     * @returns {void}
     * @mutates The held-key flag.
     */
    const clear = () => { panKeyHeld.current = false }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    window.addEventListener('blur', clear)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
      window.removeEventListener('blur', clear)
    }
  }, [])

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
    const type = e.dataTransfer.getData('application/acousim-node')
    if (!type) return
    const pos = screenToFlowPosition({ x: e.clientX, y: e.clientY })
    addNode(type, pos)
    useStore.getState().focusPanel('canvas')
  }, [screenToFlowPosition, addNode])

  /**
   * Begin a left-drag on the background, which may turn out to be a marquee.
   *
   * Nothing is committed at mousedown: whether this is a marquee or a plain
   * click on empty space only becomes clear once the pointer has moved, or
   * failed to. Listeners go on the window rather than the canvas so the drag
   * survives the cursor leaving it, which a sweep across the whole graph
   * routinely does.
   *
   * @param {React.MouseEvent} e - The mousedown event.
   * @returns {void}
   * @sideEffect Reads live element geometry and registers window mousemove and mouseup listeners, both removed when the drag ends.
   */
  const onPaneDown = (e) => {
    if (e.button !== 0) return
    // Space means the user asked to pan; React Flow is already handling that
    // drag, and a marquee drawn over it would be two gestures at once.
    if (panKeyHeld.current) return
    if (e.target?.closest?.(NOT_BACKGROUND)) return
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
     * Finish the gesture: select what the marquee caught, if it was one.
     *
     * A press that never moved is a plain click on empty space, which React
     * Flow's own pane handler already treats as clearing the selection.
     *
     * @param {MouseEvent} ev - The mouseup event.
     * @returns {void}
     * @sideEffect Removes the window listeners, clears the overlay and — for a drag — swallows the trailing click and replaces the node selection.
     * @mutates The in-progress drag record.
     */
    const onUp = (ev) => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      const d = lasso.current
      lasso.current = null
      setMarquee(null)
      if (!d?.moved) return
      swallowNextClick()
      const rect = marqueeRect(d.startFlow, screenToFlowPosition({ x: ev.clientX, y: ev.clientY }))
      const st = useStore.getState()
      st.setSelection(nodesInMarquee(st.nodes, rect), d.additive)
      st.focusPanel('canvas')
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  /**
   * Raise the context menu against something on the canvas.
   *
   * The event is consumed so the docked window's own menu does not open behind
   * this one on the way up.
   *
   * Nothing has to be told apart here: selection is the left button's job, so
   * the right button means the menu and only the menu, whether the platform
   * fires `contextmenu` at mousedown or at mouseup.
   *
   * @param {React.MouseEvent} e - The contextmenu event.
   * @param {object} target - What was clicked: `{kind: 'pane'|'node'|'edge', …}`.
   * @returns {void}
   * @sideEffect Focuses the canvas and opens the context menu.
   */
  const openMenu = (e, target) => {
    e.preventDefault()
    e.stopPropagation()
    const st = useStore.getState()
    st.focusPanel('canvas')
    st.openContextMenu(e.clientX, e.clientY, {
      ...target,
      stackId,
      flowPos: screenToFlowPosition({ x: e.clientX, y: e.clientY }),
    })
  }

  return (
    <div
      ref={wrapper}
      style={{ width: '100%', height: '100%', position: 'relative' }}
      onPointerMove={(e) => { pointer.current = { x: e.clientX, y: e.clientY } }}
      onPointerLeave={() => { pointer.current = null }}
      onMouseDown={onPaneDown}
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
        // The left button draws the marquee, so dragging the view is the middle
        // button's job — or the left button with Space held, which is what
        // `panActivationKeyCode` gives for free.
        panOnDrag={[1]}
        panActivationKeyCode="Space"
        // React Flow defaults additive selection to Meta alone, which leaves
        // Windows and Linux with no way to click a second node — and without a
        // multi-node selection, copying a subgraph is unreachable.
        multiSelectionKeyCode={['Meta', 'Control']}
        // Both of React Flow's own box-selection routes are off: the marquee
        // below owns the gesture, and it also moves `selectedNodeId` so the
        // Parameters panel follows what was just swept up, which React Flow's
        // selection has no way to do.
        selectionKeyCode={null}
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
