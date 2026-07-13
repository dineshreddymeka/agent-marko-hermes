/**
 * Open Cowork — Work requests tab (document / productivity jobs).
 */
import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import { ChevronDown, Plus, RotateCcw, X } from 'lucide-react'
import { ApiError, apiClient } from '@app/lib/api'
import { useUiStore } from '@app/stores/ui'
import { EmptyState } from '@app/components/common/EmptyState'
import { Skeleton } from '@app/components/common/Skeleton'
import { formatRelativeTime } from '@app/lib/utils'
import { shortenId } from '@app/lib/display-names'
import { coworkTaskStatusLabel } from '@app/lib/labels'
import type { CoworkTaskListResponse, CoworkSetupResponse } from '@hermes/shared'
import {
  buildCoworkCreatePayload,
  COWORK_DELIVERABLE_PRESETS,
  coworkRetryFiles,
  coworkStatusPillClass,
  deliverableLabel,
  isCoworkTaskAbortable,
  shouldPollCoworkTaskDetail,
  shouldPollCoworkTasks,
  truncateGoalTitle,
  type CoworkDeliverableType,
  type CoworkTask,
  type CoworkTaskCreateResponse,
  type CoworkTaskDetail,
} from '@app/lib/panels/cowork-work'

const inputClass = 'w-full rounded border border-border bg-canvas px-2 py-1 text-sm text-fg'
const labelClass = 'block text-xs font-medium text-fg-muted'

function isCoworkApiMissing(err: unknown): boolean {
  return err instanceof ApiError && (err.status === 404 || err.status === 501)
}

function isCoworkExeMissing(err: unknown): boolean {
  if (!(err instanceof ApiError)) return false
  if (err.code === 'COWORK_EXE_MISSING') return true
  return /Open Cowork executable not found|COWORK_EXE_MISSING|ENOENT/i.test(err.message)
}

function isCoworkHeadlessUnsupported(err: unknown): boolean {
  if (!(err instanceof ApiError)) return false
  if (err.code === 'COWORK_HEADLESS_UNSUPPORTED') return true
  return /headless JSONL|COWORK_HEADLESS_UNSUPPORTED|stdio\.ready/i.test(err.message)
}

function softApiToast(
  addToast: (t: { title: string; description?: string; variant?: 'danger' | 'attention' }) => void,
  err: unknown,
  fallbackTitle: string,
): void {
  if (isCoworkApiMissing(err)) {
    addToast({
      title: 'Cowork API not available yet',
      description: 'Work requests will work once the server endpoints are enabled.',
      variant: 'attention',
    })
    return
  }
  if (isCoworkExeMissing(err)) {
    addToast({
      title: 'Open Cowork not configured',
      description:
        err instanceof Error
          ? err.message
          : 'Install Open Cowork and set OPEN_COWORK_EXE, then restart the API.',
      variant: 'attention',
    })
    return
  }
  if (isCoworkHeadlessUnsupported(err)) {
    addToast({
      title: 'Open Cowork build is GUI-only',
      description:
        err instanceof Error
          ? err.message
          : 'This installer cannot run headless work requests. Use a headless-capable Open Cowork build.',
      variant: 'attention',
    })
    return
  }
  addToast({
    title: fallbackTitle,
    description: err instanceof Error ? err.message : undefined,
    variant: 'danger',
  })
}

export function CoworkWorkRequests({
  initialForm = null,
  onInitialFormConsumed,
}: {
  /** Prefill from Office gallery deep-link. */
  initialForm?: { deliverableType: CoworkDeliverableType; goalSeed?: string } | null
  onInitialFormConsumed?: () => void
} = {}) {
  const addToast = useUiStore((s) => s.addToast)
  const setWorkspacePreviewPath = useUiStore((s) => s.setWorkspacePreviewPath)
  const setActivePanel = useUiStore((s) => s.setActivePanel)
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [formOpen, setFormOpen] = useState(Boolean(initialForm))
  const [formKey, setFormKey] = useState(0)
  const [prefill, setPrefill] = useState(initialForm)
  const [resultsTaskId, setResultsTaskId] = useState<string | null>(null)
  const missingToastShown = useRef(false)

  useEffect(() => {
    if (!initialForm) return
    setPrefill(initialForm)
    setFormOpen(true)
    setFormKey((k) => k + 1)
    onInitialFormConsumed?.()
  }, [initialForm, onInitialFormConsumed])

  const {
    data: tasks,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ['cowork-tasks'],
    queryFn: async () => {
      const res = await apiClient.get<CoworkTaskListResponse>('/api/cowork/tasks')
      return res.tasks
    },
    retry: false,
    refetchInterval: (q) => (shouldPollCoworkTasks(q.state.data) ? 4_000 : false),
  })

  const { data: setup, isLoading: setupLoading } = useQuery({
    queryKey: ['cowork-setup'],
    queryFn: () => apiClient.get<CoworkSetupResponse>('/api/cowork/setup'),
    retry: false,
    staleTime: 30_000,
  })

  useEffect(() => {
    if (!isError || missingToastShown.current) return
    if (isCoworkApiMissing(error)) {
      missingToastShown.current = true
      addToast({
        title: 'Cowork API not available yet',
        description: 'Work requests will work once the server endpoints are enabled.',
        variant: 'attention',
      })
    }
  }, [isError, error, addToast])

  const { data: detail, isLoading: detailLoading } = useQuery({
    queryKey: ['cowork-task', resultsTaskId],
    queryFn: () => apiClient.get<CoworkTaskDetail>(`/api/cowork/tasks/${resultsTaskId}`),
    enabled: !!resultsTaskId,
    retry: false,
    refetchInterval: (q) =>
      shouldPollCoworkTaskDetail(q.state.data?.status) ? 3_000 : false,
  })

  const create = useMutation({
    mutationFn: (body: {
      goal: string
      deliverableType: CoworkDeliverableType
      files?: string[]
      autoApprove?: boolean
    }) => apiClient.post<CoworkTaskCreateResponse>('/api/cowork/tasks', body),
    onSuccess: (res) => {
      addToast({ title: 'Work request started', description: res.taskId, variant: 'success' })
      setFormOpen(false)
      void queryClient.invalidateQueries({ queryKey: ['cowork-tasks'] })
      void queryClient.invalidateQueries({ queryKey: ['cowork-setup'] })
    },
    onError: (err) => softApiToast(addToast, err, 'Could not start work request'),
  })

  const retry = useMutation({
    mutationFn: async (task: CoworkTask) => {
      const { files, legacyMissingInputs } = coworkRetryFiles(task)
      if (legacyMissingInputs) {
        addToast({
          title: 'Original input files unknown — retried without attachments.',
          variant: 'attention',
        })
      }
      const payload = buildCoworkCreatePayload({
        goal: task.goal ?? '',
        deliverableType: task.deliverableType ?? 'other',
        files,
        autoApprove: true,
      })
      if ('error' in payload) throw new Error(payload.error)
      return apiClient.post<CoworkTaskCreateResponse>('/api/cowork/tasks', payload)
    },
    onSuccess: () => {
      addToast({ title: 'Retry started', variant: 'success' })
      void queryClient.invalidateQueries({ queryKey: ['cowork-tasks'] })
    },
    onError: (err) => softApiToast(addToast, err, 'Retry failed'),
  })

  const abort = useMutation({
    mutationFn: (taskId: string) =>
      apiClient.post<{ ok: boolean; taskId: string; status: string; error?: string }>(
        `/api/cowork/tasks/${taskId}/abort`,
      ),
    onSuccess: () => {
      addToast({ title: 'Work request stopped', variant: 'success' })
      void queryClient.invalidateQueries({ queryKey: ['cowork-tasks'] })
      void queryClient.invalidateQueries({ queryKey: ['cowork-task'] })
    },
    onError: (err) => softApiToast(addToast, err, 'Could not stop work request'),
  })

  if (isLoading) return <Skeleton className="h-20 w-full" />

  if (isError && !isCoworkApiMissing(error)) {
    return (
      <EmptyState
        title="Could not load work requests"
        description={error instanceof Error ? error.message : 'Server unreachable.'}
        action={
          <button type="button" onClick={() => void refetch()} className="text-xs text-accent">
            Retry
          </button>
        }
      />
    )
  }

  const list = tasks ?? []

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-medium text-fg">Work requests</h2>
        <button
          type="button"
          onClick={() => {
            setPrefill(null)
            setFormOpen((v) => !v)
            setFormKey((k) => k + 1)
          }}
          className="inline-flex items-center gap-1 text-xs text-accent hover:underline"
          data-testid="cowork-new-request"
        >
          <Plus size={12} /> New request
        </button>
      </div>

      <details className="mb-4 rounded border border-border p-2 text-xs text-fg-muted" open={!setup?.configured}>
        <summary className="cursor-pointer font-medium text-fg">Setup</summary>
        <div className="mt-1.5 space-y-3">
          <div className="rounded border border-border bg-canvas-subtle px-2 py-1.5">
            <p className="font-medium text-fg">(A) Microsoft SSO — email / calendar</p>
            <p className="mt-1 text-fg-muted">
              Independent of Open Cowork. Use Office → Briefing → Sign in with Microsoft (or the
              login page). Requires <code className="text-fg">MICROSOFT_CLIENT_ID</code> +{' '}
              <code className="text-fg">MICROSOFT_CLIENT_SECRET</code>, not{' '}
              <code className="text-fg">OPEN_COWORK_EXE</code>.
            </p>
          </div>
          {setupLoading ? (
            <p className="text-fg-muted">Checking Open Cowork…</p>
          ) : setup?.configured ? (
            <p className="text-fg-muted">
              (B) Open Cowork ready at <code className="break-all text-fg">{setup.exe}</code>
            </p>
          ) : setup?.exeExists && setup.headlessSupported === false ? (
            <div className="space-y-2">
              <p className="font-medium text-fg">(B) Open Cowork found — GUI-only build</p>
              <p className="text-attention">
                {setup.hint ??
                  'This installer cannot run headless work requests. Hermes needs a headless-capable Open Cowork build.'}
              </p>
              <p className="text-fg-muted">
                Past tasks still appear from the database. For new deliverables, build Open Cowork from
                main (with --headless) or wait for a release that includes Agent Platform headless.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="font-medium text-fg">(B) Open Cowork — local document jobs (optional)</p>
              <p className="text-attention">
                {setup?.hint ??
                  'Open Cowork is not installed or OPEN_COWORK_EXE is not set.'}
              </p>
              <ol className="list-decimal space-y-1 pl-4 text-fg-muted">
                <li>
                  Install the desktop app —{' '}
                  <a
                    href={
                      setup?.downloadUrl ??
                      'https://github.com/OpenCoworkAI/open-cowork/releases/download/v3.3.1/Open.Cowork-3.3.1-win-x64.exe'
                    }
                    target="_blank"
                    rel="noreferrer"
                    className="text-accent hover:underline"
                  >
                    download Windows installer
                  </a>
                  {' · '}
                  <a
                    href={
                      setup?.releasesUrl ??
                      'https://github.com/OpenCoworkAI/open-cowork/releases'
                    }
                    target="_blank"
                    rel="noreferrer"
                    className="text-accent hover:underline"
                  >
                    all releases
                  </a>
                  .
                </li>
                <li>
                  Paste the full path to <code className="text-fg">Open Cowork.exe</code> below
                  (typical:{' '}
                  <code className="break-all text-fg">
                    %LOCALAPPDATA%\Programs\Open Cowork\Open Cowork.exe
                  </code>
                  ). Saves immediately — no API restart.
                </li>
                <li>
                  Or set <code className="text-fg">OPEN_COWORK_EXE</code> in the server{' '}
                  <code className="text-fg">.env</code> and restart the API.
                </li>
              </ol>
              <CoworkExePathForm
                initialExe={setup?.exe ?? ''}
                onSaved={() => void queryClient.invalidateQueries({ queryKey: ['cowork-setup'] })}
              />
              {setup?.exe ? (
                <p className="text-fg-subtle">
                  Looked for: <code className="break-all">{setup.exe}</code>
                </p>
              ) : null}
            </div>
          )}
        </div>
      </details>

      {formOpen && (
        <NewRequestForm
          key={formKey}
          pending={create.isPending}
          initialDeliverableType={prefill?.deliverableType}
          initialGoal={prefill?.goalSeed}
          onCancel={() => {
            setFormOpen(false)
            setPrefill(null)
          }}
          onSubmit={(payload) => create.mutate(payload)}
        />
      )}

      {resultsTaskId && (
        <ResultsPanel
          taskId={resultsTaskId}
          detail={detail}
          loading={detailLoading}
          onClose={() => setResultsTaskId(null)}
          onOpenFile={(path) => {
            setWorkspacePreviewPath(path)
            setActivePanel('workspace')
            void navigate({ to: '/panel/$name', params: { name: 'workspace' } })
          }}
        />
      )}

      {!list.length ? (
        <EmptyState
          title="No work requests yet"
          description="Create a presentation, report, or spreadsheet."
        />
      ) : (
        <ul className="space-y-2">
          {list.map((task) => (
            <li key={task.taskId} className="rounded-lg border border-border p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="truncate text-sm font-medium text-fg" title={task.goal ?? undefined}>
                    {truncateGoalTitle(task.goal)}
                  </h3>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-[10px] text-fg-subtle">
                    <span
                      className={`rounded-full border px-1.5 py-0.5 ${coworkStatusPillClass(task.status)}`}
                    >
                      {coworkTaskStatusLabel(task.status)}
                    </span>
                    <span>{deliverableLabel(task.deliverableType)}</span>
                    <span title={task.taskId}>{shortenId(task.taskId, 6)}</span>
                    <span>{formatRelativeTime(task.createdAt)}</span>
                  </div>
                  {task.error && (
                    <p className="mt-1 text-xs text-danger">{task.error}</p>
                  )}
                </div>
                <div className="flex flex-wrap gap-1">
                  <button
                    type="button"
                    onClick={() => setResultsTaskId(task.taskId)}
                    className="rounded px-2 py-0.5 text-xs text-accent hover:bg-accent-muted"
                  >
                    Open results
                  </button>
                  {isCoworkTaskAbortable(task.status) && (
                    <button
                      type="button"
                      onClick={() => abort.mutate(task.taskId)}
                      disabled={abort.isPending}
                      className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs text-danger hover:bg-canvas-subtle disabled:opacity-50"
                      title="Stop"
                      data-testid="cowork-stop"
                    >
                      <X size={12} /> Stop
                    </button>
                  )}
                  {task.sessionId && (
                    <Link
                      to="/session/$id"
                      params={{ id: task.sessionId }}
                      className="rounded px-2 py-0.5 text-xs text-fg-muted hover:bg-canvas-subtle"
                    >
                      Open chat audit
                    </Link>
                  )}
                  {task.status === 'failed' && (
                    <button
                      type="button"
                      onClick={() => retry.mutate(task)}
                      disabled={retry.isPending}
                      className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs text-fg-muted hover:bg-canvas-subtle disabled:opacity-50"
                      title="Retry"
                    >
                      <RotateCcw size={12} /> Retry
                    </button>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function CoworkExePathForm({
  initialExe,
  onSaved,
}: {
  initialExe: string
  onSaved: () => void
}) {
  const addToast = useUiStore((s) => s.addToast)
  const [exe, setExe] = useState(initialExe)
  const save = useMutation({
    mutationFn: (path: string) =>
      apiClient.put<CoworkSetupResponse>('/api/cowork/setup', { exe: path }),
    onSuccess: (res) => {
      if (res.configured) {
        addToast({ title: 'Open Cowork configured', description: res.exe, variant: 'success' })
      } else {
        addToast({
          title: 'Path saved — executable not found yet',
          description: res.hint,
          variant: 'attention',
        })
      }
      onSaved()
    },
    onError: (err) => softApiToast(addToast, err, 'Could not save Open Cowork path'),
  })

  useEffect(() => {
    setExe(initialExe)
  }, [initialExe])

  return (
    <form
      className="space-y-1.5"
      onSubmit={(e) => {
        e.preventDefault()
        save.mutate(exe.trim())
      }}
      data-testid="cowork-exe-path-form"
    >
      <label className={labelClass}>
        Path to Open Cowork.exe
        <input
          type="text"
          value={exe}
          onChange={(e) => setExe(e.target.value)}
          placeholder="C:\Users\You\AppData\Local\Programs\Open Cowork\Open Cowork.exe"
          className={`${inputClass} mt-1 font-mono text-[11px]`}
          spellCheck={false}
        />
      </label>
      <button
        type="submit"
        disabled={save.isPending || !exe.trim()}
        className="rounded bg-accent px-2 py-1 text-[11px] font-medium text-accent-fg disabled:opacity-50"
      >
        {save.isPending ? 'Saving…' : 'Save path'}
      </button>
    </form>
  )
}

function NewRequestForm({
  pending,
  onCancel,
  onSubmit,
  initialDeliverableType,
  initialGoal,
}: {
  pending: boolean
  onCancel: () => void
  onSubmit: (payload: {
    goal: string
    deliverableType: CoworkDeliverableType
    files?: string[]
    autoApprove?: boolean
  }) => void
  initialDeliverableType?: CoworkDeliverableType
  initialGoal?: string
}) {
  const addToast = useUiStore((s) => s.addToast)
  const goalRef = useRef<HTMLTextAreaElement>(null)
  const [goal, setGoal] = useState(initialGoal ?? '')
  const [deliverableType, setDeliverableType] = useState<CoworkDeliverableType>(
    initialDeliverableType ?? 'presentation',
  )
  const [filePath, setFilePath] = useState('')
  const [autoApprove, setAutoApprove] = useState(true)

  useEffect(() => {
    goalRef.current?.focus()
  }, [])

  return (
    <div
      className="mb-4 rounded-lg border border-border bg-canvas-subtle p-3"
      data-testid="cowork-new-form"
    >
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-medium text-fg">New request</h3>
        <button
          type="button"
          onClick={onCancel}
          className="rounded p-1 text-fg-muted hover:bg-canvas"
          title="Close"
        >
          <X size={14} />
        </button>
      </div>

      <div className="space-y-3">
        <label className={labelClass}>
          What should be produced?
          <textarea
            ref={goalRef}
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
            placeholder="e.g. A 6-slide deck summarizing Q2 sales for leadership"
            rows={3}
            className={`${inputClass} mt-1`}
          />
        </label>

        <div>
          <p className={labelClass}>Deliverable</p>
          <div className="mt-1 flex flex-wrap gap-1">
            {COWORK_DELIVERABLE_PRESETS.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setDeliverableType(p.id)}
                className={`rounded-full border px-2 py-0.5 text-[10px] ${
                  deliverableType === p.id
                    ? 'border-accent text-accent'
                    : 'border-border text-fg-muted hover:border-accent'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        <label className={labelClass}>
          Workspace file (optional)
          <input
            value={filePath}
            onChange={(e) => setFilePath(e.target.value)}
            placeholder="e.g. notes/brief.md"
            className={`${inputClass} mt-1 font-mono`}
          />
          <span className="mt-0.5 block text-[10px] text-fg-subtle">
            Relative path under the workspace only.
          </span>
        </label>

        <label className="flex items-start gap-2 text-sm text-fg">
          <input
            type="checkbox"
            className="mt-0.5"
            checked={autoApprove}
            onChange={(e) => setAutoApprove(e.target.checked)}
          />
          <span>
            Allow tools for this trusted workspace run
            <span className="mt-0.5 block text-[10px] text-fg-subtle">
              Skip approval prompts while Open Cowork works in this workspace.
            </span>
          </span>
        </label>
      </div>

      <div className="mt-3 flex items-center justify-end gap-2 border-t border-border pt-2">
        <button
          type="button"
          onClick={onCancel}
          className="text-xs text-fg-muted hover:underline"
        >
          Cancel
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => {
            const payload = buildCoworkCreatePayload({
              goal,
              deliverableType,
              files: filePath.trim() ? [filePath] : [],
              autoApprove,
            })
            if ('error' in payload) {
              addToast({ title: payload.error, variant: 'danger' })
              return
            }
            const files =
              payload.files?.map((f) => (typeof f === 'string' ? f : f.sourcePath)) ?? undefined
            onSubmit({
              goal: payload.goal,
              deliverableType: payload.deliverableType,
              ...(files?.length ? { files } : {}),
              autoApprove: payload.autoApprove,
            })
          }}
          className="rounded bg-accent px-3 py-1 text-xs text-white disabled:opacity-50"
          data-testid="cowork-start"
        >
          {pending ? 'Starting…' : 'Start'}
        </button>
      </div>
    </div>
  )
}

function ResultsPanel({
  taskId,
  detail,
  loading,
  onClose,
  onOpenFile,
}: {
  taskId: string
  detail: CoworkTaskDetail | undefined
  loading: boolean
  onClose: () => void
  onOpenFile: (path: string) => void
}) {
  const files = detail?.outboxFiles?.length
    ? detail.outboxFiles
    : (detail?.files ?? [])
  const summary =
    detail?.summary ??
    (typeof detail?.statusJson?.summary === 'string'
      ? detail.statusJson.summary
      : null)

  return (
    <div
      className="mb-4 rounded-lg border border-border bg-canvas-subtle p-3"
      data-testid="cowork-results"
    >
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-medium text-fg">
          Results <span className="text-fg-subtle">({shortenId(taskId, 6)})</span>
        </h3>
        <button
          type="button"
          onClick={onClose}
          className="rounded p-1 text-fg-muted hover:bg-canvas"
          title="Close"
        >
          <X size={14} />
        </button>
      </div>

      {loading ? (
        <Skeleton className="h-12 w-full" />
      ) : (
        <div className="space-y-2 text-xs">
          {detail && (
            <p className="text-fg-muted">
              Status:{' '}
              <span className={coworkStatusPillClass(detail.status)}>
                {coworkTaskStatusLabel(detail.status)}
              </span>
            </p>
          )}
          {summary && <p className="whitespace-pre-wrap text-fg">{summary}</p>}
          {detail?.error && <p className="text-danger">{detail.error}</p>}
          {!files.length ? (
            <p className="text-fg-muted">No output files yet.</p>
          ) : (
            <ul className="space-y-1">
              {files.map((file) => {
                const workspacePath = file.includes('/') || file.includes('\\')
                  ? file
                  : `outbox/${taskId}/${file}`
                return (
                  <li key={file} className="flex items-center gap-2">
                    <code className="truncate text-fg">{file}</code>
                    <button
                      type="button"
                      onClick={() => onOpenFile(workspacePath)}
                      className="shrink-0 text-accent hover:underline"
                    >
                      Open in Workspace
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
          <p className="flex items-center gap-1 text-[10px] text-fg-subtle">
            <ChevronDown size={10} /> Outbox folder: outbox/{taskId}/
          </p>
        </div>
      )}
    </div>
  )
}
