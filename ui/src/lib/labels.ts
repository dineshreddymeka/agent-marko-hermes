/**
 * Display-only label maps for enums, tool names, and status values.
 */

import { prettifyIdentifier } from '@app/lib/display-names'
import type { PanelName } from '@app/stores/ui'

const PANEL_LABELS: Record<PanelName, string> = {
  sessions: 'Sessions',
  workspace: 'Workspace',
  skills: 'Skills',
  memory: 'Memory',
  connections: 'MCP',
  office: 'Office',
  briefing: 'Briefing',
  cron: 'Cowork',
  kanban: 'Kanban',
  profiles: 'Profiles',
  settings: 'Settings',
}

/** Short nav labels where rail/mobile space is tight. */
const PANEL_NAV_LABELS: Partial<Record<PanelName, string>> = {
  connections: 'MCP',
  cron: 'Cowork',
}

/** URL segment aliases → canonical panel id (e.g. /panel/cowork → cron). */
export const PANEL_ROUTE_ALIASES: Record<string, PanelName> = {
  cowork: 'cron',
  tasks: 'cron',
  scheduled: 'cron',
  mcp: 'connections',
  /** Briefly / Microsoft Graph screen lives under Office → Briefing */
  briefly: 'office',
  briefing: 'office',
  board: 'kanban',
}

function prettifySnakeCase(value: string): string {
  return prettifyIdentifier(value.replace(/:/g, '/'))
}

const TOOL_LABELS: Record<string, string> = {
  run_shell: 'Run shell command',
  read_file: 'Read file',
  write_file: 'Write file',
  document_form_show: 'Document request form',
  list_dir: 'List directory',
  run_code: 'Run code',
  memory_save: 'Save memory',
  memory_search: 'Search memory',
  skill_save: 'Save skill',
  skill_search: 'Search skills',
  web_search: 'Web search',
  fetch_url: 'Fetch URL',
  a2ui_render: 'Render UI',
  cron_create: 'Create scheduled task',
  cron_list: 'List scheduled tasks',
  cron_delete: 'Delete scheduled task',
  delegate_to_agent: 'Delegate to agent',
  delegate_to_cowork: 'Delegate to Open Cowork',
  kanban_create: 'Create kanban task',
  kanban_list: 'List kanban tasks',
  kanban_show: 'Show kanban task',
  kanban_complete: 'Complete kanban task',
  kanban_block: 'Block kanban task',
  kanban_comment: 'Comment on kanban task',
}

const TOOL_CALL_STATUS_LABELS: Record<string, string> = {
  pending: 'Waiting',
  'streaming-args': 'Preparing',
  executing: 'Running',
  done: 'Done',
  error: 'Failed',
}

const CONNECTION_STATUS_LABELS: Record<string, string> = {
  connected: 'Connected',
  disconnected: 'Disconnected',
  error: 'Failed',
  reconnecting: 'Reconnecting',
  disabled: 'Disabled',
  unknown: 'Unknown',
  'never connected': 'Never connected',
}

const TRANSPORT_KIND_LABELS: Record<string, string> = {
  stdio: 'Stdio (local process)',
  sse: 'HTTP SSE',
  'streamable-http': 'Streamable HTTP',
  http: 'HTTP',
  'http_sse': 'HTTP SSE',
}

const MEMORY_KIND_LABELS: Record<string, string> = {
  semantic: 'Semantic',
  episodic: 'Episodic',
  preference: 'Preference',
}

const SKILL_SOURCE_LABELS: Record<string, string> = {
  builtin: 'Built-in',
  'user-folder': 'User folder',
  learned: 'Learned',
  'git:local': 'Git (local)',
}

const SKILL_STATUS_LABELS: Record<string, string> = {
  ready: 'Ready',
  enabled: 'Enabled',
  disabled: 'Disabled',
  missing: 'Missing on disk',
}

const PROFILE_PROVIDER_LABELS: Record<string, string> = {
  native: 'Native',
  'agui-remote': 'AG-UI remote',
  'hermes-python': 'Hermes Python',
}

const CRON_RUN_STATUS_LABELS: Record<string, string> = {
  running: 'Running',
  success: 'Succeeded',
  failed: 'Failed',
  cancelled: 'Cancelled',
  pending: 'Pending',
}

const COWORK_TASK_STATUS_LABELS: Record<string, string> = {
  queued: 'Queued',
  running: 'Running',
  done: 'Done',
  failed: 'Failed',
  aborted: 'Aborted',
}

const CRON_STEP_TYPE_LABELS: Record<string, string> = {
  skill: 'Skill',
  mcp: 'MCP tool',
  prompt: 'Prompt',
}

const KANBAN_TASK_STATUS_LABELS: Record<string, string> = {
  triage: 'Triage',
  todo: 'Todo',
  ready: 'Ready',
  running: 'Running',
  blocked: 'Blocked',
  done: 'Done',
  archived: 'Archived',
}

const MCP_EVENT_TYPE_LABELS: Record<string, string> = {
  connect: 'Connect',
  disconnect: 'Disconnect',
  reconnect: 'Reconnect',
  error: 'Error',
  discovery: 'Discovery',
  test: 'Test',
}

function mapLabel(map: Record<string, string>, value: string, fallback?: string): string {
  return map[value] ?? fallback ?? prettifySnakeCase(value)
}

/** Friendly tool name; supports `mcp:serverName/toolName` patterns. */
export function toolLabel(name: string): string {
  const trimmed = name.trim()
  if (!trimmed) return 'Tool'

  if (trimmed.startsWith('mcp:')) {
    const rest = trimmed.slice(4)
    const slash = rest.indexOf('/')
    if (slash >= 0) {
      const server = rest.slice(0, slash)
      const tool = rest.slice(slash + 1)
      return `${prettifySnakeCase(server)}: ${prettifySnakeCase(tool)}`
    }
  }

  return TOOL_LABELS[trimmed] ?? prettifySnakeCase(trimmed)
}

export function toolCallStatusLabel(status: string): string {
  return mapLabel(TOOL_CALL_STATUS_LABELS, status)
}

export function connectionStatusLabel(status: string | null | undefined): string {
  if (!status) return CONNECTION_STATUS_LABELS['never connected']!
  return mapLabel(CONNECTION_STATUS_LABELS, status)
}

/** MCP server row status from enabled flag + last connection status. */
export function mcpServerStatusLabel(server: {
  enabled: boolean
  lastStatus?: string | null
}): string {
  if (!server.enabled) return connectionStatusLabel('disabled')
  return connectionStatusLabel(server.lastStatus)
}

export function transportKindLabel(kind: string): string {
  return mapLabel(TRANSPORT_KIND_LABELS, kind)
}

export function memoryKindLabel(kind: string): string {
  return mapLabel(MEMORY_KIND_LABELS, kind)
}

export function skillSourceLabel(source: string): string {
  if (source.startsWith('git:')) {
    const rest = source.slice(4)
    if (!rest || rest === 'local') return SKILL_SOURCE_LABELS['git:local']!
    return `Git: ${rest}`
  }
  return mapLabel(SKILL_SOURCE_LABELS, source)
}

export function skillStatusLabel(status: string): string {
  return mapLabel(SKILL_STATUS_LABELS, status)
}

export function profileProviderLabel(provider: string): string {
  return mapLabel(PROFILE_PROVIDER_LABELS, provider)
}

export function cronRunStatusLabel(status: string): string {
  return mapLabel(CRON_RUN_STATUS_LABELS, status)
}

/** Business-friendly status for Open Cowork work requests. */
export function coworkTaskStatusLabel(status: string): string {
  return mapLabel(COWORK_TASK_STATUS_LABELS, status)
}

export function cronWorkflowStepTypeLabel(type: string): string {
  return mapLabel(CRON_STEP_TYPE_LABELS, type)
}

export function kanbanTaskStatusLabel(status: string): string {
  return mapLabel(KANBAN_TASK_STATUS_LABELS, status)
}

export function mcpEventTypeLabel(eventType: string): string {
  return mapLabel(MCP_EVENT_TYPE_LABELS, eventType)
}

/** Panel title / heading (e.g. cron → Cowork). */
export function panelLabel(name: PanelName): string {
  return PANEL_LABELS[name] ?? prettifyIdentifier(name)
}

/** Compact rail/mobile label (e.g. cron → Cowork). */
export function panelNavLabel(name: PanelName): string {
  return PANEL_NAV_LABELS[name] ?? panelLabel(name)
}

/** Resolve `/panel/$name` route param to a canonical panel id. */
export function resolvePanelRoute(name: string): PanelName | null {
  if (name in PANEL_ROUTE_ALIASES) return PANEL_ROUTE_ALIASES[name]!
  if (name in PANEL_LABELS) return name as PanelName
  return null
}

/** Whether the pathname is the canonical or alias route for a panel. */
export function isPanelRouteActive(panel: PanelName, pathname: string): boolean {
  if (pathname === `/panel/${panel}`) return true
  // Office owns /panel/briefing and /panel/briefly
  if (panel === 'office' && (pathname === '/panel/briefing' || pathname === '/panel/briefly')) {
    return true
  }
  return Object.entries(PANEL_ROUTE_ALIASES).some(
    ([alias, target]) => target === panel && pathname === `/panel/${alias}`,
  )
}

// Export prettify for labels module tests
export { prettifySnakeCase as prettifyLabel }
