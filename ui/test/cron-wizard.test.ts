/**
 * Smart Cron wizard helpers — pure logic units.
 * Author: Dinesh Reddy Meka
 */
import { describe, expect, test } from 'vitest'
import {
  buildCronPayload,
  draftFromJob,
  emptyCronDraft,
  parseStepsJson,
  toggleId,
  validateWizardStep,
} from '../src/lib/panels/cron-wizard'
import type { CronJob } from '@hermes/shared'

const UUID_A = '11111111-1111-4111-8111-111111111111'
const UUID_B = '22222222-2222-4222-8222-222222222222'

function job(partial: Partial<CronJob> = {}): CronJob {
  return {
    id: 'job-1',
    name: 'Digest',
    schedule: '0 9 * * *',
    prompt: 'Summarize the inbox',
    profileId: null,
    enabled: true,
    lastRun: null,
    nextRun: null,
    timezone: 'Europe/Berlin',
    workflow: {
      version: 1,
      intent: 'Summarize the inbox',
      timezone: 'Europe/Berlin',
      mcpServerIds: [UUID_A],
      skillIds: [UUID_B],
      headlessAutoApprove: true,
      retry: { maxAttempts: 4, backoffSec: 30 },
      steps: [{ id: 's1', label: 'Fetch', type: 'prompt', prompt: 'go' }],
    },
    mcpServerIds: [UUID_A],
    skillIds: [UUID_B],
    updatedAt: null,
    ...partial,
  }
}

describe('cron wizard helpers', () => {
  test('draftFromJob prefills edit mode from workflow', () => {
    const draft = draftFromJob(job())
    expect(draft.name).toBe('Digest')
    expect(draft.timezone).toBe('Europe/Berlin')
    expect(draft.mcpServerIds).toEqual([UUID_A])
    expect(draft.skillIds).toEqual([UUID_B])
    expect(draft.headlessAutoApprove).toBe(true)
    expect(draft.retryEnabled).toBe(true)
    expect(draft.maxAttempts).toBe(4)
    expect(JSON.parse(draft.stepsJson)).toHaveLength(1)
  })

  test('toggleId adds and removes', () => {
    expect(toggleId([], 'a')).toEqual(['a'])
    expect(toggleId(['a', 'b'], 'a')).toEqual(['b'])
  })

  test('parseStepsJson accepts empty, valid steps, rejects bad JSON/schema', () => {
    expect(parseStepsJson('')).toEqual({ ok: true, steps: [] })
    const ok = parseStepsJson(
      JSON.stringify([
        { id: 'a', label: 'A', type: 'mcp', mcpServerId: UUID_A, parallelGroup: 'g' },
        { id: 'b', label: 'B', type: 'prompt', prompt: 'x', dependsOn: ['a'] },
      ]),
    )
    expect(ok.ok).toBe(true)
    if (ok.ok) expect(ok.steps[1]!.dependsOn).toEqual(['a'])
    expect(parseStepsJson('{not json').ok).toBe(false)
    expect(parseStepsJson('[{"id":"a"}]').ok).toBe(false)
  })

  test('validateWizardStep gates each step', () => {
    const draft = emptyCronDraft()
    const opts = { scheduleValid: true, skillsAvailable: 3 }
    expect(validateWizardStep(0, draft, opts)).toContain('name')
    draft.name = 'Job'
    draft.intent = 'Do things'
    expect(validateWizardStep(0, draft, opts)).toBeNull()
    expect(validateWizardStep(1, draft, { ...opts, scheduleValid: false })).toContain('schedule')
    expect(validateWizardStep(1, draft, opts)).toBeNull()
    // MCP step: zero selections is valid (means no MCP)
    expect(validateWizardStep(2, draft, opts)).toBeNull()
    // Skills: empty catalog requires create or explicit confirmation
    expect(validateWizardStep(3, draft, { ...opts, skillsAvailable: 0 })).toContain('skill')
    draft.noSkillsConfirmed = true
    expect(validateWizardStep(3, draft, { ...opts, skillsAvailable: 0 })).toBeNull()
    // Policy: retry bounds
    draft.retryEnabled = true
    draft.maxAttempts = 99
    expect(validateWizardStep(4, draft, opts)).toContain('attempts')
    draft.maxAttempts = 3
    expect(validateWizardStep(4, draft, opts)).toBeNull()
  })

  test('buildCronPayload produces the workflow DTO with synced arrays', () => {
    const draft = emptyCronDraft()
    draft.name = ' Digest '
    draft.intent = 'Summarize inbox'
    draft.schedule = '0 9 * * 1-5'
    draft.timezone = 'America/New_York'
    draft.mcpServerIds = [UUID_A]
    draft.skillIds = [UUID_B]
    draft.headlessAutoApprove = true
    draft.retryEnabled = true
    draft.maxAttempts = 2
    draft.backoffSec = 15

    const payload = buildCronPayload(draft)
    expect(payload.name).toBe('Digest')
    expect(payload.prompt).toBe('Summarize inbox')
    expect(payload.timezone).toBe('America/New_York')
    expect(payload.workflow.version).toBe(1)
    expect(payload.workflow.mcpServerIds).toEqual([UUID_A])
    expect(payload.workflow.skillIds).toEqual([UUID_B])
    expect(payload.workflow.retry).toEqual({ maxAttempts: 2, backoffSec: 15 })
    expect(payload.workflow.ui?.wizardCompletedAt).toBeDefined()
  })

  test('buildCronPayload omits retry and steps when unset', () => {
    const draft = emptyCronDraft()
    draft.name = 'J'
    draft.intent = 'x'
    const payload = buildCronPayload(draft)
    expect(payload.workflow.retry).toBeUndefined()
    expect(payload.workflow.steps).toBeUndefined()
  })
})
