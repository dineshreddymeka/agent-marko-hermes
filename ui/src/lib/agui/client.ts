import { HttpAgent } from '@ag-ui/client'
import type { Message, RunAgentInput } from '@ag-ui/client'
import { dispatchAguiEvent } from '@app/lib/agui/dispatcher'
import { getFrontendTools } from '@app/lib/agui/frontend-tools'
import { useAgentStateStore } from '@app/stores/agentState'
import { useChatStore } from '@app/stores/chat'
import { apiClient, hermesAuthHeaders, readBasePath } from '@app/lib/api'
import { fetchHermesMessages } from '@app/lib/hermes-adapters'
import { generateId } from '@app/lib/utils'

export type ApprovalDecision = 'approve' | 'reject' | 'always' | 'always_tool'

let agent: HttpAgent | null = null
let currentSessionId: string | null = null
/** In-flight runAgent promise — awaited before starting a replacement run. */
let activeRunPromise: Promise<void> | null = null
/** Run lifecycle FSM + watchdog patterns — see docs/chat-reliability-frameworks.md */
const STARTUP_STALL_TIMEOUT_MS = 15_000
const STARTUP_STALL_MESSAGE =
  'Run startup timed out. Please retry.'

/**
 * True only when a run is genuinely active.
 * Guards UI against stale `runStatus: running` snapshots.
 */
export function hasInFlightRun(): boolean {
  const state = useChatStore.getState()
  if (state.runStatus !== 'running') return false
  return Boolean(state.runId || activeRunPromise)
}

/**
 * Recover from stale running state left behind by interrupted reloads/streams.
 * Returns true when state was repaired.
 */
export function recoverStaleRunIfNeeded(): boolean {
  const state = useChatStore.getState()
  if (state.runStatus !== 'running') return false
  if (state.runId || activeRunPromise) return false
  state.clearStreamingState()
  state.clearStage()
  state.setRunStatus('idle')
  state.setRunId(null)
  state.setError(null)
  return true
}

/**
 * Resolve a run stuck forever in "starting" (no stream progress/terminal event).
 * Returns true when a stalled run was transitioned to error.
 */
export function recoverRunFromStartingStall(
  runId: string,
  message = STARTUP_STALL_MESSAGE,
): boolean {
  const state = useChatStore.getState()
  if (state.runId !== runId) return false
  if (state.runStatus !== 'running') return false
  if (state.runStage?.kind !== 'starting') return false
  resetAgent()
  finishLocalRun(runId, 'error', message)
  return true
}

function startStartupWatchdog(runId: string): () => void {
  const timer = globalThis.setTimeout(() => {
    recoverRunFromStartingStall(runId)
  }, STARTUP_STALL_TIMEOUT_MS)
  return () => globalThis.clearTimeout(timer)
}

/** Test helper to validate startup-timeout recovery behavior. */
export function startStartupWatchdogForTests(runId: string, timeoutMs: number): () => void {
  const timer = globalThis.setTimeout(() => {
    recoverRunFromStartingStall(runId)
  }, timeoutMs)
  return () => globalThis.clearTimeout(timer)
}

function aguiEndpointUrl(): string {
  const base = readBasePath()
  return `${base}/agui`
}

function getAgent(sessionId: string): HttpAgent {
  if (!agent || agent.threadId !== sessionId) {
    agent = new HttpAgent({
      url: aguiEndpointUrl(),
      threadId: sessionId,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
        ...hermesAuthHeaders(),
      },
    })
    agent.subscribe({
      onEvent: ({ event }) => {
        dispatchAguiEvent(event, currentSessionId)
        useChatStore.getState().recordEvent(JSON.stringify(event))
      },
    })
  }
  // Refresh auth token each run (boot may complete after first agent construction).
  agent.headers = {
    'Content-Type': 'application/json',
    Accept: 'text/event-stream',
    ...hermesAuthHeaders(),
  }
  return agent
}

/** Drop the shared HttpAgent so the next turn cannot inherit a half-aborted protocol state. */
function resetAgent(): void {
  if (agent) {
    try {
      agent.abortRun()
    } catch {
      /* ignore */
    }
  }
  agent = null
}

function finishLocalRun(
  runId: string,
  status: 'idle' | 'error',
  error?: string | null,
): void {
  const state = useChatStore.getState()
  if (state.runId !== runId) return
  state.clearStreamingState()
  if (error) state.setError(error)
  else state.setError(null)
  state.setRunStatus(status)
  if (status === 'idle') {
    state.setRunId(null)
    state.clearStage()
  } else {
    state.setRunId(null)
    state.setStage('error')
  }
}

function toAguiMessages(
  messages: ReturnType<typeof useChatStore.getState>['messagesBySession'][string],
): Message[] {
  return (messages ?? []).map((m) => {
    if (m.role === 'tool') {
      return {
        id: m.id,
        role: 'tool' as const,
        content: m.content,
        toolCallId: m.toolName ?? m.id,
      }
    }
    if (m.role === 'assistant') {
      return { id: m.id, role: 'assistant' as const, content: m.content }
    }
    if (m.role === 'system') {
      return { id: m.id, role: 'system' as const, content: m.content }
    }
    return { id: m.id, role: 'user' as const, content: m.content }
  })
}

/**
 * Build AG-UI messages from a fresh Zustand snapshot.
 * Never reuse a pre-mutation `getState()` handle — Zustand state is immutable,
 * so reading `messagesBySession` off a stale snapshot omits the optimistic
 * user turn and makes the LLM answer one turn behind.
 */
export function getAguiMessagesForSession(sessionId: string): Message[] {
  return toAguiMessages(useChatStore.getState().messagesBySession[sessionId] ?? [])
}

export async function runAgent(input: {
  sessionId: string
  content: string
  profileId?: string | null
  /** When true, do not append a new user message (retry after error). */
  reuseLastUserMessage?: boolean
}): Promise<void> {
  const { sessionId, content, reuseLastUserMessage } = input
  currentSessionId = sessionId

  // Cancel any in-flight run and wait for it to settle so we never stack two
  // HttpAgent.runAgent() calls on one instance (leaves thinking/stop stuck).
  const prior = useChatStore.getState()
  if (prior.runStatus === 'running' && agent) {
    try {
      agent.abortRun()
    } catch {
      /* ignore */
    }
    const pending = activeRunPromise
    if (pending) {
      try {
        await Promise.race([
          pending,
          new Promise<void>((resolve) => {
            globalThis.setTimeout(resolve, 2_000)
          }),
        ])
      } catch {
        /* prior run error is expected after abort */
      }
    }
    resetAgent()
  }

  const runId = generateId()
  const chat = useChatStore.getState()
  const agentState = useAgentStateStore.getState().state
  const httpAgent = getAgent(sessionId)

  chat.setRunId(runId)
  chat.setRunStatus('running')
  chat.setError(null)
  chat.clearRunSteps()
  chat.clearStage()
  chat.setStage('starting')

  if (!reuseLastUserMessage) {
    const userMessage = {
      id: generateId(),
      sessionId,
      runId,
      role: 'user' as const,
      content,
      createdAt: new Date().toISOString(),
    }
    chat.addMessage(sessionId, userMessage)
  }

  // Fresh snapshot after addMessage — `chat` still points at the pre-add state.
  const allMessages = getAguiMessagesForSession(sessionId)
  httpAgent.setMessages(allMessages)
  httpAgent.setState(agentState)

  const runInput: RunAgentInput = {
    threadId: sessionId,
    runId,
    messages: httpAgent.messages,
    tools: getFrontendTools(),
    state: agentState,
    context: [],
  }
  const forwardedProps =
    input.profileId != null && String(input.profileId).trim() !== ''
      ? { profileId: String(input.profileId).trim() }
      : undefined
  const stopStartupWatchdog = startStartupWatchdog(runId)

  let runPromise: Promise<void> | null = null
  runPromise = (async () => {
    try {
      await httpAgent.runAgent({
        runId,
        tools: runInput.tools,
        context: runInput.context,
        ...(forwardedProps ? { forwardedProps } : {}),
      })
      // Ignore completion if a newer run already replaced this one.
      if (useChatStore.getState().runId === runId) {
        finishLocalRun(runId, 'idle')
      }
    } catch (err) {
      const state = useChatStore.getState()
      if (state.runId !== runId) return
      const aborted =
        err instanceof Error &&
        (err.name === 'AbortError' || /abort/i.test(err.message))
      if (aborted) {
        finishLocalRun(runId, 'idle')
        return
      }
      const message = err instanceof Error ? err.message : 'Agent run failed'
      finishLocalRun(runId, 'error', message)
    } finally {
      stopStartupWatchdog()
      // Belt-and-suspenders: never leave the stop button / thinking stage on
      // if this is still the active run (hang, proxy drop, protocol reject).
      const state = useChatStore.getState()
      if (state.runId === runId && state.runStatus === 'running') {
        state.clearStreamingState()
        state.setRunStatus('idle')
        state.setRunId(null)
        state.clearStage()
      }
      if (activeRunPromise === runPromise) activeRunPromise = null
    }
  })()

  activeRunPromise = runPromise
  await runPromise
}

/** Re-run the last user turn without duplicating the user message. */
export async function retryLastRun(sessionId: string): Promise<void> {
  const messages = useChatStore.getState().messagesBySession[sessionId] ?? []
  const lastUser = [...messages].reverse().find((m) => m.role === 'user')
  if (!lastUser?.content) {
    useChatStore.getState().setError(null)
    useChatStore.getState().setRunStatus('idle')
    return
  }
  await runAgent({
    sessionId,
    content: lastUser.content,
    reuseLastUserMessage: true,
  })
}

export function cancelRun(): void {
  if (agent) {
    try {
      agent.abortRun()
    } catch {
      /* ignore */
    }
  }
  const chat = useChatStore.getState()
  chat.clearStreamingState()
  chat.clearStage()
  chat.setRunStatus('idle')
  chat.setRunId(null)
  chat.setError(null)
  // Clear stuck tool cards (abort may skip a clean TOOL_CALL_RESULT race).
  for (const [id, tc] of Object.entries(chat.toolCalls)) {
    if (
      tc.status === 'executing' ||
      tc.status === 'pending' ||
      tc.status === 'streaming-args'
    ) {
      chat.upsertToolCall(id, {
        status: 'error',
        result: { error: 'Cancelled' },
        progressLines: tc.progressLines,
        progressLive: tc.progressLive,
      })
    }
  }
}

export async function respondToApproval(
  decision: ApprovalDecision,
  toolCallId: string,
): Promise<void> {
  const chat = useChatStore.getState()
  chat.setPendingApproval(null)

  try {
    await apiClient.post<{ ok: boolean }>('/api/approval/resolve', { toolCallId, decision })
    if (decision === 'reject') {
      chat.setError('Tool call rejected')
      chat.setRunStatus('error')
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to send approval'
    chat.setError(message)
    chat.setRunStatus('error')
  }
}

export interface ApprovalConfig {
  autoApproveAll: boolean
  toolWhitelist: string[]
  sessionWhitelist: string[]
}

export async function fetchApprovalConfig(): Promise<ApprovalConfig> {
  return apiClient.get<ApprovalConfig>('/api/approval/config')
}

export async function saveApprovalConfig(
  patch: Partial<Pick<ApprovalConfig, 'autoApproveAll' | 'toolWhitelist'>>,
): Promise<ApprovalConfig> {
  return apiClient.put<ApprovalConfig>('/api/approval/config', patch)
}

/**
 * Hydrate messages from the API without clobbering an in-flight transcript.
 * Stale empty fetches (StrictMode remount / navigate-during-send) previously
 * wiped optimistic user + streamed assistant bubbles after the run finished.
 */
export async function loadSessionMessages(
  sessionId: string,
  opts?: { signal?: AbortSignal },
): Promise<void> {
  let messages: import('@hermes/shared').Message[]
  try {
    messages = await fetchHermesMessages(sessionId)
  } catch (err) {
    if (opts?.signal?.aborted) return
    const status = (err as { status?: number })?.status
    if (status === 404) return
    throw err instanceof Error ? err : new Error('Failed to load messages')
  }
  if (opts?.signal?.aborted) return

  const chat = useChatStore.getState()
  const existing = chat.messagesBySession[sessionId] ?? []
  const loaded = messages.map((m) => chat.messageFromDto(m))

  // Empty server snapshot must not erase local optimistic/streamed messages
  // (navigate + StrictMode remount often fetch before the runtime insert commits).
  if (loaded.length === 0 && existing.length > 0) return

  chat.setMessages(sessionId, mergeSessionMessages(loaded, existing))
}

/** Prefer server rows; keep local-only optimistic/streaming rows not yet on the server. */
function mergeSessionMessages(
  server: ReturnType<typeof useChatStore.getState>['messagesBySession'][string],
  local: ReturnType<typeof useChatStore.getState>['messagesBySession'][string],
): NonNullable<ReturnType<typeof useChatStore.getState>['messagesBySession'][string]> {
  const serverList = server ?? []
  const localList = local ?? []
  if (localList.length === 0) return serverList
  if (serverList.length === 0) return localList

  const byId = new Map(serverList.map((m) => [m.id, m]))
  const serverFingerprints = new Set(
    serverList.map((m) => `${m.role}\0${m.content}`),
  )
  for (const m of localList) {
    if (byId.has(m.id)) {
      const serverMsg = byId.get(m.id)!
      if (m.a2ui != null && serverMsg.a2ui == null) {
        byId.set(m.id, { ...serverMsg, a2ui: m.a2ui })
      }
      continue
    }
    // Client optimistic user ids differ from server-generated ids — skip dupes by content.
    if (m.content && serverFingerprints.has(`${m.role}\0${m.content}`)) {
      const match = serverList.find(
        (s) => s.role === m.role && s.content === m.content,
      )
      if (match && m.a2ui != null && match.a2ui == null) {
        byId.set(match.id, { ...match, a2ui: m.a2ui })
      }
      continue
    }
    byId.set(m.id, m)
  }
  return [...byId.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt))
}

export async function checkLiveRun(sessionId: string): Promise<boolean> {
  try {
    const res = await fetch(`/api/sessions/${sessionId}/live`, {
      credentials: 'include',
      headers: hermesAuthHeaders(),
    })
    if (!res.ok) return false
    const data = (await res.json()) as { live: boolean; runId?: string | null }
    if (data.live && data.runId) {
      currentSessionId = sessionId
      getAgent(sessionId)
      useChatStore.getState().setRunId(data.runId)
      useChatStore.getState().setRunStatus('running')
      return true
    }
  } catch {
    // endpoint not available
  }
  return false
}

/** While a recovered run is live, refresh messages until the run ends. */
export function startLiveMessagePoll(sessionId: string): () => void {
  let stopped = false
  const tick = async () => {
    if (stopped) return
    try {
      await loadSessionMessages(sessionId)
      const stillLive = await checkLiveRun(sessionId)
      if (!stillLive) {
        useChatStore.getState().setRunStatus('idle')
        stopped = true
        return
      }
    } catch {
      /* ignore transient poll errors */
    }
    if (!stopped) window.setTimeout(() => void tick(), 1500)
  }
  void tick()
  return () => {
    stopped = true
  }
}
