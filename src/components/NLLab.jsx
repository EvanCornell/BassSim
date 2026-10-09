import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useStore } from '../store'
import { readRecord } from '../records'
import {
  NL_PARAMS, defaultNL, evalCurve, parseCurveCSV, normalizeTable, curveHasContent,
  curvesFromRatings, curvesFromGeometry, emptyCurve, BL_AT_XMAX, XVAR_DB, FRINGE_LEVEL, DEFAULT_FRINGE_SHARE,
} from '../engine/nonlinear'
import { readDrivers } from '../workspace'
import { BUILTIN_DRIVERS } from '../data/drivers'
import NumInput from './NumInput'

// Driver curve editor — large-signal Bl(x), Kms(x)/Cms(x), Le(x).
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
 * Three bands, so a value keeps roughly three significant figures without an
 * axis label ever running long: at or above 100 no decimals, at or above 10 one
 * decimal, and below that three significant figures.
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
 * @param {Array<{label: string, color: string, curve: object, xmax: number}>} [props.overlays] - Curves drawn dashed for comparison.
 * @returns {React.ReactElement} The editor.
 * @sideEffect Subscribes to the store; edits update the driver's params, which triggers a resimulation. Registers a non-passive wheel listener and a window keydown listener.
 */
function CurveEditor({ driverId, param, nl, xmax, width, height, refv, overlays = [] }) {
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
     * @sideEffect Removes the selected point, which triggers a resimulation. Ignored while a text field has focus or the curve editor is not the view on screen.
     */
    const onKey = (e) => {
      const tag = e.target.tagName
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return
      const st = useStore.getState()
      if (!(st.tdOpen && st.tdTab === 'nonlinear')) return
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
        style={{ background: 'var(--panel-2)', borderRadius: 14, cursor: 'crosshair' }}
        onClick={onSvgClick} onPointerDown={onSvgPointerDown}
        onPointerMove={onSvgMove} onPointerLeave={() => setHover(null)}
      >
        <defs>
          <clipPath id="plotclip"><rect x={PAD} y={PAD - 20} width={W - 2 * PAD} height={H - 2 * PAD + 20} /></clipPath>
        </defs>
        {niceTicks(v.x0, v.x1, 10).map((x) => {
          const [px] = toPx(x, v.y0)
          return <g key={`x${x}`}>
            <line x1={px} y1={PAD} x2={px} y2={H - PAD} stroke="var(--grid)" strokeDasharray={Math.abs(x) < 1e-9 ? '' : '2 4'} />
            <text x={px} y={H - PAD + 15} fill="var(--text-3)" fontSize="10" textAnchor="middle">{x}</text>
          </g>
        })}
        {niceTicks(v.y0, v.y1, 6).map((r) => {
          const [, py] = toPx(v.x0, r)
          const isRef = Math.abs(r - 1) < 1e-9
          return <g key={`y${r}`}>
            <line x1={PAD} y1={py} x2={W - PAD} y2={py} stroke={isRef ? 'var(--line-2)' : 'var(--grid)'} strokeDasharray={isRef ? '' : '2 4'} />
            <text x={PAD - 6} y={py + 3} fill={isRef ? 'var(--text-2)' : 'var(--text-3)'} fontSize="10" textAnchor="end">{fmtVal(r * refv.v)}</text>
          </g>
        })}
        <text x={14} y={PAD - 8} fill="var(--text-2)" fontSize="10">{param} ({refv.unit})</text>
        <g clipPath="url(#plotclip)">
          {[-xmax, xmax].map((x) => {
            if (x < v.x0 || x > v.x1) return null
            const [px] = toPx(x, 0)
            return <g key={x}>
              <line x1={px} y1={PAD} x2={px} y2={H - PAD} stroke="var(--red)" strokeDasharray="5 4" opacity="0.6" />
              <text x={px} y={PAD - 6} fill="var(--red)" fontSize="10" textAnchor="middle">{x > 0 ? '+Xmax' : '−Xmax'}</text>
            </g>
          })}
          {/* cursor guide: vertical bar + dot on the curve */}
          {hover != null && (
            <g pointerEvents="none">
              <line x1={hpx} y1={PAD} x2={hpx} y2={H - PAD} stroke="var(--accent)" strokeDasharray="3 3" opacity="0.7" />
              <circle cx={hpx} cy={hpy} r="4.5" fill="none" stroke="var(--accent)" strokeWidth="2" />
              <text x={hpx + 8} y={Math.max(hpy - 10, PAD + 12)} fill="var(--accent-strong)" fontSize="11">
                {hover.toFixed(1)} mm · {fmtVal(hoverR * refv.v)} {refv.unit} ({(hoverR * 100).toFixed(0)}%)
              </text>
            </g>
          )}
          {overlays.map((o) => {
            const n = 160
            let d = ''
            for (let i = 0; i <= n; i++) {
              const x = v.x0 + ((v.x1 - v.x0) * i) / n
              const [px, py] = toPx(x, evalCurve(o.curve, x, o.xmax))
              d += `${i ? 'L' : 'M'}${px.toFixed(1)} ${py.toFixed(1)}`
            }
            return <path key={o.label} d={d} stroke={o.color} strokeWidth="1.6" strokeDasharray="6 4" fill="none" />
          })}
          <path d={path} stroke="var(--c1)" strokeWidth="2.5" fill="none" />
          {(curve.points || []).map((p, k) => {
            const [px, py] = toPx(p.x, evalCurve(curve, p.x, xmax))
            return (
              <g key={k}>
                <circle
                  data-pt={k} cx={px} cy={py} r={selected === k ? 9 : 7}
                  fill={selected === k ? 'var(--c3)' : 'var(--c4)'} stroke="var(--bg)" strokeWidth="2"
                  style={{ cursor: 'grab' }}
                  onPointerDown={(e) => onDragPoint(k, e)}
                  onDoubleClick={(e) => { e.stopPropagation(); removePoint(k) }}
                />
                {curve.sym && Math.abs(p.x) > 0.01 && (() => {
                  const [mx, my] = toPx(-p.x, evalCurve(curve, -p.x, xmax))
                  return <circle cx={mx} cy={my} r={5} fill="none" stroke="var(--c4)" strokeWidth="1.5" strokeDasharray="2 2" />
                })()}
              </g>
            )
          })}
        </g>
        <text x={W / 2} y={H - 8} fill="var(--text-3)" fontSize="10" textAnchor="middle">
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
            <label>x <NumInput step="0.5" value={sel.x} style={{ width: 64 }}
              onCommit={(val) => commit({ points: curve.points.map((p, k) => k === selected ? { ...p, x: val } : p) })} /> mm</label>
            <label>gain <NumInput step="0.05" value={sel.g} style={{ width: 64 }}
              onCommit={(val) => commit({ points: curve.points.map((p, k) => k === selected ? { ...p, g: val } : p) })} /></label>
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
 * Enter a curve as polynomial coefficients, as measurement reports publish them.
 *
 * Coefficients are in the parameter's absolute units with x in mm, constant
 * term first — Bl(x) = b0 + b1·x + b2·x² … — over the range they were fitted
 * on. The curve becomes P(x)/P(0), held at its end values outside that range.
 *
 * @param {object} props - Component props.
 * @param {object} props.curve - The curve being edited.
 * @param {string} props.param - Its parameter name.
 * @param {{v: number, unit: string}} props.refv - The driver's small-signal value, shown for comparison.
 * @param {Function} props.setCurve - Writes a patch to the curve.
 * @returns {React.ReactElement} The button, and its form when open.
 * @sideEffect Holds the form's text in component state.
 */
function PolyButton({ curve, param, refv, setCurve }) {
  const [open, setOpen] = useState(false)
  const [text, setText] = useState(curve.poly ? curve.poly.coeffs.join(', ') : '')
  const [lo, setLo] = useState(curve.poly?.min ?? -10)
  const [hi, setHi] = useState(curve.poly?.max ?? 10)
  const coeffs = text.split(/[\s,;]+/).filter(Boolean).map(Number)
  const ok = coeffs.length > 1 && coeffs.every(Number.isFinite) && coeffs[0] !== 0 && Number(hi) > Number(lo)
  return (
    <span style={{ position: 'relative' }}>
      <button onClick={() => setOpen(!open)}>Polynomial…</button>
      {open && (
        <div className="poly-pop">
          <div style={{ fontSize: 11.5, color: 'var(--text-2)', marginBottom: 6 }}>
            {param}(x) = k0 + k1·x + k2·x² + …, x in mm, in {refv.unit} — constant term first.
          </div>
          <textarea rows={3} value={text} spellCheck={false} placeholder="e.g. 15.2, -0.021, -0.0082, 0.00011"
            onChange={(e) => setText(e.target.value)} />
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 12, margin: '6px 0' }}>
            Valid from <NumInput value={lo} style={{ width: 60 }} validate={(v) => (v < hi ? null : 'Must be below the upper limit')} onCommit={setLo} />
            to <NumInput value={hi} style={{ width: 60 }} above={lo} onCommit={setHi} /> mm
          </div>
          {coeffs.length > 0 && Number.isFinite(coeffs[0]) && (
            <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 6 }}>
              k0 = {coeffs[0]} {refv.unit}; this driver's {param} is {fmtVal(refv.v)} {refv.unit}. The curve is used as a ratio of k0.
            </div>
          )}
          <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
            <button onClick={() => setOpen(false)}>Cancel</button>
            <button className="primary" disabled={!ok} onClick={() => {
              setCurve({ poly: { coeffs, min: Number(lo), max: Number(hi) } })
              setOpen(false)
            }}>Apply</button>
          </div>
        </div>
      )}
    </span>
  )
}

/**
 * A driver's catalogue entry, from the built-in catalogue or the workspace's own drivers.
 *
 * Driver nodes keep only what the solver reads, so construction figures such
 * as coil and gap heights are looked up again by model.
 *
 * @param {object} p - The driver node's params.
 * @param {Array<object>} [custom] - The workspace's custom drivers.
 * @returns {object|null} The entry, or `null` when no driver of that model is listed.
 * @pure
 */
function catalogueEntry(p, custom = []) {
  const all = [...custom, ...BUILTIN_DRIVERS]
  return all.find((r) => r.model === p.label && Number(r.Xmax) === Number(p.Xmax)) || all.find((r) => r.model === p.label) || null
}

/**
 * A driver's published Xvar, when it came from the built-in catalogue.
 *
 * @param {object} p - The driver node's params.
 * @param {Array<object>} [custom] - The workspace's custom drivers.
 * @returns {number|null} Xvar, mm, or `null` when the catalogue does not list one.
 * @pure
 */
function catalogueXvar(p, custom) {
  const v = Number(catalogueEntry(p, custom)?.ext?.Xvar)
  return v > 0 ? v : null
}

/**
 * A driver's coil (winding) and magnetic gap heights, when its catalogue entry lists them.
 *
 * @param {object} p - The driver node's params.
 * @param {Array<object>} [custom] - The workspace's custom drivers.
 * @returns {{coil: number, gap: number}|null} Heights, mm, or `null` without both.
 * @pure
 */
function catalogueGeometry(p, custom) {
  const ext = catalogueEntry(p, custom)?.ext
  const coil = Number(ext?.vcDepth)
  const gap = Number(ext?.gapDepth)
  return coil > 0 && gap > 0 ? { coil, gap } : null
}

/**
 * How a driver's curves are built: as last built, else from the motor when its geometry is known.
 *
 * Builds saved before the motor model carry no method and were made from Xmax.
 *
 * @param {object|undefined} r - The saved build settings (`nl.ratings`).
 * @param {object|null} geo - The catalogue's coil and gap heights.
 * @returns {'geometry'|'xmax'} The method.
 * @pure
 */
function buildMethod(r, geo) {
  if (r?.method) return r.method
  if (r?.xmax != null) return 'xmax'
  return geo ? 'geometry' : 'xmax'
}

/**
 * The curves a driver's saved build settings, or its catalogue entry, give: from the motor when its geometry is known, else from Xmax.
 *
 * @param {object} p - The driver node's params.
 * @param {Array<object>} [custom] - The workspace's custom drivers.
 * @returns {{Bl: object, Kms: object, label: string}|null} The curves and what they were built from; `null` when there is nothing to build from.
 * @pure
 */
function fitFor(p, custom) {
  const r = p.nl?.ratings
  const xvar = r?.xvar ?? catalogueXvar(p, custom)
  const method = buildMethod(r, catalogueGeometry(p, custom))
  const geo = method === 'geometry' ? (r?.method === 'geometry' ? r : catalogueGeometry(p, custom)) : null
  try {
    if (geo) {
      const c = curvesFromGeometry({ coil: geo.coil, gap: geo.gap, fringe: geo.fringe, xvar })
      return { Bl: c.Bl, Kms: c.Kms, label: `Motor ${geo.coil}/${geo.gap} mm${xvar ? ` & Xvar ${xvar}` : ''} fit` }
    }
    const xmax = Number(r?.xmax ?? p.Xmax)
    if (xmax > 0) {
      const c = curvesFromRatings(xmax, xvar || null)
      return { Bl: c.Bl, Kms: c.Kms, label: `Xmax ${xmax}${xvar ? ` & Xvar ${xvar}` : ''} fit` }
    }
  } catch { /* nothing usable */ }
  return null
}

/**
 * A ratio as a percentage.
 *
 * @param {number} r - The ratio.
 * @returns {string} e.g. `70%`.
 * @pure
 */
const pct = (r) => `${(r * 100).toFixed(0)}%`

/**
 * A level in dB.
 *
 * @param {number} v - dB.
 * @returns {string} e.g. `3.1 dB`.
 * @pure
 */
const dbText = (v) => `${v.toFixed(1)} dB`

/**
 * An excursion in mm, or a dash when there is none.
 *
 * @param {number|null} v - mm.
 * @returns {string} e.g. `4.1 mm`.
 * @pure
 */
const mmText = (v) => (v == null ? '—' : `${v.toFixed(1)} mm`)

/**
 * A number field for the builder: free text, red while it does not read as a number.
 *
 * @param {object} props - Component props.
 * @param {string} props.label - Its label.
 * @param {string} props.value - The text.
 * @param {Function} props.onChange - Called with the new text.
 * @param {string} [props.placeholder] - Shown when empty.
 * @param {boolean} [props.zero] - Whether 0 is allowed.
 * @param {string} [props.title] - Its tooltip.
 * @returns {React.ReactElement} The field.
 * @pure
 */
function MmField({ label, value, onChange, placeholder, zero, title }) {
  const v = parseFloat(value)
  const bad = value.trim() !== '' && !(zero ? v >= 0 : v > 0)
  return (
    <label title={title}>{label} <input className={`num${bad ? ' invalid' : ''}`} inputMode="decimal" value={value} placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)} /> mm</label>
  )
}

/**
 * Build Bl(x) and Kms(x) for a driver, as a form behind a button.
 *
 * From the motor: Bl(x) follows the coil and gap heights and the fringe
 * past each plate face (see `blFromGeometry`); the driver's Xmax is not used
 * for it and is left as it is. From Xmax, for drivers whose geometry is not
 * published: Bl falls to 70% at Xmax (see `curvesFromRatings`). Either way the
 * suspension stiffens by whatever the 6 dB at Xvar still needs. Applying
 * replaces Bl(x), Kms(x) and any Cms(x).
 *
 * @param {object} props - Component props.
 * @param {object} props.driver - The driver node.
 * @param {object} props.nl - Its curve set.
 * @returns {React.ReactElement} The button, and its form when open.
 * @sideEffect Holds the form's values in component state; applying updates the driver's params.
 */
function RatingsButton({ driver, nl }) {
  const updateParams = useStore((s) => s.updateParams)
  const custom = useStore((s) => readDrivers(s.workspace))
  const p = driver.data.params
  const [open, setOpen] = useState(false)
  const [method, setMethod] = useState('geometry')
  const [f, setF] = useState({ coil: '', gap: '', fringe: '', xmax: '', xvar: '' })
  /**
   * Open the form, filled from the last build, or the driver and its catalogue entry.
   *
   * @returns {void}
   * @sideEffect Writes component state.
   */
  const show = () => {
    const r = nl.ratings || {}
    const geo = catalogueGeometry(p, custom)
    /**
     * A stored number as field text.
     *
     * @param {*} v - The number, or nothing.
     * @returns {string} Its text; empty for nothing.
     * @pure
     */
    const str = (v) => (v == null || v === '' ? '' : String(v))
    setMethod(buildMethod(nl.ratings, geo))
    setF({
      coil: str(r.coil ?? geo?.coil), gap: str(r.gap ?? geo?.gap), fringe: str(r.fringe),
      xmax: str(r.xmax ?? p.Xmax), xvar: str(r.xvar ?? catalogueXvar(p, custom)),
    })
    setOpen(!open)
  }
  /**
   * Set one field.
   *
   * @param {string} k - The field.
   * @returns {Function} Its change handler.
   * @pure
   */
  const field = (k) => (v) => setF((x) => ({ ...x, [k]: v }))
  /**
   * A field's number.
   *
   * @param {string} t - Its text.
   * @returns {number|null} The number; `null` when empty, NaN when unreadable.
   * @pure
   */
  const num = (t) => (t.trim() === '' ? null : parseFloat(t))
  const coil = num(f.coil)
  const gap = num(f.gap)
  const fringe = num(f.fringe)
  const xmax = num(f.xmax)
  const xvar = num(f.xvar)
  let out = null
  let error = null
  try {
    out = method === 'geometry'
      ? curvesFromGeometry({ coil, gap, fringe, xvar, xmax: Number(p.Xmax) || null })
      : curvesFromRatings(xmax, xvar)
  } catch (err) { error = err.message }
  const i = out?.info
  /**
   * Install the curves on the driver.
   *
   * @returns {void}
   * @sideEffect Updates the driver's params, which triggers a resimulation.
   */
  const apply = () => {
    if (!out) return
    const has = curveHasContent(nl.Bl) || curveHasContent(nl.Kms) || curveHasContent(nl.Cms)
    if (has && !confirm('Replace this driver\'s Bl(x) and Kms(x) curves (and clear any Cms(x))?')) return
    const ratings = method === 'geometry' ? { method, coil, gap, fringe, xvar } : { method, xmax, xvar }
    updateParams(driver.id, {
      ...(method === 'xmax' ? { Xmax: xmax } : {}),
      nl: { ...nl, Bl: out.Bl, Kms: out.Kms, Cms: emptyCurve(), ratings },
    })
    setOpen(false)
  }
  const autoFringe = gap > 0 ? (DEFAULT_FRINGE_SHARE * gap).toFixed(2).replace(/\.?0+$/, '') : 'auto'
  return (
    <span style={{ position: 'relative' }}>
      <button onClick={show} title="Build Bl(x) and Kms(x) from the motor's coil and gap heights, or from Xmax, and Xvar">Build Bl &amp; Kms…</button>
      {open && (
        <div className="poly-pop ratings-pop">
          <div className="seg small">
            <button className={method === 'geometry' ? 'on' : ''} onClick={() => setMethod('geometry')}>From the motor</button>
            <button className={method === 'xmax' ? 'on' : ''} onClick={() => setMethod('xmax')}>From Xmax</button>
          </div>
          {method === 'geometry'
            ? (
              <div className="ratings-note">
                Bl(x) is the field the coil&apos;s turns sit in: flat across the gap height, falling away past each plate face
                over the fringe height (where it is down to {pct(FRINGE_LEVEL)}). It holds full strength until an end of the
                coil reaches a plate face, then falls as that end crosses the gap. An empty fringe is a quarter of the gap
                height. Xmax is not used and stays as it is.
              </div>
            )
            : (
              <div className="ratings-note">
                For drivers whose coil and gap are not published: Bl falls to {pct(BL_AT_XMAX)} at Xmax, smoothly and symmetrically.
              </div>
            )}
          <div className="ratings-fields">
            {method === 'geometry' && (
              <>
                <MmField label="Coil height" value={f.coil} onChange={field('coil')} title="Voice coil winding height (winding depth)" />
                <MmField label="Gap height" value={f.gap} onChange={field('gap')} title="Magnetic gap height: the top plate's thickness" />
                <MmField label="Fringe" value={f.fringe} onChange={field('fringe')} zero placeholder={autoFringe}
                  title={`How far past each plate face the field reaches before it is down to ${pct(FRINGE_LEVEL)}; 0 is a hard edge. Empty uses a quarter of the gap height.`} />
              </>
            )}
            {method === 'xmax' && <MmField label="Xmax" value={f.xmax} onChange={field('xmax')} />}
            <MmField label="Xvar" value={f.xvar} onChange={field('xvar')} placeholder="optional"
              title={`Where the output has varied by ${XVAR_DB} dB; the suspension stiffens by what Bl leaves short`} />
          </div>
          {error && <div className="ratings-out bad">{error}</div>}
          {i && method === 'geometry' && (
            <div className="ratings-out">
              <div>
                {i.overhung ? 'Overhung' : 'Underhung'} by {(Math.abs(coil - gap) / 2).toFixed(2).replace(/\.?0+$/, '')} mm each way, fringe {i.fringe.toFixed(2).replace(/\.?0+$/, '')} mm.
              </div>
              <div>Bl is 82% at {mmText(i.bl82At)}, {pct(BL_AT_XMAX)} at {mmText(i.bl70At)}, and {XVAR_DB} dB down at {mmText(i.blSixDbAt)}.</div>
              {i.blAtXmax != null && <div>At the listed Xmax ({p.Xmax} mm), Bl is {pct(i.blAtXmax)}.</div>}
            </div>
          )}
          {i && method === 'xmax' && (
            <div className="ratings-out">
              <div>Bl: {pct(BL_AT_XMAX)} at {xmax} mm ({dbText(-20 * Math.log10(BL_AT_XMAX))}); alone it reaches {XVAR_DB} dB at {mmText(i.blSixDbAt)}.</div>
            </div>
          )}
          {i && (
            <div className="ratings-out">
              {xvar > 0 && !i.blAlone && (
                <div>At Xvar {xvar} mm: Bl {pct(i.blAtXvar)} ({dbText(i.blDb)}) + Kms {pct(i.kmsAtXvar)} ({dbText(i.kmsDb)}) = {XVAR_DB} dB.</div>
              )}
              {xvar > 0 && i.blAlone && (
                <div className="bad">
                  Bl alone is already {dbText(i.blDb)} down at Xvar ({xvar} mm), so the suspension is left linear; the output varies
                  by {XVAR_DB} dB at {mmText(i.blSixDbAt)} instead.
                </div>
              )}
              {!(xvar > 0) && <div>No Xvar: only Bl(x) is built; Kms(x) stays linear.</div>}
            </div>
          )}
          <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
            <button onClick={() => setOpen(false)}>Cancel</button>
            <button className="primary" disabled={!out} onClick={apply}>Build curves</button>
          </div>
        </div>
      )}
    </span>
  )
}

/** Colours for overlay curves, after the edited curve's own. */
const OVERLAY_COLORS = ['var(--text-2)', 'var(--c2)', 'var(--c3)', 'var(--c5)']

/**
 * The driver being edited, and its curves with defaults filled in.
 *
 * @returns {{drivers: Array<object>, driver: object|undefined, nl: object|null, param: string}} Every driver, the chosen one, its curves, and the chosen curve.
 * @sideEffect Subscribes to the store.
 */
function useNlDriver() {
  const nodes = useStore((s) => s.nodes)
  const chosen = useStore((s) => s.nlDriver)
  const param = useStore((s) => s.nlParam)
  const drivers = nodes.filter((n) => n.type === 'driver')
  const driver = drivers.find((d) => d.id === chosen) || drivers[0]
  return { drivers, driver, nl: driver ? { ...defaultNL(), ...(driver.data.params.nl || {}) } : null, param }
}

/**
 * What a curve holds, in a few words.
 *
 * @param {object} curve - A curve.
 * @returns {string} e.g. `2 points, symmetric`, `Imported table`, `Flat`.
 * @pure
 */
export function curveSummary(curve) {
  if (!curveHasContent(curve)) return 'Flat'
  const parts = []
  if (curve.poly) parts.push('Polynomial')
  else if (curve.table) parts.push('Imported table')
  const n = curve.points?.length || 0
  if (n) parts.push(`${n} point${n === 1 ? '' : 's'}`)
  if (curve.sym) parts.push('symmetric')
  return parts.join(', ').replace(/^./, (c) => c.toUpperCase())
}

/**
 * The curve list beside the editor: the driver, and what each curve holds.
 *
 * @returns {React.ReactElement} The rail's sections.
 * @sideEffect Subscribes to the store; picks the driver and curve.
 */
export function NLRail() {
  const { drivers, driver, nl, param } = useNlDriver()
  const setNl = useStore((s) => s.setNl)
  if (!driver) return <div className="td-hint">Add a Driver node to the circuit first.</div>
  const both = curveHasContent(nl.Cms) && curveHasContent(nl.Kms)
  return (
    <>
      <div className="td-section">
        <div className="nl-rail-row">
          <h4>Driver</h4>
          <select value={driver.id} onChange={(e) => setNl({ nlDriver: e.target.value, nlOverlays: [] })}>
            {drivers.map((d) => <option key={d.id} value={d.id}>{d.data.params.label || d.id}</option>)}
          </select>
        </div>
      </div>
      <div className="td-section">
        <h4>Curves</h4>
        {NL_PARAMS.map((k) => (
          <button key={k} className={`nl-curve${param === k ? ' on' : ''}`} onClick={() => setNl({ nlParam: k })}>
            <span>{k}(x)</span>
            <span className={curveHasContent(nl[k]) ? '' : 'dim'}>{curveSummary(nl[k])}</span>
          </button>
        ))}
        {curveHasContent(nl.Kms) && <div className="td-hint">Kms(x) has content, so it takes precedence over Cms(x).{both ? ' Reset one of them.' : ''}</div>}
      </div>
    </>
  )
}

/**
 * The "+ Add overlay" menu: the same driver's curves in another record, a driver in another project, or a fit to the driver's ratings.
 *
 * @param {object} props - Component props.
 * @param {object} props.driver - The driver being edited.
 * @returns {React.ReactElement} The button and, when open, its menu.
 * @sideEffect Subscribes to the store; reads records; adds overlays.
 */
function AddOverlay({ driver }) {
  const [open, setOpen] = useState(false)
  const records = useStore((s) => s.records)
  const workspace = useStore((s) => s.workspace)
  const activeFile = useStore((s) => s.activeFile)
  const overlays = useStore((s) => s.nlOverlays)
  const setNl = useStore((s) => s.setNl)
  const p = driver.data.params
  /**
   * Lay a curve set over the editor.
   *
   * @param {string} id - What it is, so it is added once.
   * @param {string} label - Its name.
   * @param {object|null} nl - Its curves; none is the linear driver, every curve flat.
   * @param {number} xmax - Its driver's Xmax.
   * @returns {void}
   * @sideEffect Writes the overlays; closes the menu.
   */
  const add = (id, label, nl, xmax) => {
    setOpen(false)
    if (overlays.some((o) => o.id === id)) return
    setNl({ nlOverlays: [...overlays, { id, label, nl: { ...defaultNL(), ...(nl || {}) }, xmax: xmax || p.Xmax || 10 }] })
  }
  /**
   * Overlay this driver as another record holds it.
   *
   * @param {number} i - The record.
   * @returns {Promise<void>} Resolves once added.
   * @sideEffect Reads the record; writes the overlays.
   */
  const fromRecord = async (i) => {
    try {
      const content = await readRecord(records, i)
      const d = (content.nodes || []).find((n) => n.id === driver.id) || (content.nodes || []).find((n) => n.type === 'driver')
      add(`rec:${i}`, `Record ${i + 1}`, d?.params?.nl || null, d?.params?.Xmax)
    } catch (err) { alert(err.message) }
  }
  const others = Object.entries(workspace.files)
    .filter(([path, f]) => f.kind === 'project' && path !== activeFile)
    .flatMap(([path, f]) => (f.data?.nodes || []).filter((n) => n.type === 'driver' && n.params?.nl)
      .map((n) => ({ id: `proj:${path}:${n.id}`, label: `${f.data?.name || path.split('/').pop().replace(/\.speakerspice$/, '')} · ${n.params.label || n.id}`, nl: n.params.nl, xmax: n.params.Xmax })))
  const fit = fitFor(p, readDrivers(workspace))
  return (
    <span style={{ position: 'relative' }}>
      <button className="nl-chip add" onClick={() => setOpen(!open)}>+ Add overlay</button>
      {open && (
        <>
          <div className="menu-veil" onClick={() => setOpen(false)} />
          <div className="lib-menu" style={{ left: 0, top: 'calc(100% + 6px)' }}>
            {records && records.list.map((_, i) => (i === records.selected ? null : (
              <button key={i} onClick={() => fromRecord(i)}>Record {i + 1}</button>
            )))}
            {fit && <button onClick={() => add('fit', fit.label, { Bl: fit.Bl, Kms: fit.Kms }, p.Xmax)}>{fit.label.replace(/ fit$/, '')}</button>}
            {others.map((o) => <button key={o.id} onClick={() => add(o.id, o.label, o.nl, o.xmax)}>{o.label}</button>)}
            {!(records?.list.length > 1) && !fit && !others.length && <span className="lib-meta">Other records, other projects&apos; drivers and a fit to the motor or Xmax appear here.</span>}
          </div>
        </>
      )}
    </span>
  )
}

/**
 * The driver curve editor: a driver's large-signal Bl, Kms/Cms and Le curves.
 *
 * Curves describe how each parameter varies with excursion, as a ratio of
 * its small-signal value. Nonlinear time-domain runs use them directly; the
 * frequency sweep does not, since it is the small-signal model. The driver
 * and curve are picked in the rail beside it (`NLRail`).
 *
 * @returns {React.ReactElement} The editor.
 * @sideEffect Subscribes to the store; edits update the driver's params.
 */
export default function NLLab() {
  const closeTimeDomain = useStore((s) => s.closeTimeDomain)
  const updateParams = useStore((s) => s.updateParams)
  const overlays = useStore((s) => s.nlOverlays)
  const setNl = useStore((s) => s.setNl)
  const { driver, nl, param } = useNlDriver()
  const fileRef = useRef(null)
  const wrapRef = useRef(null)
  const [size, setSize] = useState({ w: 900, h: 420 })

  useEffect(() => {
    if (!wrapRef.current) return
    const ro = new ResizeObserver((entries) => {
      const r = entries[0].contentRect
      setSize({ w: r.width, h: Math.max(r.height - 170, 260) })
    })
    ro.observe(wrapRef.current)
    return () => ro.disconnect()
  }, [])

  if (!driver) {
    return (
      <div style={{ padding: 30 }}>
        <h3>Driver nonlinearity</h3>
        <p style={{ color: 'var(--text-3)' }}>Add a Driver node to the circuit first.</p>
        <button onClick={closeTimeDomain}>← Back to editor</button>
      </div>
    )
  }
  const p = driver.data.params
  const xmax = p.Xmax || 10
  const curve = nl[param]
  const refv = refValue(param, p)

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

  const shown = overlays.map((o, i) => ({ label: o.label, color: OVERLAY_COLORS[i % OVERLAY_COLORS.length], curve: { ...defaultNL()[param], ...(o.nl[param] || {}) }, xmax: o.xmax }))
  return (
    <div ref={wrapRef} className="nl-main">
      <div className="nl-toolbar">
        <span className="nl-param">{param}(x)</span>
        <label className="tb-group" title="Linear excursion limit — red markers on the chart; used by the extrapolation toggle and the excursion plot">
          Xmax
          <NumInput step="0.5" above="0" value={xmax} style={{ width: 60 }}
            onCommit={(val) => updateParams(driver.id, { Xmax: val })} />
          mm
        </label>
        <label className="td-check" title="Mirror every control point onto both stroke directions">
          <input type="checkbox" checked={!!curve.sym} onChange={(e) => setCurve({ sym: e.target.checked })} />
          Symmetric
        </label>
        <label className="td-check" title="Past ±Xmax, continue the curve along its slope at Xmax instead of letting it relax back toward 1.0">
          <input type="checkbox" checked={!!curve.extrap} onChange={(e) => setCurve({ extrap: e.target.checked })} />
          Extrapolate past Xmax
        </label>
        <span style={{ flex: 1 }} />
        <button onClick={() => fileRef.current?.click()}>Import CSV…</button>
        <PolyButton curve={curve} param={param} refv={refv} setCurve={setCurve} />
        <RatingsButton driver={driver} nl={nl} />
        <input ref={fileRef} type="file" accept=".csv,.txt" style={{ display: 'none' }} onChange={importCSV} />
        {curve.table && <button className="danger" onClick={() => setCurve({ table: null })}>Clear table</button>}
        {curve.poly && <button className="danger" onClick={() => setCurve({ poly: null })}>Clear polynomial</button>}
        <button onClick={() => setCurve({ points: [], table: null, poly: null })}>Reset {param}(x)</button>
      </div>
      <div className="nl-hint">
        {PARAM_INFO[param].hint}{' '}
        Reference (flat line) = small-signal {param} = <b>{fmtVal(refv.v)} {refv.unit}</b>; a flat curve reproduces the linear engine.
        {curve.table && !curve.poly && <b> Imported table active as baseline; points deform it.</b>}
        {curve.poly && <b> Polynomial active as baseline (x from {curve.poly.min} to {curve.poly.max} mm, held beyond); points deform it.</b>}
      </div>
      <div className="nl-overlays">
        <span className="lib-meta">Overlay</span>
        {shown.map((o, i) => (
          <span key={o.label} className="nl-chip">
            <span className="nl-dash" style={{ borderColor: o.color }} />{o.label}
            <button onClick={() => setNl({ nlOverlays: overlays.filter((_, j) => j !== i) })} title="Remove this overlay">✕</button>
          </span>
        ))}
        <AddOverlay driver={driver} />
      </div>
      <CurveEditor key={driver.id + param} driverId={driver.id} param={param} nl={nl} xmax={xmax} width={size.w} height={size.h} refv={refv} overlays={shown} />
    </div>
  )
}

// Module-private functions, exposed for the contract test suite only
// (test/contract/*). Not part of this module's public API — application code
// must not import from here, and nothing outside the tests does.
export const __internals = { refValue, fmtVal, niceTicks, catalogueXvar, catalogueGeometry, fitFor, curveSummary }
