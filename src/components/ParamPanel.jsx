import React, { useState } from 'react'
import { useStore } from '../store'
import { waveguideVolume } from '../engine/geometry'

// Tooltip text: one-line physical explanation per parameter
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
  ecFactor: 'End-correction factor k: added length ΔL = k·a at the mouth (0.85 flanged, 0.61 free).',
  Mmd: 'Moving mass of the passive radiator cone (without air load).',
  addedMass: 'Extra mass bolted to the cone to lower its resonance.',
  space: 'Solid angle the opening radiates into — boundary loading.',
  label: 'Display name for this node.',
}

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

function AmpSolver() {
  const settings = useStore((s) => s.settings)
  const setAmp = useStore((s) => s.setAmp)
  const updateSettings = useStore((s) => s.updateSettings)
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

const round3 = (v) => (typeof v === 'number' ? Math.round(v * 1000) / 1000 : v)

function DriverForm({ node }) {
  const p = node.data.params
  const id = node.id
  const setShowDriverDB = useStore((s) => s.setShowDriverDB)
  const setShowTSCalc = useStore((s) => s.setShowTSCalc)
  return (
    <>
      <div className="panel-section">
        <h4>Driver — T/S Parameters</h4>
        <LabelField id={id} p={p} />
        <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
          <button onClick={() => setShowDriverDB(true)}>Database…</button>
          <button onClick={() => setShowTSCalc(true)}>T/S Solver…</button>
        </div>
        <NumField id={id} field="Fs" value={p.Fs} unit="Hz" />
        <NumField id={id} field="Qts" value={p.Qts} step="0.01" />
        <NumField id={id} field="Qes" value={p.Qes} step="0.01" />
        <NumField id={id} field="Qms" value={p.Qms} step="0.1" />
        <NumField id={id} field="Vas" value={p.Vas} unit="L" />
        <NumField id={id} field="Re" value={p.Re} unit="Ω" />
        <NumField id={id} field="Bl" value={p.Bl} unit="T·m" />
        <NumField id={id} field="Mms" value={p.Mms} unit="g" />
        <NumField id={id} field="Cms" value={p.Cms} unit="mm/N" step="0.01" />
        <NumField id={id} field="Sd" value={p.Sd} unit="cm²" />
        <NumField id={id} field="Rms" value={p.Rms} unit="kg/s" step="0.1" />
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
      <NumField id={id} field="ecFactor" value={p.ecFactor} label="End corr. k" step="0.01" min="0" />
      <QSection id={id} p={p} />
      <div style={{ fontSize: 11, color: 'var(--text-2)', marginBottom: 4 }}>
        Internal volume: <b>{(waveguideVolume(p.flare, p.S1 * 1e-4, p.S2 * 1e-4, p.length / 100) * 1000).toFixed(2)} L</b>
      </div>
      <div style={{ fontSize: 10.5, color: 'var(--text-3)' }}>
        Set S1 = S2 for a straight port. Q here models port turbulence and wall loss.
      </div>
    </div>
  )
}

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
        <div style={{ border: '1px solid var(--border)', borderRadius: 6, padding: 6, marginBottom: 6 }}>
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
