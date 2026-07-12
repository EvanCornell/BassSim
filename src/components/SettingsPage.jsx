import React, { useEffect, useState } from 'react'
import { useStore } from '../store'
import { authClient, PROVIDER_LABELS } from '../auth'

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
  const closeTab = useStore((s) => s.closeTab)
  return (
    <>
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
              if (!e.target.checked) closeTab('nllab')
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

// ---------- page ----------

const SECTIONS = [
  ['account', '👤 Account', AccountSection],
  ['app', '🛠 Application', ApplicationSection],
]

export default function SettingsPage() {
  const [section, setSection] = useState('account')
  const Active = SECTIONS.find(([k]) => k === section)?.[2] || AccountSection
  return (
    <div style={{ display: 'flex', height: '100%', minHeight: 0, background: 'var(--bg-1, #0d1117)' }}>
      <div style={{ width: 180, borderRight: '1px solid var(--border, #30363d)', padding: '18px 10px' }}>
        <div style={{ fontSize: 15, fontWeight: 700, padding: '0 8px 12px' }}>Settings</div>
        {SECTIONS.map(([k, title]) => (
          <div key={k}
            onClick={() => setSection(k)}
            style={{
              padding: '8px 10px', borderRadius: 6, cursor: 'pointer', fontSize: 13, marginBottom: 2,
              background: section === k ? 'var(--bg-3, #21262d)' : 'transparent',
              color: section === k ? 'var(--text-1, #e6edf3)' : 'var(--text-2, #a0a8b3)',
            }}>{title}</div>
        ))}
      </div>
      <div style={{ flex: 1, overflow: 'auto', padding: '20px 24px' }}>
        <Active />
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
