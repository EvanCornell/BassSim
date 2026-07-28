// Application menu bar — the Eclipse/Windows pattern: a thin strip of menu
// titles, each opening a dropdown of commands.
//
// Behaviour matches native menu bars: click a title to open, then *hover* any
// other title to switch to it without clicking again; Escape or a click
// anywhere else closes. Items carry shortcut hints, check marks and submenus.
import React, { useEffect, useRef, useState } from 'react'
import { useStore, SCHEMA_VERSION } from '../store'
import { isOpen } from '../layout'
import { PANEL_META, PANEL_IDS, MAIN_IDS, CHART_IDS } from '../panelMeta'
import { exportCSV, exportSchematicPNG, exportMetricsTxt } from '../utils/export'

const MOD = navigator.platform.toLowerCase().includes('mac') ? '⌘' : 'Ctrl'

// ---------- dropdown primitives ----------

function Item({ label, hint, onClick, disabled, checked, danger, submenu }) {
  const [openSub, setOpenSub] = useState(false)
  if (label === '-') return <div className="menu-sep" />
  return (
    <div
      className={`menu-item ${disabled ? 'disabled' : ''} ${danger ? 'danger' : ''}`}
      onMouseEnter={() => setOpenSub(true)}
      onMouseLeave={() => setOpenSub(false)}
      onClick={(e) => {
        if (disabled || submenu) { e.stopPropagation(); return }
        onClick?.()
      }}
    >
      <span className="mi-check">{checked ? '✓' : ''}</span>
      <span className="mi-label">{label}</span>
      {submenu
        ? <span className="mi-hint">▸</span>
        : <span className="mi-hint">{hint || ''}</span>}
      {submenu && openSub && (
        <div className="menu-dropdown submenu">
          {submenu.map((it, i) => <Item key={it.label === '-' ? `s${i}` : it.label} {...it} />)}
        </div>
      )}
    </div>
  )
}

function Menu({ title, items, open, onOpen, onHover }) {
  return (
    <div className="menu-root">
      <button
        className={`menu-title ${open ? 'open' : ''}`}
        onClick={(e) => { e.stopPropagation(); onOpen() }}
        onMouseEnter={onHover}
      >{title}</button>
      {open && (
        <div className="menu-dropdown">
          {items.map((it, i) => <Item key={it.label === '-' ? `s${i}` : it.label} {...it} />)}
        </div>
      )}
    </div>
  )
}

// ---------- the bar ----------

export default function MenuBar() {
  const store = useStore()
  const [open, setOpen] = useState(null)
  const [showExpWarning, setShowExpWarning] = useState(false)
  const fileRef = useRef(null)
  const barRef = useRef(null)
  const { settings, updateSettings, layout, layoutOps, layoutPresets, snapshots, poppedOut } = store

  // A popped-out panel is neither open in the dock nor closed — say so, and
  // let the menu item bring its tab back to the front.
  const panelItem = (id) => ({
    label: PANEL_META[id].title,
    checked: isOpen(layout, id) || poppedOut.includes(id),
    hint: poppedOut.includes(id) ? 'in a tab' : '',
    disabled: PANEL_META[id].closable === false
      || (PANEL_META[id].requires && !settings[PANEL_META[id].requires]),
    onClick: () => (poppedOut.includes(id) ? store.popOutPanel(id) : layoutOps.toggle(id)),
  })

  // click-away and Escape close the open menu
  useEffect(() => {
    if (!open) return
    const away = (e) => { if (!barRef.current?.contains(e.target)) setOpen(null) }
    const esc = (e) => { if (e.key === 'Escape') setOpen(null) }
    window.addEventListener('mousedown', away)
    window.addEventListener('keydown', esc)
    return () => { window.removeEventListener('mousedown', away); window.removeEventListener('keydown', esc) }
  }, [open])

  const onLoadFile = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const proj = JSON.parse(reader.result)
        if (proj.schemaVersion !== SCHEMA_VERSION) {
          if (!confirm(`This file uses schema v${proj.schemaVersion ?? '?'} but the app expects v${SCHEMA_VERSION}. Attempt to load anyway?`)) return
        }
        store.loadSerialized(proj)
      } catch {
        alert('Could not parse that file as an AcouSim project.')
      }
    }
    reader.readAsText(file)
    e.target.value = ''
  }

  const savePreset = () => {
    const name = prompt('Save the current window arrangement as:', `Layout ${layoutPresets.length + 1}`)
    if (name?.trim()) store.saveLayoutPreset(name.trim())
  }

  const nlLocked = !settings.nlEnabled

  const MENUS = [
    ['File', [
      { label: 'New Project', hint: `${MOD}+N`, onClick: store.newProject },
      { label: 'Open Project…', onClick: () => store.setShowProjectManager(true) },
      { label: '-' },
      { label: 'Save Project As JSON…', hint: `${MOD}+S`, onClick: store.saveProjectJSON },
      { label: 'Import Project JSON…', onClick: () => fileRef.current?.click() },
      { label: '-' },
      {
        label: 'Export',
        submenu: [
          { label: 'Response data (CSV)', onClick: () => exportCSV(store.results, store.nodes, store.projectName) },
          { label: 'Schematic (PNG)', onClick: () => exportSchematicPNG(store.projectName) },
          { label: 'Metrics summary (TXT)', onClick: () => exportMetricsTxt(store.metrics, settings, store.projectName) },
        ],
      },
    ]],

    ['Edit', [
      { label: 'Undo', hint: `${MOD}+Z`, disabled: !store.history.length, onClick: store.undo },
      { label: 'Redo', hint: `${MOD}+Y`, disabled: !store.future.length, onClick: store.redo },
      { label: '-' },
      { label: 'Duplicate Selection', hint: `${MOD}+D`, onClick: store.duplicateSelected },
      { label: 'Select All Nodes', hint: `${MOD}+A`, onClick: store.selectAll },
      { label: 'Delete Selection', hint: 'Del', danger: true, onClick: store.deleteSelected },
    ]],

    ['View', [
      ...MAIN_IDS.map(panelItem),
      { label: '-' },
      { label: 'Charts', submenu: CHART_IDS.map(panelItem) },
      { label: '-' },
      {
        label: 'Open Focused Panel in New Tab',
        hint: 'or the ⧉ button',
        onClick: () => store.popOutPanel(store.focusedPanel),
      },
      {
        label: 'Open in New Tab',
        submenu: PANEL_IDS
          .filter((id) => !PANEL_META[id].requires || settings[PANEL_META[id].requires])
          .map((id) => ({
            label: PANEL_META[id].title,
            checked: poppedOut.includes(id),
            onClick: () => store.popOutPanel(id),
          })),
      },
      { label: '-' },
      {
        label: store.maximized ? 'Restore Panel Sizes' : 'Maximize Focused Panel',
        hint: 'dbl-click tab',
        onClick: () => store.toggleMaximize(store.maximized ? store.maximized : store.focusedPanel),
      },
      { label: '-' },
      { label: 'Reset Layout', onClick: () => layoutOps.reset() },
      { label: 'Save Layout As…', onClick: savePreset },
      {
        label: 'Apply Saved Layout',
        disabled: !layoutPresets.length,
        submenu: layoutPresets.length
          ? layoutPresets.map((p) => ({ label: p.name, onClick: () => store.applyLayoutPreset(p.name) }))
          : [{ label: '(none saved)', disabled: true }],
      },
      {
        label: 'Delete Saved Layout',
        disabled: !layoutPresets.length,
        submenu: layoutPresets.length
          ? layoutPresets.map((p) => ({ label: p.name, danger: true, onClick: () => store.deleteLayoutPreset(p.name) }))
          : [{ label: '(none saved)', disabled: true }],
      },
    ]],

    ['Simulate', [
      {
        label: 'Mask chamber resonances',
        checked: settings.masking,
        onClick: () => updateSettings({ masking: !settings.masking }),
      },
      {
        label: 'Unwrap phase',
        checked: settings.unwrapPhase,
        onClick: () => updateSettings({ unwrapPhase: !settings.unwrapPhase }),
      },
      { label: '-' },
      {
        label: 'Take Snapshot',
        hint: 'max 3',
        disabled: snapshots.length >= 3 || !store.results?.ok,
        onClick: store.takeSnapshot,
      },
      {
        label: 'Clear All Snapshots',
        disabled: !snapshots.length,
        onClick: () => snapshots.forEach((s) => store.removeSnapshot(s.id)),
      },
      { label: '-' },
      { label: 'Recompute Now', onClick: () => { useStore.setState({ _lastSig: '' }); store.scheduleCompute() } },
    ]],

    ['Tools', [
      { label: 'Driver Database…', onClick: () => store.setShowDriverDB(true) },
      { label: 'T/S Parameter Solver…', onClick: () => store.setShowTSCalc(true) },
      { label: '-' },
      {
        label: 'Nonlinear Lab',
        disabled: nlLocked,
        hint: nlLocked ? 'experimental' : '',
        onClick: () => layoutOps.open('nllab'),
      },
      {
        label: 'Experimental features',
        checked: !!settings.nlEnabled,
        onClick: () => {
          if (settings.nlEnabled) {
            updateSettings({ nlEnabled: false })
            layoutOps.close('nllab')
          } else setShowExpWarning(true)
        },
      },
    ]],

    ['Help', [
      {
        label: 'Keyboard Shortcuts',
        onClick: () => alert(
          `Node Editor\n`
          + `  ${MOD}+Z / ${MOD}+Y   undo / redo\n`
          + `  ${MOD}+D            duplicate selection\n`
          + `  ${MOD}+A            select all nodes\n`
          + `  Delete            delete selection\n\n`
          + `Project\n  ${MOD}+N new    ${MOD}+S save JSON\n\n`
          + `Workspace\n  drag a panel tab to re-dock it\n  double-click a tab to maximize\n  Escape closes an open menu`,
        ),
      },
      {
        label: 'About AcouSim',
        onClick: () => alert(
          'AcouSim — node-based acoustic circuit simulator.\n\n'
          + 'A 1-D electro-acoustic analogous circuit solved by the transfer-matrix\n'
          + '(ABCD) method in [pressure; volume velocity] state.\n\n'
          + 'View ▸ Reset Layout restores the default workspace.',
        ),
      },
    ]],
  ]

  return (
    <div className="menubar" ref={barRef} onClick={() => setOpen(null)}>
      <span className="logo">Acou<span>Sim</span></span>
      {MENUS.map(([title, items]) => (
        <Menu
          key={title}
          title={title}
          items={items}
          open={open === title}
          onOpen={() => setOpen(open === title ? null : title)}
          onHover={() => { if (open) setOpen(title) }}
        />
      ))}
      {/* Settings is a section of its own rather than an item buried in a
          menu: one click opens the window, no dropdown in between. */}
      <button
        className="menu-title"
        onClick={(e) => { e.stopPropagation(); setOpen(null); store.setShowSettings(true) }}
        onMouseEnter={() => { if (open) setOpen(null) }}
      >Settings</button>
      <input ref={fileRef} type="file" accept=".json,application/json" style={{ display: 'none' }} onChange={onLoadFile} />

      {showExpWarning && (
        <div className="modal-backdrop" onClick={() => setShowExpWarning(false)}>
          <div className="modal" style={{ maxWidth: 480, minWidth: 380 }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ color: 'var(--amber)' }}>Experimental features</h3>
            <p style={{ fontSize: 13, lineHeight: 1.55 }}>
              You are enabling <b>large-signal T/S nonlinearity</b> simulation.
            </p>
            <p style={{ fontSize: 12.5, lineHeight: 1.55, color: 'var(--text-2)' }}>
              This feature is experimental. Its accuracy depends entirely on the accuracy
              of the Bl(x), Cms(x) and Le(x) curves you provide — without measured data,
              results are plausible-looking guesses. The solver models power compression
              and resonance drift only; it does not produce harmonic distortion. It may
              interact unexpectedly with complex circuits.
            </p>
            <p style={{ fontSize: 12.5, color: 'var(--text-2)' }}>
              A flat curve at 1.0 reproduces the standard engine exactly.
            </p>
            <div className="close-row">
              <button onClick={() => setShowExpWarning(false)}>Cancel</button>
              <button className="primary" onClick={() => {
                updateSettings({ nlEnabled: true })
                setShowExpWarning(false)
                layoutOps.open('nllab')
              }}>I understand — continue</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
