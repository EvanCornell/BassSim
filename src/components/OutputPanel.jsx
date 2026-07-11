import React, { useEffect, useMemo, useState, useCallback, useRef } from 'react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ReferenceLine, ResponsiveContainer, ReferenceArea,
} from 'recharts'
import { useStore } from '../store'
import { waveguideVolume } from '../engine/geometry'

const SERIES = ['#3987e5', '#199e70', '#c98500', '#9085e9', '#d55181', '#d95926']
const GRID = '#2d3646'
const TICKS = [10, 15, 20, 30, 40, 50, 70, 100, 150, 200, 300, 500, 700, 1000, 1500, 2000]

const fmt = (v, d = 1) => (v == null || !isFinite(v) ? '—' : v.toFixed(d))

function BaseChart({ chartId, data, lines, yLabel, yDomain, y2Label, y2Domain, refLines = [], refAreas = [], children }) {
  const settings = useStore((s) => s.settings)
  const xZoom = useStore((s) => s.xZoom[chartId])
  const setXZoom = useStore((s) => s.setXZoom)
  const [dragL, setDragL] = useState(null)
  const [dragR, setDragR] = useState(null)
  const wrapRef = useRef(null)
  const lastLabel = useRef(null) // exact data-x under cursor, from recharts
  const stateRef = useRef({})
  const xDomain = xZoom || [settings.fmin, settings.fmax]

  // numeric Y bounds for zoom math: resolved Fit/Manual domain, or data extent
  const yBounds = useMemo(() => {
    if (Array.isArray(yDomain) && isFinite(yDomain[0]) && isFinite(yDomain[1])) return yDomain
    let lo = Infinity, hi = -Infinity
    const keys = lines.filter((l) => (l.yAxisId || 'left') === 'left').map((l) => l.dataKey)
    for (const r of data) for (const k of keys) {
      const val = r[k]
      if (val != null && isFinite(val)) { if (val < lo) lo = val; if (val > hi) hi = val }
    }
    return isFinite(lo) && hi > lo ? [lo, hi] : [0, 1]
  }, [yDomain, data, lines])
  stateRef.current = { xDomain, chartId, full: [settings.fmin, settings.fmax], yBounds }

  const setManualY = (lo, hi) => {
    const st = useStore.getState()
    const cur = st.settings.yScales || {}
    const r4 = (v) => Number(v.toPrecision(4))
    st.updateSettings({ yScales: { ...cur, [chartId]: { mode: 'manual', min: r4(lo), max: r4(hi) } } })
  }
  const resetAll = () => {
    const st = useStore.getState()
    st.setXZoom(chartId, null)
    const cur = st.settings.yScales || {}
    st.updateSettings({ yScales: { ...cur, [chartId]: { mode: 'fit', min: '', max: '' } } })
  }

  // wheel = cursor-centered zoom of BOTH axes (log-x, linear-y); the Y-scale
  // control flips to Manual with the zoomed bounds. shift/middle-drag = pan.
  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const fracs = (clientX, clientY) => {
      const rect = el.getBoundingClientRect()
      const left = 52, right = 30, top = 10, bottom = 48
      return [
        Math.min(Math.max((clientX - rect.left - left) / (rect.width - left - right), 0), 1),
        Math.min(Math.max(1 - (clientY - rect.top - top) / (rect.height - top - bottom), 0), 1),
      ]
    }
    const onWheel = (e) => {
      e.preventDefault()
      const { xDomain: [x0, x1], full, yBounds: [y0, y1] } = stateRef.current
      const [fx, fy] = fracs(e.clientX, e.clientY)
      const factor = Math.pow(1.18, e.deltaY / 100)
      // X in log space, centred on the exact data point when we have it
      const l0 = Math.log(x0), l1 = Math.log(x1)
      const lc = lastLabel.current != null && lastLabel.current >= x0 && lastLabel.current <= x1
        ? Math.log(lastLabel.current)
        : l0 + fx * (l1 - l0)
      let n0 = lc - (lc - l0) * factor
      let n1 = lc + (l1 - lc) * factor
      const f0 = Math.log(Math.max(full[0], 1)), f1 = Math.log(full[1])
      n0 = Math.max(n0, f0)
      n1 = Math.min(n1, f1)
      if (n1 - n0 < Math.log(1.15)) return
      const isFull = n0 - f0 < 1e-6 && f1 - n1 < 1e-6
      if (isFull) { resetAll(); return }
      useStore.getState().setXZoom(stateRef.current.chartId, [Math.exp(n0), Math.exp(n1)])
      // Y linear, centred on cursor height → Manual mode
      const cy = y0 + fy * (y1 - y0)
      const ny0 = cy - (cy - y0) * factor
      const ny1 = cy + (y1 - cy) * factor
      if (ny1 - ny0 > 1e-9) setManualY(ny0, ny1)
    }
    const onPointerDown = (e) => {
      if (!(e.shiftKey || e.button === 1)) return
      e.preventDefault()
      e.stopPropagation() // keep recharts from starting a drag-select
      const start = { px: e.clientX, py: e.clientY, dom: [...stateRef.current.xDomain], yb: [...stateRef.current.yBounds] }
      const rect = el.getBoundingClientRect()
      const innerW = rect.width - 82
      const innerH = rect.height - 58
      const move = (ev) => {
        const [x0, x1] = start.dom
        const { full } = stateRef.current
        const l0 = Math.log(x0), l1 = Math.log(x1)
        const f0 = Math.log(Math.max(full[0], 1)), f1 = Math.log(full[1])
        let d = (-(ev.clientX - start.px) / innerW) * (l1 - l0)
        d = Math.max(f0 - l0, Math.min(f1 - l1, d)) // keep the window inside the sweep
        useStore.getState().setXZoom(stateRef.current.chartId, [Math.exp(l0 + d), Math.exp(l1 + d)])
        const [y0, y1] = start.yb
        const dy = ((ev.clientY - start.py) / innerH) * (y1 - y0)
        setManualY(y0 + dy, y1 + dy)
      }
      const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up) }
      window.addEventListener('pointermove', move)
      window.addEventListener('pointerup', up)
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    el.addEventListener('pointerdown', onPointerDown, { capture: true })
    return () => {
      el.removeEventListener('wheel', onWheel)
      el.removeEventListener('pointerdown', onPointerDown, { capture: true })
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  const ticks = useMemo(() => {
    const t = TICKS.filter((v) => v >= xDomain[0] && v <= xDomain[1])
    return t.length >= 3 ? t : undefined // very narrow zoom: let recharts pick
  }, [xDomain[0], xDomain[1]])
  const hasY2 = lines.some((l) => l.yAxisId === 'right')
  const commitZoom = () => {
    if (dragL != null && dragR != null) {
      const a = Math.min(dragL, dragR)
      const b = Math.max(dragL, dragR)
      if (b / a > 1.05) setXZoom(chartId, [a, b])
    }
    setDragL(null)
    setDragR(null)
  }
  return (
    <div ref={wrapRef} style={{ width: '100%', height: '100%' }}>
    {xZoom && (
      <button
        style={{ position: 'absolute', bottom: 10, left: 14, zIndex: 5, fontSize: 11 }}
        title="Reset zoom (or double-click the chart). Wheel = zoom both axes, shift+drag = pan."
        onClick={resetAll}
      >⟲ {fmt(xZoom[0], 0)}–{fmt(xZoom[1], 0)} Hz</button>
    )}
    <ResponsiveContainer width="100%" height="100%">
      <LineChart
        data={data} margin={{ top: 8, right: hasY2 ? 8 : 20, bottom: 4, left: 0 }}
        onMouseDown={(e) => { if (e && e.activeLabel != null) setDragL(e.activeLabel) }}
        onMouseMove={(e) => { if (e && e.activeLabel != null) { lastLabel.current = e.activeLabel; if (dragL != null) setDragR(e.activeLabel) } }}
        onMouseUp={commitZoom}
        onMouseLeave={() => { setDragL(null); setDragR(null) }}
        onDoubleClick={resetAll}
        style={{ userSelect: 'none' }}
      >
        <CartesianGrid stroke={GRID} strokeDasharray="2 4" />
        <XAxis
          dataKey="f" type="number" scale="log" allowDataOverflow
          domain={xDomain}
          ticks={ticks} tick={{ fill: '#9aa7b8', fontSize: 10 }}
          stroke={GRID} tickFormatter={(v) => (v >= 1000 ? `${v / 1000}k` : Math.round(v * 10) / 10)}
        />
        <YAxis
          yAxisId="left" domain={yDomain || ['auto', 'auto']} allowDataOverflow
          tick={{ fill: '#9aa7b8', fontSize: 10 }} stroke={GRID} width={44}
          label={yLabel ? { value: yLabel, angle: -90, position: 'insideLeft', fill: '#6b7687', fontSize: 10 } : undefined}
        />
        {hasY2 && (
          <YAxis
            yAxisId="right" orientation="right" domain={y2Domain || ['auto', 'auto']}
            tick={{ fill: '#9aa7b8', fontSize: 10 }} stroke={GRID} width={44}
            label={y2Label ? { value: y2Label, angle: 90, position: 'insideRight', fill: '#6b7687', fontSize: 10 } : undefined}
          />
        )}
        <Tooltip
          contentStyle={{ background: '#161b22', border: '1px solid #2d3646', borderRadius: 6 }}
          labelStyle={{ color: '#e6edf3' }}
          labelFormatter={(v) => `${fmt(v)} Hz`}
          formatter={(v) => fmt(v, 2)}
          isAnimationActive={false}
        />
        <Legend wrapperStyle={{ fontSize: 11 }} />
        {refAreas}
        {lines.map((l) => (
          <Line
            key={l.dataKey} yAxisId={l.yAxisId || 'left'}
            type="monotone" dataKey={l.dataKey} name={l.name}
            stroke={l.color} strokeWidth={l.width || 2}
            strokeDasharray={l.dash} dot={false} isAnimationActive={false}
            connectNulls={false}
          />
        ))}
        {refLines}
        {dragL != null && dragR != null && (
          <ReferenceArea yAxisId="left" x1={dragL} x2={dragR} fill="#3987e5" fillOpacity={0.15} />
        )}
        {children}
      </LineChart>
    </ResponsiveContainer>
    </div>
  )
}

// Visible-window data for Y "Fit" mode: when zoomed, fit to what's on screen
function useFitData(chartId, data) {
  const z = useStore((s) => s.xZoom[chartId])
  return useMemo(() => (z ? data.filter((r) => r.f >= z[0] && r.f <= z[1]) : data), [data, z])
}

// Per-chart Y-scale control: Fit (computed useful range), Full (recharts
// auto = entire data range), or Manual min/max. Persisted in settings so it
// survives tab switches and project save/load.
function useYScale(id, fitDomain) {
  const ys = useStore((s) => s.settings.yScales?.[id]) || { mode: 'fit', min: '', max: '' }
  const updateSettings = useStore((s) => s.updateSettings)
  const setYs = (patch) => {
    const cur = useStore.getState().settings.yScales || {}
    updateSettings({ yScales: { ...cur, [id]: { ...ys, ...patch } } })
  }
  let domain = ['auto', 'auto']
  if (ys.mode === 'fit' && fitDomain) domain = fitDomain
  else if (ys.mode === 'manual' && ys.min !== '' && ys.max !== '') {
    const lo = parseFloat(ys.min); const hi = parseFloat(ys.max)
    if (isFinite(lo) && isFinite(hi) && hi > lo) domain = [lo, hi]
  }
  const control = (
    <label title="Y-axis scale: Fit = zoom to the useful range, Full = entire data range, Manual = your own bounds">
      Y
      <select value={ys.mode} onChange={(e) => setYs({ mode: e.target.value })} style={{ width: 68 }}>
        <option value="fit">Fit</option>
        <option value="auto">Full</option>
        <option value="manual">Manual</option>
      </select>
      {ys.mode === 'manual' && (
        <>
          <input type="number" placeholder="min" value={ys.min} onChange={(e) => setYs({ min: e.target.value })} />
          –
          <input type="number" placeholder="max" value={ys.max} onChange={(e) => setYs({ max: e.target.value })} />
        </>
      )}
    </label>
  )
  return [domain, control]
}

// Fit helpers. dB-type curves: window below the peak (deep nulls excluded);
// linear curves: zero to padded max.
const round5 = (v, up) => (up ? Math.ceil(v / 5) * 5 : Math.floor(v / 5) * 5)
function fitDb(rows, keys, windowDb = 45) {
  let peak = -Infinity
  for (const r of rows) for (const k of keys) { const v = r[k]; if (v != null && v > peak) peak = v }
  if (!isFinite(peak)) return null
  return [round5(peak - windowDb, false), round5(peak + 4, true)]
}
function fitLinear(rows, keys, floor = 0, atLeast = 0) {
  let hi = -Infinity
  for (const r of rows) for (const k of keys) { const v = r[k]; if (v != null && v > hi) hi = v }
  if (!isFinite(hi)) return null
  return [floor, Math.max(hi * 1.08, atLeast)]
}

// merge results into recharts row objects
function useChartData(keys) {
  const results = useStore((s) => s.results)
  const snapshots = useStore((s) => s.snapshots)
  return useMemo(() => {
    if (!results || !results.ok) return { data: [], portIds: [] }
    const n = results.freqs.length
    const portIds = Object.keys(results.splPorts || {})
    const rows = new Array(n)
    for (let i = 0; i < n; i++) {
      const row = { f: results.freqs[i] }
      if (keys.includes('spl')) {
        row.combined = results.splCombined[i]
        row.driver = results.splDriver[i]
        portIds.forEach((pid, k) => { row[`port_${pid}`] = results.splPorts[pid][i] })
      }
      if (keys.includes('zin')) { row.zmag = results.zinMag[i]; row.zphase = results.zinPhase[i] }
      if (keys.includes('exc')) row.exc = results.excursion[i]
      if (keys.includes('vel')) {
        for (const [wid, arr] of Object.entries(results.velocity || {})) row[`vel_${wid}`] = arr[i]
      }
      if (keys.includes('int')) {
        for (const [cid, arr] of Object.entries(results.splInterior || {})) row[`int_${cid}`] = arr[i]
      }
      if (keys.includes('pow')) row.pow = results.power[i] > 0 ? 10 * Math.log10(results.power[i]) : null
      if (keys.includes('pe')) { row.peW = results.peReal?.[i]; row.peVA = results.peApparent?.[i] }
      if (keys.includes('eff')) {
        const pe = results.peReal?.[i]
        row.eff = pe > 1e-9 && results.power[i] >= 0 ? (results.power[i] / pe) * 100 : null
      }
      if (keys.includes('ph')) { row.phase = results.phase[i]; row.phaseU = results.phaseUnwrapped[i]; row.gd = results.groupDelay[i] }
      rows[i] = row
    }
    // snapshots: interpolate onto same freq grid indices (grids match if range unchanged)
    snapshots.forEach((s, si) => {
      const map = { spl: 'splCombined', zin: 'zinMag', exc: 'excursion', pow: 'power', ph: 'groupDelay' }
      for (const key of keys) {
        const src = s[map[key]]
        if (!src) continue
        for (let i = 0; i < n; i++) {
          // nearest-index lookup against snapshot's own freq array
          const f = results.freqs[i]
          const idx = nearestIdx(s.freqs, f)
          let v = src[idx]
          if (key === 'pow') v = v > 0 ? 10 * Math.log10(v) : null
          rows[i][`snap${si}_${key}`] = v
        }
      }
    })
    return { data: rows, portIds }
  }, [results, snapshots, keys.join()])
}

function nearestIdx(arr, f) {
  let lo = 0, hi = arr.length - 1
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1
    if (arr[mid] < f) lo = mid; else hi = mid
  }
  return Math.abs(arr[lo] - f) < Math.abs(arr[hi] - f) ? lo : hi
}

function snapLines(snapshots, key) {
  return snapshots.map((s, si) => ({
    dataKey: `snap${si}_${key}`, name: `⧉ ${s.label}`, color: s.color, width: 1.5, dash: '6 3',
  }))
}

function SPLTab() {
  const { data, portIds } = useChartData(['spl'])
  const nodes = useStore((s) => s.nodes)
  const snapshots = useStore((s) => s.snapshots)
  const [show, setShow] = useState({ driver: true, ports: true, combined: true })
  const lines = []
  if (show.combined) lines.push({ dataKey: 'combined', name: 'Combined', color: SERIES[0], width: 2.5 })
  if (show.driver) lines.push({ dataKey: 'driver', name: 'Driver direct', color: SERIES[1] })
  if (show.ports) portIds.forEach((pid, i) => {
    const n = nodes.find((nn) => nn.id === pid)
    lines.push({ dataKey: `port_${pid}`, name: n?.data.params.label || 'Port', color: SERIES[(i + 2) % SERIES.length] })
  })
  lines.push(...snapLines(snapshots, 'spl'))
  const fitData = useFitData('spl', data)
  const [yDomain, yControl] = useYScale('spl', fitDb(fitData, lines.map((l) => l.dataKey)))
  return (
    <>
      <div className="plot-controls">
        {['combined', 'driver', 'ports'].map((k) => (
          <label key={k}><input type="checkbox" checked={show[k]} onChange={(e) => setShow({ ...show, [k]: e.target.checked })} />{k}</label>
        ))}
        {yControl}
      </div>
      <BaseChart chartId="spl" data={data} lines={lines} yLabel="SPL dB @ 1m" yDomain={yDomain} />
    </>
  )
}

function ImpedanceTab() {
  const { data } = useChartData(['zin'])
  const snapshots = useStore((s) => s.snapshots)
  const metrics = useStore((s) => s.metrics)
  const lines = [
    { dataKey: 'zmag', name: '|Z| Ω', color: SERIES[0], width: 2.5 },
    { dataKey: 'zphase', name: 'Phase °', color: SERIES[2], yAxisId: 'right' },
    ...snapLines(snapshots, 'zin'),
  ]
  const refLines = (metrics?.zPeaks || []).map((p, i) => (
    <ReferenceLine key={i} yAxisId="left" x={p.f} stroke="#6b7687" strokeDasharray="3 3"
      label={{ value: `F${i + 1} ${p.f.toFixed(1)}`, fill: '#9aa7b8', fontSize: 10, position: 'insideTopLeft' }} />
  ))
  const fitData = useFitData('zin', data)
  const [yDomain, yControl] = useYScale('zin', fitLinear(fitData, ['zmag', ...snapshots.map((_, i) => `snap${i}_zin`)]))
  return (
    <>
      <div className="plot-controls">{yControl}</div>
      <BaseChart chartId="zin" data={data} lines={lines} yLabel="|Z| Ω" yDomain={yDomain} y2Label="Phase °" y2Domain={[-90, 90]} refLines={refLines} />
    </>
  )
}

function ExcursionTab() {
  const { data } = useChartData(['exc'])
  const snapshots = useStore((s) => s.snapshots)
  const driver = useStore((s) => s.nodes.find((n) => n.type === 'driver'))
  const xmax = driver?.data.params.Xmax
  const lines = [{ dataKey: 'exc', name: 'Excursion mm (peak)', color: SERIES[0], width: 2.5 }, ...snapLines(snapshots, 'exc')]
  const refLines = xmax ? [
    <ReferenceLine key="xmax" yAxisId="left" y={xmax} stroke="#e66767" strokeDasharray="6 4"
      label={{ value: `Xmax ${xmax} mm`, fill: '#e66767', fontSize: 10, position: 'insideTopRight' }} />,
  ] : []
  const refAreas = xmax ? [
    <ReferenceArea key="over" yAxisId="left" y1={xmax} y2={xmax * 3} fill="#e66767" fillOpacity={0.07} />,
  ] : []
  const fitData = useFitData('exc', data)
  const [yDomain, yControl] = useYScale('exc', fitLinear(fitData, ['exc'], 0, xmax ? xmax * 1.25 : 0))
  return (
    <>
      <div className="plot-controls">{yControl}</div>
      <BaseChart chartId="exc" data={data} lines={lines} yLabel="mm" yDomain={yDomain} refLines={refLines} refAreas={refAreas} />
    </>
  )
}

function VelocityTab() {
  const { data } = useChartData(['vel'])
  const nodes = useStore((s) => s.nodes)
  const results = useStore((s) => s.results)
  const vThreshold = useStore((s) => s.settings.vThreshold)
  const updateSettings = useStore((s) => s.updateSettings)
  const wgs = Object.keys(results?.velocity || {})
  const lines = wgs.map((wid, i) => {
    const n = nodes.find((nn) => nn.id === wid)
    return { dataKey: `vel_${wid}`, name: n?.data.params.label || 'Waveguide', color: SERIES[i % SERIES.length] }
  })
  const fitData = useFitData('vel', data)
  const [yDomain, yControl] = useYScale('vel', fitLinear(fitData, lines.map((l) => l.dataKey), 0, vThreshold * 1.25))
  return (
    <>
      <div className="plot-controls">
        <label title="Approximate turbulence (chuffing) onset velocity">Threshold
          <input type="number" value={vThreshold} onChange={(e) => { const v = parseFloat(e.target.value); if (v > 0) updateSettings({ vThreshold: v }) }} /> m/s
        </label>
        {yControl}
      </div>
      <BaseChart chartId="vel" data={data} lines={lines} yLabel="m/s (peak)" yDomain={yDomain} refLines={[
        <ReferenceLine key="th" yAxisId="left" y={vThreshold} stroke="#e66767" strokeDasharray="6 4"
          label={{ value: `turbulence ~${vThreshold} m/s`, fill: '#e66767', fontSize: 10, position: 'insideTopRight' }} />,
      ]} />
    </>
  )
}

function InteriorTab() {
  const { data } = useChartData(['int'])
  const nodes = useStore((s) => s.nodes)
  const results = useStore((s) => s.results)
  const chambers = Object.keys(results?.splInterior || {})
  const lines = chambers.map((cid, i) => {
    const n = nodes.find((nn) => nn.id === cid)
    return { dataKey: `int_${cid}`, name: n?.data.params.label || 'Chamber', color: SERIES[i % SERIES.length] }
  })
  const fitData = useFitData('int', data)
  const [yDomain, yControl] = useYScale('int', fitDb(fitData, lines.map((l) => l.dataKey)))
  if (!chambers.length) {
    return (
      <div style={{ padding: '24px 16px', color: 'var(--text-3)', fontSize: 12.5, lineHeight: 1.6 }}>
        No interior probes active. Select a Chamber node and enable
        <b> “SPL probe (mic inside)”</b> to plot the sound pressure level inside
        that volume — e.g. at the listening position in a car cabin. The probe
        is a virtual microphone: it never changes the simulation itself.
      </div>
    )
  }
  return (
    <>
      <div className="plot-controls">
        <span style={{ fontSize: 11, color: 'var(--text-3)' }}>
          dB SPL inside the volume (no 1 m convention — point pressure at the mic station)
        </span>
        {yControl}
      </div>
      <BaseChart chartId="int" data={data} lines={lines} yLabel="dB SPL (interior)" yDomain={yDomain} />
    </>
  )
}

function PowerTab() {
  const { data } = useChartData(['pow'])
  const snapshots = useStore((s) => s.snapshots)
  const lines = [{ dataKey: 'pow', name: 'Radiated power dBW', color: SERIES[0], width: 2.5 }, ...snapLines(snapshots, 'pow')]
  const fitData = useFitData('pow', data)
  const [yDomain, yControl] = useYScale('pow', fitDb(fitData, lines.map((l) => l.dataKey)))
  return (
    <>
      <div className="plot-controls">{yControl}</div>
      <BaseChart chartId="pow" data={data} lines={lines} yLabel="dBW" yDomain={yDomain} />
    </>
  )
}

function EfficiencyTab() {
  const { data } = useChartData(['eff'])
  const lines = [{ dataKey: 'eff', name: 'Efficiency %', color: SERIES[1], width: 2.5 }]
  const fitData = useFitData('eff', data)
  const [yDomain, yControl] = useYScale('eff', fitLinear(fitData, ['eff']))
  return (
    <>
      <div className="plot-controls">{yControl}</div>
      <BaseChart chartId="eff" data={data} lines={lines} yLabel="acoustic / electrical %" yDomain={yDomain} />
    </>
  )
}

function ElecPowerTab() {
  const { data } = useChartData(['pe'])
  const lines = [
    { dataKey: 'peVA', name: 'Apparent (VA) — amp must source', color: SERIES[2], width: 2 },
    { dataKey: 'peW', name: 'Real (W) — dissipated + converted', color: SERIES[0], width: 2.5 },
  ]
  const fitData = useFitData('pe', data)
  const [yDomain, yControl] = useYScale('pe', fitLinear(fitData, ['peW', 'peVA']))
  return (
    <>
      <div className="plot-controls">{yControl}</div>
      <BaseChart chartId="pe" data={data} lines={lines} yLabel="W / VA" yDomain={yDomain} />
    </>
  )
}

function PhaseTab() {
  const { data } = useChartData(['ph'])
  const settings = useStore((s) => s.settings)
  const updateSettings = useStore((s) => s.updateSettings)
  const off = settings.delayOffset || 0
  const adj = useMemo(() => data.map((r) => ({
    ...r,
    gdAdj: r.gd != null ? r.gd - off : null,
    phaseSel: settings.unwrapPhase ? r.phaseU : r.phase,
  })), [data, off, settings.unwrapPhase])
  const lines = [
    { dataKey: 'phaseSel', name: 'Phase °', color: SERIES[0], width: 2 },
    { dataKey: 'gdAdj', name: 'Group delay ms', color: SERIES[2], yAxisId: 'right', width: 2 },
  ]
  const [yDomain, yControl] = useYScale('ph', null)
  return (
    <>
      <div className="plot-controls">
        <label><input type="checkbox" checked={settings.unwrapPhase} onChange={(e) => updateSettings({ unwrapPhase: e.target.checked })} />unwrap</label>
        <label>Delay offset <input type="number" step="0.5" value={off} onChange={(e) => { const v = parseFloat(e.target.value); if (!Number.isNaN(v)) updateSettings({ delayOffset: v }) }} /> ms</label>
        {yControl}
      </div>
      <BaseChart chartId="ph" data={adj} lines={lines} yLabel="deg" yDomain={yDomain} y2Label="ms" />
    </>
  )
}

function SimErrorBanner() {
  const simError = useStore((s) => s.simError)
  if (!simError) return null
  return (
    <div style={{
      background: '#3a1518', color: '#ff8a80', border: '1px solid #6e2228',
      borderRadius: 6, padding: '6px 12px', margin: '6px 10px 0', fontSize: 12,
    }}>
      ⚠ {simError}
    </div>
  )
}

function MetricsStrip() {
  const metrics = useStore((s) => s.metrics)
  const results = useStore((s) => s.results)
  const nodes = useStore((s) => s.nodes)
  const driver = nodes.find((n) => n.type === 'driver')
  const xmax = driver?.data.params.Xmax
  // total internal air volume: chambers + waveguide segments
  let sysVol = 0
  for (const n of nodes) {
    const p = n.data.params
    if (n.type === 'chamber') sysVol += p.volume || 0
    else if (n.type === 'waveguide') sysVol += waveguideVolume(p.flare, p.S1 * 1e-4, p.S2 * 1e-4, p.length / 100) * 1000
  }
  const m = metrics || {}
  const M = ({ label, value, bad }) => (
    <div className="metric"><span className="m-label">{label}</span><span className={`m-value ${bad ? 'bad' : ''}`}>{value}</span></div>
  )
  const frac = (x) => (x != null && xmax ? `${(x / xmax * 100).toFixed(0)}%` : '—')
  return (
    <div className="metrics-strip">
      <M label="F3" value={m.f3 ? `${fmt(m.f3)} Hz` : '—'} />
      <M label="F10" value={m.f10 ? `${fmt(m.f10)} Hz` : '—'} />
      <M label="Fb" value={m.fb ? `${fmt(m.fb)} Hz` : '—'} />
      <M label="Qtc" value={m.qtc ? fmt(m.qtc, 2) : '—'} />
      <M label="Z peaks" value={(m.zPeaks || []).slice(0, 3).map((p) => `${p.f.toFixed(0)}Hz/${p.v.toFixed(0)}Ω`).join('  ') || '—'} />
      <M label="Peak SPL" value={m.peakSPL ? `${fmt(m.peakSPL)} dB` : '—'} />
      <M label="X @ Fb" value={frac(m.xAtFb)} bad={m.xAtFb != null && xmax && m.xAtFb > xmax} />
      <M label="X @ F3" value={frac(m.xAtF3)} bad={m.xAtF3 != null && xmax && m.xAtF3 > xmax} />
      <M label="BW (−3 dB)" value={m.bwHz ? `${fmt(m.bwHz, 0)} Hz / ${fmt(m.bwOct, 1)} oct` : '—'} />
      <M label="Max power (Xmax)" value={m.maxPower ? `${fmt(m.maxPower, 0)} W @ ${fmt(m.vMax, 1)} V` : '—'} />
      <M label="System volume" value={sysVol > 0 ? `${sysVol >= 100 ? sysVol.toFixed(0) : sysVol.toFixed(1)} L` : '—'} />
      {results?.elapsedMs != null && <M label="Solve" value={`${results.elapsedMs.toFixed(0)} ms`} />}
    </div>
  )
}

const TABS = [
  ['spl', 'SPL Response', SPLTab],
  ['zin', 'Impedance', ImpedanceTab],
  ['exc', 'Cone Excursion', ExcursionTab],
  ['vel', 'Port Velocity', VelocityTab],
  ['int', 'Interior SPL', InteriorTab],
  ['pow', 'Acoustic Power', PowerTab],
  ['eff', 'Efficiency', EfficiencyTab],
  ['pe', 'Elec. Power', ElecPowerTab],
  ['ph', 'Phase & Group Delay', PhaseTab],
]

export default function OutputPanel() {
  const [tab, setTab] = useState('spl')
  const [height, setHeight] = useState(300)
  const [collapsed, setCollapsed] = useState(false)
  const dragRef = useRef(null)

  const onDragStart = useCallback((e) => {
    const startY = e.clientY
    const startH = height
    const onMove = (ev) => setHeight(Math.max(120, Math.min(window.innerHeight - 200, startH + (startY - ev.clientY))))
    const onUp = () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }, [height])

  const ActiveTab = TABS.find(([k]) => k === tab)?.[2]
  return (
    <div className="bottom-panel" style={{ height: collapsed ? 'auto' : height + 70 }}>
      <div className="bp-resize" ref={dragRef} onMouseDown={onDragStart} />
      <SimErrorBanner />
      <MetricsStrip />
      <div className="plot-tabs">
        {TABS.map(([k, name]) => (
          <button key={k} className={`plot-tab ${tab === k && !collapsed ? 'active' : ''}`}
            onClick={() => { setTab(k); setCollapsed(false) }}>{name}</button>
        ))}
        <button className="plot-tab" style={{ marginLeft: 'auto' }} onClick={() => setCollapsed(!collapsed)}>
          {collapsed ? '▲ expand' : '▼ collapse'}
        </button>
      </div>
      {!collapsed && ActiveTab && (
        <div className="plot-area" id="plot-area">
          <ActiveTab />
        </div>
      )}
    </div>
  )
}
