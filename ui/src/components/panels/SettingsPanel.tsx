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
import { useUiStore } from '@app/stores/ui'
import { Moon, Sun, Monitor, ShieldCheck, X } from 'lucide-react'
import { EmptyState } from '@app/components/common/EmptyState'
import { Skeleton } from '@app/components/common/Skeleton'
import { labelTitle, modelLabel } from '@app/lib/display-names'
import { toolLabel } from '@app/lib/labels'
import type { CoworkSetupResponse } from '@hermes/shared'
import {
  defaultString,
  loadHermesSettings,
  saveHermesGeneralSettings,
  schemaDescription,
} from '@app/lib/panels/settings-hermes'
import { apiClient } from '@app/lib/api'

export function SettingsPanel() {
  const [tab, setTab] = useState<'general' | 'approval' | 'mcp' | 'debug'>('general')
  const theme = useSettingsStore((s) => s.theme)
  const setTheme = useSettingsStore((s) => s.setTheme)
  const setModel = useSettingsStore((s) => s.setModel)
  const setLlmBaseUrl = useSettingsStore((s) => s.setLlmBaseUrl)
  const setLlmApiKey = useSettingsStore((s) => s.setLlmApiKey)
  const setWorkspaceRoot = useSettingsStore((s) => s.setWorkspaceRoot)
  const addToast = useUiStore((s) => s.addToast)
  const queryClient = useQueryClient()

  const [approval, setApproval] = useState<ApprovalConfig | null>(null)
  const [approvalLoading, setApprovalLoading] = useState(false)
  const [apiKeyDraft, setApiKeyDraft] = useState('')

  const [model, setModelDraft] = useState('')
  const [llmBaseUrl, setLlmBaseUrlDraft] = useState('')
  const [workspaceRoot, setWorkspaceRootDraft] = useState('')
  const [provider, setProvider] = useState('')
  const [apiKeyEnv, setApiKeyEnv] = useState<string | null>(null)
  const [baseUrlEnv, setBaseUrlEnv] = useState<string | null>(null)
  const [llmApiKey, setLlmApiKeyLocal] = useState('')
  const [configDraft, setConfigDraft] = useState<Record<string, unknown> | null>(null)

  const {
    data: hermesSettings,
    isLoading: settingsLoading,
    isError: settingsError,
    refetch,
  } = useQuery({
    queryKey: ['hermes-settings'],
    queryFn: loadHermesSettings,
    retry: false,
  })

  useEffect(() => {
    if (!hermesSettings) return
    setModelDraft(hermesSettings.model)
    setModel(hermesSettings.model)
    setLlmBaseUrlDraft(hermesSettings.baseUrl)
    setLlmBaseUrl(hermesSettings.baseUrl)
    setWorkspaceRootDraft(hermesSettings.workspaceCwd)
    setWorkspaceRoot(hermesSettings.workspaceCwd)
    setProvider(hermesSettings.provider)
    setApiKeyEnv(hermesSettings.apiKeyEnv)
    setBaseUrlEnv(hermesSettings.baseUrlEnv)
    setLlmApiKeyLocal(hermesSettings.apiKeyMasked)
    if (hermesSettings.apiKeyMasked) {
      setLlmApiKey(hermesSettings.apiKeyMasked)
    }
    setConfigDraft(hermesSettings.config)
    setApiKeyDraft('')
  }, [hermesSettings, setModel, setLlmBaseUrl, setWorkspaceRoot, setLlmApiKey])

  const { data: coworkSetup } = useQuery({
    queryKey: ['cowork-setup'],
    queryFn: () => apiClient.get<CoworkSetupResponse>('/api/cowork/setup'),
    retry: false,
    staleTime: 30_000,
    enabled: tab === 'general',
  })
  const showCowork = coworkSetup != null

  const saveSettings = useMutation({
    mutationFn: async () => {
      if (!configDraft) throw new Error('Settings not loaded')
      await saveHermesGeneralSettings({
        config: configDraft,
        provider,
        model,
        baseUrl: llmBaseUrl,
        workspaceCwd: workspaceRoot,
        apiKeyEnv,
        baseUrlEnv,
        apiKeyDraft,
      })
    },
    onSuccess: () => {
      setApiKeyDraft('')
      addToast({ title: 'Settings saved', variant: 'success' })
      void queryClient.invalidateQueries({ queryKey: ['workspace-tree'] })
      void queryClient.invalidateQueries({ queryKey: ['workspace-git'] })
      void queryClient.invalidateQueries({ queryKey: ['workspace-file'] })
      void queryClient.invalidateQueries({ queryKey: ['hermes-settings'] })
      void refetch()
    },
    onError: () => addToast({ title: 'Save failed', variant: 'danger' }),
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

  const modelHint =
    hermesSettings && schemaDescription(hermesSettings.schema, 'model')
  const cwdHint =
    hermesSettings && schemaDescription(hermesSettings.schema, 'terminal.cwd')
  const cwdDefault =
    hermesSettings && defaultString(hermesSettings.defaults, 'terminal.cwd')

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
          description="Hermes /api/config or /api/env is unavailable. Local theme still works."
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
            <p className="mt-1 text-[10px] text-fg-subtle">Stored locally in this browser only.</p>
          </section>

          <section>
            <label className="mb-1 block text-xs text-fg-muted">Model</label>
            <input
              type="text"
              value={model}
              onChange={(e) => {
                setModelDraft(e.target.value)
                setModel(e.target.value)
              }}
              placeholder={hermesSettings ? defaultString(hermesSettings.defaults, 'model') : ''}
              className="w-full rounded border border-border bg-canvas px-3 py-1.5 font-mono text-sm text-fg"
              title={model}
            />
            {modelHint ? (
              <p className="mt-1 text-[10px] text-fg-subtle">{modelHint}</p>
            ) : null}
            {model.trim() ? (
              <p className="mt-1 text-[10px] text-fg-subtle" title={model}>
                Display: {modelLabel(model)}
              </p>
            ) : null}
            {provider ? (
              <p className="mt-1 text-[10px] text-fg-subtle">
                Provider: <span className="font-mono">{provider}</span>
              </p>
            ) : null}
          </section>

          <section>
            <label className="mb-1 block text-xs text-fg-muted">LLM base URL</label>
            <input
              type="url"
              value={llmBaseUrl}
              onChange={(e) => {
                setLlmBaseUrlDraft(e.target.value)
                setLlmBaseUrl(e.target.value)
              }}
              placeholder="https://api.openai.com/v1"
              className="w-full rounded border border-border bg-canvas px-3 py-1.5 text-fg"
            />
            {baseUrlEnv ? (
              <p className="mt-1 text-[10px] text-fg-subtle">
                Saved to Hermes env <span className="font-mono">{baseUrlEnv}</span>
              </p>
            ) : (
              <p className="mt-1 text-[10px] text-fg-subtle">
                Saved to <span className="font-mono">config.yaml</span> model base URL when no env
                override applies.
              </p>
            )}
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
            {apiKeyEnv ? (
              <p className="mt-1 text-[10px] text-fg-subtle">
                Saved to Hermes env <span className="font-mono">{apiKeyEnv}</span>
              </p>
            ) : provider ? (
              <p className="mt-1 text-[10px] text-fg-subtle">
                No catalogued API-key env for provider <span className="font-mono">{provider}</span>
                — custom endpoints use config model credentials.
              </p>
            ) : null}
          </section>

          <section>
            <label className="mb-1 block text-xs text-fg-muted">Workspace root</label>
            <input
              type="text"
              value={workspaceRoot}
              onChange={(e) => {
                setWorkspaceRootDraft(e.target.value)
                setWorkspaceRoot(e.target.value)
              }}
              placeholder={cwdDefault || './workspace'}
              className="w-full rounded border border-border bg-canvas px-3 py-1.5 text-fg"
            />
            {cwdHint ? (
              <p className="mt-1 text-[10px] text-fg-subtle">{cwdHint}</p>
            ) : (
              <p className="mt-1 text-[10px] text-fg-subtle">
                Hermes <span className="font-mono">terminal.cwd</span> in config.yaml. Env{' '}
                <span className="font-mono">WORKSPACE_ROOT</span> wins when set.
              </p>
            )}
          </section>

          {showCowork ? (
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
                  {coworkSetup.configured ? (
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
          ) : null}

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => saveSettings.mutate()}
              disabled={saveSettings.isPending}
              className="rounded bg-accent px-3 py-1.5 text-xs text-white"
            >
              Save to server
            </button>
          </div>
          {hermesSettings ? (
            <p className="text-[10px] text-fg-subtle">
              Hermes config keys: {Object.keys(hermesSettings.config).length} · schema fields:{' '}
              {Object.keys(hermesSettings.schema).length}
            </p>
          ) : null}
        </div>
      )}
    </div>
  )
}
