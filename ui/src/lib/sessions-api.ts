import { apiClient } from '@app/lib/api'
import type { Session } from '@hermes/shared'
import { generateId } from '@app/lib/utils'
import { useSessionsStore } from '@app/stores/sessions'
import { useUiStore } from '@app/stores/ui'
import { fetchHermesSessions, hermesSessionToDto } from '@app/lib/hermes-adapters'

/**
 * Create a session via Hermes REST so it survives reload.
 * Falls back to a local id if the API is unavailable.
 */
export async function createPersistedSession(
  title = 'New chat',
): Promise<Session> {
  try {
    const session = await apiClient.post<Session>('/api/sessions', { title })
    useSessionsStore.getState().addSession(session)
    useSessionsStore.getState().setActiveSessionId(session.id)
    return session
  } catch {
    const now = new Date().toISOString()
    const session: Session = {
      id: generateId(),
      title,
      groupName: null,
      profileId: null,
      pinned: false,
      archived: false,
      createdAt: now,
      updatedAt: now,
    }
    useSessionsStore.getState().addSession(session)
    useSessionsStore.getState().setActiveSessionId(session.id)
    useUiStore.getState().addToast({
      title: 'Session saved locally only',
      description: 'Hermes API unavailable — reload may lose this chat.',
      variant: 'attention',
    })
    return session
  }
}

export async function refreshSessionsFromHermes(): Promise<Session[]> {
  const sessions = await fetchHermesSessions()
  useSessionsStore.getState().setSessions(sessions)
  return sessions
}

export { hermesSessionToDto }
