/**
 * Adapters: Hermes FastAPI session/message shapes → Marko shared DTOs.
 * Keeps the UI talking one-hop to Hermes without a middle DTO layer.
 */
import type {
  Message,
  McpDiscoveredTool,
  McpServer,
  Profile,
  Session,
} from '@hermes/shared'
import { apiClient } from '@app/lib/api'
import { isPlaceholderSessionTitle } from '@app/lib/session-title'

type HermesSessionRow = {
  id?: string
  session_id?: string
  title?: string | null
  preview?: string | null
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
  a2ui?: unknown
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

import { isPlaceholderSessionTitle } from '@app/lib/session-title'

function displaySessionTitle(row: HermesSessionRow): string {
  const raw = row.title != null ? String(row.title).trim() : ''
  if (!isPlaceholderSessionTitle(raw)) return raw
  const preview = row.preview != null ? String(row.preview).trim() : ''
  if (preview) {
    const oneLine = preview.replace(/\s+/g, ' ')
    return oneLine.length > 64 ? `${oneLine.slice(0, 63)}…` : oneLine
  }
  return 'New chat'
}

export function hermesSessionToDto(row: HermesSessionRow): Session {
  const id = String(row.id ?? row.session_id ?? '')
  const createdAt = tsToIso(row.started_at)
  const updatedAt = tsToIso(row.last_active ?? row.started_at)
  return {
    id,
    title: displaySessionTitle(row),
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
    a2ui:
      row.a2ui && typeof row.a2ui === 'object'
        ? (row.a2ui as Record<string, unknown>)
        : typeof row.a2ui === 'string' && row.a2ui.trim()
          ? (() => {
              try {
                return JSON.parse(row.a2ui) as Record<string, unknown>
              } catch {
                return null
              }
            })()
          : null,
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

export async function createHermesSession(
  title = 'New chat',
  id?: string,
): Promise<Session> {
  const body: { title: string; id?: string } = { title }
  if (id) body.id = id
  const data = await apiClient.post<Session | HermesSessionRow>('/api/sessions', body)
  // POST /api/sessions already returns Marko Session shape from Hermes;
  // also accept raw Hermes rows. Always normalize placeholder titles.
  if (data && typeof data === 'object' && 'createdAt' in data && 'id' in data) {
    const session = data as Session
    return {
      ...session,
      title: displaySessionTitle({
        id: session.id,
        title: session.title,
      }),
    }
  }
  return hermesSessionToDto(data as HermesSessionRow)
}

export async function searchHermesSessions(query: string): Promise<Session[]> {
  const q = query.trim()
  if (!q) return fetchHermesSessions()
  const data = await apiClient.get<HermesSessionsList | HermesSessionRow[]>(
    '/api/sessions/search',
    { q },
  )
  const rows = Array.isArray(data) ? data : (data.sessions ?? [])
  return rows.map(hermesSessionToDto).filter((s) => s.id)
}

export async function patchHermesSession(
  id: string,
  patch: Partial<Pick<Session, 'title' | 'archived'>>,
): Promise<Session> {
  const body: Record<string, unknown> = {}
  if (patch.title !== undefined) body.title = patch.title
  if (patch.archived !== undefined) body.archived = patch.archived
  const data = await apiClient.patch<Session | HermesSessionRow>(
    `/api/sessions/${id}`,
    body,
  )
  if (data && typeof data === 'object' && 'createdAt' in data && 'id' in data) {
    return data as Session
  }
  return hermesSessionToDto({ ...(data as HermesSessionRow), id })
}

export async function deleteHermesSession(id: string): Promise<void> {
  await apiClient.delete(`/api/sessions/${id}`)
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
  return `${feature} requires Open Jarvis Postgres features and is descoped in the Hermes-direct build.`
}

// ── MCP servers (Hermes /api/mcp/servers*) ────────────────────────────────

/** DB-backed DTO from GET/POST /api/mcp/servers (camelCase Marko shape). */
export type HermesMcpServerDto = McpServer

/** Legacy summary shape (still accepted for mapping). */
export type HermesMcpServerSummary = {
  name: string
  transport: 'http' | 'stdio' | 'unknown'
  url: string | null
  command: string | null
  args: string[]
  env: Record<string, string>
  auth: string | null
  enabled: boolean
  tools?: unknown
  toolWhitelist?: string[] | null
  id?: string
}

export type HermesMcpTestResult = {
  ok: boolean
  error?: string
  tools: Array<{ name: string; description?: string }>
  prompts?: number
  resources?: number
}

/** Live probe state keyed by server name (Hermes has no persisted connection state). */
export type HermesMcpLiveState = {
  serverId: string
  name: string
  status: 'connected' | 'disconnected' | 'error' | 'reconnecting'
  tools: string[]
  resources?: string[]
  prompts?: string[]
  transportKind?: 'stdio' | 'streamable-http' | 'sse'
  error?: string
}

const MCP_NOW = () => new Date().toISOString()

function hermesMcpTransport(row: HermesMcpServerSummary): 'stdio' | 'http' {
  if (row.transport === 'http' || row.transport === 'stdio') return row.transport
  return row.url ? 'http' : 'stdio'
}

function isDbBackedMcpDto(row: HermesMcpServerSummary | HermesMcpServerDto): row is HermesMcpServerDto {
  return typeof (row as HermesMcpServerDto).id === 'string' && Boolean((row as HermesMcpServerDto).createdAt)
}

function summaryToRawConfig(row: HermesMcpServerSummary): Record<string, unknown> {
  const cfg: Record<string, unknown> = {}
  if (row.url) cfg.url = row.url
  if (row.command) cfg.command = row.command
  if (row.args?.length) cfg.args = row.args
  if (row.env && Object.keys(row.env).length) cfg.env = row.env
  if (row.auth) cfg.auth = row.auth
  if (!row.enabled) cfg.enabled = false
  const whitelist = row.toolWhitelist ?? (Array.isArray(row.tools) ? row.tools : null)
  if (whitelist != null) cfg.tools = whitelist
  else if (row.tools != null && typeof row.tools === 'object') cfg.tools = row.tools
  return cfg
}

export function hermesMcpServerToDto(
  row: HermesMcpServerSummary | HermesMcpServerDto,
  live?: Pick<HermesMcpLiveState, 'status' | 'error' | 'tools'>,
): McpServer {
  if (isDbBackedMcpDto(row)) {
    if (!live) return row
    return {
      ...row,
      lastStatus: live.status,
      lastError: live.error ?? null,
      lastTestedAt: MCP_NOW(),
      lastConnectedAt: live.status === 'connected' ? MCP_NOW() : row.lastConnectedAt,
      discoveredTools: live.tools.length
        ? live.tools.map((name) => ({ name }))
        : row.discoveredTools,
    }
  }
  const transport = hermesMcpTransport(row)
  const discoveredTools: McpDiscoveredTool[] | null = live?.tools?.length
    ? live.tools.map((name) => ({ name }))
    : null
  return {
    id: row.name,
    name: row.name,
    description: null,
    transport,
    command: row.command,
    url: row.url,
    env: row.env ?? null,
    headers: null,
    enabled: row.enabled,
    toolWhitelist: row.tools,
    httpPreferSse: false,
    timeoutMs: null,
    autoReconnect: true,
    lastStatus: live?.status ?? null,
    lastError: live?.error ?? null,
    lastConnectedAt: live?.status === 'connected' ? MCP_NOW() : null,
    lastTestedAt: live ? MCP_NOW() : null,
    discoveredTools,
    discoveredResources: null,
    discoveredPrompts: null,
    metadata: null,
    createdAt: MCP_NOW(),
    updatedAt: MCP_NOW(),
  }
}

export function hermesMcpCreateBody(input: {
  name: string
  transport: 'stdio' | 'http'
  command?: string | null
  url?: string | null
  env?: Record<string, string> | null
  auth?: string | null
}): {
  name: string
  url?: string
  command?: string
  env?: Record<string, string>
  auth?: string
} {
  const body: {
    name: string
    url?: string
    command?: string
    env?: Record<string, string>
    auth?: string
  } = { name: input.name.trim() }
  if (input.transport === 'http' && input.url?.trim()) body.url = input.url.trim()
  if (input.transport === 'stdio' && input.command?.trim()) body.command = input.command.trim()
  if (input.env && Object.keys(input.env).length) body.env = input.env
  if (input.auth) body.auth = input.auth
  return body
}

export async function fetchHermesMcpServers(): Promise<{
  servers: McpServer[]
  states: HermesMcpLiveState[]
}> {
  const data = await apiClient.get<{
    servers: Array<HermesMcpServerSummary | HermesMcpServerDto>
    states?: HermesMcpLiveState[]
  }>('/api/mcp/servers')
  const servers = (data.servers ?? []).map((row) => hermesMcpServerToDto(row))
  return { servers, states: data.states ?? [] }
}

export async function createHermesMcpServer(
  body: ReturnType<typeof hermesMcpCreateBody>,
): Promise<McpServer> {
  const created = await apiClient.post<HermesMcpServerSummary | HermesMcpServerDto>(
    '/api/mcp/servers',
    body,
  )
  return hermesMcpServerToDto(created)
}

export async function deleteHermesMcpServer(name: string): Promise<void> {
  await apiClient.delete(`/api/mcp/servers/${encodeURIComponent(name)}`)
}

export async function setHermesMcpServerEnabled(
  name: string,
  enabled: boolean,
): Promise<McpServer> {
  await apiClient.put(`/api/mcp/servers/${encodeURIComponent(name)}/enabled`, { enabled })
  const list = await fetchHermesMcpServers()
  const server = list.servers.find((s) => s.id === name)
  if (!server) throw new Error(`Server "${name}" not found after toggle`)
  return { ...server, enabled }
}

export async function testHermesMcpServer(name: string): Promise<{
  state: HermesMcpLiveState
  server: McpServer | null
}> {
  const result = await apiClient.post<HermesMcpTestResult>(
    `/api/mcp/servers/${encodeURIComponent(name)}/test`,
  )
  const state: HermesMcpLiveState = {
    serverId: name,
    name,
    status: result.ok ? 'connected' : 'error',
    tools: (result.tools ?? []).map((t) => t.name),
    error: result.error,
  }
  const list = await fetchHermesMcpServers()
  const row = list.servers.find((s) => s.id === name) ?? null
  const server = row
    ? {
        ...row,
        lastStatus: state.status,
        lastError: state.error ?? null,
        lastTestedAt: MCP_NOW(),
        lastConnectedAt: state.status === 'connected' ? MCP_NOW() : row.lastConnectedAt,
        discoveredTools: state.tools.map((toolName) => ({ name: toolName })),
      }
    : null
  return { state, server }
}

export async function setHermesMcpServerTools(
  name: string,
  tools: string[] | null,
): Promise<McpServer> {
  const data = await apiClient.get<{
    servers: Array<HermesMcpServerSummary | HermesMcpServerDto>
  }>('/api/mcp/servers')
  const rows = data.servers ?? []
  const servers: Record<string, Record<string, unknown>> = {}
  for (const row of rows) {
    const cfg = isDbBackedMcpDto(row)
      ? summaryToRawConfig({
          name: row.name,
          transport: row.transport,
          url: row.url,
          command: row.command,
          args: [],
          env: row.env ?? {},
          auth: null,
          enabled: row.enabled,
          toolWhitelist: row.toolWhitelist,
        })
      : summaryToRawConfig(row)
    if (row.name === name) {
      if (tools == null) delete cfg.tools
      else cfg.tools = { include: tools }
    }
    servers[row.name] = cfg
  }
  await apiClient.put('/api/mcp/servers', { servers })
  const updated = rows.find((r) => r.name === name)
  if (!updated) throw new Error(`Server "${name}" not found`)
  return hermesMcpServerToDto(
    isDbBackedMcpDto(updated)
      ? { ...updated, toolWhitelist: tools }
      : { ...updated, tools },
  )
}

/** Next Hermes `tools` allowlist after toggling one tool name. */
export function hermesMcpNextToolWhitelist(
  current: string[] | null,
  tool: string,
  allTools: string[],
): string[] | null {
  const allowed = current == null ? allTools : current
  const blocked = allowed.includes(tool)
  const next = blocked ? allowed.filter((t) => t !== tool) : [...allowed, tool]
  if (next.length === 0) return []
  if (next.length >= allTools.length) return null
  return next
}
