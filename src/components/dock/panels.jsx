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

function CanvasPanel() {
  return (
    <div className="canvas-wrap">
      <FlowCanvas />
      <VelocityPopup />
    </div>
  )
}

const COMPONENTS = {
  palette: Palette,
  canvas: CanvasPanel,
  params: ParamPanel,
  nllab: NLLab,
  ...Object.fromEntries(CHART_IDS.map((id) => [id, chartPanelComponent(id)])),
}

export const PANELS = Object.fromEntries(
  Object.entries(PANEL_META).map(([id, meta]) => [id, { ...meta, component: COMPONENTS[id] }]),
)

export { PANEL_IDS, panelTitle } from '../../panelMeta'
