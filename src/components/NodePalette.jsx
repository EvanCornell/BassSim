// The element palette, floating over the top-left of the node editor.
//
// It used to be a docked panel with a paragraph of explanation under every
// entry. That paragraph is read once and then occupies a column of the screen
// forever, and the column was the most valuable one — right beside the canvas.
// What a user actually needs while building is the shortest possible answer to
// "which one is the chamber": its colour, which is the same colour the node
// will be, and its name.
//
// Floating rather than docked because the palette is part of the canvas, not a
// neighbour of it. It travels with the canvas when the panel is popped out,
// and it costs the graph no space that the graph was using — the container
// ignores pointer events, so only the cubes themselves are in the way.
import React from 'react'
import { NODE_KINDS, NODE_DRAG_TYPE } from '../nodeKinds'

/**
 * The floating stack of draggable element cubes.
 *
 * Each cube carries its element's theme colour and name; the long description
 * survives as the tooltip, where it costs nothing until it is wanted.
 *
 * @returns {React.ReactElement} The palette overlay.
 * @pure
 */
export default function NodePalette() {
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
  const onDragStart = (e, type) => {
    e.dataTransfer.setData(NODE_DRAG_TYPE, type)
    e.dataTransfer.effectAllowed = 'move'
  }

  return (
    <div className="node-palette">
      {NODE_KINDS.map((it) => (
        <div
          key={it.type}
          className="np-cube"
          draggable
          title={it.desc}
          onDragStart={(e) => onDragStart(e, it.type)}
        >
          <span className="np-chip" style={{ background: it.color }} />
          <span className="np-name">{it.name}</span>
        </div>
      ))}
    </div>
  )
}
