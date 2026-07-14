/**
 * Hermes cron API DTO mapping — pure helpers.
 */
import { describe, expect, test } from 'vitest'
import {
  filterCronJobsBySkill,
  hermesCronJobToDto,
  hermesCronRunToDto,
  scheduleExpression,
} from '../src/lib/panels/cron-api'

describe('hermes cron DTO mapping', () => {
  test('scheduleExpression prefers expr, then run_at, then display', () => {
    expect(scheduleExpression({ schedule_display: 'every 1h' })).toBe('every 1h')
    expect(
      scheduleExpression({
        schedule: { kind: 'cron', expr: '0 9 * * *', display: 'daily 9am' },
      }),
    ).toBe('0 9 * * *')
    expect(
      scheduleExpression({
        schedule: { kind: 'once', run_at: '2026-07-13T09:00:00Z' },
        schedule_display: 'once',
      }),
    ).toBe('2026-07-13T09:00:00Z')
  })

  test('hermesCronJobToDto maps Hermes job onto shared CronJob shape', () => {
    const dto = hermesCronJobToDto({
      id: 'job-abc',
      name: 'Morning brief',
      prompt: 'Summarize overnight mail',
      skills: ['inbox-digest', 'web-search'],
      schedule: { expr: '30 7 * * *', display: '30 7 * * *' },
      schedule_display: '30 7 * * *',
      enabled: true,
      profile_name: 'default',
      last_run_at: '2026-07-12T07:30:00Z',
      next_run_at: '2026-07-13T07:30:00Z',
      last_status: 'ok',
      deliver: 'telegram',
      state: 'scheduled',
    })

    expect(dto.id).toBe('job-abc')
    expect(dto.name).toBe('Morning brief')
    expect(dto.schedule).toBe('30 7 * * *')
    expect(dto.profileId).toBe('default')
    expect(dto.skillIds).toEqual(['inbox-digest', 'web-search'])
    expect(dto.mcpServerIds).toEqual([])
    expect(dto.workflow.version).toBe(1)
    expect(dto.hermes.deliver).toBe('telegram')
    expect(dto.hermes.lastStatus).toBe('ok')
  })

  test('hermesCronRunToDto maps session rows to CronRun', () => {
    const running = hermesCronRunToDto(
      { id: 'cron_job-abc_00000001', started_at: 1_700_000_000 },
      'job-abc',
    )
    expect(running.status).toBe('running')
    expect(running.sessionId).toBe('cron_job-abc_00000001')

    const done = hermesCronRunToDto(
      {
        id: 'cron_job-abc_00000002',
        started_at: 1_700_000_100,
        ended_at: 1_700_000_200,
        end_reason: 'completed',
      },
      'job-abc',
    )
    expect(done.status).toBe('success')
    expect(done.finishedAt).not.toBeNull()
  })

  test('filterCronJobsBySkill filters by Hermes skill name', () => {
    const jobs = [
      hermesCronJobToDto({ id: 'a', skills: ['alpha'], schedule_display: 'every 1h' }),
      hermesCronJobToDto({ id: 'b', skills: ['beta'], schedule_display: 'every 2h' }),
    ]
    expect(filterCronJobsBySkill(jobs, 'alpha').map((j) => j.id)).toEqual(['a'])
    expect(filterCronJobsBySkill(jobs, '')).toHaveLength(2)
  })
})
