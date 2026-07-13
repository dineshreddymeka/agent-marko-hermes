import { create } from 'zustand'
import type { Session } from '@hermes/shared'

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
  setSessions: (sessions) => set({ sessions }),
  addSession: (session) => set((s) => ({ sessions: [session, ...s.sessions] })),
  updateSession: (id, patch) =>
    set((s) => ({
      sessions: s.sessions.map((sess) => (sess.id === id ? { ...sess, ...patch } : sess)),
    })),
  removeSession: (id) =>
    set((s) => ({
      sessions: s.sessions.filter((sess) => sess.id !== id),
      activeSessionId: s.activeSessionId === id ? null : s.activeSessionId,
    })),
  setActiveSessionId: (id) => set({ activeSessionId: id }),
}))
