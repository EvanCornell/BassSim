// The whole page when AcouSim is loaded at /panel?id=<panel>: one panel,
// full-window, for dragging onto a second monitor.
//
// No menu bar, no dock, no quick bar — those belong to the main window. State
// arrives over the BroadcastChannel wired up in store.js, so the panel behaves
// exactly as it does when docked.
import React, { useEffect } from 'react'
import { useStore } from '../store'
import { popoutPanelId } from '../popout'
import { panelTitle } from '../panelMeta'
import { PANELS } from './dock/panels'

export default function PopoutView() {
  const id = popoutPanelId()
  const def = PANELS[id]
  const projectName = useStore((s) => s.projectName)
  const results = useStore((s) => s.results)

  useEffect(() => {
    document.title = `${panelTitle(id)} — ${projectName || 'AcouSim'}`
  }, [id, projectName])

  if (!def?.component) {
    return (
      <div className="popout">
        <div className="popout-title"><span>Unknown panel</span></div>
        <div className="popout-body" style={{ padding: 24, color: 'var(--text-3)' }}>
          No panel named “{id}”. Open one from the View menu in the main AcouSim window.
        </div>
      </div>
    )
  }

  const Component = def.component
  return (
    <div className="popout">
      <div className="popout-title">
        <span className="pt-name">{panelTitle(id)}</span>
        <span className="pt-project">{projectName}</span>
        {/* Nothing arrives until the main window broadcasts, which is instant
            in practice but worth saying out loud if that window is gone. */}
        {!results && <span className="pt-wait">waiting for the main AcouSim window…</span>}
      </div>
      <div className="popout-body">
        <div className="dock-panel" style={{ display: 'flex' }}>
          <Component />
        </div>
      </div>
    </div>
  )
}
