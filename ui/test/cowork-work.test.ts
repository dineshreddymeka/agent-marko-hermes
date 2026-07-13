import { describe, expect, test } from 'bun:test'
import {
  buildCoworkCreatePayload,
  COWORK_DELIVERABLE_PRESETS,
  coworkRetryFiles,
  deliverableLabel,
  isCoworkTaskAbortable,
  isSafeWorkspaceRelativePath,
  shouldPollCoworkTaskDetail,
  shouldPollCoworkTasks,
  truncateGoalTitle,
} from '../src/lib/panels/cowork-work'
import {
  coworkTaskStatusLabel,
  panelLabel,
  panelNavLabel,
  resolvePanelRoute,
  toolLabel,
} from '../src/lib/labels'
import type { CoworkTask } from '@hermes/shared'

function sampleTask(partial: Partial<CoworkTask> = {}): CoworkTask {
  return {
    taskId: 't1',
    status: 'done',
    goal: 'g',
    deliverableType: 'pdf',
    sessionId: null,
    inputFiles: null,
    files: [],
    summary: null,
    error: null,
    createdAt: new Date().toISOString(),
    finishedAt: null,
    ...partial,
  }
}

describe('cowork work helpers', () => {
  test('deliverable presets cover business chips', () => {
    expect(COWORK_DELIVERABLE_PRESETS.map((p) => p.id)).toEqual([
      'presentation',
      'word',
      'spreadsheet',
      'pdf',
      'other',
    ])
    expect(deliverableLabel('word')).toBe('Word doc')
  })

  test('path jail rejects abs and parent traversal', () => {
    expect(isSafeWorkspaceRelativePath('notes/brief.md')).toBe(true)
    expect(isSafeWorkspaceRelativePath('../etc/passwd')).toBe(false)
    expect(isSafeWorkspaceRelativePath('/tmp/x')).toBe(false)
    expect(isSafeWorkspaceRelativePath('C:\\Windows\\x')).toBe(false)
    expect(isSafeWorkspaceRelativePath('')).toBe(false)
  })

  test('buildCoworkCreatePayload validates goal and files', () => {
    expect(buildCoworkCreatePayload({
      goal: '  ',
      deliverableType: 'pdf',
      files: [],
      autoApprove: true,
    })).toEqual({ error: 'Describe what should be produced.' })

    expect(
      buildCoworkCreatePayload({
        goal: 'Make a report',
        deliverableType: 'presentation',
        files: ['../escape.txt'],
        autoApprove: false,
      }),
    ).toMatchObject({ error: expect.stringContaining('workspace') })

    expect(
      buildCoworkCreatePayload({
        goal: 'Make a report',
        deliverableType: 'spreadsheet',
        files: ['data/sales.csv'],
        autoApprove: true,
      }),
    ).toEqual({
      goal: 'Make a report',
      deliverableType: 'spreadsheet',
      files: ['data/sales.csv'],
      autoApprove: true,
    })
  })

  test('truncateGoalTitle and polling', () => {
    expect(truncateGoalTitle('')).toBe('Untitled request')
    expect(truncateGoalTitle(null)).toBe('Untitled request')
    expect(truncateGoalTitle('a'.repeat(100)).endsWith('…')).toBe(true)
    expect(shouldPollCoworkTasks([sampleTask({ status: 'running' })])).toBe(true)
    expect(shouldPollCoworkTasks([sampleTask({ status: 'done' })])).toBe(false)
    expect(shouldPollCoworkTaskDetail('queued')).toBe(true)
    expect(shouldPollCoworkTaskDetail('running')).toBe(true)
    expect(shouldPollCoworkTaskDetail('done')).toBe(false)
  })

  test('retry uses inputFiles never outbox files; abortable only queued/running', () => {
    expect(
      coworkRetryFiles(
        sampleTask({
          inputFiles: ['notes/in.md'],
          files: ['outbox/t1/out.pdf'],
        }),
      ),
    ).toEqual({ files: ['notes/in.md'], legacyMissingInputs: false })

    expect(
      coworkRetryFiles(
        sampleTask({
          inputFiles: null,
          files: ['outbox/t1/out.pdf'],
        }),
      ),
    ).toEqual({ files: [], legacyMissingInputs: true })

    expect(isCoworkTaskAbortable('queued')).toBe(true)
    expect(isCoworkTaskAbortable('running')).toBe(true)
    expect(isCoworkTaskAbortable('done')).toBe(false)
    expect(isCoworkTaskAbortable('failed')).toBe(false)
  })
})

describe('cowork branding labels', () => {
  test('panel labels and aliases', () => {
    expect(panelLabel('cron')).toBe('Cowork')
    expect(panelNavLabel('cron')).toBe('Cowork')
    expect(resolvePanelRoute('cowork')).toBe('cron')
    expect(resolvePanelRoute('tasks')).toBe('cron')
    expect(resolvePanelRoute('scheduled')).toBe('cron')
    expect(resolvePanelRoute('cron')).toBe('cron')
  })

  test('tool and status labels', () => {
    expect(toolLabel('delegate_to_cowork')).toBe('Delegate to Open Cowork')
    expect(coworkTaskStatusLabel('queued')).toBe('Queued')
    expect(coworkTaskStatusLabel('running')).toBe('Running')
    expect(coworkTaskStatusLabel('done')).toBe('Done')
    expect(coworkTaskStatusLabel('failed')).toBe('Failed')
    expect(coworkTaskStatusLabel('aborted')).toBe('Aborted')
  })
})
