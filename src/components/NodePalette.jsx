// The element dock, floating at the bottom centre of the node editor.
//
// One chip per element — its colour, which is the colour its node will be,
// its name, and the key that adds one at the pointer — then the zoom. A
// chip is dragged onto the canvas to place the element. The long
// description survives as the tooltip, where it costs nothing until wanted.
//
// It lives inside the canvas, not beside it: it travels with the canvas
// when the panel is popped out, and it costs the graph no space.
import React from 'react'
import { useReactFlow, useViewport } from 'reactflow'
import { NODE_KINDS, NODE_DRAG_TYPE } from '../nodeKinds'
import { useStore } from '../store'
import { formatCombo } from '../keymap'

/**
 * Start a palette drag, tagging it with the node type to create.
 *
 * The canvas reads `NODE_DRAG_TYPE` on drop, which is what keeps a palette
 * drag from being confused with a panel tab or a file dragged in from the
 * desktop.
 *
 * @param {React.DragEvent} e - The drag event.
 * @param {string} type - Node type being dragged.
 * @returns {void}
 * @mutates Sets data and the allowed effect on the event's dataTransfer.
 */
function onDragStart(e, type) {
  e.dataTransfer.setData(NODE_DRAG_TYPE, type)
  e.dataTransfer.effectAllowed = 'move'
}

/**
 * The element dock: draggable element chips with their shortcut keys, and the zoom.
 *
 * Must be rendered inside the canvas's React Flow provider, which the zoom
 * reads and drives.
 *
 * @returns {React.ReactElement} The dock.
 * @sideEffect Subscribes to the store and to the canvas viewport.
 */
export default function NodePalette() {
  const bindings = useStore((s) => s.bindings)
  const { zoomIn, zoomOut, fitView } = useReactFlow()
  const { zoom } = useViewport()
  return (
    <div className="np-dock" onContextMenu={(e) => e.stopPropagation()}>
      {NODE_KINDS.map((it) => {
        const key = bindings[`add.${it.type}`]?.[0]
        return (
          <div
            key={it.type}
            className="np-cube"
            draggable
            title={`${it.desc}${key ? `\n\nDrag onto the canvas, or press ${formatCombo(key)} to add one at the pointer.` : ''}`}
            onDragStart={(e) => onDragStart(e, it.type)}
          >
            <span className="np-chip" style={{ background: it.color }} />
            <span className="np-name">{it.short || it.name}</span>
            {key && <span className="np-key">{formatCombo(key)}</span>}
          </div>
        )
      })}
      <span className="np-sep" />
      <div className="np-zoom">
        <button title="Zoom out" onClick={() => zoomOut({ duration: 150 })}>−</button>
        <span className="np-pct" title="Zoom">{Math.round(zoom * 100)}%</span>
        <button title="Zoom in" onClick={() => zoomIn({ duration: 150 })}>+</button>
        <button title="Fit the whole graph in view" onClick={() => fitView({ duration: 200, padding: 0.15 })}>⤢</button>
      </div>
    </div>
  )
}
