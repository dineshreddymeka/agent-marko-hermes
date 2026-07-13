/**
 * Open Jarvis — Cron panel with enterprise guided workflow wizard.
 * Author: Dinesh Reddy Meka
 *
 * Create/edit flows run through a 6-step stepper (Intent → Schedule → MCP →
 * Skills → Policy → Review) that binds MCP servers + forced skills into the
 * job's workflow config. The list view stays manage-focused (enable/disable,
 * run now, history, edit) and supports MCP/skill filters backed by the
 * GIN-indexed array columns.
 */
import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import {
  AlertTriangle,
  Check,
  ChevronLeft,
  ChevronRight,
  History,
  Pause,
  Pencil,
  Play,
  Plus,
  Trash2,
  X,
} from 'lucide-react'
import { apiClient } from '@app/lib/api'
import { fetchHermesProfiles } from '@app/lib/hermes-adapters'
import { useUiStore } from '@app/stores/ui'
import { previewCronSchedule } from '@app/lib/panels'
import {
  buildCronPayload,
  COMMON_TIMEZONES,
  CRON_SCHEDULE_PRESETS,
  CRON_WIZARD_STEPS,
  draftFromJob,
  emptyCronDraft,
  parseStepsJson,
  toggleId,
  validateWizardStep,
  type CronWizardDraft,
} from '@app/lib/panels/cron-wizard'
import type { CronJob, CronRun, McpServer, Profile, Skill } from '@hermes/shared'
import { EmptyState } from '@app/components/common/EmptyState'
import { Skeleton } from '@app/components/common/Skeleton'
import { formatRelativeTime } from '@app/lib/utils'
import { modelLabel, resolveNameOrId, shortenId } from '@app/lib/display-names'
import {
  connectionStatusLabel,
  cronRunStatusLabel,
  cronWorkflowStepTypeLabel,
  mcpServerStatusLabel,
} from '@app/lib/labels'
import { CoworkWorkRequests } from '@app/components/panels/CoworkWorkRequests'

const inputClass = 'w-full rounded border border-border bg-canvas px-2 py-1 text-sm text-fg'
const labelClass = 'block text-xs font-medium text-fg-muted'

type CoworkPanelTab = 'work' | 'scheduled'

type CoworkFormPrefill = {
  deliverableType: import('@app/lib/panels/cowork-work').CoworkDeliverableType
  goalSeed?: string
} | null

function readCoworkPrefillFromUrl(): CoworkFormPrefill {
  if (typeof window === 'undefined') return null
  const params = new URLSearchParams(window.location.search)
  if (params.get('new') !== '1') return null
  const type = params.get('type')
  const allowed = ['presentation', 'word', 'spreadsheet', 'pdf', 'other'] as const
  const deliverableType = allowed.includes(type as (typeof allowed)[number])
    ? (type as (typeof allowed)[number])
    : 'other'
  const goal = params.get('goal') ?? undefined
  return { deliverableType, goalSeed: goal || undefined }
}

function clearCoworkPrefillFromUrl(): void {
  if (typeof window === 'undefined') return
  const url = new URL(window.location.href)
  if (!url.searchParams.has('new') && !url.searchParams.has('type') && !url.searchParams.has('goal')) {
    return
  }
  url.searchParams.delete('new')
  url.searchParams.delete('type')
  url.searchParams.delete('goal')
  window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`)
}

/** Cowork panel: Work requests (default) + Scheduled (existing cron UI). */
export function CronPanel() {
  const storePrefill = useUiStore((s) => s.coworkFormPrefill)
  const setCoworkFormPrefill = useUiStore((s) => s.setCoworkFormPrefill)
  const [tab, setTab] = useState<CoworkPanelTab>('work')
  const [initialForm, setInitialForm] = useState<CoworkFormPrefill>(
    () => storePrefill ?? readCoworkPrefillFromUrl(),
  )

  useEffect(() => {
    if (!storePrefill) return
    setTab('work')
    setInitialForm(storePrefill)
  }, [storePrefill])

  return (
    <div>
      <div
        className="mb-4 flex gap-1 border-b border-border"
        role="tablist"
        aria-label="Cowork sections"
      >
        {(
          [
            ['work', 'Work requests'],
            ['scheduled', 'Scheduled'],
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
            data-testid={`cowork-tab-${id}`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'work' ? (
        <CoworkWorkRequests
          initialForm={initialForm}
          onInitialFormConsumed={() => {
            setInitialForm(null)
            setCoworkFormPrefill(null)
            clearCoworkPrefillFromUrl()
          }}
        />
      ) : (
        <ScheduledCronContent />
      )}
    </div>
  )
}

type WizardPreview = {
  schedule: { valid: boolean; preview: string; nextRun: string | null } | null
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

function statusDot(server: Pick<McpServer, 'enabled' | 'lastStatus'>): string {
  if (!server.enabled) return 'bg-fg-subtle'
  if (server.lastStatus === 'connected') return 'bg-success'
  if (server.lastStatus === 'error' || server.lastStatus === 'disconnected') return 'bg-danger'
  return 'bg-attention'
}

function ScheduledCronContent() {
  const addToast = useUiStore((s) => s.addToast)
  const queryClient = useQueryClient()
  const [wizardOpen, setWizardOpen] = useState(false)
  const [editingJob, setEditingJob] = useState<CronJob | null>(null)
  const [historyJobId, setHistoryJobId] = useState<string | null>(null)
  const [filterMcpId, setFilterMcpId] = useState('')
  const [filterSkillId, setFilterSkillId] = useState('')

  const { data: jobs, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['cron', filterMcpId, filterSkillId],
    queryFn: () =>
      apiClient.get<CronJob[]>('/api/cron/jobs', {
        mcpServerId: filterMcpId || undefined,
        skillId: filterSkillId || undefined,
      }),
    retry: false,
  })

  const { data: mcpData } = useQuery({
    queryKey: ['mcp'],
    queryFn: () => apiClient.get<{ servers: McpServer[] }>('/api/mcp'),
    retry: false,
  })
  const mcpServers = useMemo(() => mcpData?.servers ?? [], [mcpData])

  const { data: skills } = useQuery({
    queryKey: ['skills'],
    queryFn: () => apiClient.get<Skill[]>('/api/skills'),
    retry: false,
  })

  const { data: runs } = useQuery({
    queryKey: ['cron-runs', historyJobId],
    queryFn: () => apiClient.get<CronRun[]>(`/api/cron/jobs/${historyJobId}/runs`),
    enabled: !!historyJobId,
    retry: false,
  })

  const toggle = useMutation({
    mutationFn: (job: CronJob) =>
      apiClient.post(
        `/api/cron/jobs/${job.id}/${job.enabled ? 'pause' : 'resume'}`,
      ),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['cron'] }),
    onError: () => addToast({ title: 'Toggle failed', variant: 'danger' }),
  })

  const runNow = useMutation({
    mutationFn: (job: CronJob) => apiClient.post(`/api/cron/jobs/${job.id}/trigger`),
    onSuccess: () => addToast({ title: 'Scheduled task started', variant: 'success' }),
    onError: () => addToast({ title: 'Run failed', variant: 'danger' }),
  })

  const remove = useMutation({
    mutationFn: (id: string) => apiClient.delete(`/api/cron/jobs/${id}`),
    onSuccess: () => {
      addToast({ title: 'Scheduled task deleted', variant: 'success' })
      void queryClient.invalidateQueries({ queryKey: ['cron'] })
    },
    onError: () => addToast({ title: 'Delete failed', variant: 'danger' }),
  })

  const mcpNameById = useMemo(
    () => new Map(mcpServers.map((s) => [s.id, s.name])),
    [mcpServers],
  )
  const skillNameById = useMemo(
    () => new Map((skills ?? []).map((s) => [s.id, s.name])),
    [skills],
  )

  if (isLoading) return <Skeleton className="m-4 h-20 w-full" />

  if (isError) {
    return (
      <EmptyState
        title="Could not load scheduled tasks"
        description={error instanceof Error ? error.message : 'Server unreachable.'}
        action={
          <button type="button" onClick={() => void refetch()} className="text-xs text-accent">
            Retry
          </button>
        }
      />
    )
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-medium text-fg">Scheduled</h2>
        <button
          type="button"
          onClick={() => {
            setEditingJob(null)
            setWizardOpen((v) => !v)
          }}
          className="inline-flex items-center gap-1 text-xs text-accent hover:underline"
          data-testid="cron-new-job"
        >
          <Plus size={12} /> Add scheduled task
        </button>
      </div>

      {wizardOpen && (
        <CronWizard
          key={editingJob?.id ?? 'new'}
          editingJob={editingJob}
          mcpServers={mcpServers}
          skills={skills ?? []}
          onClose={() => {
            setWizardOpen(false)
            setEditingJob(null)
          }}
        />
      )}

      {(mcpServers.length > 0 || (skills?.length ?? 0) > 0) && (
        <div className="mb-3 flex flex-wrap gap-2">
          <select
            value={filterMcpId}
            onChange={(e) => setFilterMcpId(e.target.value)}
            className="rounded border border-border bg-canvas px-2 py-1 text-xs text-fg-muted"
            title="Filter by MCP server"
          >
            <option value="">All MCP servers</option>
            {mcpServers.map((s) => (
              <option key={s.id} value={s.id}>
                MCP: {s.name}
              </option>
            ))}
          </select>
          <select
            value={filterSkillId}
            onChange={(e) => setFilterSkillId(e.target.value)}
            className="rounded border border-border bg-canvas px-2 py-1 text-xs text-fg-muted"
            title="Filter by skill"
          >
            <option value="">All skills</option>
            {(skills ?? []).map((s) => (
              <option key={s.id} value={s.id}>
                Skill: {s.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {!jobs?.length ? (
        <EmptyState title="No scheduled tasks" description="Schedule recurring tasks for Open Jarvis." />
      ) : (
        <ul className="space-y-2">
          {jobs.map((job) => (
            <li key={job.id} className="rounded-lg border border-border p-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h3 className="text-sm font-medium text-fg">{job.name}</h3>
                  <code className="text-xs text-fg-muted">
                    {job.schedule}
                    {job.timezone && job.timezone !== 'UTC' ? ` (${job.timezone})` : ''}
                  </code>
                  <p className="mt-0.5 text-[10px] text-fg-subtle">
                    {previewCronSchedule(job.schedule).preview}
                  </p>
                </div>
                <div className="flex flex-wrap gap-1">
                  <button
                    type="button"
                    onClick={() => toggle.mutate(job)}
                    className="rounded p-1 text-fg-muted hover:bg-canvas-subtle"
                    title={job.enabled ? 'Disable' : 'Enable'}
                  >
                    {job.enabled ? <Pause size={14} /> : <Play size={14} />}
                  </button>
                  <button
                    type="button"
                    onClick={() => runNow.mutate(job)}
                    className="rounded px-2 py-0.5 text-xs text-accent hover:bg-accent-muted"
                  >
                    Run now
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setEditingJob(job)
                      setWizardOpen(true)
                    }}
                    className="rounded p-1 text-fg-muted hover:bg-canvas-subtle"
                    title="Edit"
                    data-testid={`cron-edit-${job.id}`}
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    type="button"
                    onClick={() => setHistoryJobId((id) => (id === job.id ? null : job.id))}
                    className="rounded p-1 text-fg-muted hover:bg-canvas-subtle"
                    title="History"
                  >
                    <History size={14} />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (confirm(`Delete scheduled task “${job.name}”?`)) remove.mutate(job.id)
                    }}
                    className="rounded p-1 text-fg-muted hover:text-danger"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
              <p className="mt-1 truncate text-xs text-fg-muted">{job.prompt}</p>

              {(job.mcpServerIds.length > 0 ||
                job.skillIds.length > 0 ||
                job.workflow.headlessAutoApprove) && (
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {job.mcpServerIds.map((id) => {
                    const name = resolveNameOrId(id, mcpNameById)
                    return (
                    <span
                      key={id}
                      className="rounded-full border border-border px-1.5 py-0.5 text-[10px] text-fg-muted"
                      title={mcpNameById.has(id) ? undefined : id}
                    >
                      MCP: {name}
                    </span>
                    )
                  })}
                  {job.skillIds.map((id) => {
                    const name = resolveNameOrId(id, skillNameById)
                    return (
                    <span
                      key={id}
                      className="rounded-full border border-border px-1.5 py-0.5 text-[10px] text-fg-muted"
                      title={skillNameById.has(id) ? undefined : id}
                    >
                      Skill: {name}
                    </span>
                    )
                  })}
                  {job.workflow.headlessAutoApprove && (
                    <span className="rounded-full border border-attention px-1.5 py-0.5 text-[10px] text-attention">
                      Auto-approve
                    </span>
                  )}
                </div>
              )}

              {(job.workflow.steps?.length ?? 0) > 0 && (
                <ol className="mt-1.5 space-y-0.5">
                  {job.workflow.steps!.map((step) => (
                    <li key={step.id} className="text-[10px] text-fg-subtle">
                      <span className="text-fg-muted">{step.label}</span> (
                      {cronWorkflowStepTypeLabel(step.type)}
                      {step.parallelGroup ? `, parallel group ${step.parallelGroup}` : ''}
                      {step.dependsOn?.length ? `, after ${step.dependsOn.length} step(s)` : ''})
                    </li>
                  ))}
                </ol>
              )}

              <div className="mt-1 flex gap-3 text-[10px] text-fg-subtle">
                {job.lastRun && <span>Last: {formatRelativeTime(job.lastRun)}</span>}
                {job.nextRun && <span>Next: {formatRelativeTime(job.nextRun)}</span>}
                <span>{job.enabled ? 'Enabled' : 'Disabled'}</span>
              </div>
              {historyJobId === job.id && (
                <ul className="mt-2 space-y-1 border-t border-border pt-2">
                  {!runs?.length ? (
                    <li className="text-xs text-fg-muted">No runs yet</li>
                  ) : (
                    runs.map((run) => (
                      <li key={run.id} className="flex items-center gap-2 text-xs text-fg-muted">
                        <span title={run.status}>{cronRunStatusLabel(run.status)}</span>
                        <span>{formatRelativeTime(run.startedAt)}</span>
                        {run.sessionId && (
                          <Link
                            to="/session/$id"
                            params={{ id: run.sessionId }}
                            className="text-accent hover:underline"
                          >
                            Open session
                          </Link>
                        )}
                        {run.error && <span className="text-danger">{run.error}</span>}
                      </li>
                    ))
                  )}
                </ul>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function CronWizard({
  editingJob,
  mcpServers,
  skills,
  onClose,
}: {
  editingJob: CronJob | null
  mcpServers: McpServer[]
  skills: Skill[]
  onClose: () => void
}) {
  const addToast = useUiStore((s) => s.addToast)
  const queryClient = useQueryClient()
  const [step, setStep] = useState(0)
  const [draft, setDraft] = useState<CronWizardDraft>(() =>
    editingJob ? draftFromJob(editingJob) : emptyCronDraft(),
  )
  const [showCreateSkill, setShowCreateSkill] = useState(false)
  const [newSkill, setNewSkill] = useState({ name: '', description: '', bodyMd: '' })
  const [unhealthyOverride, setUnhealthyOverride] = useState(false)

  const patch = (p: Partial<CronWizardDraft>) => setDraft((d) => ({ ...d, ...p }))

  const schedulePreview = previewCronSchedule(draft.schedule)
  const stepsCheck = parseStepsJson(draft.stepsJson)
  const stepError = validateWizardStep(step, draft, {
    scheduleValid: schedulePreview.valid,
    skillsAvailable: skills.length,
  })

  const { data: profiles } = useQuery({
    queryKey: ['profiles'],
    queryFn: fetchHermesProfiles,
    retry: false,
  })

  // Review step re-validates schedule + live MCP/skill health server-side.
  const isReview = step === CRON_WIZARD_STEPS.length - 1
  const { data: preview, isFetching: previewLoading, refetch: refetchPreview } = useQuery({
    queryKey: ['cron-wizard-preview', draft.schedule, draft.mcpServerIds, draft.skillIds],
    queryFn: () =>
      apiClient.post<WizardPreview>('/api/cron/wizard/preview', {
        schedule: draft.schedule,
        mcpServerIds: draft.mcpServerIds,
        skillIds: draft.skillIds,
      }),
    enabled: isReview,
    retry: false,
  })

  const unhealthyServers = (preview?.mcpServers ?? []).filter((s) => !s.healthy)

  const testConnection = useMutation({
    mutationFn: (id: string) => apiClient.post<{ state: { status: string } }>(`/api/mcp/${id}/test`),
    onSuccess: (res) => {
      const statusDisplay = connectionStatusLabel(res.state.status)
      addToast({
        title: `Test: ${statusDisplay}`,
        description: res.state.status,
        variant: res.state.status === 'connected' ? 'success' : 'danger',
      })
      void queryClient.invalidateQueries({ queryKey: ['mcp'] })
      if (isReview) void refetchPreview()
    },
    onError: () => addToast({ title: 'Connection test failed', variant: 'danger' }),
  })

  const createSkill = useMutation({
    mutationFn: () =>
      apiClient.post<Skill>('/api/skills', {
        name: newSkill.name.trim(),
        description: newSkill.description.trim() || undefined,
        bodyMd: newSkill.bodyMd.trim() || `# ${newSkill.name.trim()}\n`,
        source: 'learned',
      }),
    onSuccess: (skill) => {
      addToast({ title: 'Skill created', description: skill.name, variant: 'success' })
      setDraft((d) => ({
        ...d,
        skillIds: [...d.skillIds, skill.id],
        createSkillRequests: [
          ...d.createSkillRequests,
          {
            name: skill.name,
            description: newSkill.description.trim() || undefined,
            bodyMd: newSkill.bodyMd.trim() || undefined,
          },
        ],
      }))
      setNewSkill({ name: '', description: '', bodyMd: '' })
      setShowCreateSkill(false)
      void queryClient.invalidateQueries({ queryKey: ['skills'] })
    },
    onError: (err) =>
      addToast({
        title: 'Create skill failed',
        description: err instanceof Error ? err.message : undefined,
        variant: 'danger',
      }),
  })

  const save = useMutation({
    mutationFn: () => {
      const payload = buildCronPayload(draft, editingJob?.enabled ?? true)
      return editingJob
        ? apiClient.put<CronJob>(`/api/cron/jobs/${editingJob.id}`, payload)
        : apiClient.post<CronJob>('/api/cron/jobs', payload)
    },
    onSuccess: () => {
      addToast({
        title: editingJob ? 'Scheduled task updated' : 'Scheduled task created',
        variant: 'success',
      })
      void queryClient.invalidateQueries({ queryKey: ['cron'] })
      onClose()
    },
    onError: (err) =>
      addToast({
        title: editingJob ? 'Update failed' : 'Create failed',
        description: err instanceof Error ? err.message : undefined,
        variant: 'danger',
      }),
  })

  // New unhealthy selections invalidate a previous "create anyway" choice.
  const selectedMcpKey = draft.mcpServerIds.join(',')
  useEffect(() => {
    setUnhealthyOverride(false)
  }, [selectedMcpKey])

  const canSubmit =
    !previewLoading &&
    preview != null &&
    (preview.schedule?.valid ?? false) &&
    preview.unknownMcpIds.length === 0 &&
    preview.unknownSkillIds.length === 0 &&
    stepsCheck.ok &&
    (unhealthyServers.length === 0 || unhealthyOverride)

  const selectedServers = mcpServers.filter((s) => draft.mcpServerIds.includes(s.id))
  const selectedUnhealthy = selectedServers.filter(
    (s) => !(s.enabled && s.lastStatus === 'connected'),
  )

  return (
    <div
      className="mb-4 rounded-lg border border-border bg-canvas-subtle p-3"
      data-testid="cron-wizard"
    >
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-medium text-fg">
          {editingJob ? `Edit scheduled task: ${editingJob.name}` : 'New scheduled task'}
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

      {/* Stepper header */}
      <ol className="mb-3 flex flex-wrap items-center gap-1">
        {CRON_WIZARD_STEPS.map((label, i) => (
          <li key={label} className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => i < step && setStep(i)}
              disabled={i > step}
              className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] ${
                i === step
                  ? 'bg-accent text-white'
                  : i < step
                    ? 'text-accent hover:bg-accent-muted'
                    : 'text-fg-subtle'
              }`}
            >
              {i < step ? <Check size={10} /> : <span>{i + 1}.</span>}
              {label}
            </button>
            {i < CRON_WIZARD_STEPS.length - 1 && (
              <ChevronRight size={10} className="text-fg-subtle" />
            )}
          </li>
        ))}
      </ol>

      {/* Step 0 — Intent */}
      {step === 0 && (
        <div className="space-y-2">
          <label className={labelClass}>
            Task name
            <input
              value={draft.name}
              onChange={(e) => patch({ name: e.target.value })}
              placeholder="e.g. Morning digest"
              className={`${inputClass} mt-1`}
            />
          </label>
          <label className={labelClass}>
            What should this task do?
            <textarea
              value={draft.intent}
              onChange={(e) => patch({ intent: e.target.value })}
              placeholder="Natural-language goal — becomes the agent prompt…"
              rows={3}
              className={`${inputClass} mt-1`}
            />
          </label>
        </div>
      )}

      {/* Step 1 — Schedule */}
      {step === 1 && (
        <div className="space-y-2">
          <div className="flex flex-wrap gap-1">
            {CRON_SCHEDULE_PRESETS.map((p) => (
              <button
                key={p.expression}
                type="button"
                onClick={() => patch({ schedule: p.expression })}
                className={`rounded-full border px-2 py-0.5 text-[10px] ${
                  draft.schedule === p.expression
                    ? 'border-accent text-accent'
                    : 'border-border text-fg-muted hover:border-accent'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
          <label className={labelClass}>
            Schedule expression
            <input
              value={draft.schedule}
              onChange={(e) => patch({ schedule: e.target.value })}
              placeholder="0 9 * * *"
              className={`${inputClass} mt-1 font-mono`}
            />
          </label>
          <p className={`text-xs ${schedulePreview.valid ? 'text-fg-muted' : 'text-danger'}`}>
            {schedulePreview.preview}
          </p>
          <label className={labelClass}>
            Timezone
            <input
              value={draft.timezone}
              onChange={(e) => patch({ timezone: e.target.value })}
              list="cron-wizard-timezones"
              className={`${inputClass} mt-1`}
            />
            <datalist id="cron-wizard-timezones">
              {COMMON_TIMEZONES.map((tz) => (
                <option key={tz} value={tz} />
              ))}
            </datalist>
          </label>
        </div>
      )}

      {/* Step 2 — MCP servers */}
      {step === 2 && (
        <div className="space-y-2">
          <p className="text-xs text-fg-muted">
            Select the MCP servers this task may use. Leaving all unchecked means the task runs with
            <strong> no MCP tools</strong>.
          </p>
          {mcpServers.length === 0 ? (
            <div className="rounded border border-border p-3 text-xs text-fg-muted">
              No MCP servers connected yet.{' '}
              <Link
                to="/panel/$name"
                params={{ name: 'connections' }}
                className="text-accent hover:underline"
              >
                Open Connections
              </Link>{' '}
              to add one — or continue without MCP.
            </div>
          ) : (
            <ul className="space-y-1">
              {mcpServers.map((server) => {
                const selected = draft.mcpServerIds.includes(server.id)
                const healthy = server.enabled && server.lastStatus === 'connected'
                return (
                  <li key={server.id} className="rounded border border-border p-2">
                    <label className="flex cursor-pointer items-center gap-2 text-sm text-fg">
                      <input
                        type="checkbox"
                        checked={selected}
                        onChange={() =>
                          patch({ mcpServerIds: toggleId(draft.mcpServerIds, server.id) })
                        }
                      />
                      <span className={`h-2 w-2 rounded-full ${statusDot(server)}`} />
                      <span>{server.name}</span>
                      <span className="text-[10px] text-fg-subtle">{mcpServerStatusLabel(server)}</span>
                    </label>
                    {selected && !healthy && (
                      <div className="mt-1.5 flex items-start gap-1.5 rounded bg-canvas px-2 py-1.5 text-xs text-attention">
                        <AlertTriangle size={12} className="mt-0.5 shrink-0" />
                        <div>
                          <p>
                            This server is {mcpServerStatusLabel(server).toLowerCase()}
                            {server.lastError ? `: ${server.lastError}` : ''}. The task may fail at
                            fire time.
                          </p>
                          <button
                            type="button"
                            onClick={() => testConnection.mutate(server.id)}
                            disabled={testConnection.isPending}
                            className="mt-1 text-accent hover:underline disabled:opacity-50"
                          >
                            {testConnection.isPending ? 'Testing…' : 'Test connection'}
                          </button>
                        </div>
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      )}

      {/* Step 3 — Skills */}
      {step === 3 && (
        <div className="space-y-2">
          <p className="text-xs text-fg-muted">
            Selected skills are <strong>always injected</strong> into the task's context (not just
            similarity-matched).
          </p>
          {skills.length > 0 && (
            <ul className="max-h-48 space-y-1 overflow-y-auto">
              {skills.map((skill) => (
                <li key={skill.id}>
                  <label className="flex cursor-pointer items-center gap-2 rounded border border-border p-2 text-sm text-fg">
                    <input
                      type="checkbox"
                      checked={draft.skillIds.includes(skill.id)}
                      onChange={() => patch({ skillIds: toggleId(draft.skillIds, skill.id) })}
                    />
                    <span>{skill.name}</span>
                    {skill.description && (
                      <span className="truncate text-[10px] text-fg-subtle">
                        {skill.description}
                      </span>
                    )}
                  </label>
                </li>
              ))}
            </ul>
          )}

          {showCreateSkill ? (
            <div className="space-y-1.5 rounded border border-border p-2">
              <p className="text-xs font-medium text-fg">Create skill</p>
              <input
                value={newSkill.name}
                onChange={(e) => setNewSkill((s) => ({ ...s, name: e.target.value }))}
                placeholder="Skill name"
                className={inputClass}
              />
              <input
                value={newSkill.description}
                onChange={(e) => setNewSkill((s) => ({ ...s, description: e.target.value }))}
                placeholder="Description (optional)"
                className={inputClass}
              />
              <textarea
                value={newSkill.bodyMd}
                onChange={(e) => setNewSkill((s) => ({ ...s, bodyMd: e.target.value }))}
                placeholder="Skill body (markdown)…"
                rows={3}
                className={inputClass}
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={!newSkill.name.trim() || createSkill.isPending}
                  onClick={() => createSkill.mutate()}
                  className="rounded bg-accent px-2 py-1 text-xs text-white disabled:opacity-50"
                >
                  {createSkill.isPending ? 'Creating…' : 'Create and select'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowCreateSkill(false)}
                  className="text-xs text-fg-muted hover:underline"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setShowCreateSkill(true)}
              className="inline-flex items-center gap-1 text-xs text-accent hover:underline"
            >
              <Plus size={12} /> Create skill
            </button>
          )}

          {skills.length === 0 && draft.skillIds.length === 0 && (
            <label className="flex items-center gap-2 text-xs text-fg-muted">
              <input
                type="checkbox"
                checked={draft.noSkillsConfirmed}
                onChange={(e) => patch({ noSkillsConfirmed: e.target.checked })}
              />
              Run this task without any skills
            </label>
          )}
        </div>
      )}

      {/* Step 4 — Policy */}
      {step === 4 && (
        <div className="space-y-2">
          <label className={labelClass}>
            Profile
            <select
              value={draft.profileId ?? ''}
              onChange={(e) => patch({ profileId: e.target.value || null })}
              className={`${inputClass} mt-1`}
            >
              <option value="">Default profile</option>
              {(profiles ?? []).map((p) => (
                <option key={p.id} value={p.id} title={p.model}>
                  {p.name} ({modelLabel(p.model)})
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2 text-sm text-fg">
            <input
              type="checkbox"
              checked={draft.headlessAutoApprove}
              onChange={(e) => patch({ headlessAutoApprove: e.target.checked })}
            />
            Auto-approve tool calls for this headless run
          </label>
          <label className="flex items-center gap-2 text-sm text-fg">
            <input
              type="checkbox"
              checked={draft.retryEnabled}
              onChange={(e) => patch({ retryEnabled: e.target.checked })}
            />
            Retry on failure
          </label>
          {draft.retryEnabled && (
            <div className="flex gap-2 pl-6">
              <label className={labelClass}>
                Max attempts
                <input
                  type="number"
                  min={1}
                  max={10}
                  value={draft.maxAttempts}
                  onChange={(e) => patch({ maxAttempts: Number(e.target.value) })}
                  className={`${inputClass} mt-1 w-24`}
                />
              </label>
              <label className={labelClass}>
                Backoff (sec)
                <input
                  type="number"
                  min={0}
                  max={3600}
                  value={draft.backoffSec}
                  onChange={(e) => patch({ backoffSec: Number(e.target.value) })}
                  className={`${inputClass} mt-1 w-24`}
                />
              </label>
            </div>
          )}
          <details>
            <summary className="cursor-pointer text-xs text-fg-muted">
              Advanced: workflow steps (JSON)
            </summary>
            <p className="mt-1 text-[10px] text-fg-subtle">
              Optional array of steps: {'{ id, label, type: "skill"|"mcp"|"prompt", skillId?,'}
              {' mcpServerId?, toolName?, prompt?, parallelGroup?, dependsOn? }'}. Stored and
              displayed; DAG execution comes later.
            </p>
            <textarea
              value={draft.stepsJson}
              onChange={(e) => patch({ stepsJson: e.target.value })}
              placeholder='[{"id":"fetch","label":"Fetch data","type":"mcp"}]'
              rows={4}
              className={`${inputClass} mt-1 font-mono`}
            />
            {!stepsCheck.ok && <p className="mt-1 text-xs text-danger">{stepsCheck.error}</p>}
          </details>
        </div>
      )}

      {/* Step 5 — Review */}
      {isReview && (
        <div className="space-y-2">
          <dl className="space-y-1 rounded border border-border p-2 text-xs">
            <div className="flex gap-2">
              <dt className="w-24 shrink-0 text-fg-subtle">Name</dt>
              <dd className="text-fg">{draft.name}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="w-24 shrink-0 text-fg-subtle">Schedule</dt>
              <dd className="text-fg">
                <code>{draft.schedule}</code> ({draft.timezone}) —{' '}
                {previewLoading
                  ? 'validating…'
                  : preview?.schedule?.valid
                    ? preview.schedule.preview
                    : (preview?.schedule?.preview ?? schedulePreview.preview)}
              </dd>
            </div>
            <div className="flex gap-2">
              <dt className="w-24 shrink-0 text-fg-subtle">Goal</dt>
              <dd className="whitespace-pre-wrap text-fg">{draft.intent}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="w-24 shrink-0 text-fg-subtle">MCP servers</dt>
              <dd className="text-fg">
                {draft.mcpServerIds.length === 0
                  ? 'None (no MCP tools)'
                  : (preview?.mcpServers ?? selectedServers).map((s) => (
                      <span key={s.id} className="mr-2 inline-flex items-center gap-1">
                        <span
                          className={`inline-block h-2 w-2 rounded-full ${
                            'healthy' in s
                              ? s.healthy
                                ? 'bg-success'
                                : 'bg-danger'
                              : statusDot(s as McpServer)
                          }`}
                        />
                        {s.name}
                      </span>
                    ))}
              </dd>
            </div>
            <div className="flex gap-2">
              <dt className="w-24 shrink-0 text-fg-subtle">Skills</dt>
              <dd className="text-fg">
                {draft.skillIds.length === 0
                  ? 'None'
                  : (preview?.skills ?? []).map((s) => s.name).join(', ') ||
                    `${draft.skillIds.length} selected`}
              </dd>
            </div>
            <div className="flex gap-2">
              <dt className="w-24 shrink-0 text-fg-subtle">Policy</dt>
              <dd className="text-fg">
                {draft.headlessAutoApprove ? 'Auto-approve' : 'Approval-gated'}
                {draft.retryEnabled
                  ? `, retry ×${draft.maxAttempts} (${draft.backoffSec}s backoff)`
                  : ''}
              </dd>
            </div>
            {stepsCheck.ok && stepsCheck.steps.length > 0 && (
              <div className="flex gap-2">
                <dt className="w-24 shrink-0 text-fg-subtle">Steps</dt>
                <dd className="text-fg">
                  {stepsCheck.steps.map((s) => s.label).join(' → ')}
                </dd>
              </div>
            )}
          </dl>

          {(preview?.unknownMcpIds.length || preview?.unknownSkillIds.length) ? (
            <div className="rounded border border-danger p-2 text-xs text-danger">
              Some selected bindings no longer exist:{' '}
              {[
                ...(preview?.unknownMcpIds ?? []),
                ...(preview?.unknownSkillIds ?? []),
              ]
                .map((id) => shortenId(id))
                .join(', ')}
              . Go back and adjust your selection.
            </div>
          ) : null}

          {unhealthyServers.length > 0 && (
            <div
              className="space-y-1.5 rounded border border-attention p-2 text-xs"
              data-testid="cron-review-unhealthy"
            >
              <p className="flex items-center gap-1.5 font-medium text-attention">
                <AlertTriangle size={12} />
                {unhealthyServers.length} selected MCP server
                {unhealthyServers.length > 1 ? 's are' : ' is'} unreachable
              </p>
              <ul className="space-y-0.5 text-fg-muted">
                {unhealthyServers.map((s) => (
                  <li key={s.id}>
                    <span className="text-fg">{s.name}</span> —{' '}
                    {connectionStatusLabel(s.lastStatus ?? null)}
                    {s.lastError ? `: ${s.lastError}` : ''}
                  </li>
                ))}
              </ul>
              <div className="flex flex-wrap gap-2 pt-1">
                <Link
                  to="/panel/$name"
                  params={{ name: 'connections' }}
                  className="rounded border border-border px-2 py-1 text-accent hover:bg-accent-muted"
                >
                  Fix now
                </Link>
                <button
                  type="button"
                  onClick={() => setUnhealthyOverride(true)}
                  className={`rounded border px-2 py-1 ${
                    unhealthyOverride
                      ? 'border-attention text-attention'
                      : 'border-border text-fg-muted hover:border-attention hover:text-attention'
                  }`}
                >
                  {unhealthyOverride ? 'Will create anyway' : editingJob ? 'Save anyway' : 'Create anyway'}
                </button>
                <button
                  type="button"
                  onClick={() =>
                    patch({
                      mcpServerIds: draft.mcpServerIds.filter(
                        (id) => !unhealthyServers.some((s) => s.id === id),
                      ),
                    })
                  }
                  className="rounded border border-border px-2 py-1 text-fg-muted hover:text-danger"
                >
                  Remove from task
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Footer nav */}
      <div className="mt-3 flex items-center justify-between border-t border-border pt-2">
        <button
          type="button"
          onClick={() => (step === 0 ? onClose() : setStep((s) => s - 1))}
          className="inline-flex items-center gap-1 text-xs text-fg-muted hover:text-fg"
        >
          <ChevronLeft size={12} /> {step === 0 ? 'Cancel' : 'Back'}
        </button>
        <div className="flex items-center gap-2">
          {stepError && step !== 2 && <span className="text-[10px] text-danger">{stepError}</span>}
          {!isReview ? (
            <button
              type="button"
              disabled={stepError != null}
              onClick={() => setStep((s) => s + 1)}
              className="inline-flex items-center gap-1 rounded bg-accent px-3 py-1 text-xs text-white disabled:opacity-50"
              data-testid="cron-wizard-continue"
            >
              Continue <ChevronRight size={12} />
            </button>
          ) : (
            <button
              type="button"
              disabled={!canSubmit || save.isPending}
              onClick={() => save.mutate()}
              className="rounded bg-accent px-3 py-1 text-xs text-white disabled:opacity-50"
              data-testid="cron-wizard-submit"
            >
              {save.isPending
                ? 'Saving…'
                : editingJob
                  ? selectedUnhealthy.length && unhealthyOverride
                    ? 'Save with warnings'
                    : 'Save changes'
                  : selectedUnhealthy.length && unhealthyOverride
                    ? 'Create with warnings'
                    : 'Create scheduled task'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
