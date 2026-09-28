import React, { useEffect, useMemo, useState } from 'react'
import {
  ResponsiveContainer, LineChart, Line, BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ReferenceLine,
} from 'recharts'
import { useStore, tdSettingsOf } from '../store'
import { decimate, rfft } from '../spice/dsp'
import { splOf, levels, CEA2010_LIMITS } from '../spice/timedomain'
import NLLab from './NLLab'

/** Trace colours, shared with the frequency charts. */
const SERIES = ['var(--c1)', 'var(--c2)', 'var(--c3)', 'var(--c4)', 'var(--c5)', 'var(--c6)']
const GRID = 'var(--grid)'
const TICK = { fill: 'var(--text-3)', fontSize: 10.5 }
/** Most points drawn per trace; longer series are thinned keeping their peaks. */
const MAX_POINTS = 1600

/** The workspace's tabs, as `[id, label]`. */
const TABS = [
  ['linear', 'Linear response'],
  ['transient', 'Transient'],
  ['distortion', 'Distortion'],
  ['nonlinear', 'Driver nonlinearity'],
]

/**
 * Format a number for a readout.
 *
 * @param {number} v - The value.
 * @param {number} [d=1] - Decimals.
 * @returns {string} The text, or a dash for a missing value.
 * @pure
 */
const f = (v, d = 1) => (v == null || !Number.isFinite(v) ? '—' : v.toFixed(d))

/**
 * Rows for a time chart from sample times and named series, thinned for drawing.
 *
 * @param {ArrayLike<number>} t - Sample times, s.
 * @param {Object<string, ArrayLike<number>>} series - Key → samples.
 * @param {number} [tMax] - Last time to include, s.
 * @returns {Array<object>} Rows `{ms, key…}`.
 * @pure
 */
export function timeRows(t, series, tMax = Infinity) {
  const keys = Object.keys(series)
  if (!keys.length || !t?.length) return []
  let n = t.length
  while (n > 1 && t[n - 1] > tMax) n--
  /**
   * The samples up to the last time kept.
   *
   * @param {ArrayLike<number>} a - Samples.
   * @returns {number[]} The kept samples.
   * @pure
   */
  const cut = (a) => Array.prototype.slice.call(a, 0, n)
  const { t: tt, ys } = decimate(cut(t), keys.map((k) => cut(series[k])), MAX_POINTS)
  return tt.map((v, i) => {
    const row = { ms: v * 1000 }
    keys.forEach((k, j) => { row[k] = ys[j][i] })
    return row
  })
}

/**
 * Round tick positions across a linear range.
 *
 * @param {number} lo - Range start.
 * @param {number} hi - Range end.
 * @param {number} [count=8] - Roughly how many ticks.
 * @returns {number[]} Ticks on a 1-2-5 step.
 * @pure
 */
export function linearTicks(lo, hi, count = 8) {
  if (!(hi > lo)) return [lo]
  const raw = (hi - lo) / count
  const mag = Math.pow(10, Math.floor(Math.log10(raw)))
  const step = [1, 2, 5, 10].map((m) => m * mag).find((s) => s >= raw)
  const out = []
  for (let v = Math.ceil(lo / step) * step; v <= hi + step * 1e-9; v += step) out.push(Number(v.toPrecision(12)))
  return out
}

/**
 * Tick positions across a logarithmic range: 1, 2 and 5 of each decade.
 *
 * @param {number} lo - Range start, above zero.
 * @param {number} hi - Range end.
 * @returns {number[]} The ticks inside the range.
 * @pure
 */
export function logTicks(lo, hi) {
  const out = []
  for (let e = Math.floor(Math.log10(Math.max(lo, 1e-9))); e <= Math.ceil(Math.log10(hi)); e++) {
    for (const m of [1, 2, 5]) {
      const v = m * Math.pow(10, e)
      if (v >= lo && v <= hi) out.push(v)
    }
  }
  return out
}

/**
 * A line chart for the time-domain views.
 *
 * @param {object} props - Component props.
 * @param {string} props.title - Heading above the chart.
 * @param {Array<object>} props.data - Rows.
 * @param {Array<object>} props.lines - `{key, name, color?, dash?, right?, width?}` per trace.
 * @param {string} [props.xKey] - Row field for x; `ms` by default.
 * @param {string} [props.xLabel] - X axis label.
 * @param {boolean} [props.logX] - Logarithmic x axis.
 * @param {string} props.yLabel - Left axis label.
 * @param {string} [props.y2Label] - Right axis label, when some trace uses it.
 * @param {Array} [props.yDomain] - Left axis domain.
 * @param {Array<object>} [props.refs] - `{y, label, color}` horizontal reference lines on the left axis.
 * @param {number} [props.height] - Height, px.
 * @returns {React.ReactElement} The chart.
 * @pure
 */
function TdChart({ title, data, lines, xKey = 'ms', xLabel = 'ms', logX = false, yLabel, y2Label, yDomain, refs = [], height = 230 }) {
  const right = lines.some((l) => l.right)
  const xs = data.length ? [data[0][xKey], data[data.length - 1][xKey]] : [0, 1]
  const ticks = logX ? logTicks(xs[0], xs[1]) : linearTicks(xs[0], xs[1])
  return (
    <div className="td-chart">
      <div className="td-chart-title">{title}<span className="td-xunit">{xKey === 'ms' ? 'time, ms' : xLabel}</span></div>
      <ResponsiveContainer width="100%" height={height}>
        <LineChart data={data} margin={{ top: 6, right: right ? 8 : 18, bottom: 4, left: 4 }}>
          <CartesianGrid stroke={GRID} strokeDasharray="2 4" />
          <XAxis
            dataKey={xKey} type="number" scale={logX ? 'log' : 'linear'} domain={xs} ticks={ticks} interval={0}
            allowDataOverflow tick={TICK} stroke={GRID}
            tickFormatter={(v) => (Math.abs(v) >= 1000 ? `${Number((v / 1000).toPrecision(3))}k` : Number(v.toPrecision(3)))}
          />
          <YAxis yAxisId="left" domain={yDomain || ['auto', 'auto']} tick={TICK} stroke={GRID} width={50}
            tickFormatter={(v) => Number(Number(v).toPrecision(3))}
            label={{ value: yLabel, angle: -90, position: 'insideLeft', fill: 'var(--text-3)', fontSize: 10 }} />
          {right && (
            <YAxis yAxisId="right" orientation="right" tick={TICK} stroke={GRID} width={50}
              tickFormatter={(v) => Number(Number(v).toPrecision(3))}
              label={{ value: y2Label, angle: 90, position: 'insideRight', fill: 'var(--text-3)', fontSize: 10 }} />
          )}
          <Tooltip
            contentStyle={{ background: 'var(--raised)', border: '1px solid var(--line-2)', borderRadius: 10, fontSize: 11.5 }}
            labelFormatter={(v) => `${Number(Number(v).toPrecision(5))} ${xLabel}`}
            formatter={(v) => (typeof v === 'number' ? Number(v.toPrecision(4)) : v)}
          />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          {refs.map((r, i) => (
            <ReferenceLine key={i} yAxisId="left" y={r.y} stroke={r.color || 'var(--red)'} strokeDasharray="5 4"
              label={r.label ? { value: r.label, fill: r.color || 'var(--red)', fontSize: 10, position: 'insideTopRight' } : undefined} />
          ))}
          {lines.map((l, i) => (
            <Line key={l.key} yAxisId={l.right ? 'right' : 'left'} dataKey={l.key} name={l.name}
              stroke={l.color || SERIES[i % SERIES.length]} strokeWidth={l.width || 1.5} strokeDasharray={l.dash}
              dot={false} isAnimationActive={false} connectNulls />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

/**
 * A labelled number input that writes only valid numbers.
 *
 * @param {object} props - Component props.
 * @param {string} props.label - Label.
 * @param {number} props.value - Current value.
 * @param {Function} props.onChange - Called with a new number.
 * @param {string} [props.unit] - Unit after the input.
 * @param {number} [props.min] - Smallest accepted.
 * @param {number} [props.step] - Input step.
 * @param {string} [props.title] - Tooltip.
 * @returns {React.ReactElement} The row.
 * @pure
 */
function Num({ label, value, onChange, unit, min, step, title }) {
  return (
    <div className="param-row">
      <label title={title || ''}>{label}</label>
      <input type="number" value={value} step={step || 'any'} min={min}
        onChange={(e) => { const v = parseFloat(e.target.value); if (Number.isFinite(v) && (min == null || v >= min)) onChange(v) }} />
      <span className="unit">{unit || ''}</span>
    </div>
  )
}

/**
 * A labelled select.
 *
 * @param {object} props - Component props.
 * @param {string} props.label - Label.
 * @param {*} props.value - Current value.
 * @param {Array} props.options - `[value, text]` pairs.
 * @param {Function} props.onChange - Called with the chosen value (numbers stay numbers).
 * @param {string} [props.title] - Tooltip.
 * @returns {React.ReactElement} The row.
 * @pure
 */
function Pick({ label, value, options, onChange, title }) {
  return (
    <div className="param-row">
      <label title={title || ''}>{label}</label>
      <select value={value} onChange={(e) => {
        const o = options.find(([v]) => String(v) === e.target.value)
        onChange(o ? o[0] : e.target.value)
      }}>
        {options.map(([v, t]) => <option key={String(v)} value={String(v)}>{t}</option>)}
      </select>
      <span className="unit" />
    </div>
  )
}

/**
 * A labelled checkbox.
 *
 * @param {object} props - Component props.
 * @param {string} props.label - Label.
 * @param {boolean} props.checked - State.
 * @param {Function} props.onChange - Called with the new state.
 * @param {string} [props.title] - Tooltip.
 * @returns {React.ReactElement} The row.
 * @pure
 */
function Check({ label, checked, onChange, title }) {
  return (
    <label className="td-check" title={title || ''}>
      <input type="checkbox" checked={!!checked} onChange={(e) => onChange(e.target.checked)} />{label}
    </label>
  )
}

/**
 * The display name of a node, by id.
 *
 * @param {Array<object>} nodes - Graph nodes.
 * @param {string} id - Node id.
 * @returns {string} Its label, or the id.
 * @pure
 */
const nameOf = (nodes, id) => nodes.find((n) => n.id === id)?.data.params.label || id

/**
 * Whether a result was run from the project as it now stands.
 *
 * @param {object|null} res - A result carrying the `sig` it was run from.
 * @returns {boolean} True when the project has changed since.
 * @sideEffect Subscribes to the store.
 */
function useStale(res) {
  const sig = useStore((s) => (s.tdOpen ? s.tdSignature() : ''))
  return !!res && res.sig !== sig
}

/**
 * The banner a view shows when its result no longer matches the project.
 *
 * @param {object} props - Component props.
 * @param {boolean} props.stale - Whether to show it.
 * @param {Function} [props.onRun] - Re-run; omitted where the view re-runs itself.
 * @returns {React.ReactElement|null} The banner.
 * @pure
 */
function StaleBanner({ stale, onRun }) {
  if (!stale) return null
  return (
    <div className="td-stale">
      The project has changed since this was run.
      {onRun && <button onClick={onRun}>Run again</button>}
    </div>
  )
}

// ------------------------------------------------------------ linear ---

/**
 * Controls for the linear responses.
 *
 * @param {object} props - Component props.
 * @param {object} props.cfg - The linear settings.
 * @param {Function} props.set - Writes a patch to them.
 * @param {object} props.view - Display choices: `{windowMs}`.
 * @param {Function} props.setView - Writes display choices.
 * @returns {React.ReactElement} The controls.
 * @pure
 */
function LinearControls({ cfg, set, view, setView }) {
  return (
    <>
      <div className="td-section">
        <h4>Model</h4>
        <Num label="Bandwidth" value={cfg.bandwidth} unit="Hz" min={100} onChange={(v) => set({ bandwidth: v })}
          title="Highest frequency solved. Sets the time resolution: samples are 1/(2 × bandwidth) apart." />
        <Pick label="Resolution" value={cfg.resolution} onChange={(v) => set({ resolution: v })}
          title="Frequency step of the sweep. Its inverse is how long the responses are before they wrap."
          options={[[1, '1 Hz (1 s)'], [0.5, '0.5 Hz (2 s)'], [0.25, '0.25 Hz (4 s)']]} />
      </div>
      <div className="td-section">
        <h4>Tone burst</h4>
        <Num label="Frequency" value={cfg.burstHz} unit="Hz" min={1} onChange={(v) => set({ burstHz: v })} />
        <Num label="Cycles" value={cfg.burstCycles} min={1} step={0.5} onChange={(v) => set({ burstCycles: v })}
          title="Hann-windowed. 6.5 cycles is the CEA-2010 burst." />
      </div>
      <div className="td-section">
        <h4>Decay (CSD)</h4>
        <Num label="Slices" value={cfg.csdSlices} min={2} step={1} onChange={(v) => set({ csdSlices: Math.round(v) })} />
        <Num label="Step" value={cfg.csdStepMs} unit="ms" min={0.5} onChange={(v) => set({ csdStepMs: v })} />
      </div>
      <div className="td-section">
        <h4>View</h4>
        <Num label="Show first" value={view.windowMs} unit="ms" min={5} onChange={(v) => setView({ ...view, windowMs: v })} />
        <Check label="Driver alone" checked={view.driver} onChange={(v) => setView({ ...view, driver: v })}
          title="Add the exposed driver faces' own output beside the total" />
      </div>
      <div className="td-note">
        Exact for the linear model: an inverse FFT of a fine frequency sweep of
        the same circuit. Impulse and step are per volt of the first channel;
        the burst plays at the channels' own levels. Pressure is at 1 m.
        Updates by itself while this tab is open.
      </div>
    </>
  )
}

/**
 * The linear response charts.
 *
 * @param {object} props - Component props.
 * @param {object|null} props.res - The linear result.
 * @param {object} props.view - Display choices.
 * @returns {React.ReactElement} The charts.
 * @sideEffect Subscribes to the store.
 */
function LinearView({ res, view }) {
  const nodes = useStore((s) => s.nodes)
  const stale = useStale(res)
  const charts = useMemo(() => {
    if (!res) return null
    const tMax = view.windowMs / 1000
    const drivers = Object.keys(res.impulse.excursion)
    /**
     * Rows and lines for one response family.
     *
     * @param {object} fam - `{pressure, driverPressure, excursion}` for impulse, step or burst.
     * @param {boolean} withSignal - Include the burst signal itself.
     * @returns {{rows: object[], lines: object[], xl: object[]}} Pressure rows and lines, and excursion lines.
     * @pure
     */
    const build = (fam, withSignal) => {
      const series = { p: fam.pressure }
      if (view.driver) series.pd = fam.driverPressure
      for (const id of drivers) series[`x_${id}`] = fam.excursion[id]
      if (withSignal) series.sig = fam.signal
      const rows = timeRows(res.t, series, tMax)
      const lines = [{ key: 'p', name: 'Pressure', width: 2 }]
      if (view.driver) lines.push({ key: 'pd', name: 'Driver alone', dash: '5 3' })
      const xl = drivers.map((id, i) => ({ key: `x_${id}`, name: `Excursion ${nameOf(nodes, id)}`, right: true, color: SERIES[(i + 2) % SERIES.length] }))
      return { rows, lines, xl }
    }
    const csdRows = []
    const first = res.csd.slices[0]
    if (first) {
      for (let k = 1; k < first.db.length; k++) {
        const hz = k * first.df
        if (hz > res.fs / 2 * 0.9) break
        const row = { hz }
        res.csd.slices.forEach((s, j) => { row[`s${j}`] = s.db[k] })
        csdRows.push(row)
      }
    }
    return { imp: build(res.impulse, false), step: build(res.step, false), burst: build({ ...res.burst, signal: res.burst.signal }, false), csdRows }
  }, [res, view, nodes])
  if (!res) return <div className="td-empty">Solving…</div>
  return (
    <>
      <StaleBanner stale={stale} />
      <div className="td-grid">
        <TdChart title="Impulse response" data={charts.imp.rows} lines={[...charts.imp.lines, ...charts.imp.xl]} yLabel="Pa/V·s" y2Label="mm/V·s" />
        <TdChart title="Step response" data={charts.step.rows} lines={[...charts.step.lines, ...charts.step.xl]} yLabel="Pa/V" y2Label="mm/V" />
        <TdChart title={`Tone burst, ${res.burst.hz} Hz × ${res.burst.cycles} cycles`} data={charts.burst.rows} lines={[...charts.burst.lines, ...charts.burst.xl]} yLabel="Pa" y2Label="mm" />
        <TdChart title="Cumulative spectral decay" data={charts.csdRows} xKey="hz" xLabel="Hz" logX yLabel="dB SPL"
          yDomain={['dataMax - 50', 'dataMax + 3']}
          lines={res.csd.slices.map((s, j) => ({ key: `s${j}`, name: `${s.ms} ms`, color: j === 0 ? SERIES[0] : `hsl(${210 - j * (170 / res.csd.slices.length)}, 55%, ${60 - j * 3}%)`, width: j === 0 ? 2 : 1 }))} />
      </div>
    </>
  )
}

// --------------------------------------------------------- transient ---

/** Signal types offered, `[value, label]`. */
const SIGNALS = [['sine', 'Sine (steady)'], ['burst', 'Tone burst'], ['sweep', 'Log sweep'], ['noise', 'Pink noise']]

/**
 * Controls for a transient run.
 *
 * @param {object} props - Component props.
 * @param {object} props.cfg - The transient settings.
 * @param {Function} props.set - Writes a patch to them.
 * @returns {React.ReactElement} The controls.
 * @sideEffect Subscribes to the store.
 */
function TransientControls({ cfg, set }) {
  const voltage = useStore((s) => s.settings.voltage)
  const sig = cfg.signal
  /**
   * Write a patch to the signal.
   *
   * @param {object} patch - Fields to merge.
   * @returns {void}
   * @sideEffect Writes the settings.
   */
  const setSig = (patch) => set({ signal: { ...sig, ...patch } })
  return (
    <>
      <div className="td-section">
        <h4>Signal</h4>
        <Pick label="Type" value={sig.type} options={SIGNALS} onChange={(v) => setSig({ type: v })} />
        {(sig.type === 'sine' || sig.type === 'burst') && <Num label="Frequency" value={sig.hz} unit="Hz" min={1} onChange={(v) => setSig({ hz: v })} />}
        {sig.type === 'burst' && <Num label="Cycles" value={sig.cycles} min={1} step={0.5} onChange={(v) => setSig({ cycles: v })} />}
        {(sig.type === 'sweep' || sig.type === 'noise') && (
          <>
            <Num label="From" value={sig.f1} unit="Hz" min={1} onChange={(v) => setSig({ f1: v })} />
            <Num label="To" value={sig.f2} unit="Hz" min={1} onChange={(v) => setSig({ f2: v })} />
            <Num label="Length" value={sig.length} unit="s" min={0.05} onChange={(v) => setSig({ length: v })} />
          </>
        )}
        <Num label="Level" value={cfg.levelDb} unit="dB" step={1} onChange={(v) => set({ levelDb: v })}
          title="Over every channel's level. Tones peak at √2 × the channel's volts; noise has them as its RMS." />
        <div className="td-hint">Channel 1 plays {f(voltage * Math.pow(10, cfg.levelDb / 20), 2)} V RMS.</div>
      </div>
      <div className="td-section">
        <h4>Run</h4>
        <Num label="Duration" value={cfg.duration} unit="s" min={0.01} onChange={(v) => set({ duration: v })} />
        <Pick label="Sample rate" value={cfg.fs} onChange={(v) => set({ fs: v })}
          title="Samples per second in the result. The solver steps at least this finely, so higher rates cost proportionally more; 8 kHz covers a 1 kHz model band."
          options={[[4000, '4 kHz'], [8000, '8 kHz'], [16000, '16 kHz'], [24000, '24 kHz'], [48000, '48 kHz']]} />
        <Num label="Model band" value={cfg.bandwidth} unit="Hz" min={100} onChange={(v) => set({ bandwidth: v })}
          title="Highest frequency the model represents. Ducts are sliced for it; a lower band runs faster." />
        <Check label="Nonlinear" checked={cfg.nonlinear} onChange={(v) => set({ nonlinear: v })}
          title="Use the driver curves (Bl, Kms, Le) and the duct exit losses" />
        <Check label="Compare with linear" checked={cfg.compareLinear} onChange={(v) => set({ compareLinear: v })}
          title="Also run with the nonlinear parts off, and overlay it" />
      </div>
    </>
  )
}

/**
 * The transient result: waveforms, summary and output spectrum.
 *
 * @param {object} props - Component props.
 * @param {object|null} props.res - The transient result.
 * @param {Function} props.onRun - Starts a run.
 * @returns {React.ReactElement} The view.
 * @sideEffect Subscribes to the store.
 */
function TransientView({ res, onRun }) {
  const nodes = useStore((s) => s.nodes)
  const stale = useStale(res)
  const charts = useMemo(() => {
    if (!res) return null
    const { run, linear } = res
    const drivers = Object.keys(run.excursion)
    const ch = Object.keys(run.current)
    const wgs = Object.keys(run.velocity)
    const probes = Object.keys(run.probes)
    const p = timeRows(run.t, { nl: run.pressure, ...(linear ? { lin: linear.pressure } : {}) })
    const xs = {}
    drivers.forEach((id) => { xs[`x_${id}`] = run.excursion[id]; if (linear) xs[`xl_${id}`] = linear.excursion[id] })
    const x = timeRows(run.t, xs)
    const iv = {}
    ch.forEach((id) => { iv[`i_${id}`] = run.current[id]; iv[`v_${id}`] = run.voltage[id] })
    const cur = timeRows(run.t, iv)
    const vel = timeRows(run.t, Object.fromEntries(wgs.map((id) => [`w_${id}`, run.velocity[id]])))
    const prb = timeRows(run.t, Object.fromEntries(probes.map((id) => [`p_${id}`, run.probes[id].values])))
    // output spectrum: of the whole run, Hann-windowed
    /**
     * dB spectrum of a pressure waveform.
     *
     * @param {ArrayLike<number>} y - Samples.
     * @returns {Float64Array} dB SPL per bin.
     * @pure
     */
    const spec = (y) => {
      const n = y.length
      const w = Array.from(y, (v, i) => v * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (n - 1))))
      const S = rfft(w)
      return Float64Array.from(S.re, (re, k) => splOf((Math.hypot(re, S.im[k]) * 2 * 2) / n / Math.SQRT2))
    }
    const sN = spec(run.pressure)
    const sL = linear ? spec(linear.pressure) : null
    const bins = sN.length
    const df = res.fs / ((bins - 1) * 2)
    const spRows = []
    const top = Math.min(res.fs / 2, 2000)
    for (let k = 1; k < bins && k * df <= top; k++) spRows.push({ hz: k * df, nl: sN[k], ...(sL ? { lin: sL[k] } : {}) })
    const thinned = spRows.length > MAX_POINTS ? spRows.filter((_, i) => i % Math.ceil(spRows.length / MAX_POINTS) === 0) : spRows
    const xmax = Object.fromEntries(drivers.map((id) => [id, Number(nodes.find((n) => n.id === id)?.data.params.Xmax) || 0]))
    return { p, x, cur, vel, prb, drivers, ch, wgs, probes, spRows: thinned, xmax }
  }, [res, nodes])
  if (!res) {
    return (
      <div className="td-empty">
        Choose a signal and press <b>Run</b>. A transient run solves the circuit
        step by step in time, so it takes seconds rather than milliseconds —
        and with <b>Nonlinear</b> on, the driver curves and duct exit losses
        shape the result.
        <div style={{ marginTop: 10 }}><button className="primary" onClick={onRun}>Run</button></div>
      </div>
    )
  }
  const { run, linear } = res
  const pk = levels(run.pressure).peak
  const cmpNote = res.opts.nonlinear && !linear && res.opts.compareLinear ? ' (nothing nonlinear in this project, so no separate linear run)' : ''
  return (
    <>
      <StaleBanner stale={stale} onRun={onRun} />
      <div className="td-summary">
        <span>Peak pressure <b>{f(pk, 2)} Pa</b> = <b>{f(splOf(pk / Math.SQRT2))} dB</b> RMS-equivalent at 1 m</span>
        {charts.drivers.map((id) => {
          const x = levels(run.excursion[id]).peak
          const over = charts.xmax[id] > 0 && x > charts.xmax[id]
          return <span key={id}>{nameOf(nodes, id)} peak excursion <b className={over ? 'bad' : ''}>{f(x, 2)} mm</b>{charts.xmax[id] ? ` of ${charts.xmax[id]} Xmax` : ''}</span>
        })}
        {charts.ch.map((id) => <span key={id}>Peak current <b>{f(levels(run.current[id]).peak, 2)} A</b></span>)}
        <span className="dim">{res.opts.nonlinear ? `Nonlinear${linear ? ', linear dashed' : ''}${cmpNote}` : 'Linear'}</span>
      </div>
      <div className="td-grid">
        <TdChart title="Pressure at 1 m" data={charts.p} yLabel="Pa"
          lines={[{ key: 'nl', name: res.opts.nonlinear ? 'Nonlinear' : 'Linear', width: 2 }, ...(linear ? [{ key: 'lin', name: 'Linear', dash: '5 3', color: 'var(--text-2)' }] : [])]} />
        <TdChart title="Cone excursion" data={charts.x} yLabel="mm"
          refs={charts.drivers.flatMap((id) => (charts.xmax[id] ? [{ y: charts.xmax[id], label: 'Xmax' }, { y: -charts.xmax[id] }] : []))}
          lines={charts.drivers.flatMap((id, i) => [
            { key: `x_${id}`, name: nameOf(nodes, id), width: 2, color: SERIES[i % SERIES.length] },
            ...(linear ? [{ key: `xl_${id}`, name: `${nameOf(nodes, id)} linear`, dash: '5 3', color: 'var(--text-2)' }] : []),
          ])} />
        <TdChart title="Amplifier current and voltage" data={charts.cur} yLabel="A" y2Label="V"
          lines={charts.ch.flatMap((id, i) => [
            { key: `i_${id}`, name: `Current ${id}`, color: SERIES[i % SERIES.length], width: 2 },
            { key: `v_${id}`, name: `Voltage ${id}`, right: true, dash: '4 3', color: SERIES[(i + 3) % SERIES.length] },
          ])} />
        {charts.wgs.length > 0 && (
          <TdChart title="Duct air velocity" data={charts.vel} yLabel="m/s"
            lines={charts.wgs.map((id, i) => ({ key: `w_${id}`, name: nameOf(nodes, id), color: SERIES[i % SERIES.length] }))} />
        )}
        <TdChart title="Output spectrum" data={charts.spRows} xKey="hz" xLabel="Hz" logX yLabel="dB SPL" yDomain={['dataMax - 90', 'dataMax + 5']}
          lines={[{ key: 'nl', name: res.opts.nonlinear ? 'Nonlinear' : 'Linear', width: 1.5 }, ...(linear ? [{ key: 'lin', name: 'Linear', dash: '5 3', color: 'var(--text-2)' }] : [])]} />
        {charts.probes.length > 0 && (
          <TdChart title="Probes" data={charts.prb} yLabel="Pa · m³/s · m/s"
            lines={charts.probes.map((id, i) => ({ key: `p_${id}`, name: `${id} (${run.probes[id].kind})`, color: SERIES[i % SERIES.length] }))} />
        )}
      </div>
    </>
  )
}

// -------------------------------------------------------- distortion ---

/** Distortion analyses, `[value, label]`. */
const MODES = [
  ['harmonics', 'Harmonics at one frequency'],
  ['thd', 'THD across frequency'],
  ['compression', 'Compression across level'],
  ['maxspl', 'Maximum SPL (CEA-2010 style)'],
]

/**
 * Parse a comma-separated list of numbers.
 *
 * @param {string} text - The list.
 * @returns {number[]} The finite numbers in it.
 * @pure
 */
const numList = (text) => String(text).split(/[\s,;]+/).map(Number).filter(Number.isFinite)

/**
 * Controls for the distortion analyses.
 *
 * @param {object} props - Component props.
 * @param {object} props.cfg - The distortion settings.
 * @param {Function} props.set - Writes a patch to them.
 * @returns {React.ReactElement} The controls.
 * @pure
 */
function DistortionControls({ cfg, set }) {
  const m = cfg.mode
  return (
    <>
      <div className="td-section">
        <h4>Analysis</h4>
        <Pick label="Measure" value={m} options={MODES} onChange={(v) => set({ mode: v })} />
      </div>
      <div className="td-section">
        <h4>Settings</h4>
        {m === 'harmonics' && <Num label="Frequency" value={cfg.hz} unit="Hz" min={1} onChange={(v) => set({ hz: v })} />}
        {(m === 'thd' || m === 'compression') && (
          <>
            <Num label="From" value={cfg.f1} unit="Hz" min={1} onChange={(v) => set({ f1: v })} />
            <Num label="To" value={cfg.f2} unit="Hz" min={1} onChange={(v) => set({ f2: v })} />
            <Num label="Points" value={cfg.points} min={2} step={1} onChange={(v) => set({ points: Math.round(v) })} />
          </>
        )}
        {m !== 'compression' && m !== 'maxspl' && (
          <Num label="Level" value={cfg.levelDb} unit="dB" step={1} onChange={(v) => set({ levelDb: v })}
            title="Over every channel's level" />
        )}
        {m === 'compression' && (
          <div className="param-row">
            <label title="Levels over every channel's level, dB">Levels</label>
            <input defaultValue={cfg.levels.join(', ')} onBlur={(e) => { const l = numList(e.target.value); if (l.length) set({ levels: l }) }} />
            <span className="unit">dB</span>
          </div>
        )}
        {m === 'maxspl' && (
          <>
            <div className="param-row">
              <label title="Burst frequencies, Hz — CEA-2010 uses the third-octave centres from 20 Hz">Bands</label>
              <input defaultValue={cfg.bands.join(', ')} onBlur={(e) => { const l = numList(e.target.value); if (l.length) set({ bands: l }) }} />
              <span className="unit">Hz</span>
            </div>
            <Num label="Excursion limit" value={cfg.xLimit} unit="×Xmax" min={0} step={0.1} onChange={(v) => set({ xLimit: v })}
              title="Stop where a cone passes this multiple of its Xmax. 0 for no limit." />
            <Num label="Start level" value={cfg.levelDb} unit="dB" step={1} onChange={(v) => set({ levelDb: v })} />
          </>
        )}
        {m !== 'maxspl' && <Num label="Harmonics" value={cfg.harmonics} min={2} step={1} onChange={(v) => set({ harmonics: Math.round(v) })} />}
        <Num label="Model band" value={cfg.bandwidth} unit="Hz" min={100} onChange={(v) => set({ bandwidth: v })} />
        <Check label="Nonlinear" checked={cfg.nonlinear} onChange={(v) => set({ nonlinear: v })}
          title="Off measures the numerical floor of the linear model" />
      </div>
      <div className="td-note">
        {m === 'harmonics' && 'One steady tone: settles, then whole periods are analysed, so the harmonics are exact.'}
        {m === 'thd' && 'A steady tone at each frequency — about a second of computing each.'}
        {m === 'compression' && 'Each frequency at each level, against the linear model at the same level. Levels × points runs.'}
        {m === 'maxspl' && `A 6.5-cycle Hann burst per band, raised 3 dB at a time and then narrowed to 0.25 dB, until the harmonics pass the CEA-2010 limits (H2 ${CEA2010_LIMITS[2]} dB, H3 ${CEA2010_LIMITS[3]} dB, H4–5 −20 dB, H6–7 −30 dB, H8–10 −40 dB) or a cone passes its excursion limit.`}
      </div>
    </>
  )
}

/**
 * Convert a level re the fundamental to a percentage.
 *
 * @param {number} db - dB relative to the fundamental.
 * @returns {number} Percent.
 * @pure
 */
const pct = (db) => 100 * Math.pow(10, db / 20)

/**
 * The distortion result for the selected analysis.
 *
 * @param {object} props - Component props.
 * @param {string} props.mode - The analysis.
 * @param {object|null} props.res - Its result.
 * @param {Function} props.onRun - Starts a run.
 * @returns {React.ReactElement} The view.
 * @sideEffect Subscribes to the store.
 */
function DistortionView({ mode, res, onRun }) {
  const nodes = useStore((s) => s.nodes)
  const voltage = useStore((s) => s.settings.voltage)
  const stale = useStale(res)
  if (!res) {
    return (
      <div className="td-empty">
        Press <b>Run</b> to measure. Distortion needs the circuit solved in time
        at every frequency and level asked for, so a sweep takes a while; the
        frequency response stays live meanwhile.
        <div style={{ marginTop: 10 }}><button className="primary" onClick={onRun}>Run</button></div>
      </div>
    )
  }
  if (mode === 'harmonics') {
    // Bars rise from a −120 dB floor, so a taller bar is a louder harmonic.
    const FLOOR = -120
    const bars = res.harmonics.slice(1).map((h) => ({ name: `H${h.n}`, n: h.n, db: h.db, up: Math.max(h.db, FLOOR) - FLOOR, hz: h.hz }))
    const wave = res.waveform.t.map((t, i) => ({ ms: (t - res.waveform.t[0]) * 1000, p: res.waveform.pressure[i] }))
    return (
      <>
        <StaleBanner stale={stale} onRun={onRun} />
        <div className="td-summary">
          <span>{res.hz} Hz at {res.levelDb >= 0 ? '+' : ''}{res.levelDb} dB</span>
          <span>Fundamental <b>{f(res.spl)} dB SPL</b></span>
          <span>THD <b>{f(res.thd * 100, 2)} %</b></span>
          {Object.entries(res.xPeak).map(([id, x]) => <span key={id}>{nameOf(nodes, id)} <b>{f(x, 2)} mm</b> peak</span>)}
          <span>Peak current <b>{f(res.currentPeak, 2)} A</b></span>
        </div>
        <div className="td-grid">
          <div className="td-chart">
            <div className="td-chart-title">Harmonics, dB relative to the fundamental — <span style={{ color: SERIES[1] }}>even</span>, <span style={{ color: SERIES[0] }}>odd</span></div>
            <ResponsiveContainer width="100%" height={230}>
              <BarChart data={bars} margin={{ top: 6, right: 18, bottom: 6, left: 4 }}>
                <CartesianGrid stroke={GRID} strokeDasharray="2 4" />
                <XAxis dataKey="name" tick={TICK} stroke={GRID} />
                <YAxis tick={TICK} stroke={GRID} width={50} domain={[0, -FLOOR]} ticks={[0, 20, 40, 60, 80, 100, 120]} tickFormatter={(v) => v + FLOOR} />
                <Tooltip contentStyle={{ background: 'var(--raised)', border: '1px solid var(--line-2)', borderRadius: 10, fontSize: 11.5 }}
                  formatter={(_v, _n, p) => [`${f(p.payload.db)} dB (${f(pct(p.payload.db), 3)} %)`, `${p.payload.hz} Hz`]} />
                <Bar dataKey="up" isAnimationActive={false}>
                  {bars.map((b) => <Cell key={b.n} fill={b.n % 2 ? SERIES[0] : SERIES[1]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <TdChart title="Waveform, steady state" data={wave} yLabel="Pa" lines={[{ key: 'p', name: 'Pressure at 1 m', width: 2 }]} />
        </div>
      </>
    )
  }
  if (mode === 'thd') {
    const rows = res.rows.map((r) => ({ hz: r.hz, thd: r.thd != null ? r.thd * 100 : null, h2: r.h2 != null ? pct(r.h2) : null, h3: r.h3 != null ? pct(r.h3) : null }))
    return (
      <>
        <StaleBanner stale={stale} onRun={onRun} />
        <FailedPoints failed={res.failed} />
        <div className="td-grid one">
          <TdChart title={`Distortion at ${res.levelDb >= 0 ? '+' : ''}${res.levelDb} dB`} data={rows} xKey="hz" xLabel="Hz" logX yLabel="%" height={340}
            lines={[{ key: 'thd', name: 'THD', width: 2.5 }, { key: 'h2', name: 'H2' }, { key: 'h3', name: 'H3' }]} />
          <TdChart title="Fundamental" data={res.rows} xKey="hz" xLabel="Hz" logX yLabel="dB SPL" lines={[{ key: 'spl', name: 'SPL at 1 m', width: 2 }]} />
        </div>
      </>
    )
  }
  if (mode === 'compression') {
    return (
      <>
        <StaleBanner stale={stale} onRun={onRun} />
        <FailedPoints failed={res.failed} />
        <div className="td-grid one">
          <TdChart title="Compression: nonlinear level minus linear level" data={res.rows} xKey="hz" xLabel="Hz" logX yLabel="dB" height={320}
            refs={[{ y: 0, color: 'var(--text-3)' }]}
            lines={res.levels.map((L, i) => ({ key: `cmp${L}`, name: `${L >= 0 ? '+' : ''}${L} dB`, color: SERIES[i % SERIES.length], width: 2 }))} />
          <TdChart title="Output level" data={res.rows} xKey="hz" xLabel="Hz" logX yLabel="dB SPL"
            lines={res.levels.map((L, i) => ({ key: `spl${L}`, name: `${L >= 0 ? '+' : ''}${L} dB`, color: SERIES[i % SERIES.length] }))} />
        </div>
      </>
    )
  }
  return (
    <>
      <StaleBanner stale={stale} onRun={onRun} />
      <FailedPoints failed={res.failed} />
      <div className="td-grid one">
        <TdChart title="Maximum SPL, burst peak as RMS-equivalent at 1 m" data={res.rows.filter((r) => r.spl != null)} xKey="hz" xLabel="Hz" logX yLabel="dB SPL" height={300}
          lines={[{ key: 'spl', name: 'Max SPL', width: 2.5 }]} />
        <table className="td-table">
          <thead><tr><th>Band</th><th>Max SPL</th><th>Level</th><th>Channel 1</th><th>Limited by</th><th>Peak excursion</th></tr></thead>
          <tbody>
            {res.rows.map((r) => (
              <tr key={r.hz}>
                <td>{r.hz} Hz</td>
                <td>{r.spl != null ? `${f(r.spl)} dB` : '—'}</td>
                <td>{r.levelDb != null ? `${r.levelDb >= 0 ? '+' : ''}${f(r.levelDb, 2)} dB` : '—'}</td>
                <td>{r.levelDb != null ? `${f(voltage * Math.pow(10, r.levelDb / 20), 1)} V RMS` : '—'}</td>
                <td>{r.limit}</td>
                <td>{r.xPeak ? Object.entries(r.xPeak).map(([id, x]) => `${nameOf(nodes, id)} ${f(x, 1)} mm`).join(', ') : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}

/**
 * Points of a distortion analysis that could not be solved, and why.
 *
 * @param {object} props - Props.
 * @param {Array<{label: string, error: string}>} [props.failed] - The points.
 * @returns {React.ReactElement|null} A notice, or nothing when every point solved.
 * @pure
 */
function FailedPoints({ failed }) {
  if (!failed?.length) return null
  return (
    <div className="td-failed">
      <b>{failed.length === 1 ? 'One point' : `${failed.length} points`} could not be solved</b> and {failed.length === 1 ? 'is' : 'are'} left out:
      <ul>{failed.slice(0, 6).map((x) => <li key={x.label}>{x.label} — {x.error}</li>)}</ul>
      {failed.length > 6 && <div>…and {failed.length - 6} more.</div>}
    </div>
  )
}

// -------------------------------------------------------- nonlinear ---

/**
 * Duct exit losses, listed for every waveguide.
 *
 * @returns {React.ReactElement} The section.
 * @sideEffect Subscribes to the store.
 */
function ExitLosses() {
  const nodes = useStore((s) => s.nodes)
  const updateParams = useStore((s) => s.updateParams)
  const wgs = nodes.filter((n) => n.type === 'waveguide')
  return (
    <div className="td-section">
      <h4>Duct exit losses</h4>
      <div className="td-note" style={{ marginTop: 0 }}>
        Flow separating where a duct opens into a bigger space loses K·½ρv²:
        about 1 for a sharp edge, 0.5 for a small radius, 0.2 for a generous
        flare. Only where the duct meets a larger area or open air, and only in
        nonlinear runs.
      </div>
      {!wgs.length && <div className="td-hint">No waveguides.</div>}
      {wgs.map((n) => (
        <div key={n.id} className="td-exit">
          <div className="td-exit-name">{n.data.params.label || n.id}</div>
          {['throatK', 'mouthK'].map((k) => (
            <div className="param-row" key={k}>
              <label>{k === 'throatK' ? 'Throat K' : 'Mouth K'}</label>
              <input type="number" step="0.1" min="0" value={n.data.params[k] ?? 0}
                onChange={(e) => { const v = parseFloat(e.target.value); if (v >= 0) updateParams(n.id, { [k]: v }) }} />
              <span className="unit" />
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}

// ------------------------------------------------------------ window ---

/**
 * The running job's progress, with a cancel button.
 *
 * @returns {React.ReactElement|null} The indicator, or nothing when idle.
 * @sideEffect Subscribes to the store.
 */
function JobStatus() {
  const job = useStore((s) => s.tdJob)
  const cancel = useStore((s) => s.cancelTimeDomain)
  if (!job) return null
  return (
    <div className="td-job">
      <div className="td-bar"><div style={{ width: `${Math.round(job.fraction * 100)}%` }} /></div>
      <span>{job.message}</span>
      <button onClick={cancel}>Cancel</button>
    </div>
  )
}

/**
 * The time-domain workspace: its own full-screen view under the menu and quick bar.
 *
 * Four tabs — the linear time responses, which follow the project by
 * themselves; transient runs; distortion measurements; and the driver curve
 * editor. Transient and distortion run only when asked, since they take
 * seconds to minutes, and a result says when the project has changed since.
 *
 * @returns {React.ReactElement} The window.
 * @sideEffect Subscribes to the store, and starts the linear responses when they are out of date.
 */
export default function TimeDomainWindow() {
  const tab = useStore((s) => s.tdTab)
  const setTab = useStore((s) => s.setTdTab)
  const close = useStore((s) => s.closeTimeDomain)
  const extras = useStore((s) => s.projectExtras)
  const setTd = useStore((s) => s.setTdSettings)
  const run = useStore((s) => s.runTimeDomain)
  const results = useStore((s) => s.tdResults)
  const job = useStore((s) => s.tdJob)
  const error = useStore((s) => s.tdError)
  const sig = useStore((s) => s.tdSignature())
  const hasNodes = useStore((s) => s.nodes.length > 0)
  const cfg = tdSettingsOf(extras)
  const [view, setView] = useState({ windowMs: 200, driver: false })

  // The linear responses follow the project while their tab is open.
  const lin = results.linear
  const linKey = JSON.stringify(cfg.linear)
  useEffect(() => {
    if (tab !== 'linear' || !hasNodes || job) return undefined
    if (lin && lin.sig === sig && JSON.stringify(lin.opts) === linKey) return undefined
    const t = setTimeout(() => useStore.getState().runTimeDomain('linear'), 350)
    return () => clearTimeout(t)
  }, [tab, sig, linKey, lin, job, hasNodes])

  const dmode = cfg.distortion.mode
  const running = job && (job.kind === tab)
  return (
    <div className="td-window">
      <div className="td-head">
        <span className="td-title">Time domain</span>
        <div className="td-tabs">
          {TABS.map(([id, label]) => (
            <button key={id} className={tab === id ? 'active' : ''} onClick={() => setTab(id)}>{label}</button>
          ))}
        </div>
        <JobStatus />
        <span style={{ flex: 1 }} />
        {(tab === 'transient' || tab === 'distortion') && (
          <button className="primary" disabled={!hasNodes || !!running} onClick={() => run(tab)}>
            {running ? 'Running…' : 'Run'}
          </button>
        )}
        <button onClick={close} title="Back to the editor (Alt+T)">Close ✕</button>
      </div>
      {error && <div className="err-banner">{error}</div>}
      {tab === 'nonlinear' ? (
        <div className="td-body">
          <aside className="td-side"><ExitLosses /></aside>
          <main className="td-main td-main-nl"><NLLab /></main>
        </div>
      ) : (
        <div className="td-body">
          <aside className="td-side">
            {tab === 'linear' && <LinearControls cfg={cfg.linear} set={(p) => setTd('linear', p)} view={view} setView={setView} />}
            {tab === 'transient' && <TransientControls cfg={cfg.transient} set={(p) => setTd('transient', p)} />}
            {tab === 'distortion' && <DistortionControls cfg={cfg.distortion} set={(p) => setTd('distortion', p)} />}
          </aside>
          <main className="td-main">
            {tab === 'linear' && <LinearView res={lin} view={view} />}
            {tab === 'transient' && <TransientView res={results.transient} onRun={() => run('transient')} />}
            {tab === 'distortion' && <DistortionView mode={dmode} res={results.distortion[dmode] || null} onRun={() => run('distortion')} />}
          </main>
        </div>
      )}
    </div>
  )
}
