import React, { useState } from 'react'
import { useStore } from '../store'
import { waveguideVolume } from '../engine/geometry'
import { basisOf, baselineOf, matchesBaseline, BASIS_SIZE } from '../driverParams'
import ExprInput from './ExprInput'
import { useResolvedParams } from '../useResolved'
import { freshId } from '../schema/extras'
import { driverNominal } from '../schema/nominal'

/**
 * One-line physical explanation per parameter, shown as a label tooltip.
 *
 * Keyed by param name rather than by node type, since the same parameter
 * means the same thing wherever it appears.
 */
const TIPS = {
  Fs: 'Free-air resonance frequency of the moving system.',
  Qts: 'Total Q at Fs combining mechanical and electrical damping.',
  Qes: 'Electrical Q at Fs — damping from the motor (Bl²/Re).',
  Qms: 'Mechanical Q at Fs — damping from suspension losses.',
  Vas: 'Volume of air with the same compliance as the suspension.',
  Re: 'DC resistance of the voice coil.',
  Bl: 'Motor force factor — force per ampere.',
  Mms: 'Total moving mass including air load.',
  Cms: 'Suspension compliance — displacement per newton.',
  Sd: 'Effective radiating piston area.',
  Le: 'Voice-coil inductance at 1 kHz.',
  LeExp: 'Semi-inductance exponent: 1 = pure inductor, ~0.6–0.7 with shorting rings.',
  Xmax: 'Linear excursion limit (one-way).',
  Rms: 'Mechanical resistance of the suspension.',
  leakQL: 'Box leakage as the familiar QL: lower = leakier. Compiled to the equivalent leak resistance at the reference frequency.',
  leakHz: 'Frequency QL is referred to — conventionally the box tuning.',
  loss: 'Scales the wall loss worked out from this duct’s size and shape: 1 is the physical estimate, 0 is lossless, above 1 adds loss the model misses.',
  throatSpace: 'Solid angle the throat radiates into when nothing is connected to it; plugged closes it.',
  mouthSpace: 'Solid angle the mouth radiates into when nothing is connected to it; plugged closes it.',
  count: 'Number of identical units.',
  wiring: 'Electrical wiring of the array — changes Re, Le and Bl of the equivalent driver.',
  volume: 'Internal net air volume.',
  length: 'Longest internal dimension — sets the first standing-wave frequency c/2L.',
  shape: 'Cross-section shape (affects higher-order mode onset).',
  stuffing: 'Fiber fill density: slows sound in the cavity and adds absorption.',
  S1: 'Throat (input) area.',
  S2: 'Mouth (output) area. Equal to S1 for a straight port.',
  flare: 'Area expansion law along the segment.',
  ecFactor: 'Scales the end corrections this duct gets. Those are worked out from what each end opens into — nearly 0.85·a into a box, nothing into a duct of its own area, and nothing into open air, where the radiation impedance already carries it. 1 leaves that alone.',
  Mmd: 'Moving mass of the passive radiator cone (without air load).',
  addedMass: 'Extra mass bolted to the cone to lower its resonance.',
  space: 'Solid angle the opening radiates into — boundary loading.',
  label: 'Display name for this node.',
}

/**
 * Which sections are open, by key, for the session.
 *
 * Kept outside React so a section stays as the user left it when another
 * element of the same kind is selected, or the panel is re-docked.
 */
const OPEN = {}

/**
 * Whether a section is open, and the toggle for it.
 *
 * @param {string} id - Section key, e.g. `driver.electrical`.
 * @param {boolean} initial - Open the first time it is shown.
 * @returns {[boolean, Function]} Open, and a function that flips it.
 * @sideEffect Holds React state and writes the module's open map when toggled.
 */
function useOpen(id, initial) {
  const [open, setOpen] = useState(OPEN[id] ?? initial)
  /**
   * Flip the section, remembering the new state.
   *
   * @returns {void}
   * @sideEffect Updates React state and the module's open map.
   */
  const toggle = () => { OPEN[id] = !open; setOpen(!open) }
  return [open, toggle]
}

/**
 * A figure written short, for a section summary.
 *
 * @param {any} v - A number, or anything else.
 * @returns {string} Up to three significant figures without trailing zeros, the value itself when it is not a finite number, or `—` when absent.
 * @pure
 */
const short = (v) => {
  if (v == null || v === '') return '—'
  const n = Number(v)
  if (!Number.isFinite(n)) return String(v)
  if (Math.abs(n) >= 100) return String(Math.round(n))
  return String(Number(n.toPrecision(3)))
}

/**
 * A collapsible section of the panel: a card whose head names it and, while
 * closed, sums up what is in it on one line.
 *
 * @param {object} props - Component props.
 * @param {string} props.id - Key the open state is remembered by.
 * @param {string} props.title - The name.
 * @param {string} [props.summary] - One line shown while closed.
 * @param {string} [props.color] - An element hue: shows a dot, and rings the card when `focus`.
 * @param {boolean} [props.focus] - The section being worked on — the selected element.
 * @param {React.ReactNode} [props.actions] - Buttons shown in the head while open, in place of the summary.
 * @param {boolean} [props.initial] - Open the first time it is shown.
 * @param {React.ReactNode} props.children - The body.
 * @returns {React.ReactElement} The section.
 * @sideEffect Holds its open state.
 */
function Section({ id, title, summary, color, focus, actions, initial = false, children }) {
  const [open, toggle] = useOpen(id, initial)
  return (
    <div className={`psec${open ? ' open' : ''}${focus ? ' focus' : ''}`} style={color ? { '--nc': color } : undefined}>
      <div className="psec-head" onClick={toggle} role="button" aria-expanded={open}>
        <span className="psec-twisty">{open ? '▾' : '▸'}</span>
        {color && <span className="psec-dot" />}
        <span className="psec-title">{title}</span>
        {open && actions
          ? <span className="psec-actions" onClick={(e) => e.stopPropagation()}>{actions}</span>
          : <span className="psec-summary">{summary}</span>}
      </div>
      {open && <div className="psec-body">{children}</div>}
    </div>
  )
}

/**
 * A collapsible group inside a section, with its own one-line summary.
 *
 * @param {object} props - Component props.
 * @param {string} props.id - Key the open state is remembered by.
 * @param {string} props.title - The name.
 * @param {string} [props.summary] - One line shown in the head.
 * @param {boolean} [props.initial] - Open the first time it is shown.
 * @param {React.ReactNode} props.children - The body.
 * @returns {React.ReactElement} The group.
 * @sideEffect Holds its open state.
 */
function Sub({ id, title, summary, initial = false, children }) {
  const [open, toggle] = useOpen(id, initial)
  return (
    <div className={`psub${open ? ' open' : ''}`}>
      <div className="psub-head" onClick={toggle} role="button" aria-expanded={open}>
        <span className="psec-twisty">{open ? '▾' : '▸'}</span>
        <span className="psec-title">{title}</span>
        <span className="psec-summary">{summary}</span>
      </div>
      {open && <div className="psub-body">{children}</div>}
    </div>
  )
}

/**
 * A small padlock, closed or open.
 *
 * @param {object} props - Component props.
 * @param {boolean} props.closed - Draw it locked.
 * @returns {React.ReactElement} The icon.
 * @pure
 */
function LockIcon({ closed }) {
  return (
    <svg viewBox="0 0 12 12" aria-hidden="true">
      <rect x="2" y="5.5" width="8" height="5.5" rx="1.3" fill="currentColor" />
      <path d={closed ? 'M3.8 5.5V4a2.2 2.2 0 0 1 4.4 0v1.5' : 'M3.8 5.5V4a2.2 2.2 0 0 1 4.3-.7'} fill="none" stroke="currentColor" strokeWidth="1.3" />
    </svg>
  )
}

/**
 * A labelled numeric parameter input bound to one node field.
 *
 * Takes a number or an expression over the project parameters. Empty and
 * unresolvable input is held in the box rather than written, so clearing it
 * to retype a value does not momentarily push `NaN` into the graph and
 * trigger a failed solve.
 *
 * @param {object} props - Component props.
 * @param {string} props.id - Node id.
 * @param {string} props.field - Parameter name; also selects the tooltip.
 * @param {number|string|undefined} props.value - Current value.
 * @param {string} props.unit - Unit shown after the input.
 * @param {string} [props.label] - Display label; defaults to the field name.
 * @param {string|number} [props.step] - Input step.
 * @param {number} [props.min] - Minimum accepted value.
 * @param {Function} [props.onCommit] - Called instead of the default update, for fields needing derived changes.
 * @returns {React.ReactElement} The input row.
 * @sideEffect Subscribes to the store. Editing updates the node's params, which triggers a resimulation.
 */
function NumField({ id, field, value, unit, label, step, min, onCommit }) {
  const updateParams = useStore((s) => s.updateParams)
  return (
    <div className="param-row">
      <label title={TIPS[field] || ''}>{label || field}</label>
      <ExprInput
        value={value}
        step={step}
        min={min}
        onCommit={(v) => (onCommit ? onCommit(v) : updateParams(id, { [field]: v }))}
      />
      <span className="unit">{unit || ''}</span>
    </div>
  )
}

/**
 * A labelled dropdown parameter bound to one node field.
 *
 * @param {object} props - Component props.
 * @param {string} props.id - Node id.
 * @param {string} props.field - Parameter name; also selects the tooltip.
 * @param {string} props.value - Current value.
 * @param {string} [props.label] - Display label; defaults to the field name.
 * @param {Array} props.options - Selectable options.
 * @returns {React.ReactElement} The select row.
 * @sideEffect Subscribes to the store. Changing it updates the node's params, which triggers a resimulation.
 */
function SelectField({ id, field, value, label, options }) {
  const updateParams = useStore((s) => s.updateParams)
  return (
    <div className="param-row wide">
      <label title={TIPS[field] || ''}>{label || field}</label>
      <select value={value} onChange={(e) => updateParams(id, { [field]: e.target.value })}>
        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
      <span className="unit" />
    </div>
  )
}

/**
 * A chamber's leakage: sealed, or a QL referred to a frequency.
 *
 * QL is kept as the number people already think in; the engine turns it into
 * the leak resistance it implies. Ticking "sealed" removes the leak rather than
 * expecting the user to know that a very large QL means the same thing.
 *
 * @param {object} props - Component props.
 * @param {string} props.id - Node id.
 * @param {object} props.p - The node's params.
 * @returns {React.ReactElement} The leakage controls.
 * @sideEffect Subscribes to the store.
 */
function LeakSection({ id, p }) {
  const updateParams = useStore((s) => s.updateParams)
  const sealed = !(Number(p.leakQL) > 0)
  return (
    <>
      <div className="param-row wide">
        <label title={TIPS.leakQL}>Leakage QL</label>
        <input
          type="number" step="1" min="1"
          value={sealed ? '' : p.leakQL}
          placeholder="sealed"
          disabled={sealed}
          onChange={(e) => {
            const v = parseFloat(e.target.value)
            if (!Number.isNaN(v)) updateParams(id, { leakQL: Math.max(1, v) })
          }}
        />
        <span className="unit">
          <label style={{ display: 'flex', gap: 4, alignItems: 'center', fontSize: 11, cursor: 'pointer' }}>
            <input type="checkbox" checked={sealed} onChange={(e) => updateParams(id, { leakQL: e.target.checked ? null : 10 })} />sealed
          </label>
        </span>
      </div>
      {!sealed && <NumField id={id} field="leakHz" value={p.leakHz} label="QL at" unit="Hz" min="1" />}
    </>
  )
}

/**
 * The node's display name, shown on the canvas and in exports.
 *
 * @param {object} props - Component props.
 * @param {string} props.id - Node id.
 * @param {object} props.p - The node's params.
 * @returns {React.ReactElement} The label input.
 * @sideEffect Subscribes to the store.
 */
function LabelField({ id, p }) {
  const updateParams = useStore((s) => s.updateParams)
  return (
    <div className="param-row wide">
      <label title={TIPS.label}>Label</label>
      <input value={p.label || ''} onChange={(e) => updateParams(id, { label: e.target.value })} />
      <span className="unit" />
    </div>
  )
}

/**
 * The amplifier section: voltage, impedance and power, linked by P = V²/Z.
 *
 * Editing any one derives the others, so the drive level can be set in
 * whichever unit the user is thinking in.
 *
 * @returns {React.ReactElement} The amplifier section.
 * @sideEffect Subscribes to the store.
 */
function AmpSolver() {
  const settings = useStore((s) => s.settings)
  const setAmp = useStore((s) => s.setAmp)
  const updateSettings = useStore((s) => s.updateSettings)
  /**
   * One linked amplifier field.
   *
   * Rejects zero and negative values: the relation divides by impedance, and
   * a zero would propagate infinities through the settings.
   *
   * @param {'voltage'|'impedance'|'power'} field - Settings field to bind.
   * @param {string} label - Display label.
   * @param {string} unit - Unit shown after the input.
   * @returns {React.ReactElement} The input row.
   * @reads the enclosing `settings` and `setAmp`.
   */
  const f = (field, label, unit) => (
    <div className="param-row">
      <label title="Voltage, impedance and power are linked by P = V²/Z — edit any one.">{label}</label>
      <input
        type="number" step="any" min="0"
        value={round3(settings[field])}
        onChange={(e) => {
          const v = parseFloat(e.target.value)
          if (!Number.isNaN(v) && v > 0) setAmp(field, v)
        }}
      />
      <span className="unit">{unit}</span>
    </div>
  )
  return (
    <Section
      id="amp" title="Amplifier"
      summary={`${short(settings.voltage)} V · ${short(settings.impedance)} Ω · ${short(settings.power)} W`}
      actions={<button onClick={() => useStore.getState().layoutOps.open('wiring')}
        title="The first amplifier channel at the master level. Changing the voltage moves the master, so every channel keeps its relative level.">Wiring…</button>}
    >
      <div className="param-grid">
        {f('voltage', 'Voltage', 'V')}
        {f('impedance', 'Impedance', 'Ω')}
        {f('power', 'Power', 'W')}
        <div className="param-row">
          <label title="The first channel's output resistance — amplifier output plus cable — in series with its load.">Rg</label>
          <input type="number" step="any" min="0" value={settings.rg}
            onChange={(e) => { const v = parseFloat(e.target.value); if (!Number.isNaN(v)) updateSettings({ rg: v }) }} />
          <span className="unit">Ω</span>
        </div>
      </div>
    </Section>
  )
}

/**
 * The frequency sweep: its range, how many points, and resonance masking.
 *
 * @returns {React.ReactElement} The section.
 * @sideEffect Subscribes to the store.
 */
function SweepSection() {
  const settings = useStore((s) => s.settings)
  const updateSettings = useStore((s) => s.updateSettings)
  return (
    <Section id="sweep" title="Sweep" summary={`${short(settings.fmin)}–${short(settings.fmax)} Hz · ${settings.npts}`}>
      <div className="param-grid">
        <div className="param-row">
          <label title="Lowest frequency of the sweep">From</label>
          <input type="number" min="1" value={settings.fmin}
            onChange={(e) => { const v = parseFloat(e.target.value); if (v > 0 && v < settings.fmax) updateSettings({ fmin: v }) }} />
          <span className="unit">Hz</span>
        </div>
        <div className="param-row">
          <label title="Highest frequency of the sweep">To</label>
          <input type="number" value={settings.fmax}
            onChange={(e) => { const v = parseFloat(e.target.value); if (v > settings.fmin) updateSettings({ fmax: v }) }} />
          <span className="unit">Hz</span>
        </div>
        <div className="param-row">
          <label title="Frequencies solved across the sweep, spaced logarithmically">Points</label>
          <input type="number" min="16" step="16" value={settings.npts}
            onChange={(e) => { const v = parseInt(e.target.value, 10); if (v >= 16) updateSettings({ npts: v }) }} />
          <span className="unit" />
        </div>
        <label className="param-row" style={{ cursor: 'pointer' }}
          title="Suppress chamber standing-wave resonances (lumped-compliance chambers)">
          <input type="checkbox" checked={!!settings.masking} onChange={(e) => updateSettings({ masking: e.target.checked })} />
          <span style={{ fontSize: 12, color: 'var(--text-2)' }}>Mask resonances</span>
        </label>
      </div>
    </Section>
  )
}

/**
 * Round a settings value for display, leaving non-numbers alone.
 *
 * Derived amplifier figures otherwise show full float precision, which
 * makes the boxes unreadable as you type.
 *
 * @param {any} v - The value.
 * @returns {any} The value rounded to three decimals, or unchanged when it is not a number.
 * @pure
 */
const round3 = (v) => (typeof v === 'number' ? Math.round(v * 1000) / 1000 : v)

/**
 * One coupled T/S parameter: its value, and the padlock deciding who sets it.
 *
 * A held parameter is one the user is asserting; a released one is a
 * consequence, so it is shown but not typed into. The padlock is the only way
 * to move a parameter between the two.
 *
 * @param {object} props - Component props.
 * @param {string} props.id - Node id.
 * @param {string} props.field - Parameter name.
 * @param {number|undefined} props.value - Current value.
 * @param {boolean} props.held - Whether this parameter is one of the six being held.
 * @param {string} [props.unit] - Unit shown after the input.
 * @param {string|number} [props.step] - Input step.
 * @returns {React.ReactElement} The row.
 * @sideEffect Subscribes to the store. Editing or toggling updates the node and triggers a resimulation.
 */
function TSField({ id, field, value, held, unit, step }) {
  const setDriverParam = useStore((s) => s.setDriverParam)
  const setDriverLock = useStore((s) => s.setDriverLock)
  return (
    <div className={`param-row ts-row${held ? '' : ' derived'}`}>
      <button
        className={`ts-lock${held ? ' held' : ''}`}
        aria-pressed={held}
        aria-label={`${held ? 'Release' : 'Hold'} ${field}`}
        title={held
          ? `${field} is yours to set. Release it to let it follow the others.`
          : `${field} follows the others. Hold it to set it yourself.`}
        onClick={() => setDriverLock(id, field, !held)}
      ><LockIcon closed={held} /></button>
      <label title={TIPS[field] || ''}>{field}</label>
      <input
        type="number"
        step={step || 'any'}
        value={value ?? ''}
        readOnly={!held}
        tabIndex={held ? undefined : -1}
        title={held ? '' : 'Derived from the held parameters — click the padlock to set it yourself'}
        onChange={(e) => {
          const v = e.target.value === '' ? '' : parseFloat(e.target.value)
          if (v === '' || Number.isNaN(v)) return
          setDriverParam(id, field, v)
        }}
      />
      <span className="unit">{unit || ''}</span>
    </div>
  )
}

/**
 * Parameter form for a driver, with links to the library and the T/S solver.
 *
 * The eleven T/S figures are six free values and five consequences of them,
 * so the form does not offer eleven independent boxes. Six carry a closed
 * padlock and are editable; the rest show what those six imply, and moving a
 * padlock moves a parameter between the two groups.
 *
 * @param {object} props - Component props.
 * @param {object} props.node - The selected node.
 * @returns {React.ReactElement} The form.
 * @sideEffect Subscribes to the store.
 */
function DriverForm({ node }) {
  const p = node.data.params
  const id = node.id
  const setShowDriverDB = useStore((s) => s.setShowDriverDB)
  const setShowTSCalc = useStore((s) => s.setShowTSCalc)
  const setSaveDriverFor = useStore((s) => s.setSaveDriverFor)
  const restoreDriverParams = useStore((s) => s.restoreDriverParams)
  const basis = basisOf(node)
  const baseline = baselineOf(node)
  const canRestore = baseline != null && !matchesBaseline(node)
  /**
   * One coupled T/S row, wired to this node and its current basis.
   *
   * @param {string} field - Parameter name.
   * @param {string} [unit] - Unit shown after the input.
   * @param {string} [step] - Input step.
   * @returns {React.ReactElement} The row.
   * @reads the enclosing form's node and basis.
   */
  const ts = (field, unit, step) => (
    <TSField id={id} field={field} value={p[field]} held={basis.includes(field)} unit={unit} step={step} />
  )
  const nominal = driverNominal(p)
  return (
    <Section
      id="driver" title={p.label || 'Driver'} color="var(--s1)" focus initial
      summary={`Fs ${short(p.Fs)} Hz · Qts ${short(p.Qts)}`}
      actions={<>
        <button onClick={() => setShowDriverDB(true)}>Database</button>
        <button onClick={() => setShowTSCalc(true)}>T/S solver</button>
      </>}
    >
      <div className="param-grid"><LabelField id={id} p={p} /></div>
      <div className="psec-caption">
        Core T/S
        <span className="psec-caption-note" title={`${BASIS_SIZE} of the T/S figures are yours to set; the rest follow. Click a padlock to change which.`}>
          {BASIS_SIZE} held · padlocks choose
        </span>
      </div>
      <div className="param-grid">
        {ts('Fs', 'Hz')}
        {ts('Qts', '', '0.01')}
        {ts('Vas', 'L')}
        {ts('Sd', 'cm²')}
        {ts('Bl', 'T·m')}
        <NumField id={id} field="Xmax" value={p.Xmax} unit="mm" />
      </div>
      <Sub id="driver.electrical" title="Electrical" summary={`Re ${short(p.Re)} Ω · Le ${short(p.Le)} mH`}>
        <div className="param-grid">
          {ts('Re', 'Ω')}
          {ts('Qes', '', '0.01')}
          <NumField id={id} field="Le" value={p.Le} unit="mH" step="0.1" />
          <NumField id={id} field="LeExp" value={p.LeExp} label="Le exp." step="0.05" min="0.3" />
        </div>
      </Sub>
      <Sub id="driver.mechanical" title="Mechanical" summary={`Mms ${short(p.Mms)} g · Qms ${short(p.Qms)}`}>
        <div className="param-grid">
          {ts('Mms', 'g')}
          {ts('Cms', 'mm/N', '0.01')}
          {ts('Rms', 'kg/s', '0.1')}
          {ts('Qms', '', '0.1')}
        </div>
      </Sub>
      <Sub id="driver.array" title="Array & wiring" summary={`${short(p.count)}× · ${nominal >= 1 ? nominal.toFixed(0) : nominal.toFixed(2)} Ω`}>
        <div className="param-grid">
          <NumField id={id} field="count" value={p.count} label="Drivers" step="1" min="1" />
          <SelectField id={id} field="wiring" value={p.wiring} options={[
            ['single', 'Single'], ['series', 'Series'], ['parallel', 'Parallel'], ['series-parallel', 'Series-parallel'],
          ]} />
          <DvcField id={id} p={p} />
        </div>
        <div className="ts-hint">
          How this node's drivers connect to their amplifier channel is set in
          the <a href="#" onClick={(e) => { e.preventDefault(); useStore.getState().layoutOps.open('wiring') }}>Wiring</a> panel.
        </div>
      </Sub>
      <div className="drv-actions">
        <button
          onClick={() => setSaveDriverFor(id)}
          title="Store these parameters in the workspace's driver library under a name you choose"
        >Save to library…</button>
        <button
          disabled={!canRestore}
          onClick={() => restoreDriverParams(id)}
          title={baseline
            ? 'Put every T/S parameter back to what this driver started as'
            : 'Nothing to restore — this driver has not been changed since it was loaded'}
        >Restore</button>
      </div>
    </Section>
  )
}

/**
 * A driver's dual voice coil option.
 *
 * Purely electrical, and available on any driver: the catalogue never says
 * whether a driver has two coils, and its figures are always taken as both
 * coils in series. The other choices rescale Re, Bl and Le from there.
 *
 * @param {object} props - Component props.
 * @param {string} props.id - Node id.
 * @param {object} props.p - The node's params.
 * @returns {React.ReactElement} The select row.
 * @sideEffect Subscribes to the store.
 */
function DvcField({ id, p }) {
  const updateParams = useStore((s) => s.updateParams)
  return (
    <div className="param-row wide">
      <label title="Dual voice coil wiring. The driver's parameters are taken as both coils in series; parallel quarters Re (same Qes), one coil alone halves Re and Bl (double Qes).">Voice coils</label>
      <select value={p.dvc?.coils || 'single'} onChange={(e) => updateParams(id, { dvc: e.target.value === 'single' ? null : { coils: e.target.value } })}>
        <option value="single">Single coil</option>
        <option value="series">Dual, in series</option>
        <option value="parallel">Dual, in parallel</option>
        <option value="one">Dual, one coil only</option>
      </select>
      <span className="unit" />
    </div>
  )
}

/**
 * The node's validation warnings, with the fixes the editor can offer.
 *
 * A driver face meeting an opening smaller than its cone gets a button that
 * puts a chamber between them.
 *
 * @param {object} props - Component props.
 * @param {object} props.node - The selected node.
 * @returns {React.ReactElement|null} The warnings, or nothing when there are none.
 * @sideEffect Subscribes to the store.
 */
function NodeWarnings({ node }) {
  const warns = useStore((s) => s.results?.validation?.warnings?.[node.id])
  const insert = useStore((s) => s.insertThroatChamber)
  if (!warns?.length) return null
  return (
    <div className="panel-section node-warnings">
      {warns.map((w, i) => {
        const face = node.type === 'driver' && /throat chamber/.test(w) ? (/^The front/.test(w) ? 'front' : 'rear') : null
        return (
          <div key={i} className="node-warning">
            <span className="warn-dot" /> {w}
            {face && <div><button onClick={() => insert(node.id, face)}>Insert a throat chamber</button></div>}
          </div>
        )
      })}
    </div>
  )
}

/**
 * The taps along a chamber or waveguide: where things may join it from the side.
 *
 * Positions are in cm from the `in` / throat end and may be expressions.
 * Removing a tap removes the joins made to it.
 *
 * @param {object} props - Component props.
 * @param {string} props.id - Node id.
 * @param {object} props.p - The node's params.
 * @param {string} props.from - Name of the end positions are measured from.
 * @returns {React.ReactElement} The taps section.
 * @sideEffect Subscribes to the store.
 */
function TapsSection({ id, p, from }) {
  const setTaps = useStore((s) => s.setTaps)
  const addProbe = useStore((s) => s.addProbe)
  const taps = p.taps || []
  return (
    <Sub id={`taps`} title="Taps" summary={taps.length ? taps.map((t) => `${t.id} ${short(t.position)}`).join(' · ') : 'none'}>
      <div className="ts-hint" title="Points along the line where anything may join it — a driver, a port, another chamber. Each shows as a handle on the node's right side.">
        Points where something may join partway along, in cm from the {from} end.
      </div>
      {taps.map((t, i) => (
        <div className="param-row tap-row" key={t.id}>
          <label title={`Tap ${t.id}: its handle is tap:${t.id}`}>{t.id}</label>
          <ExprInput value={t.position} min={0} onCommit={(v) => setTaps(id, taps.map((x, k) => (k === i ? { ...x, position: v } : x)))} title={`cm from the ${from} end`} />
          <span className="unit">
            cm
            <button className="icon-btn" title="Add a pressure probe at this tap" onClick={() => addProbe({ kind: 'pressure', label: `${p.label || id} ${t.id}`, at: { node: id, handle: `tap:${t.id}` } })}>◎</button>
            <button className="icon-btn" title="Remove this tap and anything joined to it" onClick={() => setTaps(id, taps.filter((x) => x.id !== t.id))}>✕</button>
          </span>
        </div>
      ))}
      <div className="drv-actions">
        <button onClick={() => {
          const tid = freshId('t', taps.map((t) => t.id))
          setTaps(id, [...taps, { id: tid, position: Math.round((Number(p.length) || 0) / 2) || 1 }])
        }}>+ Tap</button>
      </div>
    </Sub>
  )
}

/**
 * Throat chamber calculator: the air a cone traps in front of a small opening.
 *
 * Output only — it proposes a volume for this chamber and, on request, writes
 * it. The chamber stays an ordinary chamber node. Volume = Sd × (cone depth ×
 * shape factor + one-way excursion + clearance), minus nothing for the
 * motor, since this is the front side.
 *
 * @param {object} props - Component props.
 * @param {string} props.id - Node id.
 * @returns {React.ReactElement} The calculator.
 * @sideEffect Subscribes to the store.
 */
function ThroatCalc({ id }) {
  const updateParams = useStore((s) => s.updateParams)
  const nodes = useStore((s) => s.nodes)
  const edges = useStore((s) => s.edges)
  // Default to the driver joined to this chamber, if there is one.
  const joined = edges
    .filter((e) => e.source === id || e.target === id)
    .map((e) => nodes.find((n) => n.id === (e.source === id ? e.target : e.source)))
    .find((n) => n?.type === 'driver')
  const dp = joined?.data.params || {}
  const [sd, setSd] = useState(Number(dp.Sd) * Math.max(1, Number(dp.count) || 1) || 500)
  const [depth, setDepth] = useState(60)
  const [shape, setShape] = useState('cone')
  const [xmax, setXmax] = useState(Number(dp.Xmax) || 15)
  const [gap, setGap] = useState(5)
  const factor = { cone: 1 / 3, curved: 0.45, flat: 0 }[shape]
  const litres = (sd * 1e-4) * ((depth * factor + xmax + gap) * 1e-3) * 1000
  /**
   * One number input of the calculator.
   *
   * @param {string} label - Row label.
   * @param {number} v - Current value.
   * @param {Function} set - Setter.
   * @param {string} unit - Unit.
   * @returns {React.ReactElement} The row.
   * @pure
   */
  const row = (label, v, set, unit) => (
    <div className="param-row">
      <label>{label}</label>
      <input type="number" value={v} min="0" onChange={(e) => set(parseFloat(e.target.value) || 0)} />
      <span className="unit">{unit}</span>
    </div>
  )
  return (
    <Sub id="throatcalc" title="Throat chamber calculator" summary={`${litres.toFixed(2)} L trapped`}>
      <div className="ts-hint">The air trapped between a cone and a smaller opening in front of it.</div>
      <div className="param-grid">
        {row('Cone area', sd, setSd, 'cm²')}
        {row('Depth', depth, setDepth, 'mm')}
        {row('Excursion', xmax, setXmax, 'mm')}
        {row('Clearance', gap, setGap, 'mm')}
        <div className="param-row wide">
          <label>Cone shape</label>
          <select value={shape} onChange={(e) => setShape(e.target.value)}>
            <option value="cone">Straight cone (⅓ of depth)</option>
            <option value="curved">Curved cone (~0.45)</option>
            <option value="flat">Flat piston</option>
          </select>
        </div>
      </div>
      <div className="drv-actions" style={{ alignItems: 'center' }}>
        <span style={{ fontSize: 12, color: 'var(--text-2)', padding: '0 4px' }}>Trapped air <b className="node-readout">{litres.toFixed(2)} L</b></span>
        <button style={{ marginLeft: 'auto' }} onClick={() => updateParams(id, { volume: Number(litres.toFixed(3)) })}>Set as volume</button>
      </div>
    </Sub>
  )
}

/**
 * Parameter form for a chamber: volume, path length, stuffing and the probe.
 *
 * @param {object} props - Component props.
 * @param {object} props.node - The selected node.
 * @returns {React.ReactElement} The form.
 * @sideEffect Subscribes to the store.
 */
function ChamberForm({ node }) {
  const p = node.data.params
  const id = node.id
  const r = useResolvedParams(id, node.type, p)
  return (
    <Section id="chamber" title={p.label || 'Chamber'} color="var(--s2)" focus initial
      summary={`${short(r.volume)} L · ${short(r.length)} cm`}>
      <div className="param-grid">
        <LabelField id={id} p={p} />
        <NumField id={id} field="volume" value={p.volume} label="Volume" unit="L" />
        <NumField id={id} field="length" value={p.length} label="Length" unit="cm" />
        <SelectField id={id} field="shape" value={p.shape} options={[['rectangular', 'Rectangular'], ['cylindrical', 'Cylindrical']]} />
        <NumField id={id} field="stuffing" value={p.stuffing} label="Stuffing" unit="g/L" min="0" />
        <LeakSection id={id} p={p} />
      </div>
      <TapsSection id={id} p={p} from="in" />
      <ProbeSection id={id} p={p} />
      <ThroatCalc id={id} />
      <div className="ts-hint">
        Typical QL: 5–10 for a leaky box or car door, 15+ for a well-sealed enclosure.
        First standing wave at c/2L = {(344 / (2 * r.length / 100)).toFixed(0)} Hz.
        An end with nothing joined to it is a closed wall.
      </div>
    </Section>
  )
}

// Interior SPL probe: a virtual microphone inside the chamber. Read-only —
// it reports the pressure the solver already computes and never loads the
// circuit. Position slides the mic along the chamber's acoustic length.
/**
 * The interior-SPL probe: a virtual microphone inside a chamber.
 *
 * Observational only — enabling it never changes the simulation. The
 * position slider matters only near the axial standing-wave modes, where
 * pressure actually varies along the box.
 *
 * @param {object} props - Component props.
 * @param {string} props.id - Node id.
 * @param {object} props.p - The node's params.
 * @returns {React.ReactElement} The probe controls.
 * @sideEffect Subscribes to the store.
 */
function ProbeSection({ id, p }) {
  const updateParams = useStore((s) => s.updateParams)
  return (
    <Sub id="probe" title="Interior SPL probe" summary={p.probe ? `on · ${p.probePos ?? 100}%` : 'off'}>
      <label className="param-row" style={{ cursor: 'pointer' }}
        title="Report SPL inside this volume (virtual microphone). Shows on the Interior SPL chart tab.">
        <input type="checkbox" checked={!!p.probe} onChange={(e) => updateParams(id, { probe: e.target.checked })} />
        <span style={{ fontSize: 12, color: 'var(--text-2)' }}>SPL probe (mic inside)</span>
      </label>
      {p.probe && (
        <>
          <div className="param-row">
            <label title="Microphone station along the chamber's acoustic length: 0% = inlet, 100% = far wall. Irrelevant below the first standing wave (uniform pressure field), decisive near the axial modes.">
              Mic position
            </label>
            <input
              type="range" min="0" max="100" step="5"
              value={p.probePos ?? 100}
              onChange={(e) => updateParams(id, { probePos: parseFloat(e.target.value) })}
            />
            <span className="unit" style={{ minWidth: 34, textAlign: 'right' }}>{p.probePos ?? 100}%</span>
          </div>
          <div className="ts-hint">
            Uniform below c/2L (cabin-gain region); position matters at the standing-wave modes.
          </div>
        </>
      )}
    </Sub>
  )
}

/** Choices for what an unconnected waveguide end opens into. */
const END_SPACES = [
  ['free', 'Free space 4π'], ['half', 'Half space 2π'], ['quarter', 'Quarter space π'],
  ['eighth', 'Eighth space π/2'], ['rigid', 'Plugged (closed)'],
]

/**
 * Parameter form for a waveguide, with derived cutoff and volume readouts.
 *
 * @param {object} props - Component props.
 * @param {object} props.node - The selected node.
 * @returns {React.ReactElement} The form.
 * @sideEffect Subscribes to the store.
 */
function WaveguideForm({ node }) {
  const p = node.data.params
  const id = node.id
  const r = useResolvedParams(id, node.type, p)
  const vol = waveguideVolume(r.flare, r.S1 * 1e-4, r.S2 * 1e-4, r.length / 100) * 1000
  return (
    <Section id="waveguide" title={p.label || 'Waveguide'} color="var(--s3)" focus initial
      summary={`${short(r.S1)}→${short(r.S2)} cm² · ${short(r.length)} cm`}>
      <div className="param-grid">
        <LabelField id={id} p={p} />
        <NumField id={id} field="S1" value={p.S1} label="S1 throat" unit="cm²" />
        <NumField id={id} field="S2" value={p.S2} label="S2 mouth" unit="cm²" />
        <NumField id={id} field="length" value={p.length} label="Length" unit="cm" />
        <NumField id={id} field="loss" value={p.loss} label="Wall loss ×" step="0.1" min="0" />
        <SelectField id={id} field="flare" value={p.flare} label="Flare" options={[
          ['conical', 'Conical'], ['exponential', 'Exponential'], ['parabolic', 'Parabolic'],
          ['hypex', 'Hyperbolic-exp (hypex)'], ['tractrix', 'Tractrix ≈'], ['lecleach', 'Le Cléac’h ≈'],
        ]} />
      </div>
      <Sub id="waveguide.ends" title="Ends" summary={`${p.throatSpace} · ${p.mouthSpace} · end corr. ×${short(p.ecFactor)}`}>
        <div className="param-grid">
          <SelectField id={id} field="throatSpace" value={p.throatSpace} label="Open throat into" options={END_SPACES} />
          <SelectField id={id} field="mouthSpace" value={p.mouthSpace} label="Open mouth into" options={END_SPACES} />
          <NumField id={id} field="ecFactor" value={p.ecFactor} label="End corr. ×" step="0.05" min="0" />
        </div>
        <div className="ts-hint">
          End corrections come from what each end meets, so splitting a duct into
          several segments does not change it. An end's solid angle applies only
          while nothing is connected to it.
        </div>
      </Sub>
      <TapsSection id={id} p={p} from="throat" />
      <div className="ts-hint">
        Internal volume <b className="node-readout">{vol.toFixed(2)} L</b>. Set S1 = S2 for a straight port.
      </div>
    </Section>
  )
}

/**
 * Parameter form for a passive radiator, including the compliance calculator.
 *
 * @param {object} props - Component props.
 * @param {object} props.node - The selected node.
 * @returns {React.ReactElement} The form.
 * @sideEffect Subscribes to the store.
 */
function PRForm({ node }) {
  const p = node.data.params
  const id = node.id
  const updateParams = useStore((s) => s.updateParams)
  const [calcOpen, setCalcOpen] = useState(false)
  const [calcFs, setCalcFs] = useState(30)
  const r = useResolvedParams(id, node.type, p)
  const m = (r.Mmd + (r.addedMass || 0)) / 1000
  const fs = 1 / (2 * Math.PI * Math.sqrt(Math.max(m * (r.Cms / 1000), 1e-12)))
  return (
    <Section id="pr" title={p.label || 'Passive radiator'} color="var(--s4)" focus initial
      summary={`Fs ${fs.toFixed(1)} Hz · ${short(r.count)}×`}>
      <div className="param-grid">
        <LabelField id={id} p={p} />
        <NumField id={id} field="Mmd" value={p.Mmd} unit="g" />
        <div onDoubleClick={() => setCalcOpen(!calcOpen)} title="Double-click to derive Cms from a target Fs" style={{ display: 'contents' }}>
          <NumField id={id} field="Cms" value={p.Cms} unit="mm/N" step="0.01" />
        </div>
        <NumField id={id} field="Rms" value={p.Rms} unit="kg/s" step="0.1" />
        <NumField id={id} field="Sd" value={p.Sd} unit="cm²" />
        <NumField id={id} field="addedMass" value={p.addedMass} label="Added mass" unit="g" min="0" />
        <NumField id={id} field="count" value={p.count} label="Units" step="1" min="1" />
      </div>
      <Sub id="pr.tune" title="Tune to a resonance" summary={`now ${fs.toFixed(1)} Hz`} initial={calcOpen}>
        <div className="param-grid">
          <div className="param-row">
            <label>Target Fs</label>
            <input type="number" value={calcFs} onChange={(e) => setCalcFs(parseFloat(e.target.value) || 0)} />
            <span className="unit">Hz</span>
          </div>
          <button onClick={() => {
            if (calcFs > 0) {
              const cms = 1 / (Math.pow(2 * Math.PI * calcFs, 2) * (r.Mmd / 1000)) * 1000
              updateParams(id, { Cms: Math.round(cms * 1000) / 1000 })
              setCalcOpen(false)
            }
          }} title="Cms = 1/((2πFs)²·Mmd)">Set Cms</button>
        </div>
      </Sub>
      <div className="ts-hint">Resonance as configured: <b className="node-readout">{fs.toFixed(1)} Hz</b></div>
    </Section>
  )
}

/**
 * Parameter form for a radiation termination: the space it radiates into.
 *
 * @param {object} props - Component props.
 * @param {object} props.node - The selected node.
 * @returns {React.ReactElement} The form.
 * @sideEffect Subscribes to the store.
 */
function RadiationForm({ node }) {
  const p = node.data.params
  const id = node.id
  const SPACES = [
    ['free', 'Free space (4π sr)'], ['half', 'Half space (2π sr)'],
    ['quarter', 'Quarter space (π sr)'], ['eighth', 'Eighth space (π/2 sr)'],
    ['rigid', 'Rigid wall (reflective)'], ['anechoic', 'Anechoic (absorbing)'],
  ]
  return (
    <Section id="radiation" title={p.label || 'Radiation'} color="var(--s5)" focus initial
      summary={(SPACES.find(([k]) => k === p.space) || [, p.space])[1]}>
      <div className="param-grid">
        <LabelField id={id} p={p} />
        <SelectField id={id} field="space" value={p.space} label="Boundary" options={SPACES} />
      </div>
      <div className="ts-hint">
        Applies circular-piston radiation impedance for the chosen solid angle.
        Rigid = perfect reflection; anechoic = ρc termination, no reflection.
      </div>
    </Section>
  )
}

const FORMS = { driver: DriverForm, chamber: ChamberForm, waveguide: WaveguideForm, pr: PRForm, radiation: RadiationForm }

/**
 * The Parameters panel: the amplifier, the selected node's form, and the sweep.
 *
 * Which form is shown follows the selected node's type; with nothing
 * selected it prompts rather than rendering an empty panel.
 *
 * @returns {React.ReactElement} The panel.
 * @sideEffect Subscribes to the store.
 */
export default function ParamPanel() {
  const selectedNodeId = useStore((s) => s.selectedNodeId)
  const node = useStore((s) => s.nodes.find((n) => n.id === s.selectedNodeId))
  const Form = node ? FORMS[node.type] : null
  return (
    <div className="panel-scroll">
      <AmpSolver />
      {node && <NodeWarnings node={node} key={`w_${node.id}`} />}
      {Form
        ? <Form node={node} key={node.id} />
        : <div className="ph-empty">
            Select an element on the canvas to edit it here.
          </div>}
      {selectedNodeId && !node && null}
      <SweepSection />
    </div>
  )
}

// Module-private functions, exposed for the contract test suite only
// (test/contract/*). Not part of this module's public API — application code
// must not import from here, and nothing outside the tests does.
export const __internals = { round3 }
