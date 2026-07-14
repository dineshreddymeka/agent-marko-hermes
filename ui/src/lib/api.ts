/**
 * Typed fetch wrapper for Agent-Marko → Hermes FastAPI (direct, no middle hop).
 * Injects X-Hermes-Session-Token when the dashboard bootstraps it into index.html.
 */

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

type RequestOptions = RequestInit & {
  params?: Record<string, string | number | boolean | undefined>
}

declare global {
  interface Window {
    __HERMES_SESSION_TOKEN__?: string
    __HERMES_BASE_PATH__?: string
    __HERMES_AUTH_REQUIRED__?: boolean
  }
}

const SESSION_HEADER = 'X-Hermes-Session-Token'

function readBasePath(): string {
  if (typeof window === 'undefined') return ''
  const raw = window.__HERMES_BASE_PATH__ ?? ''
  if (!raw) return ''
  const withLead = raw.startsWith('/') ? raw : `/${raw}`
  return withLead.replace(/\/+$/, '')
}

function hermesAuthHeaders(): Record<string, string> {
  const token =
    typeof window !== 'undefined' ? window.__HERMES_SESSION_TOKEN__ : undefined
  if (token) return { [SESSION_HEADER]: token }
  return {}
}

function buildUrl(path: string, params?: RequestOptions['params']): string {
  const base = readBasePath()
  const url = new URL(base + path, window.location.origin)
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined) url.searchParams.set(key, String(value))
    }
  }
  return url.pathname + url.search
}

export async function api<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { params, headers, ...init } = options
  const url = buildUrl(path, params)

  const res = await fetch(url, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...hermesAuthHeaders(),
      ...headers,
    },
    credentials: 'include',
  })

  if (!res.ok) {
    let message = res.statusText
    let code: string | undefined
    try {
      const body = (await res.json()) as {
        message?: string
        error?: string
        detail?: string
        code?: string
        login_url?: string
      }
      message =
        body.message ??
        (typeof body.detail === 'string' ? body.detail : undefined) ??
        (typeof body.error === 'string' ? body.error : undefined) ??
        message
      code = body.code ?? (typeof body.error === 'string' ? body.error : undefined)
      if (
        res.status === 401 &&
        body.login_url &&
        (body.error === 'unauthenticated' || body.error === 'session_expired')
      ) {
        window.location.assign(body.login_url)
      }
      throw new ApiError(message, res.status, code)
    } catch (e) {
      if (e instanceof ApiError) throw e
      throw new ApiError(message, res.status)
    }
  }

  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}

export const apiClient = {
  get: <T>(path: string, params?: RequestOptions['params']) =>
    api<T>(path, { method: 'GET', params }),
  post: <T>(path: string, body?: unknown) =>
    api<T>(path, { method: 'POST', body: JSON.stringify(body) }),
  patch: <T>(path: string, body?: unknown) =>
    api<T>(path, { method: 'PATCH', body: JSON.stringify(body) }),
  put: <T>(path: string, body?: unknown) =>
    api<T>(path, { method: 'PUT', body: JSON.stringify(body) }),
  delete: <T>(path: string) => api<T>(path, { method: 'DELETE' }),
}

export { hermesAuthHeaders, readBasePath, SESSION_HEADER }
