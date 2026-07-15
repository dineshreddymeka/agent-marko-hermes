import type { Session } from '@hermes/shared'

const PLACEHOLDER_TITLES = new Set([
  '',
  'new chat',
  'untitled',
  'untitled session',
  'untitled chat',
])

/** True when title is empty or a known create-session placeholder. */
export function isPlaceholderSessionTitle(title: string | null | undefined): boolean {
  if (title == null) return true
  return PLACEHOLDER_TITLES.has(String(title).trim().toLowerCase())
}

/**
 * Merge API session list into local store without clobbering live titles.
 * `hermes.title` / RUN_FINISHED may update the store before DB/list catches up
 * (unique-title conflict, delayed persist, empty preview). Refetch must not
 * wipe those with API null → display "New chat".
 */
export function mergeSessionsPreservingTitles(
  local: Session[],
  incoming: Session[],
): Session[] {
  const localById = new Map(local.map((s) => [s.id, s]))
  const seen = new Set<string>()
  const merged: Session[] = incoming.map((api) => {
    seen.add(api.id)
    const prev = localById.get(api.id)
    if (
      prev &&
      isPlaceholderSessionTitle(api.title) &&
      !isPlaceholderSessionTitle(prev.title)
    ) {
      return { ...api, title: prev.title }
    }
    return api
  })
  // Keep optimistic local-only rows (just created, not yet in list response).
  for (const s of local) {
    if (!seen.has(s.id)) merged.unshift(s)
  }
  return merged
}
