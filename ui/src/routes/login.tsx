import { createFileRoute, Link } from '@tanstack/react-router'
import { useEffect, useState } from 'react'

type MicrosoftSsoConfig = {
  configured: boolean
  missingEnv?: string[]
  redirectUri?: string
}

type HealthAuth = {
  oauthProviders?: string[]
  ldapEnabled?: boolean
  authRequired?: boolean
}

/**
 * Open Jarvis login — LDAP (fleet), email/password, or OAuth when configured.
 */
function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [ldapUser, setLdapUser] = useState('')
  const [ldapPassword, setLdapPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [oauth, setOauth] = useState<string[]>([])
  const [ldapEnabled, setLdapEnabled] = useState(false)
  const [microsoft, setMicrosoft] = useState<MicrosoftSsoConfig | null>(null)

  useEffect(() => {
    void fetch('/api/health')
      .then((r) => r.json())
      .then((j: HealthAuth) => {
        if (Array.isArray(j.oauthProviders)) setOauth(j.oauthProviders)
        if (j.ldapEnabled) setLdapEnabled(true)
      })
      .catch(() => undefined)

    void fetch('/api/office/config')
      .then((r) => r.json())
      .then((j: MicrosoftSsoConfig) => {
        if (typeof j?.configured === 'boolean') setMicrosoft(j)
      })
      .catch(() => undefined)
  }, [])

  async function submitLdap(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/auth/sign-in/ldap', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ credential: ldapUser, password: ldapPassword }),
      })
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { message?: string }
        throw new Error(body.message ?? `LDAP sign-in failed (${res.status})`)
      }
      window.location.href = '/'
    } catch (err) {
      setError(String(err instanceof Error ? err.message : err))
    } finally {
      setBusy(false)
    }
  }

  async function submitEmail(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/auth/sign-in/email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email, password }),
      })
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { message?: string }
        throw new Error(body.message ?? `Sign-in failed (${res.status})`)
      }
      window.location.href = '/'
    } catch (err) {
      setError(String(err instanceof Error ? err.message : err))
    } finally {
      setBusy(false)
    }
  }

  function startMicrosoftSso() {
    if (microsoft && !microsoft.configured) {
      const missing = microsoft.missingEnv?.length
        ? microsoft.missingEnv.join(' + ')
        : 'MICROSOFT_CLIENT_ID + MICROSOFT_CLIENT_SECRET'
      setError(
        `Microsoft SSO not configured. Set ${missing} in the server .env (Azure Web redirect: ${microsoft.redirectUri ?? 'http://127.0.0.1:9119/api/office/callback'}), then restart Hermes.`,
      )
      return
    }
    const returnTo = encodeURIComponent(`${window.location.origin}/panel/office`)
    window.location.assign(`/api/office/sso?returnTo=${returnTo}&prompt=select_account`)
  }

  return (
    <div className="flex min-h-full items-center justify-center bg-[var(--bgColor-default)] p-6">
      <div className="w-full max-w-sm space-y-4">
        <div>
          <h1 className="text-2xl font-semibold text-[var(--fgColor-default)]">Open Jarvis</h1>
          <p className="mt-1 text-sm text-[var(--fgColor-muted)]">Sign in to continue</p>
        </div>

        {ldapEnabled ? (
          <form onSubmit={submitLdap} className="space-y-3">
            <label className="block text-sm">
              <span className="text-[var(--fgColor-muted)]">Username</span>
              <input
                className="mt-1 w-full rounded border border-[var(--borderColor-default)] bg-[var(--bgColor-muted)] px-3 py-2"
                type="text"
                value={ldapUser}
                onChange={(e) => setLdapUser(e.target.value)}
                required
                autoComplete="username"
                data-testid="login-ldap-username"
              />
            </label>
            <label className="block text-sm">
              <span className="text-[var(--fgColor-muted)]">Password</span>
              <input
                className="mt-1 w-full rounded border border-[var(--borderColor-default)] bg-[var(--bgColor-muted)] px-3 py-2"
                type="password"
                value={ldapPassword}
                onChange={(e) => setLdapPassword(e.target.value)}
                required
                autoComplete="current-password"
              />
            </label>
            {error && <p className="text-sm text-[var(--fgColor-danger)]">{error}</p>}
            <button
              type="submit"
              disabled={busy}
              className="w-full rounded bg-[var(--button-primary-bgColor-rest)] px-3 py-2 text-[var(--button-primary-fgColor-rest)] disabled:opacity-50"
              data-testid="login-ldap-submit"
            >
              {busy ? 'Signing in…' : 'Sign in with LDAP'}
            </button>
          </form>
        ) : (
          <form onSubmit={submitEmail} className="space-y-3">
            <label className="block text-sm">
              <span className="text-[var(--fgColor-muted)]">Email</span>
              <input
                className="mt-1 w-full rounded border border-[var(--borderColor-default)] bg-[var(--bgColor-muted)] px-3 py-2"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="username"
              />
            </label>
            <label className="block text-sm">
              <span className="text-[var(--fgColor-muted)]">Password</span>
              <input
                className="mt-1 w-full rounded border border-[var(--borderColor-default)] bg-[var(--bgColor-muted)] px-3 py-2"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
              />
            </label>
            {error && <p className="text-sm text-[var(--fgColor-danger)]">{error}</p>}
            <button
              type="submit"
              disabled={busy}
              className="w-full rounded bg-[var(--button-primary-bgColor-rest)] px-3 py-2 text-[var(--button-primary-fgColor-rest)] disabled:opacity-50"
            >
              {busy ? 'Signing in…' : 'Sign in'}
            </button>
          </form>
        )}

        <div className="space-y-2">
          <button
            type="button"
            onClick={startMicrosoftSso}
            className="block w-full rounded border border-[var(--borderColor-default)] px-3 py-2 text-center text-sm"
            data-testid="login-microsoft-sso"
          >
            Sign in with Microsoft
          </button>
          <p className="text-[11px] leading-4 text-[var(--fgColor-muted)]">
            For Office email / calendar (Microsoft Graph). Separate from LDAP app login.
          </p>
          {microsoft && !microsoft.configured ? (
            <p className="text-[11px] leading-4 text-[var(--fgColor-danger)]">
              Missing env:{' '}
              {(microsoft.missingEnv ?? ['MICROSOFT_CLIENT_ID', 'MICROSOFT_CLIENT_SECRET']).join(
                ', ',
              )}
            </p>
          ) : null}
        </div>

        {oauth.length > 0 && (
          <div className="space-y-2">
            {oauth.map((p) => (
              <a
                key={p}
                href={`/api/auth/sign-in/social?provider=${p}`}
                className="block w-full rounded border border-[var(--borderColor-default)] px-3 py-2 text-center text-sm capitalize"
              >
                Continue with {p}
              </a>
            ))}
          </div>
        )}
        <p className="text-xs text-[var(--fgColor-muted)]">
          <Link to="/">Back to app</Link>
        </p>
      </div>
    </div>
  )
}

export const Route = createFileRoute('/login')({
  component: LoginPage,
})
