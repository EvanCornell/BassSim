import React from 'react'
import { Handle, Position } from 'reactflow'
import { useStore } from '../store'
import { C_AIR, flareCutoff, endCorrectionLength, waveguideVolume } from '../engine/geometry'
import { useResolvedParams } from '../useResolved'
import { driverNominal } from '../schema/nominal'
import { nameNumbers } from '../nodeNames'

/**
 * Accent colour per node type, shared by the canvas nodes and the minimap.
 */
const NODE_COLORS = {
  driver: 'var(--s1)',
  chamber: 'var(--s2)',
  waveguide: 'var(--s3)',
  pr: 'var(--s4)',
  radiation: 'var(--s5)',
}

/**
 * Subscribe to the validation warnings for one node.
 *
 * @param {string} id - Node id.
 * @returns {string[]|undefined} Warnings for that node, or `undefined` when it has none.
 * @sideEffect Subscribes to the store.
 */
function useWarnings(id) {
  return useStore((s) => s.results?.validation?.warnings?.[id])
}

/**
 * A node's title bar: colour dot, label, its number when another component
 * shares the name, and a warning marker when it has warnings.
 *
 * @param {object} props - Component props.
 * @param {string} props.id - Node id.
 * @param {string} props.type - Node type, which picks the colour.
 * @param {string} props.label - Display label.
 * @param {string[]|undefined} props.warn - Validation warnings, shown in the marker's tooltip.
 * @returns {React.ReactElement} The node header.
 * @sideEffect Subscribes to the store.
 */
function Head({ id, type, label, warn }) {
  const num = useStore((s) => nameNumbers(s.nodes)[id])
  return (
    <div className="node-head">
      <span className="pi-dot" style={{ background: NODE_COLORS[type] }} />
      {label}
      {num ? <span className="name-num" title="Another component has this name too; the number tells them apart">#{num}</span> : null}
      {warn && <span className="warn-dot" title={warn.join('\n')} />}
    </div>
  )
}

/**
 * A handle, drawn with its label.
 *
 * Every handle is a `source`: the canvas runs in loose connection mode, so
 * any handle joins any other and the join has no direction.
 *
 * @param {object} props - Component props.
 * @param {string} props.id - Handle id.
 * @param {string} props.side - `top`, `bottom`, `left` or `right`.
 * @param {string} [props.at] - Offset along that side, as CSS (e.g. `35%`).
 * @param {string} props.label - Text drawn beside it.
 * @param {string} [props.title] - Tooltip.
 * @returns {React.ReactElement} The handle and its label.
 * @pure
 */
function Port({ id, side, at, label, title }) {
  const position = { top: Position.Top, bottom: Position.Bottom, left: Position.Left, right: Position.Right }[side]
  const along = side === 'top' || side === 'bottom' ? { left: at || '50%' } : { top: at || '50%' }
  const labelPos = {
    top: { top: 1, left: `calc(${at || '50%'} + 6px)` },
    bottom: { bottom: 1, left: `calc(${at || '50%'} + 6px)` },
    left: { left: 4, top: `calc(${at || '50%'} - 17px)` },
    right: { right: 4, top: `calc(${at || '50%'} - 17px)` },
  }[side]
  return (
    <>
      <Handle type="source" position={position} id={id} style={along} title={title || label} />
      <span className="handle-label" style={labelPos}>{label}</span>
    </>
  )
}

/**
 * Handles for a chamber's or waveguide's taps, along its right-hand side.
 *
 * Each sits at its position's share of the length, so the node reads as a
 * map of the line; a tap outside the length is pinned to the nearer end and
 * flagged by the node's warning.
 *
 * @param {object} props - Component props.
 * @param {Array<{id: string, position: number}>} props.taps - Resolved taps.
 * @param {number} props.length - Resolved length, cm.
 * @returns {React.ReactElement} The handles.
 * @pure
 */
function TapPorts({ taps, length }) {
  return (
    <>
      {(taps || []).map((t) => {
        const f = Math.min(Math.max(Number(t.position) / Number(length), 0), 1)
        const at = `${(12 + f * 76).toFixed(1)}%`
        return <Port key={t.id} id={`tap:${t.id}`} side="right" at={at} label={t.id} title={`Tap ${t.id} at ${t.position} cm`} />
      })}
    </>
  )
}

/**
 * Canvas node for a driver: T/S summary, array count, and front/rear ports.
 *
 * @param {object} props - React Flow node props.
 * @param {string} props.id - Node id.
 * @param {{params: object}} props.data - Node data.
 * @param {boolean} props.selected - Whether the node is selected.
 * @returns {React.ReactElement} The node.
 * @sideEffect Subscribes to the store.
 */
export function DriverNode({ id, data, selected }) {
  const warn = useWarnings(id)
  const p = useResolvedParams(id, 'driver', data.params)
  const nominal = driverNominal(p)
  return (
    <div className={`acou-node ${selected ? 'selected' : ''}`}>
      <Head id={id} type="driver" label={p.label || 'Driver'} warn={warn} />
      <div className="node-body">
        Fs <span className="node-readout">{p.Fs} Hz</span> · Qts <span className="node-readout">{p.Qts}</span><br />
        Sd <span className="node-readout">{p.Sd} cm²</span>
        {p.count > 1 && <> · <span className="node-readout">{p.count}× {p.wiring}</span></>}<br />
        <span title="Nominal impedance at the node's terminals, from its coil resistance, dual voice coil option and array wiring">
          <span className="node-readout">{nominal >= 1 ? nominal.toFixed(0) : nominal.toFixed(2)} Ω</span> nominal
        </span>
        {p.dvc?.coils && <> · DVC {p.dvc.coils}</>}
      </div>
      <Port id="front" side="right" at="35%" label="front" title="Front face — unconnected, it radiates as if in an infinite baffle" />
      <Port id="rear" side="left" at="35%" label="rear" title="Rear face — unconnected, it radiates behind the baffle" />
    </div>
  )
}

/**
 * Canvas node for a chamber: volume, path length, stuffing, and its inlet/outlet.
 *
 * @param {object} props - React Flow node props.
 * @param {string} props.id - Node id.
 * @param {{params: object}} props.data - Node data.
 * @param {boolean} props.selected - Whether the node is selected.
 * @returns {React.ReactElement} The node.
 * @sideEffect Subscribes to the store.
 */
export function ChamberNode({ id, data, selected }) {
  const warn = useWarnings(id)
  const p = useResolvedParams(id, 'chamber', data.params)
  const fRes = C_AIR / (2 * (p.length / 100)) // first λ/2 standing wave
  return (
    <div className={`acou-node ${selected ? 'selected' : ''}`}>
      <Head id={id} type="chamber" label={p.label || 'Chamber'} warn={warn} />
      <div className="node-body">
        <span className="node-readout">{p.volume} L</span> · L {p.length} cm<br />
        1st mode <span className="node-readout">{fRes.toFixed(0)} Hz</span> · {Number(p.leakQL) > 0 ? `QL ${p.leakQL}` : 'sealed'}
      </div>
      <Port id="in" side="top" label="in" title="One end — anything may join it; unconnected, it is a closed wall" />
      <Port id="out" side="bottom" label="out" title="The other end — anything may join it; unconnected, it is a closed wall" />
      <TapPorts taps={p.taps} length={p.length} />
    </div>
  )
}

/**
 * Canvas node for a waveguide: geometry, flare cutoff, and a live velocity readout.
 *
 * The velocity figure is clickable and opens the detailed chart, because it
 * is the number most likely to disqualify an otherwise good design.
 *
 * @param {object} props - React Flow node props.
 * @param {string} props.id - Node id.
 * @param {{params: object}} props.data - Node data.
 * @param {boolean} props.selected - Whether the node is selected.
 * @returns {React.ReactElement} The node.
 * @sideEffect Subscribes to the store.
 */
export function WaveguideNode({ id, data, selected }) {
  const warn = useWarnings(id)
  const setVelocityPopup = useStore((s) => s.setVelocityPopup)
  const vThreshold = useStore((s) => s.settings.vThreshold)
  const vmax = useStore((s) => {
    const v = s.results?.velocity?.[id]
    return v && v.length ? Math.max(...v) : null
  })
  const p = useResolvedParams(id, 'waveguide', data.params)
  const L = p.length / 100
  const S2 = p.S2 * 1e-4
  const isStraight = Math.abs(p.S1 - p.S2) < 0.001 * Math.max(p.S1, p.S2, 1)
  // The readout shows the duct as it stands on its own, with the flanged
  // correction one open end is owed. What it will actually get depends on what
  // it is connected to, which is the solver's business and not the node's.
  const ec = endCorrectionLength(S2, 0.85) * (p.ecFactor ?? 1)
  const fq = C_AIR / (4 * (L + ec)) // quarter-wave tuning
  const fc = flareCutoff(p.flare, p.S1 * 1e-4, S2, L)
  const volL = waveguideVolume(p.flare, p.S1 * 1e-4, S2, L) * 1000
  return (
    <div className={`acou-node ${selected ? 'selected' : ''}`}>
      <Head id={id} type="waveguide" label={p.label || 'Waveguide'} warn={warn} />
      <div className="node-body">
        {p.S1}→{p.S2} cm² · {p.length} cm · {p.flare}<br />
        vol <span className="node-readout" title="Internal air volume of this segment (from the flare profile)">{volL >= 100 ? volL.toFixed(0) : volL.toFixed(1)} L</span> ·{' '}
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
      <Port id="throat" side="top" label="throat" title={`Throat (S1) — unconnected, it ${p.throatSpace === 'rigid' ? 'is plugged' : 'radiates'}`} />
      <Port id="mouth" side="bottom" label="mouth" title={`Mouth (S2) — unconnected, it ${p.mouthSpace === 'rigid' ? 'is plugged' : 'radiates'}`} />
      <TapPorts taps={p.taps} length={p.length} />
    </div>
  )
}

/**
 * Canvas node for a passive radiator: moving mass, compliance and resulting Fs.
 *
 * @param {object} props - React Flow node props.
 * @param {string} props.id - Node id.
 * @param {{params: object}} props.data - Node data.
 * @param {boolean} props.selected - Whether the node is selected.
 * @returns {React.ReactElement} The node.
 * @sideEffect Subscribes to the store.
 */
export function PRNode({ id, data, selected }) {
  const warn = useWarnings(id)
  const p = useResolvedParams(id, 'pr', data.params)
  const m = (p.Mmd + (p.addedMass || 0)) / 1000
  const c = p.Cms / 1000
  const fs = 1 / (2 * Math.PI * Math.sqrt(Math.max(m * c, 1e-12)))
  return (
    <div className={`acou-node ${selected ? 'selected' : ''}`}>
      <Head id={id} type="pr" label={p.label || 'Passive Radiator'} warn={warn} />
      <div className="node-body">
        Sd {p.Sd} cm² · M {p.Mmd}{p.addedMass ? `+${p.addedMass}` : ''} g<br />
        Fs <span className="node-readout">{fs.toFixed(1)} Hz</span>{p.count > 1 && <> · <span className="node-readout">{p.count}×</span></>}
      </div>
      <Port id="rear" side="top" label="rear" title="Rear face — unconnected, it radiates behind the baffle" />
      <Port id="front" side="bottom" label="front" title="Front face — unconnected, it radiates as if in an infinite baffle" />
    </div>
  )
}

const SPACE_LABELS = {
  free: 'Free space (4π)', half: 'Half space (2π)', quarter: 'Quarter space (π)',
  eighth: 'Eighth space (π/2)', rigid: 'Rigid wall', anechoic: 'Anechoic',
}

/**
 * Canvas node for a radiation termination: the space it radiates into.
 *
 * @param {object} props - React Flow node props.
 * @param {string} props.id - Node id.
 * @param {{params: object}} props.data - Node data.
 * @param {boolean} props.selected - Whether the node is selected.
 * @returns {React.ReactElement} The node.
 * @sideEffect Subscribes to the store.
 */
export function RadiationNode({ id, data, selected }) {
  const warn = useWarnings(id)
  const p = data.params
  return (
    <div className={`acou-node ${selected ? 'selected' : ''}`}>
      <Head id={id} type="radiation" label={p.label || 'Radiation'} warn={warn} />
      <div className="node-body">{SPACE_LABELS[p.space] || p.space}</div>
      <Handle type="source" position={Position.Top} id="in" title="One shared opening — everything joined here radiates together" />
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
