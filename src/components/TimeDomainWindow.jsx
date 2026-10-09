import React, { useEffect, useMemo, useState } from 'react'
import { useStore, tdSettingsOf, isLocked } from '../store'
import { LockNote } from './Records'
import { decimate } from '../spice/dsp'
import NLLab, { NLRail } from './NLLab'
import { RunLibrary, RunViewer, NewRunDrawer } from './TdRuns'
import NumInput from './NumInput'
import PlotChart from './PlotChart'
import { displayName } from '../nodeNames'

/** Trace colours, shared with the frequency charts. */
export const SERIES = ['var(--c1)', 'var(--c2)', 'var(--c3)', 'var(--c4)', 'var(--c5)', 'var(--c6)']
/** Most points drawn per trace; longer series are thinned keeping their peaks. */
const MAX_POINTS = 1600

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
 * @param {Array<object>} props.lines - `{key, name, color?, dash?, right?, width?, legend?}` per trace; `legend: false` leaves it out of the legend.
 * @param {string} [props.xKey] - Row field for x; `ms` by default.
 * @param {string} [props.xLabel] - X axis label.
 * @param {boolean} [props.logX] - Logarithmic x axis.
 * @param {boolean} [props.logY] - Logarithmic left axis; give `yDomain` with it.
 * @param {string} props.yLabel - Left axis label.
 * @param {string} [props.y2Label] - Right axis label, when some trace uses it.
 * @param {Array} [props.yDomain] - Left axis domain.
 * @param {Array<object>} [props.refs] - `{y, label, color}` horizontal reference lines on the left axis.
 * @param {number} [props.height] - Height, px.
 * @param {number[]} [props.yTicks] - Left axis ticks, in place of the automatic ones.
 * @param {Function} [props.yTickLabel] - `(value) → text` for the left axis ticks.
 * @param {boolean} [props.legend] - Show the legend; on by default.
 * @param {boolean} [props.bare] - Leave out the card background and title, for a chart inside a card of its own.
 * @returns {React.ReactElement} The chart.
 * @pure
 */
export function TdChart({ title, data, lines, xKey = 'ms', xLabel = 'ms', logX = false, logY = false, yLabel, y2Label, yDomain, refs = [], height = 230, yTicks, yTickLabel, legend = true, bare = false }) {
  const series = useMemo(() => {
    const xs = data.map((r) => r[xKey])
    return lines.map((l, i) => {
      // rows hold every trace; a trace's own points are the rows it has a value in
      const x = []
      const y = []
      for (let k = 0; k < data.length; k++) {
        const v = data[k][l.key]
        if (v != null && Number.isFinite(v)) { x.push(xs[k]); y.push(v) }
      }
      return { key: l.key, name: l.name, color: l.color || SERIES[i % SERIES.length], dash: l.dash, width: l.width, legend: l.legend, right: l.right, marker: l.marker, x, y }
    })
  }, [data, lines, xKey])
  const ticks = useMemo(() => (yTicks ? yTicks.map((y) => ({ y, label: yTickLabel ? yTickLabel(y) : String(y) })) : undefined), [yTicks, yTickLabel])
  return (
    <div className={bare ? 'td-chart bare' : 'td-chart'} style={bare ? { height: '100%' } : undefined}>
      <PlotChart title={bare ? undefined : title} xunit={xKey === 'ms' || xLabel === 'ms' ? 'time, ms' : xLabel} ylabel={yLabel} y2label={y2Label}
        series={series} logX={logX} logY={logY} yDomain={yDomain} refs={refs} yTicks={ticks} legend={legend}
        height={bare ? undefined : height + 34} />
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
      <NumInput value={value} step={step} min={min} onCommit={onChange} />
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
 * @returns {string} Its shown name, numbered when another component shares it; the id when there is no such node.
 * @pure
 */
const nameOf = (nodes, id) => displayName(nodes, id)

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
          <div className="td-exit-name">{displayName(nodes, n.id)}</div>
          {['throatK', 'mouthK'].map((k) => (
            <div className="param-row" key={k}>
              <label>{k === 'throatK' ? 'Throat K' : 'Mouth K'}</label>
              <NumInput step="0.1" min="0" value={n.data.params[k] ?? 0}
                onCommit={(v) => updateParams(n.id, { [k]: v })} />
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
 * The running job's progress, with a cancel button and how many wait behind it.
 *
 * @returns {React.ReactElement|null} The indicator, or nothing when idle.
 * @sideEffect Subscribes to the store.
 */
function JobStatus() {
  const job = useStore((s) => s.tdJob)
  const waiting = useStore((s) => s.tdQueue.filter((j) => j.status === 'queued').length)
  const cancel = useStore((s) => s.cancelTimeDomain)
  if (!job) return null
  return (
    <div className="td-job">
      <div className="td-bar"><div style={{ width: `${Math.round(job.fraction * 100)}%` }} /></div>
      <span>{job.message}{waiting ? ` · ${waiting} queued` : ''}</span>
      <button onClick={cancel} title={job.runId ? 'Cancel this run; the queue carries on' : 'Cancel'}>Cancel</button>
    </div>
  )
}

/**
 * The time-domain workspace: its own full-screen view under the menu and quick bar.
 *
 * Runs: the library of stored runs beside a viewer that shows one run, or
 * several overlaid, a tab per category of figure; runs are queued from the
 * New run drawer, solve one after another in the background, and each is
 * kept as a branch off the record it was run from. Beside them, the live
 * linear responses and the driver curve editor.
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
  const locked = useStore(isLocked)
  const results = useStore((s) => s.tdResults)
  const job = useStore((s) => s.tdJob)
  const error = useStore((s) => s.tdError)
  const sig = useStore((s) => s.tdSignature())
  const hasNodes = useStore((s) => s.nodes.length > 0)
  const drawer = useStore((s) => s.tdDrawer)
  const setDrawer = useStore((s) => s.setTdDrawer)
  const cfg = tdSettingsOf(extras)
  const [view, setView] = useState({ windowMs: 200, driver: false })
  const onRuns = tab !== 'linear' && tab !== 'nonlinear'

  // The linear responses follow the project while their tab is open.
  const lin = results.linear
  const linKey = JSON.stringify(cfg.linear)
  useEffect(() => {
    if (tab !== 'linear' || !hasNodes || job) return undefined
    if (lin && lin.sig === sig && JSON.stringify(lin.opts) === linKey) return undefined
    const t = setTimeout(() => useStore.getState().runTimeDomain('linear'), 350)
    return () => clearTimeout(t)
  }, [tab, sig, linKey, lin, job, hasNodes])

  return (
    <div className="td-window">
      <div className="td-head">
        <span className="td-title">Time domain</span>
        <div className="td-tabs">
          <button className={onRuns ? 'active' : ''} onClick={() => setTab('runs')}>Runs</button>
          <button className={tab === 'linear' ? 'active' : ''} onClick={() => setTab('linear')}
            title="Impulse, step, tone burst and decay of the linear model, following the project as it is edited">Linear response</button>
          <button className={tab === 'nonlinear' ? 'active' : ''} onClick={() => setTab('nonlinear')}>Driver nonlinearity</button>
        </div>
        <JobStatus />
        <span style={{ flex: 1 }} />
        <button className={drawer && onRuns ? 'td-newrun on' : 'primary'} disabled={!hasNodes} onClick={() => {
          // the drawer opens over the runs, so it brings them up
          if (!onRuns) { setTab('runs'); setDrawer(true) } else setDrawer(!drawer)
        }}>New run</button>
        <button onClick={close} title="Back to the editor (Alt+T)">Close ✕</button>
      </div>
      {error && <div className="err-banner">{error}</div>}
      {tab === 'nonlinear' && (
        <div className="td-body">
          <main className="td-main td-main-nl"><LockNote /><fieldset className="rec-fieldset" disabled={locked}><NLLab /></fieldset></main>
          <aside className="td-side td-rail"><fieldset className="rec-fieldset" disabled={locked}><NLRail /><ExitLosses /></fieldset></aside>
        </div>
      )}
      {tab === 'linear' && (
        <div className="td-body">
          <aside className="td-side">
            <LockNote />
            <fieldset className="rec-fieldset" disabled={locked}>
              <LinearControls cfg={cfg.linear} set={(p) => setTd('linear', p)} view={view} setView={setView} />
            </fieldset>
          </aside>
          <main className="td-main"><LinearView res={lin} view={view} /></main>
        </div>
      )}
      {onRuns && (
        <div className="td-runs">
          <RunLibrary />
          <RunViewer />
          {drawer && <div className="drawer-veil" onClick={() => setDrawer(false)} />}
          {drawer && <NewRunDrawer />}
        </div>
      )}
    </div>
  )
}
