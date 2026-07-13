import { beforeEach, describe, expect, test } from 'vitest'
import { EventType } from '@ag-ui/client'
import { dispatchAguiEvent } from '../src/lib/agui/dispatcher'
import { useChatStore } from '../src/stores/chat'
import { useAgentStateStore } from '../src/stores/agentState'
import { useSessionsStore } from '../src/stores/sessions'
import { useUiStore } from '../src/stores/ui'

// Bun test has no DOM rAF — polyfill so stream batching does not throw
if (typeof globalThis.requestAnimationFrame !== 'function') {
  globalThis.requestAnimationFrame = (cb: FrameRequestCallback) => {
    return setTimeout(() => cb(Date.now()), 0) as unknown as number
  }
  globalThis.cancelAnimationFrame = (id: number) => clearTimeout(id)
}

describe('agui dispatcher Phase 4 events', () => {
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
    useAgentStateStore.getState().setState({ todos: [], plan: '', workspaceContext: {} })
    useSessionsStore.setState({ sessions: [], activeSessionId: null })
    useUiStore.setState({ toasts: [] })
  })

  test('RUN_STARTED / RUN_ERROR update status', () => {
    dispatchAguiEvent(
      { type: EventType.RUN_STARTED, threadId: 's1', runId: 'r1' } as never,
      's1',
    )
    expect(useChatStore.getState().runStatus).toBe('running')
    dispatchAguiEvent(
      { type: EventType.RUN_ERROR, message: 'boom' } as never,
      's1',
    )
    expect(useChatStore.getState().runStatus).toBe('error')
    expect(useChatStore.getState().error).toBe('boom')
  })

  test('RUN_FINISHED clears streaming flags and idle run', () => {
    useChatStore.getState().setRunId('r1')
    useChatStore.getState().setRunStatus('running')
    useChatStore.getState().setStage('thinking')
    useChatStore.getState().addMessage('s1', {
      id: 'm1',
      sessionId: 's1',
      runId: 'r1',
      role: 'assistant',
      content: 'partial',
      thinking: 'hmm',
      streaming: true,
      createdAt: new Date().toISOString(),
    })

    dispatchAguiEvent(
      { type: EventType.RUN_FINISHED, threadId: 's1', runId: 'r1' } as never,
      's1',
    )

    const state = useChatStore.getState()
    expect(state.runStatus).toBe('idle')
    expect(state.runId).toBeNull()
    expect(state.messagesBySession.s1?.[0]?.streaming).toBe(false)
  })

  test('RUN_ERROR abort code clears running without error banner', () => {
    useChatStore.getState().setRunId('r1')
    useChatStore.getState().setRunStatus('running')
    useChatStore.getState().setStage('thinking')

    dispatchAguiEvent(
      {
        type: EventType.RUN_ERROR,
        message: 'Request aborted',
        code: 'abort',
        runId: 'r1',
      } as never,
      's1',
    )

    const state = useChatStore.getState()
    expect(state.runStatus).toBe('idle')
    expect(state.error).toBeNull()
    expect(state.runStage).toBeNull()
  })

  test('thinking text without THINKING_START still settles on RUN_FINISHED', () => {
    globalThis.requestAnimationFrame = ((cb: FrameRequestCallback) => {
      cb(0)
      return 0
    }) as typeof requestAnimationFrame

    useChatStore.getState().setRunId('r1')
    useChatStore.getState().setRunStatus('running')

    dispatchAguiEvent(
      {
        type: EventType.THINKING_TEXT_MESSAGE_START,
        messageId: 'm1',
        role: 'assistant',
      } as never,
      's1',
    )
    dispatchAguiEvent(
      {
        type: EventType.THINKING_TEXT_MESSAGE_CONTENT,
        messageId: 'm1',
        delta: 'plan',
      } as never,
      's1',
    )
    expect(useChatStore.getState().runStage?.kind).toBe('thinking')

    dispatchAguiEvent(
      { type: EventType.RUN_FINISHED, threadId: 's1', runId: 'r1' } as never,
      's1',
    )

    const state = useChatStore.getState()
    expect(state.runStatus).toBe('idle')
    expect(state.messagesBySession.s1?.[0]?.thinking).toContain('plan')
    expect(state.messagesBySession.s1?.[0]?.streaming).toBe(false)
  })

  test('TEXT_MESSAGE stream appends content', () => {
    globalThis.requestAnimationFrame = ((cb: FrameRequestCallback) => {
      cb(0)
      return 0
    }) as typeof requestAnimationFrame

    useChatStore.getState().setRunId('r1')
    useChatStore.getState().setRunStatus('running')

    dispatchAguiEvent(
      {
        type: EventType.TEXT_MESSAGE_START,
        messageId: 'm1',
        role: 'assistant',
        runId: 'r1',
      } as never,
      's1',
    )
    dispatchAguiEvent(
      {
        type: EventType.TEXT_MESSAGE_CONTENT,
        messageId: 'm1',
        delta: 'Hello',
        runId: 'r1',
      } as never,
      's1',
    )
    useChatStore.getState().flushStreamBuffer('m1')
    const msg = useChatStore.getState().messagesBySession.s1?.[0]
    expect(msg?.content).toContain('Hello')
  })

  test('TOOL_CALL associates parentMessageId and live args', () => {
    useChatStore.getState().addMessage('s1', {
      id: 'asst-1',
      sessionId: 's1',
      runId: 'r1',
      role: 'assistant',
      content: '',
      createdAt: new Date().toISOString(),
    })
    dispatchAguiEvent(
      {
        type: EventType.TOOL_CALL_START,
        toolCallId: 'tc1',
        toolCallName: 'read_file',
        parentMessageId: 'asst-1',
      } as never,
      's1',
    )
    dispatchAguiEvent(
      {
        type: EventType.TOOL_CALL_ARGS,
        toolCallId: 'tc1',
        delta: '{"path":"a"}',
      } as never,
      's1',
    )
    const tc = useChatStore.getState().toolCalls.tc1
    expect(tc?.messageId).toBe('asst-1')
    expect(tc?.args).toBe('{"path":"a"}')
    expect(tc?.status).toBe('streaming-args')
  })

  test('STATE_SNAPSHOT and STATE_DELTA apply', () => {
    dispatchAguiEvent(
      {
        type: EventType.STATE_SNAPSHOT,
        snapshot: { todos: [{ id: '1', text: 'x', done: false }], plan: 'p', workspaceContext: {} },
      } as never,
      's1',
    )
    expect(useAgentStateStore.getState().state.plan).toBe('p')
    dispatchAguiEvent(
      {
        type: EventType.STATE_DELTA,
        delta: [{ op: 'replace', path: '/plan', value: 'updated' }],
      } as never,
      's1',
    )
    expect(useAgentStateStore.getState().state.plan).toBe('updated')
  })

  test('hermes.context / hermes.title / toast customs', () => {
    useSessionsStore.getState().addSession({
      id: 's1',
      title: 'Old',
      groupName: null,
      profileId: null,
      pinned: false,
      archived: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })
    dispatchAguiEvent(
      {
        type: EventType.CUSTOM,
        name: 'hermes.context',
        value: { tokensUsed: 100, tokensMax: 1000 },
      } as never,
      's1',
    )
    expect(useChatStore.getState().contextUsage).toEqual({ used: 100, limit: 1000 })

    dispatchAguiEvent(
      {
        type: EventType.CUSTOM,
        name: 'hermes.title',
        value: { title: 'Open Jarvis chat' },
      } as never,
      's1',
    )
    expect(useSessionsStore.getState().sessions.find((s) => s.id === 's1')?.title).toBe(
      'Open Jarvis chat',
    )

    dispatchAguiEvent(
      {
        type: EventType.CUSTOM,
        name: 'hermes.skill.learned',
        value: { skillName: 'demo' },
      } as never,
      's1',
    )
    expect(useUiStore.getState().toasts.some((t) => t.title === 'Skill learned')).toBe(true)

    dispatchAguiEvent(
      {
        type: EventType.CUSTOM,
        name: 'hermes.approval.required',
        value: { toolCallId: 't1', toolName: 'run_shell', args: { cmd: 'ls' } },
      } as never,
      's1',
    )
    expect(useChatStore.getState().pendingApproval?.toolName).toBe('run_shell')
  })
  test('a2ui.message binds surface to parent assistant message', () => {
    useChatStore.getState().addMessage('s1', {
      id: 'assistant-1',
      sessionId: 's1',
      runId: 'r1',
      role: 'assistant',
      content: 'Opening the document request form…',
      createdAt: new Date().toISOString(),
    })
    useChatStore.getState().upsertToolCall('tc-doc', {
      id: 'tc-doc',
      name: 'document_form_show',
      args: '{"topic":"new york"}',
      status: 'executing',
      messageId: 'assistant-1',
    })

    dispatchAguiEvent(
      {
        type: EventType.CUSTOM,
        name: 'a2ui.message',
        value: {
          surfaceId: 'doc-form-test',
          component: {
            id: 'document-request',
            type: 'hermes:DocumentRequestForm',
            props: { deliverableType: 'pdf', topic: 'new york' },
          },
          complete: true,
        },
      } as never,
      's1',
    )

    const msg = useChatStore.getState().messagesBySession.s1?.[0]
    expect(msg?.a2ui).toBe('doc-form-test')
  })

  test('hermes.cowork.progress attaches lines to delegate_to_cowork tool card', () => {
    useChatStore.getState().upsertToolCall('tc-cowork', {
      id: 'tc-cowork',
      name: 'delegate_to_cowork',
      args: '{"instruction":"deck"}',
      status: 'executing',
    })
    dispatchAguiEvent(
      {
        type: EventType.CUSTOM,
        name: 'hermes.cowork.progress',
        value: { taskId: 't-1', phase: 'started' },
      } as never,
      's1',
    )
    dispatchAguiEvent(
      {
        type: EventType.CUSTOM,
        name: 'hermes.cowork.progress',
        value: { taskId: 't-1', phase: 'delta', text: 'Drafting…' },
      } as never,
      's1',
    )
    dispatchAguiEvent(
      {
        type: EventType.CUSTOM,
        name: 'hermes.cowork.progress',
        value: { taskId: 't-1', phase: 'delta', text: 'Drafting slides…' },
      } as never,
      's1',
    )
    dispatchAguiEvent(
      {
        type: EventType.CUSTOM,
        name: 'hermes.cowork.progress',
        value: { taskId: 't-1', phase: 'tool', tool: 'bash' },
      } as never,
      's1',
    )
    const tc = useChatStore.getState().toolCalls['tc-cowork']
    expect(tc?.progressLines?.[0]).toContain('started')
    expect(tc?.progressLines?.some((l) => l.includes('Drafting slides'))).toBe(true)
    expect(tc?.progressLines?.some((l) => l.includes('bash'))).toBe(true)
    expect(tc?.progressLive).toBeNull()
  })

  test('hermes.cowork.progress abort toast is attention not success', () => {
    useUiStore.setState({ toasts: [] })
    dispatchAguiEvent(
      {
        type: EventType.CUSTOM,
        name: 'hermes.cowork.progress',
        value: { taskId: 't-1', phase: 'error', text: 'Aborted by user', ok: false },
      } as never,
      's1',
    )
    const toast = useUiStore.getState().toasts[0]
    expect(toast?.title).toBe('Open Cowork cancelled')
    expect(toast?.variant).toBe('attention')
  })
})
