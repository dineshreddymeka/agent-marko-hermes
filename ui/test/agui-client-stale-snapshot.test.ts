import { beforeEach, describe, expect, test } from 'vitest'
import { getAguiMessagesForSession } from '../src/lib/agui/client'
import { dispatchAguiEvent } from '../src/lib/agui/dispatcher'
import { useChatStore } from '../src/stores/chat'
import { EventType } from '@ag-ui/client'

describe('AG-UI run message snapshot freshness', () => {
  beforeEach(() => {
    useChatStore.setState({
      messagesBySession: {},
      toolCalls: {},
      runStatus: 'idle',
      runId: null,
      runSessionId: null,
      runSteps: [],
      runStage: null,
      stageHistory: [],
      pendingApproval: null,
      error: null,
      contextUsage: null,
      streamingBuffer: {},
      recentEvents: [],
    })
  })

  test('stale getState handle omits optimistic user turn; fresh helper includes it', () => {
    const sid = 'session-1'
    const chat = useChatStore.getState()

    chat.addMessage(sid, {
      id: 'u1',
      sessionId: sid,
      runId: 'r1',
      role: 'user',
      content: 'how r u',
      createdAt: new Date().toISOString(),
    })

    // Same bug pattern as the old runAgent: read messages off the pre-mutation handle.
    const staleContents = (chat.messagesBySession[sid] ?? []).map((m) => m.content)
    expect(staleContents).not.toContain('how r u')

    // Fix: always re-read via getState / getAguiMessagesForSession.
    const fresh = getAguiMessagesForSession(sid)
    expect(fresh.map((m) => m.content)).toContain('how r u')
    expect(fresh.at(-1)?.role).toBe('user')
  })

  test('sequential turns keep each latest user message in the AG-UI payload', () => {
    const sid = 'session-2'
    const turns = ['how r u', '?', 'tell me about today match']

    for (const content of turns) {
      useChatStore.getState().addMessage(sid, {
        id: `u-${content}`,
        sessionId: sid,
        runId: `r-${content}`,
        role: 'user',
        content,
        createdAt: new Date().toISOString(),
      })
      const payload = getAguiMessagesForSession(sid)
      expect(payload.at(-1)?.content).toBe(content)
      expect(payload.filter((m) => m.role === 'user').map((m) => m.content)).toEqual(
        turns.slice(0, turns.indexOf(content) + 1),
      )
    }
  })

  test('RUN_FINISHED from a superseded runId does not clear the active run', () => {
    useChatStore.getState().setRunId('run-new')
    useChatStore.getState().setRunStatus('running')

    dispatchAguiEvent(
      { type: EventType.RUN_FINISHED, threadId: 's1', runId: 'run-old' } as never,
      's1',
    )

    expect(useChatStore.getState().runId).toBe('run-new')
    expect(useChatStore.getState().runStatus).toBe('running')

    dispatchAguiEvent(
      { type: EventType.RUN_FINISHED, threadId: 's1', runId: 'run-new' } as never,
      's1',
    )
    expect(useChatStore.getState().runStatus).toBe('idle')
    expect(useChatStore.getState().runId).toBeNull()
  })

  test('late THINKING_TEXT_MESSAGE_START after idle does not revive thinking stage', () => {
    useChatStore.getState().setRunId(null)
    useChatStore.getState().setRunStatus('idle')
    useChatStore.getState().clearStage()

    dispatchAguiEvent(
      {
        type: EventType.THINKING_TEXT_MESSAGE_START,
        messageId: 'late-think',
        role: 'assistant',
      } as never,
      's1',
    )

    expect(useChatStore.getState().runStatus).toBe('idle')
    expect(useChatStore.getState().runStage).toBeNull()
  })
})
