import { describe, expect, test } from 'bun:test'
import type {
  CoworkTask,
  CreateCoworkTaskBody,
  Session,
} from './api-types'

describe('api-types', () => {
  test('session shape', () => {
    const s: Session = {
      id: '550e8400-e29b-41d4-a716-446655440000',
      title: 'Test',
      groupName: null,
      profileId: null,
      pinned: false,
      archived: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    expect(s.title).toBe('Test')
  })

  test('cowork task DTOs', () => {
    const body: CreateCoworkTaskBody = {
      goal: 'Make a deck',
      deliverableType: 'presentation',
      autoApprove: true,
    }
    const task: CoworkTask = {
      taskId: 't-20260711-001',
      status: 'running',
      goal: body.goal,
      deliverableType: body.deliverableType,
      sessionId: null,
      inputFiles: ['notes/brief.md'],
      files: [],
      summary: null,
      error: null,
      createdAt: new Date().toISOString(),
      finishedAt: null,
    }
    expect(task.status).toBe('running')
    expect(task.inputFiles).toEqual(['notes/brief.md'])
    expect(body.deliverableType).toBe('presentation')
  })
})
