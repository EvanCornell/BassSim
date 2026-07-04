import React, { useMemo, useState, useCallback, useRef } from 'react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ReferenceLine, ResponsiveContainer, ReferenceArea,
} from 'recharts'
import { useStore } from '../store'

const SERIES = ['#3987e5', '#199e70', '#c98500', '#9085e9', '#d55181', '#d95926']
const GRID = '#2d3646'
const TICKS = [10, 20, 30, 50, 100, 200, 300, 500, 1000, 2000]

const fmt = (v, d = 1) => (v == null || !isFinite(v) ? '—' : v.toFixed(d))

function useLogTicks(fmin, fmax) {
  return useMemo(() => TICKS.filter((t) => t >= fmin && t <= fmax), [fmin, fmax])
}

function BaseChart({ data, lines, yLabel, yDomain, y2Label, y2Domain, refLines = [], refAreas = [], children }) {
  const settings = useStore((s) => s.settings)
  const ticks = useLogTicks(settings.fmin, settings.fmax)
  const hasY2 = lines.some((l) => l.yAxisId === 'right')
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data} margin={{ top: 8, right: hasY2 ? 8 : 20, bottom: 4, left: 0 }}>
        <CartesianGrid stroke={GRID} strokeDasharray="2 4" />
        <XAxis
          dataKey="f" type="number" scale="log"
          domain={[settings.fmin, settings.fmax]}
          ticks={ticks} tick={{ fill: '#9aa7b8', fontSize: 10 }}
          stroke={GRID} tickFormatter={(v) => (v >= 1000 ? `${v / 1000}k` : v)}
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
        {children}
      </LineChart>
    </ResponsiveContainer>
  )
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
      if (keys.includes('pow')) row.pow = results.power[i] > 0 ? 10 * Math.log10(results.power[i]) : null
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
  const [yDomain, yControl] = useYScale('spl', fitDb(data, lines.map((l) => l.dataKey)))
  return (
    <>
      <div className="plot-controls">
        {['combined', 'driver', 'ports'].map((k) => (
          <label key={k}><input type="checkbox" checked={show[k]} onChange={(e) => setShow({ ...show, [k]: e.target.checked })} />{k}</label>
        ))}
        {yControl}
      </div>
      <BaseChart data={data} lines={lines} yLabel="SPL dB @ 1m" yDomain={yDomain} />
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
  const [yDomain, yControl] = useYScale('zin', fitLinear(data, ['zmag', ...snapshots.map((_, i) => `snap${i}_zin`)]))
  return (
    <>
      <div className="plot-controls">{yControl}</div>
      <BaseChart data={data} lines={lines} yLabel="|Z| Ω" yDomain={yDomain} y2Label="Phase °" y2Domain={[-90, 90]} refLines={refLines} />
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
  const [yDomain, yControl] = useYScale('exc', fitLinear(data, ['exc'], 0, xmax ? xmax * 1.25 : 0))
  return (
    <>
      <div className="plot-controls">{yControl}</div>
      <BaseChart data={data} lines={lines} yLabel="mm" yDomain={yDomain} refLines={refLines} refAreas={refAreas} />
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
  const [yDomain, yControl] = useYScale('vel', fitLinear(data, lines.map((l) => l.dataKey), 0, vThreshold * 1.25))
  return (
    <>
      <div className="plot-controls">
        <label title="Approximate turbulence (chuffing) onset velocity">Threshold
          <input type="number" value={vThreshold} onChange={(e) => { const v = parseFloat(e.target.value); if (v > 0) updateSettings({ vThreshold: v }) }} /> m/s
        </label>
        {yControl}
      </div>
      <BaseChart data={data} lines={lines} yLabel="m/s (peak)" yDomain={yDomain} refLines={[
        <ReferenceLine key="th" yAxisId="left" y={vThreshold} stroke="#e66767" strokeDasharray="6 4"
          label={{ value: `turbulence ~${vThreshold} m/s`, fill: '#e66767', fontSize: 10, position: 'insideTopRight' }} />,
      ]} />
    </>
  )
}

function PowerTab() {
  const { data } = useChartData(['pow'])
  const snapshots = useStore((s) => s.snapshots)
  const lines = [{ dataKey: 'pow', name: 'Radiated power dBW', color: SERIES[0], width: 2.5 }, ...snapLines(snapshots, 'pow')]
  const [yDomain, yControl] = useYScale('pow', fitDb(data, lines.map((l) => l.dataKey)))
  return (
    <>
      <div className="plot-controls">{yControl}</div>
      <BaseChart data={data} lines={lines} yLabel="dBW" yDomain={yDomain} />
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
      <BaseChart data={adj} lines={lines} yLabel="deg" yDomain={yDomain} y2Label="ms" />
    </>
  )
}

function MetricsStrip() {
  const metrics = useStore((s) => s.metrics)
  const results = useStore((s) => s.results)
  const driver = useStore((s) => s.nodes.find((n) => n.type === 'driver'))
  const xmax = driver?.data.params.Xmax
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
      {results?.elapsedMs != null && <M label="Solve" value={`${results.elapsedMs.toFixed(0)} ms`} />}
    </div>
  )
}

const TABS = [
  ['spl', 'SPL Response', SPLTab],
  ['zin', 'Impedance', ImpedanceTab],
  ['exc', 'Cone Excursion', ExcursionTab],
  ['vel', 'Port Velocity', VelocityTab],
  ['pow', 'Acoustic Power', PowerTab],
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
