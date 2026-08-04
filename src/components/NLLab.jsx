import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useStore } from '../store'
import { NL_PARAMS, defaultNL, evalCurve, derivedRatios, parseCurveCSV, normalizeTable, curveHasContent } from '../engine/nonlinear'

// EXPERIMENTAL — large-signal T/S curve lab.
// Parametric-EQ style editor: click the curve to add a control point, drag it
// (gain/position), tune width with the slider. Wheel zooms about the cursor,
// shift-drag (or middle-drag) pans, Delete removes the selected point, and a
// crosshair guide tracks the cursor along the curve.

/**
 * Per-parameter explanation shown beside its curve editor.
 */
const PARAM_INFO = {
  Bl: { hint: 'Motor force factor vs excursion. Typically droops toward ±Xmax; Xmax by the Klippel criterion is where Bl falls to 0.70.' },
  Cms: { hint: 'Suspension compliance vs excursion. Progressive suspensions get LESS compliant (curve drops) at high excursion, raising Fs and reducing output.' },
  Kms: { hint: 'Suspension stiffness vs excursion — the reciprocal view of Cms, as published in Klippel reports. Stiffness RISES at high excursion. If this curve has any content it takes precedence over Cms(x).' },
  Le: { hint: 'Voice-coil inductance vs excursion. Typically rises as the coil moves inward over the pole, falls moving outward (asymmetric — turn Symmetric off).' },
}

/**
 * The small-signal reference value for a parameter, for the absolute-value axis.
 *
 * The editor works in ratios, but a ratio is hard to judge without knowing
 * what it is a ratio *of* — this supplies the driver's own value so the
 * second axis can show real units.
 *
 * Kms is derived as 1/Cms, since a driver stores compliance rather than
 * stiffness.
 *
 * @param {'Bl'|'Cms'|'Kms'|'Le'} param - The parameter.
 * @param {object} p - The driver node's params.
 * @returns {{v: number, unit: string}} The reference value and its unit, defaulting to 1 when the driver does not specify it.
 * @pure
 */
function refValue(param, p) {
  switch (param) {
    case 'Bl': return { v: p.Bl || 1, unit: 'T·m' }
    case 'Cms': return { v: p.Cms || 1, unit: 'mm/N' }
    case 'Kms': return { v: p.Cms ? 1 / p.Cms : 1, unit: 'N/mm' }
    case 'Le': return { v: p.Le || 1, unit: 'mH' }
    default: return { v: 1, unit: '' }
  }
}
/**
 * Format an axis value at a readable precision for its magnitude.
 *
 * @param {number} v - The value.
 * @returns {string} The formatted value.
 * @pure
 */
const fmtVal = (v) => (Math.abs(v) >= 100 ? v.toFixed(0) : Math.abs(v) >= 10 ? v.toFixed(1) : v.toPrecision(3))
/**
 * Plot padding in pixels, leaving room for both axes.
 */
const PAD = 46

/**
 * Axis tick positions at round intervals.
 *
 * Picks a 1, 2 or 5 times a power of ten step — the intervals people read
 * without effort — landing near the requested tick count rather than
 * exactly on it.
 *
 * @param {number} lo - Axis minimum.
 * @param {number} hi - Axis maximum.
 * @param {number} [target=8] - Desired tick count.
 * @returns {number[]} Tick values, empty when the span is not positive.
 * @pure
 */
function niceTicks(lo, hi, target = 8) {
  const span = hi - lo
  if (span <= 0) return []
  const raw = span / target
  const mag = Math.pow(10, Math.floor(Math.log10(raw)))
  const step = [1, 2, 5, 10].map((m) => m * mag).find((s) => span / s <= target) || 10 * mag
  // Round to the step's own precision, not a fixed three decimals: a step of
  // 0.0005 rounded to 3 dp collapses every adjacent pair into the same value,
  // so a narrow axis came out with every tick duplicated.
  const dp = Math.max(0, Math.min(15, -Math.floor(Math.log10(step)) + 1))
  const ticks = []
  for (let v = Math.ceil(lo / step) * step; v <= hi + step * 1e-9; v += step) ticks.push(Number(v.toFixed(dp)))
  return ticks
}

/**
 * Interactive editor for one nonlinear parameter curve.
 *
 * Parametric-EQ style: click the curve to add a control point, drag it to
 * move and reshape it, tune width with the slider. Wheel zooms about the
 * cursor, shift or middle drag pans, Delete removes the selected point.
 *
 * Dragging a point sets its gain relative to the curve *without* that point,
 * so grabbing a point and moving it puts the curve where the cursor is
 * rather than adding to what is already there.
 *
 * @param {object} props - Component props.
 * @param {string} props.driverId - Driver node being edited.
 * @param {'Bl'|'Cms'|'Kms'|'Le'} props.param - Which curve.
 * @param {object} props.nl - The driver's full nonlinear parameter set.
 * @param {number} props.xmax - The driver's Xmax, mm, which sets the default span.
 * @param {number} props.width - Available width, px.
 * @param {number} props.height - Available height, px.
 * @param {{v: number, unit: string}} props.refv - Small-signal reference for the absolute-value axis.
 * @returns {React.ReactElement} The editor.
 * @sideEffect Subscribes to the store; edits update the driver's params, which triggers a resimulation. Registers a non-passive wheel listener and a window keydown listener.
 */
function CurveEditor({ driverId, param, nl, xmax, width, height, refv }) {
  const updateParams = useStore((s) => s.updateParams)
  const [selected, setSelected] = useState(-1)
  const [hover, setHover] = useState(null) // data-space x under cursor
  const svgRef = useRef(null)
  const curve = nl[param]
  const defSpan = Math.max(xmax * (curve.extrap ? 1.8 : 1.3), 5)
  const [view, setView] = useState(null) // {x0,x1,y0,y1} data coords
  const v = view || { x0: -defSpan, x1: defSpan, y0: 0, y1: 1.6 }
  const W = Math.max(width, 400)
  const H = Math.max(height, 260)

  /**
   * Convert data coordinates to pixels.
   *
   * @param {number} x - Excursion, mm.
   * @param {number} r - Ratio value.
   * @returns {[number, number]} Pixel coordinates within the SVG.
   * @reads the current view window.
   */
  const toPx = (x, r) => [
    PAD + ((x - v.x0) / (v.x1 - v.x0)) * (W - 2 * PAD),
    H - PAD - ((r - v.y0) / (v.y1 - v.y0)) * (H - 2 * PAD),
  ]
  /**
   * Convert pixel coordinates back to data coordinates.
   *
   * @param {number} px - X in SVG pixels.
   * @param {number} py - Y in SVG pixels.
   * @returns {[number, number]} Excursion in mm and the ratio value.
   * @reads the current view window.
   */
  const fromPx = (px, py) => [
    v.x0 + ((px - PAD) / (W - 2 * PAD)) * (v.x1 - v.x0),
    v.y0 + ((H - PAD - py) / (H - 2 * PAD)) * (v.y1 - v.y0),
  ]

  const path = useMemo(() => {
    const pts = []
    for (let k = 0; k <= 240; k++) {
      const x = v.x0 + ((v.x1 - v.x0) * k) / 240
      const [px, py] = toPx(x, evalCurve(curve, x, xmax))
      pts.push(`${k === 0 ? 'M' : 'L'}${px.toFixed(1)},${Math.max(Math.min(py, H + 40), -40).toFixed(1)}`)
    }
    return pts.join(' ')
  }, [curve, v.x0, v.x1, v.y0, v.y1, xmax, W, H])

  /**
   * Write a change to this curve back to the driver node.
   *
   * @param {object} patch - Fields to change on the curve.
   * @returns {*} Whatever the store action returns; callers ignore it.
   * @sideEffect Updates the driver's params, which triggers a resimulation.
   */
  const commit = (patch) => updateParams(driverId, { nl: { ...nl, [param]: { ...curve, ...patch } } })
  const curveRef = useRef(curve)
  curveRef.current = curve
  const viewRef = useRef(v)
  viewRef.current = v

  /**
   * Zoom the view about a pixel position.
   *
   * Refuses zoom levels outside a sane span in either axis, so the view
   * cannot be lost by over-scrolling.
   *
   * @param {number} px - X in SVG pixels.
   * @param {number} py - Y in SVG pixels.
   * @param {number} factor - Scale factor; above 1 zooms out.
   * @returns {void}
   * @sideEffect Updates the view window.
   */
  const zoomAt = (px, py, factor) => {
    const [cx, cy] = fromPx(px, py)
    const nv = {
      x0: cx - (cx - v.x0) * factor,
      x1: cx + (v.x1 - cx) * factor,
      y0: cy - (cy - v.y0) * factor,
      y1: cy + (v.y1 - cy) * factor,
    }
    if (nv.x1 - nv.x0 < 2 || nv.x1 - nv.x0 > 500) return
    if (nv.y1 - nv.y0 < 0.1 || nv.y1 - nv.y0 > 1000) return
    setView(nv)
  }
  useEffect(() => {
    const el = svgRef.current
    if (!el) return
    /**
     * Zoom about the cursor.
     *
     * Registered manually rather than through React's `onWheel` because that
     * one is passive and cannot call `preventDefault`, so the page would scroll
     * as well. The zoom maths is inlined against the latest view read from a
     * ref, since this listener is registered once on mount.
     *
     * @param {WheelEvent} e - The wheel event.
     * @returns {void}
     * @sideEffect Prevents the page from scrolling and updates the view window.
     */
    const onWheel = (e) => {
      e.preventDefault()
      const rect = el.getBoundingClientRect()
      const cur = viewRef.current
      const factor = Math.pow(1.18, e.deltaY / 100)
      const px = e.clientX - rect.left, py = e.clientY - rect.top
      const cx = cur.x0 + ((px - PAD) / (el.clientWidth - 2 * PAD)) * (cur.x1 - cur.x0)
      const cy = cur.y0 + ((el.clientHeight - PAD - py) / (el.clientHeight - 2 * PAD)) * (cur.y1 - cur.y0)
      const nv = {
        x0: cx - (cx - cur.x0) * factor,
        x1: cx + (cur.x1 - cx) * factor,
        y0: cy - (cy - cur.y0) * factor,
        y1: cy + (cur.y1 - cy) * factor,
      }
      if (nv.x1 - nv.x0 < 2 || nv.x1 - nv.x0 > 500) return
      if (nv.y1 - nv.y0 < 0.1 || nv.y1 - nv.y0 > 1000) return
      setView(nv)
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  const panStart = useRef(null)
  /**
   * Begin a pan, on shift-drag or middle-drag.
   *
   * @param {React.PointerEvent} e - The pointerdown event.
   * @returns {void}
   * @sideEffect Registers window pointermove and pointerup listeners. Ignores plain clicks, which add a point instead.
   */
  const onSvgPointerDown = (e) => {
    if (e.button === 1 || e.shiftKey) {
      e.preventDefault()
      panStart.current = { px: e.clientX, py: e.clientY, view: { ...v } }
      /**
       * Apply the in-progress pan.
       *
       * @param {PointerEvent} ev - The pointermove event.
       * @returns {void}
       * @sideEffect Updates the view window on every move.
       */
      const move = (ev) => {
        const s = panStart.current
        if (!s) return
        const dx = ((ev.clientX - s.px) / (W - 2 * PAD)) * (s.view.x1 - s.view.x0)
        const dy = ((ev.clientY - s.py) / (H - 2 * PAD)) * (s.view.y1 - s.view.y0)
        setView({ x0: s.view.x0 - dx, x1: s.view.x1 - dx, y0: s.view.y0 + dy, y1: s.view.y1 + dy })
      }
      /**
       * End the pan and remove its listeners.
       *
       * @returns {void}
       * @sideEffect Clears the pan state and removes the window listeners.
       */
      const up = () => { panStart.current = null; window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up) }
      window.addEventListener('pointermove', move)
      window.addEventListener('pointerup', up)
    }
  }

  /**
   * Add a control point where the curve was clicked.
   *
   * The new point's gain is the gap between the click and the current curve,
   * so the curve passes through exactly where it was clicked rather than
   * jumping. Clicks on an existing point, during a pan, or outside the plot
   * are ignored.
   *
   * @param {React.MouseEvent} e - The click event.
   * @returns {void}
   * @sideEffect Adds a control point and selects it, which triggers a resimulation.
   */
  const onSvgClick = (e) => {
    if (e.target.dataset.pt !== undefined || e.shiftKey || panStart.current) return
    const rect = svgRef.current.getBoundingClientRect()
    const [x, r] = fromPx(e.clientX - rect.left, e.clientY - rect.top)
    if (x < v.x0 || x > v.x1 || r < v.y0 || r > v.y1) return
    const g = r - evalCurve(curve, x, xmax)
    const points = [...(curve.points || []), { x: Math.round(x * 10) / 10, g: Math.round(g * 100) / 100, w: Math.round(xmax / 3) }]
    commit({ points })
    setSelected(points.length - 1)
  }

  /**
   * Track the cursor for the crosshair guide.
   *
   * @param {React.MouseEvent} e - The mousemove event.
   * @returns {void}
   * @sideEffect Updates the hover position, or clears it outside the plot.
   */
  const onSvgMove = (e) => {
    const rect = svgRef.current.getBoundingClientRect()
    const [x] = fromPx(e.clientX - rect.left, e.clientY - rect.top)
    setHover(x >= v.x0 && x <= v.x1 ? x : null)
  }

  /**
   * Drag one control point.
   *
   * Gain is recomputed against the curve with this point removed, so the
   * point follows the cursor exactly instead of compounding with its own
   * contribution.
   *
   * @param {number} idx - Index of the point.
   * @param {React.PointerEvent} e - The pointerdown event.
   * @returns {void}
   * @sideEffect Selects the point and registers window pointermove and pointerup listeners. Each move updates the driver's params.
   */
  const onDragPoint = (idx, e) => {
    e.stopPropagation()
    e.preventDefault()
    setSelected(idx)
    const rect = svgRef.current.getBoundingClientRect()
    /**
     * Apply the in-progress point drag.
     *
     * @param {PointerEvent} ev - The pointermove event.
     * @returns {void}
     * @sideEffect Updates the driver's params on every move, which triggers a resimulation.
     */
    const move = (ev) => {
      const [x, r] = fromPx(ev.clientX - rect.left, ev.clientY - rect.top)
      const cur = curveRef.current
      const points = cur.points.map((p, k) => {
        if (k !== idx) return p
        const others = { ...cur, points: cur.points.filter((_, j) => j !== idx) }
        return {
          ...p,
          x: Math.round(x * 10) / 10,
          g: Math.round((r - evalCurve(others, x, xmax)) * 100) / 100,
        }
      })
      commit({ points })
    }
    /**
     * End the point drag and remove its listeners.
     *
     * @returns {void}
     * @sideEffect Removes the window listeners.
     */
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up) }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  /**
   * Delete one control point.
   *
   * @param {number} idx - Index of the point.
   * @returns {void}
   * @sideEffect Updates the driver's params and clears the selection.
   */
  const removePoint = (idx) => { commit({ points: curve.points.filter((_, k) => k !== idx) }); setSelected(-1) }

  useEffect(() => {
    /**
     * Delete the selected control point on Delete or Backspace.
     *
     * Only acts while the Lab holds focus: the Node Editor uses the same key to
     * remove graph nodes, and both panels can be on screen at once.
     *
     * @param {KeyboardEvent} e - The keydown event.
     * @returns {void}
     * @sideEffect Removes the selected point, which triggers a resimulation. Ignored while a text field has focus or another panel is focused.
     */
    const onKey = (e) => {
      const tag = e.target.tagName
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return
      if (useStore.getState().focusedPanel !== 'nllab') return
      if ((e.key === 'Delete' || e.key === 'Backspace') && selected >= 0 && curveRef.current.points?.[selected]) {
        e.preventDefault()
        removePoint(selected)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selected]) // eslint-disable-line react-hooks/exhaustive-deps

  const sel = curve.points?.[selected]
  const hoverR = hover != null ? evalCurve(curve, hover, xmax) : null
  const [hpx, hpy] = hover != null ? toPx(hover, hoverR) : [0, 0]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: 1, minHeight: 0 }}>
      <svg
        ref={svgRef} width={W} height={H}
        style={{ background: 'var(--bg)', borderRadius: 8, cursor: 'crosshair' }}
        onClick={onSvgClick} onPointerDown={onSvgPointerDown}
        onPointerMove={onSvgMove} onPointerLeave={() => setHover(null)}
      >
        <defs>
          <clipPath id="plotclip"><rect x={PAD} y={PAD - 20} width={W - 2 * PAD} height={H - 2 * PAD + 20} /></clipPath>
        </defs>
        {niceTicks(v.x0, v.x1, 10).map((x) => {
          const [px] = toPx(x, v.y0)
          return <g key={`x${x}`}>
            <line x1={px} y1={PAD} x2={px} y2={H - PAD} stroke="#232b3a" strokeDasharray={Math.abs(x) < 1e-9 ? '' : '2 4'} />
            <text x={px} y={H - PAD + 15} fill="#6b7687" fontSize="10" textAnchor="middle">{x}</text>
          </g>
        })}
        {niceTicks(v.y0, v.y1, 6).map((r) => {
          const [, py] = toPx(v.x0, r)
          const isRef = Math.abs(r - 1) < 1e-9
          return <g key={`y${r}`}>
            <line x1={PAD} y1={py} x2={W - PAD} y2={py} stroke={isRef ? '#3d4859' : '#232b3a'} strokeDasharray={isRef ? '' : '2 4'} />
            <text x={PAD - 6} y={py + 3} fill={isRef ? '#9aa7b8' : '#6b7687'} fontSize="10" textAnchor="end">{fmtVal(r * refv.v)}</text>
          </g>
        })}
        <text x={14} y={PAD - 8} fill="#9aa7b8" fontSize="10">{param} ({refv.unit})</text>
        <g clipPath="url(#plotclip)">
          {[-xmax, xmax].map((x) => {
            if (x < v.x0 || x > v.x1) return null
            const [px] = toPx(x, 0)
            return <g key={x}>
              <line x1={px} y1={PAD} x2={px} y2={H - PAD} stroke="#e66767" strokeDasharray="5 4" opacity="0.6" />
              <text x={px} y={PAD - 6} fill="#e66767" fontSize="10" textAnchor="middle">{x > 0 ? '+Xmax' : '−Xmax'}</text>
            </g>
          })}
          {/* cursor guide: vertical bar + dot on the curve */}
          {hover != null && (
            <g pointerEvents="none">
              <line x1={hpx} y1={PAD} x2={hpx} y2={H - PAD} stroke="#5598e7" strokeDasharray="3 3" opacity="0.7" />
              <circle cx={hpx} cy={hpy} r="4.5" fill="none" stroke="#5598e7" strokeWidth="2" />
              <text x={hpx + 8} y={Math.max(hpy - 10, PAD + 12)} fill="#9ec5f4" fontSize="11">
                {hover.toFixed(1)} mm · {fmtVal(hoverR * refv.v)} {refv.unit} ({(hoverR * 100).toFixed(0)}%)
              </text>
            </g>
          )}
          <path d={path} stroke="#3987e5" strokeWidth="2.5" fill="none" />
          {(curve.points || []).map((p, k) => {
            const [px, py] = toPx(p.x, evalCurve(curve, p.x, xmax))
            return (
              <g key={k}>
                <circle
                  data-pt={k} cx={px} cy={py} r={selected === k ? 9 : 7}
                  fill={selected === k ? '#c98500' : '#9085e9'} stroke="var(--bg)" strokeWidth="2"
                  style={{ cursor: 'grab' }}
                  onPointerDown={(e) => onDragPoint(k, e)}
                  onDoubleClick={(e) => { e.stopPropagation(); removePoint(k) }}
                />
                {curve.sym && Math.abs(p.x) > 0.01 && (() => {
                  const [mx, my] = toPx(-p.x, evalCurve(curve, -p.x, xmax))
                  return <circle cx={mx} cy={my} r={5} fill="none" stroke="#9085e9" strokeWidth="1.5" strokeDasharray="2 2" />
                })()}
              </g>
            )
          })}
        </g>
        <text x={W / 2} y={H - 8} fill="#6b7687" fontSize="10" textAnchor="middle">
          excursion (mm) — click: add point · drag point: shape · Delete/double-click: remove · wheel: zoom · shift+drag: pan
        </text>
      </svg>
      <div style={{ display: 'flex', gap: 16, alignItems: 'center', fontSize: 12, minHeight: 28, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 4 }}>
          <button title="Zoom in" onClick={() => zoomAt(W / 2, H / 2, 1 / 1.35)}>＋</button>
          <button title="Zoom out" onClick={() => zoomAt(W / 2, H / 2, 1.35)}>－</button>
          <button title="Reset view" onClick={() => setView(null)} disabled={!view}>⟲ Fit</button>
        </div>
        {sel ? (
          <>
            <span>Point {selected + 1}:</span>
            <label>x <input type="number" step="0.5" value={sel.x} style={{ width: 64 }}
              onChange={(e) => { const val = parseFloat(e.target.value); if (isFinite(val)) commit({ points: curve.points.map((p, k) => k === selected ? { ...p, x: val } : p) }) }} /> mm</label>
            <label>gain <input type="number" step="0.05" value={sel.g} style={{ width: 64 }}
              onChange={(e) => { const val = parseFloat(e.target.value); if (isFinite(val)) commit({ points: curve.points.map((p, k) => k === selected ? { ...p, g: val } : p) }) }} /></label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>width
              <input type="range" min="1" max={Math.ceil(xmax * 1.5)} step="0.5" value={sel.w} style={{ width: 160 }}
                onChange={(e) => commit({ points: curve.points.map((p, k) => k === selected ? { ...p, w: parseFloat(e.target.value) } : p) })} />
              {sel.w} mm
            </label>
            <button className="danger" onClick={() => removePoint(selected)}>Delete point</button>
          </>
        ) : <span style={{ color: 'var(--text-3)' }}>Click the curve to add a control point.</span>}
      </div>
    </div>
  )
}

/**
 * The Nonlinear Lab: edit a driver's large-signal curves and see their effect.
 *
 * Experimental. Curves describe how Bl, Cms/Kms and Le vary with excursion;
 * the solver then iterates a quasi-linear sweep against them, which captures
 * power compression and resonance drift but produces no harmonic distortion
 * — that needs a time-domain engine.
 *
 * @returns {React.ReactElement} The panel.
 * @sideEffect Subscribes to the store; edits update the driver's params.
 */
export default function NLLab() {
  const nodes = useStore((s) => s.nodes)
  const layoutOps = useStore((s) => s.layoutOps)
  const updateParams = useStore((s) => s.updateParams)
  const results = useStore((s) => s.results)
  const drivers = nodes.filter((n) => n.type === 'driver')
  const [driverId, setDriverId] = useState(drivers[0]?.id || null)
  const [param, setParam] = useState('Bl')
  const fileRef = useRef(null)
  const wrapRef = useRef(null)
  const [size, setSize] = useState({ w: 900, h: 420 })
  const driver = drivers.find((d) => d.id === driverId) || drivers[0]

  useEffect(() => {
    if (!wrapRef.current) return
    const ro = new ResizeObserver((entries) => {
      const r = entries[0].contentRect
      setSize({ w: r.width, h: Math.max(r.height - 210, 260) })
    })
    ro.observe(wrapRef.current)
    return () => ro.disconnect()
  }, [])

  if (!driver) {
    return (
      <div style={{ padding: 30 }}>
        <h3>Nonlinear Lab</h3>
        <p style={{ color: 'var(--text-3)' }}>Add a Driver node to the circuit first.</p>
        <button onClick={() => layoutOps.open('canvas')}>← Back to editor</button>
      </div>
    )
  }
  const p = driver.data.params
  const nl = { ...defaultNL(), ...(p.nl || {}) }
  const xmax = p.Xmax || 10
  const curve = nl[param]
  const refv = refValue(param, p)
  const suspConflict = curveHasContent(nl.Cms) && curveHasContent(nl.Kms)

  const xPk = (() => {
    const arr = results?.excursionByDriver?.[driver.id]
    return arr && arr.length ? Math.max(...arr) : null
  })()
  const der = xPk != null ? derivedRatios(nl, xPk, xmax) : null

  /**
   * Write a change to the selected curve back to the driver node.
   *
   * @param {object} patch - Fields to change on the curve.
   * @returns {*} Whatever the store action returns; callers ignore it.
   * @sideEffect Updates the driver's params, which triggers a resimulation.
   */
  const setCurve = (patch) => updateParams(driver.id, { nl: { ...nl, [param]: { ...curve, ...patch } } })

  /**
   * Import a measured curve from a CSV file.
   *
   * @param {React.ChangeEvent} e - The file input change event.
   * @returns {void}
   * @sideEffect Reads the file and replaces the curve's table, or alerts when it cannot be parsed.
   */
  const importCSV = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    /**
     * Parse the loaded CSV and install it as this curve's table.
     *
     * Normalized on the way in, since published curves are usually in absolute
     * units while the engine works in ratios.
     *
     * @returns {void}
     * @sideEffect Updates the driver's params, or alerts when the file is unusable.
     */
    reader.onload = () => {
      try {
        const raw = parseCurveCSV(reader.result)
        const { table, wasAbsolute, v0 } = normalizeTable(raw)
        setCurve({ points: [], table })
        if (wasAbsolute) {
          alert(`Imported absolute values — normalized by the value at x=0 (${fmtVal(v0)}). The chart shows them against this driver's reference ${param} = ${fmtVal(refv.v)} ${refv.unit}.`)
        }
      } catch (err) { alert(`Import failed: ${err.message}`) }
    }
    reader.readAsText(file)
    e.target.value = ''
  }

  return (
    <div ref={wrapRef} style={{ padding: '12px 20px', height: '100%', display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6, flexWrap: 'wrap' }}>
        <h3 style={{ margin: 0 }}>Nonlinear Lab <span style={{ fontSize: 11, color: 'var(--amber)' }}>EXPERIMENTAL</span></h3>
        <select value={driver.id} onChange={(e) => setDriverId(e.target.value)} style={{ width: 170 }}>
          {drivers.map((d) => <option key={d.id} value={d.id}>{d.data.params.label || d.id}</option>)}
        </select>
        <div style={{ display: 'flex', gap: 2 }}>
          {NL_PARAMS.map((k) => (
            <button key={k} className={param === k ? 'primary' : ''} onClick={() => setParam(k)}>{k}(x)</button>
          ))}
        </div>
        <label className="tb-group" title="Linear excursion limit — red markers on the chart; used by the extrapolation toggle and the excursion plot">
          Xmax
          <input type="number" step="0.5" min="1" value={xmax} style={{ width: 60 }}
            onChange={(e) => { const val = parseFloat(e.target.value); if (val > 0) updateParams(driver.id, { Xmax: val }) }} />
          mm
        </label>
        <label style={{ display: 'flex', gap: 5, alignItems: 'center', fontSize: 12, cursor: 'pointer' }}
          title="Mirror every control point onto both stroke directions">
          <input type="checkbox" checked={!!curve.sym} onChange={(e) => setCurve({ sym: e.target.checked })} />
          Symmetric
        </label>
        <label style={{ display: 'flex', gap: 5, alignItems: 'center', fontSize: 12, cursor: 'pointer' }}
          title="Past ±Xmax, continue the curve along its slope at Xmax instead of letting it relax back toward 1.0">
          <input type="checkbox" checked={!!curve.extrap} onChange={(e) => setCurve({ extrap: e.target.checked })} />
          Extrapolate past Xmax
        </label>
        <span style={{ flex: 1 }} />
        <button onClick={() => fileRef.current?.click()}>Import CSV…</button>
        <input ref={fileRef} type="file" accept=".csv,.txt" style={{ display: 'none' }} onChange={importCSV} />
        {curve.table && <button className="danger" onClick={() => setCurve({ table: null })}>Clear table</button>}
        <button onClick={() => setCurve({ points: [], table: null })}>Reset {param}(x)</button>
      </div>
      <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginBottom: 6 }}>
        {PARAM_INFO[param].hint}{' '}
        Reference (flat line) = small-signal {param} = <b style={{ color: 'var(--text-2)' }}>{fmtVal(refv.v)} {refv.unit}</b>; a flat curve reproduces the linear engine.
        {curve.table && <b> Imported table active as baseline; points deform it.</b>}
        {suspConflict && <b style={{ color: 'var(--amber)' }}> Both Cms(x) and Kms(x) have content — Kms(x) takes precedence; reset one of them.</b>}
      </div>
      <CurveEditor key={driver.id + param} driverId={driver.id} param={param} nl={nl} xmax={xmax} width={size.w - 40} height={size.h} refv={refv} />
      <div style={{ display: 'flex', gap: 22, fontSize: 12, flexWrap: 'wrap', padding: '8px 2px 0', borderTop: '1px solid var(--border)', marginTop: 8 }}>
        {der ? (
          <>
            <span style={{ color: 'var(--text-3)' }}>At current drive:</span>
            <span>X̂ ≈ <b>{xPk.toFixed(1)} mm</b></span>
            <span>Bl → <b>{(der.Bl * 100).toFixed(0)}%</b></span>
            <span>Cms → <b>{(der.Cms * 100).toFixed(0)}%</b></span>
            <span>Le → <b>{(der.Le * 100).toFixed(0)}%</b></span>
            <span>Fs → <b>{(p.Fs * der.Fs).toFixed(1)} Hz</b></span>
            <span>Qes → <b>{(der.Qes * 100).toFixed(0)}%</b></span>
            <span>Vas → <b>{(der.Vas * 100).toFixed(0)}%</b></span>
            <span style={{ color: 'var(--text-3)', fontSize: 10.5 }}>Fs/Qes/Vas derive from Bl(x) & Cms(x) — consequences, not inputs.</span>
          </>
        ) : <span style={{ color: 'var(--text-3)' }}>Run a simulation to see effective large-signal parameters.</span>}
      </div>
    </div>
  )
}

// Module-private functions, exposed for the contract test suite only
// (test/contract/*). Not part of this module's public API — application code
// must not import from here, and nothing outside the tests does.
export const __internals = { refValue, fmtVal, niceTicks }
