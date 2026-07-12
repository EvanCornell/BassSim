import React, { useRef } from 'react'
import { useStore } from '../store'

export const TAB_DEFS = {
  editor: { title: 'Node Editor', closable: false },
  nllab: { title: '⚗ Nonlinear Lab', closable: true },
  settings: { title: '⚙ Settings', closable: true },
}

export default function TabBar() {
  const tabs = useStore((s) => s.tabs)
  const activeTab = useStore((s) => s.activeTab)
  const setActiveTab = useStore((s) => s.setActiveTab)
  const closeTab = useStore((s) => s.closeTab)
  const moveTab = useStore((s) => s.moveTab)
  const dragFrom = useRef(null)

  if (tabs.length <= 1) return null // no bar needed for just the editor

  return (
    <div className="tabbar">
      {tabs.map((id, idx) => {
        const def = TAB_DEFS[id] || { title: id, closable: true }
        return (
          <div
            key={id}
            className={`app-tab ${activeTab === id ? 'active' : ''}`}
            draggable
            onDragStart={() => { dragFrom.current = idx }}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => {
              if (dragFrom.current != null && dragFrom.current !== idx) moveTab(dragFrom.current, idx)
              dragFrom.current = null
            }}
            onClick={() => setActiveTab(id)}
          >
            <span>{def.title}</span>
            {def.closable && (
              <span
                className="tab-x"
                title="Close panel"
                onClick={(e) => { e.stopPropagation(); closeTab(id) }}
              >✕</span>
            )}
          </div>
        )
      })}
    </div>
  )
}
