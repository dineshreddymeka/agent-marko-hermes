import { beforeEach, describe, expect, test } from 'vitest'
import {
  recoverRunFromStartingStall,
  recoverStaleRunIfNeeded,
  startStartupWatchdogForTests,
} from '../src/lib/agui/client'
import { useChatStore } from '../src/stores/chat'

describe('AG-UI startup stall recovery', () => {
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

  test('recovers run stuck in starting to terminal error', () => {
    const chat = useChatStore.getState()
    chat.setRunId('r-start')
    chat.setRunStatus('running')
    chat.setStage('starting')

    const fixed = recoverRunFromStartingStall('r-start', 'startup timeout')
    const state = useChatStore.getState()
    expect(fixed).toBe(true)
    expect(state.runStatus).toBe('error')
    expect(state.runStage?.kind).toBe('error')
    expect(state.runId).toBeNull()
    expect(state.error).toBe('startup timeout')
  })

  test('does not force error once run advanced past starting', () => {
    const chat = useChatStore.getState()
    chat.setRunId('r-thinking')
    chat.setRunStatus('running')
    chat.setStage('thinking')

    const fixed = recoverRunFromStartingStall('r-thinking')
    const state = useChatStore.getState()
    expect(fixed).toBe(false)
    expect(state.runStatus).toBe('running')
    expect(state.runStage?.kind).toBe('thinking')
  })

  test('watchdog auto-recovers stalled starting run', async () => {
    const chat = useChatStore.getState()
    chat.setRunId('r-watchdog')
    chat.setRunStatus('running')
    chat.setStage('starting')

    const stop = startStartupWatchdogForTests('r-watchdog', 5)
    await new Promise((resolve) => setTimeout(resolve, 20))
    stop()

    const state = useChatStore.getState()
    expect(state.runStatus).toBe('error')
    expect(state.runStage?.kind).toBe('error')
    expect(state.runId).toBeNull()
  })

  test('stale running with no runId resets to idle', () => {
    const chat = useChatStore.getState()
    chat.setRunStatus('running')
    chat.setRunId(null)
    chat.setStage('starting')

    const fixed = recoverStaleRunIfNeeded()
    const state = useChatStore.getState()
    expect(fixed).toBe(true)
    expect(state.runStatus).toBe('idle')
    expect(state.runId).toBeNull()
    expect(state.runStage).toBeNull()
  })
})
