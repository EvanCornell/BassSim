import React, { useState } from 'react'
import { useForm } from 'react-hook-form'
import { useStore } from '../store'
import { RHO, C_AIR } from '../engine/geometry'
import { useBackdropDismiss } from '../utils/backdrop'

/** 2π, which appears in every relation here as the resonance's angular form. */
const TAU = 2 * Math.PI
/** ρc², the bulk modulus of air — the constant tying compliance to Vas. */
const K = RHO * C_AIR * C_AIR

/**
 * Mechanical compliance implied by an equivalent volume.
 *
 * @param {number} Vas - Equivalent compliance volume, litres.
 * @param {number} Sd - Effective cone area, cm².
 * @returns {number} Compliance, m/N.
 * @pure
 */
function compliance(Vas, Sd) {
  const s = Sd * 1e-4
  return (Vas * 1e-3) / (K * s * s)
}

/**
 * Equivalent volume implied by a compliance — the inverse of `compliance`.
 *
 * @param {number} Cms - Compliance, m/N.
 * @param {number} Sd - Effective cone area, cm².
 * @returns {number} Equivalent compliance volume, litres.
 * @pure
 */
function equivalentVolume(Cms, Sd) {
  const s = Sd * 1e-4
  return Cms * K * s * s * 1e3
}

// ---------- substitutions ----------
//
// One function per relation a missing parameter can be recovered through.
// Each takes the substitute's own inputs and, where the relation needs them,
// the core parameters resolved so far. All of them work in display units in
// and out — grams, millimetres per newton, litres, centimetres — because
// that is what the datasheet in front of the user is printed in.

/**
 * Free-air resonance from moving mass and compliance.
 *
 * @param {object} a - Substitute inputs.
 * @param {number} a.Mms - Moving mass, grams.
 * @param {number} a.Cms - Compliance, mm/N.
 * @returns {number} Fs, Hz.
 * @pure
 */
function fsFromMmsCms(a) {
  return 1 / (TAU * Math.sqrt(a.Mms * 1e-3 * a.Cms * 1e-3))
}

/**
 * Free-air resonance from moving mass, taking compliance from Vas and Sd.
 *
 * @param {object} a - Substitute inputs.
 * @param {number} a.Mms - Moving mass, grams.
 * @param {object} c - Core parameters resolved so far.
 * @param {number} c.Vas - Equivalent compliance volume, litres.
 * @param {number} c.Sd - Effective cone area, cm².
 * @returns {number} Fs, Hz.
 * @pure
 */
function fsFromMmsVas(a, c) {
  return 1 / (TAU * Math.sqrt(a.Mms * 1e-3 * compliance(c.Vas, c.Sd)))
}

/**
 * DC resistance from the impedance peak.
 *
 * At resonance the motional branch adds Re·Qms/Qes in parallel with nothing
 * else, so the peak stands at Re(1 + Qms/Qes) — an exact relation, and Zmax
 * is one of the few things a sheet without Re still tends to plot.
 *
 * @param {object} a - Substitute inputs.
 * @param {number} a.Zmax - Impedance at resonance, ohms.
 * @param {object} c - Core parameters resolved so far.
 * @param {number} c.Qms - Mechanical Q.
 * @param {number} c.Qes - Electrical Q.
 * @returns {number} Re, ohms.
 * @pure
 */
function reFromZmax(a, c) {
  return a.Zmax / (1 + c.Qms / c.Qes)
}

/**
 * DC resistance estimated from the nominal impedance rating.
 *
 * A rule of thumb rather than a relation: nominal impedance is a marketing
 * figure, and Re lands somewhere near 0.85 of it across most drivers. Marked
 * as an estimate wherever it is used, because it is the one substitution here
 * that cannot be derived from anything.
 *
 * @param {object} a - Substitute inputs.
 * @param {number} a.Znom - Nominal impedance rating, ohms.
 * @returns {number} Re, ohms.
 * @pure
 */
function reFromZnom(a) {
  return 0.85 * a.Znom
}

/**
 * Cone area from the effective piston diameter.
 *
 * @param {object} a - Substitute inputs.
 * @param {number} a.Dia - Effective piston diameter, cm.
 * @returns {number} Sd, cm².
 * @pure
 */
function sdFromDiameter(a) {
  return (Math.PI * a.Dia * a.Dia) / 4
}

/**
 * Cone area from compliance and the equivalent volume it produces.
 *
 * @param {object} a - Substitute inputs.
 * @param {number} a.Cms - Compliance, mm/N.
 * @param {object} c - Core parameters resolved so far.
 * @param {number} c.Vas - Equivalent compliance volume, litres.
 * @returns {number} Sd, cm².
 * @pure
 */
function sdFromVasCms(a, c) {
  return Math.sqrt((c.Vas * 1e-3) / (K * a.Cms * 1e-3)) * 1e4
}

/**
 * Electrical Q from total and mechanical Q.
 *
 * The most common gap of all: sheets that print Qts and Qms but not Qes.
 *
 * @param {object} a - Substitute inputs.
 * @param {number} a.Qts - Total Q.
 * @param {object} c - Core parameters resolved so far.
 * @param {number} c.Qms - Mechanical Q.
 * @returns {number} Qes.
 * @throws {Error} When Qts is not below Qms, which no real driver allows.
 * @pure
 */
function qesFromQtsQms(a, c) {
  if (a.Qts >= c.Qms) throw new Error('Qts must be lower than Qms — check which figure is which.')
  return (a.Qts * c.Qms) / (c.Qms - a.Qts)
}

/**
 * Electrical Q from motor strength and moving mass.
 *
 * @param {object} a - Substitute inputs.
 * @param {number} a.Bl - Motor strength, T·m.
 * @param {number} a.Mms - Moving mass, grams.
 * @param {object} c - Core parameters resolved so far.
 * @param {number} c.Fs - Free-air resonance, Hz.
 * @param {number} c.Re - DC resistance, ohms.
 * @returns {number} Qes.
 * @pure
 */
function qesFromBlMms(a, c) {
  return (TAU * c.Fs * a.Mms * 1e-3 * c.Re) / (a.Bl * a.Bl)
}

/**
 * Mechanical Q from total and electrical Q.
 *
 * @param {object} a - Substitute inputs.
 * @param {number} a.Qts - Total Q.
 * @param {object} c - Core parameters resolved so far.
 * @param {number} c.Qes - Electrical Q.
 * @returns {number} Qms.
 * @throws {Error} When Qts is not below Qes, which no real driver allows.
 * @pure
 */
function qmsFromQtsQes(a, c) {
  if (a.Qts >= c.Qes) throw new Error('Qts must be lower than Qes — check which figure is which.')
  return (a.Qts * c.Qes) / (c.Qes - a.Qts)
}

/**
 * Mechanical Q from suspension losses and moving mass.
 *
 * @param {object} a - Substitute inputs.
 * @param {number} a.Rms - Mechanical resistance, kg/s.
 * @param {number} a.Mms - Moving mass, grams.
 * @param {object} c - Core parameters resolved so far.
 * @param {number} c.Fs - Free-air resonance, Hz.
 * @returns {number} Qms.
 * @pure
 */
function qmsFromRmsMms(a, c) {
  return (TAU * c.Fs * a.Mms * 1e-3) / a.Rms
}

/**
 * Equivalent volume from compliance.
 *
 * @param {object} a - Substitute inputs.
 * @param {number} a.Cms - Compliance, mm/N.
 * @param {object} c - Core parameters resolved so far.
 * @param {number} c.Sd - Effective cone area, cm².
 * @returns {number} Vas, litres.
 * @pure
 */
function vasFromCms(a, c) {
  return equivalentVolume(a.Cms * 1e-3, c.Sd)
}

/**
 * Equivalent volume from moving mass, via the compliance Fs and Mms imply.
 *
 * @param {object} a - Substitute inputs.
 * @param {number} a.Mms - Moving mass, grams.
 * @param {object} c - Core parameters resolved so far.
 * @param {number} c.Fs - Free-air resonance, Hz.
 * @param {number} c.Sd - Effective cone area, cm².
 * @returns {number} Vas, litres.
 * @pure
 */
function vasFromMms(a, c) {
  const ws = TAU * c.Fs
  return equivalentVolume(1 / (ws * ws * a.Mms * 1e-3), c.Sd)
}

/**
 * The six parameters the solver works from, in the order they are entered.
 */
export const CORE = [
  { key: 'Fs', label: 'Fs (free air)', unit: 'Hz' },
  { key: 'Re', label: 'Re', unit: 'Ω' },
  { key: 'Sd', label: 'Sd', unit: 'cm²' },
  { key: 'Qes', label: 'Qes', unit: '' },
  { key: 'Qms', label: 'Qms', unit: '' },
  { key: 'Vas', label: 'Vas', unit: 'L' },
]

/**
 * What each parameter can be recovered from when the datasheet omits it.
 *
 * `needs` lists the other core parameters a substitution consumes, which is
 * what lets the solver order the work and refuse a set that is circular —
 * Qes from Qts needs Qms, so it cannot also be where Qms comes from.
 *
 * Substitute inputs are keyed by name rather than by substitution, so a
 * figure entered once is still there after switching to another route that
 * also uses it. Mms in particular appears in five of them.
 */
export const ALTS = {
  Fs: [
    {
      id: 'MmsCms', label: 'Mms and Cms', formula: 'Fs = 1 / (2π√(Mms·Cms))',
      inputs: [['Mms', 'Mms', 'g'], ['Cms', 'Cms', 'mm/N']], needs: [], solve: fsFromMmsCms,
    },
    {
      id: 'MmsVas', label: 'Mms (with Vas and Sd)', formula: 'Cms = Vas / (ρc²·Sd²), Fs = 1 / (2π√(Mms·Cms))',
      inputs: [['Mms', 'Mms', 'g']], needs: ['Vas', 'Sd'], solve: fsFromMmsVas,
    },
  ],
  Re: [
    {
      id: 'Zmax', label: 'impedance peak Zmax', formula: 'Re = Zmax / (1 + Qms/Qes)',
      inputs: [['Zmax', 'Zmax', 'Ω']], needs: ['Qms', 'Qes'], solve: reFromZmax,
    },
    {
      id: 'Znom', label: 'nominal impedance (estimate)', formula: 'Re ≈ 0.85·Znom',
      inputs: [['Znom', 'Nominal Z', 'Ω']], needs: [], solve: reFromZnom, estimate: true,
    },
  ],
  Sd: [
    {
      id: 'Dia', label: 'effective diameter', formula: 'Sd = π·D² / 4',
      inputs: [['Dia', 'Eff. diameter', 'cm']], needs: [], solve: sdFromDiameter,
    },
    {
      id: 'VasCms', label: 'Cms (with Vas)', formula: 'Sd = √(Vas / (ρc²·Cms))',
      inputs: [['Cms', 'Cms', 'mm/N']], needs: ['Vas'], solve: sdFromVasCms,
    },
  ],
  Qes: [
    {
      id: 'QtsQms', label: 'Qts (with Qms)', formula: 'Qes = Qts·Qms / (Qms − Qts)',
      inputs: [['Qts', 'Qts', '']], needs: ['Qms'], solve: qesFromQtsQms,
    },
    {
      id: 'BlMms', label: 'Bl and Mms', formula: 'Qes = 2πFs·Mms·Re / Bl²',
      inputs: [['Bl', 'Bl', 'T·m'], ['Mms', 'Mms', 'g']], needs: ['Fs', 'Re'], solve: qesFromBlMms,
    },
  ],
  Qms: [
    {
      id: 'QtsQes', label: 'Qts (with Qes)', formula: 'Qms = Qts·Qes / (Qes − Qts)',
      inputs: [['Qts', 'Qts', '']], needs: ['Qes'], solve: qmsFromQtsQes,
    },
    {
      id: 'RmsMms', label: 'Rms and Mms', formula: 'Qms = 2πFs·Mms / Rms',
      inputs: [['Rms', 'Rms', 'kg/s'], ['Mms', 'Mms', 'g']], needs: ['Fs'], solve: qmsFromRmsMms,
    },
  ],
  Vas: [
    {
      id: 'Cms', label: 'Cms (with Sd)', formula: 'Vas = ρc²·Sd²·Cms',
      inputs: [['Cms', 'Cms', 'mm/N']], needs: ['Sd'], solve: vasFromCms,
    },
    {
      id: 'Mms', label: 'Mms (with Fs and Sd)', formula: 'Cms = 1 / ((2πFs)²·Mms), Vas = ρc²·Sd²·Cms',
      inputs: [['Mms', 'Mms', 'g']], needs: ['Fs', 'Sd'], solve: vasFromMms,
    },
  ],
}

/**
 * The relations used to derive the rest of the set, shown beside the results.
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
}

/**
 * Derive the rest of the T/S set from the six core parameters.
 *
 * The canonical path: Vas gives compliance, compliance and Fs give moving
 * mass, and mass with Qes and Qms gives motor strength and mechanical
 * resistance.
 *
 * @param {object} m - The six core parameters.
 * @param {number} m.Fs - Free-air resonance, Hz.
 * @param {number} m.Vas - Equivalent compliance volume, litres.
 * @param {number} m.Qes - Electrical Q.
 * @param {number} m.Qms - Mechanical Q.
 * @param {number} m.Re - DC resistance, ohms.
 * @param {number} m.Sd - Effective cone area, cm².
 * @returns {{Fs: number, Vas: number, Qes: number, Qms: number, Qts: number, Re: number, Sd: number, Cms: number, Mms: number, Bl: number, Rms: number}} The complete T/S set in display units — the six inputs echoed back plus Cms mm/N, Mms g, Bl T·m and Rms kg/s.
 * @pre Every input is positive; a zero Qes or Qms divides by zero.
 * @pure
 */
function solveDatasheet({ Fs, Vas, Qes, Qms, Re, Sd }) {
  const Cms = compliance(Vas, Sd)
  const ws = TAU * Fs
  const Mms = 1 / (ws * ws * Cms) // kg
  const Bl = Math.sqrt((ws * Mms * Re) / Qes)
  const Rms = (ws * Mms) / Qms
  const Qts = (Qes * Qms) / (Qes + Qms)
  return { Fs, Vas, Qes, Qms, Qts, Re, Sd, Cms: Cms * 1e3, Mms: Mms * 1e3, Bl, Rms }
}

/**
 * Look up one substitution by parameter and id.
 *
 * @param {string} key - Core parameter name.
 * @param {string} id - Substitution id.
 * @returns {object} The substitution, falling back to the parameter's first.
 * @pure
 */
function altFor(key, id) {
  return ALTS[key].find((x) => x.id === id) || ALTS[key][0]
}

/**
 * Resolve the six core parameters, then derive the full T/S set.
 *
 * Anything named in `missing` comes from a substitution instead of from its
 * own field. Because a substitution can itself depend on other core figures,
 * they are resolved by repeated passes rather than in a fixed order: each
 * pass takes whatever has all its dependencies satisfied, until either
 * everything is known or a pass achieves nothing — which means what is left
 * depends on itself.
 *
 * @param {object} values - Every form field, core and substitute alike.
 * @param {object} missing - Map of core parameter to the substitution id chosen for it. Absent keys are taken from their own field.
 * @returns {{result: object, via: object, estimated: boolean}} The full T/S set, a map of core parameter to the relation that produced it (or `'given'`), and whether any estimate was involved.
 * @throws {Error} When a figure is missing or not positive, when a substitution's own precondition fails, or when the chosen substitutions depend on each other in a circle.
 * @pure
 */
export function solveTS(values, missing) {
  const core = {}
  const via = {}
  let estimated = false

  const pending = []
  for (const { key, label } of CORE) {
    if (missing[key]) { pending.push(key); continue }
    const v = values[key]
    if (!isFinite(v) || v <= 0) throw new Error(`${label} must be a positive number.`)
    core[key] = v
    via[key] = 'given'
  }

  while (pending.length) {
    const before = pending.length
    for (let i = pending.length - 1; i >= 0; i--) {
      const key = pending[i]
      const alt = altFor(key, missing[key])
      if (!alt.needs.every((n) => n in core)) continue
      for (const [name, label, unit] of alt.inputs) {
        const v = values[`${key}_${name}`]
        if (!isFinite(v) || v <= 0) {
          throw new Error(`${label}${unit ? ` (${unit})` : ''}, standing in for ${key}, must be a positive number.`)
        }
      }
      const a = Object.fromEntries(alt.inputs.map(([name]) => [name, values[`${key}_${name}`]]))
      const v = alt.solve(a, core)
      if (!isFinite(v) || v <= 0) throw new Error(`${key} worked out to ${v} — check the figures standing in for it.`)
      core[key] = v
      via[key] = alt.formula
      if (alt.estimate) estimated = true
      pending.splice(i, 1)
    }
    if (pending.length === before) {
      throw new Error(
        `${pending.join(' and ')} can only be worked out from each other. `
        + 'At least one of them has to come off the datasheet, or from a route that does not need the others.',
      )
    }
  }

  return { result: solveDatasheet(core), via, estimated }
}

/**
 * React Hook Form options coercing an input's value to a number.
 */
const num = { valueAsNumber: true }

/**
 * One labelled numeric input row.
 *
 * @param {object} props - Component props.
 * @param {string} props.name - Form field name.
 * @param {string} props.label - Display label.
 * @param {string} props.unit - Unit shown after the input.
 * @param {Function} props.register - The form's `register`.
 * @param {React.ReactNode} [props.children] - Trailing control, such as the missing-parameter checkbox.
 * @returns {React.ReactElement} The input row.
 * @pure
 */
function Field({ name, label, unit, register, children }) {
  return (
    <div className="param-row">
      <label>{label}</label>
      <input type="number" step="any" {...register(name, num)} />
      <span className="unit">{unit}</span>
      {children}
    </div>
  )
}

/**
 * The Thiele/Small solver: derive a full parameter set from datasheet figures.
 *
 * Six parameters are wanted — Fs, Re, Sd, Qes, Qms and Vas — and datasheets
 * routinely print five of them. Each row can therefore be marked as missing,
 * which swaps its field for whichever published figures it can be recovered
 * from instead.
 *
 * @returns {React.ReactElement|null} The modal, or `null` when hidden.
 * @sideEffect Subscribes to the store.
 */
export default function TSCalc() {
  const show = useStore((s) => s.showTSCalc)
  const setShow = useStore((s) => s.setShowTSCalc)
  const node = useStore((s) => s.nodes.find((n) => n.id === s.selectedNodeId))
  const updateParams = useStore((s) => s.updateParams)
  const [missing, setMissing] = useState({})
  const [solved, setSolved] = useState(null)
  const [error, setError] = useState(null)
  const { register, handleSubmit } = useForm({
    defaultValues: {
      Fs: 30, Re: 3.6, Sd: 480, Qes: 0.5, Qms: 5, Vas: 60,
      Fs_Mms: 85, Fs_Cms: 0.33,
      Re_Zmax: 40, Re_Znom: 4,
      Sd_Dia: 24.7, Sd_Cms: 0.33,
      Qes_Qts: 0.45, Qes_Bl: 12, Qes_Mms: 85,
      Qms_Qts: 0.45, Qms_Rms: 3.2, Qms_Mms: 85,
      Vas_Cms: 0.33, Vas_Mms: 85,
    },
  })

  const dismiss = useBackdropDismiss(() => setShow(false))
  if (!show) return null

  /**
   * Mark a parameter as present or missing from the datasheet.
   *
   * @param {string} key - Core parameter name.
   * @param {boolean} on - Whether it is missing.
   * @returns {void}
   * @sideEffect Updates component state and drops any previous result.
   */
  const setMissingFlag = (key, on) => {
    setMissing((m) => {
      const next = { ...m }
      if (on) next[key] = ALTS[key][0].id
      else delete next[key]
      return next
    })
    setSolved(null)
    setError(null)
  }

  /**
   * Choose which relation a missing parameter is recovered through.
   *
   * @param {string} key - Core parameter name.
   * @param {string} id - Substitution id.
   * @returns {void}
   * @sideEffect Updates component state and drops any previous result.
   */
  const setAlt = (key, id) => {
    setMissing((m) => ({ ...m, [key]: id }))
    setSolved(null)
    setError(null)
  }

  const onSolve = handleSubmit((v) => {
    setError(null)
    try {
      setSolved(solveTS(v, missing))
    } catch (e) {
      setSolved(null)
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
    if (!solved) return
    if (!node || node.type !== 'driver') { alert('Select a Driver node first.'); return }
    const patch = {}
    for (const k of ['Fs', 'Vas', 'Qes', 'Qms', 'Qts', 'Re', 'Sd', 'Cms', 'Mms', 'Bl', 'Rms']) {
      const v = solved.result[k]
      if (v != null && isFinite(v)) patch[k] = Math.round(v * 1000) / 1000
    }
    updateParams(node.id, patch)
    setShow(false)
  }

  /**
   * One core parameter's row: its own field, or the substitute that replaces it.
   *
   * @param {object} p - The core parameter descriptor.
   * @param {string} p.key - Parameter name.
   * @param {string} p.label - Display label.
   * @param {string} p.unit - Unit.
   * @returns {React.ReactElement} The row, or the substitution block when the parameter is missing.
   * @reads component state.
   */
  const renderRow = ({ key, label, unit }) => {
    const check = (
      <label className="ts-missing" title={`Tick if ${key} is not on the datasheet`}>
        <input
          type="checkbox" checked={!!missing[key]}
          onChange={(e) => setMissingFlag(key, e.target.checked)}
        />
        missing
      </label>
    )
    if (!missing[key]) {
      return <Field key={key} name={key} label={label} unit={unit} register={register}>{check}</Field>
    }
    const alt = altFor(key, missing[key])
    return (
      <div className="ts-sub" key={key}>
        <div className="param-row">
          <label>{label}</label>
          <select value={alt.id} onChange={(e) => setAlt(key, e.target.value)}>
            {ALTS[key].map((o) => <option key={o.id} value={o.id}>from {o.label}</option>)}
          </select>
          <span className="unit" />
          {check}
        </div>
        {alt.inputs.map(([name, lab, u]) => (
          <Field key={name} name={`${key}_${name}`} label={lab} unit={u} register={register}>
            <span className="ts-spacer" />
          </Field>
        ))}
        <div className="ts-formula">{alt.formula}</div>
      </div>
    )
  }

  const rows = solved && [
    ['Mms', 'g', FORMULAS.Mms], ['Cms', 'mm/N', FORMULAS.Cms], ['Bl', 'T·m', FORMULAS.Bl],
    ['Rms', 'kg/s', FORMULAS.Rms], ['Qts', '', FORMULAS.Qts],
  ].filter(([k]) => isFinite(solved.result[k]))

  return (
    <div className="modal-backdrop" {...dismiss}>
      <div className="modal">
        <h3>T/S Parameter Solver</h3>
        <p className="ts-lead">
          Enter what the datasheet gives you. Tick <em>missing</em> on anything it
          leaves out and pick a published figure to recover it from instead.
        </p>
        {CORE.map(renderRow)}
        <button className="primary" onClick={onSolve} style={{ marginTop: 8 }}>Solve</button>
        {error && <div className="ts-error">{error}</div>}
        {solved && (
          <>
            {solved.estimated && (
              <div className="ts-note">
                One figure is an estimate rather than a derivation — treat the
                result as a starting point and check it against a measurement.
              </div>
            )}
            <table style={{ marginTop: 10 }}>
              <tbody>
                <tr className="ts-head"><td colSpan={3}>Parameters</td></tr>
                {CORE.map(({ key, unit }) => (
                  <tr key={key} title={solved.via[key]}>
                    <td>{key}</td>
                    <td><b>{solved.result[key].toFixed(3)}</b> {unit}</td>
                    <td className="ts-src">
                      {solved.via[key] === 'given' ? 'given' : solved.via[key]}
                    </td>
                  </tr>
                ))}
                {rows.length > 0 && <tr className="ts-head"><td colSpan={3}>Derived</td></tr>}
                {rows.map(([k, unit, formula]) => (
                  <tr key={k} className="ts-derived" title={formula}>
                    <td>{k}</td>
                    <td><b>{solved.result[k].toFixed(3)}</b> {unit}</td>
                    <td className="ts-src">{formula}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
        <div className="close-row">
          <button onClick={() => setShow(false)}>Close</button>
          <button className="primary" disabled={!solved} onClick={applyToNode}>Apply to driver</button>
        </div>
      </div>
    </div>
  )
}

// Module-private functions, exposed for the contract test suite only
// (test/contract/*). Not part of this module's public API — application code
// must not import from here, and nothing outside the tests does.
export const __internals = { solveDatasheet, altFor, compliance, equivalentVolume }
