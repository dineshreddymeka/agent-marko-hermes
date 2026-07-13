/**
 * Open Jarvis — Smart Cron wizard logic (pure helpers, unit-testable).
 * Author: Dinesh Reddy Meka
 */
import {
  cronWorkflowSchema,
  type CronJob,
  type CronWorkflow,
  type CronWorkflowStep,
} from '@hermes/shared'

export const CRON_WIZARD_STEPS = [
  'Intent',
  'Schedule',
  'MCP servers',
  'Skills',
  'Policy',
  'Review',
] as const

export type CronScheduePreset = { label: string; expression: string }

export const CRON_SCHEDULE_PRESETS: CronScheduePreset[] = [
  { label: 'Every 15 min', expression: '*/15 * * * *' },
  { label: 'Hourly', expression: '0 * * * *' },
  { label: 'Daily 9am', expression: '0 9 * * *' },
  { label: 'Weekdays 9am', expression: '0 9 * * 1-5' },
  { label: 'Weekly Mon 9am', expression: '0 9 * * 1' },
]

export const COMMON_TIMEZONES = [
  'UTC',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'Europe/London',
  'Europe/Berlin',
  'Asia/Kolkata',
  'Asia/Tokyo',
  'Australia/Sydney',
]

export type CronWizardDraft = {
  name: string
  intent: string
  schedule: string
  timezone: string
  mcpServerIds: string[]
  skillIds: string[]
  /** Explicit "run with no skills" confirmation when the catalog is empty. */
  noSkillsConfirmed: boolean
  profileId: string | null
  headlessAutoApprove: boolean
  retryEnabled: boolean
  maxAttempts: number
  backoffSec: number
  /** Optional advanced steps JSON (array of CronWorkflowStep). */
  stepsJson: string
  createSkillRequests: { name: string; description?: string; bodyMd?: string }[]
}

export function emptyCronDraft(): CronWizardDraft {
  return {
    name: '',
    intent: '',
    schedule: '0 9 * * *',
    timezone: 'UTC',
    mcpServerIds: [],
    skillIds: [],
    noSkillsConfirmed: false,
    profileId: null,
    headlessAutoApprove: false,
    retryEnabled: false,
    maxAttempts: 3,
    backoffSec: 60,
    stepsJson: '',
    createSkillRequests: [],
  }
}

/** Prefill the wizard from an existing job (edit mode). */
export function draftFromJob(job: CronJob): CronWizardDraft {
  const wf = job.workflow
  return {
    name: job.name,
    intent: wf.intent ?? job.prompt,
    schedule: job.schedule,
    timezone: job.timezone || wf.timezone || 'UTC',
    mcpServerIds: [...(job.mcpServerIds ?? [])],
    skillIds: [...(job.skillIds ?? [])],
    noSkillsConfirmed: (job.skillIds ?? []).length === 0,
    profileId: job.profileId ?? wf.profileId ?? null,
    headlessAutoApprove: wf.headlessAutoApprove ?? false,
    retryEnabled: wf.retry != null,
    maxAttempts: wf.retry?.maxAttempts ?? 3,
    backoffSec: wf.retry?.backoffSec ?? 60,
    stepsJson: wf.steps?.length ? JSON.stringify(wf.steps, null, 2) : '',
    createSkillRequests: [...(wf.createSkillRequests ?? [])],
  }
}

export type ParseStepsResult =
  | { ok: true; steps: CronWorkflowStep[] }
  | { ok: false; error: string }

/** Validate the advanced steps JSON (empty string = no steps). */
export function parseStepsJson(input: string): ParseStepsResult {
  const trimmed = input.trim()
  if (!trimmed) return { ok: true, steps: [] }
  let raw: unknown
  try {
    raw = JSON.parse(trimmed)
  } catch {
    return { ok: false, error: 'Steps must be valid JSON' }
  }
  // Validate through the shared workflow schema (avoids a direct zod dep here).
  const parsed = cronWorkflowSchema.safeParse({ version: 1, steps: raw })
  if (!parsed.success) {
    const first = parsed.error.issues[0]
    return {
      ok: false,
      error: first ? `${first.path.join('.')}: ${first.message}` : 'Invalid steps',
    }
  }
  return { ok: true, steps: parsed.data.steps ?? [] }
}

export function toggleId(list: string[], id: string): string[] {
  return list.includes(id) ? list.filter((x) => x !== id) : [...list, id]
}

/**
 * Per-step gate for the Continue button. Returns an error message when the
 * step is incomplete, null when the user may advance.
 */
export function validateWizardStep(
  step: number,
  draft: CronWizardDraft,
  opts: { scheduleValid: boolean; skillsAvailable: number },
): string | null {
  switch (step) {
    case 0:
      if (!draft.name.trim()) return 'Task name is required'
      if (!draft.intent.trim()) return 'Describe what this task should do'
      return null
    case 1:
      if (!opts.scheduleValid) return 'Enter a valid schedule expression'
      if (!draft.timezone.trim()) return 'Timezone is required'
      return null
    case 2:
      return null // zero MCP servers is a valid choice (means: no MCP tools)
    case 3:
      if (draft.skillIds.length > 0) return null
      if (opts.skillsAvailable === 0 && !draft.noSkillsConfirmed) {
        return 'Create a skill or explicitly confirm running without skills'
      }
      return null
    case 4:
      if (draft.retryEnabled) {
        if (!Number.isInteger(draft.maxAttempts) || draft.maxAttempts < 1 || draft.maxAttempts > 10) {
          return 'Max attempts must be 1–10'
        }
        if (!Number.isInteger(draft.backoffSec) || draft.backoffSec < 0 || draft.backoffSec > 3600) {
          return 'Backoff must be 0–3600 seconds'
        }
      }
      return null
    default:
      return null
  }
}

export type CronCreatePayload = {
  name: string
  schedule: string
  prompt: string
  timezone: string
  enabled: boolean
  profileId: string | null
  workflow: CronWorkflow
}

/** Build the REST payload (POST or PATCH /api/cron) from a completed draft. */
export function buildCronPayload(draft: CronWizardDraft, enabled = true): CronCreatePayload {
  const steps = parseStepsJson(draft.stepsJson)
  const workflow: CronWorkflow = {
    version: 1,
    intent: draft.intent.trim(),
    timezone: draft.timezone.trim() || 'UTC',
    mcpServerIds: draft.mcpServerIds,
    skillIds: draft.skillIds,
    profileId: draft.profileId,
    headlessAutoApprove: draft.headlessAutoApprove,
    ui: { wizardCompletedAt: new Date().toISOString() },
  }
  if (draft.retryEnabled) {
    workflow.retry = { maxAttempts: draft.maxAttempts, backoffSec: draft.backoffSec }
  }
  if (steps.ok && steps.steps.length) workflow.steps = steps.steps
  if (draft.createSkillRequests.length) workflow.createSkillRequests = draft.createSkillRequests
  return {
    name: draft.name.trim(),
    schedule: draft.schedule.trim(),
    prompt: draft.intent.trim(),
    timezone: workflow.timezone,
    enabled,
    profileId: draft.profileId,
    workflow,
  }
}
