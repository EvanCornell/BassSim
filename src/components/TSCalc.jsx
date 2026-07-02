import React, { useState } from 'react'
import { useForm } from 'react-hook-form'
import { useStore } from '../store'
import { RHO, C_AIR } from '../engine/acoustics'

// T/S parameter solver: derive the full parameter set from measurements.
// Three methods: datasheet (Fs+Vas+Qes+Qms+Re+Sd), added mass, known box.

const FORMULAS = {
  Cms: 'Cms = Vas / (ρc²·Sd²)',
  Mms: 'Mms = 1 / ((2πFs)²·Cms)',
  Bl: 'Bl = √(2πFs·Mms·Re / Qes)',
  Rms: 'Rms = 2πFs·Mms / Qms',
  Qts: 'Qts = Qes·Qms / (Qes + Qms)',
  MmsAdded: 'Mms = m_add / ((Fs/Fs\')² − 1)',
  VasBox: 'Vas = Vb·((Fc/Fs)² − 1)',
}

function solveDatasheet({ Fs, Vas, Qes, Qms, Re, Sd }) {
  const SdM = Sd * 1e-4
  const Cms = (Vas * 1e-3) / (RHO * C_AIR * C_AIR * SdM * SdM) // m/N
  const ws = 2 * Math.PI * Fs
  const Mms = 1 / (ws * ws * Cms) // kg
  const Bl = Math.sqrt((ws * Mms * Re) / Qes)
  const Rms = (ws * Mms) / Qms
  const Qts = (Qes * Qms) / (Qes + Qms)
  return { Fs, Vas, Qes, Qms, Qts, Re, Sd, Cms: Cms * 1e3, Mms: Mms * 1e3, Bl, Rms }
}

function solveAddedMass({ Fs, FsPrime, mAdd, Qes, Qms, Re, Sd }) {
  const ratio = Math.pow(Fs / FsPrime, 2) - 1
  if (ratio <= 0) throw new Error('Fs with added mass must be lower than free-air Fs.')
  const Mms = (mAdd * 1e-3) / ratio // kg
  const ws = 2 * Math.PI * Fs
  const Cms = 1 / (ws * ws * Mms)
  const SdM = Sd * 1e-4
  const Vas = Cms * RHO * C_AIR * C_AIR * SdM * SdM * 1e3 // L
  const Bl = Qes ? Math.sqrt((ws * Mms * Re) / Qes) : undefined
  const Rms = Qms ? (ws * Mms) / Qms : undefined
  const Qts = Qes && Qms ? (Qes * Qms) / (Qes + Qms) : undefined
  return { Fs, Vas, Qes, Qms, Qts, Re, Sd, Cms: Cms * 1e3, Mms: Mms * 1e3, Bl, Rms }
}

function solveKnownBox({ Fs, Fc, Vb, Qes, Qms, Re, Sd }) {
  const ratio = Math.pow(Fc / Fs, 2) - 1
  if (ratio <= 0) throw new Error('In-box resonance Fc must be higher than free-air Fs.')
  const Vas = Vb * ratio
  return solveDatasheet({ Fs, Vas, Qes, Qms, Re, Sd })
}

const num = { valueAsNumber: true }

export default function TSCalc() {
  const show = useStore((s) => s.showTSCalc)
  const setShow = useStore((s) => s.setShowTSCalc)
  const node = useStore((s) => s.nodes.find((n) => n.id === s.selectedNodeId))
  const updateParams = useStore((s) => s.updateParams)
  const [method, setMethod] = useState('datasheet')
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)
  const { register, handleSubmit } = useForm({
    defaultValues: { Fs: 30, Vas: 60, Qes: 0.5, Qms: 5, Re: 3.6, Sd: 480, FsPrime: 24, mAdd: 50, Fc: 45, Vb: 40 },
  })

  if (!show) return null

  const onSolve = handleSubmit((v) => {
    setError(null)
    try {
      const r = method === 'datasheet' ? solveDatasheet(v)
        : method === 'addedmass' ? solveAddedMass(v)
        : solveKnownBox(v)
      setResult(r)
    } catch (e) {
      setResult(null)
      setError(e.message)
    }
  })

  const applyToNode = () => {
    if (!result) return
    if (!node || node.type !== 'driver') { alert('Select a Driver node first.'); return }
    const patch = {}
    for (const k of ['Fs', 'Vas', 'Qes', 'Qms', 'Qts', 'Re', 'Sd', 'Cms', 'Mms', 'Bl', 'Rms']) {
      if (result[k] != null && isFinite(result[k])) patch[k] = Math.round(result[k] * 1000) / 1000
    }
    updateParams(node.id, patch)
    setShow(false)
  }

  const F = ({ name, label, unit }) => (
    <div className="param-row">
      <label>{label}</label>
      <input type="number" step="any" {...register(name, num)} />
      <span className="unit">{unit}</span>
    </div>
  )

  return (
    <div className="modal-backdrop" onClick={() => setShow(false)}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>T/S Parameter Solver</h3>
        <div className="param-row">
          <label>Method</label>
          <select value={method} onChange={(e) => { setMethod(e.target.value); setResult(null) }}>
            <option value="datasheet">Datasheet: Fs + Vas + Qes + Qms</option>
            <option value="addedmass">Added mass: Fs + Re + m_add + Fs′</option>
            <option value="knownbox">Known box: Fs + Re + Vb + Fc</option>
          </select>
          <span className="unit" />
        </div>
        <F name="Fs" label="Fs (free air)" unit="Hz" />
        <F name="Re" label="Re" unit="Ω" />
        <F name="Sd" label="Sd" unit="cm²" />
        <F name="Qes" label="Qes" unit="" />
        <F name="Qms" label="Qms" unit="" />
        {method === 'datasheet' && <F name="Vas" label="Vas" unit="L" />}
        {method === 'addedmass' && (<>
          <F name="mAdd" label="Added mass" unit="g" />
          <F name="FsPrime" label="Fs′ (w/ mass)" unit="Hz" />
        </>)}
        {method === 'knownbox' && (<>
          <F name="Vb" label="Test box Vb" unit="L" />
          <F name="Fc" label="Fc (in box)" unit="Hz" />
        </>)}
        <button className="primary" onClick={onSolve} style={{ marginTop: 6 }}>Solve</button>
        {error && <div style={{ color: 'var(--red)', marginTop: 8, fontSize: 12 }}>{error}</div>}
        {result && (
          <table style={{ marginTop: 10 }}>
            <tbody>
              {[['Mms', 'g', FORMULAS.Mms], ['Cms', 'mm/N', FORMULAS.Cms], ['Bl', 'T·m', FORMULAS.Bl],
                ['Rms', 'kg/s', FORMULAS.Rms], ['Qts', '', FORMULAS.Qts], ['Vas', 'L', FORMULAS.VasBox]]
                .filter(([k]) => result[k] != null && isFinite(result[k]))
                .map(([k, unit, formula]) => (
                  <tr key={k} title={formula}>
                    <td style={{ cursor: 'help' }}>{k}</td>
                    <td><b>{result[k].toFixed(3)}</b> {unit}</td>
                    <td style={{ color: 'var(--text-3)', fontSize: 10.5 }}>{formula}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        )}
        <div className="close-row">
          <button onClick={() => setShow(false)}>Close</button>
          <button className="primary" disabled={!result} onClick={applyToNode}>Apply to driver</button>
        </div>
      </div>
    </div>
  )
}
