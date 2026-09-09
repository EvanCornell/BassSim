import React, { useState } from 'react'
import { useForm } from 'react-hook-form'
import { useStore } from '../store'
import { RHO, C_AIR } from '../engine/geometry'
import { useBackdropDismiss } from '../utils/backdrop'

/**
 * The relations used by each solver, shown beside the results.
 *
 * Displayed rather than hidden so the user can check the derivation against
 * their own reference — these are standard identities, and seeing which one
 * produced a number is how you catch a mis-entered measurement.
 */
const FORMULAS = {
  Cms: 'Cms = Vas / (ρc²·Sd²)',
  Mms: 'Mms = 1 / ((2πFs)²·Cms)',
  Bl: 'Bl = √(2πFs·Mms·Re / Qes)',
  Rms: 'Rms = 2πFs·Mms / Qms',
  Qts: 'Qts = Qes·Qms / (Qes + Qms)',
  MmsAdded: 'Mms = m_add / ((Fs/Fs\')² − 1)',
  VasBox: 'Vas = Vb·((Fc/Fs)² − 1)',
}

/**
 * Derive the full T/S set from published datasheet figures.
 *
 * The canonical path: Vas gives compliance, compliance and Fs give moving
 * mass, and mass with Qes and Qms gives motor strength and mechanical
 * resistance.
 *
 * @param {object} m - Measurements.
 * @param {number} m.Fs - Free-air resonance, Hz.
 * @param {number} m.Vas - Equivalent compliance volume, litres.
 * @param {number} m.Qes - Electrical Q.
 * @param {number} m.Qms - Mechanical Q.
 * @param {number} m.Re - DC resistance, ohms.
 * @param {number} m.Sd - Effective cone area, cm².
 * @returns {{Fs: number, Vas: number, Qes: number, Qms: number, Qts: number, Re: number, Sd: number, Cms: number, Mms: number, Bl: number, Rms: number}} The complete T/S set in display units — the six inputs echoed back plus Cms mm/N, Mms g, Bl T·m and Rms N·s/m.
 * @pre Every input is positive; a zero Qes or Qms divides by zero.
 * @pure
 */
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

/**
 * Derive the T/S set from the added-mass measurement.
 *
 * Loading the cone with a known mass drops its resonance, and the size of
 * that drop gives the moving mass directly — which is what makes this the
 * practical method for a driver with no datasheet.
 *
 * Qes and Qms are optional here: without them the mass, compliance and Vas
 * are still recoverable, and the motor figures are simply left undefined.
 *
 * @param {object} m - Measurements.
 * @param {number} m.Fs - Free-air resonance, Hz.
 * @param {number} m.FsPrime - Resonance with the added mass fitted, Hz.
 * @param {number} m.mAdd - Added mass, grams.
 * @param {number} [m.Qes] - Electrical Q, if known.
 * @param {number} [m.Qms] - Mechanical Q, if known.
 * @param {number} m.Re - DC resistance, ohms.
 * @param {number} m.Sd - Effective cone area, cm².
 * @returns {object} The T/S set in display units; `Bl`, `Rms` and `Qts` are `undefined` when the Q values were not supplied.
 * @throws {Error} When the loaded resonance is not below the free-air one, which means the measurements are swapped or wrong.
 * @pure
 */
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

/**
 * Derive the T/S set from the resonance shift in a box of known volume.
 *
 * Sealing the driver in a known volume raises its resonance, and the size of
 * that rise gives Vas as `Vb·((Fc/Fs)² − 1)` — after which this delegates to
 * `solveDatasheet`, so equivalent inputs give identical results.
 *
 * @param {object} m - Measurements.
 * @param {number} m.Fs - Free-air resonance, Hz.
 * @param {number} m.Fc - Resonance in the test box, Hz.
 * @param {number} m.Vb - Test box volume, litres.
 * @param {number} m.Qes - Electrical Q.
 * @param {number} m.Qms - Mechanical Q.
 * @param {number} m.Re - DC resistance, ohms.
 * @param {number} m.Sd - Effective cone area, cm².
 * @returns {{Fs: number, Vas: number, Qes: number, Qms: number, Qts: number, Re: number, Sd: number, Cms: number, Mms: number, Bl: number, Rms: number}} The complete T/S set in display units, identical to what `solveDatasheet` returns for the derived Vas.
 * @throws {Error} When the in-box resonance is not above the free-air one, which means the measurements are swapped or the box is leaking.
 * @pure
 */
function solveKnownBox({ Fs, Fc, Vb, Qes, Qms, Re, Sd }) {
  const ratio = Math.pow(Fc / Fs, 2) - 1
  if (ratio <= 0) throw new Error('In-box resonance Fc must be higher than free-air Fs.')
  const Vas = Vb * ratio
  return solveDatasheet({ Fs, Vas, Qes, Qms, Re, Sd })
}

/**
 * React Hook Form options coercing an input's value to a number.
 */
const num = { valueAsNumber: true }

/**
 * The Thiele/Small solver: derive a full parameter set from measurements.
 *
 * Three methods — datasheet, added mass and known box — sharing one result
 * view, so the derived set can be applied to a driver node whichever way it
 * was obtained.
 *
 * @returns {React.ReactElement|null} The modal, or `null` when hidden.
 * @sideEffect Subscribes to the store.
 */
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

  const dismiss = useBackdropDismiss(() => setShow(false))
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

  /**
   * Write the derived parameters into the selected driver node.
   *
   * Rounded to three decimals, which is past the precision the measurements
   * justify and keeps the parameter panel readable.
   *
   * @returns {void}
   * @sideEffect Updates the node's params — which triggers a resimulation — and closes the modal. Alerts and does nothing when no driver node is selected.
   */
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

  /**
   * One labelled numeric input row, registered with the form.
   *
   * @param {object} props - Component props.
   * @param {string} props.name - Form field name.
   * @param {string} props.label - Display label.
   * @param {string} props.unit - Unit shown after the input.
   * @returns {React.ReactElement} The input row.
   * @reads the enclosing form's `register`.
   */
  const F = ({ name, label, unit }) => (
    <div className="param-row">
      <label>{label}</label>
      <input type="number" step="any" {...register(name, num)} />
      <span className="unit">{unit}</span>
    </div>
  )

  return (
    <div className="modal-backdrop" {...dismiss}>
      <div className="modal">
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

// Module-private functions, exposed for the contract test suite only
// (test/contract/*). Not part of this module's public API — application code
// must not import from here, and nothing outside the tests does.
export const __internals = { solveDatasheet, solveAddedMass, solveKnownBox }
