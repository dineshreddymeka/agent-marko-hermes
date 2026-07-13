/**
 * Cowork panel — Work requests + Hermes scheduled tasks (read/manage via /api/cron/jobs*).
 */
import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { History, Pause, Play, Trash2 } from 'lucide-react'
import { useUiStore } from '@app/stores/ui'
import { previewCronSchedule } from '@app/lib/panels'
import {
  CRON_WIZARD_DESCOPE_MESSAGE,
  deleteHermesCronJob,
  fetchHermesCronJobs,
  fetchHermesCronRuns,
  filterCronJobsBySkill,
  pauseHermesCronJob,
  resumeHermesCronJob,
  triggerHermesCronJob,
  type CronJobView,
} from '@app/lib/panels/cron-api'
import type { CronRun } from '@hermes/shared'
import { EmptyState } from '@app/components/common/EmptyState'
import { Skeleton } from '@app/components/common/Skeleton'
import { formatRelativeTime } from '@app/lib/utils'
import { cronRunStatusLabel } from '@app/lib/labels'
import { CoworkWorkRequests } from '@app/components/panels/CoworkWorkRequests'

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

/** Cowork panel: Work requests (default) + Scheduled (Hermes cron jobs). */
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

function ScheduledCronContent() {
  const addToast = useUiStore((s) => s.addToast)
  const queryClient = useQueryClient()
  const [historyJobId, setHistoryJobId] = useState<string | null>(null)
  const [filterSkillName, setFilterSkillName] = useState('')

  const { data: jobs, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['cron', 'hermes'],
    queryFn: () => fetchHermesCronJobs('all'),
    retry: false,
  })

  const historyJob = useMemo(
    () => jobs?.find((job) => job.id === historyJobId) ?? null,
    [jobs, historyJobId],
  )

  const { data: runs } = useQuery({
    queryKey: ['cron-runs', historyJobId, historyJob?.profileId],
    queryFn: () => fetchHermesCronRuns(historyJob!),
    enabled: !!historyJob,
    retry: false,
  })

  const filteredJobs = useMemo(
    () => filterCronJobsBySkill(jobs ?? [], filterSkillName),
    [jobs, filterSkillName],
  )

  const skillFilterOptions = useMemo(() => {
    const names = new Set<string>()
    for (const job of jobs ?? []) {
      for (const skill of job.skillIds) names.add(skill)
    }
    return [...names].sort((a, b) => a.localeCompare(b))
  }, [jobs])

  const toggle = useMutation({
    mutationFn: (job: CronJobView) =>
      job.enabled ? pauseHermesCronJob(job) : resumeHermesCronJob(job),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['cron'] }),
    onError: () => addToast({ title: 'Toggle failed', variant: 'danger' }),
  })

  const runNow = useMutation({
    mutationFn: (job: CronJobView) => triggerHermesCronJob(job),
    onSuccess: () => addToast({ title: 'Scheduled task started', variant: 'success' }),
    onError: () => addToast({ title: 'Run failed', variant: 'danger' }),
  })

  const remove = useMutation({
    mutationFn: (job: CronJobView) => deleteHermesCronJob(job),
    onSuccess: () => {
      addToast({ title: 'Scheduled task deleted', variant: 'success' })
      void queryClient.invalidateQueries({ queryKey: ['cron'] })
    },
    onError: () => addToast({ title: 'Delete failed', variant: 'danger' }),
  })

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
      <div className="mb-4 flex items-center justify-between gap-2">
        <h2 className="text-sm font-medium text-fg">Scheduled</h2>
        <span
          className="text-[10px] text-fg-subtle"
          title={CRON_WIZARD_DESCOPE_MESSAGE}
          data-testid="cron-wizard-disabled"
        >
          Create/edit via Hermes dashboard or <code className="text-fg-muted">hermes cron</code>
        </span>
      </div>

      <p
        className="mb-3 rounded border border-border bg-canvas-subtle px-2 py-1.5 text-xs text-fg-muted"
        data-testid="cron-wizard-descope-banner"
      >
        {CRON_WIZARD_DESCOPE_MESSAGE} Use the Hermes cron dashboard or CLI to add or edit jobs.
      </p>

      {skillFilterOptions.length > 0 && (
        <div className="mb-3">
          <select
            value={filterSkillName}
            onChange={(e) => setFilterSkillName(e.target.value)}
            className="rounded border border-border bg-canvas px-2 py-1 text-xs text-fg-muted"
            title="Filter by skill"
          >
            <option value="">All skills</option>
            {skillFilterOptions.map((name) => (
              <option key={name} value={name}>
                Skill: {name}
              </option>
            ))}
          </select>
        </div>
      )}

      {!filteredJobs.length ? (
        <EmptyState
          title="No scheduled tasks"
          description={
            filterSkillName
              ? 'No tasks match this skill filter.'
              : 'Schedule recurring tasks with Hermes cron.'
          }
        />
      ) : (
        <ul className="space-y-2">
          {filteredJobs.map((job) => (
            <CronJobCard
              key={`${job.profileId ?? 'default'}:${job.id}`}
              job={job}
              runs={historyJobId === job.id ? runs : undefined}
              historyOpen={historyJobId === job.id}
              onToggleHistory={() =>
                setHistoryJobId((id) => (id === job.id ? null : job.id))
              }
              onToggle={() => toggle.mutate(job)}
              onRunNow={() => runNow.mutate(job)}
              onDelete={() => {
                if (confirm(`Delete scheduled task “${job.name}”?`)) remove.mutate(job)
              }}
              togglePending={toggle.isPending}
              runPending={runNow.isPending}
            />
          ))}
        </ul>
      )}
    </div>
  )
}

function CronJobCard({
  job,
  runs,
  historyOpen,
  onToggleHistory,
  onToggle,
  onRunNow,
  onDelete,
  togglePending,
  runPending,
}: {
  job: CronJobView
  runs?: CronRun[]
  historyOpen: boolean
  onToggleHistory: () => void
  onToggle: () => void
  onRunNow: () => void
  onDelete: () => void
  togglePending: boolean
  runPending: boolean
}) {
  const schedulePreview = previewCronSchedule(job.schedule)
  const displaySchedule = job.hermes.scheduleDisplay ?? job.schedule

  return (
    <li className="rounded-lg border border-border p-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-medium text-fg">{job.name}</h3>
          <code className="text-xs text-fg-muted">{displaySchedule}</code>
          {schedulePreview.valid && (
            <p className="mt-0.5 text-[10px] text-fg-subtle">{schedulePreview.preview}</p>
          )}
        </div>
        <div className="flex flex-wrap gap-1">
          <button
            type="button"
            onClick={onToggle}
            disabled={togglePending}
            className="rounded p-1 text-fg-muted hover:bg-canvas-subtle disabled:opacity-50"
            title={job.enabled ? 'Disable' : 'Enable'}
          >
            {job.enabled ? <Pause size={14} /> : <Play size={14} />}
          </button>
          <button
            type="button"
            onClick={onRunNow}
            disabled={runPending}
            className="rounded px-2 py-0.5 text-xs text-accent hover:bg-accent-muted disabled:opacity-50"
          >
            Run now
          </button>
          <button
            type="button"
            onClick={onToggleHistory}
            className="rounded p-1 text-fg-muted hover:bg-canvas-subtle"
            title="History"
          >
            <History size={14} />
          </button>
          <button
            type="button"
            onClick={onDelete}
            className="rounded p-1 text-fg-muted hover:text-danger"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      <p className="mt-1 truncate text-xs text-fg-muted">{job.prompt}</p>

      <div className="mt-1.5 flex flex-wrap gap-1">
        {job.profileId && (
          <span className="rounded-full border border-border px-1.5 py-0.5 text-[10px] text-fg-muted">
            Profile: {job.profileId}
          </span>
        )}
        {job.hermes.deliver && job.hermes.deliver !== 'local' && (
          <span className="rounded-full border border-border px-1.5 py-0.5 text-[10px] text-fg-muted">
            Deliver: {job.hermes.deliver}
          </span>
        )}
        {job.skillIds.map((name) => (
          <span
            key={name}
            className="rounded-full border border-border px-1.5 py-0.5 text-[10px] text-fg-muted"
          >
            Skill: {name}
          </span>
        ))}
        {job.hermes.lastStatus && (
          <span className="rounded-full border border-border px-1.5 py-0.5 text-[10px] text-fg-muted">
            Last status: {job.hermes.lastStatus}
          </span>
        )}
      </div>

      <div className="mt-1 flex gap-3 text-[10px] text-fg-subtle">
        {job.lastRun && <span>Last: {formatRelativeTime(job.lastRun)}</span>}
        {job.nextRun && <span>Next: {formatRelativeTime(job.nextRun)}</span>}
        <span>{job.enabled ? 'Enabled' : 'Disabled'}</span>
        {job.hermes.state && <span>{job.hermes.state}</span>}
      </div>

      {job.hermes.lastError && (
        <p className="mt-1 text-xs text-danger">{job.hermes.lastError}</p>
      )}

      {historyOpen && (
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
  )
}
