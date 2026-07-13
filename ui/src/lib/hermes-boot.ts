/** Ensure Hermes session token is available before API/AG-UI calls (Vite dev). */
export async function ensureHermesSessionToken(): Promise<void> {
  if (typeof window === 'undefined') return
  if (window.__HERMES_SESSION_TOKEN__) return
  if (window.__HERMES_AUTH_REQUIRED__) return
  try {
    const res = await fetch('/api/marko/boot', { credentials: 'include' })
    if (!res.ok) return
    const body = (await res.json()) as {
      token?: string | null
      authRequired?: boolean
    }
    if (body.authRequired) {
      window.__HERMES_AUTH_REQUIRED__ = true
      return
    }
    if (body.token) {
      window.__HERMES_SESSION_TOKEN__ = body.token
    }
  } catch {
    // Hermes may not be up yet — callers will 401 and surface errors.
  }
}
