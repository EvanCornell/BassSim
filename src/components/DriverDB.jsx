import React, { useMemo, useState } from 'react'
import { useStore } from '../store'
import { BUILTIN_DRIVERS } from '../data/drivers'

const CUSTOM_KEY = 'acousim:customDrivers'

function loadCustom() {
  try { return JSON.parse(localStorage.getItem(CUSTOM_KEY)) || [] } catch { return [] }
}

export default function DriverDB() {
  const show = useStore((s) => s.showDriverDB)
  const setShow = useStore((s) => s.setShowDriverDB)
  const selectedNodeId = useStore((s) => s.selectedNodeId)
  const node = useStore((s) => s.nodes.find((n) => n.id === s.selectedNodeId))
  const updateParams = useStore((s) => s.updateParams)
  const addNode = useStore((s) => s.addNode)
  const [query, setQuery] = useState('')
  const [fsMax, setFsMax] = useState('')
  const [vasMin, setVasMin] = useState('')
  const [custom, setCustom] = useState(loadCustom)

  const all = useMemo(() => [...custom.map((d) => ({ ...d, custom: true })), ...BUILTIN_DRIVERS], [custom])
  const filtered = useMemo(() => all.filter((d) => {
    const q = query.trim().toLowerCase()
    if (q && !`${d.brand} ${d.model}`.toLowerCase().includes(q)) return false
    if (fsMax !== '' && d.Fs > parseFloat(fsMax)) return false
    if (vasMin !== '' && d.Vas < parseFloat(vasMin)) return false
    return true
  }), [all, query, fsMax, vasMin])

  if (!show) return null

  const apply = (d) => {
    const params = {
      Fs: d.Fs, Qts: d.Qts, Qes: d.Qes, Qms: d.Qms, Vas: d.Vas, Re: d.Re, Bl: d.Bl,
      Mms: d.Mms, Cms: d.Cms, Sd: d.Sd, Le: d.Le, Xmax: d.Xmax, Rms: d.Rms,
      label: d.model,
    }
    if (node && node.type === 'driver') {
      updateParams(node.id, params)
    } else {
      const id = addNode('driver', { x: 100, y: 100 })
      updateParams(id, params)
    }
    setShow(false)
  }

  const saveCurrentAsCustom = () => {
    if (!node || node.type !== 'driver') { alert('Select a Driver node first.'); return }
    const p = node.data.params
    const entry = {
      brand: 'Custom', model: p.label || `Custom ${custom.length + 1}`,
      Fs: p.Fs, Qts: p.Qts, Qes: p.Qes, Qms: p.Qms, Vas: p.Vas, Re: p.Re, Bl: p.Bl,
      Mms: p.Mms, Cms: p.Cms, Sd: p.Sd, Le: p.Le, Xmax: p.Xmax, Rms: p.Rms,
    }
    const next = [...custom, entry]
    setCustom(next)
    localStorage.setItem(CUSTOM_KEY, JSON.stringify(next))
  }

  const removeCustom = (i) => {
    const next = custom.filter((_, k) => k !== i)
    setCustom(next)
    localStorage.setItem(CUSTOM_KEY, JSON.stringify(next))
  }

  return (
    <div className="modal-backdrop" onClick={() => setShow(false)}>
      <div className="modal" style={{ minWidth: 680 }} onClick={(e) => e.stopPropagation()}>
        <h3>Driver Database</h3>
        <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
          <input placeholder="Search brand or model…" value={query} onChange={(e) => setQuery(e.target.value)} autoFocus />
          <input placeholder="Fs ≤ Hz" style={{ width: 90 }} value={fsMax} onChange={(e) => setFsMax(e.target.value)} />
          <input placeholder="Vas ≥ L" style={{ width: 90 }} value={vasMin} onChange={(e) => setVasMin(e.target.value)} />
          <button onClick={saveCurrentAsCustom} title="Store the selected Driver node's parameters as a custom database entry">+ Save current</button>
        </div>
        <div style={{ maxHeight: '52vh', overflowY: 'auto' }}>
          <table>
            <thead>
              <tr><th>Brand</th><th>Model</th><th>Fs</th><th>Qts</th><th>Vas L</th><th>Re Ω</th><th>Sd cm²</th><th>Xmax</th><th /></tr>
            </thead>
            <tbody>
              {filtered.map((d, i) => (
                <tr key={i} className="clickable" onClick={() => apply(d)}>
                  <td>{d.brand}</td><td>{d.model}</td><td>{d.Fs}</td><td>{d.Qts}</td>
                  <td>{d.Vas}</td><td>{d.Re}</td><td>{d.Sd}</td><td>{d.Xmax}</td>
                  <td>{d.custom && (
                    <span className="x" style={{ cursor: 'pointer', color: 'var(--red)' }}
                      onClick={(e) => { e.stopPropagation(); removeCustom(custom.indexOf(d)) }}>✕</span>
                  )}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div style={{ fontSize: 10.5, color: 'var(--text-3)', marginTop: 8 }}>
          Built-in values are transcribed from public spec sheets — approximate; verify before building.
          Click a row to fill the {node?.type === 'driver' ? 'selected' : 'new'} Driver node.
        </div>
        <div className="close-row"><button onClick={() => setShow(false)}>Close</button></div>
      </div>
    </div>
  )
}
