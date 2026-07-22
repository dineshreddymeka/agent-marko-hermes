/** REST API DTOs shared between app and server (Phase 2+) */

import type { CronWorkflow } from './cron-workflow'

export interface Session {
  id: string
  title: string
  groupName: string | null
  profileId: string | null
  pinned: boolean
  archived: boolean
  createdAt: string
  updatedAt: string
}

export interface Message {
  id: string
  sessionId: string
  runId: string | null
  role: 'user' | 'assistant' | 'system' | 'tool'
  content: string
  toolName: string | null
  toolArgs: Record<string, unknown> | null
  toolResult: Record<string, unknown> | null
  thinking: string | null
  a2ui: Record<string, unknown> | null
  tokens: number | null
  createdAt: string
}

export interface Skill {
  id: string
  name: string
  /** Stable kebab-case identity used for disk folders + sync upsert. */
  slug: string
  description: string
  bodyMd: string
  source: 'builtin' | 'user-folder' | `git:${string}` | 'learned'
  path: string | null
  /** SHA-256 of bodyMd; used to skip re-embed when unchanged. */
  contentHash: string | null
  triggers: string[] | null
  enabled: boolean
  lastSyncedAt: string | null
  /** True when the DB row exists but the SKILL.md path is gone. */
  missingOnDisk: boolean
  usageCount: number
  successCount: number
  createdAt: string
  updatedAt: string
}

/** Response from POST /api/skills/sync */
export interface SkillsSyncResult {
  synced: number
  created: number
  updated: number
  unchanged: number
  missing: number
  recreated: number
  lastSyncedAt: string
  git?: Array<{ url: string; synced: number }>
}

/** Lightweight panel meta (last sync + skills dir). */
export interface SkillsMeta {
  lastSyncedAt: string | null
  skillsDir: string
  total: number
  enabled: number
  missing: number
}

export interface MemoryEntry {
  id: string
  kind: 'semantic' | 'episodic' | 'preference'
  content: string
  sourceSession: string | null
  importance: number
  createdAt: string
  lastAccessed: string | null
}

export interface CronJob {
  id: string
  name: string
  schedule: string
  prompt: string
  profileId: string | null
  enabled: boolean
  lastRun: string | null
  nextRun: string | null
  /** IANA timezone for schedule semantics (default UTC). */
  timezone: string
  /** Enterprise workflow config (wizard answers + bindings), zod-validated. */
  workflow: CronWorkflow
  /** Denormalized from workflow for fast array-contains filters. */
  mcpServerIds: string[]
  skillIds: string[]
  updatedAt: string | null
}

export interface Profile {
  id: string
  name: string
  systemPrompt: string
  model: string
  temperature: number
  provider: 'native' | 'agui-remote' | 'hermes-python'
  providerConfig: Record<string, unknown> | null
  settings: Record<string, unknown> | null
}

export interface McpDiscoveredTool {
  name: string
  description?: string
}

export interface McpDiscoveredResource {
  uri: string
  name?: string
  description?: string
  mimeType?: string
}

export interface McpDiscoveredPrompt {
  name: string
  description?: string
}

export interface McpServer {
  id: string
  name: string
  description: string | null
  transport: 'stdio' | 'http'
  command: string | null
  url: string | null
  env: Record<string, string> | null
  headers: Record<string, string> | null
  enabled: boolean
  toolWhitelist: string[] | null
  /** When transport=http, try SSE before/instead of streamable-http preference. */
  httpPreferSse: boolean
  timeoutMs: number | null
  autoReconnect: boolean
  lastStatus: 'connected' | 'disconnected' | 'error' | 'reconnecting' | null
  lastError: string | null
  lastConnectedAt: string | null
  lastTestedAt: string | null
  discoveredTools: McpDiscoveredTool[] | null
  discoveredResources: McpDiscoveredResource[] | null
  discoveredPrompts: McpDiscoveredPrompt[] | null
  metadata: Record<string, unknown> | null
  createdAt: string
  updatedAt: string
}

export interface McpConnectionEvent {
  id: string
  serverId: string
  eventType: string
  status: string | null
  transportKind: string | null
  detail: Record<string, unknown> | null
  createdAt: string
}

export interface ApiToken {
  id: string
  name: string
  /** Present only on create */
  token?: string
  scopes: string[]
  lastUsedAt: string | null
  createdAt: string
}

export interface SearchResult {
  kind:
    | 'message'
    | 'memory'
    | 'skill'
    | 'session'
    | 'workspace_file'
    | 'cron_job'
    | 'run_event'
    | 'cowork_task'
    | 'office_artifact'
  id: string
  snippet: string
  score?: number
  sessionId?: string
  runId?: string | null
  userId?: string | null
  actionId?: string | null
  documentId?: string
  chunkId?: string
  path?: string | null
  title?: string | null
  lineStart?: number | null
  lineEnd?: number | null
  sourceType?: string
}

/** Indexer source types accepted by /api/search and index_search. */
export type IndexSourceType =
  | 'workspace_file'
  | 'file'
  | 'message'
  | 'memory'
  | 'skill'
  | 'session'
  | 'cron_job'
  | 'run_event'
  | 'cowork_task'
  | 'office_artifact'

/** Query filters for hybrid Jarvis recall search. */
export interface IndexSearchFilters {
  topK?: number
  sourceTypes?: IndexSourceType[]
  pathPrefix?: string
  extension?: string
  sessionId?: string
  runId?: string
  userId?: string
  actionId?: string
  from?: string
  to?: string
  tags?: string[]
  includeDeleted?: boolean
}

/** @deprecated Prefer SearchResult */
export type SearchHit = SearchResult

export interface CronRun {
  id: string
  jobId: string
  startedAt: string
  finishedAt: string | null
  status: string
  sessionId: string | null
  error: string | null
  /** Per-run snapshot: { mcpAllowed, skillsForced, attempts, errorCode } */
  detail: Record<string, unknown> | null
}

export interface WorkspaceEntry {
  name: string
  type: 'file' | 'dir'
  path: string
}

export interface WorkspaceTreeResponse {
  path: string
  entries: WorkspaceEntry[]
}

export interface WorkspaceGitStatus {
  isRepo: boolean
  dirty: boolean
  files: string[]
}

/** Open Cowork work-request lifecycle (business UI: Queued / Running / Done / Failed). */
export type CoworkTaskStatus = 'queued' | 'running' | 'done' | 'failed' | 'aborted'

/** Deliverable chips for document-oriented Cowork jobs. */
export type CoworkDeliverableType =
  | 'presentation'
  | 'word'
  | 'spreadsheet'
  | 'pdf'
  | 'other'

export interface CreateCoworkTaskBody {
  goal: string
  deliverableType: CoworkDeliverableType
  /** Workspace-relative or absolute paths (path-jailed server-side). */
  files?: Array<string | { sourcePath: string; name?: string }>
  /** Override OPEN_COWORK_AUTO_APPROVE for this run. */
  autoApprove?: boolean
}

export interface CoworkTask {
  taskId: string
  status: CoworkTaskStatus
  goal: string | null
  deliverableType: CoworkDeliverableType | null
  /** Hermes audit session (`Cowork: <taskId>`). */
  sessionId: string | null
  /**
   * Source paths submitted with the request (from COWORK_STARTED).
   * Distinct from output `files`. Null for legacy tasks that predate persistence.
   */
  inputFiles: string[] | null
  /** Workspace-relative outbox paths when available. */
  files: string[]
  summary: string | null
  error: string | null
  createdAt: string
  finishedAt: string | null
}

export interface CreateCoworkTaskResponse {
  taskId: string
  status: CoworkTaskStatus
  sessionId: string | null
}

export interface SendCoworkTaskMessageBody {
  text: string
}

export interface SendCoworkTaskMessageResponse {
  ok: boolean
  taskId: string
  error?: string
}

export interface CoworkTaskListResponse {
  tasks: CoworkTask[]
}

/** Mid-task progress reported by the worker via the Jarvis MCP bridge. */
export interface CoworkTaskProgressEntry {
  at: string
  message: string
  percent?: number
}

/** Clarifying question stored by the worker via the Jarvis MCP bridge (`jarvis_ask`). */
export interface CoworkTaskQuestion {
  id: string
  question: string
  at: string
}

export interface CoworkTaskDetail extends CoworkTask {
  /** Parsed outbox/<taskId>/status.json when present. */
  statusJson: Record<string, unknown> | null
  /** Filenames under outbox/<taskId>/ (excluding status.json when listed separately). */
  outboxFiles: string[]
  /** Bridge progress reports (in-memory + persisted COWORK_PROGRESS events). */
  progress?: CoworkTaskProgressEntry[]
  /** Bridge clarifying questions (in-memory + persisted COWORK_QUESTION events). */
  questions?: CoworkTaskQuestion[]
}

export interface AbortCoworkTaskResponse {
  ok: boolean
  taskId: string
  status: CoworkTaskStatus
  error?: string
}

/** GET /api/cowork/setup — whether Open Cowork.exe is configured and present. */
export interface CoworkSetupResponse {
  configured: boolean
  exe: string
  exeExists: boolean
  /** False for released 3.3.x GUI installers without --headless JSONL. */
  headlessSupported: boolean
  workspace: string
  hint: string
  /** Official releases page. */
  releasesUrl: string
  /** Direct Windows installer download (latest pinned). */
  downloadUrl: string
  /** Present when the executable is missing or lacks headless. */
  code?: 'COWORK_EXE_MISSING' | 'COWORK_HEADLESS_UNSUPPORTED'
  /** Jarvis MCP bridge registration status (Slice B). */
  mcpBridge?: CoworkMcpBridgeStatus
}

/** Status of the Jarvis stdio MCP bridge entry in Open Cowork's mcp-config.json. */
export interface CoworkMcpBridgeStatus {
  registered: boolean
  readiness: 'not_configured' | 'configured' | 'connected' | 'degraded'
  /** Entry exists in mcp-config (may be disabled). */
  entryPresent?: boolean
  /** Entry is enabled for Cowork to spawn. */
  enabled?: boolean
  scriptExists?: boolean
  lastActivityAt?: string | null
  command: string
  configPath: string
  hint: string
}

/** POST /api/cowork/mcp-bridge/register response. */
export interface RegisterCoworkMcpBridgeResponse {
  ok: boolean
  mcpBridge: CoworkMcpBridgeStatus
}

/** PUT /api/cowork/setup — persist exe/workspace overrides (settings > env). */
export interface UpdateCoworkSetupBody {
  /** Full path to Open Cowork.exe; empty string clears the settings override. */
  exe?: string
  workspace?: string
}

/** GET /api/health — public; LLM baseUrl is only on authenticated debug health. */
export interface HealthResponse {
  ok: boolean
  version: string
  db: boolean
  llm: {
    mode: 'mock' | 'configured' | 'live'
    mock: boolean
    model: string | null
  }
  /** better-auth social provider ids when configured (no secrets). */
  oauthProviders: string[]
  ldapEnabled: boolean
  authRequired: boolean
  authDb: boolean
}

/** Generic error body returned by most REST handlers. */
export interface ApiError {
  error: string
  code?: string
  message?: string
  detail?: unknown
  details?: unknown
}

export interface DeletedResponse {
  deleted: boolean
}

export interface OkResponse {
  ok: boolean
}

/** GET /api/capabilities — unified capability manifest + agent LLM health. */
export type CapabilityToolSource = 'native' | 'mcp'

export interface CapabilityToolEntry {
  name: string
  source: CapabilityToolSource
  server?: string
  serverId?: string
  dangerous: boolean
  description: string
  trusted: boolean
}

export interface CapabilitySkillEntry {
  id: string
  name: string
  description: string
  triggers: string[] | null
  source: string
}

export interface CapabilitySlashCommandEntry {
  name: string
  server: string
  description: string
}

export type CapabilityProviderStatus = 'available' | 'unavailable' | 'misconfigured'

export interface CapabilityProviderEntry {
  id: 'native' | 'agui-remote' | 'hermes-python'
  label: string
  available: boolean
  status: CapabilityProviderStatus
  reason: string | null
  delegatable: boolean
}

export type AgentLlmCircuitState = 'closed' | 'open' | 'half_open'

export interface AgentLlmHealthSnapshot {
  preferredAgentBaseUrl: string | null
  bridgeFallbackBaseUrl: string
  circuitState: AgentLlmCircuitState
  consecutiveFailures: number
  lastFailure: string | null
  lastSuccessAt: string | null
  lastHealthCheckAt: string | null
  lastHealthOk: boolean
  routing: 'legacy' | 'capabilities'
  timeoutMs: number
  /** True when tools are unavailable (open circuit, missing agent URL, or failed probe). */
  degraded: boolean
  toolsEnabled: boolean
}

export interface CapabilitiesResponse {
  tools: CapabilityToolEntry[]
  skills: CapabilitySkillEntry[]
  plugins: Array<{
    id: string
    kind: 'mcp' | 'cowork'
    name: string
    status: string
    toolCount: number
    trusted: boolean
  }>
  slashCommands: CapabilitySlashCommandEntry[]
  /** Provider delegation targets for `delegate_to_agent`. */
  providers: CapabilityProviderEntry[]
  refreshedAt: string
  retrievalMode: 'semantic' | 'lexical' | 'legacy'
  routing: 'legacy' | 'capabilities'
  agentLlm: AgentLlmHealthSnapshot
  /**
   * Hermes-direct extension: feature availability derived from live OpenAPI
   * (`/openapi.json`). Next.js uses this to show/hide panels without hardcoding.
   */
  features?: Record<string, boolean>
  /** Pointers to Hermes Swagger + schema for direct browser→backend discovery. */
  openapi?: {
    docsUrl: string
    schemaUrl: string
    pathCount: number
    backend: string
    direct: boolean
  }
}

/** POST /api/capabilities and POST /api/capabilities/warm */
export interface CapabilitiesRefreshResponse {
  ok: true
  refreshedAt: string
  tools: number
  skills: number
  plugins: number
  slashCommands: number
  providers: number
  agentLlm: AgentLlmHealthSnapshot
  mcpReconnect?: {
    ok: boolean
    error: string | null
  }
}

/** GET/PUT /api/approval/config */
export interface ApprovalConfig {
  autoApproveAll: boolean
  toolWhitelist: string[]
  sessionWhitelist: string[]
}

export interface UpdateApprovalConfigBody {
  autoApproveAll?: boolean
  toolWhitelist?: string[]
}

export type ApprovalDecision = 'approve' | 'reject' | 'always' | 'always_tool'

/** POST /api/approval/resolve */
export interface ResolveApprovalBody {
  toolCallId: string
  decision: ApprovalDecision
}

export interface ResolveApprovalResponse {
  ok: true
}

/** GET /api/skills/sources */
export interface SkillsSourcesResponse {
  sources: string[]
}

export interface AddSkillSourceBody {
  url: string
}

/** POST /api/cron/validate */
export interface CronValidateResponse {
  valid: boolean
  preview: string
  nextRun: string | null
}

/** POST /api/cron/wizard/preview */
export interface CronWizardPreviewResponse {
  schedule: CronValidateResponse | null
  mcpServers: Array<{
    id: string
    name: string
    enabled: boolean
    lastStatus: string | null
    lastError: string | null
    healthy: boolean
  }>
  unknownMcpIds: string[]
  skills: Array<{ id: string; name: string }>
  unknownSkillIds: string[]
}

/** GET/PUT /api/workspace/file */
export interface WorkspaceFileResponse {
  path: string
  content: string | null
  encoding: 'utf8' | 'base64'
  mime: string
  contentBase64?: string
}

export interface WorkspaceFileWriteBody {
  path: string
  content?: string
  contentBase64?: string
  encoding?: 'utf8' | 'base64'
}

export interface WorkspaceFileWriteResponse {
  ok: true
  path: string
}

/** POST /api/workspace/upload */
export interface WorkspaceUploadBody {
  path: string
  content?: string
  contentBase64?: string
  encoding?: 'utf8' | 'base64'
}

export interface WorkspaceUploadResponse {
  ok: true
  path: string
  name: string
}

/** Settings map (sensitive values masked on read). */
export type SettingsMap = Record<string, unknown>

/** GET /api/settings/export */
export interface SettingsExportResponse {
  exportedAt: string
  product: string
  sessions: Session[]
  memory: MemoryEntry[]
  skills: Skill[]
  profiles: Profile[]
  settings: SettingsMap
}

/** GET /api/office/config */
export interface OfficeConfigResponse {
  configured: boolean
  missingEnv: string[]
  redirectUri: string
  tenantId: string
  autoSso: boolean
  azurePlatform: 'Web'
  flow: 'authorization_code+pkce'
  purpose: string
  scopes: string[]
}

export interface OfficeAccount {
  id: string | null
  displayName: string | null
  email: string | null
  connectedAt: string
  expiresAt: string | null
  scopes: string[]
}

/** GET /api/office/status */
export interface OfficeStatusResponse extends OfficeConfigResponse {
  connected: boolean
  account: OfficeAccount | null
  artifactScopes: string[]
  grantedScopes: string[]
}

export interface OfficeConnectBody {
  returnTo?: string
  prompt?: 'consent' | 'select_account'
  artifacts?: boolean | '1'
}

export interface OfficeConnectResponse {
  authUrl: string
}

export interface OfficeDisconnectResponse {
  connected: false
}

export interface BriefingMeeting {
  id: string
  title: string
  start: string
  end: string
  timeLabel: string
  status: 'Done' | 'In progress' | 'Upcoming' | 'Cancelled'
  meta: string
  isOnlineMeeting: boolean
  joinUrl: string | null
  attendeeCount: number
  durationMinutes: number
}

export interface OfficeBriefingStats {
  meetingTime: string
  meetingTimeMinutes: number
  meetingCount: number
  onlineMeetingCount: number
  focusBlocks: number
  upcomingCount: number
  doneCount: number
}

/** GET /api/office/briefing — live or empty placeholder. */
export interface OfficeBriefingResponse {
  live: boolean
  syncedAt?: string
  connected: boolean
  configured?: boolean
  account: unknown
  stats: OfficeBriefingStats | null
  agenda: BriefingMeeting[]
  insights: string[]
  actions: string[]
  note?: string
  message?: string
  error?: string
}

/** GET /api/indexer/status */
export interface IndexerStatusResponse {
  queueDepth: number
  retryingJobs: number
  failedJobs: number
  indexedDocuments: number
  indexedChunks: number
  lastIndexedAt: string | null
}

export interface IndexerReindexResponse {
  queued: number
}

export interface IndexerDrainResponse {
  processed: number
}

/** GET /api/debug/health — requires session/bearer (or localhost bypass). */
export interface DebugHealthResponse {
  status: 'ok' | 'degraded'
  product: string
  database: string
  db: boolean
  dbMetrics: Record<string, unknown> | null
  activeRuns: number
  mcp: Record<string, unknown>
  embeddingQueue: number
  compute: Record<string, unknown>
  cronJobs: number
  oauthProviders: string[]
  microsoftSso: {
    configured: boolean
    missingEnv: string[]
    autoSso: boolean
  }
  llm: {
    baseUrl: string
    mode: 'mock' | 'configured' | 'live'
    mock: boolean
  }
  memory: Record<string, unknown>
  jarvisIndexer?: {
    documents: number
    chunks: number
    pendingJobs: number
    failedJobs: number
    [key: string]: unknown
  }
  uptime: number
}

export interface DebugRunSummary {
  runId: string
  sessionId?: string | null
  eventCount?: number
  lastEventAt?: string | null
  [key: string]: unknown
}

export interface DebugRunsResponse {
  runs: DebugRunSummary[]
  source: 'postgres' | 'memory'
}

export interface RunEvent {
  id: string
  runId: string
  sessionId: string | null
  seq: number
  eventType: string
  payload: Record<string, unknown>
  createdAt: string
}

export interface DebugRunEventsResponse {
  runId: string
  events: RunEvent[]
  source: 'postgres' | 'memory'
}

export interface SessionLiveResponse {
  live: boolean
  runId: string | null
}

export interface SearchResponse {
  query: string
  results: SearchResult[]
}

export interface McpListResponse {
  servers: McpServer[]
  states: Record<string, unknown>
}

export interface ApiTokenListResponse {
  tokens: ApiToken[]
}

/** DB-backed index document (recall / indexer). */
export interface JarvisIndexDocument {
  id: string
  sourceType: string
  sourceId: string
  path: string | null
  title: string | null
  contentHash: string | null
  mimeType: string | null
  sizeBytes: number | null
  mtime: string | null
  sessionId: string | null
  runId: string | null
  userId: string | null
  actionId: string | null
  tags: unknown
  metadata: Record<string, unknown>
  deletedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface JarvisIndexChunk {
  id: string
  documentId: string
  chunkIndex: number
  content: string
  tokenEstimate: number
  lineStart: number | null
  lineEnd: number | null
  metadata: Record<string, unknown>
  createdAt: string
}

export interface IndexJob {
  id: string
  sourceType: string
  sourceId: string
  operation: string
  actionId: string | null
  sessionId: string | null
  runId: string | null
  userId: string | null
  metadata: Record<string, unknown>
  priority: number
  status: string
  attempts: number
  lastError: string | null
  lockedAt: string | null
  nextAttemptAt: string
  createdAt: string
  updatedAt: string
}

export interface SettingRow {
  key: string
  value: unknown
  sessionId: string | null
  createdAt: string
  updatedAt: string
}

// ---------------------------------------------------------------------------
// Kanban (ported from hermes-agent kanban domain model)
// ---------------------------------------------------------------------------

export type KanbanTaskStatus =
  | 'triage'
  | 'todo'
  | 'ready'
  | 'running'
  | 'blocked'
  | 'done'
  | 'archived'

export type KanbanBlockKind = 'dependency' | 'needs_input' | 'capability' | 'transient'

export interface KanbanTask {
  id: string
  title: string
  body: string | null
  status: KanbanTaskStatus
  priority: number
  assignee: string | null
  createdBy: string | null
  blockKind: KanbanBlockKind | null
  blockReason: string | null
  result: string | null
  summary: string | null
  metadata: Record<string, unknown>
  sessionId: string | null
  runId: string | null
  createdAt: string
  updatedAt: string
  startedAt: string | null
  completedAt: string | null
  /** Populated when the task is fetched with relations. */
  parentIds?: string[]
  childIds?: string[]
  comments?: KanbanTaskComment[]
}

export interface KanbanTaskComment {
  id: string
  taskId: string
  author: string
  body: string
  createdAt: string
}

export interface KanbanTaskLink {
  id: string
  parentId: string
  childId: string
  createdAt: string
}

export interface KanbanListResponse {
  tasks: KanbanTask[]
  total: number
}

export interface KanbanStatusCounts {
  triage: number
  todo: number
  ready: number
  running: number
  blocked: number
  done: number
  archived: number
}
