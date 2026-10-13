import React from 'react'
import NumInput from './NumInput'

/**
 * A figure for a drive field: three decimals at most, nothing when it is not finite.
 *
 * @param {number} v - The value.
 * @returns {number|null} The rounded value, or `null` to leave the box empty.
 * @pure
 */
const tidy = (v) => (Number.isFinite(v) ? Math.round(v * 1000) / 1000 : null)

/**
 * One channel's voltage, impedance, power and Rg, the first three linked by P = V²/Z.
 *
 * The same rows in the Parameters panel's Amplifier section, for the toolbar
 * channel, and on every channel in the Wiring window. Whichever of the three
 * is typed stays as typed and the others follow. An emptied impedance goes
 * back to following the wiring, and shows the figure it follows.
 *
 * @param {object} props - Component props.
 * @param {{volts: number, ohms: number, auto: boolean, watts: number}} props.drive - The channel's drive, from `channelDrive`.
 * @param {Function} props.onSet - `(field, value)` for `voltage`, `impedance` or `power`.
 * @param {number|string} props.rg - The channel's Rg.
 * @param {Function} props.onRg - Called with a new Rg.
 * @returns {React.ReactElement} The rows.
 * @pure
 */
export default function DriveFields({ drive, onSet, rg, onRg }) {
  const linked = 'Voltage, impedance and power are linked by P = V²/Z — edit any one.'
  return (
    <div className="param-grid">
      <div className="param-row">
        <label title={linked}>Voltage</label>
        <NumInput min="0" step="0.01" value={tidy(drive.volts)} onCommit={(v) => onSet('voltage', v)} />
        <span className="unit">V</span>
      </div>
      <div className="param-row">
        <label title={`${linked} Leave it empty to follow the nominal load the wiring presents.`}>Impedance</label>
        <NumInput above="0" allowEmpty value={drive.auto ? null : tidy(drive.ohms)}
          placeholder={drive.auto ? (Number.isFinite(drive.ohms) ? `${tidy(drive.ohms)} auto` : 'open') : undefined}
          onCommit={(v) => onSet('impedance', v)} />
        <span className="unit">Ω</span>
      </div>
      <div className="param-row">
        <label title={linked}>Power</label>
        <NumInput min="0" value={tidy(drive.watts)} disabled={!Number.isFinite(drive.ohms)} onCommit={(v) => onSet('power', v)} />
        <span className="unit">W</span>
      </div>
      <div className="param-row">
        <label title="Amplifier output resistance plus cable, in series with the load.">Rg</label>
        <NumInput step="0.01" min="0" value={tidy(Number(rg) || 0)} onCommit={onRg} />
        <span className="unit">Ω</span>
      </div>
    </div>
  )
}
