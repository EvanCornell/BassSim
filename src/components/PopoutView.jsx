// The whole page when SpeakerSpice is loaded at panel?id=…: one panel — or one
// docked window's worth of them — full-window, for dragging onto a second
// monitor.
//
// No menu bar, no dock, no quick bar — those belong to the main window. State
// arrives over the BroadcastChannel wired up in store.js, so the panels behave
// exactly as they do when docked.
//
// A tab strip appears only when the window holds more than one panel. It is
// deliberately not a dock: tabs here cannot be dragged, split or closed,
// because the arrangement lives in the main window and a second authority over
// it would be a second thing to keep in step.
import React, { useEffect } from 'react'
import { useStore } from '../store'
import { popoutPanelId, popoutPanelIds } from '../popout'
import { panelTitle } from '../panelMeta'
import { PANELS } from './dock/panels'
import ContextMenu from './ContextMenu'

/**
 * The whole page when panels are opened in their own browser tab.
 *
 * Renders one panel full-window, or a tab strip over several when a whole
 * docked window was popped out. Inactive panels stay mounted — hidden rather
 * than unmounted — so a chart keeps its zoom when you tab away and back, which
 * is what the dock does too.
 *
 * An unknown panel id renders an explanation rather than a blank page, since a
 * stale bookmark to a removed panel is the likely cause.
 *
 * @returns {React.ReactElement} The panels, or a message naming the unknown one.
 * @sideEffect Subscribes to the store, reads `window.location`, and sets `document.title` to track the project name.
 */
export default function PopoutView() {
  // What this tab holds lives in the store rather than being read back off the
  // URL, because it changes: views can be added to a popped-out tab and closed
  // from it, exactly as in a docked window.
  const held = useStore((s) => s.popoutIds)
  const stored = useStore((s) => s.popoutActive)
  const ids = held.filter((id) => PANELS[id]?.component)
  const active = ids.includes(stored) ? stored : (ids.includes(popoutPanelId()) ? popoutPanelId() : ids[0])
  const projectName = useStore((s) => s.projectName)
  const results = useStore((s) => s.results)

  /**
   * Raise the right-click menu for this tab.
   *
   * A popped-out tab has no dock, so the menu it gets is its own: add a view
   * here beside the others, switch which is in front, send one to a further
   * tab, or hand them back to the main window. Panels that raise their own
   * menu — the node editor — consume the event before it reaches here.
   *
   * @param {React.MouseEvent} e - The contextmenu event.
   * @returns {void}
   * @sideEffect Opens the context menu.
   */
  const onContextMenu = (e) => {
    e.preventDefault()
    useStore.getState().openContextMenu(e.clientX, e.clientY, { kind: 'popout', ids, panelId: active })
  }

  useEffect(() => {
    document.title = `${active ? panelTitle(active) : 'Panel'} — ${projectName || 'SpeakerSpice'}`
  }, [active, projectName])

  if (!ids.length) {
    return (
      <div className="popout">
        <div className="popout-title"><span>Unknown panel</span></div>
        <div className="popout-body" style={{ padding: 24, color: 'var(--text-3)' }}>
          No panel named “{popoutPanelIds().join(', ') || '?'}”. Open one from the View menu in the main SpeakerSpice window.
        </div>
      </div>
    )
  }

  return (
    <div className="popout" onContextMenu={onContextMenu}>
      <div className="popout-title">
        <span className="pt-name">{panelTitle(active)}</span>
        <span className="pt-project">{projectName}</span>
        {/* Nothing arrives until the main window broadcasts, which is instant
            in practice but worth saying out loud if that window is gone. */}
        {!results && <span className="pt-wait">waiting for the main SpeakerSpice window…</span>}
      </div>
      {ids.length > 1 && (
        <div className="popout-tabs">
          {ids.map((id) => (
            <button
              key={id}
              className={`popout-tab ${id === active ? 'active' : ''}`}
              onClick={() => { useStore.getState().setPopoutActive(id); useStore.getState().focusPanel(id) }}
            >
              {panelTitle(id)}
              <span
                className="dt-x"
                title="Close this view — it goes back to the main window"
                onClick={(e) => { e.stopPropagation(); useStore.getState().closeViewInPopout(id) }}
              >✕</span>
            </button>
          ))}
        </div>
      )}
      <div className="popout-body">
        {ids.map((id) => {
          const Component = PANELS[id].component
          return (
            <div key={id} className="dock-panel" style={{ display: id === active ? 'flex' : 'none' }}>
              <Component />
            </div>
          )
        })}
      </div>
      <ContextMenu />
    </div>
  )
}
