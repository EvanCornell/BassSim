import React, { useState } from 'react'
import { useStore } from '../store'
import { waveguideVolume } from '../engine/geometry'
import { basisOf, baselineOf, matchesBaseline, BASIS_SIZE } from '../driverParams'

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
  Q: 'Element loss Q: lower = more internal loss. Physical meaning depends on the element.',
  count: 'Number of identical drivers in the array.',
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
  space: 'Solid angle the opening radiates into — boundary loading. On a duct it applies only when the mouth is left unconnected; plugged means it loads the circuit but emits nothing.',
  label: 'Display name for this node.',
}

/**
 * A labelled numeric parameter input bound to one node field.
 *
 * Empty and unparseable input is ignored rather than written, so clearing
 * the box to retype a value does not momentarily push `NaN` into the graph
 * and trigger a failed solve.
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
      <input
        type="number"
        step={step || 'any'}
        value={value ?? ''}
        min={min}
        onChange={(e) => {
          const v = e.target.value === '' ? '' : parseFloat(e.target.value)
          if (v === '' || Number.isNaN(v)) return
          if (onCommit) onCommit(v)
          else updateParams(id, { [field]: v })
        }}
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
    <div className="param-row">
      <label title={TIPS[field] || ''}>{label || field}</label>
      <select value={value} onChange={(e) => updateParams(id, { [field]: e.target.value })}>
        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
      <span className="unit" />
    </div>
  )
}

/**
 * The per-node loss control: a Q value with a lossless override.
 *
 * Every node has an independent Q applied as a complex loss term — wall
 * flexure on chambers, port turbulence on waveguides, surround loss on
 * passive radiators. Ticking ∞ disables loss entirely and greys the input,
 * rather than expecting the user to know that a very large Q means the same
 * thing.
 *
 * @param {object} props - Component props.
 * @param {string} props.id - Node id.
 * @param {object} props.p - The node's params.
 * @returns {React.ReactElement} The Q control.
 * @sideEffect Subscribes to the store.
 */
function QSection({ id, p }) {
  const updateParams = useStore((s) => s.updateParams)
  return (
    <>
      <div className="param-row">
        <label title={TIPS.Q}>Q factor</label>
        <input
          type="number" step="1" min="1"
          value={p.lossless ? '' : p.Q}
          placeholder="∞"
          disabled={p.lossless}
          onChange={(e) => {
            const v = parseFloat(e.target.value)
            if (!Number.isNaN(v)) updateParams(id, { Q: Math.max(1, v) })
          }}
        />
        <span className="unit">
          <label style={{ display: 'flex', gap: 3, alignItems: 'center', fontSize: 10 }}>
            <input type="checkbox" checked={!!p.lossless} onChange={(e) => updateParams(id, { lossless: e.target.checked })} />∞
          </label>
        </span>
      </div>
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
    <div className="param-row">
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
    <div className="panel-section">
      <h4>Amplifier · P = V²/Z</h4>
      {f('voltage', 'Voltage', 'V')}
      {f('impedance', 'Impedance', 'Ω')}
      {f('power', 'Power', 'W')}
      <div className="param-row">
        <label title="Amplifier output (source) impedance in series with the driver.">Rg</label>
        <input type="number" step="any" min="0" value={settings.rg}
          onChange={(e) => { const v = parseFloat(e.target.value); if (!Number.isNaN(v)) updateSettings({ rg: v }) }} />
        <span className="unit">Ω</span>
      </div>
    </div>
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
      <button
        className={`ts-lock${held ? ' held' : ''}`}
        aria-pressed={held}
        aria-label={`${held ? 'Release' : 'Hold'} ${field}`}
        title={held
          ? `${field} is yours to set. Release it to let it follow the others.`
          : `${field} follows the others. Hold it to set it yourself.`}
        onClick={() => setDriverLock(id, field, !held)}
      >{held ? '🔒' : '🔓'}</button>
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
  return (
    <>
      <div className="panel-section">
        <h4>Driver — T/S Parameters</h4>
        <LabelField id={id} p={p} />
        <div className="drv-actions">
          <button onClick={() => setShowDriverDB(true)}>Database…</button>
          <button onClick={() => setShowTSCalc(true)}>T/S Solver…</button>
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
        <div className="ts-hint">
          {BASIS_SIZE} of these are yours to set; the rest follow. Move a padlock
          to change which.
        </div>
        {ts('Fs', 'Hz')}
        {ts('Qts', '', '0.01')}
        {ts('Qes', '', '0.01')}
        {ts('Qms', '', '0.1')}
        {ts('Vas', 'L')}
        {ts('Re', 'Ω')}
        {ts('Bl', 'T·m')}
        {ts('Mms', 'g')}
        {ts('Cms', 'mm/N', '0.01')}
        {ts('Sd', 'cm²')}
        {ts('Rms', 'kg/s', '0.1')}
        <NumField id={id} field="Le" value={p.Le} unit="mH" step="0.1" />
        <NumField id={id} field="LeExp" value={p.LeExp} label="Le exponent" step="0.05" min="0.3" />
        <NumField id={id} field="Xmax" value={p.Xmax} unit="mm" />
      </div>
      <div className="panel-section">
        <h4>Array</h4>
        <NumField id={id} field="count" value={p.count} label="Drivers" step="1" min="1" />
        <SelectField id={id} field="wiring" value={p.wiring} options={[
          ['single', 'Single'], ['series', 'Series'], ['parallel', 'Parallel'], ['series-parallel', 'Series-parallel'],
        ]} />
      </div>
      <div className="panel-section">
        <h4>Losses</h4>
        <QSection id={id} p={p} />
        <div style={{ fontSize: 10.5, color: 'var(--text-3)' }}>Adds mechanical loss beyond the datasheet Rms.</div>
      </div>
    </>
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
  return (
    <div className="panel-section">
      <h4>Chamber</h4>
      <LabelField id={id} p={p} />
      <NumField id={id} field="volume" value={p.volume} label="Volume" unit="L" />
      <NumField id={id} field="length" value={p.length} label="Length" unit="cm" />
      <SelectField id={id} field="shape" value={p.shape} options={[['rectangular', 'Rectangular'], ['cylindrical', 'Cylindrical']]} />
      <NumField id={id} field="stuffing" value={p.stuffing} label="Stuffing" unit="g/L" min="0" />
      <QSection id={id} p={p} />
      <ProbeSection id={id} p={p} />
      <div style={{ fontSize: 10.5, color: 'var(--text-3)', lineHeight: 1.4 }}>
        Low Q (5–10) ≈ flexible panel / car door. High Q (50+) ≈ rigid MDF.
        First standing wave at c/2L = {(344 / (2 * p.length / 100)).toFixed(0)} Hz.
      </div>
    </div>
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
    <div style={{ borderTop: '1px solid var(--border, #30363d)', marginTop: 8, paddingTop: 8 }}>
      <div className="param-row">
        <label title="Report SPL inside this volume (virtual microphone). Shows on the Interior SPL chart tab.">
          <input
            type="checkbox"
            checked={!!p.probe}
            onChange={(e) => updateParams(id, { probe: e.target.checked })}
            style={{ marginRight: 6 }}
          />
          SPL probe (mic inside)
        </label>
      </div>
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
            <span style={{ fontSize: 11, minWidth: 34, textAlign: 'right' }}>{p.probePos ?? 100}%</span>
          </div>
          <div style={{ fontSize: 10.5, color: 'var(--text-3)', lineHeight: 1.4 }}>
            Uniform below c/2L (cabin-gain region); position matters at the standing-wave modes.
          </div>
        </>
      )}
    </div>
  )
}

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
  return (
    <div className="panel-section">
      <h4>Waveguide Segment</h4>
      <LabelField id={id} p={p} />
      <NumField id={id} field="S1" value={p.S1} label="S1 throat" unit="cm²" />
      <NumField id={id} field="S2" value={p.S2} label="S2 mouth" unit="cm²" />
      <NumField id={id} field="length" value={p.length} label="Length" unit="cm" />
      <SelectField id={id} field="flare" value={p.flare} options={[
        ['conical', 'Conical'], ['exponential', 'Exponential'], ['parabolic', 'Parabolic'],
        ['hypex', 'Hyperbolic-exp (hypex)'], ['tractrix', 'Tractrix ≈'], ['lecleach', 'Le Cléac’h ≈'],
      ]} />
      <SelectField id={id} field="space" value={p.space} label="Mouth radiates into" options={[
        ['free', 'Free space 4π'], ['half', 'Half space 2π'], ['quarter', 'Quarter space π'],
        ['eighth', 'Eighth space π/2'], ['rigid', 'Plugged (no output)'],
      ]} />
      <NumField id={id} field="ecFactor" value={p.ecFactor} label="End corr. ×" step="0.05" min="0" />
      <QSection id={id} p={p} />
      <div style={{ fontSize: 11, color: 'var(--text-2)', marginBottom: 4 }}>
        Internal volume: <b>{(waveguideVolume(p.flare, p.S1 * 1e-4, p.S2 * 1e-4, p.length / 100) * 1000).toFixed(2)} L</b>
      </div>
      <div style={{ fontSize: 10.5, color: 'var(--text-3)' }}>
        Set S1 = S2 for a straight port. Q here models port turbulence and wall loss.
        End corrections come from what each end meets, so splitting a duct into
        several segments does not change it. The solid angle applies only while
        the mouth is unconnected.
      </div>
    </div>
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
  const m = (p.Mmd + (p.addedMass || 0)) / 1000
  const fs = 1 / (2 * Math.PI * Math.sqrt(Math.max(m * (p.Cms / 1000), 1e-12)))
  return (
    <div className="panel-section">
      <h4>Passive Radiator</h4>
      <LabelField id={id} p={p} />
      <NumField id={id} field="Mmd" value={p.Mmd} unit="g" />
      <div onDoubleClick={() => setCalcOpen(!calcOpen)} title="Double-click to derive Cms from a target Fs">
        <NumField id={id} field="Cms" value={p.Cms} unit="mm/N" step="0.01" />
      </div>
      {calcOpen && (
        <div style={{ border: '1px solid var(--border)', padding: 6, marginBottom: 6 }}>
          <div className="param-row">
            <label>Target Fs</label>
            <input type="number" value={calcFs} onChange={(e) => setCalcFs(parseFloat(e.target.value) || 0)} />
            <span className="unit">Hz</span>
          </div>
          <button onClick={() => {
            if (calcFs > 0) {
              const cms = 1 / (Math.pow(2 * Math.PI * calcFs, 2) * (p.Mmd / 1000)) * 1000
              updateParams(id, { Cms: Math.round(cms * 1000) / 1000 })
              setCalcOpen(false)
            }
          }}>Cms = 1/((2πFs)²·Mmd) → apply</button>
        </div>
      )}
      <NumField id={id} field="Rms" value={p.Rms} unit="kg/s" step="0.1" />
      <NumField id={id} field="Sd" value={p.Sd} unit="cm²" />
      <NumField id={id} field="addedMass" value={p.addedMass} label="Added mass" unit="g" min="0" />
      <SelectField id={id} field="space" value={p.space} label="Radiates into" options={[
        ['free', 'Free space 4π'], ['half', 'Half space 2π'], ['quarter', 'Quarter space π'], ['eighth', 'Eighth space π/2'],
      ]} />
      <QSection id={id} p={p} />
      <div style={{ fontSize: 11, color: 'var(--text-2)' }}>Resonance as configured: <b>{fs.toFixed(1)} Hz</b></div>
    </div>
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
  return (
    <div className="panel-section">
      <h4>Radiation Termination</h4>
      <LabelField id={id} p={p} />
      <SelectField id={id} field="space" value={p.space} label="Boundary" options={[
        ['free', 'Free space (4π sr)'], ['half', 'Half space (2π sr)'],
        ['quarter', 'Quarter space (π sr)'], ['eighth', 'Eighth space (π/2 sr)'],
        ['rigid', 'Rigid wall (reflective)'], ['anechoic', 'Anechoic (absorbing)'],
      ]} />
      <div style={{ fontSize: 10.5, color: 'var(--text-3)', lineHeight: 1.4 }}>
        Applies circular-piston radiation impedance for the chosen solid angle.
        Rigid = perfect reflection; anechoic = ρc termination, no reflection.
      </div>
    </div>
  )
}

const FORMS = { driver: DriverForm, chamber: ChamberForm, waveguide: WaveguideForm, pr: PRForm, radiation: RadiationForm }

/**
 * The Parameters panel: the amplifier section plus the selected node's form.
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
      {Form
        ? <Form node={node} key={node.id} />
        : <div style={{ color: 'var(--text-3)', fontSize: 12, padding: 8 }}>
            Select a node (click or right-click) to edit its parameters.
          </div>}
      {selectedNodeId && !node && null}
    </div>
  )
}

// Module-private functions, exposed for the contract test suite only
// (test/contract/*). Not part of this module's public API — application code
// must not import from here, and nothing outside the tests does.
export const __internals = { round3 }
