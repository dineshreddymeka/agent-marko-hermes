/**
 * Adapters: Hermes FastAPI session/message shapes → Marko shared DTOs.
 * Keeps the UI talking one-hop to Hermes without a Bun DTO layer.
 */
import type { Message, McpDiscoveredTool, McpServer, Session } from '@hermes/shared'
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

/** OJ-only surfaces stubbed when Hermes has no equivalent. */
export function descopedFeatureMessage(feature: string): string {
  return `${feature} requires Open Jarvis Bun/Postgres and is descoped in the Hermes-direct build.`
}

// ── MCP servers (Hermes /api/mcp/servers*) ────────────────────────────────

/** Per-server summary from GET/POST /api/mcp/servers (name-keyed, not UUID). */
export type HermesMcpServerSummary = {
  name: string
  transport: 'http' | 'stdio' | 'unknown'
  url: string | null
  command: string | null
  args: string[]
  env: Record<string, string>
  auth: string | null
  enabled: boolean
  /** null = all tools enabled for the agent. */
  tools: string[] | null
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

function summaryToRawConfig(row: HermesMcpServerSummary): Record<string, unknown> {
  const cfg: Record<string, unknown> = {}
  if (row.url) cfg.url = row.url
  if (row.command) cfg.command = row.command
  if (row.args?.length) cfg.args = row.args
  if (row.env && Object.keys(row.env).length) cfg.env = row.env
  if (row.auth) cfg.auth = row.auth
  if (!row.enabled) cfg.enabled = false
  if (row.tools != null) cfg.tools = row.tools
  return cfg
}

export function hermesMcpServerToDto(
  row: HermesMcpServerSummary,
  live?: Pick<HermesMcpLiveState, 'status' | 'error' | 'tools'>,
): McpServer {
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
  const data = await apiClient.get<{ servers: HermesMcpServerSummary[] }>('/api/mcp/servers')
  const servers = (data.servers ?? []).map((row) => hermesMcpServerToDto(row))
  return { servers, states: [] }
}

export async function createHermesMcpServer(
  body: ReturnType<typeof hermesMcpCreateBody>,
): Promise<McpServer> {
  const created = await apiClient.post<HermesMcpServerSummary>('/api/mcp/servers', body)
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
  const data = await apiClient.get<{ servers: HermesMcpServerSummary[] }>('/api/mcp/servers')
  const rows = data.servers ?? []
  const servers: Record<string, Record<string, unknown>> = {}
  for (const row of rows) {
    const cfg = summaryToRawConfig(row)
    if (row.name === name) {
      if (tools == null) delete cfg.tools
      else cfg.tools = tools
    }
    servers[row.name] = cfg
  }
  await apiClient.put('/api/mcp/servers', { servers })
  const updated = rows.find((r) => r.name === name)
  if (!updated) throw new Error(`Server "${name}" not found`)
  return hermesMcpServerToDto({ ...updated, tools })
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
