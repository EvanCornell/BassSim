import React, { useState } from 'react'
import { useStore, listSavedProjects } from '../store'

// Tiny inline SVG preview of a project's node graph
function Thumb({ proj }) {
  const nodes = proj.nodes || []
  if (!nodes.length) return <div style={{ width: 90, height: 54 }} />
  const xs = nodes.map((n) => n.position.x)
  const ys = nodes.map((n) => n.position.y)
  const minX = Math.min(...xs), maxX = Math.max(...xs) + 150
  const minY = Math.min(...ys), maxY = Math.max(...ys) + 60
  const colors = { driver: '#3987e5', chamber: '#199e70', waveguide: '#c98500', pr: '#9085e9', radiation: '#d55181' }
  const sx = 90 / Math.max(maxX - minX, 1)
  const sy = 54 / Math.max(maxY - minY, 1)
  const s = Math.min(sx, sy)
  const nodeById = Object.fromEntries(nodes.map((n) => [n.id, n]))
  return (
    <svg width="90" height="54" style={{ background: 'var(--bg)', borderRadius: 4 }}>
      {(proj.edges || []).map((e, i) => {
        const a = nodeById[e.source], b = nodeById[e.target]
        if (!a || !b) return null
        return <line key={i}
          x1={(a.position.x - minX + 75) * s} y1={(a.position.y - minY + 30) * s}
          x2={(b.position.x - minX + 75) * s} y2={(b.position.y - minY + 30) * s}
          stroke="#3d4859" strokeWidth="1" />
      })}
      {nodes.map((n) => (
        <rect key={n.id}
          x={(n.position.x - minX) * s} y={(n.position.y - minY) * s}
          width={Math.max(150 * s, 5)} height={Math.max(60 * s, 4)} rx="1.5"
          fill={colors[n.type] || '#888'} opacity="0.9" />
      ))}
    </svg>
  )
}

export default function ProjectManager() {
  const show = useStore((s) => s.showProjectManager)
  const setShow = useStore((s) => s.setShowProjectManager)
  const loadSerialized = useStore((s) => s.loadSerialized)
  const [tick, setTick] = useState(0)
  if (!show) return null
  const projects = listSavedProjects()
  const refresh = () => setTick(tick + 1)

  const rename = (p) => {
    const name = prompt('New project name:', p.name)
    if (!name || name === p.name) return
    const proj = { ...p.proj, name }
    localStorage.setItem(`acousim:project:${name}`, JSON.stringify(proj))
    localStorage.removeItem(p.key)
    refresh()
  }
  const duplicate = (p) => {
    const name = `${p.name} copy`
    localStorage.setItem(`acousim:project:${name}`, JSON.stringify({ ...p.proj, name, modified: new Date().toISOString() }))
    refresh()
  }
  const remove = (p) => {
    if (!confirm(`Delete project "${p.name}"? This cannot be undone.`)) return
    localStorage.removeItem(p.key)
    refresh()
  }

  return (
    <div className="modal-backdrop" onClick={() => setShow(false)}>
      <div className="modal" style={{ minWidth: 560 }} onClick={(e) => e.stopPropagation()}>
        <h3>Projects</h3>
        {projects.length === 0 && <div style={{ color: 'var(--text-3)' }}>No saved projects yet. Projects auto-save as you edit.</div>}
        <table>
          <tbody>
            {projects.map((p) => (
              <tr key={p.key}>
                <td><Thumb proj={p.proj} /></td>
                <td>
                  <b>{p.name}</b><br />
                  <span style={{ color: 'var(--text-3)', fontSize: 11 }}>
                    {p.nodeCount} nodes · {p.modified ? new Date(p.modified).toLocaleString() : ''}
                  </span>
                </td>
                <td style={{ whiteSpace: 'nowrap' }}>
                  <button className="primary" onClick={() => { loadSerialized(p.proj); setShow(false) }}>Open</button>{' '}
                  <button onClick={() => rename(p)}>Rename</button>{' '}
                  <button onClick={() => duplicate(p)}>Duplicate</button>{' '}
                  <button className="danger" onClick={() => remove(p)}>Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="close-row"><button onClick={() => setShow(false)}>Close</button></div>
      </div>
    </div>
  )
}
