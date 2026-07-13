import type { Session, SearchResult } from '@hermes/shared'

export type SessionGroup = {
  key: string
  label: string
  sessions: Session[]
}

function startOfDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
}

export function groupSessions(sessions: Session[]): SessionGroup[] {
  const pinned = sessions.filter((s) => s.pinned && !s.archived)
  const byGroup = new Map<string, Session[]>()
  const ungrouped: Session[] = []

  for (const s of sessions) {
    if (s.pinned || s.archived) continue
    if (s.groupName) {
      const list = byGroup.get(s.groupName) ?? []
      list.push(s)
      byGroup.set(s.groupName, list)
    } else {
      ungrouped.push(s)
    }
  }

  const groups: SessionGroup[] = []
  if (pinned.length) {
    groups.push({ key: '__pinned', label: 'Pinned', sessions: pinned })
  }

  for (const [name, list] of [...byGroup.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    groups.push({ key: `group:${name}`, label: name, sessions: list })
  }

  const today = startOfDay(new Date())
  const yesterday = today - 86_400_000
  const week = today - 7 * 86_400_000

  const buckets: SessionGroup[] = [
    { key: 'today', label: 'Today', sessions: [] },
    { key: 'yesterday', label: 'Yesterday', sessions: [] },
    { key: 'week', label: 'Previous 7 days', sessions: [] },
    { key: 'older', label: 'Older', sessions: [] },
  ]

  for (const s of ungrouped) {
    const t = startOfDay(new Date(s.updatedAt))
    if (t >= today) buckets[0]!.sessions.push(s)
    else if (t >= yesterday) buckets[1]!.sessions.push(s)
    else if (t >= week) buckets[2]!.sessions.push(s)
    else buckets[3]!.sessions.push(s)
  }

  for (const b of buckets) {
    if (b.sessions.length) groups.push(b)
  }

  const archived = sessions.filter((s) => s.archived)
  if (archived.length) {
    groups.push({ key: '__archived', label: 'Archived', sessions: archived })
  }

  return groups
}

export function filterSessionsByQuery(sessions: Session[], query: string): Session[] {
  const q = query.trim().toLowerCase()
  if (!q) return sessions
  return sessions.filter(
    (s) =>
      s.title.toLowerCase().includes(q) ||
      (s.groupName?.toLowerCase().includes(q) ?? false),
  )
}

export function mergeSessionSearch(
  sessions: Session[],
  searchResults: SearchResult[] | undefined,
  query: string,
): { sessions: Session[]; previews: Map<string, string> } {
  const previews = new Map<string, string>()
  if (!query.trim()) return { sessions, previews }

  const local = filterSessionsByQuery(sessions, query)
  const byId = new Map(sessions.map((s) => [s.id, s]))
  const merged = new Map(local.map((s) => [s.id, s]))

  for (const r of searchResults ?? []) {
    if (r.kind === 'session' && byId.has(r.id)) {
      merged.set(r.id, byId.get(r.id)!)
      previews.set(r.id, r.snippet)
    } else if (r.kind === 'message' && r.sessionId && byId.has(r.sessionId)) {
      merged.set(r.sessionId, byId.get(r.sessionId)!)
      previews.set(r.sessionId, r.snippet)
    } else if (r.kind === 'session') {
      previews.set(r.id, r.snippet)
    }
  }

  return { sessions: [...merged.values()], previews }
}

/** Lightweight cron validation for client preview (server still validates with croner). */
export function previewCronSchedule(expression: string): { valid: boolean; preview: string } {
  const parts = expression.trim().split(/\s+/)
  if (parts.length < 5 || parts.length > 6) {
    return { valid: false, preview: 'Expected 5–6 schedule fields' }
  }
  const [min, hour, dom, mon, dow] = parts
  const human: string[] = []
  if (min === '*' && hour === '*') human.push('every minute')
  else if (min?.startsWith('*/') && hour === '*') human.push(`every ${min.slice(2)} minutes`)
  else if (min === '0' && hour === '*') human.push('hourly')
  else if (min === '0' && hour === '0') human.push('daily at midnight')
  else if (min === '0' && hour && !hour.includes('*') && dom === '*' && mon === '*' && dow === '*') {
    human.push(`daily at ${hour}:00`)
  } else if (dow && dow !== '*' && dom === '*') human.push(`weekly (dow ${dow})`)
  else human.push(expression)
  return { valid: true, preview: human.join(' ') }
}

export function sortMemoriesByImportance<T extends { importance: number }>(
  entries: T[],
  dir: 'asc' | 'desc' = 'desc',
): T[] {
  return [...entries].sort((a, b) =>
    dir === 'desc' ? b.importance - a.importance : a.importance - b.importance,
  )
}

export function langFromPath(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase() ?? ''
  const map: Record<string, string> = {
    ts: 'typescript',
    tsx: 'tsx',
    js: 'javascript',
    jsx: 'jsx',
    json: 'json',
    md: 'markdown',
    py: 'python',
    sql: 'sql',
    sh: 'bash',
    bash: 'bash',
    yml: 'yaml',
    yaml: 'yaml',
    css: 'css',
    html: 'html',
  }
  return map[ext] ?? 'text'
}

export function isImagePath(path: string): boolean {
  return /\.(png|jpe?g|gif|webp|svg|ico)$/i.test(path)
}

export function isMarkdownPath(path: string): boolean {
  return /\.(md|mdx)$/i.test(path)
}
