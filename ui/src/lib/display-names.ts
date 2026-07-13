/**
 * Display-only helpers for human-readable labels. Underlying ids/values are unchanged.
 */

const MODEL_LABELS: Record<string, string> = {
  'gpt-4o': 'GPT-4o',
  'gpt-4o-mini': 'GPT-4o Mini — fast & low cost',
  'gpt-4.1': 'GPT-4.1',
  'gpt-4.1-mini': 'GPT-4.1 Mini — fast & low cost',
  'gpt-5.1': 'GPT-5.1',
  'gpt-5.2': 'GPT-5.2',
  'gpt-5.4-nano-medium': 'GPT-5.4 Nano — fast & low cost',
  'gpt-5.4-mini-medium': 'GPT-5.4 Mini',
  'gpt-5.4-medium': 'GPT-5.4',
  'gpt-5.5-medium': 'GPT-5.5',
  'composer-2.5': 'Composer 2.5',
  'composer-2.5-fast': 'Composer 2.5 — fast',
  'claude-3-5-sonnet': 'Claude 3.5 Sonnet',
  'claude-3-7-sonnet': 'Claude 3.7 Sonnet',
  'claude-sonnet-4': 'Claude Sonnet 4',
  'claude-opus-4': 'Claude Opus 4',
  'gemini-2.5-flash': 'Gemini 2.5 Flash — fast',
  'gemini-3-flash': 'Gemini 3 Flash — fast',
  'text-embedding-3-small': 'Text Embedding 3 Small',
  'text-embedding-3-large': 'Text Embedding 3 Large',
}

/** Friendly model name for UI; falls back to a prettified id. */
export function modelLabel(id: string): string {
  const trimmed = id.trim()
  if (!trimmed) return 'Open Jarvis'
  return MODEL_LABELS[trimmed] ?? prettifyIdentifier(trimmed)
}

/** Shorten a UUID or long id for display; full value goes in tooltips. */
export function shortenId(id: string, visible = 4): string {
  if (!id) return '—'
  if (id.length <= visible * 2 + 1) return id
  return `${id.slice(0, visible)}…`
}

/** Resolve a display name from a lookup map, or shorten the id. */
export function resolveNameOrId(
  id: string,
  nameById: ReadonlyMap<string, string> | Record<string, string>,
): string {
  const name =
    nameById instanceof Map ? nameById.get(id) : (nameById as Record<string, string>)[id]
  return name ?? shortenId(id)
}

/** Title attribute value — raw id when it differs from the label. */
export function labelTitle(raw: string, label: string): string | undefined {
  return raw && label !== raw ? raw : undefined
}

export function prettifyIdentifier(id: string): string {
  const withoutVendor = id.replace(/^[\w-]+\//, '')
  const words = withoutVendor.split(/[-_.]+/).filter(Boolean)
  if (!words.length) return id

  const titled = words
    .map((word) => {
      if (/^\d/.test(word) && word.includes('.')) return word.toUpperCase()
      if (word.length <= 3 && /^[a-z]+$/.test(word)) return word.toUpperCase()
      return word.charAt(0).toUpperCase() + word.slice(1)
    })
    .join(' ')

  return titled.length > 56 ? `${titled.slice(0, 53)}…` : titled
}
