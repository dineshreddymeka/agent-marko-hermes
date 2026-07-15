import { create } from 'zustand'
import type { Message } from '@hermes/shared'
import {
  isThinkingBufferKey,
  streamReleaseAmount,
  thinkingBufferKey,
  thinkingMessageId,
} from '@app/lib/stream-pacing'
import { prefersReducedMotion } from '@app/hooks/useReducedMotion'
import { hydrateA2uiFromRef, resolveA2uiSurfaceRef } from '@app/lib/a2ui/processor'

function hydrateMessagesA2ui(sessionId: string, messages: ChatMessage[]): void {
  for (const m of messages) {
    if (m.a2ui != null) hydrateA2uiFromRef(m.a2ui, sessionId)
  }
}

export type ToolCallStatus = 'pending' | 'streaming-args' | 'executing' | 'done' | 'error'

export interface ChatMessage {
  id: string
  sessionId: string
  runId: string | null
  role: 'user' | 'assistant' | 'system' | 'tool'
  content: string
  thinking?: string | null
  toolName?: string | null
  toolArgs?: Record<string, unknown> | null
  toolResult?: unknown
  a2ui?: unknown
  streaming?: boolean
  createdAt: string
}

export interface ToolCallState {
  id: string
  name: string
  args: string
  result?: unknown
  status: ToolCallStatus
  messageId?: string
  /** Committed Open Cowork progress lines (from hermes.cowork.progress). */
  progressLines?: string[]
  /** In-flight throttled text delta (replaced until a non-delta phase). */
  progressLive?: string | null
}

export interface RunStep {
  id: string
  name: string
  status: 'running' | 'done'
}

export interface PendingApproval {
  toolCallId: string
  toolName: string
  args: Record<string, unknown>
}

export type RunStatus = 'idle' | 'running' | 'error' | 'cancelled'

export type RunStageKind = 'starting' | 'thinking' | 'tool' | 'writing' | 'done' | 'error'

export interface RunStage {
  kind: RunStageKind
  toolName?: string
  startedAt: number
}

interface ChatState {
  messagesBySession: Record<string, ChatMessage[]>
  toolCalls: Record<string, ToolCallState>
  runStatus: RunStatus
  runId: string | null
  /** Session that owns the current run UI (null when viewing history or idle). */
  runSessionId: string | null
  runSteps: RunStep[]
  runStage: RunStage | null
  stageHistory: Array<RunStage & { endedAt: number }>
  pendingApproval: PendingApproval | null
  error: string | null
  contextUsage: { used: number; limit: number } | null
  streamingBuffer: Record<string, string>
  recentEvents: string[]

  setMessages: (sessionId: string, messages: ChatMessage[]) => void
  addMessage: (sessionId: string, message: ChatMessage) => void
  /** Bind an A2UI surface to the assistant message that triggered it. */
  attachA2uiSurface: (
    sessionId: string,
    surfaceId: string,
    messageId?: string,
  ) => void
  appendStreamContent: (messageId: string, delta: string) => void
  flushStreamBuffer: (messageId: string) => void
  appendThinking: (messageId: string, delta: string) => void
  flushThinkingBuffer: (messageId: string) => void
  setRunStatus: (status: RunStatus) => void
  setRunId: (runId: string | null) => void
  setRunSessionId: (sessionId: string | null) => void
  setStage: (kind: RunStageKind, toolName?: string) => void
  clearStage: () => void
  setError: (error: string | null) => void
  setPendingApproval: (approval: PendingApproval | null) => void
  setContextUsage: (usage: { used: number; limit: number } | null) => void
  upsertToolCall: (id: string, patch: Partial<ToolCallState>) => void
  addRunStep: (step: RunStep) => void
  finishRunStep: (stepId: string) => void
  clearRunSteps: () => void
  recordEvent: (event: string) => void
  resetRun: () => void
  /** Flush buffers and clear streaming flags on every in-flight message. */
  clearStreamingState: () => void
  messageFromDto: (msg: Message) => ChatMessage
}

let flushActive = false

function scheduleFlush(
  get: () => ChatState,
  set: (fn: (s: ChatState) => Partial<ChatState>) => void,
) {
  if (flushActive) return
  flushActive = true

  const tick = () => {
    const state = get()
    const reduced = prefersReducedMotion()
    const buffer = state.streamingBuffer
    const keys = Object.keys(buffer).filter((k) => buffer[k])

    if (keys.length === 0) {
      flushActive = false
      return
    }

    const contentUpdates: Record<string, string> = {}
    const thinkingUpdates: Record<string, string> = {}
    const nextBuffer = { ...buffer }
    let hasRemaining = false

    for (const key of keys) {
      const pending = buffer[key] ?? ''
      if (!pending) continue
      const release = streamReleaseAmount(pending.length, reduced)
      const chunk = pending.slice(0, release)
      const rest = pending.slice(release)
      if (rest) {
        nextBuffer[key] = rest
        hasRemaining = true
      } else {
        delete nextBuffer[key]
      }
      if (!chunk) continue
      if (isThinkingBufferKey(key)) {
        thinkingUpdates[thinkingMessageId(key)] = chunk
      } else {
        contentUpdates[key] = chunk
      }
    }

    if (Object.keys(contentUpdates).length > 0 || Object.keys(thinkingUpdates).length > 0) {
      set((s) => {
        const messagesBySession = { ...s.messagesBySession }
        for (const [sessionId, messages] of Object.entries(messagesBySession)) {
          messagesBySession[sessionId] = messages.map((m) => {
            const contentDelta = contentUpdates[m.id]
            const thinkingDelta = thinkingUpdates[m.id]
            if (!contentDelta && !thinkingDelta) return m
            return {
              ...m,
              content: contentDelta ? m.content + contentDelta : m.content,
              thinking: thinkingDelta ? (m.thinking ?? '') + thinkingDelta : m.thinking,
              streaming: true,
            }
          })
        }
        return { messagesBySession, streamingBuffer: nextBuffer }
      })
    } else {
      set(() => ({ streamingBuffer: nextBuffer }))
    }

    if (hasRemaining) {
      requestAnimationFrame(tick)
    } else {
      flushActive = false
    }
  }

  requestAnimationFrame(tick)
}

function flushBufferKey(
  get: () => ChatState,
  set: (fn: (s: ChatState) => Partial<ChatState>) => void,
  key: string,
  opts: { streaming: boolean; field: 'content' | 'thinking' },
) {
  const state = get()
  const delta = state.streamingBuffer[key]
  if (delta) {
    set((s) => {
      const messagesBySession = { ...s.messagesBySession }
      const messageId = isThinkingBufferKey(key) ? thinkingMessageId(key) : key
      for (const [sessionId, messages] of Object.entries(messagesBySession)) {
        messagesBySession[sessionId] = messages.map((m) => {
          if (m.id !== messageId) return m
          if (opts.field === 'thinking') {
            return {
              ...m,
              thinking: (m.thinking ?? '') + delta,
              streaming: opts.streaming,
            }
          }
          return {
            ...m,
            content: m.content + delta,
            streaming: opts.streaming,
          }
        })
      }
      const streamingBuffer = { ...s.streamingBuffer }
      delete streamingBuffer[key]
      return { messagesBySession, streamingBuffer }
    })
  } else if (!opts.streaming) {
    const messageId = isThinkingBufferKey(key) ? thinkingMessageId(key) : key
    set((s) => {
      const messagesBySession = { ...s.messagesBySession }
      for (const [sessionId, messages] of Object.entries(messagesBySession)) {
        messagesBySession[sessionId] = messages.map((m) =>
          m.id === messageId ? { ...m, streaming: false } : m,
        )
      }
      return { messagesBySession }
    })
  }
}

export const useChatStore = create<ChatState>()((set, get) => ({
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

  setMessages: (sessionId, messages) => {
    hydrateMessagesA2ui(sessionId, messages)
    set((s) => ({ messagesBySession: { ...s.messagesBySession, [sessionId]: messages } }))
  },

  addMessage: (sessionId, message) =>
    set((s) => ({
      messagesBySession: {
        ...s.messagesBySession,
        [sessionId]: [...(s.messagesBySession[sessionId] ?? []), message],
      },
    })),

  attachA2uiSurface: (sessionId, surfaceId, messageId) =>
    set((s) => {
      let targetId = messageId
      if (!targetId) {
        const a2uiTools = new Set([
          'document_form_show',
          'form_request_show',
          'cron_form_show',
          'a2ui_render',
        ])
        const tc = [...Object.values(s.toolCalls)]
          .reverse()
          .find((t) => a2uiTools.has(t.name) && t.messageId)
        targetId = tc?.messageId
      }
      if (!targetId) {
        const msgs = s.messagesBySession[sessionId] ?? []
        targetId = [...msgs].reverse().find((m) => m.role === 'assistant')?.id
      }
      if (!targetId) return s

      const list = s.messagesBySession[sessionId] ?? []
      const next = list.map((m) => {
        if (m.id !== targetId) return m
        const existing = resolveA2uiSurfaceRef(m.a2ui)
        if (existing === surfaceId) return m
        return { ...m, a2ui: surfaceId }
      })
      return {
        messagesBySession: { ...s.messagesBySession, [sessionId]: next },
      }
    }),

  appendStreamContent: (messageId, delta) => {
    set((s) => ({
      streamingBuffer: {
        ...s.streamingBuffer,
        [messageId]: (s.streamingBuffer[messageId] ?? '') + delta,
      },
    }))
    scheduleFlush(get, set)
  },

  flushStreamBuffer: (messageId) => {
    flushBufferKey(get, set, messageId, { streaming: false, field: 'content' })
  },

  appendThinking: (messageId, delta) => {
    const key = thinkingBufferKey(messageId)
    set((s) => ({
      streamingBuffer: {
        ...s.streamingBuffer,
        [key]: (s.streamingBuffer[key] ?? '') + delta,
      },
    }))
    scheduleFlush(get, set)
  },

  flushThinkingBuffer: (messageId) => {
    flushBufferKey(get, set, thinkingBufferKey(messageId), {
      streaming: false,
      field: 'thinking',
    })
  },

  setRunStatus: (runStatus) => set({ runStatus }),
  setRunId: (runId) => set({ runId }),
  setRunSessionId: (sessionId) => set({ runSessionId: sessionId }),

  setStage: (kind, toolName) =>
    set((s) => {
      const now = Date.now()
      const history = [...s.stageHistory]
      if (s.runStage) {
        history.push({ ...s.runStage, endedAt: now })
      }
      return {
        runStage: { kind, toolName, startedAt: now },
        stageHistory: history,
      }
    }),

  clearStage: () => set({ runStage: null, stageHistory: [] }),

  setError: (error) => set({ error }),
  setPendingApproval: (pendingApproval) => set({ pendingApproval }),
  setContextUsage: (contextUsage) => set({ contextUsage }),

  upsertToolCall: (id, patch) =>
    set((s) => ({
      toolCalls: {
        ...s.toolCalls,
        [id]: { ...(s.toolCalls[id] ?? { id, name: '', args: '', status: 'pending' }), ...patch },
      },
    })),

  addRunStep: (step) => set((s) => ({ runSteps: [...s.runSteps, step] })),
  finishRunStep: (stepId) =>
    set((s) => ({
      runSteps: s.runSteps.map((step) =>
        step.id === stepId ? { ...step, status: 'done' } : step,
      ),
    })),
  clearRunSteps: () => set({ runSteps: [] }),

  recordEvent: (event) =>
    set((s) => ({
      recentEvents: [...s.recentEvents.slice(-49), event],
    })),

  resetRun: () =>
    set({
      runStatus: 'idle',
      runId: null,
      runSessionId: null,
      runSteps: [],
      runStage: null,
      stageHistory: [],
      pendingApproval: null,
      error: null,
    }),

  clearStreamingState: () => {
    const state = get()
    for (const msgs of Object.values(state.messagesBySession)) {
      for (const m of msgs) {
        if (m.streaming) {
          state.flushStreamBuffer(m.id)
          state.flushThinkingBuffer(m.id)
        }
      }
    }
    set((s) => {
      const messagesBySession = { ...s.messagesBySession }
      for (const [sessionId, messages] of Object.entries(messagesBySession)) {
        messagesBySession[sessionId] = messages.map((m) =>
          m.streaming ? { ...m, streaming: false } : m,
        )
      }
      return { messagesBySession, streamingBuffer: {} }
    })
  },

  messageFromDto: (msg) => {
    const a2ui = msg.a2ui ?? undefined
    if (a2ui != null) hydrateA2uiFromRef(a2ui, msg.sessionId)
    return {
      id: msg.id,
      sessionId: msg.sessionId,
      runId: msg.runId,
      role: msg.role,
      content: msg.content,
      thinking: msg.thinking,
      toolName: msg.toolName,
      toolArgs: msg.toolArgs,
      toolResult: msg.toolResult,
      a2ui: resolveA2uiSurfaceRef(a2ui) ?? undefined,
      createdAt: msg.createdAt,
    }
  },
}))
