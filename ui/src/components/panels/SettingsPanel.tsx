import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { useSettingsStore } from '@app/stores/settings'
import { McpSubPanel } from '@app/components/panels/McpSubPanel'
import { DebugReplayPanel } from '@app/components/panels/DebugReplayPanel'
import {
  fetchApprovalConfig,
  saveApprovalConfig,
  type ApprovalConfig,
} from '@app/lib/agui/client'
import { apiClient } from '@app/lib/api'
import { useUiStore } from '@app/stores/ui'
import { Moon, Sun, Monitor, ShieldCheck, X, Download } from 'lucide-react'
import { EmptyState } from '@app/components/common/EmptyState'
import { Skeleton } from '@app/components/common/Skeleton'
import { labelTitle, modelLabel } from '@app/lib/display-names'
import { toolLabel } from '@app/lib/labels'
import type { CoworkSetupResponse } from '@hermes/shared'

export function SettingsPanel() {
  const [tab, setTab] = useState<'general' | 'approval' | 'mcp' | 'debug'>('general')
  const theme = useSettingsStore((s) => s.theme)
  const setTheme = useSettingsStore((s) => s.setTheme)
  const model = useSettingsStore((s) => s.model)
  const setModel = useSettingsStore((s) => s.setModel)
  const llmBaseUrl = useSettingsStore((s) => s.llmBaseUrl)
  const setLlmBaseUrl = useSettingsStore((s) => s.setLlmBaseUrl)
  const llmApiKey = useSettingsStore((s) => s.llmApiKey)
  const setLlmApiKey = useSettingsStore((s) => s.setLlmApiKey)
  const embeddingsModel = useSettingsStore((s) => s.embeddingsModel)
  const setEmbeddingsModel = useSettingsStore((s) => s.setEmbeddingsModel)
  const workspaceRoot = useSettingsStore((s) => s.workspaceRoot)
  const setWorkspaceRoot = useSettingsStore((s) => s.setWorkspaceRoot)
  const setDefaultProfileId = useSettingsStore((s) => s.setDefaultProfileId)
  const addToast = useUiStore((s) => s.addToast)
  const queryClient = useQueryClient()

  const [approval, setApproval] = useState<ApprovalConfig | null>(null)
  const [approvalLoading, setApprovalLoading] = useState(false)
  const [apiKeyDraft, setApiKeyDraft] = useState('')

  const {
    data: remoteSettings,
    isLoading: settingsLoading,
    isError: settingsError,
    refetch,
  } = useQuery({
    queryKey: ['settings'],
    queryFn: async () => {
      const all = await apiClient.get<Record<string, unknown>>('/api/settings')
      if (typeof all.llm_base_url === 'string') setLlmBaseUrl(all.llm_base_url)
      if (typeof all.embeddings_model === 'string') setEmbeddingsModel(all.embeddings_model)
      if (typeof all.workspace_root === 'string') setWorkspaceRoot(all.workspace_root)
      if (typeof all.model === 'string') setModel(all.model)
      if (typeof all.default_profile_id === 'string') setDefaultProfileId(all.default_profile_id)
      if (all.llm_api_key_set === true || typeof all.llm_api_key === 'string') {
        setLlmApiKey(typeof all.llm_api_key === 'string' ? all.llm_api_key : '••••set')
      }
      return all
    },
    retry: false,
  })

  const { data: coworkSetup } = useQuery({
    queryKey: ['cowork-setup'],
    queryFn: () => apiClient.get<CoworkSetupResponse>('/api/cowork/setup'),
    retry: false,
    staleTime: 30_000,
  })

  const saveSettings = useMutation({
    mutationFn: () =>
      apiClient.put('/api/settings', {
        llm_base_url: llmBaseUrl,
        embeddings_model: embeddingsModel,
        workspace_root: workspaceRoot,
        model,
        ...(apiKeyDraft && !apiKeyDraft.startsWith('••••')
          ? { llm_api_key: apiKeyDraft }
          : {}),
      }),
    onSuccess: () => {
      setApiKeyDraft('')
      addToast({ title: 'Settings saved', variant: 'success' })
      void queryClient.invalidateQueries({ queryKey: ['workspace-tree'] })
      void queryClient.invalidateQueries({ queryKey: ['workspace-git'] })
      void queryClient.invalidateQueries({ queryKey: ['workspace-file'] })
      void refetch()
    },
    onError: () => addToast({ title: 'Save failed', variant: 'danger' }),
  })

  const exportData = useMutation({
    mutationFn: () => apiClient.get<Record<string, unknown>>('/api/settings/export'),
    onSuccess: (data) => {
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `open-jarvis-export-${new Date().toISOString().slice(0, 10)}.json`
      a.click()
      URL.revokeObjectURL(url)
      addToast({ title: 'Export downloaded', variant: 'success' })
    },
    onError: () => addToast({ title: 'Export failed', variant: 'danger' }),
  })

  useEffect(() => {
    if (tab !== 'approval') return
    setApprovalLoading(true)
    fetchApprovalConfig()
      .then(setApproval)
      .catch(() => setApproval(null))
      .finally(() => setApprovalLoading(false))
  }, [tab])

  const toggleAutoApprove = async (autoApproveAll: boolean) => {
    const next = await saveApprovalConfig({ autoApproveAll })
    setApproval(next)
  }

  const removeWhitelistedTool = async (toolName: string) => {
    if (!approval) return
    const next = await saveApprovalConfig({
      toolWhitelist: approval.toolWhitelist.filter((t) => t !== toolName),
    })
    setApproval(next)
  }

  return (
    <div className="p-4">
      <h2 className="mb-4 text-sm font-medium text-fg">Settings</h2>
      <div className="mb-4 flex gap-1 border-b border-border" role="tablist" aria-label="Settings sections">
        {(
          [
            ['general', 'General'],
            ['approval', 'Approval'],
            ['mcp', 'Connections'],
            ['debug', 'Debug'],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
            className={`px-3 py-1.5 text-xs ${
              tab === id
                ? 'border-b-2 border-accent text-accent'
                : 'text-fg-muted hover:text-fg'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'mcp' ? (
        <McpSubPanel />
      ) : tab === 'debug' ? (
        <DebugReplayPanel />
      ) : tab === 'approval' ? (
        <div className="space-y-4 text-sm">
          <section className="rounded-lg border border-border p-3">
            <label className="flex cursor-pointer items-start gap-3">
              <input
                type="checkbox"
                checked={approval?.autoApproveAll ?? false}
                disabled={approvalLoading || !approval}
                onChange={(e) => void toggleAutoApprove(e.target.checked)}
                className="mt-0.5"
              />
              <span>
                <span className="flex items-center gap-1 font-medium text-fg">
                  <ShieldCheck size={14} className="text-success" />
                  Auto-approve all dangerous tools
                </span>
                <span className="mt-0.5 block text-xs text-fg-muted">
                  Skip approval prompts for run_shell, write_file, and other dangerous tools.
                </span>
              </span>
            </label>
          </section>

          <section>
            <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-fg-muted">
              Whitelisted tools
            </h3>
            {approvalLoading ? (
              <p className="text-xs text-fg-muted">Loading…</p>
            ) : approval?.toolWhitelist.length ? (
              <ul className="space-y-1">
                {approval.toolWhitelist.map((tool) => {
                  const toolDisplay = toolLabel(tool)
                  return (
                  <li
                    key={tool}
                    className="flex items-center justify-between rounded border border-border px-2 py-1 text-xs"
                  >
                    <span title={labelTitle(tool, toolDisplay)}>{toolDisplay}</span>
                    <button
                      type="button"
                      onClick={() => void removeWhitelistedTool(tool)}
                      className="text-fg-muted hover:text-danger"
                      aria-label={`Remove ${toolDisplay}`}
                    >
                      <X size={12} />
                    </button>
                  </li>
                  )
                })}
              </ul>
            ) : (
              <p className="text-xs text-fg-muted">
                No tools whitelisted. Use &quot;Always allow&quot; on an approval prompt, or add
                tools here after approving once.
              </p>
            )}
          </section>

          {approval?.sessionWhitelist.length ? (
            <section>
              <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-fg-muted">
                Sessions with always-allow ({approval.sessionWhitelist.length})
              </h3>
              <p className="text-xs text-fg-muted">
                Cleared when you restart the server unless persisted via approval prompts.
              </p>
            </section>
          ) : null}
        </div>
      ) : settingsLoading ? (
        <Skeleton className="h-32 w-full" />
      ) : settingsError ? (
        <EmptyState
          title="Could not load settings"
          description="Open Jarvis could not reach /api/settings. Local theme still works."
          action={
            <button type="button" onClick={() => void refetch()} className="text-xs text-accent">
              Retry
            </button>
          }
        />
      ) : (
        <div className="space-y-4 text-sm">
          <section>
            <label className="mb-2 block text-xs text-fg-muted">Theme</label>
            <div className="flex gap-2">
              {(
                [
                  { id: 'dark' as const, icon: Moon, label: 'Dark' },
                  { id: 'dim' as const, icon: Monitor, label: 'Dim' },
                  { id: 'light' as const, icon: Sun, label: 'Light' },
                ] as const
              ).map(({ id, icon: Icon, label }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setTheme(id)}
                  className={`flex items-center gap-1 rounded border px-3 py-1.5 text-xs ${
                    theme === id
                      ? 'border-accent bg-accent-muted text-accent'
                      : 'border-border text-fg hover:bg-canvas-subtle'
                  }`}
                >
                  <Icon size={14} /> {label}
                </button>
              ))}
            </div>
          </section>

          <section>
            <label className="mb-1 block text-xs text-fg-muted">Model</label>
            <input
              type="text"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              className="w-full rounded border border-border bg-canvas px-3 py-1.5 font-mono text-sm text-fg"
              title={model}
            />
            {model.trim() ? (
              <p className="mt-1 text-[10px] text-fg-subtle" title={model}>
                Display: {modelLabel(model)}
              </p>
            ) : null}
          </section>

          <section>
            <label className="mb-1 block text-xs text-fg-muted">LLM base URL</label>
            <input
              type="url"
              value={llmBaseUrl}
              onChange={(e) => setLlmBaseUrl(e.target.value)}
              placeholder="https://api.openai.com/v1"
              className="w-full rounded border border-border bg-canvas px-3 py-1.5 text-fg"
            />
          </section>

          <section>
            <label className="mb-1 block text-xs text-fg-muted">LLM API key (masked)</label>
            <input
              type="password"
              value={apiKeyDraft || (llmApiKey.startsWith('••••') ? llmApiKey : '')}
              onChange={(e) => setApiKeyDraft(e.target.value)}
              placeholder={llmApiKey ? '•••••••• (leave blank to keep)' : 'sk-…'}
              className="w-full rounded border border-border bg-canvas px-3 py-1.5 text-fg"
              autoComplete="off"
            />
          </section>

          <section>
            <label className="mb-1 block text-xs text-fg-muted">Embeddings model</label>
            <input
              type="text"
              value={embeddingsModel}
              onChange={(e) => setEmbeddingsModel(e.target.value)}
              placeholder="text-embedding-3-small"
              className="w-full rounded border border-border bg-canvas px-3 py-1.5 font-mono text-sm text-fg"
              title={embeddingsModel}
            />
            {embeddingsModel.trim() ? (
              <p className="mt-1 text-[10px] text-fg-subtle" title={embeddingsModel}>
                Display: {modelLabel(embeddingsModel)}
              </p>
            ) : null}
          </section>

          <section>
            <label className="mb-1 block text-xs text-fg-muted">Workspace root</label>
            <input
              type="text"
              value={workspaceRoot}
              onChange={(e) => setWorkspaceRoot(e.target.value)}
              placeholder="C:\path\to\workspace or ./workspace"
              className="w-full rounded border border-border bg-canvas px-3 py-1.5 text-fg"
            />
            <p className="mt-1 text-[10px] text-fg-subtle">
              Defaults to <span className="font-mono">HERMES_DATA_DIR/workspace</span> per host
              (fleet deploy: set only <span className="font-mono">HERMES_DATA_DIR</span> in env).
              Click Save to server after changing — no API restart needed unless{' '}
              <span className="font-mono">WORKSPACE_ROOT</span> is set in env (env wins).
            </p>
          </section>

          <section
            className="rounded-lg border border-border p-3"
            data-testid="settings-cowork-status"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-xs font-medium text-fg">Open Cowork</p>
                <p className="mt-0.5 text-[11px] text-fg-muted">
                  Local desktop jobs for Office / Work requests
                </p>
              </div>
              <div className="flex items-center gap-2 text-xs">
                {coworkSetup?.configured ? (
                  <span className="text-success">Ready</span>
                ) : (
                  <span className="text-attention">Not configured</span>
                )}
                <Link
                  to="/panel/$name"
                  params={{ name: 'cowork' }}
                  className="text-accent hover:underline"
                >
                  Setup
                </Link>
              </div>
            </div>
          </section>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => saveSettings.mutate()}
              disabled={saveSettings.isPending}
              className="rounded bg-accent px-3 py-1.5 text-xs text-white"
            >
              Save to server
            </button>
            <button
              type="button"
              onClick={() => exportData.mutate()}
              disabled={exportData.isPending}
              className="inline-flex items-center gap-1 rounded border border-border px-3 py-1.5 text-xs text-fg hover:bg-canvas-subtle"
            >
              <Download size={12} /> Export data
            </button>
          </div>
          {remoteSettings && (
            <p className="text-[10px] text-fg-subtle">
              Server keys: {Object.keys(remoteSettings).length} loaded
            </p>
          )}
        </div>
      )}
    </div>
  )
}
