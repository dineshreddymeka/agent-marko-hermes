/**
 * Open Jarvis — Capabilities hub (MCP, Cowork, skills, agent tools).
 * Author: Dinesh Reddy Meka
 */
import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, ChevronDown, ChevronRight, ExternalLink, Info, RefreshCw } from 'lucide-react'
import { McpSubPanel } from '@app/components/panels/McpSubPanel'
import { EmptyState } from '@app/components/common/EmptyState'
import { Skeleton } from '@app/components/common/Skeleton'
import { apiClient, ApiError } from '@app/lib/api'
import { descopedFeatureMessage } from '@app/lib/hermes-adapters'
import {
  CAPABILITIES_QUERY_KEY,
  isAgentLlmDegraded,
  isCapabilitiesManifestUnavailable,
  useCapabilities,
  warmCapabilities,
} from '@app/hooks/useCapabilities'
import { skillSourceLabel } from '@app/lib/labels'
import { useUiStore } from '@app/stores/ui'
import type { CapabilitySkillEntry, CapabilitiesResponse, CoworkSetupResponse } from '@hermes/shared'

function SectionHeading({ title, description }: { title: string; description?: string }) {
  return (
    <div className="border-b border-border pb-2">
      <h3 className="text-sm font-semibold text-fg">{title}</h3>
      {description ? (
        <p className="mt-0.5 text-xs leading-relaxed text-fg-muted">{description}</p>
      ) : null}
    </div>
  )
}

function ManifestNotice({ message }: { message: string }) {
  return (
    <div
      className="flex gap-2 rounded-md border border-border bg-canvas-subtle px-3 py-2 text-xs text-fg-muted"
      role="status"
    >
      <Info size={14} className="mt-0.5 shrink-0" aria-hidden />
      <p>{message}</p>
    </div>
  )
}

function PluginsOverview({ plugins }: { plugins: CapabilitiesResponse['plugins'] }) {
  if (plugins.length === 0) return null

  const healthy = (status: string) =>
    status === 'connected' || status === 'ready' || status === 'configured'

  return (
    <div className="flex flex-wrap gap-2">
      {plugins.map((plugin) => (
        <span
          key={plugin.id}
          className="inline-flex items-center gap-1.5 rounded-full border border-border bg-canvas-subtle px-2 py-0.5 text-[11px] text-fg"
          title={`${plugin.kind} · ${plugin.status}`}
        >
          <span
            className={`h-1.5 w-1.5 rounded-full ${
              healthy(plugin.status)
                ? 'bg-success'
                : plugin.status === 'degraded'
                  ? 'bg-attention'
                  : 'bg-attention'
            }`}
          />
          <span className="font-medium">{plugin.name}</span>
          <span className="text-fg-muted">{plugin.status}</span>
          <span className="text-fg-muted">
            {plugin.toolCount} tool{plugin.toolCount === 1 ? '' : 's'}
          </span>
        </span>
      ))}
    </div>
  )
}

function CoworkSection() {
  const { data: setup, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['cowork-setup'],
    queryFn: () => apiClient.get<CoworkSetupResponse>('/api/cowork/setup'),
    staleTime: 30_000,
    retry: false,
  })

  const descoped =
    isError && error instanceof ApiError && (error.status === 404 || error.status === 501)

  if (isLoading) return <Skeleton className="h-16 w-full" />
  if (descoped) {
    return <ManifestNotice message={descopedFeatureMessage('Cowork')} />
  }
  if (isError) {
    return (
      <EmptyState
        title="Could not load Cowork status"
        description={error instanceof Error ? error.message : 'Server unreachable.'}
        action={
          <button type="button" onClick={() => void refetch()} className="text-xs text-accent">
            Retry
          </button>
        }
      />
    )
  }

  const ready = setup?.configured && setup.exeExists && setup.headlessSupported !== false
  const bridge = setup?.mcpBridge
  const bridgeReady =
    bridge?.readiness === 'connected' || bridge?.readiness === 'configured'

  return (
    <div className="space-y-2 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium ${
            ready
              ? 'bg-[color-mix(in_srgb,var(--hermes-success)_18%,transparent)] text-success'
              : 'bg-[color-mix(in_srgb,var(--hermes-attention)_18%,transparent)] text-attention'
          }`}
        >
          <span
            className={`h-1.5 w-1.5 rounded-full ${ready ? 'bg-success' : 'bg-attention'}`}
          />
          {ready ? 'Configured' : setup?.exeExists ? 'Needs setup' : 'Not configured'}
        </span>
        {setup?.exe ? (
          <code className="max-w-full truncate text-xs text-fg-muted" title={setup.exe}>
            {setup.exe}
          </code>
        ) : null}
      </div>
      {bridge ? (
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium ${
              bridgeReady
                ? 'bg-[color-mix(in_srgb,var(--hermes-success)_18%,transparent)] text-success'
                : 'bg-[color-mix(in_srgb,var(--hermes-attention)_18%,transparent)] text-attention'
            }`}
            title={bridge.hint}
          >
            <span
              className={`h-1.5 w-1.5 rounded-full ${bridgeReady ? 'bg-success' : 'bg-attention'}`}
            />
            MCP bridge: {bridge.readiness.replace(/_/g, ' ')}
          </span>
        </div>
      ) : null}
      {setup?.hint && !ready ? <p className="text-xs text-fg-muted">{setup.hint}</p> : null}
      {bridge?.hint && !bridgeReady ? (
        <p className="text-xs text-fg-muted">{bridge.hint}</p>
      ) : null}
      <Link
        to="/panel/$name"
        params={{ name: 'office' }}
        className="inline-flex items-center gap-1 text-xs text-accent hover:underline"
      >
        Open Office panel for Cowork setup
        <ExternalLink size={12} aria-hidden />
      </Link>
    </div>
  )
}

function SkillsSection({
  skills,
  loading,
  unavailable,
}: {
  skills: CapabilitySkillEntry[]
  loading: boolean
  unavailable: boolean
}) {
  if (loading) return <Skeleton className="h-14 w-full" />

  if (unavailable) {
    return (
      <EmptyState
        title="Skills summary unavailable"
        description="The capability manifest is not loaded yet. Open the Skills panel to manage skills."
      />
    )
  }

  if (skills.length === 0) {
    return (
      <EmptyState
        title="No skills loaded"
        description="Register skills under the Skills panel or sync from disk."
      />
    )
  }

  return (
    <div className="space-y-2 text-sm">
      <p className="text-xs text-fg-muted">
        {skills.length} skill{skills.length === 1 ? '' : 's'} available to the agent.
      </p>
      <ul className="space-y-1.5">
        {skills.map((skill) => (
          <li
            key={skill.id}
            className="flex flex-wrap items-center gap-2 rounded border border-border px-2 py-1.5"
          >
            <span className="min-w-0 truncate text-xs font-medium text-fg" title={skill.name}>
              {skill.name}
            </span>
            <span
              className="rounded bg-canvas-inset px-1.5 py-0.5 text-[10px] text-fg-muted"
              title={skill.source}
            >
              {skillSourceLabel(skill.source)}
            </span>
          </li>
        ))}
      </ul>
      <Link
        to="/panel/$name"
        params={{ name: 'skills' }}
        className="inline-block text-xs text-accent hover:underline"
      >
        Manage skills
      </Link>
    </div>
  )
}

function AgentToolsSection({
  tools,
  loading,
  unavailable,
}: {
  tools: CapabilitiesResponse['tools']
  loading: boolean
  unavailable: boolean
}) {
  const [open, setOpen] = useState(false)

  if (loading) return <Skeleton className="h-10 w-full" />

  return (
    <div className="rounded-md border border-border">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-canvas-subtle"
        aria-expanded={open}
      >
        <span className="font-medium text-fg">
          Agent tools
          <span className="ml-2 text-xs font-normal text-fg-muted">({tools.length})</span>
        </span>
        {open ? (
          <ChevronDown size={14} className="shrink-0 text-fg-muted" aria-hidden />
        ) : (
          <ChevronRight size={14} className="shrink-0 text-fg-muted" aria-hidden />
        )}
      </button>
      {open ? (
        <ul className="max-h-64 space-y-1 overflow-y-auto border-t border-border px-3 py-2">
          {unavailable ? (
            <li className="text-xs text-fg-muted">Manifest not loaded — tool list unavailable.</li>
          ) : tools.length === 0 ? (
            <li className="text-xs text-fg-muted">No tools in manifest.</li>
          ) : (
            tools.map((tool) => (
              <li
                key={`${tool.source}:${tool.name}`}
                className="flex items-start justify-between gap-2 text-xs"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-mono text-fg" title={tool.name}>
                    {tool.name}
                  </span>
                  {tool.description ? (
                    <span className="mt-0.5 line-clamp-2 text-[10px] text-fg-muted">
                      {tool.description}
                    </span>
                  ) : null}
                </span>
                <span className="flex shrink-0 items-center gap-1.5">
                  <span className="rounded bg-canvas-inset px-1.5 py-0.5 text-[10px] text-fg-muted uppercase">
                    {tool.source}
                  </span>
                  {!tool.trusted ? (
                    <span className="rounded bg-canvas-subtle px-1.5 py-0.5 text-[10px] text-fg-muted">
                      untrusted
                    </span>
                  ) : null}
                  {tool.dangerous ? (
                    <span className="rounded bg-[color-mix(in_srgb,var(--hermes-danger)_18%,transparent)] px-1.5 py-0.5 text-[10px] font-medium text-danger">
                      dangerous
                    </span>
                  ) : null}
                </span>
              </li>
            ))
          )}
        </ul>
      ) : null}
    </div>
  )
}

export function ConnectionsPanel() {
  const queryClient = useQueryClient()
  const addToast = useUiStore((s) => s.addToast)
  const [warming, setWarming] = useState(false)
  const {
    data: capabilities,
    isLoading,
    isError,
    error,
    refetch,
    isFetched,
  } = useCapabilities()
  const manifestUnavailable = isCapabilitiesManifestUnavailable(
    capabilities,
    isFetched,
    isError,
  )
  const degraded = capabilities ? isAgentLlmDegraded(capabilities.agentLlm) : false

  const onWarm = async () => {
    setWarming(true)
    try {
      const result = await warmCapabilities()
      await queryClient.invalidateQueries({ queryKey: CAPABILITIES_QUERY_KEY })
      const mcpNote = result.mcpReconnect
        ? result.mcpReconnect.ok
          ? 'MCP reconnected'
          : `MCP reconnect failed${result.mcpReconnect.error ? `: ${result.mcpReconnect.error}` : ''}`
        : 'Manifest refreshed'
      const routeNote = result.agentLlm.degraded
        ? 'agent route degraded'
        : 'agent route healthy'
      addToast({
        title: 'Capabilities warmed',
        description: `${mcpNote}; ${routeNote}; ${result.slashCommands} slash command(s).`,
        variant: 'success',
      })
    } catch (err) {
      addToast({
        title: 'Warm failed',
        description: err instanceof Error ? err.message : 'Could not warm capabilities.',
        variant: 'danger',
      })
    } finally {
      setWarming(false)
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="border-b border-border pb-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold tracking-tight text-fg">Capabilities</h3>
            <p className="mt-1 max-w-2xl text-xs leading-relaxed text-fg-muted">
              MCP servers, Cowork, skills, and agent tools available to Open Jarvis.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void onWarm()}
            disabled={warming}
            className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs text-fg hover:bg-bg-muted disabled:opacity-60"
          >
            <RefreshCw size={12} className={warming ? 'animate-spin' : undefined} aria-hidden />
            {warming ? 'Warming…' : 'Warm MCP + probe'}
          </button>
        </div>
        {capabilities?.plugins?.length ? (
          <div className="mt-3">
            <PluginsOverview plugins={capabilities.plugins} />
          </div>
        ) : null}
      </div>

      {isLoading ? <Skeleton className="h-12 w-full" /> : null}

      {manifestUnavailable ? (
        <ManifestNotice message="Capability manifest is not available yet (/api/capabilities). The MCP section below still works; Cowork shows here only when the backend exposes /api/cowork/setup." />
      ) : null}

      {isError ? (
        <EmptyState
          title="Could not load capabilities"
          description={error instanceof Error ? error.message : 'Server unreachable.'}
          action={
            <button type="button" onClick={() => void refetch()} className="text-xs text-accent">
              Retry
            </button>
          }
        />
      ) : null}

      {capabilities && degraded ? (
        <div
          className="flex gap-2 rounded-md border border-[color-mix(in_srgb,var(--hermes-attention)_40%,transparent)] bg-[color-mix(in_srgb,var(--hermes-attention)_10%,transparent)] px-3 py-2 text-xs text-fg"
          role="alert"
        >
          <AlertTriangle size={14} className="mt-0.5 shrink-0 text-attention" aria-hidden />
          <div>
            <p className="font-medium text-fg">Agent tools unavailable</p>
            <p className="mt-0.5 text-fg-muted">
              The agent LLM route is degraded
              {capabilities.agentLlm.lastFailure
                ? `: ${capabilities.agentLlm.lastFailure}`
                : ' (chat-only bridge or unhealthy agent endpoint).'}
              Tool calls may fail until a tool-capable endpoint is configured.
            </p>
          </div>
        </div>
      ) : null}

      <section className="space-y-3">
        <SectionHeading
          title="MCP servers"
          description="Model Context Protocol connections and tool allowlists."
        />
        <McpSubPanel embedded />
      </section>

      <section className="space-y-3">
        <SectionHeading
          title="Cowork"
          description="Open Cowork.exe for document work requests."
        />
        <CoworkSection />
      </section>

      <section className="space-y-3">
        <SectionHeading title="Skills" description="Registered agent skills." />
        <SkillsSection
          skills={capabilities?.skills ?? []}
          loading={isLoading}
          unavailable={manifestUnavailable || (isError && !capabilities)}
        />
      </section>

      <section className="space-y-3">
        <SectionHeading title="Agent tools" description="Tools offered to the LLM." />
        <AgentToolsSection
          tools={capabilities?.tools ?? []}
          loading={isLoading}
          unavailable={manifestUnavailable || (isError && !capabilities)}
        />
      </section>
    </div>
  )
}
