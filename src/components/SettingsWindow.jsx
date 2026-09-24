import React, { useEffect, useState } from 'react'
import { useStore } from '../store'
import { TOOLBAR_ITEMS, TOOLBAR_GROUPS, ALL_ITEM_IDS } from '../toolbarItems'
import { COMMANDS, COMMAND_GROUPS, DEFAULT_BINDINGS, comboFromEvent, formatCombo } from '../keymap'

// ---------- shared bits ----------

const card = {
  background: 'var(--surface)', border: '1px solid var(--border)',
  borderRadius: 0, padding: 14, marginBottom: 12, maxWidth: 560,
}
const h = { margin: '0 0 10px', fontSize: 13, fontWeight: 600 }
const inputStyle = {
  width: '100%', boxSizing: 'border-box', padding: '5px 8px', marginBottom: 8,
  background: 'var(--bg)', color: 'var(--text)',
  border: '1px solid var(--border)', borderRadius: 2, fontSize: 13,
}
const btn = {
  padding: '5px 12px', borderRadius: 2, border: '1px solid var(--border)',
  background: 'var(--surface-2)', color: 'var(--text)', cursor: 'pointer', fontSize: 12,
}
const okStyle = { color: 'var(--green)', fontSize: 12, margin: '4px 0 8px' }
const dim = { color: 'var(--text-3)', fontSize: 12, lineHeight: 1.5 }

// ---------- application settings ----------

/**
 * The Application section: engine, sweep range and display options.
 *
 * @returns {React.ReactElement} The section.
 * @sideEffect Subscribes to the store.
 */
function ApplicationSection() {
  const settings = useStore((s) => s.settings)
  const updateSettings = useStore((s) => s.updateSettings)
  const engine = useStore((s) => s.engine)
  const setEngine = useStore((s) => s.setEngine)
  const row = { display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, marginBottom: 8 }
  return (
    <>
      <div style={card}>
        <h4 style={h}>Simulation</h4>
        <label style={row}>
          Engine
          <select style={{ ...inputStyle, width: 'auto', marginBottom: 0 }} value={engine}
            onChange={(e) => setEngine(e.target.value)}>
            <option value="spice">SPICE (ngspice)</option>
            <option value="legacy">Legacy solver</option>
          </select>
        </label>
        <div style={{ ...dim, marginTop: -2, marginBottom: 10 }}>
          The SPICE engine solves the box as a circuit, so any wiring of chambers,
          ducts and drivers is handled exactly. The legacy solver is kept for
          comparison during the transition; it cannot solve paths that split and
          rejoin, taps, or anything beyond one amplifier channel.
        </div>
        <label style={row}>
          Frequency sweep
          <input
            type="number" min="1" style={{ ...inputStyle, width: 80, marginBottom: 0 }}
            value={settings.fmin}
            onChange={(e) => { const v = parseFloat(e.target.value); if (v > 0) updateSettings({ fmin: v }) }}
          />
          to
          <input
            type="number" style={{ ...inputStyle, width: 80, marginBottom: 0 }}
            value={settings.fmax}
            onChange={(e) => { const v = parseFloat(e.target.value); if (v > settings.fmin) updateSettings({ fmax: v }) }}
          /> Hz
        </label>
        <label style={{ ...row, cursor: 'pointer', marginBottom: 0 }}>
          <input type="checkbox" checked={!!settings.masking}
            onChange={(e) => updateSettings({ masking: e.target.checked })} />
          Mask chamber resonances
        </label>
        <div style={{ ...dim, marginTop: 6 }}>
          Masking switches chambers to lumped compliances, hiding the standing-wave
          peaks at n·c/2L so the underlying alignment is easier to read.
        </div>
      </div>
      <div style={card}>
        <h4 style={h}>Charts</h4>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, marginBottom: 8 }}>
          Port velocity warning threshold
          <input
            type="number" style={{ ...inputStyle, width: 80, marginBottom: 0 }}
            value={settings.vThreshold}
            onChange={(e) => { const v = parseFloat(e.target.value); if (v > 0) updateSettings({ vThreshold: v }) }}
          /> m/s
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
          <input type="checkbox" checked={!!settings.unwrapPhase}
            onChange={(e) => updateSettings({ unwrapPhase: e.target.checked })} />
          Unwrap phase in the Phase &amp; Group Delay chart
        </label>
      </div>
    </>
  )
}

// ---------- quick bar layout ----------

/**
 * The Quick bar section: choose and reorder the items in the quick bar.
 *
 * @returns {React.ReactElement} The section.
 * @sideEffect Subscribes to the store.
 */
function QuickBarSection() {
  const toolbar = useStore((s) => s.toolbar)
  const toggleToolbarItem = useStore((s) => s.toggleToolbarItem)
  const moveToolbarItem = useStore((s) => s.moveToolbarItem)
  const resetToolbar = useStore((s) => s.resetToolbar)

  const rowStyle = {
    display: 'flex', alignItems: 'center', gap: 8, padding: '5px 6px',
    borderRadius: 0, fontSize: 13,
  }

  return (
    <>
      <div style={card}>
        <h4 style={h}>Quick bar contents</h4>
        <div style={{ ...dim, marginBottom: 12 }}>
          Choose what appears in the strip under the menu bar and in what order.
          Shown items are listed first, in bar order — use ▲ ▼ to rearrange them.
        </div>

        {TOOLBAR_GROUPS.map(([group, groupLabel]) => {
          const shown = toolbar.filter((id) => TOOLBAR_ITEMS[id].group === group)
          const hidden = ALL_ITEM_IDS.filter((id) => TOOLBAR_ITEMS[id].group === group && !toolbar.includes(id))
          return (
            <div key={group} style={{ marginBottom: 14 }}>
              <div style={{ ...dim, textTransform: 'uppercase', letterSpacing: '0.06em', fontSize: 10.5, marginBottom: 4 }}>
                {groupLabel}
              </div>
              {shown.map((id) => (
                <div key={id} style={rowStyle}>
                  <input type="checkbox" checked onChange={() => toggleToolbarItem(id)} />
                  <span style={{ flex: 1 }}>{TOOLBAR_ITEMS[id].label}</span>
                  <button style={{ ...btn, padding: '2px 7px' }} title="Move earlier"
                    disabled={toolbar.indexOf(id) === 0}
                    onClick={() => moveToolbarItem(id, -1)}>▲</button>
                  <button style={{ ...btn, padding: '2px 7px' }} title="Move later"
                    disabled={toolbar.indexOf(id) === toolbar.length - 1}
                    onClick={() => moveToolbarItem(id, 1)}>▼</button>
                </div>
              ))}
              {hidden.map((id) => (
                <div key={id} style={{ ...rowStyle, color: 'var(--text-3, #8b949e)' }}>
                  <input type="checkbox" checked={false} onChange={() => toggleToolbarItem(id)} />
                  <span style={{ flex: 1 }}>{TOOLBAR_ITEMS[id].label}</span>
                </div>
              ))}
            </div>
          )
        })}

        <button style={btn} onClick={resetToolbar}>Restore defaults</button>
      </div>
    </>
  )
}

// ---------- keyboard ----------

/**
 * One shortcut chip: click to re-record it, or use its ✕ to drop it.
 *
 * @param {object} props - Component props.
 * @param {string} props.combo - The combo to display.
 * @param {Function} props.onRemove - Called when the ✕ is clicked.
 * @param {Function} props.onClick - Called when the chip itself is clicked.
 * @returns {React.ReactElement} The chip.
 * @pure
 */
function ComboChip({ combo, onRemove, onClick }) {
  return (
    <span className="key-chip" onClick={onClick} title="Click to replace this shortcut">
      <kbd>{formatCombo(combo)}</kbd>
      <span className="kc-x" title="Remove this shortcut"
        onClick={(e) => { e.stopPropagation(); onRemove() }}>✕</span>
    </span>
  )
}

/**
 * The Keyboard section: view and rebind every command's shortcuts.
 *
 * While recording, a capture-phase listener swallows every key, so the
 * shortcut being captured cannot also fire the command it is bound to —
 * without that, recording Ctrl+N over "New project" would start a new
 * project. Escape cancels.
 *
 * Assigning a combo already in use takes it from the other command and says
 * so, rather than silently leaving two commands on one key.
 *
 * @returns {React.ReactElement} The section.
 * @sideEffect Subscribes to the store. Registers a capture-phase window keydown listener while recording.
 */
function KeyboardSection() {
  const bindings = useStore((s) => s.bindings)
  const assignBinding = useStore((s) => s.assignBinding)
  const removeBinding = useStore((s) => s.removeBinding)
  const resetBindings = useStore((s) => s.resetBindings)
  const [recording, setRecording] = useState(null)   // { id, replacing }
  const [note, setNote] = useState(null)

  useEffect(() => {
    if (!recording) return
    /**
     * Capture the next keypress as the shortcut being recorded.
     *
     * @param {KeyboardEvent} e - The keydown event.
     * @returns {void}
     * @sideEffect Swallows the key, then writes and persists the new binding. Escape cancels without changing anything.
     */
    const onKey = (e) => {
      e.preventDefault()
      e.stopPropagation()
      if (e.key === 'Escape') { setRecording(null); return }
      const combo = comboFromEvent(e)
      if (!combo) return
      if (recording.replacing) removeBinding(recording.id, recording.replacing)
      const stolen = assignBinding(recording.id, combo)
      setNote(stolen
        ? `${formatCombo(combo)} was taken from “${COMMANDS[stolen].label}”.`
        : null)
      setRecording(null)
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [recording, assignBinding, removeBinding])

  /**
   * Whether a command still carries exactly its default bindings.
   *
   * @param {string} id - Command id.
   * @returns {boolean} True when the bindings match the defaults in both content and order.
   * @reads the current bindings from the store.
   */
  const isDefault = (id) => {
    const def = DEFAULT_BINDINGS[id] || []
    const cur = bindings[id] || []
    return cur.length === def.length && cur.every((c, i) => c === def[i])
  }

  return (
    <>
      <div style={{ ...card, maxWidth: 640 }}>
        <h4 style={h}>Keyboard shortcuts</h4>
        <div style={{ ...dim, marginBottom: 4 }}>
          Click a shortcut to replace it, or <b>+</b> to add a second one to the
          same command. Assigning a combo that is already in use takes it from
          the other command. Escape cancels while recording.
        </div>
        <div style={{ ...dim, marginBottom: 12 }}>
          Shortcuts marked <i>editor</i> only fire while the Node Editor has
          focus, which is what lets bare letters place components without
          getting in the way of typing elsewhere.
        </div>
        {note && <div style={{ ...okStyle, marginBottom: 8 }}>{note}</div>}

        {COMMAND_GROUPS.map(([group, ids]) => (
          <div key={group} style={{ marginBottom: 14 }}>
            <div style={{ ...dim, textTransform: 'uppercase', letterSpacing: '0.06em', fontSize: 10.5, marginBottom: 4 }}>
              {group}
            </div>
            {ids.map((id) => (
              <div key={id} className="key-row">
                <span className="kr-label">
                  {COMMANDS[id].label}
                  {COMMANDS[id].scope === 'canvas' && <span className="kr-scope">editor</span>}
                </span>
                <span className="kr-combos">
                  {(bindings[id] || []).map((combo) => (
                    <ComboChip
                      key={combo}
                      combo={combo}
                      onRemove={() => removeBinding(id, combo)}
                      onClick={() => { setNote(null); setRecording({ id, replacing: combo }) }}
                    />
                  ))}
                  {recording?.id === id && <span className="key-chip recording"><kbd>press keys…</kbd></span>}
                  {!recording && (
                    <button className="kr-add" title="Add another shortcut"
                      onClick={() => { setNote(null); setRecording({ id, replacing: null }) }}>+</button>
                  )}
                  {!isDefault(id) && <span className="kr-changed" title="Changed from the default">•</span>}
                </span>
              </div>
            ))}
          </div>
        ))}

        <button style={btn} onClick={() => { setNote(null); resetBindings() }}>Restore defaults</button>
      </div>
    </>
  )
}

// ---------- floating settings window ----------
//
// Settings is not a workspace panel: it is a modal utility window that opens
// centred over whatever you were doing, can be dragged out of the way by its
// title bar, and closes on Escape or a backdrop click.

const SECTIONS = [
  ['keyboard', 'Keyboard', KeyboardSection],
  ['quickbar', 'Quick bar', QuickBarSection],
  ['app', 'Application', ApplicationSection],
]

/**
 * The settings window: a floating, draggable panel rather than a dock panel.
 *
 * Deliberately not a panel — settings are modal to the whole workspace, and
 * docking them would let the user tile settings beside the thing they are
 * configuring and lose track of which is which.
 *
 * Re-centres each time it opens, so a window dragged off to one side is not
 * lost the next time it is needed.
 *
 * @returns {React.ReactElement|null} The window, or `null` when hidden.
 * @sideEffect Subscribes to the store. Registers a window keydown listener for Escape while open.
 */
export default function SettingsWindow() {
  const show = useStore((s) => s.showSettings)
  const setShow = useStore((s) => s.setShowSettings)
  const section = useStore((s) => s.settingsSection)
  const setSection = useStore((s) => s.setSettingsSection)
  const [drag, setDrag] = useState({ x: 0, y: 0 })

  useEffect(() => {
    if (!show) return
    /**
     * Close the window on Escape.
     *
     * @param {KeyboardEvent} e - The keydown event.
     * @returns {void}
     * @sideEffect Closes the settings window.
     */
    const esc = (e) => { if (e.key === 'Escape') setShow(false) }
    window.addEventListener('keydown', esc)
    return () => window.removeEventListener('keydown', esc)
  }, [show, setShow])

  useEffect(() => { if (show) setDrag({ x: 0, y: 0 }) }, [show])

  /**
   * Begin dragging the window by its title bar.
   *
   * Clicks on the close button are ignored, so closing does not start a drag.
   *
   * @param {React.MouseEvent} e - The mousedown event.
   * @returns {void}
   * @sideEffect Registers window mousemove and mouseup listeners.
   */
  const onTitleDown = (e) => {
    if (e.target.closest('button')) return
    const x0 = e.clientX - drag.x
    const y0 = e.clientY - drag.y
    /**
     * Apply the in-progress window drag.
     *
     * @param {MouseEvent} ev - The mousemove event.
     * @returns {void}
     * @sideEffect Updates the window offset on every move.
     */
    const move = (ev) => setDrag({ x: ev.clientX - x0, y: ev.clientY - y0 })
    /**
     * End the window drag and remove its listeners.
     *
     * @returns {void}
     * @sideEffect Removes the window listeners.
     */
    const up = () => {
      window.removeEventListener('mousemove', move)
      window.removeEventListener('mouseup', up)
    }
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', up)
  }

  if (!show) return null
  const Active = SECTIONS.find(([k]) => k === section)?.[2] || KeyboardSection

  return (
    <div className="float-backdrop" onMouseDown={() => setShow(false)}>
      <div
        className="float-window"
        style={{ transform: `translate(${drag.x}px, ${drag.y}px)` }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="fw-title" onMouseDown={onTitleDown}>
          <span>Settings</span>
          <button className="fw-close" title="Close (Esc)" onClick={() => setShow(false)}>✕</button>
        </div>
        <div className="fw-body">
          <div className="fw-nav">
            {SECTIONS.map(([k, title]) => (
              <div key={k} className={`fw-nav-item ${section === k ? 'active' : ''}`}
                onClick={() => setSection(k)}>{title}</div>
            ))}
          </div>
          <div className="fw-content">
            <Active />
          </div>
        </div>
      </div>
    </div>
  )
}
