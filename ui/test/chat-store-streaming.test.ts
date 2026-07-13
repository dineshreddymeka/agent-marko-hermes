import { beforeEach, describe, expect, test } from 'vitest'
import { useChatStore } from '../src/stores/chat'

describe('chat store streaming cleanup', () => {
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
  })

  test('clearStreamingState flushes buffers and clears streaming flags', () => {
    if (typeof globalThis.requestAnimationFrame !== 'function') {
      globalThis.requestAnimationFrame = (cb: FrameRequestCallback) => {
        return setTimeout(() => cb(Date.now()), 0) as unknown as number
      }
    }
    globalThis.requestAnimationFrame = ((cb: FrameRequestCallback) => {
      cb(0)
      return 0
    }) as typeof requestAnimationFrame

    const chat = useChatStore.getState()
    chat.addMessage('s1', {
      id: 'm1',
      sessionId: 's1',
      runId: 'r1',
      role: 'assistant',
      content: '',
      streaming: true,
      createdAt: new Date().toISOString(),
    })
    chat.appendStreamContent('m1', 'hello')
    chat.appendThinking('m1', 'why')

    chat.clearStreamingState()

    const msg = useChatStore.getState().messagesBySession.s1?.[0]
    expect(msg?.content).toContain('hello')
    expect(msg?.thinking).toContain('why')
    expect(msg?.streaming).toBe(false)
    expect(useChatStore.getState().streamingBuffer).toEqual({})
  })
})
