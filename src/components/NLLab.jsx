import React, { useMemo, useRef, useState } from 'react'
import { useStore } from '../store'
import { NL_PARAMS, defaultNL, evalCurve, derivedRatios, parseCurveCSV } from '../engine/nonlinear'

// EXPERIMENTAL — large-signal T/S curve lab.
// Parametric-EQ style editor: click the curve to add a control point, drag it
// vertically (gain) and horizontally (position), tune its width with the
// slider. Y axis is the ratio to the small-signal value (flat 1.0 = linear).

const PARAM_INFO = {
  Bl: { unit: 'ratio of Bl(0)', hint: 'Motor force factor vs excursion. Typically droops toward ±Xmax; Xmax by the Klippel criterion is where Bl falls to 0.70.' },
  Cms: { unit: 'ratio of Cms(0)', hint: 'Suspension compliance vs excursion. Progressive suspensions stiffen (ratio < 1) at high excursion, raising Fs and reducing output.' },
  Le: { unit: 'ratio of Le(0)', hint: 'Voice-coil inductance vs excursion. Typically rises as the coil moves inward over the pole, falls moving outward (asymmetric).' },
}

const W = 760, H = 340, PAD = 42

function CurveEditor({ driverId, param, nl, xmax }) {
  const updateParams = useStore((s) => s.updateParams)
  const [selected, setSelected] = useState(-1)
  const svgRef = useRef(null)
  const curve = nl[param]
  const xSpan = Math.max(xmax * 1.3, 5)

  const toPx = (x, r) => [PAD + ((x + xSpan) / (2 * xSpan)) * (W - 2 * PAD), H - PAD - (r / 1.6) * (H - 2 * PAD)]
  const fromPx = (px, py) => [((px - PAD) / (W - 2 * PAD)) * 2 * xSpan - xSpan, ((H - PAD - py) / (H - 2 * PAD)) * 1.6]

  const path = useMemo(() => {
    const pts = []
    for (let k = 0; k <= 160; k++) {
      const x = -xSpan + (2 * xSpan * k) / 160
      const [px, py] = toPx(x, evalCurve(curve, x))
      pts.push(`${k === 0 ? 'M' : 'L'}${px.toFixed(1)},${py.toFixed(1)}`)
    }
    return pts.join(' ')
  }, [curve, xSpan])

  const commit = (points) => {
    updateParams(driverId, { nl: { ...nl, [param]: { ...curve, points } } })
  }

  const onSvgClick = (e) => {
    if (e.target.dataset.pt !== undefined) return
    const rect = svgRef.current.getBoundingClientRect()
    const [x, r] = fromPx(e.clientX - rect.left, e.clientY - rect.top)
    if (Math.abs(x) > xSpan || r < 0 || r > 1.6) return
    const g = r - evalCurve(curve, x)
    const points = [...(curve.points || []), { x: Math.round(x * 10) / 10, g: Math.round(g * 100) / 100, w: Math.round(xmax / 3) }]
    commit(points)
    setSelected(points.length - 1)
  }

  const onDragPoint = (idx, e) => {
    e.stopPropagation()
    e.preventDefault()
    setSelected(idx)
    const rect = svgRef.current.getBoundingClientRect()
    const move = (ev) => {
      const [x, r] = fromPx(ev.clientX - rect.left, ev.clientY - rect.top)
      const points = curveRef.current.points.map((p, k) => {
        if (k !== idx) return p
        const others = { ...curveRef.current, points: curveRef.current.points.filter((_, j) => j !== idx) }
        return {
          ...p,
          x: Math.max(-xSpan, Math.min(xSpan, Math.round(x * 10) / 10)),
          g: Math.round((r - evalCurve(others, x)) * 100) / 100,
        }
      })
      commit(points)
    }
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up) }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }
  // keep a live ref for drag closure
  const curveRef = useRef(curve)
  curveRef.current = curve

  const removePoint = (idx) => {
    commit(curve.points.filter((_, k) => k !== idx))
    setSelected(-1)
  }

  const gridX = []
  for (let x = -Math.floor(xSpan / 5) * 5; x <= xSpan; x += 5) gridX.push(x)
  const sel = curve.points?.[selected]

  return (
    <div>
      <svg ref={svgRef} width={W} height={H} style={{ background: 'var(--bg)', borderRadius: 8, cursor: 'crosshair', maxWidth: '100%' }} onClick={onSvgClick}>
        {gridX.map((x) => {
          const [px] = toPx(x, 0)
          return <g key={x}>
            <line x1={px} y1={PAD} x2={px} y2={H - PAD} stroke="#232b3a" strokeDasharray={x === 0 ? '' : '2 4'} />
            <text x={px} y={H - PAD + 14} fill="#6b7687" fontSize="9" textAnchor="middle">{x}</text>
          </g>
        })}
        {[0.5, 0.7, 1.0, 1.5].map((r) => {
          const [, py] = toPx(0, r)
          return <g key={r}>
            <line x1={PAD} y1={py} x2={W - PAD} y2={py} stroke={r === 1 ? '#3d4859' : '#232b3a'} strokeDasharray={r === 1 ? '' : '2 4'} />
            <text x={PAD - 6} y={py + 3} fill="#6b7687" fontSize="9" textAnchor="end">{r.toFixed(1)}</text>
          </g>
        })}
        {/* Xmax markers */}
        {[-xmax, xmax].map((x) => {
          const [px] = toPx(x, 0)
          return <line key={x} x1={px} y1={PAD} x2={px} y2={H - PAD} stroke="#e66767" strokeDasharray="5 4" opacity="0.6" />
        })}
        <text x={toPx(xmax, 0)[0]} y={PAD - 4} fill="#e66767" fontSize="9" textAnchor="middle">Xmax</text>
        <path d={path} stroke="#3987e5" strokeWidth="2.5" fill="none" />
        {(curve.points || []).map((p, k) => {
          const [px, py] = toPx(p.x, evalCurve(curve, p.x))
          return (
            <circle
              key={k} data-pt={k} cx={px} cy={py} r={selected === k ? 8 : 6}
              fill={selected === k ? '#c98500' : '#9085e9'} stroke="var(--bg)" strokeWidth="2"
              style={{ cursor: 'grab' }}
              onPointerDown={(e) => onDragPoint(k, e)}
              onDoubleClick={(e) => { e.stopPropagation(); removePoint(k) }}
            />
          )
        })}
        <text x={W / 2} y={H - 8} fill="#6b7687" fontSize="10" textAnchor="middle">excursion (mm) — click curve to add a point, drag to shape, double-click to remove</text>
      </svg>
      {sel && (
        <div style={{ display: 'flex', gap: 14, alignItems: 'center', marginTop: 6, fontSize: 12 }}>
          <span>Point {selected + 1}:</span>
          <label>x <input type="number" step="0.5" value={sel.x} style={{ width: 64 }}
            onChange={(e) => { const v = parseFloat(e.target.value); if (isFinite(v)) commit(curve.points.map((p, k) => k === selected ? { ...p, x: v } : p)) }} /> mm</label>
          <label>gain <input type="number" step="0.05" value={sel.g} style={{ width: 64 }}
            onChange={(e) => { const v = parseFloat(e.target.value); if (isFinite(v)) commit(curve.points.map((p, k) => k === selected ? { ...p, g: v } : p)) }} /></label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>width
            <input type="range" min="1" max={Math.ceil(xmax * 1.5)} step="0.5" value={sel.w} style={{ width: 140 }}
              onChange={(e) => commit(curve.points.map((p, k) => k === selected ? { ...p, w: parseFloat(e.target.value) } : p))} />
            {sel.w} mm
          </label>
          <button className="danger" onClick={() => removePoint(selected)}>Delete point</button>
        </div>
      )}
    </div>
  )
}

export default function NLLab() {
  const nodes = useStore((s) => s.nodes)
  const setView = useStore((s) => s.setView)
  const updateParams = useStore((s) => s.updateParams)
  const results = useStore((s) => s.results)
  const drivers = nodes.filter((n) => n.type === 'driver')
  const [driverId, setDriverId] = useState(drivers[0]?.id || null)
  const [param, setParam] = useState('Bl')
  const fileRef = useRef(null)
  const driver = drivers.find((d) => d.id === driverId) || drivers[0]

  if (!driver) {
    return (
      <div style={{ padding: 30 }}>
        <h3>Nonlinear Lab</h3>
        <p style={{ color: 'var(--text-3)' }}>Add a Driver node to the circuit first.</p>
        <button onClick={() => setView('editor')}>← Back to editor</button>
      </div>
    )
  }
  const p = driver.data.params
  const nl = { ...defaultNL(), ...(p.nl || {}) }
  const xmax = p.Xmax || 10

  // peak excursion from last solve, for the "at current drive" readout
  const xPk = (() => {
    const arr = results?.excursionByDriver?.[driver.id]
    return arr && arr.length ? Math.max(...arr) : null
  })()
  const der = xPk != null ? derivedRatios(nl, Math.min(xPk, xmax * 1.5)) : null

  const importCSV = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const table = parseCurveCSV(reader.result)
        updateParams(driver.id, { nl: { ...nl, [param]: { points: [], table } } })
      } catch (err) { alert(`Import failed: ${err.message}`) }
    }
    reader.readAsText(file)
    e.target.value = ''
  }

  return (
    <div style={{ padding: '16px 24px', overflowY: 'auto', height: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10, flexWrap: 'wrap' }}>
        <button onClick={() => setView('editor')}>← Editor</button>
        <h3 style={{ margin: 0 }}>⚗ Nonlinear Lab <span style={{ fontSize: 11, color: 'var(--amber)' }}>EXPERIMENTAL</span></h3>
        <select value={driver.id} onChange={(e) => setDriverId(e.target.value)} style={{ width: 180 }}>
          {drivers.map((d) => <option key={d.id} value={d.id}>{d.data.params.label || d.id}</option>)}
        </select>
        <div style={{ display: 'flex', gap: 2 }}>
          {NL_PARAMS.map((k) => (
            <button key={k} className={param === k ? 'primary' : ''} onClick={() => setParam(k)}>{k}(x)</button>
          ))}
        </div>
        <button onClick={() => fileRef.current?.click()}>Import CSV…</button>
        <input ref={fileRef} type="file" accept=".csv,.txt" style={{ display: 'none' }} onChange={importCSV} />
        {nl[param].table && (
          <button className="danger" onClick={() => updateParams(driver.id, { nl: { ...nl, [param]: { ...nl[param], table: null } } })}>
            Clear imported table
          </button>
        )}
        <button onClick={() => updateParams(driver.id, { nl: { ...nl, [param]: { points: [], table: null } } })}>Reset {param}(x)</button>
      </div>
      <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginBottom: 8, maxWidth: 760 }}>
        {PARAM_INFO[param].hint} Y axis: {PARAM_INFO[param].unit}. A flat line at 1.0 reproduces the linear engine exactly.
        {nl[param].table && <b> Imported table active as baseline; EQ points deform it.</b>}
      </div>
      <CurveEditor key={driver.id + param} driverId={driver.id} param={param} nl={nl} xmax={xmax} />
      <div className="panel-section" style={{ maxWidth: 760, marginTop: 14 }}>
        <h4>Derived at current drive level</h4>
        {der ? (
          <div style={{ display: 'flex', gap: 22, fontSize: 12, flexWrap: 'wrap' }}>
            <span>X̂ ≈ <b>{xPk.toFixed(1)} mm</b></span>
            <span>Bl → <b>{(der.Bl * 100).toFixed(0)}%</b></span>
            <span>Cms → <b>{(der.Cms * 100).toFixed(0)}%</b></span>
            <span>Le → <b>{(der.Le * 100).toFixed(0)}%</b></span>
            <span>Fs → <b>{(der.Fs * 100).toFixed(0)}%</b> ({(p.Fs * der.Fs).toFixed(1)} Hz)</span>
            <span>Qes → <b>{(der.Qes * 100).toFixed(0)}%</b></span>
            <span>Vas → <b>{(der.Vas * 100).toFixed(0)}%</b></span>
          </div>
        ) : <span style={{ color: 'var(--text-3)', fontSize: 12 }}>Run a simulation to see effective large-signal parameters.</span>}
        <div style={{ fontSize: 10.5, color: 'var(--text-3)', marginTop: 6 }}>
          Fs, Qes and Vas are derived from Bl(x) and Cms(x) — they are consequences, not independent inputs.
          The solver applies cycle-averaged ratios per frequency and iterates (quasi-linear method): it models
          compression and resonance drift, not harmonic distortion.
        </div>
      </div>
    </div>
  )
}
