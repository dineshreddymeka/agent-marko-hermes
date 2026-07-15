import { create } from 'zustand'
import type { Session } from '@hermes/shared'
import { mergeSessionsPreservingTitles } from '@app/lib/session-title'

interface SessionsState {
  sessions: Session[]
  activeSessionId: string | null
  setSessions: (sessions: Session[]) => void
  addSession: (session: Session) => void
  updateSession: (id: string, patch: Partial<Session>) => void
  removeSession: (id: string) => void
  setActiveSessionId: (id: string | null) => void
}

export const useSessionsStore = create<SessionsState>()((set) => ({
  sessions: [],
  activeSessionId: null,
  setSessions: (incoming) =>
    set((s) => ({
      sessions: mergeSessionsPreservingTitles(s.sessions, incoming),
    })),
  addSession: (session) =>
    set((s) => ({
      sessions: s.sessions.some((x) => x.id === session.id)
        ? s.sessions.map((x) => (x.id === session.id ? { ...x, ...session } : x))
        : [session, ...s.sessions],
    })),
  updateSession: (id, patch) =>
    set((s) => {
      const idx = s.sessions.findIndex((sess) => sess.id === id)
      if (idx >= 0) {
        return {
          sessions: s.sessions.map((sess) =>
            sess.id === id ? { ...sess, ...patch } : sess,
          ),
        }
      }
      // Upsert: hermes.title can arrive before the session is listed, or after
      // a refetch briefly dropped a just-created row.
      const now = new Date().toISOString()
      const created: Session = {
        title: typeof patch.title === 'string' ? patch.title : 'New chat',
        groupName: null,
        profileId: null,
        pinned: false,
        archived: false,
        createdAt: now,
        updatedAt: now,
        ...patch,
        id,
      }
      return { sessions: [created, ...s.sessions] }
    }),
  removeSession: (id) =>
    set((s) => ({
      sessions: s.sessions.filter((sess) => sess.id !== id),
      activeSessionId: s.activeSessionId === id ? null : s.activeSessionId,
    })),
  setActiveSessionId: (id) => set({ activeSessionId: id }),
}))
