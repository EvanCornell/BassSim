import React, { useEffect, useMemo, useState, useCallback, useRef } from 'react'
import {
  ComposedChart, Line, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ReferenceLine, ResponsiveContainer, ReferenceArea,
} from 'recharts'
import { useStore } from '../store'
import { readSnapshots } from '../workspace'

/**
 * Trace colours, cycled per series — theme tokens, so a chart follows the
 * light and dark appearances without re-rendering.
 */
const SERIES = ['var(--c1)', 'var(--c2)', 'var(--c3)', 'var(--c4)', 'var(--c5)', 'var(--c6)']
/**
 * Chart grid line colour.
 */
const GRID = 'var(--grid)'
/** Axis tick text. */
const TICK = { fill: 'var(--text-3)', fontSize: 10.5 }
/**
 * Preferred X-axis tick frequencies for the log scale.
 */
const TICKS = [10, 15, 20, 30, 40, 50, 70, 100, 150, 200, 300, 500, 700, 1000, 1500, 2000]

/**
 * Format a chart value, or an em dash when there is nothing to show.
 *
 * @param {number|null|undefined} v - The value.
 * @param {number} [d=1] - Decimal places.
 * @returns {string} The formatted number, or `'—'`.
 * @pure
 */
const fmt = (v, d = 1) => (v == null || !isFinite(v) ? '—' : v.toFixed(d))

/**
 * The shared chart shell: log-frequency axis, zoom, pan and drag-select.
 *
 * Every plot is built on this, so they all behave identically. Three
 * gestures: wheel zooms both axes about the cursor, shift or middle drag
 * pans, and a plain drag selects an X range.
 *
 * Zoom state is read through a ref inside the wheel and pointer handlers
 * rather than from props. Those listeners are registered once on mount —
 * `wheel` needs `passive: false` to be preventable and `pointerdown` needs
 * capture to beat recharts' own drag-select — so they would otherwise close
 * over the domain as it was at mount and zoom from the wrong origin forever.
 *
 * Zooming out to the full sweep resets rather than clamping, which is what
 * lets a few scroll-outs return the chart to its default view instead of
 * leaving it in Manual mode at the original bounds.
 *
 * @param {object} props - Component props.
 * @param {string} props.chartId - Chart id; keys the persisted zoom and Y-scale state.
 * @param {Array<object>} props.data - Recharts rows, each carrying `f` plus one field per series.
 * @param {Array<object>} props.lines - Series descriptors.
 * @param {string} props.yLabel - Left axis label.
 * @param {Array|undefined} props.yDomain - Left axis domain.
 * @param {string} [props.y2Label] - Right axis label.
 * @param {Array} [props.y2Domain] - Right axis domain.
 * @param {Array<React.ReactElement>} [props.refLines=[]] - Reference lines to overlay.
 * @param {Array<React.ReactElement>} [props.refAreas=[]] - Shaded regions to overlay.
 * @param {React.ReactNode} [props.children] - Extra toolbar content.
 * @returns {React.ReactElement} The chart.
 * @sideEffect Subscribes to the store. Registers wheel and pointerdown listeners on its own element, removed on unmount.
 */
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

  /**
   * Switch this chart's Y axis to Manual mode with explicit bounds.
   *
   * @param {number} lo - Lower bound.
   * @param {number} hi - Upper bound.
   * @returns {void}
   * @sideEffect Writes the Y-scale setting, which persists with the project.
   */
  const setManualY = (lo, hi) => {
    const st = useStore.getState()
    const cur = st.settings.yScales || {}
    /**
     * Round a bound so the Manual inputs show a readable number.
     *
     * @param {number} v - The bound.
     * @returns {number} The bound at 4 significant figures.
     * @pure
     */
    const r4 = (v) => Number(v.toPrecision(4))
    st.updateSettings({ yScales: { ...cur, [chartId]: { mode: 'manual', min: r4(lo), max: r4(hi) } } })
  }
  /**
   * Return this chart to its default view: full sweep, Y back to Fit.
   *
   * @returns {void}
   * @sideEffect Clears the zoom and writes the Y-scale setting.
   */
  const resetAll = () => {
    const st = useStore.getState()
    st.setXZoom(chartId, null)
    const cur = st.settings.yScales || {}
    st.updateSettings({ yScales: { ...cur, [chartId]: { mode: 'fit', min: '', max: '' } } })
  }

  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    /**
     * Where the cursor sits inside the plot area, as fractions of each axis.
     *
     * The plot area is inset from the element by the axis gutters, which are
     * fixed by the chart's own margins, so they are subtracted as constants
     * rather than measured.
     *
     * @param {number} clientX - Pointer X in client coordinates.
     * @param {number} clientY - Pointer Y in client coordinates.
     * @returns {[number, number]} Fraction along X and up Y, each clamped to 0–1.
     * @sideEffect Reads live element geometry.
     */
    const fracs = (clientX, clientY) => {
      const rect = el.getBoundingClientRect()
      const left = 52, right = 30, top = 10, bottom = 48
      return [
        Math.min(Math.max((clientX - rect.left - left) / (rect.width - left - right), 0), 1),
        Math.min(Math.max(1 - (clientY - rect.top - top) / (rect.height - top - bottom), 0), 1),
      ]
    }
    /**
     * Zoom both axes about the cursor.
     *
     * X zooms in log space, because the axis is logarithmic and a linear zoom
     * would feel wrong at one end. When recharts has reported the exact data
     * point under the cursor, that is used as the centre instead of the
     * geometric fraction, so the value under the pointer stays put.
     *
     * Refuses to zoom in past a 1.15 ratio, and resets entirely rather than
     * clamping once the view covers the whole sweep.
     *
     * @param {WheelEvent} e - The wheel event.
     * @returns {void}
     * @sideEffect Prevents the page from scrolling, and writes zoom and Y-scale state.
     * @reads the current domains through a ref, since this listener is registered once on mount.
     */
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
    /**
     * Begin a pan, on shift-drag or middle-drag.
     *
     * Propagation is stopped so recharts does not start a drag-select at the
     * same time. The pan is clamped to keep the window inside the swept range.
     *
     * @param {PointerEvent} e - The pointerdown event.
     * @returns {void}
     * @sideEffect Registers window pointermove and pointerup listeners.
     */
    const onPointerDown = (e) => {
      if (!(e.shiftKey || e.button === 1)) return
      e.preventDefault()
      e.stopPropagation() // keep recharts from starting a drag-select
      const start = { px: e.clientX, py: e.clientY, dom: [...stateRef.current.xDomain], yb: [...stateRef.current.yBounds] }
      const rect = el.getBoundingClientRect()
      const innerW = rect.width - 82
      const innerH = rect.height - 58
      /**
       * Apply the in-progress pan.
       *
       * @param {PointerEvent} ev - The pointermove event.
       * @returns {void}
       * @sideEffect Writes zoom and Y-scale state on every move.
       * @reads the domains captured when the pan started.
       */
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
      /**
       * End the pan and remove its listeners.
       *
       * @returns {void}
       * @sideEffect Removes the window listeners.
       */
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
  /**
   * Apply a completed drag-select as an X zoom.
   *
   * Selections narrower than 5% are discarded as accidental clicks rather
   * than zooming to a sliver.
   *
   * @returns {void}
   * @sideEffect Writes zoom state and clears the drag markers.
   */
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
    <div ref={wrapRef} className="plot-body">
    {xZoom && (
      <button
        className="zoom-reset"
        title="Reset zoom (or double-click the chart). Wheel = zoom both axes, shift+drag = pan."
        onClick={resetAll}
      >⟲ {fmt(xZoom[0], 0)}–{fmt(xZoom[1], 0)} Hz</button>
    )}
    <ResponsiveContainer width="100%" height="100%">
      <ComposedChart
        data={data} margin={{ top: 8, right: hasY2 ? 8 : 20, bottom: 4, left: 0 }}
        onMouseDown={(e) => { if (e && e.activeLabel != null) setDragL(e.activeLabel) }}
        onMouseMove={(e) => { if (e && e.activeLabel != null) { lastLabel.current = e.activeLabel; if (dragL != null) setDragR(e.activeLabel) } }}
        onMouseUp={commitZoom}
        onMouseLeave={() => { setDragL(null); setDragR(null) }}
        onDoubleClick={resetAll}
        style={{ userSelect: 'none' }}
      >
        <defs>
          <linearGradient id={`fill_${chartId}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="var(--c1)" stopOpacity="var(--fill-top)" style={{ stopOpacity: 'var(--fill-top)' }} />
            <stop offset="1" stopColor="var(--c1)" stopOpacity="0" />
          </linearGradient>
        </defs>
        <CartesianGrid stroke={GRID} strokeDasharray="3 4" vertical={true} />
        <XAxis
          dataKey="f" type="number" scale="log" allowDataOverflow
          domain={xDomain}
          ticks={ticks} tick={TICK}
          stroke={GRID} tickLine={false} tickFormatter={(v) => (v >= 1000 ? `${v / 1000}k` : Math.round(v * 10) / 10)}
        />
        <YAxis
          yAxisId="left" domain={yDomain || ['auto', 'auto']} allowDataOverflow
          tick={TICK} stroke={GRID} tickLine={false} axisLine={false} width={44} tickFormatter={yTick}
          label={yLabel ? { value: yLabel, angle: -90, position: 'insideLeft', fill: 'var(--text-3)', fontSize: 10.5 } : undefined}
        />
        {hasY2 && (
          <YAxis
            yAxisId="right" orientation="right" domain={y2Domain || ['auto', 'auto']}
            tick={TICK} stroke={GRID} tickLine={false} axisLine={false} width={44} tickFormatter={yTick}
            label={y2Label ? { value: y2Label, angle: 90, position: 'insideRight', fill: 'var(--text-3)', fontSize: 10.5 } : undefined}
          />
        )}
        <Tooltip
          contentStyle={{ background: 'var(--raised)', border: '1px solid var(--line-2)', borderRadius: 10 }}
          labelStyle={{ color: 'var(--text)' }}
          cursor={{ stroke: 'var(--line-2)' }}
          labelFormatter={(v) => `${fmt(v)} Hz`}
          formatter={(v) => fmt(v, 2)}
          isAnimationActive={false}
        />
        <Legend
          wrapperStyle={{ fontSize: 11.5 }}
          payload={lines.map((l) => ({ id: l.dataKey, value: l.name, type: 'plainline', color: l.color, payload: { strokeDasharray: l.dash || '0' } }))}
        />
        {refAreas}
        {lines.filter((l) => l.area).map((l) => (
          <Area
            key={`area_${l.dataKey}`} yAxisId={l.yAxisId || 'left'} type="monotone" dataKey={l.dataKey}
            stroke="none" fill={`url(#fill_${chartId})`} baseValue={Array.isArray(yDomain) && isFinite(yDomain[0]) ? yDomain[0] : 'dataMin'}
            legendType="none" tooltipType="none" isAnimationActive={false} connectNulls={false} activeDot={false}
          />
        ))}
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
          <ReferenceArea yAxisId="left" x1={dragL} x2={dragR} fill="var(--accent)" fillOpacity={0.15} />
        )}
        {children}
      </ComposedChart>
    </ResponsiveContainer>
    </div>
  )
}

/**
 * The rows currently visible, for Y "Fit" mode.
 *
 * When zoomed, Fit should frame what is on screen rather than the whole
 * sweep — otherwise zooming into a quiet region leaves the trace pinned to
 * the bottom of the chart.
 *
 * @param {string} chartId - Chart id.
 * @param {Array<object>} data - All rows.
 * @returns {Array<object>} The rows inside the current zoom window, or all of them when unzoomed.
 * @sideEffect Subscribes to the store.
 */
function useFitData(chartId, data) {
  const z = useStore((s) => s.xZoom[chartId])
  return useMemo(() => (z ? data.filter((r) => r.f >= z[0] && r.f <= z[1]) : data), [data, z])
}

/**
 * Per-chart Y-scale control, and the domain it resolves to.
 *
 * Three modes: Fit uses a computed useful range, Full lets recharts use the
 * entire data range, and Manual takes explicit bounds. Persisted in
 * settings, so the choice survives tab switches and project save/load.
 *
 * @param {string} id - Chart id.
 * @param {Array|null} fitDomain - The computed Fit domain.
 * @returns {[Array, React.ReactElement]} The resolved Y domain and the control to render.
 * @sideEffect Subscribes to the store.
 */
function useYScale(id, fitDomain) {
  const ys = useStore((s) => s.settings.yScales?.[id]) || { mode: 'fit', min: '', max: '' }
  const updateSettings = useStore((s) => s.updateSettings)
  /**
   * Merge a change into this chart's persisted Y-scale settings.
   *
   * @param {object} patch - Fields to change.
   * @returns {void}
   * @sideEffect Writes the Y-scale setting, which persists with the project.
   */
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
    <>
      {ys.mode === 'manual' && (
        <label title="Y-axis bounds">
          <input type="number" placeholder="min" value={ys.min} onChange={(e) => setYs({ min: e.target.value })} />
          –
          <input type="number" placeholder="max" value={ys.max} onChange={(e) => setYs({ max: e.target.value })} />
        </label>
      )}
      <div className="seg" role="radiogroup" aria-label="Y-axis scale"
        title="Y-axis scale: Fit = zoom to the useful range, Full = entire data range, Manual = your own bounds">
        {[['fit', 'Fit'], ['auto', 'Full'], ['manual', 'Manual']].map(([k, label]) => (
          <button key={k} role="radio" aria-checked={ys.mode === k} className={ys.mode === k ? 'on' : ''}
            onClick={() => setYs({ mode: k })}>{label}</button>
        ))}
      </div>
    </>
  )
  return [domain, control]
}

/**
 * Round a dB bound to a multiple of 5, so axis labels land on round numbers.
 *
 * @param {number} v - The bound.
 * @param {boolean} up - Round up rather than down.
 * @returns {number} The rounded bound.
 * @pure
 */
const round5 = (v, up) => (up ? Math.ceil(v / 5) * 5 : Math.floor(v / 5) * 5) + 0
/**
 * A useful Y range for a dB curve: a fixed window below the peak.
 *
 * Anchoring to the peak rather than the data extent keeps deep nulls from
 * compressing the whole trace into the top of the chart — a 60 dB null is
 * real but says nothing about the passband.
 *
 * The upper bound is not the peak: it is the peak plus 4 dB of headroom, so the
 * loudest trace does not sit flush against the top of the plot. Both bounds are
 * then rounded outward to a multiple of 5, which is what puts the axis labels on
 * round numbers.
 *
 * @param {Array<object>} rows - Chart rows.
 * @param {string[]} keys - Series keys to consider.
 * @param {number} [windowDb=45] - How far below the peak to show.
 * @returns {[number, number]|null} The domain as `[round5(peak − windowDb, down), round5(peak + 4, up)]`, or `null` when no data is finite.
 * @pure
 */
function fitDb(rows, keys, windowDb = 45) {
  let peak = -Infinity
  for (const r of rows) for (const k of keys) { const v = r[k]; if (v != null && v > peak) peak = v }
  if (!isFinite(peak)) return null
  return [round5(peak - windowDb, false), round5(peak + 4, true)]
}
/**
 * A useful Y range for a linear curve: from a floor to a padded maximum.
 *
 * @param {Array<object>} rows - Chart rows.
 * @param {string[]} keys - Series keys to consider.
 * @param {number} [floor=0] - Lower bound.
 * @param {number} [atLeast=0] - Minimum upper bound, so a flat trace still gets a sensible axis.
 * @returns {[number, number]|null} The domain, or `null` when no data is finite.
 * @pure
 */
function fitLinear(rows, keys, floor = 0, atLeast = 0) {
  let hi = -Infinity
  for (const r of rows) for (const k of keys) { const v = r[k]; if (v != null && v > hi) hi = v }
  if (!isFinite(hi)) return null
  return [floor, Math.max(hi * 1.08, atLeast)]
}

/**
 * Merge results and snapshots into recharts row objects.
 *
 * One row per frequency carrying every requested series, since recharts
 * wants row-major data while the solver produces column-major arrays.
 * Snapshot series are resampled onto the current frequency axis, which is
 * what lets an overlay taken at a different sweep resolution still line up.
 *
 * @param {string[]} keys - Which series families to include.
 * @returns {{data: Array<object>, portIds: string[]}} The rows, and the radiator ids present in them.
 * @sideEffect Subscribes to the store.
 */
function useChartData(keys) {
  const results = useStore((s) => s.results)
  const snapshots = useStore((s) => readSnapshots(s.workspace))
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
      if (keys.includes('zin')) {
        row.zmag = results.zinMag[i]; row.zphase = results.zinPhase[i]
        for (const [cid, z] of Object.entries(results.zinByChannel || {})) row[`zch_${cid}`] = z.mag[i]
      }
      if (keys.includes('exc')) {
        row.exc = results.excursion[i]
        for (const [did, arr] of Object.entries(results.excursionByDriver || {})) {
          row[`exc_${did}`] = arr[i]
          // percentage of that driver's own Xmax, so cones with different
          // limits can be read against one another
          const xm = results.xmaxByDriver?.[did]
          if (xm > 0) row[`excr_${did}`] = (arr[i] / xm) * 100
        }
        if (results.excursionRatio) row.excr = results.excursionRatio[i] * 100
      }
      if (keys.includes('vel')) {
        for (const [wid, arr] of Object.entries(results.velocity || {})) row[`vel_${wid}`] = arr[i]
      }
      if (keys.includes('int')) {
        for (const [cid, arr] of Object.entries(results.splInterior || {})) row[`int_${cid}`] = arr[i]
      }
      if (keys.includes('pfl')) {
        for (const [pid, p] of Object.entries(results.probeFlow || {})) {
          row[`pfl_${pid}`] = p.kind === 'flow' ? p.values[i] * 1000 : p.values[i]
        }
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
          // the excursion plot can also be read in % of Xmax; give snapshots
          // the matching series so overlays survive the unit switch
          if (key === 'exc' && s.excursionRatio) {
            rows[i][`snap${si}_excr`] = s.excursionRatio[nearestIdx(s.freqs, f)] * 100
          }
        }
      }
    })
    return { data: rows, portIds }
  }, [results, snapshots, keys.join()])
}

/**
 * Format a Y-axis tick.
 *
 * A fitted domain ends on an unrounded value, which recharts draws as a tick;
 * three significant figures keep it inside the axis.
 *
 * @param {number} v - Tick value.
 * @returns {number} The value, rounded for display.
 * @pure
 */
function yTick(v) {
  if (!Number.isFinite(v) || v === 0) return v
  return Math.abs(v) >= 100 ? Math.round(v) : Number(v.toPrecision(3))
}

/**
 * Index of the sample nearest a frequency, by binary search.
 *
 * Used to resample snapshot curves onto the current axis; a linear scan
 * would make a full overlay O(n²).
 *
 * @param {number[]} arr - Ascending frequency axis.
 * @param {number} f - Frequency to locate.
 * @returns {number} Index of the nearest sample. When two samples are exactly equidistant the higher index wins, which keeps a resampled overlay from drifting low across a run of ties.
 * @pre arr is sorted ascending and holds at least two samples
 * @pure
 */
function nearestIdx(arr, f) {
  let lo = 0, hi = arr.length - 1
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1
    if (arr[mid] < f) lo = mid; else hi = mid
  }
  return Math.abs(arr[lo] - f) < Math.abs(arr[hi] - f) ? lo : hi
}

/**
 * Series descriptors for the snapshot overlays of one quantity.
 *
 * Drawn dashed and thinner than the live trace, so an overlay never reads
 * as the current result.
 *
 * @param {Array<object>} snapshots - Stored snapshots, each carrying `label` and `color`.
 * @param {string} key - Quantity key to overlay.
 * @returns {Array<object>} One descriptor per snapshot, in the order given, each `{dataKey, name, color, width, dash}` — `dataKey` is `snap<index>_<key>`, `name` prefixes the snapshot's label with ⧉, and `width`/`dash` are the thinner dashed styling that keeps an overlay from reading as the live trace.
 * @pure
 */
function snapLines(snapshots, key) {
  return snapshots.map((s, si) => ({
    dataKey: `snap${si}_${key}`, name: `⧉ ${s.label}`, color: s.color, width: 1.5, dash: '6 3',
  }))
}

/**
 * Sound pressure level, with a trace per radiator beside the combined response.
 *
 * @returns {React.ReactElement} The chart.
 * @sideEffect Subscribes to the store.
 */
function SPLTab() {
  const { data, portIds } = useChartData(['spl'])
  const nodes = useStore((s) => s.nodes)
  const snapshots = useStore((s) => readSnapshots(s.workspace))
  const [show, setShow] = useState({ driver: true, ports: true, combined: true })
  const lines = []
  if (show.combined) lines.push({ dataKey: 'combined', name: 'Combined', color: SERIES[0], width: 2.2, area: true })
  if (show.driver) lines.push({ dataKey: 'driver', name: 'Driver direct', color: SERIES[1] })
  if (show.ports) portIds.forEach((pid, i) => {
    // A key may name one end or face of a node: `id:throat`, `id:rear`.
    const [id, end] = pid.split(':')
    const n = nodes.find((nn) => nn.id === id)
    const name = `${n?.data.params.label || 'Port'}${end ? ` (${end})` : ''}`
    lines.push({ dataKey: `port_${pid}`, name, color: SERIES[(i + 2) % SERIES.length] })
  })
  lines.push(...snapLines(snapshots, 'spl'))
  const fitData = useFitData('spl', data)
  const [yDomain, yControl] = useYScale('spl', fitDb(fitData, lines.map((l) => l.dataKey)))
  return (
    <>
      <div className="plot-controls">
        {[['combined', 'Combined', SERIES[0]], ['driver', 'Driver', SERIES[1]], ['ports', 'Ports', SERIES[2]]].map(([k, label, color]) => (
          <button key={k} className={`chip-toggle${show[k] ? ' on' : ''}`} aria-pressed={show[k]}
            onClick={() => setShow({ ...show, [k]: !show[k] })}>
            <span className="ct-swatch" style={{ borderTopColor: color }} />{label}
          </button>
        ))}
        {snapshots.map((sn) => (
          <span key={sn.id} className="chip-toggle on dashed" title={sn.project ? `Snapshot from ${sn.project}` : 'Snapshot'}>
            <span className="ct-swatch" style={{ borderTopColor: sn.color }} />{sn.label}
          </span>
        ))}
        <span style={{ flex: 1 }} />
        {yControl}
        <SolveTime />
      </div>
      <BaseChart chartId="spl" data={data} lines={lines} yLabel="SPL dB @ 1m" yDomain={yDomain} />
    </>
  )
}

/**
 * Electrical input impedance magnitude, with phase on a second axis.
 *
 * @returns {React.ReactElement} The chart.
 * @sideEffect Subscribes to the store.
 */
function ImpedanceTab() {
  const { data } = useChartData(['zin'])
  const snapshots = useStore((s) => readSnapshots(s.workspace))
  const metrics = useStore((s) => s.metrics)
  const channels = useStore((s) => s.results?.zinByChannel) || {}
  const ids = Object.keys(channels)
  // One channel: its magnitude and phase. Several: a magnitude per channel,
  // since each amplifier sees its own load.
  const lines = ids.length > 1
    ? [
        ...ids.map((cid, i) => ({ dataKey: `zch_${cid}`, name: `|Z| ${channels[cid].label || cid}`, color: SERIES[i % SERIES.length], width: i ? 1.5 : 2.5 })),
        ...snapLines(snapshots, 'zin'),
      ]
    : [
        { dataKey: 'zmag', name: '|Z| Ω', color: SERIES[0], width: 2.5 },
        { dataKey: 'zphase', name: 'Phase °', color: SERIES[2], yAxisId: 'right' },
        ...snapLines(snapshots, 'zin'),
      ]
  const refLines = (metrics?.zPeaks || []).map((p, i) => (
    <ReferenceLine key={i} yAxisId="left" x={p.f} stroke="var(--text-3)" strokeDasharray="3 3"
      label={{ value: `F${i + 1} ${p.f.toFixed(1)}`, fill: 'var(--text-2)', fontSize: 10, position: 'insideTopLeft' }} />
  ))
  const fitData = useFitData('zin', data)
  const [yDomain, yControl] = useYScale('zin', fitLinear(fitData, [...(ids.length > 1 ? ids.map((c) => `zch_${c}`) : ['zmag']), ...snapshots.map((_, i) => `snap${i}_zin`)]))
  return (
    <>
      <div className="plot-controls">{yControl}<SolveTime /></div>
      <BaseChart chartId="zin" data={data} lines={lines} yLabel="|Z| Ω" yDomain={yDomain} y2Label="Phase °" y2Domain={[-90, 90]} refLines={refLines} />
    </>
  )
}

/**
 * Cone excursion against Xmax, one trace per driver.
 *
 * Cones in different places do not move together and are not
 * interchangeable when their Xmax differs, so each gets its own trace.
 *
 * Millimetres are what you order parts by, but percent is the only way to
 * compare cones whose limits differ — so a design mixing limits defaults to
 * percent, and the unit is switchable either way. In percent every driver
 * shares one 100% line; in millimetres there is a reference line per
 * distinct Xmax, labelled with its drivers when they differ.
 *
 * @returns {React.ReactElement} The chart.
 * @sideEffect Subscribes to the store.
 */
function ExcursionTab() {
  const { data } = useChartData(['exc'])
  const snapshots = useStore((s) => readSnapshots(s.workspace))
  const nodes = useStore((s) => s.nodes)
  const results = useStore((s) => s.results)
  const xmaxByDriver = results?.xmaxByDriver || {}
  const driverIds = Object.keys(results?.excursionByDriver || {})
  const multi = driverIds.length > 1
  /**
   * The display label for a driver node, falling back to its id.
   *
   * @param {string} id - Driver node id.
   * @returns {string} The label, or the id when unlabelled.
   * @reads the enclosing `nodes` list.
   */
  const labelOf = (id) => nodes.find((n) => n.id === id)?.data.params.label || id
  const limits = [...new Set(driverIds.map((id) => xmaxByDriver[id]).filter((v) => v > 0))].sort((a, b) => a - b)
  const fallbackXmax = nodes.find((n) => n.type === 'driver')?.data.params.Xmax
  const xmaxes = limits.length ? limits : (fallbackXmax > 0 ? [fallbackXmax] : [])
  const mixed = xmaxes.length > 1
  const [unit, setUnit] = useState(null)
  const pct = (unit ?? (mixed ? '%' : 'mm')) === '%'

  /**
   * The row field holding this driver's excursion, in the selected unit.
   *
   * @param {string} id - Driver node id.
   * @returns {string} The series key.
   * @reads the enclosing unit selection.
   */
  const seriesKey = (id) => (pct ? `excr_${id}` : `exc_${id}`)
  const lines = multi
    ? [
      ...driverIds.map((id, i) => ({
        dataKey: seriesKey(id), name: labelOf(id), color: SERIES[i % SERIES.length], width: 2,
      })),
      ...snapLines(snapshots, pct ? 'excr' : 'exc'),
    ]
    : [
      { dataKey: pct ? 'excr' : 'exc', name: pct ? '% of Xmax' : 'Excursion mm (peak)', color: SERIES[0], width: 2.5 },
      ...snapLines(snapshots, pct ? 'excr' : 'exc'),
    ]

  /**
   * The label for one Xmax reference line.
   *
   * With mixed limits the line names the drivers it applies to, since
   * otherwise two lines a millimetre apart would be indistinguishable.
   *
   * @param {number} xm - The Xmax value, mm.
   * @returns {string} The reference line label.
   * @reads the enclosing driver list and Xmax map.
   */
  const nameFor = (xm) => (mixed
    ? `Xmax ${xm} mm — ${driverIds.filter((id) => xmaxByDriver[id] === xm).map(labelOf).join(', ')}`
    : `Xmax ${xm} mm`)
  const refLines = pct
    ? [
      <ReferenceLine key="xmax100" yAxisId="left" y={100} stroke="var(--red)" strokeDasharray="6 4"
        label={{ value: 'Xmax', fill: 'var(--red)', fontSize: 10, position: 'insideTopRight' }} />,
    ]
    : xmaxes.map((xm) => (
      <ReferenceLine key={`xmax${xm}`} yAxisId="left" y={xm} stroke="var(--red)" strokeDasharray="6 4"
        label={{ value: nameFor(xm), fill: 'var(--red)', fontSize: 10, position: 'insideTopRight' }} />
    ))
  // Shade above the first limit anything runs into.
  const ceiling = pct ? 100 : xmaxes[0]
  const refAreas = ceiling ? [
    <ReferenceArea key="over" yAxisId="left" y1={ceiling} y2={ceiling * 3} fill="var(--red)" fillOpacity={0.07} />,
  ] : []

  const fitData = useFitData('exc', data)
  const fitKeys = multi ? driverIds.map(seriesKey) : [pct ? 'excr' : 'exc']
  const [yDomain, yControl] = useYScale(pct ? 'excPct' : 'exc',
    fitLinear(fitData, fitKeys, 0, ceiling ? ceiling * 1.25 : 0))
  return (
    <>
      <div className="plot-controls">
        <label title="Millimetres of cone travel, or each driver's travel as a percentage of its own Xmax">Units
          <select value={pct ? '%' : 'mm'} onChange={(e) => setUnit(e.target.value)} style={{ width: 88 }}>
            <option value="mm">mm</option>
            <option value="%">% Xmax</option>
          </select>
        </label>
        {yControl}
        <SolveTime />
      </div>
      <BaseChart chartId="exc" data={data} lines={lines} yLabel={pct ? '% of Xmax' : 'mm'}
        yDomain={yDomain} refLines={refLines} refAreas={refAreas} />
    </>
  )
}

/**
 * Air velocity in each waveguide, against the turbulence threshold.
 *
 * The threshold line is the point of the chart: a port above it chuffs
 * audibly however good the response looks.
 *
 * @returns {React.ReactElement} The chart.
 * @sideEffect Subscribes to the store.
 */
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
        <SolveTime />
      </div>
      <BaseChart chartId="vel" data={data} lines={lines} yLabel="m/s (peak)" yDomain={yDomain} refLines={[
        <ReferenceLine key="th" yAxisId="left" y={vThreshold} stroke="var(--red)" strokeDasharray="6 4"
          label={{ value: `turbulence ~${vThreshold} m/s`, fill: 'var(--red)', fontSize: 10, position: 'insideTopRight' }} />,
      ]} />
    </>
  )
}

/**
 * Interior SPL at each probed chamber's virtual microphone.
 *
 * The right measure for in-cabin listening levels, where cabin gain rises
 * below the cabin's first mode. Point pressure, so there is no 1 m
 * convention here.
 *
 * @returns {React.ReactElement} The chart.
 * @sideEffect Subscribes to the store.
 */
function InteriorTab() {
  const { data } = useChartData(['int'])
  const nodes = useStore((s) => s.nodes)
  const results = useStore((s) => s.results)
  const probes = useStore((s) => s.projectExtras.probes) || []
  const chambers = Object.keys(results?.splInterior || {})
  const lines = chambers.map((cid, i) => ({ dataKey: `int_${cid}`, name: probeName(cid, probes, nodes), color: SERIES[i % SERIES.length] }))
  const fitData = useFitData('int', data)
  const [yDomain, yControl] = useYScale('int', fitDb(fitData, lines.map((l) => l.dataKey)))
  if (!chambers.length) {
    return (
      <div style={{ padding: '24px 16px', color: 'var(--text-3)', fontSize: 12.5, lineHeight: 1.6 }}>
        No pressure probes. Select a Chamber node and enable
        <b> “SPL probe (mic inside)”</b>, or add a pressure probe anywhere from
        the Probes panel, to plot the sound pressure level there — e.g. at the
        listening position in a car cabin. A probe is a virtual microphone: it
        never changes the simulation itself.
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
        <SolveTime />
      </div>
      <BaseChart chartId="int" data={data} lines={lines} yLabel="dB SPL (interior)" yDomain={yDomain} />
    </>
  )
}

/**
 * The display name of a probe's trace.
 *
 * A chamber's own probe is keyed by the chamber id and takes its label; any
 * other probe by its own id, and takes its label or a description of where
 * it sits.
 *
 * @param {string} key - The result key.
 * @param {Array<object>} probes - The project's probes.
 * @param {Array<object>} nodes - Graph nodes.
 * @returns {string} The name.
 * @pure
 */
function probeName(key, probes, nodes) {
  const n = nodes.find((nn) => nn.id === key)
  if (n) return n.data.params.label || 'Chamber'
  const p = probes.find((x) => x.id === key)
  if (!p) return key
  if (p.label) return p.label
  const on = nodes.find((nn) => nn.id === p.at?.node)?.data.params.label || p.at?.node
  return p.at?.position != null ? `${on} @ ${p.at.position} cm` : `${on} ${p.at?.handle}`
}

/**
 * Flow and velocity at each flow or velocity probe.
 *
 * Velocity (m/s) on the left axis, volume flow (L/s) on the right, both
 * peak, like the port velocity chart.
 *
 * @returns {React.ReactElement} The chart.
 * @sideEffect Subscribes to the store.
 */
function ProbeFlowTab() {
  const { data } = useChartData(['pfl'])
  const nodes = useStore((s) => s.nodes)
  const results = useStore((s) => s.results)
  const probes = useStore((s) => s.projectExtras.probes) || []
  const flows = Object.entries(results?.probeFlow || {})
  const lines = flows.map(([pid, p], i) => ({
    dataKey: `pfl_${pid}`,
    name: `${probeName(pid, probes, nodes)} (${p.kind === 'flow' ? 'L/s' : 'm/s'})`,
    color: SERIES[i % SERIES.length],
    ...(p.kind === 'flow' ? { yAxisId: 'right' } : {}),
  }))
  const fitData = useFitData('pfl', data)
  const [yDomain, yControl] = useYScale('pfl', fitLinear(fitData, lines.filter((l) => !l.yAxisId).map((l) => l.dataKey)))
  if (!flows.length) {
    return (
      <div style={{ padding: '24px 16px', color: 'var(--text-3)', fontSize: 12.5, lineHeight: 1.6 }}>
        No flow or velocity probes. Add one from the Probes panel to plot the
        air moving through any handle, tap or point along a line.
      </div>
    )
  }
  const hasFlow = lines.some((l) => l.yAxisId)
  return (
    <>
      <div className="plot-controls">
        <span style={{ fontSize: 11, color: 'var(--text-3)' }}>peak values</span>
        {yControl}
        <SolveTime />
      </div>
      <BaseChart chartId="pfl" data={data} lines={lines} yLabel="m/s (peak)" yDomain={yDomain} {...(hasFlow ? { y2Label: 'L/s (peak)', y2Domain: ['auto', 'auto'] } : {})} />
    </>
  )
}

/**
 * Radiated acoustic power.
 *
 * @returns {React.ReactElement} The chart.
 * @sideEffect Subscribes to the store.
 */
function PowerTab() {
  const { data } = useChartData(['pow'])
  const snapshots = useStore((s) => readSnapshots(s.workspace))
  const lines = [{ dataKey: 'pow', name: 'Radiated power dBW', color: SERIES[0], width: 2.5 }, ...snapLines(snapshots, 'pow')]
  const fitData = useFitData('pow', data)
  const [yDomain, yControl] = useYScale('pow', fitDb(fitData, lines.map((l) => l.dataKey)))
  return (
    <>
      <div className="plot-controls">{yControl}<SolveTime /></div>
      <BaseChart chartId="pow" data={data} lines={lines} yLabel="dBW" yDomain={yDomain} />
    </>
  )
}

/**
 * Acoustic efficiency as a percentage of electrical input power.
 *
 * @returns {React.ReactElement} The chart.
 * @sideEffect Subscribes to the store.
 */
function EfficiencyTab() {
  const { data } = useChartData(['eff'])
  const lines = [{ dataKey: 'eff', name: 'Efficiency %', color: SERIES[1], width: 2.5 }]
  const fitData = useFitData('eff', data)
  const [yDomain, yControl] = useYScale('eff', fitLinear(fitData, ['eff']))
  return (
    <>
      <div className="plot-controls">{yControl}<SolveTime /></div>
      <BaseChart chartId="eff" data={data} lines={lines} yLabel="acoustic / electrical %" yDomain={yDomain} />
    </>
  )
}

/**
 * Electrical input power, real and apparent.
 *
 * @returns {React.ReactElement} The chart.
 * @sideEffect Subscribes to the store.
 */
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
      <div className="plot-controls">{yControl}<SolveTime /></div>
      <BaseChart chartId="pe" data={data} lines={lines} yLabel="W / VA" yDomain={yDomain} />
    </>
  )
}

/**
 * Phase and group delay on separate axes.
 *
 * @returns {React.ReactElement} The chart.
 * @sideEffect Subscribes to the store.
 */
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
        <SolveTime />
      </div>
      <BaseChart chartId="ph" data={adj} lines={lines} yLabel="deg" yDomain={yDomain} y2Label="ms" />
    </>
  )
}

/**
 * How long the result on screen took to solve.
 *
 * @returns {React.ReactElement|null} The readout, or `null` before the first result.
 * @sideEffect Subscribes to the store.
 */
function SolveTime() {
  const ms = useStore((s) => s.results?.elapsedMs)
  if (ms == null) return null
  return <span className="plot-solved" title="Time to solve the frequency sweep">solved {ms.toFixed(0)} ms</span>
}

/**
 * The shell every chart panel shares.
 *
 * @param {object} props - Component props.
 * @param {React.ReactNode} props.children - The chart to wrap.
 * @returns {React.ReactElement} The panel.
 * @pure
 */
function ChartPanel({ children }) {
  return (
    <div className="results-panel">
      <div className="plot-area">{children}</div>
    </div>
  )
}

/**
 * Chart id to component.
 *
 * Keyed the same as the per-chart zoom state in the store, so a chart keeps
 * its zoom when it is re-docked or tabbed away.
 */
export const CHART_PANELS = {
  spl: SPLTab,
  zin: ImpedanceTab,
  exc: ExcursionTab,
  vel: VelocityTab,
  int: InteriorTab,
  pfl: ProbeFlowTab,
  pow: PowerTab,
  eff: EfficiencyTab,
  pe: ElecPowerTab,
  ph: PhaseTab,
}

/**
 * Build the dockable panel component for one chart.
 *
 * A fresh component is built on every call, so two calls with the same id
 * return distinct — though behaviourally identical — component types. Callers
 * that mount the result should hold onto it rather than calling again on each
 * render, or React will unmount and remount the panel.
 *
 * @param {string} id - Chart id.
 * @returns {React.ComponentType|null} A newly built panel component, or `null` for an unknown id.
 * @sideEffect None, but not `@pure`: the returned component is a new object each call, so results are never equal by identity.
 */
export function chartPanelComponent(id) {
  const Chart = CHART_PANELS[id]
  if (!Chart) return null
  /**
   * The chart wrapped in its panel shell.
   *
   * @returns {React.ReactElement} The panel.
   * @pure
   */
  const Wrapped = () => <ChartPanel><Chart /></ChartPanel>
  Wrapped.displayName = `ChartPanel(${id})`
  return Wrapped
}

// Module-private functions, exposed for the contract test suite only
// (test/contract/*). Not part of this module's public API — application code
// must not import from here, and nothing outside the tests does.
export const __internals = { fmt, round5, fitDb, fitLinear, nearestIdx, snapLines, yTick }
