import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useStore } from '../store'
import { NL_PARAMS, defaultNL, evalCurve, derivedRatios, parseCurveCSV, normalizeTable, curveHasContent } from '../engine/nonlinear'

// EXPERIMENTAL — large-signal T/S curve lab.
// Parametric-EQ style editor: click the curve to add a control point, drag it
// (gain/position), tune width with the slider. Wheel zooms about the cursor,
// shift-drag (or middle-drag) pans, Delete removes the selected point, and a
// crosshair guide tracks the cursor along the curve.

const PARAM_INFO = {
  Bl: { hint: 'Motor force factor vs excursion. Typically droops toward ±Xmax; Xmax by the Klippel criterion is where Bl falls to 0.70.' },
  Cms: { hint: 'Suspension compliance vs excursion. Progressive suspensions get LESS compliant (curve drops) at high excursion, raising Fs and reducing output.' },
  Kms: { hint: 'Suspension stiffness vs excursion — the reciprocal view of Cms, as published in Klippel reports. Stiffness RISES at high excursion. If this curve has any content it takes precedence over Cms(x).' },
  Le: { hint: 'Voice-coil inductance vs excursion. Typically rises as the coil moves inward over the pole, falls moving outward (asymmetric — turn Symmetric off).' },
}

// small-signal reference value per parameter, for the actual-value y axis
function refValue(param, p) {
  switch (param) {
    case 'Bl': return { v: p.Bl || 1, unit: 'T·m' }
    case 'Cms': return { v: p.Cms || 1, unit: 'mm/N' }
    case 'Kms': return { v: p.Cms ? 1 / p.Cms : 1, unit: 'N/mm' }
    case 'Le': return { v: p.Le || 1, unit: 'mH' }
    default: return { v: 1, unit: '' }
  }
}
const fmtVal = (v) => (Math.abs(v) >= 100 ? v.toFixed(0) : Math.abs(v) >= 10 ? v.toFixed(1) : v.toPrecision(3))
const PAD = 46

function niceTicks(lo, hi, target = 8) {
  const span = hi - lo
  if (span <= 0) return []
  const raw = span / target
  const mag = Math.pow(10, Math.floor(Math.log10(raw)))
  const step = [1, 2, 5, 10].map((m) => m * mag).find((s) => span / s <= target) || 10 * mag
  const ticks = []
  for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) ticks.push(Math.round(v * 1000) / 1000)
  return ticks
}

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

  const toPx = (x, r) => [
    PAD + ((x - v.x0) / (v.x1 - v.x0)) * (W - 2 * PAD),
    H - PAD - ((r - v.y0) / (v.y1 - v.y0)) * (H - 2 * PAD),
  ]
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

  const commit = (patch) => updateParams(driverId, { nl: { ...nl, [param]: { ...curve, ...patch } } })
  const curveRef = useRef(curve)
  curveRef.current = curve
  const viewRef = useRef(v)
  viewRef.current = v

  // ---- zoom / pan ----
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
  // React onWheel is passive; attach non-passive listener to preventDefault
  useEffect(() => {
    const el = svgRef.current
    if (!el) return
    const onWheel = (e) => {
      e.preventDefault()
      const rect = el.getBoundingClientRect()
      const cur = viewRef.current
      const factor = Math.pow(1.18, e.deltaY / 100)
      // inline zoomAt against latest view
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
  const onSvgPointerDown = (e) => {
    if (e.button === 1 || e.shiftKey) {
      e.preventDefault()
      panStart.current = { px: e.clientX, py: e.clientY, view: { ...v } }
      const move = (ev) => {
        const s = panStart.current
        if (!s) return
        const dx = ((ev.clientX - s.px) / (W - 2 * PAD)) * (s.view.x1 - s.view.x0)
        const dy = ((ev.clientY - s.py) / (H - 2 * PAD)) * (s.view.y1 - s.view.y0)
        setView({ x0: s.view.x0 - dx, x1: s.view.x1 - dx, y0: s.view.y0 + dy, y1: s.view.y1 + dy })
      }
      const up = () => { panStart.current = null; window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up) }
      window.addEventListener('pointermove', move)
      window.addEventListener('pointerup', up)
    }
  }

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

  const onSvgMove = (e) => {
    const rect = svgRef.current.getBoundingClientRect()
    const [x] = fromPx(e.clientX - rect.left, e.clientY - rect.top)
    setHover(x >= v.x0 && x <= v.x1 ? x : null)
  }

  const onDragPoint = (idx, e) => {
    e.stopPropagation()
    e.preventDefault()
    setSelected(idx)
    const rect = svgRef.current.getBoundingClientRect()
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
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up) }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  const removePoint = (idx) => { commit({ points: curve.points.filter((_, k) => k !== idx) }); setSelected(-1) }

  // Delete / Backspace removes the selected point (Lab owns keys on this tab)
  useEffect(() => {
    const onKey = (e) => {
      const tag = e.target.tagName
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return
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

export default function NLLab() {
  const nodes = useStore((s) => s.nodes)
  const setActiveTab = useStore((s) => s.setActiveTab)
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
        <button onClick={() => setActiveTab('editor')}>← Back to editor</button>
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

  const setCurve = (patch) => updateParams(driver.id, { nl: { ...nl, [param]: { ...curve, ...patch } } })

  const importCSV = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
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
        <h3 style={{ margin: 0 }}>⚗ Nonlinear Lab <span style={{ fontSize: 11, color: 'var(--amber)' }}>EXPERIMENTAL</span></h3>
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
        {suspConflict && <b style={{ color: 'var(--amber)' }}> ⚠ Both Cms(x) and Kms(x) have content — Kms(x) takes precedence; reset one of them.</b>}
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
