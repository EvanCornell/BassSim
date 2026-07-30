import React, { useCallback, useEffect, useRef } from 'react'
import ReactFlow, { Background, Controls, MiniMap, useReactFlow, ReactFlowProvider } from 'reactflow'
import { useStore } from '../store'
import { nodeTypes } from './nodes'

// Ports are directional: React Flow only lets a source handle connect to a
// target handle, which enforces the pressure-out → pressure-in pairing.
// Extra rule: never connect a node to itself.
function isValidConnection(conn) {
  return conn.source !== conn.target
}

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

  // Publish where a keyboard-added node should land: under the pointer if it
  // is over the canvas, otherwise the middle of the visible canvas.
  useEffect(() => {
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

  const onDrop = useCallback((e) => {
    e.preventDefault()
    const type = e.dataTransfer.getData('application/acousim-node')
    if (!type) return
    const pos = screenToFlowPosition({ x: e.clientX, y: e.clientY })
    addNode(type, pos)
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

export default function FlowCanvas() {
  return (
    <ReactFlowProvider>
      <CanvasInner />
    </ReactFlowProvider>
  )
}
