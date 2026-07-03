import React from 'react'
import { Handle, Position } from 'reactflow'
import { useStore } from '../store'
import { C_AIR, flareCutoff, endCorrectionLength } from '../engine/acoustics'

const NODE_COLORS = {
  driver: 'var(--s1)',
  chamber: 'var(--s2)',
  waveguide: 'var(--s3)',
  pr: 'var(--s4)',
  radiation: 'var(--s5)',
}

function useWarnings(id) {
  return useStore((s) => s.results?.validation?.warnings?.[id])
}

function Head({ type, label, warn }) {
  return (
    <div className="node-head">
      <span className="pi-dot" style={{ background: NODE_COLORS[type] }} />
      {label}
      {warn && <span className="warn-dot" title={warn.join('\n')} />}
    </div>
  )
}

export function DriverNode({ id, data, selected }) {
  const warn = useWarnings(id)
  const p = data.params
  return (
    <div className={`acou-node ${selected ? 'selected' : ''}`}>
      <Head type="driver" label={p.label || 'Driver'} warn={warn} />
      <div className="node-body">
        Fs <span className="node-readout">{p.Fs} Hz</span> · Qts <span className="node-readout">{p.Qts}</span><br />
        Sd <span className="node-readout">{p.Sd} cm²</span>
        {p.count > 1 && <> · <span className="node-readout">{p.count}× {p.wiring}</span></>}
      </div>
      <Handle type="source" position={Position.Right} id="front" style={{ top: '35%' }} title="Front acoustic output" />
      <Handle type="source" position={Position.Left} id="rear" style={{ top: '35%' }} title="Rear acoustic output" />
      <span className="handle-label" style={{ right: 4, top: 'calc(35% - 17px)' }}>front</span>
      <span className="handle-label" style={{ left: 4, top: 'calc(35% - 17px)' }}>rear</span>
    </div>
  )
}

export function ChamberNode({ id, data, selected }) {
  const warn = useWarnings(id)
  const p = data.params
  const fRes = C_AIR / (2 * (p.length / 100)) // first λ/2 standing wave
  return (
    <div className={`acou-node ${selected ? 'selected' : ''}`}>
      <Head type="chamber" label={p.label || 'Chamber'} warn={warn} />
      <div className="node-body">
        <span className="node-readout">{p.volume} L</span> · L {p.length} cm<br />
        1st mode <span className="node-readout">{fRes.toFixed(0)} Hz</span> · Q {p.lossless ? '∞' : p.Q}
      </div>
      <Handle type="target" position={Position.Top} id="in" title="Inlet (toward driver)" />
      <Handle type="source" position={Position.Bottom} id="out" title="Outlet (toward load) — leave open for sealed" />
      <span className="handle-label" style={{ top: 1, left: '54%' }}>in</span>
      <span className="handle-label" style={{ bottom: 1, left: '54%' }}>out</span>
    </div>
  )
}

export function WaveguideNode({ id, data, selected }) {
  const warn = useWarnings(id)
  const setVelocityPopup = useStore((s) => s.setVelocityPopup)
  const vThreshold = useStore((s) => s.settings.vThreshold)
  const vmax = useStore((s) => {
    const v = s.results?.velocity?.[id]
    return v && v.length ? Math.max(...v) : null
  })
  const p = data.params
  const L = p.length / 100
  const S2 = p.S2 * 1e-4
  const isStraight = Math.abs(p.S1 - p.S2) < 0.001 * Math.max(p.S1, p.S2, 1)
  const ec = endCorrectionLength(S2, p.ecFactor ?? 0.732)
  const fq = C_AIR / (4 * (L + ec)) // quarter-wave tuning
  const fc = flareCutoff(p.flare, p.S1 * 1e-4, S2, L)
  return (
    <div className={`acou-node ${selected ? 'selected' : ''}`}>
      <Head type="waveguide" label={p.label || 'Waveguide'} warn={warn} />
      <div className="node-body">
        {p.S1}→{p.S2} cm² · {p.length} cm · {p.flare}<br />
        {isStraight
          ? <>λ/4 <span className="node-readout">{fq.toFixed(1)} Hz</span></>
          : fc
            ? <>flare fc <span className="node-readout">{fc.toFixed(1)} Hz</span></>
            : <>no cutoff (conical/parabolic)</>}
        <br />
        <span
          className={`vel-readout ${vmax != null && vmax > vThreshold ? 'over' : ''}`}
          title="Peak air velocity in this segment — click for the velocity chart"
          onClick={(e) => { e.stopPropagation(); setVelocityPopup(id) }}
        >
          ⇥ {vmax != null ? vmax.toFixed(1) : '—'} m/s
        </span>
      </div>
      <Handle type="target" position={Position.Top} id="throat" title="Throat (S1)" />
      <Handle type="source" position={Position.Bottom} id="mouth" title="Mouth (S2) — unconnected = OPEN end (radiates). For a closed end, connect a Radiation node set to Rigid wall." />
      <span className="handle-label" style={{ top: 1, left: '54%' }}>throat</span>
      <span className="handle-label" style={{ bottom: 1, left: '54%' }}>mouth</span>
    </div>
  )
}

export function PRNode({ id, data, selected }) {
  const warn = useWarnings(id)
  const p = data.params
  const m = (p.Mmd + (p.addedMass || 0)) / 1000
  const c = p.Cms / 1000
  const fs = 1 / (2 * Math.PI * Math.sqrt(Math.max(m * c, 1e-12)))
  return (
    <div className={`acou-node ${selected ? 'selected' : ''}`}>
      <Head type="pr" label={p.label || 'Passive Radiator'} warn={warn} />
      <div className="node-body">
        Sd {p.Sd} cm² · M {p.Mmd}{p.addedMass ? `+${p.addedMass}` : ''} g<br />
        Fs <span className="node-readout">{fs.toFixed(1)} Hz</span>
      </div>
      <Handle type="target" position={Position.Top} id="in" title="Mounts to a chamber face" />
    </div>
  )
}

const SPACE_LABELS = {
  free: 'Free space (4π)', half: 'Half space (2π)', quarter: 'Quarter space (π)',
  eighth: 'Eighth space (π/2)', rigid: 'Rigid wall', anechoic: 'Anechoic',
}

export function RadiationNode({ id, data, selected }) {
  const warn = useWarnings(id)
  const p = data.params
  return (
    <div className={`acou-node ${selected ? 'selected' : ''}`}>
      <Head type="radiation" label={p.label || 'Radiation'} warn={warn} />
      <div className="node-body">{SPACE_LABELS[p.space] || p.space}</div>
      <Handle type="target" position={Position.Top} id="in" title="Acoustic input" />
    </div>
  )
}

export const nodeTypes = {
  driver: DriverNode,
  chamber: ChamberNode,
  waveguide: WaveguideNode,
  pr: PRNode,
  radiation: RadiationNode,
}
