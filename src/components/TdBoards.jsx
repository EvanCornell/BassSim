// The time-domain boards: a floating library of stored runs, boards of
// comparison cards over them, and the New run drawer that queues more.
//
// Runs are stored in their project's records (see src/runs.js); this file
// only reads them. A card holds run ids; what it draws comes from each run's
// summary (figures) or, for waveforms, from its results, read on demand.

import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useStore, runIndex, runDataOf, tdSettingsOf, isLocked } from '../store'
import {
  ANALYSES, QUANTITIES, METRICS, analysisLabel, runTraces, hasQuantity, quantityUnit, differenceOf,
  varyChoices, varLabel, varText, runTitle, optsOf, drivePreview, dbText,
} from '../runs'
import { CARD_KINDS, TEMPLATES, boardRuns, letterOf } from '../boards'
import { decimate } from '../spice/dsp'
import { CEA2010_LIMITS } from '../spice/timedomain'
import { TdChart, TransientView, DistortionView, SERIES } from './TimeDomainWindow'
import NumInput, { ListInput } from './NumInput'

/** Most points kept per trace on a card. */
const CARD_POINTS = 900

/** Where the library's pin is remembered, per viewer. */
const PIN_KEY = 'speakerspice:tdLibraryPinned'

/** Where saved drawer presets are kept, per viewer. */
const PRESETS_KEY = 'speakerspice:tdPresets'

/** The MIME type a dragged run list travels as. */
const DRAG_TYPE = 'application/x-speakerspice-runs'

/**
 * Format a number with fixed decimals.
 *
 * @param {number|null} v - The value.
 * @param {number} [d] - Decimals.
 * @returns {string} The text, or a dash.
 * @pure
 */
const fmt = (v, d = 1) => (v == null || !Number.isFinite(v) ? '—' : v.toFixed(d).replace(/^-/, '−'))

/**
 * Every stored run in the workspace, newest first, kept in step with the store.
 *
 * @returns {Array<object>} The runs, as `runIndex` lists them.
 * @sideEffect Subscribes to the store.
 */
export function useRuns() {
  const workspace = useStore((s) => s.workspace)
  const records = useStore((s) => s.records)
  const activeFile = useStore((s) => s.activeFile)
  const projectName = useStore((s) => s.projectName)
  return useMemo(() => runIndex({ workspace, records, activeFile, projectName }), [workspace, records, activeFile, projectName])
}

/**
 * Results of some runs, read as they are needed.
 *
 * @param {Array<object>} entries - The runs.
 * @returns {Object<string, object>} What is known of each, by id; see `runDataOf`.
 * @sideEffect Subscribes to the store; asks the store to read results not yet read.
 */
function useRunData(entries) {
  useStore((s) => s.tdDataTick)
  const load = useStore((s) => s.loadRunData)
  useEffect(() => { for (const e of entries) if (e && !runDataOf(e.id)) load(e) }, [entries, load])
  return Object.fromEntries(entries.filter(Boolean).map((e) => [e.id, runDataOf(e.id)]))
}

/**
 * The board's runs in order, with each one's letter and colour.
 *
 * @param {object} board - The board.
 * @param {Array<object>} runs - Every stored run.
 * @returns {Map<string, {letter: string, color: string, entry: object|null}>} By run id.
 * @pure
 */
function boardKeys(board, runs) {
  const byId = new Map(runs.map((r) => [r.id, r]))
  return new Map(boardRuns(board).map((id, i) => [id, { letter: letterOf(i), color: SERIES[i % SERIES.length], entry: byId.get(id) || null }]))
}

/**
 * The run ids a drag carries.
 *
 * @param {DragEvent} e - The drop or dragover event.
 * @returns {string[]} The ids; none when the drag is not of runs.
 * @pure
 */
function draggedRuns(e) {
  try { return JSON.parse(e.dataTransfer.getData(DRAG_TYPE) || '[]') } catch { return [] }
}

/**
 * Start dragging runs.
 *
 * @param {DragEvent} e - The dragstart event.
 * @param {string[]} ids - The runs.
 * @returns {void}
 * @sideEffect Sets the drag's data.
 */
function dragRuns(e, ids) {
  e.dataTransfer.setData(DRAG_TYPE, JSON.stringify(ids))
  e.dataTransfer.effectAllowed = 'copy'
}

/**
 * Whether a drag carries runs.
 *
 * @param {DragEvent} e - The event.
 * @returns {boolean} True for a run drag.
 * @pure
 */
const isRunDrag = (e) => Array.from(e.dataTransfer?.types || []).includes(DRAG_TYPE)

/**
 * A day's heading for the library.
 *
 * @param {number} at - Ms since the epoch.
 * @param {number} now - The time now.
 * @returns {string} `Today`, `Yesterday` or a date.
 * @pure
 */
export function dayLabel(at, now = Date.now()) {
  const d = new Date(at)
  const today = new Date(now)
  today.setHours(0, 0, 0, 0)
  const diff = Math.round((today - new Date(d.getFullYear(), d.getMonth(), d.getDate())) / 86400000)
  if (diff <= 0) return 'Today'
  if (diff === 1) return 'Yesterday'
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', ...(d.getFullYear() !== today.getFullYear() ? { year: 'numeric' } : {}) })
}

/**
 * Library rows: runs grouped by day, a series folded into one item.
 *
 * @param {Array<object>} runs - Runs, newest first.
 * @returns {Array<{day: string, items: Array<{series?: object, run?: object}>}>} The groups.
 * @pure
 */
export function libraryGroups(runs) {
  const groups = []
  const seen = new Map()
  for (const r of runs) {
    const day = dayLabel(r.at)
    let g = groups[groups.length - 1]
    if (!g || g.day !== day) { g = { day, items: [] }; groups.push(g) }
    if (r.seriesId) {
      const s = seen.get(r.seriesId)
      if (s) { s.runs.push(r); continue }
      const item = { series: { id: r.seriesId, title: r.seriesTitle || 'Series', runs: [r] } }
      seen.set(r.seriesId, item.series)
      g.items.push(item)
    } else g.items.push({ run: r })
  }
  // a series lists its runs in the order they were queued
  for (const s of seen.values()) s.runs.sort((a, b) => (a.at || 0) - (b.at || 0))
  return groups
}

// ------------------------------------------------------------ library ---

/**
 * One run in the library.
 *
 * @param {object} props - Component props.
 * @param {object} props.run - The run.
 * @param {object|undefined} props.mark - Its letter and colour on the board, when it is on it.
 * @param {boolean} props.stale - Whether its project has changed since.
 * @param {boolean} [props.nested] - Shown inside a series.
 * @param {Function} props.onPick - Called when the swatch or title is clicked.
 * @param {Function} props.onMenu - Called with the click event to open its menu.
 * @returns {React.ReactElement} The row.
 * @pure
 */
function RunRow({ run, mark, stale, nested, onPick, onMenu }) {
  const h = run.headline || {}
  const rec = run.record >= 0 ? `R${run.record + 1}` : 'deleted record'
  return (
    <div className={`lib-row${mark ? ' on' : ''}${nested ? ' nested' : ''}`} draggable onDragStart={(e) => dragRuns(e, [run.id])}
      onContextMenu={(e) => { e.preventDefault(); onMenu(e) }}>
      <button className="lib-swatch" style={mark ? { background: mark.color } : undefined} onClick={onPick}
        title={mark ? 'On this board' : 'Add to the selected card'}>{mark?.letter || ''}</button>
      <div className="lib-text" onClick={onPick}>
        <div className="lib-title">
          <span>{nested && run.vars ? Object.entries(run.vars).map(([k, v]) => `${varLabel(k).label} ${varText(k, v)}`).join(' · ') : run.title}</span>
          {stale && <span className="lib-stale" title="The project has changed since this run" />}
          <span className={`lib-metric${h.bad ? ' bad' : ''}`}>{h.text}</span>
        </div>
        {!nested && (
          <div className="lib-meta">
            {!run.open && `${run.project} · `}{analysisLabel(run.analysis)} · {run.nonlinear ? 'NL' : 'Linear'} · {rec} · {new Date(run.at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
          </div>
        )}
      </div>
      <button className="lib-more" title="More" onClick={(e) => { e.stopPropagation(); onMenu(e) }}>⋯</button>
    </div>
  )
}

/**
 * A run's menu: start from it, restore it, rename or delete it.
 *
 * @param {object} props - Component props.
 * @param {{run: object, x: number, y: number}} props.at - The run and where the menu opens.
 * @param {Function} props.onClose - Closes the menu.
 * @returns {React.ReactElement} The menu.
 * @sideEffect Subscribes to the store; its items change runs, the drawer or the records.
 */
function RunMenu({ at, onClose }) {
  const st = useStore.getState
  const { run } = at
  const runs = at.series?.runs || [run]
  /**
   * Do something, then close the menu.
   *
   * @param {Function} fn - The action.
   * @returns {void}
   * @sideEffect Runs the action; closes the menu.
   */
  const act = (fn) => { onClose(); fn() }
  return (
    <>
      <div className="menu-veil" onClick={onClose} onContextMenu={(e) => { e.preventDefault(); onClose() }} />
      <div className="lib-menu" style={{ left: at.x, top: at.y }}>
        {!at.series && <button onClick={() => act(() => st().startFromRun(run))}>Start a new run from this</button>}
        {!at.series && <button onClick={() => act(() => st().restoreRunAsRecord(run))}
          title="Add this run's project to the open project as a new record at the end, and show it">Restore as new record</button>}
        {!at.series && <button onClick={() => act(() => { const t = prompt('Rename the run', run.title); if (t && t.trim()) st().renameRun(run, t.trim()) })}>Rename…</button>}
        <button className="danger" onClick={() => act(() => {
          if (confirm(runs.length > 1 ? `Delete these ${runs.length} runs? Their results go with them.` : `Delete "${run.title}"? Its results go with it.`)) st().deleteRuns(runs)
        })}>{runs.length > 1 ? `Delete ${runs.length} runs` : 'Delete'}</button>
      </div>
    </>
  )
}

/**
 * Queued, solving and failed runs, above the library.
 *
 * @returns {React.ReactElement|null} The queue, or nothing when it is empty.
 * @sideEffect Subscribes to the store.
 */
function QueueList() {
  const queue = useStore((s) => s.tdQueue)
  const remove = useStore((s) => s.removeQueued)
  if (!queue.length) return null
  return (
    <div className="lib-queue">
      {queue.map((j) => (
        <div key={j.id} className={`lib-job ${j.status}`}>
          <div className="lib-title">
            <span>{j.title}{j.vars && Object.keys(j.vars).some((k) => k !== 'level' && k !== 'hz') ? ` · ${Object.entries(j.vars).filter(([k]) => k !== 'level' && k !== 'hz').map(([k, v]) => `${varLabel(k).label} ${varText(k, v)}`).join(' · ')}` : ''}</span>
            <button className="lib-more" title={j.status === 'running' ? 'Cancel' : 'Remove'} onClick={() => remove(j.id)}>✕</button>
          </div>
          {j.status === 'failed'
            ? <div className="lib-error">{j.error}</div>
            : (
              <>
                <div className="td-bar"><div style={{ width: `${Math.round((j.fraction || 0) * 100)}%` }} /></div>
                <div className="lib-meta">{j.status === 'queued' ? 'Queued' : j.message}</div>
              </>
            )}
        </div>
      ))}
    </div>
  )
}

/**
 * The floating library of stored runs: search, filter, grouped by day, collapsible to a strip.
 *
 * @param {object} props - Component props.
 * @param {object|null} props.board - The board shown, for swatches.
 * @returns {React.ReactElement} The library.
 * @sideEffect Subscribes to the store; remembers its pin in LocalStorage.
 */
export function RunLibrary({ board }) {
  const selectedCard = useStore((s) => s.tdCard)
  const card = board?.cards.some((c) => c.id === selectedCard) ? selectedCard : null
  const runs = useRuns()
  const sig = useStore((s) => s.tdSignature())
  const drawer = useStore((s) => s.tdDrawer)
  const queue = useStore((s) => s.tdQueue)
  const [pinned, setPinned] = useState(() => { try { return localStorage.getItem(PIN_KEY) !== '0' } catch { return true } })
  const [hover, setHover] = useState(false)
  const [query, setQuery] = useState('')
  const [kind, setKind] = useState('')
  const [scope, setScope] = useState('project')
  const [open, setOpen] = useState({})
  const [menu, setMenu] = useState(null)
  const keys = useMemo(() => (board ? boardKeys(board, runs) : new Map()), [board, runs])
  /**
   * Pin or unpin the library.
   *
   * @param {boolean} on - Pinned.
   * @returns {void}
   * @sideEffect Writes component state and LocalStorage.
   */
  const pin = (on) => {
    setPinned(on)
    try { localStorage.setItem(PIN_KEY, on ? '1' : '0') } catch { /* not remembered */ }
  }
  const shown = runs.filter((r) => (scope === 'all' || r.open)
    && (!kind || r.analysis === kind)
    && (!query || `${r.title} ${r.project} ${r.seriesTitle || ''} ${r.note || ''}`.toLowerCase().includes(query.toLowerCase())))
  const groups = libraryGroups(shown)
  /**
   * A run was clicked: with the drawer open, start from it; otherwise put it on the selected card, or on every card.
   *
   * @param {string[]} ids - The runs.
   * @param {object} [run] - The run itself, when one.
   * @returns {void}
   * @sideEffect Writes the drawer or the board.
   */
  const pick = (ids, run) => {
    const st = useStore.getState()
    if (drawer && run) { st.startFromRun(run); return }
    if (board) st.addRunsToCard(board.id, ids, card || undefined)
  }
  const running = queue.some((j) => j.status === 'running')
  if (!pinned && !hover) {
    return (
      <div className="lib-strip" onMouseEnter={() => setHover(true)} title="Runs — hover to open, pin to keep open">
        <span>▸</span>
        <span className="lib-strip-label">Runs</span>
        <span className="lib-count">{runs.filter((r) => r.open).length}</span>
        {(running || queue.length > 0) && <span className="lib-dot" />}
      </div>
    )
  }
  return (
    <div className={`lib${pinned ? '' : ' floating'}`} onMouseLeave={() => setHover(false)}>
      <div className="lib-head">
        <span className="lib-heading">Runs</span>
        <span className="lib-count">{shown.length}</span>
        <span style={{ flex: 1 }} />
        <div className="seg small">
          <button className={scope === 'project' ? 'on' : ''} onClick={() => setScope('project')} title="Runs of the open project">This project</button>
          <button className={scope === 'all' ? 'on' : ''} onClick={() => setScope('all')} title="Runs of every project in the workspace">All</button>
        </div>
        <button className="icon-btn" title={pinned ? 'Collapse to a strip' : 'Pin open'} onClick={() => pin(!pinned)}>{pinned ? '◂' : '📌'}</button>
      </div>
      <div className="lib-filters">
        <input placeholder="Search runs…" value={query} onChange={(e) => setQuery(e.target.value)} />
        <select value={kind} onChange={(e) => setKind(e.target.value)}>
          <option value="">All kinds</option>
          {ANALYSES.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
        </select>
      </div>
      <div className="lib-body">
        <QueueList />
        {!groups.length && (
          <div className="lib-empty">
            {runs.length ? 'No runs match.' : 'No runs yet. Press New run: every run is kept here, with the project as it was run.'}
          </div>
        )}
        {groups.map((g) => (
          <div key={g.day} className="lib-group">
            <div className="lib-day">{g.day}<span>{g.items.length}</span></div>
            {g.items.map((it) => {
              if (it.run) {
                const r = it.run
                return <RunRow key={r.id} run={r} mark={keys.get(r.id)} stale={r.open && r.sig !== sig}
                  onPick={() => pick([r.id], r)} onMenu={(e) => setMenu({ run: r, x: e.clientX, y: e.clientY })} />
              }
              const s = it.series
              const ids = s.runs.map((r) => r.id)
              const on = ids.filter((id) => keys.has(id)).length
              return (
                <div key={s.id} className="lib-series">
                  <div className={`lib-row${on ? ' on' : ''}`} draggable onDragStart={(e) => dragRuns(e, ids)}
                    onContextMenu={(e) => { e.preventDefault(); setMenu({ run: s.runs[0], series: s, x: e.clientX, y: e.clientY }) }}>
                    <button className="lib-swatch series" onClick={() => pick(ids)} title="Put the whole series on the board">{s.runs.length}</button>
                    <div className="lib-text" onClick={() => setOpen({ ...open, [s.id]: !open[s.id] })}>
                      <div className="lib-title"><span>{open[s.id] ? '▾' : '▸'} {s.title}</span><span className="lib-metric">{s.runs.length} runs</span></div>
                      <div className="lib-meta">
                        Series · {analysisLabel(s.runs[0].analysis)} · {s.runs[0].record >= 0 ? `R${s.runs[0].record + 1}` : 'deleted record'}
                        {!s.runs[0].open && ` · ${s.runs[0].project}`}
                      </div>
                    </div>
                    <button className="lib-more" title="More" onClick={(e) => setMenu({ run: s.runs[0], series: s, x: e.clientX, y: e.clientY })}>⋯</button>
                  </div>
                  {open[s.id] && s.runs.map((r) => (
                    <RunRow key={r.id} run={r} nested mark={keys.get(r.id)} stale={r.open && r.sig !== sig}
                      onPick={() => pick([r.id], r)} onMenu={(e) => setMenu({ run: r, x: e.clientX, y: e.clientY })} />
                  ))}
                </div>
              )
            })}
          </div>
        ))}
      </div>
      <div className="lib-foot">{drawer ? 'Pick a run to start from it' : 'Drag a run onto any chart · series expand into their runs'}</div>
      {menu && <RunMenu at={menu} onClose={() => setMenu(null)} />}
    </div>
  )
}

// -------------------------------------------------------------- cards ---

/**
 * Chart rows from traces on different x grids: each trace thinned, then merged by x.
 *
 * @param {Array<{key: string, x: number[], y: number[]}>} traces - The traces.
 * @returns {Array<object>} Rows `{x, key…}`, sorted by x.
 * @pure
 */
export function mergeTraces(traces) {
  const rows = new Map()
  for (const tr of traces) {
    if (!tr.x?.length) continue
    const { t, ys } = tr.x.length > CARD_POINTS ? decimate(tr.x, [tr.y], CARD_POINTS) : { t: tr.x, ys: [tr.y] }
    t.forEach((x, i) => {
      let row = rows.get(x)
      if (!row) { row = { x }; rows.set(x, row) }
      row[tr.key] = ys[0][i]
    })
  }
  return [...rows.values()].sort((a, b) => a.x - b.x)
}

/**
 * The quantities a card can offer for its runs.
 *
 * @param {Array<object>} entries - The card's runs.
 * @param {boolean} [timeOnly] - Only quantities against time.
 * @returns {Array<Array>} `QUANTITIES` entries.
 * @pure
 */
function offeredQuantities(entries, timeOnly) {
  return QUANTITIES.filter(([id, , x]) => (!timeOnly || x === 'time')
    && (entries.length ? entries.some((e) => hasQuantity(e, id)) : x === 'time'))
}

/**
 * The quantity a card draws: its own choice when its runs have it, otherwise the first they do.
 *
 * @param {object} card - The card.
 * @param {Array<object>} entries - Its runs.
 * @returns {string} A `QUANTITIES` id.
 * @pure
 */
export function effectiveQuantity(card, entries) {
  const offered = offeredQuantities(entries, card.kind === 'stacked')
  return offered.some((o) => o[0] === card.quantity) ? card.quantity : offered[0]?.[0] || card.quantity || 'pressure'
}

/**
 * A card's quantity switch.
 *
 * @param {object} props - Component props.
 * @param {string} props.value - The quantity.
 * @param {Array<object>} props.entries - The card's runs, to offer what they have.
 * @param {Function} props.onChange - Called with a quantity id.
 * @param {boolean} [props.timeOnly] - Only quantities against time.
 * @returns {React.ReactElement} The switch.
 * @pure
 */
function QuantitySwitch({ value, entries, onChange, timeOnly }) {
  const offered = offeredQuantities(entries, timeOnly)
  return (
    <div className="seg small card-seg">
      {offered.map(([id, label]) => <button key={id} className={value === id ? 'on' : ''} onClick={() => onChange(id)}>{label}</button>)}
    </div>
  )
}

/**
 * An overlay, stacked or difference chart of a quantity across the card's runs.
 *
 * @param {object} props - Component props.
 * @param {object} props.card - The card.
 * @param {Array<object>} props.entries - Its runs.
 * @param {Map} props.keys - Letters and colours by run id.
 * @returns {React.ReactElement} The chart, or why there is none.
 * @sideEffect Subscribes to the store for run results.
 */
function QuantityChart({ card, entries, keys }) {
  const q = effectiveQuantity(card, entries)
  const xKind = (QUANTITIES.find((x) => x[0] === q) || [])[2]
  const needData = !q.startsWith('m:')
  const data = useRunData(needData ? entries : [])
  const loading = needData && entries.some((e) => !data[e.id] || data[e.id].loading)
  const failed = entries.map((e) => data[e.id]?.error).find(Boolean)
  const built = useMemo(() => {
    const lines = []
    const traces = []
    entries.forEach((e) => {
      const k = keys.get(e.id)
      const trs = runTraces(e, needData ? data[e.id]?.data || null : null, q)
      trs.forEach((tr, j) => {
        const key = `${e.id}_${j}`
        traces.push({ key, x: tr.x, y: tr.y, run: e.id, dash: tr.dash, name: tr.name })
      })
    })
    if (card.kind === 'difference') {
      const base = traces.find((t) => t.run === entries[0]?.id && !t.dash)
      const out = []
      for (const e of entries.slice(1)) {
        const t = traces.find((x) => x.run === e.id && !x.dash)
        if (!base || !t) continue
        const d = differenceOf(base, t)
        const k = keys.get(e.id)
        out.push({ key: `d_${e.id}`, x: d.x, y: d.y })
        lines.push({ key: `d_${e.id}`, name: `${k.letter} − ${keys.get(entries[0].id).letter}`, color: k.color, width: 1.75 })
      }
      return { rows: mergeTraces(out), lines }
    }
    if (card.kind === 'stacked') {
      // one lane per run, spaced by the largest swing
      let swing = 0
      for (const t of traces) for (const v of t.y) if (Number.isFinite(v)) swing = Math.max(swing, Math.abs(v))
      const gap = swing * 2.4 || 1
      const lanes = entries.map((e, i) => ({ e, y: (entries.length - 1 - i) * gap }))
      const laid = traces.filter((t) => !t.dash).map((t) => {
        const lane = lanes.find((l) => l.e.id === t.run)
        return { ...t, y: t.y.map((v) => v + lane.y) }
      })
      for (const t of laid) {
        const k = keys.get(t.run)
        lines.push({ key: t.key, name: `${k.letter}${t.name ? ` · ${t.name}` : ''}`, color: k.color, width: 1.6 })
      }
      /**
       * A lane's tick: the letter of the run drawn on it.
       *
       * @param {number} v - The tick's value, a lane's baseline.
       * @returns {string} The letter, or nothing between lanes.
       * @pure
       */
      const laneLetter = (v) => {
        const l = lanes.find((x) => Math.abs(x.y - v) < 1e-9)
        if (!l) return ''
        const vars = Object.entries(l.e.vars || {})
        return vars.length ? vars.map(([key, x]) => varText(key, x)).join(' · ') : keys.get(l.e.id).letter
      }
      return {
        rows: mergeTraces(laid), lines, ticks: lanes.map((l) => l.y).sort((a, b) => a - b),
        tickLabel: laneLetter,
        refs: lanes.map((l) => ({ y: l.y, color: 'var(--text-4)' })),
      }
    }
    for (const t of traces) {
      const k = keys.get(t.run)
      const many = traces.filter((x) => x.run === t.run && !x.dash).length > 1
      lines.push({
        key: t.key, name: `${k.letter}${t.name ? ` · ${t.name}` : ''}`, color: t.dash ? 'var(--text-3)' : k.color,
        dash: t.dash ? '5 3' : undefined, width: t.dash ? 1 : many ? 1.5 : 2, legend: !t.dash,
      })
    }
    return { rows: mergeTraces(traces), lines }
  }, [entries, keys, data, q, card.kind, needData])
  if (!entries.length) return <div className="card-empty">Drag runs here from the library.</div>
  if (failed) return <div className="card-empty bad">{failed}</div>
  if (loading) return <div className="card-empty">Reading results…</div>
  if (!built.rows.length) return <div className="card-empty">{card.kind === 'difference' && entries.length < 2 ? 'Add a second run: the difference is each run minus the first.' : 'These runs have nothing to draw for this.'}</div>
  const xmaxRefs = q === 'excursion' && card.kind !== 'stacked'
    ? [...new Set(entries.flatMap((e) => Object.values(e.info?.xmax || {})).filter((v) => v > 0))].flatMap((v) => [{ y: v, label: 'Xmax' }, { y: -v }])
    : []
  return (
    <TdChart bare data={built.rows} lines={built.lines} xKey="x" xLabel={xKind === 'time' ? 'ms' : 'Hz'} logX={xKind === 'hz'}
      yLabel={card.kind === 'stacked' ? `${quantityUnit(q)} per lane` : card.kind === 'difference' && q === 'spectrum' ? 'dB' : quantityUnit(q)}
      yTicks={built.ticks} yTickLabel={built.tickLabel}
      refs={[...(built.refs || []), ...xmaxRefs, ...(card.kind === 'difference' ? [{ y: 0, color: 'var(--text-3)' }] : [])]}
      yDomain={q === 'spectrum' && card.kind !== 'difference' ? ['dataMax - 90', 'dataMax + 5'] : undefined}
    />
  )
}

/**
 * The varied settings and figures across a card's runs' points.
 *
 * @param {Array<object>} entries - The runs.
 * @returns {{points: Array<object>, vars: string[], metrics: string[]}} Every point (with its run), the settings that vary across them, and the figures they carry.
 * @pure
 */
export function cardPoints(entries) {
  const points = entries.flatMap((e) => (e.points || []).map((p) => ({ ...p, run: e })))
  const values = new Map()
  for (const p of points) for (const [k, v] of Object.entries(p.vars)) values.set(k, new Set([...(values.get(k) || []), v]))
  const vars = [...values.entries()].filter(([, s]) => s.size > 1).map(([k]) => k)
  const metrics = Object.keys(METRICS).filter((k) => points.some((p) => p.m[k] != null))
  return { points, vars, metrics }
}

/**
 * A figure plotted against a varied setting, one line per value of another.
 *
 * @param {object} props - Component props.
 * @param {object} props.card - The card.
 * @param {Array<object>} props.entries - Its runs.
 * @param {Map} props.keys - Letters and colours by run id.
 * @returns {React.ReactElement} The chart.
 * @pure
 */
function MetricChart({ card, entries, keys }) {
  const { points, vars } = cardPoints(entries)
  const x = vars.includes(card.x) ? card.x : vars[0]
  if (!entries.length) return <div className="card-empty">Drag a series here — the figure is plotted against what it varied.</div>
  if (!x) return <div className="card-empty">These runs vary nothing to plot against. A series from New run ▸ Vary does.</div>
  const per = card.per
  /**
   * The group a point belongs to.
   *
   * @param {object} p - A point.
   * @returns {string} Its group's label.
   * @pure
   */
  const groupOf = (p) => {
    if (per === 'project') return p.run.project
    if (per === 'record') return p.run.record >= 0 ? `Record ${p.run.record + 1}` : 'deleted record'
    if (per === 'run') return keys.get(p.run.id)?.letter || p.run.title
    if (per && per !== 'none' && per !== x && p.vars[per] != null) return varText(per, p.vars[per])
    return ''
  }
  // Points join into a line only within one series (or one run): runs that
  // were never meant to be read together are not drawn as one curve.
  const groups = new Map()
  const sets = new Set(points.map((p) => p.run.seriesId || p.run.id))
  for (const p of points) {
    if (p.vars[x] == null || p.m[card.y] == null) continue
    const set = p.run.seriesId || p.run.id
    const g = groupOf(p)
    const key = `${g}|${set}`
    if (!groups.has(key)) groups.set(key, { label: [g, sets.size > 1 ? keys.get(p.run.id)?.letter : ''].filter(Boolean).join(' · '), pts: [] })
    groups.get(key).pts.push([p.vars[x], p.m[card.y]])
  }
  const traces = [...groups.values()].map(({ label, pts }, i) => {
    pts.sort((a, b) => a[0] - b[0])
    return { key: `g${i}`, name: label || METRICS[card.y]?.label, x: pts.map((p) => p[0]), y: pts.map((p) => p[1]) }
  })
  const unit = METRICS[card.y]?.unit || ''
  const refs = card.y === 'cmp' ? [{ y: 0, color: 'var(--text-3)' }] : card.y === 'xPeak'
    ? [...new Set(entries.flatMap((e) => Object.values(e.info?.xmax || {})).filter((v) => v > 0))].map((v) => ({ y: v, label: 'Xmax' })) : []
  return (
    <TdChart bare data={mergeTraces(traces)} xKey="x" xLabel={[varLabel(x).label.toLowerCase(), varLabel(x).unit].filter(Boolean).join(', ')} logX={x === 'hz'}
      yLabel={unit} refs={refs}
      lines={traces.map((t, i) => ({ key: t.key, name: t.name, color: SERIES[(i + 4) % SERIES.length], width: 2, marker: true }))} />
  )
}

/**
 * Every figure of the card's runs, a row per point, columns chosen.
 *
 * @param {object} props - Component props.
 * @param {object} props.card - The card.
 * @param {Array<object>} props.entries - Its runs.
 * @param {Map} props.keys - Letters and colours by run id.
 * @param {Function} props.update - Writes a patch to the card.
 * @returns {React.ReactElement} The table.
 * @sideEffect Keeps the column menu's state.
 */
function FigureTable({ card, entries, keys, update }) {
  const [adding, setAdding] = useState(false)
  const { points, vars, metrics } = cardPoints(entries)
  const cols = (card.columns || []).filter((c) => METRICS[c])
  if (!entries.length) return <div className="card-empty">Drag runs here: a row per run, a column per figure.</div>
  const xmax = Math.max(0, ...entries.flatMap((e) => Object.values(e.info?.xmax || {})))
  return (
    <div className="card-table-wrap">
      <table className="td-table card-table">
        <thead>
          <tr>
            <th>Run</th>
            {vars.map((k) => <th key={k}>{varLabel(k).label}</th>)}
            {cols.map((c) => (
              <th key={c}>{METRICS[c].label}
                <button className="th-x" title="Remove this column" onClick={() => update({ columns: cols.filter((x) => x !== c) })}>✕</button>
              </th>
            ))}
            <th className="th-add">
              <button onClick={() => setAdding(!adding)}>+ Column</button>
              {adding && (
                <div className="lib-menu" style={{ position: 'absolute', right: 0, top: '100%' }}>
                  {metrics.filter((m) => !cols.includes(m)).map((m) => (
                    <button key={m} onClick={() => { update({ columns: [...cols, m] }); setAdding(false) }}>{METRICS[m].label}</button>
                  ))}
                  {!metrics.some((m) => !cols.includes(m)) && <span className="lib-meta">Every figure is shown.</span>}
                </div>
              )}
            </th>
          </tr>
        </thead>
        <tbody>
          {points.map((p, i) => {
            const k = keys.get(p.run.id)
            return (
              <tr key={i}>
                <td className="card-run" title={`${k?.letter} · ${p.run.title}`}><span className="sw" style={{ background: k?.color }} />{p.run.vars && Object.keys(p.run.vars).length
                  ? Object.entries(p.run.vars).map(([key, v]) => varText(key, v)).join(' · ')
                  : `${k?.letter} · ${p.run.title}`}</td>
                {vars.map((v) => <td key={v}>{p.vars[v] != null ? varText(v, p.vars[v]) : '—'}</td>)}
                {cols.map((c) => <td key={c} className={c === 'xPeak' && p.m.xOver > 1 ? 'bad' : ''}>{fmt(p.m[c], METRICS[c].digits)}{p.m[c] != null ? ` ${METRICS[c].unit}` : ''}</td>)}
                <td />
              </tr>
            )
          })}
        </tbody>
      </table>
      {cols.includes('xPeak') && xmax > 0 && <div className="card-note">Excursion in red where it passes Xmax.</div>}
    </div>
  )
}

/**
 * One run's full report, as its analysis shows it.
 *
 * @param {object} props - Component props.
 * @param {object|undefined} props.entry - The run.
 * @returns {React.ReactElement} The report.
 * @sideEffect Subscribes to the store for the run's results.
 */
function Report({ entry }) {
  const data = useRunData(entry ? [entry] : [])[entry?.id]
  const nodes = useMemo(() => (data?.content?.nodes || []).map((n) => ({ id: n.id, type: n.type, data: { params: n.params || {} } })), [data])
  if (!entry) return <div className="card-empty">Drag a run here to see everything it measured.</div>
  if (!data || data.loading) return <div className="card-empty">Reading results…</div>
  if (data.error) return <div className="card-empty bad">{data.error}</div>
  const res = { ...data.data.result, opts: data.data.opts }
  return (
    <div className="card-report">
      {entry.warnings?.length > 0 && <div className="td-failed">{entry.warnings.join(' ')}</div>}
      {entry.analysis === 'transient'
        ? <TransientView res={res} nodes={nodes} onRun={() => {}} />
        : <DistortionView mode={entry.analysis} res={res} nodes={nodes} onRun={() => {}} />}
    </div>
  )
}

/**
 * Keeps a card that fails to draw from taking the board down with it.
 *
 * @sideEffect Catches render errors from the card's content.
 */
class CardBoundary extends React.Component {
  /**
   * Start with no error.
   *
   * @param {object} props - `{children}`.
   * @mutates this.state
   */
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  /**
   * Note the error, so the card shows it instead of its content.
   *
   * @param {Error} error - What went wrong.
   * @returns {{error: Error}} The new state.
   * @pure
   */
  static getDerivedStateFromError(error) {
    return { error }
  }

  /**
   * The card's content, or what went wrong drawing it.
   *
   * @returns {React.ReactElement} The content.
   * @reads the component's props and state.
   */
  render() {
    if (this.state.error) return <div className="card-empty bad">This card could not be drawn: {this.state.error.message}</div>
    return this.props.children
  }
}

/**
 * One card on a board.
 *
 * @param {object} props - Component props.
 * @param {object} props.board - The board.
 * @param {object} props.card - The card.
 * @param {Map} props.keys - Letters and colours by run id.
 * @param {boolean} props.selected - Whether a library click adds to it.
 * @param {Function} props.onSelect - Selects it, so library clicks add to it.
 * @param {boolean} props.max - Whether it fills the board.
 * @param {Function} props.onMax - Toggles filling the board.
 * @returns {React.ReactElement} The card.
 * @sideEffect Subscribes to the store; edits the card.
 */
function Card({ board, card, keys, selected, onSelect, max, onMax }) {
  const updateCard = useStore((s) => s.updateTdCard)
  const addRuns = useStore((s) => s.addRunsToCard)
  const [over, setOver] = useState(false)
  /**
   * Write a patch to this card.
   *
   * @param {object|null} patch - Fields; `null` removes it.
   * @returns {void}
   * @sideEffect Writes the board.
   */
  const update = (patch) => updateCard(board.id, card.id, patch)
  const entries = card.runs.map((id) => keys.get(id)?.entry).filter(Boolean)
  const missing = card.runs.length - entries.length
  const kindLabel = (CARD_KINDS.find((k) => k[0] === card.kind) || [])[1]
  const { vars, metrics } = card.kind === 'metric' ? cardPoints(entries) : { vars: [], metrics: [] }
  const series = entries.length > 1 && entries.every((e) => e.seriesId && e.seriesId === entries[0].seriesId) ? entries[0].seriesTitle : null
  const note = card.kind === 'table' ? 'Figures per run · columns from any scalar'
    : card.kind === 'report' ? entries[0]?.title || ''
      : card.kind === 'difference' ? (entries.length > 1 ? `${entries.slice(1).map((e) => keys.get(e.id).letter).join(', ')} − ${keys.get(entries[0].id).letter}` : '')
        : card.kind === 'metric' ? '' : series ? `${series} · ${entries.length} runs` : ''
  return (
    <div className={`card ${card.kind}${selected ? ' selected' : ''}${over ? ' drop' : ''}${max ? ' max' : ''}`}
      style={{ gridColumn: max || card.span === 2 ? '1 / -1' : undefined }}
      onMouseDown={onSelect}
      onDragOver={(e) => { if (isRunDrag(e)) { e.preventDefault(); setOver(true) } }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => { e.preventDefault(); e.stopPropagation(); setOver(false); const ids = draggedRuns(e); if (ids.length) addRuns(board.id, ids, card.id) }}>
      <div className="card-head">
        <span className="card-kind">{kindLabel}</span>
        {card.runs.map((id) => {
          const k = keys.get(id)
          return (
            <button key={id} className="card-sw" style={{ background: k?.entry ? k.color : 'var(--text-4)' }}
              title={`${k?.entry ? `${k.letter} · ${k.entry.title}${k.entry.open ? '' : ` — ${k.entry.project}`}` : 'Deleted run'} — click to take it off this card`}
              onClick={() => update({ runs: card.runs.filter((r) => r !== id) })}>{k?.letter}</button>
          )
        })}
        {note && <span className="card-note-t">{note}</span>}
        {card.kind === 'metric' && (
          <span className="card-pickers">
            Y <select value={card.y} onChange={(e) => update({ y: e.target.value })}>
              {(metrics.length ? metrics : Object.keys(METRICS)).map((m) => <option key={m} value={m}>{METRICS[m].label}</option>)}
            </select>
            · X <select value={vars.includes(card.x) ? card.x : vars[0] || ''} onChange={(e) => update({ x: e.target.value })}>
              {vars.length ? vars.map((v) => <option key={v} value={v}>{varLabel(v).label}</option>) : <option value="">—</option>}
            </select>
            · per <select value={card.per || 'none'} onChange={(e) => update({ per: e.target.value })}>
              <option value="none">—</option>
              {vars.filter((v) => v !== card.x).map((v) => <option key={v} value={v}>{varLabel(v).label}</option>)}
              <option value="run">Run</option>
              <option value="project">Project</option>
              <option value="record">Record</option>
            </select>
          </span>
        )}
        <span className="card-right">
          {(card.kind === 'overlay' || card.kind === 'stacked' || card.kind === 'difference') && (
            <QuantitySwitch value={effectiveQuantity(card, entries)} entries={entries} timeOnly={card.kind === 'stacked'} onChange={(q) => update({ quantity: q })} />
          )}
          <button className="card-glyph" title={card.span === 2 ? 'Half width' : 'Full width'} onClick={() => update({ span: card.span === 2 ? 1 : 2 })}>{card.span === 2 ? '⇥' : '⇔'}</button>
          <button className="card-glyph" title={max ? 'Back to the board' : 'Fill the board'} onClick={onMax}>⛶</button>
          <button className="card-glyph x" title="Remove this card" onClick={() => update(null)}>✕</button>
        </span>
      </div>
      {missing > 0 && <div className="card-note">{missing === 1 ? 'One run on this card was deleted.' : `${missing} runs on this card were deleted.`}</div>}
      <div className="card-body"><CardBoundary key={`${card.kind}${card.quantity}${card.runs.join()}`}>
        {(card.kind === 'overlay' || card.kind === 'stacked' || card.kind === 'difference') && <QuantityChart card={card} entries={entries} keys={keys} />}
        {card.kind === 'metric' && <MetricChart card={card} entries={entries} keys={keys} />}
        {card.kind === 'table' && <FigureTable card={card} entries={entries} keys={keys} update={update} />}
        {card.kind === 'report' && <Report entry={entries[0]} />}
      </CardBoundary></div>
    </div>
  )
}

/**
 * A board: its cards in a grid, under the floating library.
 *
 * @param {object} props - Component props.
 * @param {object} props.board - The board.
 * @returns {React.ReactElement} The board.
 * @sideEffect Subscribes to the store; keeps the enlarged card; selects cards.
 */
export function Board({ board }) {
  const runs = useRuns()
  const keys = useMemo(() => boardKeys(board, runs), [board, runs])
  const updateCard = useStore((s) => s.updateTdCard)
  const selected = useStore((s) => s.tdCard)
  const setSelected = useStore((s) => s.setTdCard)
  const [max, setMax] = useState(null)
  const [over, setOver] = useState(false)
  const cards = max ? board.cards.filter((c) => c.id === max) : board.cards
  return (
    <div className={`board${over ? ' drop' : ''}`}
      onDragOver={(e) => { if (isRunDrag(e)) { e.preventDefault(); setOver(true) } }}
      onDragLeave={(e) => { if (e.currentTarget === e.target) setOver(false) }}
      onDrop={(e) => {
        e.preventDefault(); setOver(false)
        const ids = draggedRuns(e)
        if (ids.length) updateCard(board.id, null, { kind: 'overlay', runs: ids })
      }}>
      {!board.cards.length && (
        <div className="board-empty">
          This board has no cards yet. Use <b>+ Add comparison</b>, or drop runs here to start with an overlay.
        </div>
      )}
      <div className="board-grid">
        {cards.map((c) => (
          <Card key={c.id} board={board} card={c} keys={keys} selected={selected === c.id} onSelect={() => setSelected(c.id)}
            max={max === c.id} onMax={() => setMax(max === c.id ? null : c.id)} />
        ))}
      </div>
    </div>
  )
}

/**
 * The "+ Add comparison" menu.
 *
 * @param {object} props - Component props.
 * @param {object} props.board - The board cards are added to.
 * @returns {React.ReactElement} The button and, when open, its menu.
 * @sideEffect Keeps whether it is open; adds cards.
 */
export function AddComparison({ board }) {
  const [open, setOpen] = useState(false)
  const updateCard = useStore((s) => s.updateTdCard)
  return (
    <span style={{ position: 'relative' }}>
      <button onClick={() => setOpen(!open)}>+ Add comparison</button>
      {open && (
        <>
          <div className="menu-veil" onClick={() => setOpen(false)} />
          <div className="lib-menu add-menu" style={{ right: 0, top: 'calc(100% + 6px)' }}>
            {CARD_KINDS.map(([id, label, d]) => (
              <button key={id} onClick={() => { updateCard(board.id, null, { kind: id }); setOpen(false) }}>
                <span>{label}</span><span className="lib-meta">{d}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </span>
  )
}

/**
 * A new board's start: pick a layout, or start blank.
 *
 * @returns {React.ReactElement} The template picker.
 * @sideEffect Subscribes to the store; adds a board.
 */
export function BoardStart() {
  const add = useStore((s) => s.addTdBoard)
  const updateCard = useStore((s) => s.updateTdCard)
  const [over, setOver] = useState(false)
  return (
    <div className={`board start${over ? ' drop' : ''}`}
      onDragOver={(e) => { if (isRunDrag(e)) { e.preventDefault(); setOver(true) } }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault()
        const ids = draggedRuns(e)
        if (!ids.length) return
        const id = add('overlay')
        const card = useStore.getState().tdBoards.find((b) => b.id === id).cards[0]
        updateCard(id, card.id, { runs: ids })
      }}>
      <div className="start-box">
        <div className="start-head">
          <span>Start a board</span>
          <span className="lib-meta">Pick a layout, or drop runs anywhere here to start with an overlay.</span>
        </div>
        <div className="start-grid">
          {TEMPLATES.map(([id, label, d, cards]) => (
            <button key={id} className="start-card" onClick={() => add(id, label)}>
              <span className={`start-thumb t-${id}`}><i /><i /><i /><i /></span>
              <span className="start-label">{label}</span>
              <span className="lib-meta">{d}</span>
              <span className="start-cards">{cards}</span>
            </button>
          ))}
        </div>
        <button className="start-blank" onClick={() => add('blank')}>
          <span>Blank board</span>
          <span className="lib-meta">Boards are saved with the project; runs stay in the library either way.</span>
        </button>
      </div>
    </div>
  )
}

// ------------------------------------------------------------- drawer ---

/** Signal types, `[value, label]`. */
const SIGNALS = [['sine', 'Sine'], ['burst', 'Burst'], ['sweep', 'Sweep'], ['noise', 'Noise']]

/** Sample rates offered, Hz. */
const RATES = [4000, 8000, 16000, 24000, 48000]

/**
 * One field of the drawer: a label, a number box and its unit.
 *
 * @param {object} props - Component props.
 * @param {string} props.label - Label.
 * @param {*} props.value - Value.
 * @param {Function} props.onChange - Called with the new value.
 * @param {string} [props.unit] - Unit.
 * @param {boolean} [props.varied] - Shown as "varied" because the series sets it.
 * @param {object} [props.limits] - `NumInput` limits: `min`, `above`, `integer`, `step`.
 * @param {string} [props.title] - Tooltip.
 * @returns {React.ReactElement} The field.
 * @pure
 */
function Field({ label, value, onChange, unit, varied, limits = {}, title }) {
  return (
    <label className="dr-field" title={title || ''}>
      <span className="dr-l">{label}</span>
      {varied ? <span className="dr-varied">varied</span> : <NumInput value={value} onCommit={onChange} {...limits} />}
      <span className="dr-u">{unit || ''}</span>
    </label>
  )
}

/**
 * The analysis's own settings in the drawer.
 *
 * @param {object} props - Component props.
 * @param {string} props.analysis - An `ANALYSES` id.
 * @param {{transient: object, distortion: object}} props.cfg - The project's time-domain settings.
 * @param {string[]} props.varied - Vary keys the series sets.
 * @returns {React.ReactElement} The fields.
 * @sideEffect Subscribes to the store; writes the project's time-domain settings.
 */
function AnalysisFields({ analysis, cfg, varied }) {
  const setTd = useStore((s) => s.setTdSettings)
  const t = cfg.transient
  const d = cfg.distortion
  /**
   * Write transient settings.
   *
   * @param {object} p - Fields to merge.
   * @returns {void}
   * @sideEffect Writes the project's settings.
   */
  const setT = (p) => setTd('transient', p)
  /**
   * Write the transient signal.
   *
   * @param {object} p - Fields to merge.
   * @returns {void}
   * @sideEffect Writes the project's settings.
   */
  const setSig = (p) => setT({ signal: { ...t.signal, ...p } })
  /**
   * Write distortion settings.
   *
   * @param {object} p - Fields to merge.
   * @returns {void}
   * @sideEffect Writes the project's settings.
   */
  const setD = (p) => setTd('distortion', p)
  const lv = varied.includes('level')
  const hz = varied.includes('hz')
  const nl = analysis === 'transient' ? t.nonlinear : d.nonlinear
  return (
    <div className="dr-card">
      <div className="dr-card-head">
        <span>Signal and solver</span>
        {analysis === 'transient' && (
          <div className="seg small">
            {SIGNALS.map(([v, l]) => <button key={v} className={t.signal.type === v ? 'on' : ''} onClick={() => setSig({ type: v })}>{l}</button>)}
          </div>
        )}
      </div>
      <div className="dr-grid">
        {analysis === 'transient' && (
          <>
            {(t.signal.type === 'sine' || t.signal.type === 'burst') && <Field label="Frequency" unit="Hz" value={t.signal.hz} varied={hz} limits={{ above: 0 }} onChange={(v) => setSig({ hz: v })} />}
            {t.signal.type === 'burst' && <Field label="Cycles" value={t.signal.cycles} limits={{ min: 1, step: 0.5 }} onChange={(v) => setSig({ cycles: v })} />}
            {(t.signal.type === 'sweep' || t.signal.type === 'noise') && (
              <>
                <Field label="From" unit="Hz" value={t.signal.f1} limits={{ above: 0 }} onChange={(v) => setSig({ f1: v })} />
                <Field label="To" unit="Hz" value={t.signal.f2} limits={{ above: 0 }} onChange={(v) => setSig({ f2: v })} />
                <Field label="Length" unit="s" value={t.signal.length} limits={{ above: 0 }} onChange={(v) => setSig({ length: v })} />
              </>
            )}
            <Field label="Level" unit="dB" value={t.levelDb} varied={lv} onChange={(v) => setT({ levelDb: v })}
              title="Over every channel's level. Tones peak at √2 × the channel's volts; noise has them as its RMS." />
            <Field label="Duration" unit="s" value={t.duration} limits={{ above: 0 }} onChange={(v) => setT({ duration: v })} />
            <label className="dr-field" title="Samples per second in the result. Higher rates cost proportionally more; 8 kHz covers a 1 kHz model band.">
              <span className="dr-l">Sample rate</span>
              <select value={t.fs} onChange={(e) => setT({ fs: Number(e.target.value) })}>
                {RATES.map((r) => <option key={r} value={r}>{r / 1000} kHz</option>)}
              </select>
              <span className="dr-u" />
            </label>
            <Field label="Model band" unit="Hz" value={t.bandwidth} limits={{ min: 100 }} onChange={(v) => setT({ bandwidth: v })}
              title="Highest frequency the model represents. Ducts are sliced for it; a lower band runs faster." />
          </>
        )}
        {analysis === 'harmonics' && <Field label="Frequency" unit="Hz" value={d.hz} varied={hz} limits={{ above: 0 }} onChange={(v) => setD({ hz: v })} />}
        {(analysis === 'thd' || analysis === 'compression') && (
          <>
            <Field label="From" unit="Hz" value={d.f1} limits={{ above: 0 }} onChange={(v) => setD({ f1: v })} />
            <Field label="To" unit="Hz" value={d.f2} limits={{ above: 0 }} onChange={(v) => setD({ f2: v })} />
            <Field label="Points" value={d.points} limits={{ min: 2, integer: true }} onChange={(v) => setD({ points: v })} />
          </>
        )}
        {(analysis === 'harmonics' || analysis === 'thd') && <Field label="Level" unit="dB" value={d.levelDb} varied={lv} onChange={(v) => setD({ levelDb: v })} />}
        {analysis === 'compression' && (
          <label className="dr-field wide" title="Levels over every channel's level, dB">
            <span className="dr-l">Levels</span>
            <ListInput value={d.levels} onCommit={(l) => setD({ levels: l })} />
            <span className="dr-u">dB</span>
          </label>
        )}
        {analysis === 'maxspl' && (
          <>
            <label className="dr-field wide" title="Burst frequencies, Hz — CEA-2010 uses the third-octave centres from 20 Hz">
              <span className="dr-l">Bands</span>
              <ListInput value={d.bands} above="0" onCommit={(l) => setD({ bands: l })} />
              <span className="dr-u">Hz</span>
            </label>
            <Field label="Excursion limit" unit="×Xmax" value={d.xLimit} limits={{ min: 0, step: 0.1 }} onChange={(v) => setD({ xLimit: v })}
              title="Stop where a cone passes this multiple of its Xmax. 0 for no limit." />
            <Field label="Start level" unit="dB" value={d.levelDb} varied={lv} onChange={(v) => setD({ levelDb: v })} />
          </>
        )}
        {analysis !== 'transient' && analysis !== 'maxspl' && <Field label="Harmonics" value={d.harmonics} limits={{ min: 2, integer: true }} onChange={(v) => setD({ harmonics: v })} />}
        {analysis !== 'transient' && <Field label="Model band" unit="Hz" value={d.bandwidth} limits={{ min: 100 }} onChange={(v) => setD({ bandwidth: v })} />}
      </div>
      <div className="dr-checks">
        <label className="td-check" title="Use the driver curves (Bl, Kms, Le) and the duct exit losses">
          <input type="checkbox" checked={!!nl} onChange={(e) => (analysis === 'transient' ? setT : setD)({ nonlinear: e.target.checked })} />Nonlinear
        </label>
        {analysis === 'transient' && (
          <label className="td-check" title="Also run with the nonlinear parts off, and overlay it">
            <input type="checkbox" checked={!!t.compareLinear} onChange={(e) => setT({ compareLinear: e.target.checked })} />Also run linear
          </label>
        )}
      </div>
      <div className="td-note">
        {analysis === 'harmonics' && 'One steady tone: settles, then whole periods are analysed, so the harmonics are exact.'}
        {analysis === 'thd' && 'A steady tone at each frequency — about a second of computing each.'}
        {analysis === 'compression' && 'Each frequency at each level, against the linear model at the same level.'}
        {analysis === 'maxspl' && `Bursts raised until the harmonics pass the CEA-2010 limits (H2 ${CEA2010_LIMITS[2]} dB, H3 ${CEA2010_LIMITS[3]} dB…) or a cone passes its excursion limit.`}
      </div>
    </div>
  )
}

/**
 * Default values to vary a setting over, around its current value.
 *
 * @param {string} key - A vary key.
 * @param {number|null} value - Its current value.
 * @returns {number[]} The values.
 * @pure
 */
export function defaultValues(key, value) {
  if (key === 'level') return [0, 3, 6, 9]
  const v = Number(value)
  if (!Number.isFinite(v) || v === 0) return [1, 2, 3]
  return [0.8, 1, 1.25].map((m) => Number((v * m).toPrecision(3)))
}

/**
 * The drawer's Vary section: what a series varies, each a list of values.
 *
 * @param {object} props - Component props.
 * @param {Array<object>} props.choices - From `varyChoices`.
 * @param {Array<{key: string, values: number[]}>} props.vary - What varies.
 * @param {Function} props.setVary - Writes it.
 * @returns {React.ReactElement} The section.
 * @pure
 */
function VarySection({ choices, vary, setVary }) {
  return (
    <div className="dr-card">
      <div className="dr-card-head"><span>Vary <span className="lib-meta">— makes a series</span></span></div>
      {vary.map((v, i) => {
        const c = choices.find((x) => x.key === v.key)
        return (
          <div key={i} className="dr-vary">
            <select value={v.key} onChange={(e) => {
              const n = choices.find((x) => x.key === e.target.value)
              setVary(vary.map((x, j) => (j === i ? { key: n.key, values: defaultValues(n.key, n.value) } : x)))
            }}>
              {!c && <option value={v.key}>{v.key}</option>}
              {choices.map((x) => <option key={x.key} value={x.key}>{x.label}</option>)}
            </select>
            <ListInput value={v.values} onCommit={(l) => setVary(vary.map((x, j) => (j === i ? { ...x, values: l } : x)))} />
            <span className="dr-u">{c?.unit || ''}</span>
            <button className="icon-btn" title="Stop varying this" onClick={() => setVary(vary.filter((_, j) => j !== i))}>✕</button>
          </div>
        )
      })}
      {choices.length > 0 && (
        <button className="dr-add" onClick={() => {
          const n = choices.find((x) => !vary.some((v) => v.key === x.key)) || choices[0]
          setVary([...vary, { key: n.key, values: defaultValues(n.key, n.value) }])
        }}>{vary.length ? '+ Vary another — e.g. Port length × Level makes a grid' : '+ Vary a setting — level, frequency, a box volume, a driver\'s Bl…'}</button>
      )}
    </div>
  )
}

/**
 * Presets saved in this browser.
 *
 * @returns {Array<{name: string, analysis: string, settings: object, vary: Array}>} The presets.
 * @sideEffect Reads LocalStorage.
 */
function loadPresets() {
  try { const v = JSON.parse(localStorage.getItem(PRESETS_KEY)); return Array.isArray(v) ? v : [] } catch { return [] }
}

/**
 * The New run drawer: pick an analysis, set its signal and solver, vary
 * settings to make a series, and queue it.
 *
 * Runs queue behind any already waiting and keep running when the drawer
 * closes; each takes the project as it is when queued.
 *
 * @returns {React.ReactElement} The drawer.
 * @sideEffect Subscribes to the store; queues runs.
 */
export function NewRunDrawer() {
  const draft = useStore((s) => s.tdDraft)
  const setDraft = useStore((s) => s.setTdDraft)
  const extras = useStore((s) => s.projectExtras)
  const boards = useStore((s) => s.tdBoards)
  const queue = useStore((s) => s.tdQueue)
  const voltage = useStore((s) => s.settings.voltage)
  const hasNodes = useStore((s) => s.nodes.length > 0)
  const locked = useStore(isLocked)
  /**
   * Close the drawer; queued runs carry on.
   *
   * @returns {void}
   * @sideEffect Writes store state.
   */
  const close = () => useStore.getState().setTdDrawer(false)
  const runs = useRuns().filter((r) => r.open)
  const [presets, setPresets] = useState(loadPresets)
  const [busy, setBusy] = useState(false)
  const cfg = tdSettingsOf(extras)
  const analysis = draft.analysis
  const opts = optsOf(analysis, cfg)
  const project = useMemo(() => useStore.getState().serialize(), [extras]) // eslint-disable-line react-hooks/exhaustive-deps
  const choices = useMemo(() => varyChoices(project, analysis, opts), [project, analysis, JSON.stringify(opts)]) // eslint-disable-line react-hooks/exhaustive-deps
  const vary = (draft.vary || []).filter((v) => choices.some((c) => c.key === v.key))
  const count = vary.reduce((n, v) => n * Math.max(v.values.length, 1), 1)
  const title = vary.length
    ? `${runTitle(analysis, opts, vary.map((v) => v.key))} ${vary.map((v) => varLabel(v.key).label.toLowerCase()).join(' × ')} series`
    : runTitle(analysis, opts)
  const ahead = queue.filter((j) => j.status !== 'failed').length
  const levelVary = vary.find((v) => v.key === 'level')
  const preview = useMemo(() => {
    if (analysis !== 'transient') return null
    const ls = levelVary ? levelVary.values : [opts.levelDb || 0]
    const traces = ls.slice(0, 6).map((L, i) => ({ key: `p${i}`, L, ...drivePreview({ ...opts, levelDb: L }, voltage) }))
    return { rows: mergeTraces(traces.map((t) => ({ key: t.key, x: t.ms, y: t.v }))), lines: traces.map((t, i) => ({ key: t.key, name: dbText(t.L), color: SERIES[i % SERIES.length], width: i ? 1.4 : 2 })) }
  }, [analysis, JSON.stringify(opts), JSON.stringify(levelVary), voltage]) // eslint-disable-line react-hooks/exhaustive-deps
  /**
   * Save the drawer's settings as a preset in this browser.
   *
   * @returns {void}
   * @sideEffect Asks for a name; writes LocalStorage and component state.
   */
  const savePreset = () => {
    const name = prompt('Name the preset', title)
    if (!name) return
    const section = analysis === 'transient' ? cfg.transient : cfg.distortion
    const next = [...presets.filter((p) => p.name !== name), { name, analysis, settings: section, vary }]
    setPresets(next)
    try { localStorage.setItem(PRESETS_KEY, JSON.stringify(next)) } catch { /* not kept */ }
  }
  /**
   * Take the drawer's settings from a preset or a stored run.
   *
   * @param {string} value - `p:<index>` for a preset, `r:<id>` for a run.
   * @returns {void}
   * @sideEffect Writes the drawer and the project's time-domain settings.
   */
  const startFrom = (value) => {
    const st = useStore.getState()
    if (value.startsWith('p:')) {
      const p = presets[Number(value.slice(2))]
      if (!p) return
      st.setTdDraft({ analysis: p.analysis, vary: p.vary || [] })
      st.setTdSettings(p.analysis === 'transient' ? 'transient' : 'distortion', p.analysis === 'transient' ? p.settings : { ...p.settings, mode: p.analysis })
    } else if (value.startsWith('r:')) {
      const r = runs.find((x) => x.id === value.slice(2))
      if (r) st.startFromRun(r)
    }
  }
  /**
   * Queue the run or series.
   *
   * @returns {Promise<void>} Resolves once queued.
   * @sideEffect Queues runs; may add a board.
   */
  const run = async () => {
    setBusy(true)
    try { await useStore.getState().queueRuns() } finally { setBusy(false) }
  }
  return (
    <div className="drawer">
      <div className="drawer-head">
        <span className="drawer-title">New run</span>
        <span className="lib-meta">Start from</span>
        <select value="" onChange={(e) => { startFrom(e.target.value); e.target.value = '' }}>
          <option value="">Current settings</option>
          {presets.length > 0 && <optgroup label="Presets">{presets.map((p, i) => <option key={p.name} value={`p:${i}`}>{p.name}</option>)}</optgroup>}
          {runs.length > 0 && <optgroup label="Runs of this project">{runs.slice(0, 30).map((r) => <option key={r.id} value={`r:${r.id}`}>{r.title}</option>)}</optgroup>}
        </select>
        <span style={{ flex: 1 }} />
        <button className="icon-btn" onClick={close} title="Close — queued runs keep running">✕</button>
      </div>
      <div className="drawer-body">
        <div className="seg drawer-an">
          {ANALYSES.map(([id, label]) => <button key={id} className={analysis === id ? 'on' : ''} onClick={() => setDraft({ analysis: id })}>{label}</button>)}
        </div>
        {locked && <div className="td-hint">This record is read-only, so its settings cannot be changed here; runs use them as they are. Press Edit to change them.</div>}
        <fieldset className="rec-fieldset" disabled={locked}>
          <AnalysisFields analysis={analysis} cfg={cfg} varied={vary.map((v) => v.key)} />
        </fieldset>
        <VarySection choices={choices} vary={vary} setVary={(v) => setDraft({ vary: v })} />
        {preview && (
          <div className="dr-card">
            <TdChart title="Drive signal, channel 1" data={preview.rows} xKey="x" xLabel="ms" yLabel="V" lines={preview.lines} height={170} legend={preview.lines.length > 1} />
          </div>
        )}
        <div className="dr-card dr-save">
          <div className="dr-save-title">{title}</div>
          <input placeholder="Note — e.g. before flaring the port" value={draft.note} onChange={(e) => setDraft({ note: e.target.value })} />
          <label className="dr-addto">
            <span className="lib-meta">Add to</span>
            <select value={draft.addTo} onChange={(e) => setDraft({ addTo: e.target.value })}>
              <option value="new">New board</option>
              {boards.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              <option value="none">No board — library only</option>
            </select>
          </label>
        </div>
      </div>
      <div className="drawer-foot">
        <span className="lib-meta">
          {count} {count === 1 ? 'run' : 'runs'}{ahead ? ` · ${ahead} ahead in the queue` : ''} · keeps running if you close this
        </span>
        <span style={{ flex: 1 }} />
        <button onClick={savePreset}>Save preset</button>
        <button className="primary" disabled={!hasNodes || busy} onClick={run}>{count > 1 ? 'Run series' : ahead ? 'Queue run' : 'Run'}</button>
      </div>
    </div>
  )
}
