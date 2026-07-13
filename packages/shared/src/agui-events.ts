/** Custom AG-UI event names and payload types (Phase 3+) */

export const HermesCustomEvents = {
  CONTEXT: 'hermes.context',
  CRON_FIRED: 'hermes.cron.fired',
  SKILL_LEARNED: 'hermes.skill.learned',
  TITLE: 'hermes.title',
  A2UI_MESSAGE: 'a2ui.message',
  APPROVAL_REQUIRED: 'hermes.approval.required',
  TOOL_ERROR: 'hermes.tool.error',
  /** Live Open Cowork JSONL progress streamed during `delegate_to_cowork`. */
  COWORK_PROGRESS: 'hermes.cowork.progress',
  /** Agent LLM fell back to chat-only bridge — tools unavailable this turn. */
  CAPABILITIES_DEGRADED: 'hermes.capabilities.degraded',
  /** Nested `delegate_to_agent` parent↔child run linkage. */
  DELEGATION: 'hermes.delegation',
} as const

export type HermesCustomEventName =
  | typeof HermesCustomEvents.CONTEXT
  | typeof HermesCustomEvents.CRON_FIRED
  | typeof HermesCustomEvents.SKILL_LEARNED
  | typeof HermesCustomEvents.TITLE
  | typeof HermesCustomEvents.A2UI_MESSAGE
  | typeof HermesCustomEvents.APPROVAL_REQUIRED
  | typeof HermesCustomEvents.TOOL_ERROR
  | typeof HermesCustomEvents.COWORK_PROGRESS
  | typeof HermesCustomEvents.CAPABILITIES_DEGRADED
  | typeof HermesCustomEvents.DELEGATION

export interface HermesContextPayload {
  promptTokens?: number
  completionTokens?: number
  totalTokens?: number
  tokensUsed?: number
  tokensMax?: number
  contextLimit?: number
}

export interface HermesTitlePayload {
  sessionId?: string
  title: string
}

export interface HermesCronFiredPayload {
  jobId: string
  jobName: string
}

export interface HermesSkillLearnedPayload {
  skillId: string
  skillName: string
}

export interface HermesApprovalRequiredPayload {
  toolCallId: string
  toolName: string
  args: Record<string, unknown>
}

/** Open Cowork → Jarvis chat progress (stdio JSONL mirrored into AG-UI). */
export interface HermesCoworkProgressPayload {
  taskId: string
  coworkSessionId?: string | null
  phase: 'started' | 'delta' | 'tool' | 'ended' | 'error'
  text?: string
  tool?: string
  toolInput?: unknown
  toolOutput?: string
  ok?: boolean
}

export interface HermesCapabilitiesDegradedPayload {
  reason: string
  toolsEnabled: boolean
  bridgeFallback: boolean
  circuitState?: string
  lastFailure?: string | null
}

export interface HermesDelegationPayload {
  phase: 'started' | 'finished' | 'error'
  parentRunId: string
  nestedRunId: string
  provider: string
  error?: string
}

export type HermesCustomPayload =
  | HermesContextPayload
  | HermesTitlePayload
  | HermesCronFiredPayload
  | HermesSkillLearnedPayload
  | HermesApprovalRequiredPayload
  | HermesCoworkProgressPayload
  | HermesCapabilitiesDegradedPayload
  | HermesDelegationPayload
  | Record<string, unknown>

export interface HermesCustomEvent {
  name: HermesCustomEventName
  payload: HermesCustomPayload
}
