/**
 * Open Jarvis — MCP Connections console (enterprise settings UX).
 * Author: Dinesh Reddy Meka
 *
 * Density pattern: GitHub Settings / Vercel Integrations / GCP console —
 * header → health metrics → toolbar → table → expand detail.
 */
import { useMemo, useState, type ReactNode } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ChevronDown,
  ChevronRight,
  Globe,
  Loader2,
  Plus,
  Plug,
  RefreshCw,
  Search,
  Terminal,
  Trash2,
  X,
} from 'lucide-react'
import { apiClient } from '@app/lib/api'
import {
  createHermesMcpServer,
  deleteHermesMcpServer,
  fetchHermesMcpServers,
  hermesMcpCreateBody,
  hermesMcpNextToolWhitelist,
  setHermesMcpServerEnabled,
  setHermesMcpServerTools,
  testHermesMcpServer,
  type HermesMcpLiveState,
} from '@app/lib/hermes-adapters'
import { useUiStore } from '@app/stores/ui'
import { formatRelativeTime } from '@app/lib/utils'
import { labelTitle } from '@app/lib/display-names'
import {
  connectionStatusLabel,
  mcpEventTypeLabel,
  toolLabel,
  transportKindLabel,
} from '@app/lib/labels'
import type { McpConnectionEvent, McpServer } from '@hermes/shared'
import { EmptyState } from '@app/components/common/EmptyState'
import { Skeleton } from '@app/components/common/Skeleton'

/** Curated “best option” presets — create via existing /api/mcp/servers + mcp_servers DB. */
type McpPreset = {
  id: string
  badge: 'Best for local' | 'Best for remote' | 'Recommended'
  title: string
  description: string
  transport: 'stdio' | 'http'
  name: string
  command?: string
  url?: string
  httpPreferSse?: boolean
  autoReconnect?: boolean
  timeoutMs?: number
}

const BEST_MCP_PRESETS: McpPreset[] = [
  {
    id: 'filesystem',
    badge: 'Best for local',
    title: 'Filesystem',
    description: 'Read/write workspace files via stdio MCP (official server).',
    transport: 'stdio',
    name: 'filesystem',
    command: 'npx -y @modelcontextprotocol/server-filesystem .',
    autoReconnect: true,
    timeoutMs: 60_000,
  },
  {
    id: 'memory',
    badge: 'Recommended',
    title: 'Memory',
    description: 'Persistent knowledge graph memory for the agent.',
    transport: 'stdio',
    name: 'memory',
    command: 'npx -y @modelcontextprotocol/server-memory',
    autoReconnect: true,
    timeoutMs: 60_000,
  },
  {
    id: 'http-remote',
    badge: 'Best for remote',
    title: 'HTTP / SSE remote',
    description: 'Streamable HTTP first, SSE fallback — best option for remote MCP.',
    transport: 'http',
    name: 'remote-mcp',
    url: 'http://127.0.0.1:3921/mcp',
    httpPreferSse: false,
    autoReconnect: true,
    timeoutMs: 30_000,
  },
  {
    id: 'chrome-mock',
    badge: 'Recommended',
    title: 'Chrome research (mock)',
    description: 'Local mock Chrome MCP for document research Connect/Test flows.',
    transport: 'http',
    name: 'chrome-mock',
    // Matches server/scripts/mock-mcp-chrome.ts default MOCK_MCP_CHROME_PORT
    url: 'http://127.0.0.1:3922/mcp',
    httpPreferSse: false,
    autoReconnect: true,
    timeoutMs: 30_000,
  },
]

function presetCreateBody(preset: McpPreset) {
  return hermesMcpCreateBody({
    name: preset.name,
    transport: preset.transport,
    command: preset.transport === 'stdio' ? (preset.command ?? null) : null,
    url: preset.transport === 'http' ? (preset.url ?? null) : null,
  })
}

function toastFromCreatedServer(
  server: McpServer,
  addToast: (t: { title: string; description?: string; variant?: 'default' | 'success' | 'danger' | 'attention' }) => void,
) {
  if (server.lastStatus === 'connected') {
    addToast({
      title: `${server.name} connected`,
      description: 'Saved to mcp_servers and ready to use.',
      variant: 'success',
    })
    return
  }
  if (server.lastStatus === 'error' || server.lastStatus === 'reconnecting') {
    addToast({
      title: `${server.name} saved — connect pending`,
      description: server.lastError ?? 'Server row persisted; start the MCP endpoint and hit Connect.',
      variant: 'attention',
    })
    return
  }
  addToast({
    title: `${server.name} added`,
    description: 'Persisted to mcp_servers.',
    variant: 'success',
  })
}

type McpState = HermesMcpLiveState
type StatusFilter = 'all' | 'connected' | 'error' | 'disconnected' | 'disabled'
type ResolvedStatus = ReturnType<typeof resolveStatus>

function resolveStatus(server: McpServer, state?: McpState) {
  if (!server.enabled) return 'disabled' as const
  if (state) return state.status
  if (server.lastStatus) return server.lastStatus
  return 'unknown' as const
}

/** Live discovery wins; otherwise last-known cache from DB. */
function resolveDiscovery(server: McpServer, state?: McpState) {
  const liveTools = state?.tools ?? []
  if (liveTools.length > 0) {
    return {
      tools: liveTools,
      resources: state?.resources ?? [],
      prompts: state?.prompts ?? [],
      fromCache: false as const,
    }
  }
  return {
    tools: (server.discoveredTools ?? []).map((t) => t.name),
    resources: (server.discoveredResources ?? []).map((r) => r.uri || r.name || ''),
    prompts: (server.discoveredPrompts ?? []).map((p) => p.name),
    fromCache: true as const,
  }
}

function StatusBadge({ status }: { status: ResolvedStatus }) {
  const styles =
    status === 'connected'
      ? 'bg-[color-mix(in_srgb,var(--hermes-success)_18%,transparent)] text-success'
      : status === 'error'
        ? 'bg-[color-mix(in_srgb,var(--hermes-danger)_18%,transparent)] text-danger'
        : status === 'reconnecting'
          ? 'bg-[color-mix(in_srgb,var(--hermes-attention)_18%,transparent)] text-attention'
          : 'bg-canvas-subtle text-fg-muted'
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium ${styles}`}
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${
          status === 'connected'
            ? 'bg-success'
            : status === 'error'
              ? 'bg-danger'
              : status === 'reconnecting'
                ? 'animate-pulse bg-attention'
                : 'bg-fg-subtle'
        }`}
      />
      {connectionStatusLabel(status)}
    </span>
  )
}

/** Horizontal connectivity pipeline — Enabled → Transport → Linked → Ready */
function ConnectivityPipeline({
  server,
  status,
  toolCount,
}: {
  server: McpServer
  status: ResolvedStatus
  toolCount: number
}) {
  const steps = [
    {
      key: 'enabled',
      label: 'Enabled',
      ok: server.enabled,
      fail: false,
      active: false,
    },
    {
      key: 'transport',
      label: server.transport === 'stdio' ? 'Stdio' : 'HTTP/SSE',
      ok: Boolean(server.command || server.url),
      fail: false,
      active: false,
    },
    {
      key: 'link',
      label: 'Linked',
      ok: status === 'connected',
      fail: status === 'error',
      active: status === 'reconnecting',
    },
    {
      key: 'ready',
      label: 'Ready',
      ok: toolCount > 0 && (status === 'connected' || status === 'disconnected'),
      fail: false,
      active: status === 'connected' && toolCount === 0,
    },
  ]

  return (
    <div className="mt-3 flex items-center gap-0" aria-label="Connectivity workflow">
      {steps.map((step, i) => (
        <div key={step.key} className="flex min-w-0 flex-1 items-center">
          <div className="flex min-w-0 flex-1 flex-col items-center gap-1">
            <div
              className={`flex h-6 w-6 items-center justify-center rounded-full border text-[10px] font-semibold ${
                step.fail
                  ? 'border-danger bg-danger/10 text-danger'
                  : step.ok
                    ? 'border-success bg-success/10 text-success'
                    : step.active
                      ? 'border-attention bg-attention/10 text-attention'
                      : 'border-border bg-canvas text-fg-subtle'
              }`}
            >
              {step.active ? (
                <Loader2 size={11} className="animate-spin" />
              ) : step.fail ? (
                '!'
              ) : step.ok ? (
                '✓'
              ) : (
                i + 1
              )}
            </div>
            <span className="truncate text-[10px] text-fg-muted">{step.label}</span>
          </div>
          {i < steps.length - 1 ? (
            <div
              className={`mb-4 h-px w-full min-w-3 flex-1 ${
                steps[i]!.ok && !steps[i]!.fail ? 'bg-success/50' : 'bg-border'
              }`}
            />
          ) : null}
        </div>
      ))}
    </div>
  )
}

function WorkflowLegend() {
  const steps = ['Enabled', 'Transport', 'Linked', 'Ready'] as const
  return (
    <div className="mt-3 flex flex-wrap items-center gap-1.5 text-[11px] text-fg-muted">
      <span className="mr-1 font-medium tracking-wide text-fg-subtle uppercase">Workflow</span>
      {steps.map((label, i) => (
        <span key={label} className="inline-flex items-center gap-1.5">
          {i > 0 ? <span className="text-fg-subtle">→</span> : null}
          <span className="inline-flex items-center gap-1 rounded border border-border bg-canvas-subtle px-1.5 py-0.5 font-medium text-fg-muted">
            <span className="flex h-3.5 w-3.5 items-center justify-center rounded-full border border-border text-[8px] tabular-nums">
              {i + 1}
            </span>
            {label}
          </span>
        </span>
      ))}
      <span className="ml-1 text-fg-subtle">(tools discovered)</span>
    </div>
  )
}

/** Curated Best options — one click creates + connects via /api/mcp/servers → mcp_servers. */
function BestMcpOptions({
  existingNames,
  creatingId,
  onAdd,
}: {
  existingNames: Set<string>
  creatingId: string | null
  onAdd: (preset: McpPreset) => void
}) {
  return (
    <section aria-label="Best MCP options" className="space-y-2">
      <div className="flex items-baseline justify-between gap-3">
        <div>
          <h4 className="text-sm font-semibold text-fg">Best options</h4>
          <p className="mt-0.5 text-xs text-fg-muted">
            One click creates the server in Postgres and attempts connect. Events land in
            `mcp_connection_events`.
          </p>
        </div>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {BEST_MCP_PRESETS.map((preset) => {
          const Icon = preset.transport === 'stdio' ? Terminal : Globe
          const already = existingNames.has(preset.name)
          const busy = creatingId === preset.id
          return (
            <button
              key={preset.id}
              type="button"
              disabled={already || busy || creatingId != null}
              onClick={() => onAdd(preset)}
              className="rounded-lg border border-border p-3 text-left transition-colors hover:border-accent hover:bg-accent-muted/40 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <div className="flex items-start justify-between gap-2">
                <Icon size={16} className="mt-0.5 shrink-0 text-fg-muted" />
                <span className="rounded border border-border bg-canvas-subtle px-1.5 py-0.5 text-[10px] font-medium tracking-wide text-fg-muted uppercase">
                  {already ? 'Added' : busy ? 'Adding…' : preset.badge}
                </span>
              </div>
              <p className="mt-2 text-sm font-medium text-fg">{preset.title}</p>
              <p className="mt-0.5 text-[11px] leading-relaxed text-fg-muted">{preset.description}</p>
              <p className="mt-2 truncate font-mono text-[10px] text-fg-subtle">
                {preset.transport === 'stdio' ? preset.command : preset.url}
              </p>
            </button>
          )
        })}
      </div>
    </section>
  )
}

export function McpSubPanel({ embedded = false }: { embedded?: boolean }) {
  const addToast = useUiStore((s) => s.addToast)
  const queryClient = useQueryClient()
  const [showForm, setShowForm] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [testResult, setTestResult] = useState<Record<string, McpState>>({})
  const [creatingPresetId, setCreatingPresetId] = useState<string | null>(null)

  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ['mcp-servers'],
    queryFn: fetchHermesMcpServers,
    retry: false,
    refetchInterval: (q) => {
      const states = q.state.data?.states ?? []
      const servers = q.state.data?.servers ?? []
      const liveReconnect = states.some((s) => s.status === 'reconnecting')
      const persistedReconnect = servers.some(
        (s) => s.enabled && s.lastStatus === 'reconnecting',
      )
      return liveReconnect || persistedReconnect ? 2000 : 10_000
    },
  })

  const servers = data?.servers ?? []
  const states = data?.states ?? []

  const enriched = useMemo(() => {
    const statesById = new Map(states.map((s) => [s.serverId, s]))
    return servers.map((server) => {
      const state = testResult[server.id] ?? statesById.get(server.id)
      const discovery = resolveDiscovery(server, state)
      return {
        server,
        state,
        status: resolveStatus(server, state),
        discovery,
        errorText: state?.error ?? server.lastError ?? null,
      }
    })
  }, [servers, states, testResult])

  const counts = useMemo(() => {
    const c = { connected: 0, error: 0, offline: 0, disabled: 0, other: 0 }
    for (const { status } of enriched) {
      if (status === 'connected') c.connected++
      else if (status === 'error' || status === 'reconnecting') c.error++
      else if (status === 'disabled') c.disabled++
      else if (status === 'disconnected') c.offline++
      else c.other++
    }
    return c
  }, [enriched])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return enriched.filter(({ server, discovery, status }) => {
      if (statusFilter === 'connected' && status !== 'connected') return false
      if (statusFilter === 'error' && status !== 'error' && status !== 'reconnecting') return false
      if (statusFilter === 'disconnected' && status !== 'disconnected' && status !== 'unknown')
        return false
      if (statusFilter === 'disabled' && status !== 'disabled') return false
      if (!q) return true
      const haystack = [
        server.name,
        server.description,
        server.transport,
        server.command,
        server.url,
        status,
        connectionStatusLabel(status),
        ...discovery.tools,
        ...discovery.resources,
        ...discovery.prompts,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      return haystack.includes(q)
    })
  }, [enriched, query, statusFilter])

  const toggle = useMutation({
    mutationFn: (server: McpServer) =>
      setHermesMcpServerEnabled(server.name, !server.enabled),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['mcp-servers'] }),
    onError: () => addToast({ title: 'Update failed', variant: 'danger' }),
  })

  const remove = useMutation({
    mutationFn: (id: string) => deleteHermesMcpServer(id),
    onSuccess: () => {
      addToast({ title: 'Server removed', variant: 'success' })
      void queryClient.invalidateQueries({ queryKey: ['mcp-servers'] })
    },
    onError: () => addToast({ title: 'Delete failed', variant: 'danger' }),
  })

  const test = useMutation({
    mutationFn: (id: string) => testHermesMcpServer(id),
    onSuccess: (res) => {
      setTestResult((m) => ({ ...m, [res.state.serverId]: res.state }))
      addToast({
        title: res.state.status === 'connected' ? 'Connected' : 'Connection issue',
        description: res.state.error ?? res.server?.lastError ?? undefined,
        variant: res.state.status === 'connected' ? 'success' : 'attention',
      })
      void queryClient.invalidateQueries({ queryKey: ['mcp-servers'] })
      void queryClient.invalidateQueries({ queryKey: ['mcp-events', res.state.serverId] })
    },
    onError: () => addToast({ title: 'Connect failed', variant: 'danger' }),
  })

  const toggleTool = useMutation({
    mutationFn: ({
      server,
      tool,
      allTools,
    }: {
      server: McpServer
      tool: string
      allTools: string[]
    }) => {
      const next = hermesMcpNextToolWhitelist(server.toolWhitelist, tool, allTools)
      return setHermesMcpServerTools(server.name, next)
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['mcp-servers'] }),
  })

  const addBestOption = useMutation({
    mutationFn: async (preset: McpPreset) => {
      setCreatingPresetId(preset.id)
      return createHermesMcpServer(presetCreateBody(preset))
    },
    onSuccess: (server) => {
      toastFromCreatedServer(server, addToast)
      void queryClient.invalidateQueries({ queryKey: ['mcp-servers'] })
      void queryClient.invalidateQueries({ queryKey: ['mcp-events', server.id] })
      setExpandedId(server.id)
    },
    onError: (err) => {
      addToast({
        title: 'Could not add Best option',
        description: err instanceof Error ? err.message : undefined,
        variant: 'danger',
      })
    },
    onSettled: () => setCreatingPresetId(null),
  })

  if (isLoading) return <Skeleton className={embedded ? 'h-32 w-full' : 'h-48 w-full'} />
  if (isError) {
    return (
      <EmptyState
        title="Unable to load connections"
        description={error instanceof Error ? error.message : 'Server unreachable.'}
        action={
          <button type="button" onClick={() => void refetch()} className="text-xs text-accent">
            Retry
          </button>
        }
      />
    )
  }

  const existingNames = new Set(servers.map((s) => s.name))

  const metricCards = [
    {
      id: 'connected' as const,
      label: 'Connected',
      value: counts.connected,
      tone: 'text-success',
      filter: 'connected' as StatusFilter,
    },
    {
      id: 'error' as const,
      label: 'Issues',
      value: counts.error,
      tone: 'text-danger',
      filter: 'error' as StatusFilter,
    },
    {
      id: 'offline' as const,
      label: 'Offline',
      value: counts.offline + counts.other,
      tone: 'text-fg-muted',
      filter: 'disconnected' as StatusFilter,
    },
    {
      id: 'disabled' as const,
      label: 'Disabled',
      value: counts.disabled,
      tone: 'text-fg-subtle',
      filter: 'disabled' as StatusFilter,
    },
  ]

  return (
    <div className={embedded ? 'space-y-4' : 'mx-auto max-w-4xl space-y-4'}>
      {!embedded ? (
        <div className="border-b border-border pb-4">
          <div className="flex items-end justify-between gap-4">
            <div className="min-w-0">
              <h3 className="text-base font-semibold tracking-tight text-fg">Connections</h3>
              <p className="mt-1 max-w-2xl text-xs leading-relaxed text-fg-muted">
                Model Context Protocol servers for Open Jarvis. Manage transport, health, and tool
                allowlists from one console.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowForm(true)}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-xs font-semibold text-white"
            >
              <Plus size={14} strokeWidth={2.5} />
              Add server
            </button>
          </div>
          <WorkflowLegend />
        </div>
      ) : (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => setShowForm(true)}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-xs font-semibold text-white"
          >
            <Plus size={14} strokeWidth={2.5} />
            Add server
          </button>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" role="group" aria-label="Health metrics">
        {metricCards.map((m) => {
          const active = statusFilter === m.filter
          return (
            <button
              key={m.id}
              type="button"
              onClick={() => setStatusFilter(active ? 'all' : m.filter)}
              aria-pressed={active}
              className={`rounded-md border px-3 py-2 text-left transition-colors ${
                active
                  ? 'border-accent bg-accent-muted'
                  : 'border-border bg-canvas-subtle hover:border-fg-subtle'
              }`}
            >
              <p className="text-[10px] font-medium tracking-wide text-fg-muted uppercase">
                {m.label}
              </p>
              <p className={`mt-0.5 text-xl font-semibold tabular-nums ${m.tone}`}>{m.value}</p>
            </button>
          )
        })}
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative min-w-0 flex-1">
          <Search
            size={14}
            className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-fg-subtle"
            aria-hidden
          />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name, transport, URL, command, tools…"
            aria-label="Search connections"
            className="h-9 w-full rounded-md border border-border bg-canvas pr-3 pl-9 text-sm text-fg placeholder:text-fg-subtle focus:border-accent focus:outline-none"
          />
        </div>
        <div
          className="flex items-center gap-1 overflow-x-auto"
          role="toolbar"
          aria-label="Status filters"
        >
          {(
            [
              ['all', 'All'],
              ['connected', 'Connected'],
              ['error', 'Issues'],
              ['disconnected', 'Offline'],
              ['disabled', 'Disabled'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setStatusFilter(id)}
              aria-pressed={statusFilter === id}
              className={`h-8 shrink-0 rounded-md px-2.5 text-xs font-medium ${
                statusFilter === id
                  ? 'bg-canvas-subtle text-fg ring-1 ring-border'
                  : 'text-fg-muted hover:text-fg'
              }`}
            >
              {label}
            </button>
          ))}
          <button
            type="button"
            onClick={() => void refetch()}
            className="ml-1 inline-flex h-8 w-8 items-center justify-center rounded-md text-fg-muted hover:bg-canvas-subtle hover:text-fg"
            title="Refresh"
            aria-label="Refresh connections"
          >
            <RefreshCw size={14} className={isFetching ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {servers.length > 0 ? (
        <p className="text-[11px] text-fg-subtle">
          Showing {filtered.length} of {servers.length} server{servers.length === 1 ? '' : 's'}
        </p>
      ) : null}

      <BestMcpOptions
        existingNames={existingNames}
        creatingId={creatingPresetId}
        onAdd={(preset) => addBestOption.mutate(preset)}
      />

      {showForm ? (
        <McpServerForm
          onCancel={() => setShowForm(false)}
          onSaved={(server) => {
            setShowForm(false)
            toastFromCreatedServer(server, addToast)
            void queryClient.invalidateQueries({ queryKey: ['mcp-servers'] })
            void queryClient.invalidateQueries({ queryKey: ['mcp-events', server.id] })
            setExpandedId(server.id)
          }}
        />
      ) : null}

      {!servers.length ? (
        <EmptyState
          icon={<Plug size={28} strokeWidth={1.5} />}
          title="No MCP servers"
          description="Pick a Best option above or add a custom stdio / HTTP-SSE server. Connection status and discovered tools persist in Postgres (mcp_servers + mcp_connection_events)."
          action={
            <button
              type="button"
              onClick={() => setShowForm(true)}
              className="inline-flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-xs font-semibold text-white"
            >
              <Plus size={14} strokeWidth={2.5} />
              Add server
            </button>
          }
          className="rounded-lg border border-dashed border-border"
        />
      ) : !filtered.length ? (
        <EmptyState
          title="No matches"
          description="Adjust search or status filters."
          action={
            <button
              type="button"
              onClick={() => {
                setQuery('')
                setStatusFilter('all')
              }}
              className="text-xs text-accent hover:underline"
            >
              Clear filters
            </button>
          }
        />
      ) : (
        <div className="overflow-hidden rounded-lg border border-border">
          <div className="hidden grid-cols-[minmax(0,1.6fr)_100px_108px_auto] gap-3 border-b border-border bg-canvas-subtle px-3 py-1.5 text-[10px] font-semibold tracking-wide text-fg-muted uppercase sm:grid">
            <span>Server</span>
            <span>Transport</span>
            <span>Status</span>
            <span className="text-right">Actions</span>
          </div>
          <ul className="divide-y divide-border">
            {filtered.map(({ server, state, status, discovery, errorText }) => {
              const open = expandedId === server.id
              const { tools, resources, prompts, fromCache } = discovery
              const busy = test.isPending && test.variables === server.id
              const allowed = server.toolWhitelist?.length ?? 0
              return (
                <li key={server.id} className="bg-canvas">
                  <div className="grid grid-cols-1 gap-2 px-3 py-2.5 sm:grid-cols-[minmax(0,1.6fr)_100px_108px_auto] sm:items-center sm:gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setExpandedId(open ? null : server.id)}
                          className="shrink-0 text-fg-muted hover:text-fg"
                          aria-expanded={open}
                          aria-controls={`mcp-detail-${server.id}`}
                          aria-label={open ? `Collapse ${server.name}` : `Expand ${server.name}`}
                        >
                          {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                        </button>
                        {server.transport === 'stdio' ? (
                          <Terminal size={14} className="shrink-0 text-fg-muted" aria-hidden />
                        ) : (
                          <Globe size={14} className="shrink-0 text-fg-muted" aria-hidden />
                        )}
                        <span className="truncate text-sm font-medium text-fg">{server.name}</span>
                        {tools.length > 0 ? (
                          <span className="shrink-0 rounded border border-border px-1.5 py-0.5 text-[10px] tabular-nums text-fg-subtle">
                            {allowed}/{tools.length} tools
                            {fromCache && status !== 'connected' ? ' · cached' : ''}
                          </span>
                        ) : null}
                      </div>
                      {server.description ? (
                        <p className="mt-0.5 truncate pl-6 text-[11px] text-fg-muted">
                          {server.description}
                        </p>
                      ) : null}
                      <p className="mt-0.5 truncate pl-6 font-mono text-[11px] text-fg-subtle">
                        {server.command ?? server.url ?? '—'}
                      </p>
                    </div>
                    <div className="pl-6 text-xs text-fg-muted sm:pl-0">
                      <span
                        className="rounded border border-border px-1.5 py-0.5 text-[10px]"
                        title={
                          state?.transportKind ??
                          (server.transport === 'http' && server.httpPreferSse
                            ? 'sse'
                            : server.transport)
                        }
                      >
                        {transportKindLabel(
                          state?.transportKind ??
                            (server.transport === 'http' && server.httpPreferSse
                              ? 'sse'
                              : server.transport),
                        )}
                      </span>
                    </div>
                    <div className="pl-6 sm:pl-0">
                      <StatusBadge status={status} />
                    </div>
                    <div className="flex flex-wrap items-center justify-end gap-1 pl-6 sm:pl-0">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => {
                          // Test endpoint enables if needed; avoid racing a parallel PATCH.
                          test.mutate(server.id)
                        }}
                        className="h-7 rounded-md border border-border px-2 text-[11px] font-medium text-fg hover:bg-canvas-subtle disabled:opacity-50"
                      >
                        {busy ? 'Connecting…' : status === 'connected' ? 'Reconnect' : 'Connect'}
                      </button>
                      <button
                        type="button"
                        onClick={() => toggle.mutate(server)}
                        className="h-7 rounded-md border border-border px-2 text-[11px] text-fg-muted hover:bg-canvas-subtle hover:text-fg"
                      >
                        {server.enabled ? 'Disable' : 'Enable'}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (confirm(`Remove “${server.name}”?`)) remove.mutate(server.id)
                        }}
                        className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-border text-fg-muted hover:border-danger/40 hover:text-danger"
                        title="Remove"
                        aria-label={`Remove ${server.name}`}
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>

                  {open ? (
                    <div
                      id={`mcp-detail-${server.id}`}
                      className="border-t border-border bg-canvas-subtle px-4 py-4"
                    >
                      <ConnectivityPipeline
                        server={server}
                        status={status}
                        toolCount={tools.length}
                      />

                      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-fg-subtle">
                        {server.lastConnectedAt ? (
                          <span>Last connected {formatRelativeTime(server.lastConnectedAt)}</span>
                        ) : null}
                        {server.lastTestedAt ? (
                          <span>Last tested {formatRelativeTime(server.lastTestedAt)}</span>
                        ) : null}
                        {server.timeoutMs != null ? (
                          <span>Timeout {server.timeoutMs}ms</span>
                        ) : null}
                        <span>{server.autoReconnect ? 'Auto-reconnect on' : 'Auto-reconnect off'}</span>
                        {fromCache && tools.length > 0 && status !== 'connected' ? (
                          <span className="text-attention">Showing last-known discovery</span>
                        ) : null}
                      </div>

                      {errorText ? (
                        <p
                          role="alert"
                          className="mt-3 rounded-md border border-danger/30 bg-danger/5 px-3 py-2 text-xs text-danger"
                        >
                          {errorText}
                        </p>
                      ) : null}

                      <div className="mt-4 grid gap-3 md:grid-cols-3">
                        <DetailColumn
                          title={`Tools (${tools.length})`}
                          empty="Connect to discover tools."
                          hint="Check to allowlist for agent use"
                        >
                          {tools.map((tool) => {
                            const on =
                              server.toolWhitelist == null
                                ? true
                                : server.toolWhitelist.includes(tool)
                            const toolDisplay = toolLabel(tool)
                            return (
                              <label
                                key={tool}
                                className="flex cursor-pointer items-center gap-2 truncate py-0.5 text-xs hover:text-fg"
                              >
                                <input
                                  type="checkbox"
                                  checked={on}
                                  onChange={() =>
                                    toggleTool.mutate({ server, tool, allTools: tools })
                                  }
                                />
                                <span
                                  className="truncate text-fg-muted"
                                  title={labelTitle(tool, toolDisplay)}
                                >
                                  {toolDisplay}
                                </span>
                                <span className="ml-auto shrink-0 text-[10px] text-fg-subtle">
                                  {on ? 'Allowed' : 'Blocked'}
                                </span>
                              </label>
                            )
                          })}
                        </DetailColumn>
                        <DetailColumn
                          title={`Resources (${resources.length})`}
                          empty="None discovered"
                        >
                          {resources.map((r) => (
                            <p key={r} className="truncate font-mono text-xs text-fg-muted">
                              {r}
                            </p>
                          ))}
                        </DetailColumn>
                        <DetailColumn title={`Prompts (${prompts.length})`} empty="None discovered">
                          {prompts.map((p) => (
                            <p key={p} className="truncate font-mono text-xs text-fg-muted">
                              {p}
                            </p>
                          ))}
                        </DetailColumn>
                      </div>

                      <RecentEvents serverId={server.id} />
                    </div>
                  ) : null}
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </div>
  )
}

function RecentEvents({ serverId }: { serverId: string }) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['mcp-events', serverId],
    queryFn: () =>
      apiClient.get<{ events: McpConnectionEvent[] }>(`/api/mcp/servers/${serverId}/events`),
    retry: false,
  })

  const events = (data?.events ?? []).slice(0, 8)

  return (
    <div className="mt-4">
      <p className="mb-1.5 text-[10px] font-semibold tracking-wide text-fg-muted uppercase">
        Recent events
      </p>
      <div className="max-h-36 overflow-y-auto rounded-md border border-border bg-canvas">
        {isLoading ? (
          <p className="px-3 py-2 text-xs text-fg-subtle">Loading events…</p>
        ) : isError ? (
          <p className="px-3 py-2 text-xs text-fg-subtle">Unable to load events.</p>
        ) : !events.length ? (
          <p className="px-3 py-2 text-xs text-fg-subtle">No connection events yet.</p>
        ) : (
          <ul className="divide-y divide-border">
            {events.map((ev) => {
              const eventDisplay = mcpEventTypeLabel(ev.eventType)
              const statusDisplay = ev.status ? connectionStatusLabel(ev.status) : null
              const transportDisplay = ev.transportKind
                ? transportKindLabel(ev.transportKind)
                : null
              return (
              <li
                key={ev.id}
                className="flex items-start justify-between gap-3 px-3 py-1.5 text-[11px]"
              >
                <div className="min-w-0">
                  <span className="font-medium text-fg" title={ev.eventType}>
                    {eventDisplay}
                  </span>
                  {statusDisplay ? (
                    <span className="ml-1.5 text-fg-muted" title={ev.status ?? undefined}>
                      · {statusDisplay}
                    </span>
                  ) : null}
                  {transportDisplay ? (
                    <span className="ml-1.5 text-fg-subtle" title={ev.transportKind ?? undefined}>
                      {transportDisplay}
                    </span>
                  ) : null}
                  {typeof ev.detail?.error === 'string' && ev.detail.error ? (
                    <p className="mt-0.5 truncate text-danger">{ev.detail.error}</p>
                  ) : null}
                </div>
                <span className="shrink-0 tabular-nums text-fg-subtle">
                  {formatRelativeTime(ev.createdAt)}
                </span>
              </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}

function DetailColumn({
  title,
  empty,
  hint,
  children,
}: {
  title: string
  empty: string
  hint?: string
  children: ReactNode
}) {
  const has = Array.isArray(children) ? children.length > 0 : Boolean(children)
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <p className="text-[10px] font-semibold tracking-wide text-fg-muted uppercase">{title}</p>
        {hint && has ? <p className="truncate text-[10px] text-fg-subtle">{hint}</p> : null}
      </div>
      <div className="max-h-44 space-y-0.5 overflow-y-auto rounded-md border border-border bg-canvas p-2">
        {has ? children : <p className="text-xs text-fg-subtle">{empty}</p>}
      </div>
    </div>
  )
}

function McpServerForm({
  onSaved,
  onCancel,
}: {
  onSaved: (server: McpServer) => void
  onCancel: () => void
}) {
  const addToast = useUiStore((s) => s.addToast)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [transport, setTransport] = useState<'stdio' | 'http'>('stdio')
  const [command, setCommand] = useState('')
  const [url, setUrl] = useState('')
  const [envText, setEnvText] = useState('')
  const [headersText, setHeadersText] = useState('')
  const [httpPreferSse, setHttpPreferSse] = useState(false)
  const [timeoutMs, setTimeoutMs] = useState('')
  const [autoReconnect, setAutoReconnect] = useState(true)
  const [saving, setSaving] = useState(false)

  const save = async () => {
    let env: Record<string, string> | null = null
    let headers: Record<string, string> | null = null
    try {
      if (envText.trim()) env = JSON.parse(envText) as Record<string, string>
      if (headersText.trim()) headers = JSON.parse(headersText) as Record<string, string>
    } catch {
      addToast({ title: 'env/headers must be valid JSON', variant: 'danger' })
      return
    }
    const timeout =
      timeoutMs.trim() === '' ? null : Number.parseInt(timeoutMs.trim(), 10)
    if (timeoutMs.trim() && (Number.isNaN(timeout) || timeout! < 0)) {
      addToast({ title: 'Timeout must be a non-negative number (ms)', variant: 'danger' })
      return
    }
    setSaving(true)
    try {
      const server = await createHermesMcpServer(
        hermesMcpCreateBody({
          name: name.trim(),
          transport,
          command: transport === 'stdio' ? command : null,
          url: transport === 'http' ? url : null,
          env,
        }),
      )
      onSaved(server)
    } catch (err) {
      addToast({
        title: 'Save failed',
        description: err instanceof Error ? err.message : undefined,
        variant: 'danger',
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="rounded-lg border border-border bg-canvas shadow-[var(--hermes-shadow)]">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div>
          <p className="text-sm font-semibold text-fg">Add MCP server</p>
          <p className="text-xs text-fg-muted">
            Choose connectivity for Open Jarvis, then create and connect.
          </p>
        </div>
        <button
          type="button"
          onClick={onCancel}
          className="text-fg-muted hover:text-fg"
          aria-label="Close form"
        >
          <X size={16} />
        </button>
      </div>
      <div className="space-y-4 p-4">
        <fieldset>
          <legend className="mb-2 text-[11px] font-medium text-fg-muted">Connectivity</legend>
          <div className="grid grid-cols-2 gap-2">
            {(
              [
                {
                  id: 'stdio' as const,
                  title: 'Stdio',
                  desc: 'Local process via command',
                  Icon: Terminal,
                },
                {
                  id: 'http' as const,
                  title: 'HTTP / SSE',
                  desc: 'Remote (streamable → SSE fallback)',
                  Icon: Globe,
                },
              ] as const
            ).map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setTransport(opt.id)}
                aria-pressed={transport === opt.id}
                className={`rounded-lg border p-3 text-left transition-colors ${
                  transport === opt.id
                    ? 'border-accent bg-accent-muted'
                    : 'border-border hover:border-fg-subtle'
                }`}
              >
                <opt.Icon
                  size={16}
                  className={transport === opt.id ? 'text-accent' : 'text-fg-muted'}
                />
                <p className="mt-2 text-sm font-medium text-fg">{opt.title}</p>
                <p className="mt-0.5 text-[11px] text-fg-muted">{opt.desc}</p>
              </button>
            ))}
          </div>
        </fieldset>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block space-y-1.5">
            <span className="text-[11px] font-medium text-fg-muted">Display name</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="h-9 w-full rounded-md border border-border bg-canvas px-3 text-sm"
              placeholder="filesystem"
              autoFocus
            />
          </label>
          <label className="block space-y-1.5">
            <span className="text-[11px] font-medium text-fg-muted">Description</span>
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="h-9 w-full rounded-md border border-border bg-canvas px-3 text-sm"
              placeholder="Optional notes for this connection"
            />
          </label>
        </div>

        {transport === 'stdio' ? (
          <label className="block space-y-1.5">
            <span className="text-[11px] font-medium text-fg-muted">Command</span>
            <input
              value={command}
              onChange={(e) => setCommand(e.target.value)}
              className="h-9 w-full rounded-md border border-border bg-canvas px-3 font-mono text-xs"
              placeholder="npx -y @modelcontextprotocol/server-filesystem ."
            />
          </label>
        ) : (
          <label className="block space-y-1.5">
            <span className="text-[11px] font-medium text-fg-muted">URL</span>
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              className="h-9 w-full rounded-md border border-border bg-canvas px-3 font-mono text-xs"
              placeholder="http://127.0.0.1:3921/mcp (or :3922 for chrome mock)"
            />
            <span className="text-[10px] text-fg-subtle">
              Streamable HTTP is tried first; SSE is the fallback. Optional auth via Headers JSON.
            </span>
          </label>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block space-y-1.5">
            <span className="text-[11px] font-medium text-fg-muted">Environment (JSON)</span>
            <textarea
              value={envText}
              onChange={(e) => setEnvText(e.target.value)}
              rows={2}
              className="w-full rounded-md border border-border bg-canvas px-3 py-2 font-mono text-xs"
              placeholder='{"KEY":"value"}'
            />
          </label>
          <label className="block space-y-1.5">
            <span className="text-[11px] font-medium text-fg-muted">Headers (JSON)</span>
            <textarea
              value={headersText}
              onChange={(e) => setHeadersText(e.target.value)}
              rows={2}
              className="w-full rounded-md border border-border bg-canvas px-3 py-2 font-mono text-xs"
              placeholder='{"Authorization":"Bearer …"}'
              disabled={transport === 'stdio'}
            />
            {transport === 'stdio' ? (
              <span className="text-[10px] text-fg-subtle">HTTP/SSE only</span>
            ) : null}
          </label>
        </div>

        <fieldset className="rounded-md border border-border px-3 py-3">
          <legend className="px-1 text-[11px] font-medium text-fg-muted">Connection options</legend>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block space-y-1.5">
              <span className="text-[11px] font-medium text-fg-muted">Timeout (ms)</span>
              <input
                type="number"
                min={0}
                inputMode="numeric"
                value={timeoutMs}
                onChange={(e) => setTimeoutMs(e.target.value)}
                className="h-9 w-full rounded-md border border-border bg-canvas px-3 font-mono text-xs"
                placeholder="Default"
              />
            </label>
            <div className="flex flex-col justify-end gap-2 pb-0.5">
              <label className="flex cursor-pointer items-center gap-2 text-xs text-fg">
                <input
                  type="checkbox"
                  checked={autoReconnect}
                  onChange={(e) => setAutoReconnect(e.target.checked)}
                />
                Auto-reconnect on failure
              </label>
              {transport === 'http' ? (
                <label className="flex cursor-pointer items-center gap-2 text-xs text-fg">
                  <input
                    type="checkbox"
                    checked={httpPreferSse}
                    onChange={(e) => setHttpPreferSse(e.target.checked)}
                  />
                  Prefer SSE over streamable HTTP
                </label>
              ) : null}
            </div>
          </div>
        </fieldset>
      </div>
      <div className="flex justify-end gap-2 border-t border-border px-4 py-3">
        <button
          type="button"
          onClick={onCancel}
          className="h-8 rounded-md border border-border px-3 text-xs text-fg-muted"
        >
          Cancel
        </button>
        <button
          type="button"
          disabled={
            saving || !name.trim() || (transport === 'stdio' ? !command.trim() : !url.trim())
          }
          onClick={() => void save()}
          className="h-8 rounded-md bg-accent px-3 text-xs font-semibold text-white disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Create connection'}
        </button>
      </div>
    </div>
  )
}
