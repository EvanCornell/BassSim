import React, { useState } from 'react'
import { useStore, listSavedProjects } from '../store'

/**
 * An inline SVG preview of a project's node graph.
 *
 * Scales the graph's bounding box to fit a fixed 90×54 thumbnail, using the
 * smaller of the two axis scales so the layout keeps its proportions.
 * Enough to recognise a saved project by shape without opening it.
 *
 * @param {object} props - Component props.
 * @param {object} props.proj - The serialized project to preview.
 * @returns {React.ReactElement} The thumbnail, blank for a project with no nodes.
 * @pure
 */
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

/**
 * Browse, load, rename, duplicate and delete auto-saved projects.
 *
 * Projects are read straight from LocalStorage on each render rather than
 * held in state, so the list reflects edits made in another tab.
 *
 * @returns {React.ReactElement|null} The modal, or `null` when hidden.
 * @sideEffect Subscribes to the store. Reads LocalStorage on every render.
 */
export default function ProjectManager() {
  const show = useStore((s) => s.showProjectManager)
  const setShow = useStore((s) => s.setShowProjectManager)
  const loadSerialized = useStore((s) => s.loadSerialized)
  const [tick, setTick] = useState(0)
  if (!show) return null
  const projects = listSavedProjects()
  /**
   * Force a re-read of the saved project list after a change.
   *
   * The projects live in LocalStorage rather than in state, so nothing else
   * would tell React that they changed.
   *
   * @returns {void}
   * @sideEffect Bumps a counter to trigger a re-render.
   */
  const refresh = () => setTick(tick + 1)

  /**
   * Rename a saved project, moving it to its new key.
   *
   * @param {object} p - The saved project entry.
   * @returns {void}
   * @sideEffect Prompts for a name, then writes the new LocalStorage key and removes the old one. Does nothing if cancelled or unchanged.
   */
  const rename = (p) => {
    const name = prompt('New project name:', p.name)
    if (!name || name === p.name) return
    const proj = { ...p.proj, name }
    localStorage.setItem(`acousim:project:${name}`, JSON.stringify(proj))
    localStorage.removeItem(p.key)
    refresh()
  }
  /**
   * Copy a saved project under a "copy" name.
   *
   * @param {object} p - The saved project entry.
   * @returns {void}
   * @sideEffect Writes a new LocalStorage key with a fresh modification time. Silently overwrites an existing copy of the same name.
   */
  const duplicate = (p) => {
    const name = `${p.name} copy`
    localStorage.setItem(`acousim:project:${name}`, JSON.stringify({ ...p.proj, name, modified: new Date().toISOString() }))
    refresh()
  }
  /**
   * Delete a saved project after confirming.
   *
   * @param {object} p - The saved project entry.
   * @returns {void}
   * @sideEffect Shows a confirmation dialog, then removes the LocalStorage key. Does nothing if declined.
   */
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
