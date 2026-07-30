import React, { useEffect, useState } from 'react'
import { useStore } from '../store'
import { authClient, PROVIDER_LABELS } from '../auth'
import { TOOLBAR_ITEMS, TOOLBAR_GROUPS, ALL_ITEM_IDS } from '../toolbarItems'
import { COMMANDS, COMMAND_GROUPS, DEFAULT_BINDINGS, comboFromEvent, formatCombo } from '../keymap'

// ---------- shared bits ----------

const card = {
  background: 'var(--bg-2, #161b22)', border: '1px solid var(--border, #30363d)',
  borderRadius: 8, padding: 16, marginBottom: 14, maxWidth: 560,
}
const h = { margin: '0 0 10px', fontSize: 13.5, fontWeight: 600 }
const inputStyle = {
  width: '100%', boxSizing: 'border-box', padding: '7px 10px', marginBottom: 8,
  background: 'var(--bg-1, #0d1117)', color: 'var(--text-1, #e6edf3)',
  border: '1px solid var(--border, #30363d)', borderRadius: 6, fontSize: 13,
}
const btn = {
  padding: '7px 14px', borderRadius: 6, border: '1px solid var(--border, #30363d)',
  background: 'var(--bg-3, #21262d)', color: 'var(--text-1, #e6edf3)', cursor: 'pointer', fontSize: 12.5,
}
const btnPrimary = { ...btn, background: '#1f6feb', borderColor: '#1f6feb', color: '#fff' }
const btnDanger = { ...btn, color: '#ff8a80', borderColor: '#6e2228' }
const errStyle = { color: '#ff8a80', fontSize: 12, margin: '4px 0 8px' }
const okStyle = { color: '#7ee787', fontSize: 12, margin: '4px 0 8px' }
const dim = { color: 'var(--text-3, #8b949e)', fontSize: 12, lineHeight: 1.5 }

function useServerConfig() {
  const [cfg, setCfg] = useState({ providers: [], smtp: false })
  useEffect(() => {
    fetch('/api/config').then((r) => r.json()).then(setCfg).catch(() => {})
  }, [])
  return cfg
}

function SocialButtons({ providers, action, label }) {
  if (!providers.length) return null
  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 4 }}>
      {providers.map((p) => (
        <button key={p} style={btn} onClick={() => action(p)}>
          {label} {PROVIDER_LABELS[p] || p}
        </button>
      ))}
    </div>
  )
}

// ---------- signed-out: sign in / sign up / forgot ----------

function AuthForms() {
  const cfg = useServerConfig()
  const [mode, setMode] = useState('signin') // signin | signup | forgot
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [err, setErr] = useState(null)
  const [ok, setOk] = useState(null)
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    setErr(null); setOk(null); setBusy(true)
    try {
      if (mode === 'signin') {
        const { error } = await authClient.signIn.email({ email, password })
        if (error) throw new Error(error.message)
      } else if (mode === 'signup') {
        const { error } = await authClient.signUp.email({ email, password, name: name || email.split('@')[0] })
        if (error) throw new Error(error.message)
      } else {
        const { error } = await authClient.requestPasswordReset({ email, redirectTo: '/reset-password' })
        if (error) throw new Error(error.message)
        setOk(cfg.smtp
          ? 'If that email is registered, a reset link is on its way.'
          : 'Reset link generated. (No mail server configured — the link was printed to the server log.)')
      }
    } catch (e) { setErr(e.message || 'Something went wrong') }
    setBusy(false)
  }

  const social = (provider) => authClient.signIn.social({ provider, callbackURL: window.location.origin })

  return (
    <div style={card}>
      <h4 style={h}>
        {mode === 'signin' ? 'Sign in' : mode === 'signup' ? 'Create account' : 'Reset password'}
      </h4>
      {mode === 'signup' && (
        <input style={inputStyle} placeholder="Display name" value={name} onChange={(e) => setName(e.target.value)} />
      )}
      <input style={inputStyle} type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
      {mode !== 'forgot' && (
        <input
          style={inputStyle} type="password" value={password}
          placeholder={mode === 'signup' ? 'Password (8+ characters)' : 'Password'}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
        />
      )}
      {err && <div style={errStyle}>{err}</div>}
      {ok && <div style={okStyle}>{ok}</div>}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <button style={btnPrimary} disabled={busy} onClick={submit}>
          {busy ? '…' : mode === 'signin' ? 'Sign in' : mode === 'signup' ? 'Create account' : 'Send reset link'}
        </button>
        {mode === 'signin' && (
          <button style={{ ...btn, border: 'none', background: 'none', color: 'var(--text-3)' }}
            onClick={() => { setMode('forgot'); setErr(null) }}>Forgot password?</button>
        )}
      </div>
      {mode !== 'forgot' && cfg.providers.length > 0 && (
        <>
          <div style={{ ...dim, margin: '12px 0 4px' }}>or continue with</div>
          <SocialButtons providers={cfg.providers} action={social} label="" />
        </>
      )}
      {cfg.providers.length === 0 && mode !== 'forgot' && (
        <div style={{ ...dim, marginTop: 10 }}>
          Social sign-in (Google, Apple, Facebook, GitHub) appears here once the
          server has provider credentials configured — see .env.example.
        </div>
      )}
      <div style={{ ...dim, marginTop: 12 }}>
        {mode === 'signin'
          ? <>No account? <a style={{ cursor: 'pointer', color: '#58a6ff' }} onClick={() => { setMode('signup'); setErr(null) }}>Create one</a></>
          : <a style={{ cursor: 'pointer', color: '#58a6ff' }} onClick={() => { setMode('signin'); setErr(null) }}>← Back to sign in</a>}
      </div>
    </div>
  )
}

// ---------- signed-in: profile, password, linked logins, danger zone ----------

function LinkedAccounts({ providers }) {
  const [accounts, setAccounts] = useState(null)
  const [err, setErr] = useState(null)
  const refresh = () => authClient.listAccounts().then(({ data }) => setAccounts(data || [])).catch(() => setAccounts([]))
  useEffect(() => { refresh() }, [])

  if (!accounts) return <div style={dim}>Loading linked logins…</div>
  const linked = new Set(accounts.map((a) => a.providerId ?? a.provider))
  const linkable = providers.filter((p) => !linked.has(p))

  const unlink = async (a) => {
    setErr(null)
    const { error } = await authClient.unlinkAccount({
      providerId: a.providerId ?? a.provider, accountId: a.accountId ?? a.id,
    })
    if (error) setErr(error.message)
    refresh()
  }
  const link = (provider) => authClient.linkSocial({ provider, callbackURL: window.location.origin })

  return (
    <>
      {accounts.map((a) => {
        const pid = a.providerId ?? a.provider
        return (
          <div key={(a.accountId ?? a.id) + pid}
            style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid var(--border, #30363d)' }}>
            <span style={{ fontSize: 13 }}>{PROVIDER_LABELS[pid] || pid}</span>
            <button
              style={{ ...btnDanger, padding: '3px 10px', opacity: accounts.length <= 1 ? 0.4 : 1 }}
              disabled={accounts.length <= 1}
              title={accounts.length <= 1 ? 'Your only sign-in method cannot be removed' : 'Remove this sign-in method'}
              onClick={() => unlink(a)}>Unlink</button>
          </div>
        )
      })}
      {err && <div style={errStyle}>{err}</div>}
      {linkable.length > 0 && (
        <div style={{ marginTop: 10 }}>
          <SocialButtons providers={linkable} action={link} label="Link" />
        </div>
      )}
      {providers.length === 0 && (
        <div style={{ ...dim, marginTop: 8 }}>
          Additional login providers can be linked here once the server has
          OAuth credentials configured (.env.example).
        </div>
      )}
    </>
  )
}

function ChangePassword() {
  const [cur, setCur] = useState('')
  const [next, setNext] = useState('')
  const [msg, setMsg] = useState(null)
  const [err, setErr] = useState(null)
  const submit = async () => {
    setMsg(null); setErr(null)
    const { error } = await authClient.changePassword({ currentPassword: cur, newPassword: next, revokeOtherSessions: true })
    if (error) setErr(error.message)
    else { setMsg('Password changed. Other sessions were signed out.'); setCur(''); setNext('') }
  }
  return (
    <>
      <input style={inputStyle} type="password" placeholder="Current password" value={cur} onChange={(e) => setCur(e.target.value)} />
      <input style={inputStyle} type="password" placeholder="New password (8+ characters)" value={next} onChange={(e) => setNext(e.target.value)} />
      {err && <div style={errStyle}>{err}</div>}
      {msg && <div style={okStyle}>{msg}</div>}
      <button style={btn} onClick={submit} disabled={!cur || next.length < 8}>Change password</button>
      <div style={{ ...dim, marginTop: 6 }}>
        Signed in through a social provider and never set a password? Use
        “Forgot password?” on the sign-in form to create one.
      </div>
    </>
  )
}

function AccountManage({ session }) {
  const cfg = useServerConfig()
  const user = session.user
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [err, setErr] = useState(null)
  return (
    <>
      <div style={card}>
        <h4 style={h}>Profile</h4>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {user.image && <img src={user.image} alt="" style={{ width: 40, height: 40, borderRadius: '50%' }} />}
          <div>
            <div style={{ fontSize: 14, fontWeight: 600 }}>{user.name || '—'}</div>
            <div style={dim}>{user.email}</div>
          </div>
          <button style={{ ...btn, marginLeft: 'auto' }} onClick={() => authClient.signOut()}>Sign out</button>
        </div>
        <div style={{ ...dim, marginTop: 10 }}>
          Projects still save locally in this browser. Cloud-synced projects tied
          to your account are the next step on the roadmap.
        </div>
      </div>

      <div style={card}>
        <h4 style={h}>Sign-in methods</h4>
        <LinkedAccounts providers={cfg.providers} />
      </div>

      <div style={card}>
        <h4 style={h}>Password</h4>
        <ChangePassword />
      </div>

      <div style={{ ...card, borderColor: '#6e2228' }}>
        <h4 style={{ ...h, color: '#ff8a80' }}>Danger zone</h4>
        {!confirmDelete ? (
          <button style={btnDanger} onClick={() => setConfirmDelete(true)}>Delete account…</button>
        ) : (
          <>
            <div style={{ ...dim, marginBottom: 8 }}>
              This permanently removes your account and all sign-in methods. Local
              projects in this browser are not affected.
            </div>
            {err && <div style={errStyle}>{err}</div>}
            <div style={{ display: 'flex', gap: 8 }}>
              <button style={btnDanger} onClick={async () => {
                const { error } = await authClient.deleteUser()
                if (error) setErr(error.message)
              }}>Yes, delete my account</button>
              <button style={btn} onClick={() => setConfirmDelete(false)}>Cancel</button>
            </div>
          </>
        )}
      </div>
    </>
  )
}

function AccountSection() {
  const { data: session, isPending } = authClient.useSession()
  if (isPending) return <div style={dim}>Checking session…</div>
  return session ? <AccountManage session={session} /> : <AuthForms />
}

// ---------- application settings ----------

function ApplicationSection() {
  const settings = useStore((s) => s.settings)
  const updateSettings = useStore((s) => s.updateSettings)
  const layoutOps = useStore((s) => s.layoutOps)
  const row = { display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, marginBottom: 8 }
  return (
    <>
      <div style={card}>
        <h4 style={h}>Simulation</h4>
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
      <div style={card}>
        <h4 style={h}>Experimental features</h4>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
          <input type="checkbox" checked={!!settings.nlEnabled}
            onChange={(e) => {
              updateSettings({ nlEnabled: e.target.checked })
              if (!e.target.checked) layoutOps.close('nllab')
            }} />
          Large-signal T/S nonlinearity (Nonlinear Lab)
        </label>
        <div style={{ ...dim, marginTop: 6 }}>
          Quasi-linear approximation of Bl(x)/Cms(x)/Le(x) effects — power
          compression and resonance drift, not harmonic distortion. Results
          depend entirely on the curves you provide.
        </div>
      </div>
    </>
  )
}

// ---------- quick bar layout ----------

function QuickBarSection() {
  const toolbar = useStore((s) => s.toolbar)
  const toggleToolbarItem = useStore((s) => s.toggleToolbarItem)
  const moveToolbarItem = useStore((s) => s.moveToolbarItem)
  const resetToolbar = useStore((s) => s.resetToolbar)

  const rowStyle = {
    display: 'flex', alignItems: 'center', gap: 8, padding: '5px 6px',
    borderRadius: 6, fontSize: 13,
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

// A chip showing one combo; click it to re-record, or use its ✕ to drop it.
function ComboChip({ combo, onRemove, onClick }) {
  return (
    <span className="key-chip" onClick={onClick} title="Click to replace this shortcut">
      <kbd>{formatCombo(combo)}</kbd>
      <span className="kc-x" title="Remove this shortcut"
        onClick={(e) => { e.stopPropagation(); onRemove() }}>✕</span>
    </span>
  )
}

function KeyboardSection() {
  const bindings = useStore((s) => s.bindings)
  const assignBinding = useStore((s) => s.assignBinding)
  const removeBinding = useStore((s) => s.removeBinding)
  const resetBindings = useStore((s) => s.resetBindings)
  const [recording, setRecording] = useState(null)   // { id, replacing }
  const [note, setNote] = useState(null)

  // While recording, the window swallows every key so the shortcut being
  // captured cannot also trigger the command it is bound to.
  useEffect(() => {
    if (!recording) return
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
  ['account', 'Account', AccountSection],
  ['keyboard', 'Keyboard', KeyboardSection],
  ['quickbar', 'Quick bar', QuickBarSection],
  ['app', 'Application', ApplicationSection],
]

export default function SettingsWindow() {
  const show = useStore((s) => s.showSettings)
  const setShow = useStore((s) => s.setShowSettings)
  const section = useStore((s) => s.settingsSection)
  const setSection = useStore((s) => s.setSettingsSection)
  const [drag, setDrag] = useState({ x: 0, y: 0 })

  useEffect(() => {
    if (!show) return
    const esc = (e) => { if (e.key === 'Escape') setShow(false) }
    window.addEventListener('keydown', esc)
    return () => window.removeEventListener('keydown', esc)
  }, [show, setShow])

  // re-centre each time the window is opened
  useEffect(() => { if (show) setDrag({ x: 0, y: 0 }) }, [show])

  const onTitleDown = (e) => {
    if (e.target.closest('button')) return
    const x0 = e.clientX - drag.x
    const y0 = e.clientY - drag.y
    const move = (ev) => setDrag({ x: ev.clientX - x0, y: ev.clientY - y0 })
    const up = () => {
      window.removeEventListener('mousemove', move)
      window.removeEventListener('mouseup', up)
    }
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', up)
  }

  if (!show) return null
  const Active = SECTIONS.find(([k]) => k === section)?.[2] || AccountSection

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

// ---------- /reset-password landing (linked from the reset email) ----------

export function ResetPasswordPage() {
  const token = new URLSearchParams(window.location.search).get('token')
  const [pw, setPw] = useState('')
  const [pw2, setPw2] = useState('')
  const [err, setErr] = useState(null)
  const [done, setDone] = useState(false)
  const submit = async () => {
    setErr(null)
    if (pw !== pw2) return setErr('Passwords do not match.')
    const { error } = await authClient.resetPassword({ newPassword: pw, token })
    if (error) setErr(error.message)
    else setDone(true)
  }
  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-1, #0d1117)', color: 'var(--text-1, #e6edf3)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ ...card, width: 380 }}>
        <h4 style={h}>Set a new AcouSim password</h4>
        {!token && <div style={errStyle}>Missing reset token — use the link from your email.</div>}
        {done ? (
          <>
            <div style={okStyle}>Password updated. You can sign in now.</div>
            <a href="/" style={{ color: '#58a6ff', fontSize: 13 }}>← Back to AcouSim</a>
          </>
        ) : (
          <>
            <input style={inputStyle} type="password" placeholder="New password (8+ characters)" value={pw} onChange={(e) => setPw(e.target.value)} />
            <input style={inputStyle} type="password" placeholder="Repeat new password" value={pw2} onChange={(e) => setPw2(e.target.value)} />
            {err && <div style={errStyle}>{err}</div>}
            <button style={btnPrimary} disabled={!token || pw.length < 8} onClick={submit}>Set password</button>
          </>
        )}
      </div>
    </div>
  )
}
