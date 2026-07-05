import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useStore } from '../store'
import { NL_PARAMS, defaultNL, evalCurve, derivedRatios, parseCurveCSV } from '../engine/nonlinear'

// EXPERIMENTAL — large-signal T/S curve lab.
// Parametric-EQ style editor: click the curve to add a control point, drag it
// (gain/position), tune width with the slider. Y axis is the ratio to the
// small-signal value (flat 1.0 = linear). Fills the available screen space.

const PARAM_INFO = {
  Bl: { unit: 'ratio of Bl(0)', hint: 'Motor force factor vs excursion. Typically droops toward ±Xmax; Xmax by the Klippel criterion is where Bl falls to 0.70.' },
  Cms: { unit: 'ratio of Cms(0)', hint: 'Suspension compliance vs excursion. Progressive suspensions stiffen (ratio < 1) at high excursion, raising Fs and reducing output.' },
  Le: { unit: 'ratio of Le(0)', hint: 'Voice-coil inductance vs excursion. Typically rises as the coil moves inward over the pole, falls moving outward (asymmetric — turn Symmetric off).' },
}
const PAD = 46

function CurveEditor({ driverId, param, nl, xmax, width, height }) {
  const updateParams = useStore((s) => s.updateParams)
  const [selected, setSelected] = useState(-1)
  const svgRef = useRef(null)
  const curve = nl[param]
  const xSpan = Math.max(xmax * (curve.extrap ? 1.8 : 1.3), 5)
  const W = Math.max(width, 400)
  const H = Math.max(height, 260)

  const toPx = (x, r) => [PAD + ((x + xSpan) / (2 * xSpan)) * (W - 2 * PAD), H - PAD - (r / 1.6) * (H - 2 * PAD)]
  const fromPx = (px, py) => [((px - PAD) / (W - 2 * PAD)) * 2 * xSpan - xSpan, ((H - PAD - py) / (H - 2 * PAD)) * 1.6]

  const path = useMemo(() => {
    const pts = []
    for (let k = 0; k <= 200; k++) {
      const x = -xSpan + (2 * xSpan * k) / 200
      const [px, py] = toPx(x, evalCurve(curve, x, xmax))
      pts.push(`${k === 0 ? 'M' : 'L'}${px.toFixed(1)},${py.toFixed(1)}`)
    }
    return pts.join(' ')
  }, [curve, xSpan, xmax, W, H])

  const commit = (patch) => updateParams(driverId, { nl: { ...nl, [param]: { ...curve, ...patch } } })

  const onSvgClick = (e) => {
    if (e.target.dataset.pt !== undefined) return
    const rect = svgRef.current.getBoundingClientRect()
    const [x, r] = fromPx(e.clientX - rect.left, e.clientY - rect.top)
    if (Math.abs(x) > xSpan || r < 0 || r > 1.6) return
    const g = r - evalCurve(curve, x, xmax)
    const points = [...(curve.points || []), { x: Math.round(x * 10) / 10, g: Math.round(g * 100) / 100, w: Math.round(xmax / 3) }]
    commit({ points })
    setSelected(points.length - 1)
  }

  const curveRef = useRef(curve)
  curveRef.current = curve

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
          x: Math.max(-xSpan, Math.min(xSpan, Math.round(x * 10) / 10)),
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

  const gridStep = xSpan > 30 ? 10 : 5
  const gridX = []
  for (let x = -Math.floor(xSpan / gridStep) * gridStep; x <= xSpan; x += gridStep) gridX.push(x)
  const sel = curve.points?.[selected]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: 1, minHeight: 0 }}>
      <svg ref={svgRef} width={W} height={H} style={{ background: 'var(--bg)', borderRadius: 8, cursor: 'crosshair' }} onClick={onSvgClick}>
        {gridX.map((x) => {
          const [px] = toPx(x, 0)
          return <g key={x}>
            <line x1={px} y1={PAD} x2={px} y2={H - PAD} stroke="#232b3a" strokeDasharray={x === 0 ? '' : '2 4'} />
            <text x={px} y={H - PAD + 15} fill="#6b7687" fontSize="10" textAnchor="middle">{x}</text>
          </g>
        })}
        {[0.25, 0.5, 0.7, 1.0, 1.25, 1.5].map((r) => {
          const [, py] = toPx(0, r)
          return <g key={r}>
            <line x1={PAD} y1={py} x2={W - PAD} y2={py} stroke={r === 1 ? '#3d4859' : '#232b3a'} strokeDasharray={r === 1 ? '' : '2 4'} />
            <text x={PAD - 6} y={py + 3} fill="#6b7687" fontSize="10" textAnchor="end">{r.toFixed(2)}</text>
          </g>
        })}
        {[-xmax, xmax].map((x) => {
          const [px] = toPx(x, 0)
          return <line key={x} x1={px} y1={PAD} x2={px} y2={H - PAD} stroke="#e66767" strokeDasharray="5 4" opacity="0.6" />
        })}
        <text x={toPx(xmax, 0)[0]} y={PAD - 6} fill="#e66767" fontSize="10" textAnchor="middle">+Xmax</text>
        <text x={toPx(-xmax, 0)[0]} y={PAD - 6} fill="#e66767" fontSize="10" textAnchor="middle">−Xmax</text>
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
        <text x={W / 2} y={H - 8} fill="#6b7687" fontSize="10" textAnchor="middle">excursion (mm) — click curve to add a point, drag to shape, double-click to remove</text>
      </svg>
      <div style={{ display: 'flex', gap: 16, alignItems: 'center', fontSize: 12, minHeight: 28, flexWrap: 'wrap' }}>
        {sel ? (
          <>
            <span>Point {selected + 1}:</span>
            <label>x <input type="number" step="0.5" value={sel.x} style={{ width: 64 }}
              onChange={(e) => { const v = parseFloat(e.target.value); if (isFinite(v)) commit({ points: curve.points.map((p, k) => k === selected ? { ...p, x: v } : p) }) }} /> mm</label>
            <label>gain <input type="number" step="0.05" value={sel.g} style={{ width: 64 }}
              onChange={(e) => { const v = parseFloat(e.target.value); if (isFinite(v)) commit({ points: curve.points.map((p, k) => k === selected ? { ...p, g: v } : p) }) }} /></label>
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
        const table = parseCurveCSV(reader.result)
        setCurve({ points: [], table })
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
            onChange={(e) => { const v = parseFloat(e.target.value); if (v > 0) updateParams(driver.id, { Xmax: v }) }} />
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
        {PARAM_INFO[param].hint} Y axis: {PARAM_INFO[param].unit}. Flat 1.0 = linear engine.
        {curve.table && <b> Imported table active as baseline; points deform it.</b>}
      </div>
      <CurveEditor key={driver.id + param} driverId={driver.id} param={param} nl={nl} xmax={xmax} width={size.w - 40} height={size.h} />
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
