import React, { useCallback, useEffect, useRef } from 'react'
import ReactFlow, { Background, Controls, MiniMap, useReactFlow, ReactFlowProvider } from 'reactflow'
import { useStore } from '../store'
import { nodeTypes } from './nodes'

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
 * The node editor canvas.
 *
 * Must render inside a `ReactFlowProvider`, which is why `FlowCanvas` wraps
 * it — `useReactFlow` is only available below the provider.
 *
 * Tracks the pointer so a keyboard-added node can land where the user is
 * looking, and publishes that as `_flowApi` on the store for
 * `addNodeAtCursor` to read.
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
  const wrapper = useRef(null)
  const pointer = useRef(null)

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

  return (
    <div
      ref={wrapper}
      style={{ width: '100%', height: '100%' }}
      onPointerMove={(e) => { pointer.current = { x: e.clientX, y: e.clientY } }}
      onPointerLeave={() => { pointer.current = null }}
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
        onNodeContextMenu={(e, n) => { e.preventDefault(); setSelected(n.id) }}
        onPaneClick={() => setSelected(null)}
        deleteKeyCode={null}
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
