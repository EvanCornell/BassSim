// Panel registry — metadata from src/panelMeta.js paired with its component.
//
// Adding a panel to SpeakerSpice means one entry in PANEL_META plus one line here:
// the dock layout, the View menu and the saved-layout sanitizer all read from
// those, so nothing else needs to learn about it. Chart panels are generated
// from the chart registry instead of listed one by one.
import React from 'react'
import { PANEL_META, CHART_IDS } from '../../panelMeta'
import { useStore } from '../../store'
import FileBrowser from '../FileBrowser'
import FlowCanvas from '../FlowCanvas'
import ParamPanel from '../ParamPanel'
import WiringPanel from '../WiringPanel'
import VariablesPanel from '../VariablesPanel'
import ProbesPanel from '../ProbesPanel'
import VelocityPopup from '../VelocityPopup'
import { chartPanelComponent } from '../OutputPanel'
import { readOnlyWhenLocked } from '../Records'

/**
 * The Node Editor panel: the canvas with the palette and popup layered over it.
 *
 * Both overlays live here rather than at app level so they are clipped to the
 * canvas and travel with it when the panel is popped out — a popped-out node
 * editor that could not add nodes would be a strange thing to hand someone.
 *
 * With no project open the canvas is replaced rather than merely emptied.
 * Every edit belongs to a file; a graph that belongs to none is the one thing
 * a user can build and then lose, so there is nothing to build on until a
 * project is chosen.
 *
 * @returns {React.ReactElement} The canvas panel, or the empty state when no project is open.
 * @sideEffect Subscribes to the store.
 */
function CanvasPanel() {
  const activeFile = useStore((s) => s.activeFile)
  if (!activeFile) {
    return (
      <div className="canvas-wrap">
        <div className="no-project">
          <h4>No project open</h4>
          <p>
            Every design lives in a file in your workspace. Open one from the
            Workspace panel, or start a new one.
          </p>
          <button className="primary" onClick={() => useStore.getState().newFile('')}>New project</button>
        </div>
      </div>
    )
  }
  return (
    <div className="canvas-wrap">
      <FlowCanvas />
      <VelocityPopup />
    </div>
  )
}

/**
 * Panel id to component. Chart panels are generated from the chart registry
 * rather than listed one by one.
 */
const COMPONENTS = {
  files: FileBrowser,
  canvas: CanvasPanel,
  // Every panel that edits the project is disabled while an earlier record
  // is selected and locked.
  params: readOnlyWhenLocked(ParamPanel),
  wiring: readOnlyWhenLocked(WiringPanel),
  vars: readOnlyWhenLocked(VariablesPanel),
  probes: readOnlyWhenLocked(ProbesPanel),
  ...Object.fromEntries(CHART_IDS.map((id) => [id, chartPanelComponent(id)])),
}

/**
 * The panel registry: each panel's metadata paired with its component.
 *
 * Adding a panel means one entry in `PANEL_META` plus one line in
 * `COMPONENTS` — the dock, the View menu and the saved-layout sanitizer all
 * read from these, so nothing else needs to learn about it.
 */
export const PANELS = Object.fromEntries(
  Object.entries(PANEL_META).map(([id, meta]) => [id, { ...meta, component: COMPONENTS[id] }]),
)

export { PANEL_IDS, panelTitle } from '../../panelMeta'
