import React from 'react'
import { useStore } from '../store'

const ITEMS = [
  { type: 'driver', color: 'var(--s1)', name: 'Driver', desc: 'Loudspeaker motor system with T/S parameters, amplifier coupling and array options.' },
  { type: 'chamber', color: 'var(--s2)', name: 'Chamber', desc: 'Enclosed air volume modeled as a transmission line — standing waves included.' },
  { type: 'waveguide', color: 'var(--s3)', name: 'Waveguide Segment', desc: 'Duct, port or horn segment. Straight port when S1 = S2. Unconnected mouth = open end; cap with a Rigid wall Radiation node to close it.' },
  { type: 'pr', color: 'var(--s4)', name: 'Passive Radiator', desc: 'Drone cone: mass-loaded membrane, tunable with added mass.' },
  { type: 'radiation', color: 'var(--s5)', name: 'Radiation Termination', desc: 'What an opening radiates into: 4π/2π/π/π⁄2 space, rigid wall, or anechoic.' },
]

export default function Palette() {
  const setShowDriverDB = useStore((s) => s.setShowDriverDB)
  const onDragStart = (e, type) => {
    e.dataTransfer.setData('application/acousim-node', type)
    e.dataTransfer.effectAllowed = 'move'
  }
  return (
    <div className="sidebar-left">
      <h3>Node Palette</h3>
      {ITEMS.map((it) => (
        <div key={it.type} className="palette-item" draggable onDragStart={(e) => onDragStart(e, it.type)}>
          <div className="pi-title"><span className="pi-dot" style={{ background: it.color }} />{it.name}</div>
          <div className="pi-desc">{it.desc}</div>
        </div>
      ))}
      <h3 style={{ marginTop: 8 }}>Library</h3>
      <button onClick={() => setShowDriverDB(true)}>🔍 Driver Database</button>
      <div style={{ fontSize: 10.5, color: 'var(--text-3)', lineHeight: 1.5, marginTop: 'auto' }}>
        Drag an element onto the canvas, wire ports together, and results update live.
        Every node has its own Q-factor loss.
      </div>
    </div>
  )
}
