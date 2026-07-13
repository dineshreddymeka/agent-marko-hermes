import type { BaseEvent } from '@ag-ui/client'
import { dispatchAguiEvent } from '@app/lib/agui/dispatcher'
import { apiClient } from '@app/lib/api'
import { useAgentStateStore } from '@app/stores/agentState'
import { useChatStore } from '@app/stores/chat'

export type RunEventRecord = {
  id: string
  runId: string
  sessionId: string | null
  seq: number
  eventType: string
  payload: unknown
  createdAt: string
}

export type DebugHealth = {
  status: string
  database: string
  activeRuns: number
  embeddingQueue: number
  uptime: number
}

export type RecentRun = {
  runId: string
  sessionId: string | null
  eventCount: number
  lastAt: string
}

export async function fetchDebugHealth(): Promise<DebugHealth> {
  return apiClient.get<DebugHealth>('/api/debug/health')
}

export async function fetchRecentRuns(limit = 20): Promise<RecentRun[]> {
  const res = await apiClient.get<{ runs: RecentRun[] }>('/api/debug/runs', { limit })
  return res.runs
}

export async function fetchRunEvents(runId: string): Promise<RunEventRecord[]> {
  const res = await apiClient.get<{ runId: string; events: RunEventRecord[] }>(
    `/api/debug/runs/${runId}/events`,
  )
  return res.events
}

export function prepareReplaySession(sessionId: string | null): void {
  const chat = useChatStore.getState()
  chat.resetRun()
  chat.setContextUsage(null)
  if (sessionId) {
    chat.setMessages(sessionId, [])
  }
  useAgentStateStore.getState().setState({ todos: [], plan: '', workspaceContext: {} })
}

export async function replayRunEvents(
  runId: string,
  opts?: { sessionId?: string | null; delayMs?: number },
): Promise<number> {
  const events = await fetchRunEvents(runId)
  if (events.length === 0) return 0

  const sessionId = opts?.sessionId ?? events.find((e) => e.sessionId)?.sessionId ?? null
  prepareReplaySession(sessionId)

  const delay = opts?.delayMs ?? 0
  for (const record of events) {
    const event = record.payload as BaseEvent
    dispatchAguiEvent(event, record.sessionId ?? sessionId)
    if (delay > 0) {
      await new Promise((r) => setTimeout(r, delay))
    }
  }

  return events.length
}
