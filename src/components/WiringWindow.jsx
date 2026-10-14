import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useStore, isLocked } from '../store'
import { LockNote } from './Records'
import ExprInput from './ExprInput'
import { useParamValues } from '../useResolved'
import { valueOf } from '../schema/extras'
import { driverNominal, fmtOhms } from '../schema/nominal'
import { displayNames, channelNames, channelNumbers, CHANNEL_NAME } from '../nodeNames'
import { driverSummary } from './nodes'
import DriveFields from './DriveFields'
import { colorsOf, LOOSE } from '../channelColors'
import { useDrive } from '../useDrive'
import {
  elementsOf, allTerminals, liveWires, netsOf, driverStatus, nominalSolve, parseTerm,
  isCustom, unitsOf, chTerm, GROUND,
} from '../schema/wires'

/** How long a message stays across the top of the window, ms. */
const NOTE_MS = 5000

/**
 * Ohms written short.
 *
 * @param {number} z - Ohms.
 * @returns {string} e.g. `4 Ω`, `0.75 Ω`, or `open`.
 * @pure
 */
const ohms = (z) => (Number.isFinite(z) && z > 0 ? `${fmtOhms(z)} Ω` : 'open')

/**
 * A coil, drawn as a short spring between two leads.
 *
 * @param {object} props - Component props.
 * @param {number} [props.width=46] - Drawn width, px.
 * @param {boolean} [props.faint] - Draw it dashed and pale: a coil left unused.
 * @returns {React.ReactElement} The icon.
 * @pure
 */
function CoilIcon({ width = 46, faint = false }) {
  return (
    <svg className="wr-coil" width={width} height="16" viewBox={`0 0 ${width} 16`} aria-hidden="true">
      <path d={`M0 8h${(width - 30) / 2}c0-7 5-7 5 0s5 7 5 0 5-7 5 0 5 7 5 0 5-7 5 0 5 7 5 0h${(width - 30) / 2}`}
        fill="none" strokeWidth="1.6" stroke="currentColor" strokeDasharray={faint ? '3 3' : undefined} opacity={faint ? 0.45 : 1} />
    </svg>
  )
}

/**
 * The little circuit on an arrangement button.
 *
 * @param {object} props - Component props.
 * @param {'series'|'parallel'|'one'|'series-parallel'|'custom'} props.kind - The arrangement.
 * @returns {React.ReactElement} The diagram.
 * @pure
 */
function ArrangementIcon({ kind }) {
  /**
   * One coil of the diagram.
   *
   * @param {number} x - Left end.
   * @param {number} y - Height of its leads.
   * @param {boolean} [dim] - Draw it as unused.
   * @returns {React.ReactElement} The path.
   * @pure
   */
  const coil = (x, y, dim) => (
    <path d={`M${x} ${y}c0-6 4-6 4 0s4 6 4 0 4-6 4 0 4 6 4 0`} fill="none" stroke="currentColor" strokeWidth="1.6"
      strokeDasharray={dim ? '3 3' : undefined} opacity={dim ? 0.4 : 1} />
  )
  const ends = (
    <>
      <circle cx="6" cy="10" r="3.5" className="wr-dot-plus" />
      <circle cx="6" cy="38" r="3.5" className="wr-dot-minus" />
    </>
  )
  if (kind === 'custom') {
    return (
      <svg width="120" height="48" viewBox="0 0 120 48" aria-hidden="true">
        <circle cx="34" cy="14" r="3.5" className="wr-dot-plus" /><circle cx="52" cy="14" r="3.5" className="wr-dot-minus" />
        <circle cx="70" cy="34" r="3.5" className="wr-dot-plus" /><circle cx="88" cy="34" r="3.5" className="wr-dot-minus" />
      </svg>
    )
  }
  if (kind === 'series') {
    return (
      <svg width="120" height="48" viewBox="0 0 120 48" aria-hidden="true">
        {ends}
        <path d="M10 10h22M48 10h16M80 10h20v28H10" fill="none" stroke="currentColor" strokeWidth="1.6" />
        {coil(32, 10)}{coil(64, 10)}
      </svg>
    )
  }
  if (kind === 'parallel') {
    return (
      <svg width="120" height="48" viewBox="0 0 120 48" aria-hidden="true">
        {ends}
        <path d="M10 10h20M30 4v12M30 4h16M62 4h16M30 16h16M62 16h16M78 4v12M78 10h22v28H10" fill="none" stroke="currentColor" strokeWidth="1.6" />
        {coil(46, 4)}{coil(46, 16)}
      </svg>
    )
  }
  if (kind === 'one') {
    return (
      <svg width="120" height="48" viewBox="0 0 120 48" aria-hidden="true">
        {ends}
        <path d="M10 10h36M62 10h38v28H10" fill="none" stroke="currentColor" strokeWidth="1.6" />
        {coil(46, 10)}{coil(46, 24, true)}
      </svg>
    )
  }
  return (
    <svg width="120" height="48" viewBox="0 0 120 48" aria-hidden="true">
      {ends}
      <path d="M10 10h10M20 4v12M20 4h6M42 4h4M62 4h6M20 16h6M42 16h4M62 16h6M68 4v12M68 10h32v28H10" fill="none" stroke="currentColor" strokeWidth="1.6" />
      {coil(26, 4)}{coil(46, 4)}{coil(26, 16)}{coil(46, 16)}
    </svg>
  )
}

/**
 * The colour of each net, from the channel whose output reaches it.
 *
 * Nets are joined through the drivers between them; a group holding a
 * channel's output takes that channel's colour. The ground belongs to every
 * channel, so a cable on it takes the colour of whatever is at its other end.
 *
 * @param {object} wiring - The project's wiring.
 * @param {Array<object>} nodes - The project's nodes.
 * @returns {{nets: Map<string, string>, channelOf: Function}} Terminal → net, and net → the channel index that reaches it (−1 for none).
 * @pure
 */
function netColours(wiring, nodes) {
  const terms = allTerminals(wiring, nodes)
  const nets = netsOf(liveWires(wiring?.wires, terms), terms)
  const parent = new Map()
  /**
   * A net's group.
   *
   * @param {string} n - Net name.
   * @returns {string} Its root.
   * @mutates the enclosing parent map.
   */
  const find = (n) => {
    if (!parent.has(n)) parent.set(n, n)
    let r = n
    while (parent.get(r) !== r) r = parent.get(r)
    parent.set(n, r)
    return r
  }
  for (const n of nodes) {
    if (n.type !== 'driver') continue
    for (const e of elementsOf(n)) {
      const a = nets.get(e.plus); const b = nets.get(e.minus)
      if (a !== GROUND && b !== GROUND) parent.set(find(a), find(b))
    }
  }
  const owner = new Map()
  ;(wiring?.channels || []).forEach((c, i) => {
    const net = nets.get(chTerm(c.id, '+'))
    if (net !== GROUND && !owner.has(find(net))) owner.set(find(net), i)
  })
  /**
   * The channel that reaches a net.
   *
   * @param {string} net - Net name.
   * @returns {number} The channel's index, or −1.
   * @reads the enclosing groups.
   */
  const channelOf = (net) => (net === GROUND ? -1 : owner.get(find(net)) ?? -1)
  return { nets, channelOf }
}

/**
 * The opposite end of a driver element from a terminal.
 *
 * @param {Array<object>} nodes - The project's nodes.
 * @param {string} t - A driver terminal.
 * @returns {string|null} The element's other terminal; `null` for a channel terminal.
 * @pure
 */
function otherEnd(nodes, t) {
  const p = parseTerm(t)
  if (p?.kind !== 'node') return null
  const node = nodes.find((n) => n.id === p.node)
  const e = node && elementsOf(node).find((x) => x.plus === t || x.minus === t)
  return e ? (e.plus === t ? e.minus : e.plus) : null
}

/**
 * How far a cable between two points hangs below the line joining them.
 *
 * @param {{x: number, y: number}} p - One end.
 * @param {{x: number, y: number}} q - The other.
 * @returns {number} The sag of its control points, px.
 * @pure
 */
const sagOf = (p, q) => 24 + Math.abs(q.x - p.x) * 0.08 + Math.abs(q.y - p.y) * 0.05

/**
 * The middle of a cable, where its current and its remove button sit.
 *
 * @param {{x: number, y: number}} p - One end.
 * @param {{x: number, y: number}} q - The other.
 * @returns {{left: number, top: number}} The point, px.
 * @pure
 */
const midOf = (p, q) => ({ left: (p.x + q.x) / 2, top: (p.y + q.y) / 2 + 0.75 * sagOf(p, q) })

/**
 * Where each driver sits on the bench when it has not been placed.
 *
 * @param {number} i - The driver's place among the drivers.
 * @returns {{x: number, y: number}} Its top-left corner, px.
 * @pure
 */
const defaultSpot = (i) => ({ x: 40 + (i % 2) * 300, y: 30 + Math.floor(i / 2) * 200 })

/**
 * The Wiring window: channels on the right, the driver nodes on a bench in
 * the middle, cables between their terminals, and the selected driver's
 * arrangement below.
 *
 * Replaces the dock while it is open, as the time-domain workspace does.
 *
 * @returns {React.ReactElement} The window.
 * @sideEffect Subscribes to the store, measures its own layout, and listens to the pointer while a cable or driver is dragged.
 */
export default function WiringWindow() {
  const nodes = useStore((s) => s.nodes)
  const wiring = useStore((s) => s.projectExtras.wiring)
  const params = useStore((s) => s.projectExtras.params)
  const projectName = useStore((s) => s.projectName)
  const sel = useStore((s) => s.wiringSel)
  const locked = useStore(isLocked)
  const { values } = useParamValues()
  const drivers = useMemo(() => nodes.filter((n) => n.type === 'driver'), [nodes])
  const names = useMemo(() => displayNames(nodes), [nodes])
  const body = useRef(null)
  const bench = useRef(null)
  const [spots, setSpots] = useState({})
  const [drag, setDrag] = useState(null)
  const [picked, setPicked] = useState(null)
  const [note, setNote] = useState(null)
  const selected = drivers.find((n) => n.id === sel) || drivers[0] || null

  const master = Math.pow(10, (valueOf(wiring?.masterDb ?? 0, values) || 0) / 20)
  const volts = useMemo(() => Object.fromEntries((wiring?.channels || []).map((c) => [c.id, valueOf(c.volts, values) * master])), [wiring, values, master])
  const solved = useMemo(() => nominalSolve(wiring, nodes, volts), [wiring, nodes, volts])
  const status = useMemo(() => driverStatus(wiring, nodes), [wiring, nodes])
  const colours = useMemo(() => netColours(wiring, nodes), [wiring, nodes])
  const terms = useMemo(() => allTerminals(wiring, nodes), [wiring, nodes])
  const wires = useMemo(() => (wiring?.wires || []).map((w, i) => ({ ...w, i })).filter((w) => terms.has(w.a) && terms.has(w.b)), [wiring, terms])
  const chIndex = useMemo(() => new Map((wiring?.channels || []).map((c, i) => [c.id, i])), [wiring])

  /**
   * Say something across the top of the window for a few seconds.
   *
   * @param {string|null} text - The message.
   * @param {'error'|'info'} [kind='error'] - A refusal, or just news.
   * @returns {void}
   * @sideEffect Sets component state.
   */
  const say = useCallback((text, kind = 'error') => setNote(text ? { text, kind, at: Date.now() } : null), [])
  useEffect(() => {
    if (!note) return undefined
    const t = setTimeout(() => setNote(null), NOTE_MS)
    return () => clearTimeout(t)
  }, [note])

  // Where every terminal is on screen, relative to the window body, for the cables.
  useLayoutEffect(() => {
    /**
     * Measure every terminal.
     *
     * @returns {void}
     * @sideEffect Reads element geometry and sets component state when anything moved.
     */
    const measure = () => {
      const root = body.current
      if (!root) return
      const r = root.getBoundingClientRect()
      const next = {}
      for (const el of root.querySelectorAll('[data-term]')) {
        const b = el.getBoundingClientRect()
        next[el.dataset.term] = { x: b.left + b.width / 2 - r.left, y: b.top + b.height / 2 - r.top }
      }
      setSpots((prev) => (JSON.stringify(prev) === JSON.stringify(next) ? prev : next))
    }
    measure()
    const ro = new ResizeObserver(measure)
    if (body.current) ro.observe(body.current)
    return () => ro.disconnect()
  })

  // Delete removes the picked cable.
  useEffect(() => {
    /**
     * Remove the picked cable on Delete or Backspace.
     *
     * @param {KeyboardEvent} e - The key event.
     * @returns {void}
     * @sideEffect May remove a cable.
     */
    const onKey = (e) => {
      if (picked == null || (e.key !== 'Delete' && e.key !== 'Backspace')) return
      if (e.target?.closest?.('input, select, textarea')) return
      e.preventDefault()
      useStore.getState().removeWire(picked)
      setPicked(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [picked])

  /**
   * Start dragging from a terminal: a new cable, or the end of one already there.
   *
   * With Shift held, or nothing plugged in, it is a new cable. Otherwise the
   * last cable plugged in here is picked up by this end, to be plugged in
   * elsewhere or dropped to unplug it.
   *
   * @param {React.PointerEvent} e - The pointer event.
   * @param {string} t - The terminal.
   * @returns {void}
   * @sideEffect Starts a drag, listening to the window until the pointer comes up.
   */
  const startCable = (e, t) => {
    if (locked || e.button !== 0) return
    e.preventDefault()
    e.stopPropagation()
    const here = [...wires].reverse().find((w) => w.a === t || w.b === t)
    const d = !e.shiftKey && here
      ? { kind: 'move', index: here.i, end: here.a === t ? 'a' : 'b', from: here.a === t ? here.b : here.a, at: t }
      : { kind: 'new', from: t, at: t }
    const r = body.current.getBoundingClientRect()
    setDrag({ ...d, x: e.clientX - r.left, y: e.clientY - r.top })
    setPicked(null)
    /**
     * Follow the pointer.
     *
     * @param {PointerEvent} ev - The move.
     * @returns {void}
     * @sideEffect Sets component state.
     */
    const onMove = (ev) => setDrag((g) => g && { ...g, x: ev.clientX - r.left, y: ev.clientY - r.top })
    /**
     * Plug the cable in where the pointer came up, or unplug it.
     *
     * @param {PointerEvent} ev - The release.
     * @returns {void}
     * @sideEffect Removes the listeners; adds, moves or removes a cable, or says why not.
     */
    const onUp = (ev) => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      setDrag(null)
      const target = document.elementFromPoint(ev.clientX, ev.clientY)?.closest?.('[data-term]')?.dataset.term
      const st = useStore.getState()
      if (d.kind === 'new') {
        if (!target || target === d.from) return
        const why = st.addWire(d.from, target)
        if (why) say(why)
      } else if (!target) {
        st.removeWire(d.index)
      } else if (target !== d.at) {
        const why = st.moveWireEnd(d.index, d.end, target)
        if (why) say(why)
      }
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  /**
   * Drag a driver around the bench by its head.
   *
   * @param {React.PointerEvent} e - The pointer event.
   * @param {string} id - Driver node id.
   * @param {{x: number, y: number}} at - Where it is now.
   * @returns {void}
   * @sideEffect Selects the driver and moves it with the pointer, recording one undo step.
   */
  const startMove = (e, id, at) => {
    if (e.button !== 0 || e.target.closest('button, input, [data-term]')) return
    const st = useStore.getState()
    st.setWiringSel(id)
    if (locked) return
    e.preventDefault()
    const box = bench.current.getBoundingClientRect()
    const x0 = e.clientX; const y0 = e.clientY
    let first = true
    /**
     * Follow the pointer, keeping the driver on the bench.
     *
     * @param {PointerEvent} ev - The move.
     * @returns {void}
     * @sideEffect Moves the driver.
     */
    const onMove = (ev) => {
      const x = Math.max(0, Math.min(box.width - 120, at.x + ev.clientX - x0))
      const y = Math.max(0, Math.min(box.height - 60, at.y + ev.clientY - y0))
      st.placeWiringNode(id, { x: Math.round(x), y: Math.round(y) }, first)
      first = false
    }
    /**
     * Stop following.
     *
     * @returns {void}
     * @sideEffect Removes the listeners.
     */
    const onUp = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  /**
   * A cable's path between two points, sagging like real wire.
   *
   * @param {{x: number, y: number}} p - One end.
   * @param {{x: number, y: number}} q - The other.
   * @returns {string} SVG path data.
   * @pure
   */
  const cablePath = (p, q) => {
    const dx = Math.max(30, Math.abs(q.x - p.x) * 0.35)
    const dir = q.x >= p.x ? 1 : -1
    const g = sagOf(p, q)
    return `M${p.x} ${p.y} C ${p.x + dx * dir} ${p.y + g}, ${q.x - dx * dir} ${q.y + g}, ${q.x} ${q.y}`
  }

  /**
   * The colour of a cable: its channel's, light on the output side and dark on the return.
   *
   * @param {{a: string, b: string}} w - The cable.
   * @returns {string} A CSS colour.
   * @reads the enclosing net colours and drivers.
   */
  const cableColour = (w) => {
    const { nets, channelOf } = colours
    const net = nets.get(w.a)
    if (net !== GROUND) {
      const i = channelOf(net)
      const out = (wiring.channels || []).some((c) => nets.get(chTerm(c.id, '+')) === net)
      return colorsOf(i)[out ? 0 : 1]
    }
    for (const t of [w.a, w.b]) {
      const o = otherEnd(nodes, t)
      if (o && nets.get(o) !== GROUND) return colorsOf(channelOf(nets.get(o)))[1]
    }
    return LOOSE[1]
  }

  /**
   * Where a driver sits on the bench.
   *
   * @param {object} n - The driver node.
   * @param {number} i - Its place among the drivers.
   * @returns {{x: number, y: number}} Its top-left corner, px.
   * @reads the enclosing wiring layout.
   */
  const place = (n, i) => wiring?.layout?.[n.id] || defaultSpot(i)
  // One current label per driver element, on the first cable at its + side.
  const pills = []
  const labelled = new Set()
  for (const n of drivers) {
    for (const e of elementsOf(n)) {
      const amps = Math.abs(solved.elements[e.plus] || 0)
      const w = wires.find((c) => c.a === e.plus || c.b === e.plus)
      if (!w || amps < 1e-3 || labelled.has(w.i)) continue
      labelled.add(w.i)
      pills.push({ w, amps })
    }
  }

  return (
    <div className="td-window wr-window">
      <div className="td-head">
        <span className="td-title">Wiring</span>
        <span className="wr-project">{projectName}</span>
        <span style={{ flex: 1 }} />
        <span className="wr-help">Drag between terminals to wire · Shift-drag for a second cable · drag a cable's end away to unplug it</span>
        <button className="icon-btn wr-close" aria-label="Back to the editor" title="Back to the editor (Alt+W)" onClick={() => useStore.getState().closeWiring()}>✕</button>
      </div>
      <LockNote />
      {note && <div className={`wr-note ${note.kind}`} role="alert" onClick={() => setNote(null)}>{note.text}</div>}
      <div className="wr-body" ref={body}>
        <aside className="wr-list">
          <div className="wr-list-head"><b>Driver nodes</b><span>{drivers.length}</span></div>
          {drivers.map((n) => {
            const st = status.get(n.id)
            const issue = st?.dangling ? 'a coil is half-connected' : st?.shorted ? 'a coil is shorted' : !st?.channels.length ? 'not wired' : null
            return (
              <button key={n.id} className={`wr-item${selected?.id === n.id ? ' on' : ''}`} onClick={() => useStore.getState().setWiringSel(n.id)}>
                <span className="wr-item-top">
                  <span className="wr-swatch drv" />
                  <b>{names[n.id]}</b>
                  <span style={{ flex: 1 }} />
                  {(st?.channels || []).map((c) => (
                    <span key={c} className="wr-tag" style={{ background: colorsOf(chIndex.get(c))[1] }}>Ch {chIndex.get(c) + 1}</span>
                  ))}
                </span>
                <span className="wr-item-sub">{driverSummary(n.data.params, '').replace(/ · not wired$/, '')}</span>
                {issue && <span className="wr-item-issue">{issue}</span>}
              </button>
            )
          })}
          {!drivers.length && <div className="ph-empty">Add a Driver node in the Node Editor to wire it here.</div>}
          <span style={{ flex: 1 }} />
          <button className="wr-reset" disabled={locked || !drivers.length} onClick={() => {
            if (confirm('Remove every cable and put each driver node on Channel 1, in parallel?')) useStore.getState().resetWiring()
          }}>Reset: all on Channel 1, in parallel</button>
        </aside>

        <section className="wr-center">
          <div className="wr-bench" ref={bench}>
            {drivers.map((n, i) => {
              const at = place(n, i)
              const p = n.data.params
              const els = elementsOf(n)
              return (
                <div key={n.id} className={`wr-block${selected?.id === n.id ? ' on' : ''}`} style={{ left: at.x, top: at.y }}
                  onPointerDown={(e) => startMove(e, n.id, at)}>
                  <div className="wr-block-head">
                    <span className="wr-swatch drv" />
                    <b>{names[n.id]}</b>
                    <span className="wr-chip">{isCustom(p) ? `${unitsOf(p)}× · by hand` : ohms(driverNominal(p))}</span>
                  </div>
                  {els.map((e) => (
                    <div key={e.key} className="wr-el">
                      <CoilIcon />
                      <span className="wr-el-label">{e.label || driverSummary(p, '').replace(/ · not wired$/, '')}</span>
                      <span className="wr-el-ohms">{isCustom(p) ? ohms(e.nominal) : ''}</span>
                      <span className="wr-terms">
                        <span className="wr-term-label plus">+</span>
                        <button className="wr-term plus" data-term={e.plus} aria-label={`${names[n.id]} ${e.label} +`} onPointerDown={(ev) => startCable(ev, e.plus)} />
                        <span className="wr-term-label minus">−</span>
                        <button className="wr-term minus" data-term={e.minus} aria-label={`${names[n.id]} ${e.label} −`} onPointerDown={(ev) => startCable(ev, e.minus)} />
                      </span>
                    </div>
                  ))}
                </div>
              )
            })}
          </div>
          <Inspector node={selected} say={say} locked={locked} />
        </section>

        <aside className="wr-channels">
          <div className="wr-list-head">
            <b>Channels</b>
            <span style={{ flex: 1 }} />
            <label className="wr-master">Master
              <ExprInput value={wiring?.masterDb ?? 0} step={0.5}
                onCommit={(v) => useStore.getState().setWiring({ ...wiring, masterDb: v })} />
              dB
            </label>
          </div>
          {(wiring?.channels || []).map((c, i) => (
            <ChannelCard key={c.id} ch={c} index={i} solved={solved.channels[c.id]}
              toolbar={(wiring.toolbar || wiring.channels[0].id) === c.id} removable={wiring.channels.length > 1}
              onTerm={startCable} />
          ))}
          <button className="wr-add" disabled={locked} onClick={() => useStore.getState().addChannel()}>+ Add channel</button>
          <div className="wr-hint">
            Each channel plays at the voltage it shows; the master moves them all
            together and stays at 0 dB unless you change it. The toolbar's drive level
            shows the channel marked Toolbar level, and changing it there scales every
            channel together. A new channel starts at 2.83 V into 8 Ω.
            Rg is the amplifier's output resistance plus the cable. A driver node added
            to the project goes on Channel 1, in parallel.
          </div>
        </aside>

        <svg className="wr-cables" aria-hidden="true">
          {wires.map((w) => {
            const p = spots[w.a]; const q = spots[w.b]
            if (!p || !q || (drag?.kind === 'move' && drag.index === w.i)) return null
            const d = cablePath(p, q)
            return (
              <g key={w.i} className={`wr-cable${picked === w.i ? ' picked' : ''}`} onClick={() => setPicked(picked === w.i ? null : w.i)}>
                <path d={d} className="wr-cable-halo" />
                <path d={d} className="wr-cable-core" style={{ stroke: cableColour(w) }} />
                <path d={d} className="wr-cable-hit" />
              </g>
            )
          })}
          {drag && spots[drag.from] && (
            <path d={cablePath(spots[drag.from], drag)} className="wr-cable-core dragging" />
          )}
        </svg>
        {pills.map(({ w, amps }) => {
          const p = spots[w.a]; const q = spots[w.b]
          if (!p || !q) return null
          return (
            <span key={`a${w.i}`} className="wr-amps" style={{ ...midOf(p, q), color: cableColour(w) }}>
              {amps >= 1 ? amps.toFixed(1) : amps.toFixed(2)} A
            </span>
          )
        })}
        {picked != null && wires.find((w) => w.i === picked) && (() => {
          const w = wires.find((x) => x.i === picked)
          const p = spots[w.a]; const q = spots[w.b]
          if (!p || !q) return null
          return (
            <button className="wr-unplug" style={midOf(p, q)}
              title="Remove this cable (Delete)" aria-label="Remove this cable"
              onClick={() => { useStore.getState().removeWire(picked); setPicked(null) }}>✕</button>
          )
        })()}
      </div>
    </div>
  )
}

/**
 * One channel: its terminals, level, Rg, the toolbar choice and what it drives.
 *
 * @param {object} props - Component props.
 * @param {object} props.ch - The channel.
 * @param {number} props.index - Its place in the list.
 * @param {{ohms: number, watts: number}} props.solved - Its nominal load and power.
 * @param {boolean} props.toolbar - Whether the toolbar's drive level sets it.
 * @param {boolean} props.removable - Whether it may be removed: never the last.
 * @param {Function} props.onTerm - Starts a cable from one of its terminals.
 * @returns {React.ReactElement} The card.
 * @sideEffect Subscribes to the store.
 */
function ChannelCard({ ch, index, solved, toolbar, removable, onTerm }) {
  const drive = useDrive(ch.id)
  const zmin = useStore((s) => {
    const z = s.results?.zinByChannel?.[ch.id]?.mag
    return z?.length ? Math.min(...z) : null
  })
  const st = useStore.getState
  const minus = colorsOf(index)[1]
  const num = useStore((s) => channelNumbers(s.projectExtras.wiring.channels)[ch.id])
  const shown = useStore((s) => channelNames(s.projectExtras.wiring.channels)[ch.id])
  return (
    <div className="wr-channel">
      <div className="wr-channel-head">
        <span className="wr-swatch" style={{ background: minus }} />
        <input className="wr-channel-name" aria-label="Channel name" value={ch.label || ''} placeholder={CHANNEL_NAME}
          style={{ width: `calc(${Math.max(3, (ch.label || CHANNEL_NAME).length)} * 0.62em + 6px)` }}
          onChange={(e) => st().updateChannel(ch.id, { label: e.target.value }, false)} />
        {num > 0 && <span className="name-num" title="Shown after the name while another channel shares it">#{num}</span>}
        {toolbar
          ? <span className="wr-toolbar on" title="The toolbar's drive level sets this channel's volts">Toolbar level</span>
          : <button className="wr-toolbar" title="Make the toolbar's drive level set this channel's volts" onClick={() => st().setToolbarChannel(ch.id)}>Use for toolbar</button>}
        <button className="wr-dsp" title="Gain, delay, polarity, crossovers and EQ for this channel" onClick={() => st().openDsp(ch.id)}>DSP</button>
        {removable && <button className="icon-btn" aria-label={`Remove ${shown}`} title="Remove this channel and its cables" onClick={() => st().removeChannel(ch.id)}>✕</button>}
      </div>
      <DriveFields drive={drive} onSet={(field, v) => st().setChannelDrive(ch.id, field, v)}
        rg={ch.outputOhms} onRg={(v) => st().updateChannel(ch.id, { outputOhms: v })} />
      <div className="wr-channel-read">
        {Number.isFinite(solved?.ohms) ? <span>wiring <b>{ohms(solved.ohms)}</b> nominal</span> : <span>nothing wired</span>}
        {zmin != null && Number.isFinite(solved?.ohms) && <span>min |Z| <b>{fmtOhms(zmin)} Ω</b></span>}
      </div>
      <span className="wr-chterm">
        <button className="wr-term plus" data-term={chTerm(ch.id, '+')} aria-label={`${shown} +`} onPointerDown={(e) => onTerm(e, chTerm(ch.id, '+'))} />
        <span className="wr-term-label plus">+</span>
        <button className="wr-term minus" data-term={chTerm(ch.id, '-')} aria-label={`${shown} −`} onPointerDown={(e) => onTerm(e, chTerm(ch.id, '-'))} />
        <span className="wr-term-label minus">−</span>
      </span>
    </div>
  )
}

/**
 * The selected driver node's arrangement: how many drivers, how many coils,
 * and how they are joined — or each coil left to be wired by hand.
 *
 * Every choice is the node's own, so it shows in the Node Editor too.
 *
 * @param {object} props - Component props.
 * @param {object|null} props.node - The driver node.
 * @param {Function} props.say - Puts a message across the window.
 * @param {boolean} props.locked - Whether the project is read-only.
 * @returns {React.ReactElement} The inspector.
 * @sideEffect Subscribes to the store.
 */
function Inspector({ node, say, locked }) {
  const names = useStore((s) => displayNames(s.nodes))
  if (!node) return <div className="wr-inspector"><div className="ph-empty">Select a driver node to set how its drivers and coils are joined.</div></div>
  const p = node.data.params
  const n = unitsOf(p)
  const custom = isCustom(p)
  const preset = custom ? 'parallel' : p.wiring
  /**
   * Change the arrangement, saying what happened to any cables.
   *
   * @param {object} patch - Any of `count`, `wiring`, `dvc`.
   * @returns {void}
   * @sideEffect Changes the node and its cables.
   */
  const set = (patch) => {
    const msg = useStore.getState().setDriverArrangement(node.id, patch)
    if (msg) say(`${names[node.id]}: ${msg}`, 'info')
  }
  /**
   * One arrangement button.
   *
   * @param {string} kind - The arrangement it shows.
   * @param {string} label - Its name.
   * @param {object} patch - What choosing it sets.
   * @param {boolean} on - Whether it is the current one.
   * @param {object} [opts] - `disabled`, and `z` to show: the node's nominal ohms with this choice.
   * @returns {React.ReactElement} The button.
   * @reads the enclosing node.
   */
  const card = (kind, label, patch, on, opts = {}) => (
    <button key={kind + label} className={`wr-arr${on ? ' on' : ''}`} disabled={opts.disabled || locked} aria-pressed={on} onClick={() => !on && set(patch)}>
      <ArrangementIcon kind={kind} />
      <b>{opts.z != null ? ohms(opts.z) : '—'}</b>
      <span>{label}</span>
      {opts.disabled && opts.why && <small>{opts.why}</small>}
    </button>
  )
  const square = n > 1 && Math.round(Math.sqrt(n)) ** 2 === n
  return (
    <div className="wr-inspector">
      <div className="wr-insp-head">
        <span className="wr-swatch drv" /><b>{names[node.id]}</b>
        <label className="wr-count">Drivers
          <button className="icon-btn" aria-label="One fewer" disabled={locked || n < 2} onClick={() => set({ count: n - 1 })}>−</button>
          <span className="wr-count-n">{n}</span>
          <button className="icon-btn" aria-label="One more" disabled={locked} onClick={() => set({ count: n + 1 })}>+</button>
        </label>
        <span className="wr-coils">Voice coils
          <span className="seg">
            <button className={!p.dvc ? 'on' : ''} disabled={locked} onClick={() => p.dvc && set({ dvc: null })}>Single</button>
            <button className={p.dvc ? 'on' : ''} disabled={locked} onClick={() => !p.dvc && set({ dvc: { coils: 'series' } })}>Dual</button>
          </span>
        </span>
        <span style={{ flex: 1 }} />
        <span className="wr-insp-note">Changes here change {names[node.id]} in the Node Editor too.</span>
      </div>
      {p.dvc && <div className="wr-insp-hint">A driver's figures are always one coil's. Dual splits that coil into two equal halves, each with half its Re and Bl.</div>}
      <div className="wr-arrs">
        {p.dvc && <>
          {card('series', 'Coils in series', { wiring: preset, dvc: { coils: 'series' } }, !custom && p.dvc.coils === 'series', { z: driverNominal({ ...p, wiring: preset, dvc: { coils: 'series' } }) })}
          {card('parallel', 'Coils in parallel', { wiring: preset, dvc: { coils: 'parallel' } }, !custom && p.dvc.coils === 'parallel', { z: driverNominal({ ...p, wiring: preset, dvc: { coils: 'parallel' } }) })}
          {card('one', 'One coil only', { wiring: preset, dvc: { coils: 'one' } }, !custom && p.dvc.coils === 'one', { z: driverNominal({ ...p, wiring: preset, dvc: { coils: 'one' } }) })}
        </>}
        {n > 1 && <>
          {card('series', `${n} drivers in series`, { wiring: 'series' }, !custom && p.wiring === 'series', { z: driverNominal({ ...p, wiring: 'series' }) })}
          {card('parallel', `${n} drivers in parallel`, { wiring: 'parallel' }, !custom && p.wiring === 'parallel', { z: driverNominal({ ...p, wiring: 'parallel' }) })}
          {card('series-parallel', 'Series-parallel', { wiring: 'series-parallel' }, !custom && p.wiring === 'series-parallel', {
            z: square ? driverNominal({ ...p, wiring: 'series-parallel' }) : null, disabled: !square, why: 'needs 4, 9, 16…',
          })}
        </>}
        {(p.dvc || n > 1) && card('custom', p.dvc ? 'Wire every coil myself' : 'Wire every driver myself', { wiring: 'custom' }, custom)}
        {!p.dvc && n < 2 && <div className="wr-insp-hint">One single-coil driver: its two terminals are all there is to wire. Add drivers or choose dual voice coils for more ways to join them.</div>}
      </div>
    </div>
  )
}
