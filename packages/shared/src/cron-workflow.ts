/**
 * Open Jarvis — Smart Cron enterprise workflow config (JSONB shape).
 * Author: Dinesh Reddy Meka
 *
 * Zod-validated at the REST boundary; persisted in `cron_jobs.workflow` with
 * `mcp_server_ids` / `skill_ids` denormalized into uuid[] columns for fast filters.
 */
import { z } from 'zod'

/**
 * Optional declarative workflow step. Steps are persisted and displayed;
 * full DAG execution (parallelGroup / dependsOn ordering) is a later phase.
 */
export const cronWorkflowStepSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  type: z.enum(['skill', 'mcp', 'prompt']),
  skillId: z.string().uuid().optional(),
  mcpServerId: z.string().uuid().optional(),
  toolName: z.string().optional(),
  prompt: z.string().optional(),
  /** Steps sharing a parallelGroup may run concurrently (declarative only for now). */
  parallelGroup: z.string().optional(),
  /** Step ids this step depends on (declarative only for now). */
  dependsOn: z.array(z.string()).optional(),
})

export const cronWorkflowRetrySchema = z.object({
  maxAttempts: z.number().int().min(1).max(10),
  backoffSec: z.number().int().min(0).max(3600),
})

/** Built-in maintenance jobs (deterministic runners; not LLM prompts). */
export const cronSystemKindSchema = z.enum(['db-consistency', 'bug-bounty', 'status-auto-approve'])
export type CronSystemKind = z.infer<typeof cronSystemKindSchema>

export const cronWorkflowSchema = z.object({
  version: z.literal(1),
  intent: z.string().optional(),
  /**
   * When set, the scheduler runs a deterministic maintenance handler instead of
   * an LLM turn. Used for built-in DB consistency + bug-bounty jobs.
   */
  systemKind: cronSystemKindSchema.optional(),
  timezone: z.string().min(1).default('UTC'),
  /** Denormalized into cron_jobs.mcp_server_ids. Empty array = NO MCP tools at fire time. */
  mcpServerIds: z.array(z.string().uuid()).default([]),
  /** Denormalized into cron_jobs.skill_ids. Forced (always injected) skills. */
  skillIds: z.array(z.string().uuid()).default([]),
  createSkillRequests: z
    .array(
      z.object({
        name: z.string().min(1),
        description: z.string().optional(),
        bodyMd: z.string().optional(),
      }),
    )
    .optional(),
  profileId: z.string().uuid().nullable().optional(),
  headlessAutoApprove: z.boolean().default(false),
  retry: cronWorkflowRetrySchema.optional(),
  steps: z.array(cronWorkflowStepSchema).optional(),
  ui: z.object({ wizardCompletedAt: z.string().optional() }).optional(),
})

export type CronWorkflowStep = z.infer<typeof cronWorkflowStepSchema>
export type CronWorkflowRetry = z.infer<typeof cronWorkflowRetrySchema>
export type CronWorkflow = z.infer<typeof cronWorkflowSchema>

export const DEFAULT_CRON_WORKFLOW: CronWorkflow = {
  version: 1,
  timezone: 'UTC',
  mcpServerIds: [],
  skillIds: [],
  headlessAutoApprove: false,
}

export type ParseCronWorkflowResult =
  | { ok: true; workflow: CronWorkflow }
  | { ok: false; error: string }

/** Parse unknown JSONB into a CronWorkflow, tolerating empty objects (legacy rows). */
export function parseCronWorkflow(input: unknown): ParseCronWorkflowResult {
  if (input == null || (typeof input === 'object' && Object.keys(input as object).length === 0)) {
    return { ok: true, workflow: { ...DEFAULT_CRON_WORKFLOW } }
  }
  const result = cronWorkflowSchema.safeParse(input)
  if (!result.success) {
    const first = result.error.issues[0]
    return {
      ok: false,
      error: first ? `${first.path.join('.') || '(root)'}: ${first.message}` : 'Invalid workflow',
    }
  }
  return { ok: true, workflow: result.data }
}

/** Coerce legacy/unknown rows into a usable workflow (never throws). */
export function coerceCronWorkflow(input: unknown): CronWorkflow {
  const parsed = parseCronWorkflow(input)
  return parsed.ok ? parsed.workflow : { ...DEFAULT_CRON_WORKFLOW }
}
