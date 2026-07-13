/**
 * Hermes /api/cron/jobs* client + DTO mapping for the Marko CronPanel.
 * Maps Hermes cron job/session shapes onto shared CronJob/CronRun DTOs.
 */
import { api } from '@app/lib/api'
import { descopedFeatureMessage } from '@app/lib/hermes-adapters'
import { DEFAULT_CRON_WORKFLOW } from '@hermes/shared'
import type { CronJob, CronRun } from '@hermes/shared'

export const CRON_WIZARD_DESCOPE_MESSAGE = descopedFeatureMessage(
  'The guided cron wizard (create/edit)',
)

type HermesCronSchedule = {
  kind?: string
  expr?: string
  run_at?: string
  display?: string
}

export type HermesCronJobRow = {
  id?: string
  name?: string | null
  prompt?: string | null
  skills?: string[] | null
  schedule?: HermesCronSchedule | string | null
  schedule_display?: string | null
  enabled?: boolean
  profile?: string | null
  profile_name?: string | null
  last_run_at?: string | null
  next_run_at?: string | null
  last_status?: string | null
  last_error?: string | null
  deliver?: string | null
  state?: string | null
  created_at?: string | null
}

export type HermesCronRunRow = {
  id?: string
  started_at?: number | string | null
  ended_at?: number | string | null
  end_reason?: string | null
  preview?: string | null
}

export type HermesCronRunsResponse = {
  runs?: HermesCronRunRow[]
  limit?: number
}

/** Extra Hermes fields preserved for list rendering (not on shared CronJob). */
export type CronJobHermesMeta = {
  deliver: string | null
  lastStatus: string | null
  lastError: string | null
  state: string | null
  scheduleDisplay: string | null
}

export type CronJobView = CronJob & { hermes: CronJobHermesMeta }

function tsToIso(value: unknown): string | null {
  if (value == null || value === '') return null
  if (typeof value === 'number' && Number.isFinite(value)) {
    return new Date(value * (value < 1e12 ? 1000 : 1)).toISOString()
  }
  if (typeof value === 'string') {
    const n = Number(value)
    if (Number.isFinite(n)) return tsToIso(n)
    const d = new Date(value)
    if (!Number.isNaN(d.getTime())) return d.toISOString()
  }
  return null
}

export function scheduleExpression(row: HermesCronJobRow): string {
  const sched = row.schedule
  if (typeof sched === 'string' && sched.trim()) return sched.trim()
  if (sched && typeof sched === 'object') {
    if (sched.expr) return String(sched.expr)
    if (sched.run_at) return String(sched.run_at)
    if (sched.display) return String(sched.display)
  }
  return (row.schedule_display ?? '').trim() || '—'
}

export function hermesCronJobToDto(row: HermesCronJobRow): CronJobView {
  const skills = Array.isArray(row.skills) ? row.skills.filter(Boolean).map(String) : []
  const prompt = (row.prompt ?? '').trim()
  const profileId = row.profile_name ?? row.profile ?? null
  const scheduleDisplay = (row.schedule_display ?? '').trim() || null

  return {
    id: String(row.id ?? ''),
    name: (row.name && String(row.name).trim()) || 'Scheduled task',
    schedule: scheduleExpression(row),
    prompt,
    profileId: profileId ? String(profileId) : null,
    enabled: row.enabled !== false,
    lastRun: tsToIso(row.last_run_at),
    nextRun: tsToIso(row.next_run_at),
    timezone: 'UTC',
    workflow: {
      ...DEFAULT_CRON_WORKFLOW,
      intent: prompt || undefined,
      skillIds: skills,
    },
    mcpServerIds: [],
    skillIds: skills,
    updatedAt: tsToIso(row.created_at),
    hermes: {
      deliver: row.deliver ? String(row.deliver) : null,
      lastStatus: row.last_status ? String(row.last_status) : null,
      lastError: row.last_error ? String(row.last_error) : null,
      state: row.state ? String(row.state) : null,
      scheduleDisplay,
    },
  }
}

export function hermesCronRunToDto(row: HermesCronRunRow, jobId: string): CronRun {
  const ended = row.ended_at != null && row.ended_at !== ''
  let status = 'running'
  if (ended) {
    const reason = String(row.end_reason ?? '').toLowerCase()
    if (reason.includes('error') || reason.includes('fail')) status = 'failed'
    else if (reason.includes('cancel') || reason.includes('abort')) status = 'cancelled'
    else status = 'success'
  }
  return {
    id: String(row.id ?? `${jobId}-run`),
    jobId,
    startedAt: tsToIso(row.started_at) ?? new Date().toISOString(),
    finishedAt: tsToIso(row.ended_at),
    status,
    sessionId: row.id ? String(row.id) : null,
    error: null,
    detail: row.preview ? { preview: row.preview } : null,
  }
}

export function filterCronJobsBySkill(jobs: CronJobView[], skillName: string): CronJobView[] {
  const needle = skillName.trim()
  if (!needle) return jobs
  return jobs.filter((job) => job.skillIds.includes(needle))
}

export async function fetchHermesCronJobs(profile = 'all'): Promise<CronJobView[]> {
  const rows = await api<HermesCronJobRow[]>('/api/cron/jobs', {
    params: { profile },
  })
  return (rows ?? []).map(hermesCronJobToDto).filter((job) => job.id)
}

export async function fetchHermesCronRuns(
  job: Pick<CronJob, 'id' | 'profileId'>,
  limit = 20,
): Promise<CronRun[]> {
  const data = await api<HermesCronRunsResponse>(
    `/api/cron/jobs/${encodeURIComponent(job.id)}/runs`,
    {
      params: {
        ...(job.profileId ? { profile: job.profileId } : {}),
        limit,
      },
    },
  )
  return (data.runs ?? []).map((row) => hermesCronRunToDto(row, job.id))
}

async function cronJobMutation(
  job: Pick<CronJob, 'id' | 'profileId'>,
  action: 'pause' | 'resume' | 'trigger',
): Promise<void> {
  await api(`/api/cron/jobs/${encodeURIComponent(job.id)}/${action}`, {
    method: 'POST',
    params: job.profileId ? { profile: job.profileId } : undefined,
  })
}

export async function pauseHermesCronJob(job: Pick<CronJob, 'id' | 'profileId'>): Promise<void> {
  await cronJobMutation(job, 'pause')
}

export async function resumeHermesCronJob(job: Pick<CronJob, 'id' | 'profileId'>): Promise<void> {
  await cronJobMutation(job, 'resume')
}

export async function triggerHermesCronJob(job: Pick<CronJob, 'id' | 'profileId'>): Promise<void> {
  await cronJobMutation(job, 'trigger')
}

export async function deleteHermesCronJob(job: Pick<CronJob, 'id' | 'profileId'>): Promise<void> {
  await api(`/api/cron/jobs/${encodeURIComponent(job.id)}`, {
    method: 'DELETE',
    params: job.profileId ? { profile: job.profileId } : undefined,
  })
}
