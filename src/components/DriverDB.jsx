import React, { useMemo, useState } from 'react'
import { useStore } from '../store'
import {
  BUILTIN_DRIVERS, DRIVER_BRANDS, EXT_FIELDS, EXT_GROUPS, driverToParams,
} from '../data/drivers'

/**
 * LocalStorage key holding the user's own driver entries.
 */
const CUSTOM_KEY = 'acousim:customDrivers'

/**
 * Load the user's saved custom drivers.
 *
 * @returns {Array<object>} Custom driver records, or an empty list when absent or corrupt.
 * @sideEffect Reads LocalStorage key `acousim:customDrivers`. Anything that is not parseable JSON, and anything that parses to a falsy value, yields an empty list rather than throwing.
 */
function loadCustom() {
  try { return JSON.parse(localStorage.getItem(CUSTOM_KEY)) || [] } catch { return [] }
}

/**
 * The expanded extended-parameter view for one driver.
 *
 * Groups holding nothing are dropped per driver, so a hand-transcribed row
 * shows no empty scaffolding — extended parameters are sparse, and rendering
 * the full schema would imply the data is missing rather than never
 * published.
 *
 * @param {object} props - Component props.
 * @param {object} props.driver - The driver record, whose `ext` object is displayed.
 * @returns {React.ReactElement} The grouped detail rows, or a note when the driver publishes none.
 * @pure
 */
function ExtDetail({ driver }) {
  const groups = EXT_GROUPS
    .map((g) => [g, EXT_FIELDS.filter((f) => f.group === g && driver.ext[f.key] != null)])
    .filter(([, fields]) => fields.length)

  if (!groups.length) {
    return (
      <div style={{ padding: '6px 10px', fontSize: 11, color: 'var(--text-3)' }}>
        No extended parameters published for this driver.
      </div>
    )
  }
  return (
    <div style={{ padding: '8px 10px', display: 'flex', flexWrap: 'wrap', gap: 18 }}>
      {groups.map(([group, fields]) => (
        <div key={group} style={{ minWidth: 170 }}>
          <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.6, color: 'var(--text-3)', marginBottom: 3 }}>
            {group}
          </div>
          {fields.map((f) => (
            <div key={f.key} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 11.5 }}>
              <span style={{ color: 'var(--text-2)' }} title={f.desc}>{f.label}</span>
              <span>{driver.ext[f.key]}{f.unit ? ` ${f.unit}` : ''}</span>
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}

/**
 * The driver library browser.
 *
 * Filters by brand, search text, and Fs/Vas/Xmax thresholds. Clicking a row
 * applies it to the selected Driver node, or creates one if there is none.
 *
 * Custom entries are listed ahead of the built-ins so the user's own
 * drivers are easy to find, and only they can be deleted.
 *
 * The ⚠ marks a row whose published Q or Vas figures contradict the
 * Bl/Re/Mms/Cms the solver actually runs on — the simulation follows the
 * latter, so the headline Qts may not be what you get.
 *
 * @returns {React.ReactElement|null} The modal, or `null` when hidden.
 * @sideEffect Subscribes to the store and reads LocalStorage for custom entries.
 */
export default function DriverDB() {
  const show = useStore((s) => s.showDriverDB)
  const setShow = useStore((s) => s.setShowDriverDB)
  const node = useStore((s) => s.nodes.find((n) => n.id === s.selectedNodeId))
  const updateParams = useStore((s) => s.updateParams)
  const addNode = useStore((s) => s.addNode)
  const [query, setQuery] = useState('')
  const [brand, setBrand] = useState('')
  const [fsMax, setFsMax] = useState('')
  const [vasMin, setVasMin] = useState('')
  const [xmaxMin, setXmaxMin] = useState('')
  const [open, setOpen] = useState(null)
  const [custom, setCustom] = useState(loadCustom)

  const all = useMemo(() => [
    ...custom.map((d) => ({ ...d, ext: d.ext || {}, source: 'custom', custom: true })),
    ...BUILTIN_DRIVERS,
  ], [custom])

  const brands = useMemo(
    () => (custom.length ? ['Custom', ...DRIVER_BRANDS] : DRIVER_BRANDS),
    [custom.length],
  )

  const filtered = useMemo(() => all.filter((d) => {
    const q = query.trim().toLowerCase()
    if (q && !`${d.brand} ${d.model}`.toLowerCase().includes(q)) return false
    if (brand && !(brand === 'Custom' ? d.custom : d.brand === brand)) return false
    if (fsMax !== '' && d.Fs > parseFloat(fsMax)) return false
    if (vasMin !== '' && !(d.Vas >= parseFloat(vasMin))) return false
    if (xmaxMin !== '' && !(d.Xmax >= parseFloat(xmaxMin))) return false
    return true
  }), [all, query, brand, fsMax, vasMin, xmaxMin])

  if (!show) return null

  /**
   * Apply a database row to the selected Driver node, or to a new one.
   *
   * Goes through `driverToParams`, so a record's provenance and construction
   * detail can never reach a node's params.
   *
   * @param {object} d - The driver record.
   * @returns {void}
   * @sideEffect Updates or creates a node — which triggers a resimulation — and closes the modal.
   */
  const apply = (d) => {
    const params = driverToParams(d)
    if (node && node.type === 'driver') updateParams(node.id, params)
    else updateParams(addNode('driver', { x: 100, y: 100 }), params)
    setShow(false)
  }

  /**
   * Store the selected Driver node's parameters as a custom database entry.
   *
   * Only the core T/S fields are captured; a node has no extended parameters
   * to save.
   *
   * @returns {void}
   * @sideEffect Writes LocalStorage and updates component state. Alerts and does nothing when no driver node is selected.
   */
  const saveCurrentAsCustom = () => {
    if (!node || node.type !== 'driver') { alert('Select a Driver node first.'); return }
    const p = node.data.params
    const entry = { brand: 'Custom', model: p.label || `Custom ${custom.length + 1}`, source: 'custom' }
    for (const k of ['Fs', 'Qts', 'Qes', 'Qms', 'Vas', 'Re', 'Bl', 'Mms', 'Cms', 'Sd', 'Le', 'Xmax', 'Rms']) {
      if (p[k] != null) entry[k] = p[k]
    }
    const next = [...custom, entry]
    setCustom(next)
    localStorage.setItem(CUSTOM_KEY, JSON.stringify(next))
  }

  /**
   * Delete one custom entry.
   *
   * @param {number} i - Index into the custom list.
   * @returns {void}
   * @sideEffect Writes LocalStorage and updates component state.
   */
  const removeCustom = (i) => {
    const next = custom.filter((_, k) => k !== i)
    setCustom(next)
    localStorage.setItem(CUSTOM_KEY, JSON.stringify(next))
  }

  /**
   * A stable React key for a table row.
   *
   * The index is included because the library legitimately holds two records
   * with the same brand and model — a custom entry saved under a built-in's
   * name — and duplicate keys would make React reuse the wrong row.
   *
   * @param {object} d - The driver record.
   * @param {number} i - Row index.
   * @returns {string} A unique row key.
   * @pure
   */
  const key = (d, i) => `${d.brand}|${d.model}|${i}`

  return (
    <div className="modal-backdrop" onClick={() => setShow(false)}>
      <div className="modal" style={{ minWidth: 780 }} onClick={(e) => e.stopPropagation()}>
        <h3>Driver Database</h3>
        <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
          <input placeholder="Search brand or model…" value={query} onChange={(e) => setQuery(e.target.value)} autoFocus style={{ flex: 1, minWidth: 180 }} />
          <select value={brand} onChange={(e) => setBrand(e.target.value)} style={{ width: 140 }}>
            <option value="">All brands</option>
            {brands.map((b) => <option key={b} value={b}>{b}</option>)}
          </select>
          <input placeholder="Fs ≤ Hz" style={{ width: 78 }} value={fsMax} onChange={(e) => setFsMax(e.target.value)} />
          <input placeholder="Vas ≥ L" style={{ width: 78 }} value={vasMin} onChange={(e) => setVasMin(e.target.value)} />
          <input placeholder="Xmax ≥ mm" style={{ width: 88 }} value={xmaxMin} onChange={(e) => setXmaxMin(e.target.value)} />
          <button onClick={saveCurrentAsCustom} title="Store the selected Driver node's parameters as a custom database entry">+ Save current</button>
        </div>
        <div style={{ maxHeight: '52vh', overflowY: 'auto' }}>
          <table>
            <thead>
              <tr>
                <th>Brand</th><th>Model</th><th>Fs</th><th>Qts</th><th>Vas L</th>
                <th>Re Ω</th><th>Sd cm²</th><th>Xmax</th><th>Power W</th><th /><th />
              </tr>
            </thead>
            <tbody>
              {filtered.map((d, i) => (
                <React.Fragment key={key(d, i)}>
                  <tr className="clickable" onClick={() => apply(d)}>
                    <td>{d.brand}</td>
                    <td>
                      {d.model}
                      {d.suspect && (
                        <span title={d.suspect.join('\n')} style={{ color: 'var(--amber)', marginLeft: 5 }}>⚠</span>
                      )}
                    </td>
                    <td>{d.Fs}</td><td>{d.Qts}</td><td>{d.Vas}</td><td>{d.Re}</td>
                    <td>{d.Sd}</td><td>{d.Xmax}</td><td>{d.ext.pNom ?? ''}</td>
                    <td>
                      <span
                        title={open === key(d, i) ? 'Hide details' : 'Show extended parameters'}
                        style={{ cursor: 'pointer', color: 'var(--text-3)' }}
                        onClick={(e) => { e.stopPropagation(); setOpen(open === key(d, i) ? null : key(d, i)) }}
                      >{open === key(d, i) ? '▾' : '▸'}</span>
                    </td>
                    <td>{d.custom && (
                      <span className="x" style={{ cursor: 'pointer', color: 'var(--red)' }}
                        onClick={(e) => { e.stopPropagation(); removeCustom(custom.indexOf(d)) }}>✕</span>
                    )}</td>
                  </tr>
                  {open === key(d, i) && (
                    <tr>
                      <td colSpan={11} style={{ background: 'var(--surface-2)' }}>
                        {d.suspect && (
                          <div style={{ padding: '6px 10px', fontSize: 11, color: 'var(--amber)' }}>
                            {d.suspect.map((s) => <div key={s}>⚠ {s}</div>)}
                            <div style={{ color: 'var(--text-3)', marginTop: 2 }}>
                              The simulation follows Bl/Re/Mms/Cms/Rms, not the published Q figures.
                            </div>
                          </div>
                        )}
                        <ExtDetail driver={d} />
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
        <div style={{ fontSize: 10.5, color: 'var(--text-3)', marginTop: 8, display: 'flex', justifyContent: 'space-between', gap: 12 }}>
          <span>
            Click a row to fill the {node?.type === 'driver' ? 'selected' : 'new'} Driver node; ▸ shows the extended
            parameters. Catalog-sourced values come from the manufacturer's own data export; ⚠ marks a row whose
            published figures disagree with each other.
          </span>
          <span style={{ whiteSpace: 'nowrap' }}>{filtered.length} of {all.length}</span>
        </div>
        <div className="close-row"><button onClick={() => setShow(false)}>Close</button></div>
      </div>
    </div>
  )
}

// Module-private functions, exposed for the contract test suite only
// (test/contract/*). Not part of this module's public API — application code
// must not import from here, and nothing outside the tests does.
export const __internals = { loadCustom }
