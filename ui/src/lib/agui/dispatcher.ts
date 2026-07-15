import {
  EventType,
  type BaseEvent,
  type CustomEvent,
  type MessagesSnapshotEvent,
  type RunErrorEvent,
  type RunStartedEvent,
  type StateDeltaEvent,
  type StateSnapshotEvent,
  type StepFinishedEvent,
  type StepStartedEvent,
  type TextMessageContentEvent,
  type TextMessageEndEvent,
  type TextMessageStartEvent,
  type ThinkingTextMessageContentEvent,
  type ThinkingTextMessageStartEvent,
  type ToolCallArgsEvent,
  type ToolCallEndEvent,
  type ToolCallResultEvent,
  type ToolCallStartEvent,
} from '@ag-ui/client'
import type {
  HermesApprovalRequiredPayload,
  HermesContextPayload,
  HermesCoworkProgressPayload,
  HermesCronFiredPayload,
  HermesSkillLearnedPayload,
  HermesTitlePayload,
} from '@hermes/shared'
import { HermesCustomEvents } from '@hermes/shared'
import { useAgentStateStore } from '@app/stores/agentState'
import { useChatStore } from '@app/stores/chat'
import { useSessionsStore } from '@app/stores/sessions'
import { useUiStore } from '@app/stores/ui'
import { extractA2uiSurfaceId, processA2UIMessage } from '@app/lib/a2ui/processor'
import { executeFrontendTool, isFrontendTool } from '@app/lib/agui/frontend-tools'
import { mergeCoworkProgress } from '@app/lib/cowork-progress'
import { generateId } from '@app/lib/utils'
import type { ChatMessage } from '@app/stores/chat'
import type { AgentState } from '@app/types/hermes'
import type { Operation } from 'fast-json-patch'

/** Ignore lifecycle events from a superseded/aborted run or after session reset. */
function isCurrentRun(eventRunId: string | null | undefined): boolean {
  if (eventRunId == null || eventRunId === '') return true
  const active = useChatStore.getState().runId
  if (active == null) return false
  return String(eventRunId) === active
}

/** Reset in-flight streaming UI so thinking/stop cannot stick after terminal events. */
function finalizeRunUi(chat: ReturnType<typeof useChatStore.getState>): void {
  chat.clearStreamingState()
  for (const [id, tc] of Object.entries(chat.toolCalls)) {
    if (
      tc.status === 'executing' ||
      tc.status === 'pending' ||
      tc.status === 'streaming-args'
    ) {
      chat.upsertToolCall(id, { status: 'done' })
    }
  }
}

export function dispatchAguiEvent(event: BaseEvent, sessionId: string | null): void {
  const chat = useChatStore.getState()
  const agentState = useAgentStateStore.getState()
  const sessions = useSessionsStore.getState()
  const ui = useUiStore.getState()

  switch (event.type) {
    case EventType.RUN_STARTED: {
      const e = event as RunStartedEvent
      const eventRun = e.runId != null ? String(e.runId) : null
      const active = chat.runId
      // Client usually sets runId before the request; reject late STARTED from an old run.
      if (eventRun != null && active != null && active !== eventRun) break
      chat.setRunStatus('running')
      chat.setRunId(e.runId ?? chat.runId)
      if (sessionId) chat.setRunSessionId(sessionId)
      chat.setError(null)
      chat.clearStage()
      chat.setStage('starting')
      break
    }

    case EventType.RUN_FINISHED: {
      const e = event as { runId?: string }
      if (!isCurrentRun(e.runId)) break
      finalizeRunUi(chat)
      chat.setStage('done')
      chat.setRunStatus('idle')
      chat.setRunId(null)
      globalThis.setTimeout(() => {
        useChatStore.getState().clearStage()
      }, 1200)
      break
    }

    case EventType.RUN_ERROR: {
      const e = event as RunErrorEvent & { runId?: string; code?: string }
      if (!isCurrentRun(e.runId)) break
      const aborted =
        e.code === 'abort' ||
        /abort/i.test(e.message ?? '') ||
        chat.runStatus === 'cancelled'
      finalizeRunUi(chat)
      if (!aborted) {
        chat.setError(e.message ?? 'Run failed')
        chat.setRunStatus('error')
        chat.setStage('error')
      } else {
        chat.setError(null)
        chat.setRunStatus('idle')
        chat.clearStage()
      }
      break
    }

    case EventType.STEP_STARTED: {
      const e = event as StepStartedEvent
      chat.addRunStep({
        id: String(e.stepId ?? generateId()),
        name: String(e.stepName ?? 'Step'),
        status: 'running',
      })
      break
    }

    case EventType.STEP_FINISHED: {
      const e = event as StepFinishedEvent
      if (e.stepId) chat.finishRunStep(String(e.stepId))
      break
    }

    case EventType.TEXT_MESSAGE_START: {
      const e = event as TextMessageStartEvent
      // Late SSE from an aborted/finished turn must not revive writing UI.
      if (chat.runStatus !== 'running') break
      if (!isCurrentRun(e.runId != null ? String(e.runId) : undefined)) break
      chat.setStage('writing')
      if (sessionId && e.messageId) {
        chat.addMessage(sessionId, {
          id: String(e.messageId),
          sessionId,
          runId: e.runId != null ? String(e.runId) : null,
          role: 'assistant',
          content: '',
          streaming: true,
          createdAt: new Date().toISOString(),
        })
      }
      break
    }

    case EventType.TEXT_MESSAGE_CONTENT: {
      const e = event as TextMessageContentEvent
      if (e.messageId && e.delta) {
        chat.appendStreamContent(e.messageId, e.delta)
      }
      break
    }

    case EventType.TEXT_MESSAGE_END: {
      const e = event as TextMessageEndEvent
      if (e.messageId) chat.flushStreamBuffer(e.messageId)
      break
    }

    case EventType.THINKING_START:
    case EventType.THINKING_END: {
      // Thinking step boundaries; per-message UI state is driven by the
      // THINKING_TEXT_MESSAGE_* events below.
      break
    }

    case EventType.THINKING_TEXT_MESSAGE_START: {
      const e = event as ThinkingTextMessageStartEvent
      // Late reasoning from an aborted turn must not leave the UI stuck on thinking.
      if (chat.runStatus !== 'running') break
      if (!isCurrentRun(e.runId != null ? String(e.runId) : undefined)) break
      chat.setStage('thinking')
      if (sessionId && e.messageId) {
        const msgId = String(e.messageId)
        const existing = (chat.messagesBySession[sessionId] ?? []).find(
          (m) => m.id === msgId,
        )
        if (!existing) {
          chat.addMessage(sessionId, {
            id: msgId,
            sessionId,
            runId: e.runId != null ? String(e.runId) : null,
            role: 'assistant',
            content: '',
            thinking: '',
            streaming: true,
            createdAt: new Date().toISOString(),
          })
        }
      }
      break
    }

    case EventType.THINKING_TEXT_MESSAGE_CONTENT: {
      const e = event as ThinkingTextMessageContentEvent
      const delta =
        typeof e.delta === 'string' ? e.delta : e.delta != null ? String(e.delta) : ''
      if (e.messageId && delta) {
        chat.appendThinking(String(e.messageId), delta)
      }
      break
    }

    case EventType.THINKING_TEXT_MESSAGE_END: {
      const e = event as { messageId?: string }
      if (e.messageId) {
        chat.flushThinkingBuffer(String(e.messageId))
        chat.flushStreamBuffer(String(e.messageId))
      }
      break
    }

    case EventType.TOOL_CALL_START: {
      const e = event as ToolCallStartEvent & { parentMessageId?: string }
      if (chat.runStatus !== 'running') break
      if (!isCurrentRun(e.runId != null ? String(e.runId) : undefined)) break
      chat.setStage('tool', e.toolCallName)
      if (e.toolCallId && e.toolCallName) {
        let messageId =
          e.parentMessageId != null ? String(e.parentMessageId) : undefined
        if (!messageId && sessionId) {
          const msgs = chat.messagesBySession[sessionId] ?? []
          messageId = [...msgs].reverse().find((m) => m.role === 'assistant')?.id
        }
        chat.upsertToolCall(e.toolCallId, {
          id: e.toolCallId,
          name: e.toolCallName,
          args: '',
          status: 'streaming-args',
          messageId,
        })
      }
      break
    }

    case EventType.TOOL_CALL_ARGS: {
      const e = event as ToolCallArgsEvent
      if (e.toolCallId && e.delta) {
        const tc = chat.toolCalls[e.toolCallId]
        chat.upsertToolCall(e.toolCallId, {
          args: (tc?.args ?? '') + e.delta,
          status: 'streaming-args',
        })
      }
      break
    }

    case EventType.TOOL_CALL_END: {
      const e = event as ToolCallEndEvent
      if (e.toolCallId) {
        chat.upsertToolCall(e.toolCallId, { status: 'executing' })
        const tc = chat.toolCalls[e.toolCallId]
        if (tc && isFrontendTool(tc.name)) {
          let args: Record<string, unknown> = {}
          try {
            args = JSON.parse(tc.args || '{}') as Record<string, unknown>
          } catch {
            args = {}
          }
          void executeFrontendTool(tc.name, args)
            .then((result) => {
              useChatStore.getState().upsertToolCall(e.toolCallId!, {
                result,
                status: 'done',
              })
            })
            .catch((err: unknown) => {
              useChatStore.getState().upsertToolCall(e.toolCallId!, {
                result: { error: String(err) },
                status: 'error',
              })
            })
        }
      }
      break
    }

    case EventType.TOOL_CALL_RESULT: {
      const e = event as ToolCallResultEvent
      const toolCallId = e.toolCallId != null ? String(e.toolCallId) : null
      if (toolCallId) {
        chat.upsertToolCall(toolCallId, {
          result: e.content,
          status: 'done',
        })
        const executing = Object.values(chat.toolCalls).some(
          (tc) => tc.id !== toolCallId && tc.status === 'executing',
        )
        if (!executing) chat.setStage('starting')
        if (sessionId) {
          chat.addMessage(sessionId, {
            id: generateId(),
            sessionId,
            runId: e.runId != null ? String(e.runId) : null,
            role: 'tool',
            content:
              typeof e.content === 'string' ? e.content : JSON.stringify(e.content),
            toolName: chat.toolCalls[toolCallId]?.name,
            createdAt: new Date().toISOString(),
          })
        }
      }
      break
    }

    case EventType.STATE_SNAPSHOT: {
      const e = event as StateSnapshotEvent
      if (e.snapshot) {
        agentState.setState(e.snapshot as AgentState)
      }
      break
    }

    case EventType.STATE_DELTA: {
      const e = event as StateDeltaEvent
      if (e.delta) {
        agentState.applyDelta(e.delta as Operation[])
      }
      break
    }

    case EventType.MESSAGES_SNAPSHOT: {
      const e = event as MessagesSnapshotEvent
      if (sessionId && e.messages) {
        chat.setMessages(
          sessionId,
          e.messages.map(
            (m): ChatMessage => ({
              id: m.id ?? generateId(),
              sessionId,
              runId: null,
              role: (m.role as ChatMessage['role']) ?? 'assistant',
              content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
              createdAt: new Date().toISOString(),
            }),
          ),
        )
      }
      break
    }

    case EventType.CUSTOM: {
      const e = event as CustomEvent
      const name = e.name
      const value = e.value
      if (name === 'hermes.context') {
        const payload = value as HermesContextPayload
        const used =
          payload.tokensUsed ?? payload.totalTokens ?? payload.promptTokens ?? 0
        const limit = payload.tokensMax ?? payload.contextLimit ?? 128_000
        chat.setContextUsage({ used, limit })
      } else if (name === 'hermes.title') {
        const payload = value as HermesTitlePayload
        if (sessionId) {
          sessions.updateSession(sessionId, { title: payload.title })
        }
      } else if (name === 'hermes.skill.learned') {
        const payload = value as HermesSkillLearnedPayload
        ui.addToast({
          title: 'Skill learned',
          description: payload.skillName,
          variant: 'success',
        })
      } else if (name === 'hermes.cron.fired') {
        const payload = value as HermesCronFiredPayload
        ui.addToast({
          title: 'Scheduled task fired',
          description: payload.jobName,
          variant: 'attention',
        })
      } else if (name === 'a2ui.message') {
        processA2UIMessage(value, sessionId)
        const surfaceId = extractA2uiSurfaceId(value)
        if (surfaceId && sessionId) {
          chat.attachA2uiSurface(sessionId, surfaceId)
        }
      } else if (name === 'hermes.approval.required') {
        const payload = value as HermesApprovalRequiredPayload
        chat.setPendingApproval({
          toolCallId: payload.toolCallId,
          toolName: payload.toolName,
          args: (payload.args ?? {}) as Record<string, unknown>,
        })
      } else if (
        name === HermesCustomEvents.COWORK_PROGRESS ||
        name === 'hermes.cowork.progress'
      ) {
        const payload = value as HermesCoworkProgressPayload
        if (!payload || typeof payload.taskId !== 'string') break
        const toolCalls = chat.toolCalls
        const active =
          Object.values(toolCalls).find(
            (tc) =>
              tc.name === 'delegate_to_cowork' &&
              ['pending', 'streaming-args', 'executing'].includes(tc.status),
          ) ??
          Object.values(toolCalls)
            .filter((tc) => tc.name === 'delegate_to_cowork')
            .at(-1)
        if (active) {
          const merged = mergeCoworkProgress(
            {
              progressLines: active.progressLines ?? [],
              progressLive: active.progressLive ?? null,
            },
            payload,
          )
          chat.upsertToolCall(active.id, {
            progressLines: merged.progressLines,
            progressLive: merged.progressLive,
            // Keep the card in a live state while Cowork is still working.
            status:
              payload.phase === 'ended' || payload.phase === 'error'
                ? active.status
                : active.status === 'done'
                  ? 'executing'
                  : active.status,
          })
        }
        if (payload.phase === 'ended' && payload.ok !== false) {
          ui.addToast({
            title: 'Open Cowork finished',
            description: payload.text?.slice(0, 120) || payload.taskId,
            variant: 'success',
          })
        } else if (payload.phase === 'error') {
          chat.setStage('tool', 'delegate_to_cowork')
          const aborted = /abort/i.test(payload.text ?? '')
          ui.addToast({
            title: aborted ? 'Open Cowork cancelled' : 'Open Cowork failed',
            description: payload.text?.slice(0, 160) || payload.taskId,
            variant: aborted ? 'attention' : 'danger',
          })
        }
      }
      break
    }

    default:
      break
  }
}
