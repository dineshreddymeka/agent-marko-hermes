import type { Session } from '@hermes/shared'

export type SessionGroup = {
  key: string
  label: string
  sessions: Session[]
}

function dateBucket(iso: string, now = Date.now()): string {
  const d = new Date(iso)
  const startOfToday = new Date(now)
  startOfToday.setHours(0, 0, 0, 0)
  const startOfYesterday = new Date(startOfToday)
  startOfYesterday.setDate(startOfYesterday.getDate() - 1)
  const weekAgo = new Date(startOfToday)
  weekAgo.setDate(weekAgo.getDate() - 7)

  if (d >= startOfToday) return 'Today'
  if (d >= startOfYesterday) return 'Yesterday'
  if (d >= weekAgo) return 'Previous 7 days'
  return 'Older'
}

/** Group sessions by explicit groupName, else by relative date bucket. Pinned first within each group. */
export function groupSessions(sessions: Session[], now = Date.now()): SessionGroup[] {
  const map = new Map<string, Session[]>()

  for (const session of sessions) {
    const key = session.groupName?.trim() || dateBucket(session.updatedAt, now)
    const list = map.get(key) ?? []
    list.push(session)
    map.set(key, list)
  }

  const order = ['Today', 'Yesterday', 'Previous 7 days', 'Older']
  const keys = [...map.keys()].sort((a, b) => {
    const ai = order.indexOf(a)
    const bi = order.indexOf(b)
    if (ai === -1 && bi === -1) return a.localeCompare(b)
    if (ai === -1) return -1
    if (bi === -1) return 1
    return ai - bi
  })

  return keys.map((key) => ({
    key,
    label: key,
    sessions: (map.get(key) ?? []).sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    }),
  }))
}

export function filterSessions(sessions: Session[], query: string): Session[] {
  const q = query.trim().toLowerCase()
  if (!q) return sessions
  return sessions.filter(
    (s) =>
      s.title.toLowerCase().includes(q) ||
      (s.groupName?.toLowerCase().includes(q) ?? false),
  )
}
