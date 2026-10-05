import React, { useMemo } from 'react'
import { useStore } from '../store'
import ExprInput, { shortNum } from './ExprInput'
import { useParamValues } from '../useResolved'
import { loadLeaves } from '../schema/validate'
import { resolveNodeParams } from '../schema/params'
import { treeNominal, effectiveLoad } from '../schema/nominal'
import { valueOf, freshId } from '../schema/extras'
import { DEFAULT_CHANNEL } from '../schema/version'
import { FILTER_TYPES, FILTER_SHAPES } from '../spice/filters'

/** Display names for filter types. */
const FILTER_LABELS = {
  highpass: 'High-pass', lowpass: 'Low-pass', peq: 'Parametric EQ', lowshelf: 'Low shelf', highshelf: 'High shelf',
}

/** A new filter of each type, as added from the menu. */
const NEW_FILTER = {
  highpass: { type: 'highpass', shape: 'butterworth', order: 2, hz: 20 },
  lowpass: { type: 'lowpass', shape: 'linkwitz-riley', order: 4, hz: 80 },
  peq: { type: 'peq', hz: 50, q: 2, db: -3 },
  lowshelf: { type: 'lowshelf', hz: 40, q: 0.707, db: 3 },
  highshelf: { type: 'highshelf', hz: 100, q: 0.707, db: -3 },
}

/**
 * Replace the subtree at a path in a load tree.
 *
 * @param {object} tree - The tree.
 * @param {number[]} path - Child indices from the root.
 * @param {Function} fn - Receives the subtree, returns its replacement, or `null` to remove it.
 * @returns {object|null} The new tree.
 * @pure
 */
export function editAt(tree, path, fn) {
  if (!path.length) return fn(tree)
  const key = Array.isArray(tree.series) ? 'series' : 'parallel'
  const kids = [...tree[key]]
  const next = editAt(kids[path[0]], path.slice(1), fn)
  if (next == null) kids.splice(path[0], 1)
  else kids[path[0]] = next
  return { [key]: kids }
}

/**
 * Format ohms for a label.
 *
 * @param {number} z - Impedance, Ω.
 * @returns {string} The figure, or `open` for no load.
 * @pure
 */
const ohms = (z) => (isFinite(z) ? `${z >= 10 ? z.toFixed(0) : shortNum(Number(z.toPrecision(3)))} Ω` : 'open')

/**
 * One group in a channel's load: drivers and sub-groups in series or in parallel.
 *
 * @param {object} props - Component props.
 * @param {object} props.tree - The group.
 * @param {number[]} props.path - Its path from the channel's root.
 * @param {Function} props.onEdit - `(path, fn)` applies an edit at a path.
 * @param {Map<string, object>} props.drivers - Driver id → its node.
 * @param {string[]} props.free - Driver ids no channel has claimed.
 * @param {Map<string, object>} props.resolved - Driver id → resolved params, for nominal impedance.
 * @returns {React.ReactElement} The group.
 * @pure
 */
function LoadGroup({ tree, path, onEdit, drivers, free, resolved }) {
  const key = Array.isArray(tree.series) ? 'series' : 'parallel'
  const kids = tree[key] || []
  return (
    <div className={`load-group ${key}`}>
      <div className="load-head">
        <select value={key} onChange={(e) => onEdit(path, (t) => ({ [e.target.value]: t[key] }))} title="How the items in this group connect to each other">
          <option value="parallel">In parallel</option>
          <option value="series">In series</option>
        </select>
        <span className="load-z">{ohms(treeNominal(tree, resolved))} nominal</span>
        {path.length > 0 && <button className="icon-btn" title="Remove this group" onClick={() => onEdit(path, () => null)}>✕</button>}
      </div>
      {kids.map((k, i) => (k.driver
        ? (
          <div className="load-leaf" key={i}>
            <span>{drivers.get(k.driver)?.data.params.label || k.driver}</span>
            <span className="load-z">{ohms(treeNominal(k, resolved))}</span>
            <button className="icon-btn" title="Unwire this driver" onClick={() => onEdit([...path, i], () => null)}>✕</button>
          </div>
        )
        : <LoadGroup key={i} tree={k} path={[...path, i]} onEdit={onEdit} drivers={drivers} free={free} resolved={resolved} />))}
      <div className="load-add">
        <select value="" onChange={(e) => {
          const v = e.target.value
          if (!v) return
          const item = v === '#series' ? { series: [] } : v === '#parallel' ? { parallel: [] } : { driver: v }
          onEdit(path, (t) => ({ [key]: [...(t[key] || []), item] }))
        }}>
          <option value="">+ Add…</option>
          {free.map((id) => <option key={id} value={id}>{drivers.get(id)?.data.params.label || id}</option>)}
          <option value="#series">Series group</option>
          <option value="#parallel">Parallel group</option>
        </select>
      </div>
    </div>
  )
}

/**
 * One DSP filter's controls.
 *
 * @param {object} props - Component props.
 * @param {object} props.f - The filter.
 * @param {Function} props.onChange - Called with the edited filter, or `null` to remove it.
 * @returns {React.ReactElement} The row.
 * @pure
 */
function FilterRow({ f, onChange }) {
  const pass = f.type === 'highpass' || f.type === 'lowpass'
  return (
    <div className={`filter-row${f.bypass ? ' bypassed' : ''}`}>
      <div className="filter-head">
        <b>{FILTER_LABELS[f.type] || f.type}</b>
        <label title="Leave the filter in the list but out of the signal"><input type="checkbox" checked={!!f.bypass} onChange={(e) => onChange({ ...f, bypass: e.target.checked || undefined })} />bypass</label>
        <button className="icon-btn" title="Remove this filter" onClick={() => onChange(null)}>✕</button>
      </div>
      {pass && (
        <div className="param-row">
          <label>Alignment</label>
          <select value={f.shape || 'butterworth'} onChange={(e) => onChange({ ...f, shape: e.target.value })}>
            {FILTER_SHAPES.map((s) => <option key={s} value={s}>{s === 'butterworth' ? 'Butterworth' : 'Linkwitz-Riley'}</option>)}
          </select>
          <span className="unit" />
        </div>
      )}
      {pass && (
        <div className="param-row">
          <label>Order</label>
          <select value={f.order} onChange={(e) => onChange({ ...f, order: Number(e.target.value) })}>
            {(f.shape === 'linkwitz-riley' ? [2, 4, 6, 8] : [1, 2, 3, 4, 5, 6, 7, 8]).map((o) => <option key={o} value={o}>{o} ({o * 6} dB/oct)</option>)}
          </select>
          <span className="unit" />
        </div>
      )}
      <div className="param-row">
        <label>Frequency</label>
        <ExprInput value={f.hz} min={0.1} onCommit={(v) => onChange({ ...f, hz: v })} />
        <span className="unit">Hz</span>
      </div>
      {!pass && (
        <>
          <div className="param-row">
            <label>Q</label>
            <ExprInput value={f.q} step={0.1} min={0.05} onCommit={(v) => onChange({ ...f, q: v })} />
            <span className="unit" />
          </div>
          <div className="param-row">
            <label>Gain</label>
            <ExprInput value={f.db} step={0.5} onCommit={(v) => onChange({ ...f, db: v })} />
            <span className="unit">dB</span>
          </div>
        </>
      )}
    </div>
  )
}

/**
 * One amplifier channel: its level, DSP and load.
 *
 * @param {object} props - Component props.
 * @param {object} props.ch - The channel.
 * @param {number} props.index - Its position in the list.
 * @param {object} props.ctx - Shared lookups: wiring, drivers, resolved params, param values, master gain, the free driver list and the edit functions.
 * @returns {React.ReactElement} The channel card.
 * @sideEffect Subscribes to the store for the simulated impedance.
 */
function ChannelCard({ ch, index, ctx }) {
  const zmin = useStore((s) => {
    const z = s.results?.zinByChannel?.[ch.id]?.mag
    return z?.length ? Math.min(...z) : null
  })
  const { wiring, drivers, resolved, values, master, free, update, updateLive, proj } = ctx
  const volts = valueOf(ch.volts, values)
  const load = effectiveLoad(ch, proj)
  const nominal = treeNominal(load, resolved)
  const vNow = volts * master
  const watts = isFinite(nominal) && nominal > 0 ? (vNow * vNow) / nominal : 0
  const dsp = ch.dsp || { polarity: 1, delayMs: 0, filters: [] }
  /**
   * Apply a change to this channel.
   *
   * @param {object} change - Fields to merge.
   * @param {boolean} [live] - A typed value: no undo step.
   * @returns {void}
   * @sideEffect Writes the project's wiring.
   */
  const patch = (change, live) => {
    const channels = wiring.channels.map((c, i) => (i === index ? { ...c, ...change } : c))
    ;(live ? updateLive : update)({ ...wiring, channels })
  }
  const others = wiring.channels.filter((c, i) => i !== index)
  const canCatchAll = !others.some((c) => c.load == null)
  return (
    <div className="channel-card">
      <div className="channel-head">
        <input className="channel-label" value={ch.label || ''} placeholder={ch.id} onChange={(e) => patch({ label: e.target.value }, true)} />
        {wiring.channels.length > 1 && (
          <button className="icon-btn" title="Remove this channel; its drivers become unwired" onClick={() => update({ ...wiring, channels: others })}>✕</button>
        )}
      </div>
      <div className="param-row">
        <label title="The channel's output at master 0 dB. This is its gain: the master moves every channel together from here.">Volts @ 0 dB</label>
        <ExprInput value={ch.volts} min={0} step={0.1} onCommit={(v) => patch({ volts: v })} />
        <span className="unit">V</span>
      </div>
      <div className="channel-readout">
        Now <b>{shortNum(vNow)} V</b>{isFinite(nominal) ? <> into <b>{ohms(nominal)}</b> nominal</> : <>, nothing connected</>}
        {watts > 0 && <> = <b>{watts >= 100 ? watts.toFixed(0) : watts.toFixed(1)} W</b></>}
        {zmin != null && <> · min |Z| <b>{zmin.toFixed(2)} Ω</b></>}
      </div>
      <div className="param-row">
        <label title="Amplifier output resistance plus cable, in series with the load">Output R</label>
        <ExprInput value={ch.outputOhms ?? 0} min={0} step={0.01} onCommit={(v) => patch({ outputOhms: v })} />
        <span className="unit">Ω</span>
      </div>
      <div className="param-row">
        <label>Polarity</label>
        <select value={dsp.polarity === -1 ? '-1' : '1'} onChange={(e) => patch({ dsp: { ...dsp, polarity: Number(e.target.value) } })}>
          <option value="1">Normal</option>
          <option value="-1">Inverted</option>
        </select>
        <span className="unit" />
      </div>
      <div className="param-row">
        <label>Delay</label>
        <ExprInput value={dsp.delayMs ?? 0} min={0} step={0.1} onCommit={(v) => patch({ dsp: { ...dsp, delayMs: v } })} />
        <span className="unit">ms</span>
      </div>
      <div className="sub-section">
        <div className="sub-head">
          <span>Filters</span>
          <select value="" onChange={(e) => {
            if (!e.target.value) return
            patch({ dsp: { ...dsp, filters: [...(dsp.filters || []), { ...NEW_FILTER[e.target.value] }] } })
          }}>
            <option value="">+ Filter…</option>
            {FILTER_TYPES.map((t) => <option key={t} value={t}>{FILTER_LABELS[t]}</option>)}
          </select>
        </div>
        {(dsp.filters || []).map((f, i) => (
          <FilterRow key={i} f={f} onChange={(nf) => {
            const filters = nf == null ? dsp.filters.filter((_, k) => k !== i) : dsp.filters.map((x, k) => (k === i ? nf : x))
            patch({ dsp: { ...dsp, filters } }, nf != null && nf.type === f.type && nf.shape === f.shape && nf.order === f.order && nf.bypass === f.bypass)
          }} />
        ))}
      </div>
      <div className="sub-section">
        <div className="sub-head">
          <span title="The drivers this channel drives, and how they are wired to it">Load</span>
          {ch.load == null
            ? <button onClick={() => patch({ load: load })} title="Take over the list and edit the wiring by hand">Customize</button>
            : canCatchAll && <button onClick={() => patch({ load: null })} title="Drive every driver no other channel claims, in parallel">Use default</button>}
        </div>
        {ch.load == null
          ? (
            <div className="ts-hint">
              Default: every driver not wired to another channel, in parallel
              {loadLeaves(load).length
                ? <> — {loadLeaves(load).map((id) => drivers.get(id)?.data.params.label || id).join(', ')}.</>
                : <> — none right now.</>}
            </div>
          )
          : (
            <LoadGroup
              tree={ch.load}
              path={[]}
              drivers={drivers}
              free={free}
              resolved={resolved}
              onEdit={(path, fn) => patch({ load: editAt(ch.load, path, fn) || { parallel: [] } })}
            />
          )}
      </div>
    </div>
  )
}

/**
 * The wiring manager: the master level and every amplifier channel.
 *
 * Signal chain per channel: the program → its DSP → its amplifier (volts at
 * master 0 dB, then the master) → its output resistance → its load, a
 * series/parallel tree of driver nodes. Each channel shows the watts its
 * voltage puts into the nominal load its wiring presents; rewiring keeps the
 * voltage and changes the watts, as on a real amplifier.
 *
 * @returns {React.ReactElement} The panel.
 * @sideEffect Subscribes to the store.
 */
export default function WiringPanel() {
  const wiring = useStore((s) => s.projectExtras.wiring) || { masterDb: 0, channels: [] }
  const nodes = useStore((s) => s.nodes)
  const setExtra = useStore((s) => s.setExtra)
  const { values } = useParamValues()
  const driverNodes = nodes.filter((n) => n.type === 'driver')
  const drivers = new Map(driverNodes.map((n) => [n.id, n]))
  const resolved = useMemo(
    () => new Map(driverNodes.map((n) => [n.id, resolveNodeParams({ id: n.id, type: n.type, params: n.data.params }, values)])),
    [nodes, values],
  )
  const proj = { nodes: driverNodes.map((n) => ({ id: n.id, type: n.type })), wiring }
  const claimed = new Set(wiring.channels.flatMap((c) => loadLeaves(c.load)))
  const catchAll = wiring.channels.some((c) => c.load == null)
  const free = driverNodes.map((n) => n.id).filter((id) => !claimed.has(id))
  const unwired = catchAll ? [] : free
  const masterDb = valueOf(wiring.masterDb ?? 0, values)
  const ctx = {
    wiring, drivers, resolved, values, proj, free,
    master: Math.pow(10, (masterDb || 0) / 20),
    /**
     * Replace the wiring as one undoable edit.
     *
     * @param {object} w - The new wiring.
     * @returns {void}
     * @sideEffect Writes the project's wiring and records history.
     */
    update: (w) => setExtra('wiring', w),
    /**
     * Replace the wiring for a typed value, without an undo step.
     *
     * @param {object} w - The new wiring.
     * @returns {void}
     * @sideEffect Writes the project's wiring.
     */
    updateLive: (w) => setExtra('wiring', w, false),
  }
  return (
    <div className="panel-scroll wiring-panel">
      <div className="panel-section">
        <h4>Master</h4>
        <div className="param-row">
          <label title="Moves every channel together. The toolbar's voltage sets this too: it is the first channel's output at the master.">Level</label>
          <ExprInput value={wiring.masterDb ?? 0} step={0.5} onCommit={(v) => setExtra('wiring', { ...wiring, masterDb: v })} />
          <span className="unit">dB</span>
        </div>
        {unwired.length > 0 && (
          <div className="node-warning"><span className="warn-dot" /> Not wired to any channel, so undriven with the coil open: {unwired.map((id) => drivers.get(id)?.data.params.label || id).join(', ')}.</div>
        )}
      </div>
      {wiring.channels.map((ch, i) => (
        <div className="panel-section" key={ch.id}>
          <ChannelCard ch={ch} index={i} ctx={ctx} />
        </div>
      ))}
      <div className="panel-section">
        <button onClick={() => {
          const id = freshId('ch', wiring.channels.map((c) => c.id))
          setExtra('wiring', { ...wiring, channels: [...wiring.channels, { ...JSON.parse(JSON.stringify(DEFAULT_CHANNEL)), id, label: `Amp ${wiring.channels.length + 1}`, load: catchAll ? { parallel: [] } : null }] })
        }}>+ Add channel</button>
        <div className="ts-hint" style={{ marginTop: 6 }}>
          Each driver node sits on at most one channel. Its own count, array
          wiring and voice coils are set on the node.
        </div>
      </div>
    </div>
  )
}
