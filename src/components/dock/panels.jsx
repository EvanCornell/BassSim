// Panel registry — metadata from src/panelMeta.js paired with its component.
//
// Adding a panel to AcouSim means one entry in PANEL_META plus one line here:
// the dock layout, the View menu and the saved-layout sanitizer all read from
// those, so nothing else needs to learn about it.
import React from 'react'
import { PANEL_META } from '../../panelMeta'
import Palette from '../Palette'
import FlowCanvas from '../FlowCanvas'
import ParamPanel from '../ParamPanel'
import OutputPanel from '../OutputPanel'
import NLLab from '../NLLab'
import VelocityPopup from '../VelocityPopup'

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
  results: OutputPanel,
  nllab: NLLab,
}

export const PANELS = Object.fromEntries(
  Object.entries(PANEL_META).map(([id, meta]) => [id, { ...meta, component: COMPONENTS[id] }]),
)

export { PANEL_IDS, panelTitle } from '../../panelMeta'
