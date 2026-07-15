import { generateId } from '@app/lib/utils'
import { hermesAuthHeaders } from '@app/lib/api'
import { useSessionsStore } from '@app/stores/sessions'
import { useUiStore } from '@app/stores/ui'
import type { CoworkDeliverableType, DocumentRequestDeliverableType } from '@hermes/shared'

function slugifyTopic(topic: string): string {
  const slug = topic
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
  return slug || 'draft'
}

function buildMarkdownDraft(topic: string, payload: Record<string, unknown>): string {
  const audience = String(payload.audience ?? '').trim()
  const length = String(payload.length ?? '').trim()
  const style = String(payload.style ?? '').trim()
  const notes = String(payload.notes ?? '').trim()
  return [
    `# Draft: ${topic}`,
    '',
    '## Overview',
    '',
    `Working draft about **${topic}**.`,
    '',
    '## Details',
    '',
    `- Topic: ${topic}`,
    audience ? `- Audience: ${audience}` : null,
    length ? `- Length: ${length}` : null,
    style ? `- Style: ${style}` : null,
    notes ? `- Notes: ${notes}` : null,
    '',
    '## Outline',
    '',
    '1. Background',
    '2. Main points',
    '3. Open questions',
    '4. Next steps',
    '',
  ]
    .filter((line) => line != null)
    .join('\n')
}

function toCoworkDeliverableType(
  type: DocumentRequestDeliverableType,
): CoworkDeliverableType | null {
  switch (type) {
    case 'presentation':
      return 'presentation'
    case 'word':
      return 'word'
    case 'pdf':
      return 'pdf'
    default:
      return null
  }
}

function buildCoworkGoal(payload: Record<string, unknown>): string {
  const topic = String(payload.topic ?? '').trim()
  const type = String(payload.deliverableType ?? '')
  const audience = String(payload.audience ?? '').trim()
  const length = String(payload.length ?? '').trim()
  const style = String(payload.style ?? '').trim()
  const notes = String(payload.notes ?? '').trim()
  const kind =
    type === 'presentation'
      ? 'PowerPoint presentation'
      : type === 'word'
        ? 'Word document'
        : type === 'pdf'
          ? 'PDF'
          : 'document'
  const parts = [`Create a ${kind} about ${topic}.`]
  if (audience) parts.push(`Audience: ${audience}.`)
  if (length) parts.push(`Length: ${length}.`)
  if (style) parts.push(`Style: ${style}.`)
  if (notes) parts.push(`Notes: ${notes}.`)
  return parts.join(' ')
}

/**
 * A2UI action / actionResponse round-trips (SoT Phase 5).
 * Known Hermes widget actions hit REST for real side effects; all actions also
 * post an AG-UI follow-up turn so the agent can acknowledge.
 */
export async function sendA2UIAction(
  surfaceId: string,
  action: string,
  data: unknown,
  sessionId?: string | null,
): Promise<void> {
  const payload = (data && typeof data === 'object' ? data : {}) as Record<string, unknown>

  try {
    if (action === 'create_cron') {
      const timezone = String(payload.timezone ?? 'UTC')
      const mcpServerIds = Array.isArray(payload.mcpServerIds)
        ? payload.mcpServerIds.map(String)
        : []
      const skillIds = Array.isArray(payload.skillIds) ? payload.skillIds.map(String) : []
      const prompt = String(payload.prompt ?? 'A2UI created job')
      const name = String(payload.name ?? 'A2UI cron')
      // Same workflow DTO as the Cron panel wizard (POST /api/cron).
      const res = await fetch('/api/cron', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...hermesAuthHeaders() },
        credentials: 'include',
        body: JSON.stringify({
          name,
          schedule: String(payload.schedule ?? '0 9 * * *'),
          prompt,
          timezone,
          enabled: true,
          workflow: {
            version: 1,
            intent: prompt,
            timezone,
            mcpServerIds,
            skillIds,
            headlessAutoApprove: false,
          },
        }),
      })
      if (!res.ok) {
        const detail = await res.text().catch(() => '')
        throw new Error(detail || `HTTP ${res.status}`)
      }
      useUiStore.getState().addToast({
        title: 'Scheduled task created',
        description: name,
        variant: 'success',
      })
    } else if (action === 'create_document') {
      const topic = String(payload.topic ?? '').trim()
      const rawType = String(payload.deliverableType ?? '')
      if (!topic) throw new Error('Topic is required')
      if (
        rawType !== 'markdown' &&
        rawType !== 'word' &&
        rawType !== 'pdf' &&
        rawType !== 'presentation'
      ) {
        throw new Error('Deliverable type is required')
      }
      const deliverableType = rawType as DocumentRequestDeliverableType

      if (deliverableType === 'markdown') {
        const path = `drafts/${slugifyTopic(topic)}-draft.md`
        const content = buildMarkdownDraft(topic, payload)
        const res = await fetch('/api/workspace/file', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', ...hermesAuthHeaders() },
          credentials: 'include',
          body: JSON.stringify({ path, content }),
        })
        if (!res.ok) {
          const detail = await res.text().catch(() => '')
          throw new Error(detail || `HTTP ${res.status}`)
        }
        useUiStore.getState().addToast({
          title: 'Draft created',
          description: path,
          variant: 'success',
        })
      } else {
        const coworkType = toCoworkDeliverableType(deliverableType)
        if (!coworkType) throw new Error('Unsupported deliverable type')
        const res = await fetch('/api/cowork/tasks', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...hermesAuthHeaders() },
          credentials: 'include',
          body: JSON.stringify({
            goal: buildCoworkGoal(payload),
            deliverableType: coworkType,
            autoApprove: true,
          }),
        })
        if (!res.ok) {
          const detail = await res.text().catch(() => '')
          throw new Error(detail || `HTTP ${res.status}`)
        }
        useUiStore.getState().addToast({
          title: 'Work request started',
          description: `${deliverableType}: ${topic}`,
          variant: 'success',
        })
      }
    } else if (action === 'specify_form') {
      const purpose = String(payload.purpose ?? '').trim()
      if (!purpose) throw new Error('Form purpose is required')
      useUiStore.getState().addToast({
        title: 'Form spec received',
        description: purpose,
        variant: 'success',
      })
    } else if (action === 'save') {
      const entryId = payload.entryId != null ? String(payload.entryId) : ''
      const body = {
        kind: String(payload.kind ?? 'semantic'),
        content: String(payload.content ?? ''),
        importance: Number(payload.importance ?? 0.5),
      }
      const res = entryId
        ? await fetch(`/api/memory/entries/${entryId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json', ...hermesAuthHeaders() },
            credentials: 'include',
            body: JSON.stringify(body),
          })
        : await fetch('/api/memory/entries', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...hermesAuthHeaders() },
            credentials: 'include',
            body: JSON.stringify(body),
          })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
    } else if (action === 'delete' && payload.entryId) {
      const res = await fetch(`/api/memory/entries/${String(payload.entryId)}`, {
        method: 'DELETE',
        headers: { ...hermesAuthHeaders() },
        credentials: 'include',
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
    } else if (action === 'use_skill') {
      useUiStore.getState().addToast({
        title: 'Skill selected',
        description: String(payload.name ?? 'skill'),
        variant: 'success',
      })
    } else if (action === 'submit_form') {
      useUiStore.getState().addToast({
        title: 'Form submitted',
        description: String(payload.title ?? 'Thanks'),
        variant: 'success',
      })
    }
  } catch (err) {
    useUiStore.getState().addToast({
      title: 'A2UI action failed',
      description: err instanceof Error ? err.message : action,
      variant: 'danger',
    })
  }

  // AG-UI actionResponse follow-up on the active chat thread (agent round-trip)
  const runId = generateId()
  const threadId =
    (typeof sessionId === 'string' && sessionId.trim()) ||
    useSessionsStore.getState().activeSessionId ||
    generateId()
  const session = useSessionsStore.getState().sessions.find((s) => s.id === threadId)
  await fetch('/agui', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...hermesAuthHeaders() },
    credentials: 'include',
    body: JSON.stringify({
      threadId,
      runId,
      messages: [
        {
          id: generateId(),
          role: 'user',
          content: `A2UI actionResponse surface=${surfaceId} action=${action} data=${JSON.stringify(payload)}`,
        },
      ],
      tools: [],
      state: { a2uiAction: { surfaceId, action, data: payload } },
      context: [],
      forwardedProps: session?.profileId ? { profileId: session.profileId } : undefined,
    }),
  }).catch(() => {
    /* offline / mock — REST side effects above still count */
  })
}
