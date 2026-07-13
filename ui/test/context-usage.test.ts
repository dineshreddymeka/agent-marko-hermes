import { describe, expect, test } from 'bun:test'
import { useChatStore } from '../src/stores/chat'
import { dispatchAguiEvent } from '../src/lib/agui/dispatcher'

describe('context usage', () => {
  test('hermes.context updates chat store from totalTokens', () => {
    useChatStore.getState().setContextUsage(null)

    dispatchAguiEvent(
      {
        type: 'CUSTOM',
        name: 'hermes.context',
        value: {
          totalTokens: 12_345,
          tokensMax: 200_000,
        },
      } as Parameters<typeof dispatchAguiEvent>[0],
      'session-1',
    )

    expect(useChatStore.getState().contextUsage).toEqual({
      used: 12_345,
      limit: 200_000,
    })
  })
})
