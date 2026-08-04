// Panel registry — metadata from src/panelMeta.js paired with its component.
//
// Adding a panel to AcouSim means one entry in PANEL_META plus one line here:
// the dock layout, the View menu and the saved-layout sanitizer all read from
// those, so nothing else needs to learn about it. Chart panels are generated
// from the chart registry instead of listed one by one.
import React from 'react'
import { PANEL_META, CHART_IDS } from '../../panelMeta'
import Palette from '../Palette'
import FlowCanvas from '../FlowCanvas'
import ParamPanel from '../ParamPanel'
import NLLab from '../NLLab'
import VelocityPopup from '../VelocityPopup'
import { chartPanelComponent } from '../OutputPanel'

/**
 * The Node Editor panel: the canvas with the velocity popup layered over it.
 *
 * The popup lives here rather than at app level so it is clipped to the
 * canvas and travels with it when the panel is popped out.
 *
 * @returns {React.ReactElement} The canvas panel.
 * @pure
 */
function CanvasPanel() {
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
  palette: Palette,
  canvas: CanvasPanel,
  params: ParamPanel,
  nllab: NLLab,
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
