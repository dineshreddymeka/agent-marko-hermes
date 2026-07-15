import { beforeEach, describe, expect, test } from 'vitest'
import { EventType } from '@ag-ui/client'
import { HermesCustomEvents } from '@hermes/shared'
import { dispatchAguiEvent } from '../src/lib/agui/dispatcher'
import {
  isPlaceholderSessionTitle,
  mergeSessionsPreservingTitles,
} from '../src/lib/session-title'
import { useChatStore } from '../src/stores/chat'
import { useSessionsStore } from '../src/stores/sessions'
import type { Session } from '@hermes/shared'

function session(partial: Partial<Session> & { id: string; title: string }): Session {
  const now = new Date().toISOString()
  return {
    groupName: null,
    profileId: null,
    pinned: false,
    archived: false,
    createdAt: now,
    updatedAt: now,
    ...partial,
  }
}

describe('session titles in Marko sidebar', () => {
  beforeEach(() => {
    useChatStore.setState({
      messagesBySession: {},
      toolCalls: {},
      runStatus: 'idle',
      runId: null,
      runSteps: [],
      runStage: null,
      stageHistory: [],
      pendingApproval: null,
      error: null,
      contextUsage: null,
      streamingBuffer: {},
      recentEvents: [],
    })
    useSessionsStore.setState({ sessions: [], activeSessionId: null })
  })

  test('isPlaceholderSessionTitle treats New chat / Untitled as empty', () => {
    expect(isPlaceholderSessionTitle('New chat')).toBe(true)
    expect(isPlaceholderSessionTitle('Untitled')).toBe(true)
    expect(isPlaceholderSessionTitle(null)).toBe(true)
    expect(isPlaceholderSessionTitle('NJ')).toBe(false)
  })

  test('hermes.title CUSTOM updates sessions store (smoke)', () => {
    useSessionsStore.getState().addSession(session({ id: 's1', title: 'New chat' }))

    dispatchAguiEvent(
      {
        type: EventType.CUSTOM,
        name: HermesCustomEvents.TITLE,
        value: { title: 'NJ', sessionId: 's1' },
      } as never,
      's1',
    )

    expect(useSessionsStore.getState().sessions.find((s) => s.id === 's1')?.title).toBe(
      'NJ',
    )
  })

  test('hermes.title upserts when session row is missing', () => {
    dispatchAguiEvent(
      {
        type: EventType.CUSTOM,
        name: 'hermes.title',
        value: { title: 'Deploy Hermes', sessionId: 'ghost' },
      } as never,
      null,
    )
    expect(useSessionsStore.getState().sessions.find((s) => s.id === 'ghost')?.title).toBe(
      'Deploy Hermes',
    )
  })

  test('setSessions does not clobber live title with API New chat', () => {
    useSessionsStore.getState().addSession(session({ id: 's1', title: 'NJ' }))
    useSessionsStore.getState().setSessions([
      session({ id: 's1', title: 'New chat' }),
      session({ id: 's2', title: 'Other' }),
    ])
    const titles = Object.fromEntries(
      useSessionsStore.getState().sessions.map((s) => [s.id, s.title]),
    )
    expect(titles.s1).toBe('NJ')
    expect(titles.s2).toBe('Other')
  })

  test('mergeSessionsPreservingTitles keeps optimistic local-only rows', () => {
    const local = [session({ id: 'local', title: 'Brand new' })]
    const api = [session({ id: 'api', title: 'From API' })]
    const merged = mergeSessionsPreservingTitles(local, api)
    expect(merged.map((s) => s.id)).toEqual(['local', 'api'])
  })

  test('RUN_FINISHED ensureSessionTitleFromChat titles from first user message', () => {
    useSessionsStore.getState().addSession(session({ id: 's1', title: 'New chat' }))
    useChatStore.getState().setRunId('r1')
    useChatStore.getState().setRunStatus('running')
    useChatStore.getState().addMessage('s1', {
      id: 'u1',
      sessionId: 's1',
      runId: 'r1',
      role: 'user',
      content: 'nj',
      createdAt: new Date().toISOString(),
    })

    dispatchAguiEvent(
      { type: EventType.RUN_FINISHED, threadId: 's1', runId: 'r1' } as never,
      's1',
    )

    expect(useSessionsStore.getState().sessions.find((s) => s.id === 's1')?.title).toBe(
      'NJ',
    )
  })
})
