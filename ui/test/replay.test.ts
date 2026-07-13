import { describe, expect, test } from 'vitest'
import { EventType } from '@ag-ui/client'
import { prepareReplaySession } from '../src/lib/agui/replay'
import { dispatchAguiEvent } from '../src/lib/agui/dispatcher'
import { useChatStore } from '../src/stores/chat'

describe('run replay', () => {
  test('prepareReplaySession clears session messages', () => {
    const sessionId = 'replay-test-session'
    useChatStore.getState().setMessages(sessionId, [
      {
        id: 'm1',
        sessionId,
        runId: null,
        role: 'user',
        content: 'hello',
        createdAt: new Date().toISOString(),
      },
    ])

    prepareReplaySession(sessionId)
    expect(useChatStore.getState().messagesBySession[sessionId]).toEqual([])
    expect(useChatStore.getState().runStatus).toBe('idle')
  })

  test('dispatcher replays hermes.context event', () => {
    prepareReplaySession('s1')
    dispatchAguiEvent(
      {
        type: EventType.CUSTOM,
        name: 'hermes.context',
        value: { totalTokens: 500, tokensMax: 128_000 },
      },
      's1',
    )
    expect(useChatStore.getState().contextUsage).toEqual({ used: 500, limit: 128_000 })
  })
})
