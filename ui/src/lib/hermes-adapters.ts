/**
 * Adapters: Hermes FastAPI session/message shapes → Marko shared DTOs.
 * Keeps the UI talking one-hop to Hermes without a Bun DTO layer.
 */
import type { Message, SearchResult, Session } from '@hermes/shared'
import { apiClient } from '@app/lib/api'

type HermesSessionRow = {
  id?: string
  session_id?: string
  title?: string | null
  archived?: boolean | number
  pinned?: boolean | number
  started_at?: number | string | null
  last_active?: number | string | null
  source?: string | null
  profile?: string | null
}

type HermesSessionsList = {
  sessions?: HermesSessionRow[]
  total?: number
  limit?: number
  offset?: number
}

type HermesSessionSearchHit = {
  session_id: string
  snippet?: string
  role?: string | null
  source?: string | null
  model?: string | null
  session_started?: number | null
  lineage_root?: string
}

type HermesSessionSearchResponse = {
  results?: HermesSessionSearchHit[]
}

type HermesPatchResponse = {
  ok?: boolean
  title?: string
  archived?: boolean
  session?: HermesSessionRow
  object?: string
}

type HermesCreateResponse = Session | (HermesSessionRow & { session?: HermesSessionRow; object?: string })

function tsToIso(value: unknown): string {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return new Date(value * (value < 1e12 ? 1000 : 1)).toISOString()
  }
  if (typeof value === 'string' && value) {
    const n = Number(value)
    if (Number.isFinite(n)) return tsToIso(n)
    const d = new Date(value)
    if (!Number.isNaN(d.getTime())) return d.toISOString()
  }
  return new Date().toISOString()
}

function contentToString(content: unknown): string {
  if (content == null) return ''
  if (typeof content === 'string') return content
  try {
    return JSON.stringify(content)
  } catch {
    return String(content)
  }
}

function emptySession(id: string): Session {
  const now = new Date().toISOString()
  return {
    id,
    title: 'Untitled',
    groupName: null,
    profileId: null,
    pinned: false,
    archived: false,
    createdAt: now,
    updatedAt: now,
  }
}

function isMarkoSession(value: unknown): value is Session {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as Session).id === 'string' &&
    typeof (value as Session).createdAt === 'string'
  )
}

export function hermesSessionToDto(row: HermesSessionRow): Session {
  const id = String(row.id ?? row.session_id ?? '')
  const createdAt = tsToIso(row.started_at)
  const updatedAt = tsToIso(row.last_active ?? row.started_at)
  return {
    id,
    title: (row.title && String(row.title)) || 'Untitled',
    groupName: null,
    profileId: row.profile ? String(row.profile) : null,
    pinned: Boolean(row.pinned),
    archived: Boolean(row.archived),
    createdAt,
    updatedAt,
  }
}

export function hermesSearchHitToSearchResult(hit: HermesSessionSearchHit): SearchResult {
  const sessionId = String(hit.session_id ?? '')
  return {
    kind: 'message',
    id: sessionId,
    snippet: hit.snippet ?? '',
    sessionId,
  }
}

export async function fetchHermesSessions(limit = 100): Promise<Session[]> {
  const data = await apiClient.get<HermesSessionsList | HermesSessionRow[]>(
    '/api/sessions',
    { limit, order: 'recent', archived: 'include' },
  )
  const rows = Array.isArray(data) ? data : (data.sessions ?? [])
  return rows.map(hermesSessionToDto).filter((s) => s.id)
}

export async function fetchHermesSessionSearch(
  query: string,
  limit = 20,
): Promise<SearchResult[]> {
  const q = query.trim()
  if (q.length <= 1) return []
  const data = await apiClient.get<HermesSessionSearchResponse>('/api/sessions/search', {
    q,
    limit,
  })
  return (data.results ?? []).map(hermesSearchHitToSearchResult)
}

export async function createHermesSession(title = 'New chat'): Promise<Session> {
  const data = await apiClient.post<HermesCreateResponse>('/api/sessions', { title })
  if (isMarkoSession(data)) return data
  if (data.session) return hermesSessionToDto(data.session)
  return hermesSessionToDto(data)
}

export async function patchHermesSession(
  id: string,
  patch: Partial<Session>,
  current?: Session,
): Promise<Session> {
  const base = current ?? emptySession(id)
  const body: { title?: string; archived?: boolean } = {}
  if (patch.title !== undefined) body.title = patch.title
  if (patch.archived !== undefined) body.archived = patch.archived

  if (Object.keys(body).length === 0) {
    return { ...base, ...patch, updatedAt: new Date().toISOString() }
  }

  const resp = await apiClient.patch<HermesPatchResponse>(`/api/sessions/${id}`, body)
  if (resp.session) return hermesSessionToDto(resp.session)

  return {
    ...base,
    ...patch,
    title: resp.title ?? patch.title ?? base.title,
    archived: resp.archived ?? patch.archived ?? base.archived,
    updatedAt: new Date().toISOString(),
  }
}

export async function deleteHermesSession(id: string): Promise<void> {
  await apiClient.delete(`/api/sessions/${id}`)
}

export function hermesMessageToDto(
  row: HermesMessageRow,
  sessionId: string,
): Message {
  const roleRaw = (row.role || 'assistant').toLowerCase()
  const role =
    roleRaw === 'user' ||
    roleRaw === 'assistant' ||
    roleRaw === 'system' ||
    roleRaw === 'tool'
      ? roleRaw
      : 'assistant'
  return {
    id: String(row.id ?? `${sessionId}-${row.timestamp ?? Math.random()}`),
    sessionId,
    runId: null,
    role,
    content: contentToString(row.content),
    toolName: row.tool_name ? String(row.tool_name) : null,
    toolArgs: null,
    toolResult: null,
    thinking:
      (typeof row.reasoning_content === 'string' && row.reasoning_content) ||
      (typeof row.reasoning === 'string' && row.reasoning) ||
      null,
    a2ui: null,
    tokens: null,
    createdAt: tsToIso(row.timestamp),
  }
}

type HermesMessageRow = {
  id?: number | string
  session_id?: string
  role?: string
  content?: unknown
  tool_name?: string | null
  tool_call_id?: string | null
  tool_calls?: unknown
  reasoning?: string | null
  reasoning_content?: string | null
  timestamp?: number | string | null
}

export async function fetchHermesMessages(sessionId: string): Promise<Message[]> {
  const data = await apiClient.get<
    { messages?: HermesMessageRow[]; session_id?: string } | HermesMessageRow[]
  >(`/api/sessions/${sessionId}/messages`)
  const rows = Array.isArray(data) ? data : (data.messages ?? [])
  return rows.map((row) => hermesMessageToDto(row, sessionId))
}

/** OJ-only surfaces stubbed when Hermes has no equivalent. */
export function descopedFeatureMessage(feature: string): string {
  return `${feature} requires Open Jarvis Bun/Postgres and is descoped in the Hermes-direct build.`
}
