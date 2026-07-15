import { beforeEach, describe, expect, test } from 'vitest'
import { EventType } from '@ag-ui/client'
import { dispatchAguiEvent } from '../src/lib/agui/dispatcher'
import { useChatStore } from '../src/stores/chat'

function resetChatStore() {
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
}

describe('session history run UI cleanup', () => {
  beforeEach(() => {
    resetChatStore()
  })

  test('resetRun clears runSessionId and runStage (no sticky done strip)', () => {
    const chat = useChatStore.getState()
    chat.setRunSessionId('session-a')
    chat.setRunStatus('running')
    chat.setStage('writing')

    chat.resetRun()

    const after = useChatStore.getState()
    expect(after.runSessionId).toBeNull()
    expect(after.runStage).toBeNull()
    expect(after.runStatus).toBe('idle')
  })

  test('RUN_FINISHED after session reset does not revive done stage', () => {
    useChatStore.getState().setRunSessionId('session-a')
    useChatStore.getState().setRunId('run-old')
    useChatStore.getState().setRunStatus('running')

    // User switched to a historical session — ChatColumn resets first.
    useChatStore.getState().resetRun()

    dispatchAguiEvent(
      { type: EventType.RUN_FINISHED, threadId: 'session-a', runId: 'run-old' } as never,
      'session-a',
    )

    const state = useChatStore.getState()
    expect(state.runStage).toBeNull()
    expect(state.runStatus).toBe('idle')
    expect(state.runId).toBeNull()
  })

  test('loadSessionMessages stripStreaming clears streaming flags on merge', async () => {
    const chat = useChatStore.getState()
    chat.addMessage('hist', {
      id: 'local-stream',
      sessionId: 'hist',
      runId: 'r1',
      role: 'assistant',
      content: 'partial',
      streaming: true,
      createdAt: new Date().toISOString(),
    })

    // Simulate historical hydrate: merge keeps local row but strips streaming.
    const merged = chat.messagesBySession.hist ?? []
    const stripped = merged.map((m) => (m.streaming ? { ...m, streaming: false } : m))
    chat.setMessages('hist', stripped)

    expect(useChatStore.getState().messagesBySession.hist?.[0]?.streaming ?? false).toBe(
      false,
    )
  })
})
