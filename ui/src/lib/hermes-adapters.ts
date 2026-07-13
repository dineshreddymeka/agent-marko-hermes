/**
 * Adapters: Hermes FastAPI session/message shapes → Marko shared DTOs.
 * Keeps the UI talking one-hop to Hermes without a Bun DTO layer.
 */
import type { Message, Profile, Session } from '@hermes/shared'
import { apiClient } from '@app/lib/api'

type HermesSessionRow = {
  id?: string
  session_id?: string
  title?: string | null
  archived?: boolean | number
  started_at?: number | string | null
  last_active?: number | string | null
  source?: string | null
  profile?: string | null
}

type HermesSessionsList = {
  sessions?: HermesSessionRow[]
  total?: number
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

export function hermesSessionToDto(row: HermesSessionRow): Session {
  const id = String(row.id ?? row.session_id ?? '')
  const createdAt = tsToIso(row.started_at)
  const updatedAt = tsToIso(row.last_active ?? row.started_at)
  return {
    id,
    title: (row.title && String(row.title)) || 'Untitled',
    groupName: null,
    profileId: row.profile ? String(row.profile) : null,
    pinned: false,
    archived: Boolean(row.archived),
    createdAt,
    updatedAt,
  }
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

export async function fetchHermesSessions(limit = 100): Promise<Session[]> {
  const data = await apiClient.get<HermesSessionsList | HermesSessionRow[]>(
    '/api/sessions',
    { limit, order: 'recent' },
  )
  const rows = Array.isArray(data) ? data : (data.sessions ?? [])
  return rows.map(hermesSessionToDto).filter((s) => s.id)
}

export async function fetchHermesMessages(sessionId: string): Promise<Message[]> {
  const data = await apiClient.get<
    { messages?: HermesMessageRow[]; session_id?: string } | HermesMessageRow[]
  >(`/api/sessions/${sessionId}/messages`)
  const rows = Array.isArray(data) ? data : (data.messages ?? [])
  return rows.map((row) => hermesMessageToDto(row, sessionId))
}

export async function fetchHermesProfiles(): Promise<Profile[]> {
  return apiClient.get<Profile[]>('/api/profiles', { marko: 1 })
}

export async function fetchHermesSettings(): Promise<Record<string, unknown>> {
  return apiClient.get<Record<string, unknown>>('/api/settings')
}

export async function createHermesProfile(
  body: Pick<
    Profile,
    'name' | 'systemPrompt' | 'model' | 'temperature' | 'provider'
  > &
    Partial<Pick<Profile, 'providerConfig' | 'settings'>>,
): Promise<Profile> {
  return apiClient.post<Profile>('/api/profiles', body)
}

export async function updateHermesProfile(
  id: string,
  body: Partial<
    Pick<
      Profile,
      | 'name'
      | 'systemPrompt'
      | 'model'
      | 'temperature'
      | 'provider'
      | 'providerConfig'
      | 'settings'
    >
  >,
): Promise<Profile> {
  return apiClient.patch<Profile>(`/api/profiles/${id}`, body)
}

export async function setHermesDefaultProfile(id: string): Promise<void> {
  await apiClient.post(`/api/profiles/${id}/default`)
}

export async function deleteHermesProfile(id: string): Promise<void> {
  await apiClient.delete(`/api/profiles/${id}`)
}

/** OJ-only surfaces stubbed when Hermes has no equivalent. */
export function descopedFeatureMessage(feature: string): string {
  return `${feature} requires Open Jarvis Bun/Postgres and is descoped in the Hermes-direct build.`
}
