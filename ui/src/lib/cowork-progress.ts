import type { HermesCoworkProgressPayload } from '@hermes/shared'

/** Short line for ToolCallCard progress display (mirrors server chat-progress). */
export function formatCoworkProgressLine(p: HermesCoworkProgressPayload): string {
  switch (p.phase) {
    case 'started':
      return `Open Cowork started (${p.taskId})`
    case 'delta':
      return (p.text ?? '').trim()
    case 'tool':
      return p.toolOutput
        ? `${p.tool ?? 'tool'}: ${p.toolOutput.slice(0, 120)}`
        : `Running ${p.tool ?? 'tool'}…`
    case 'ended':
      return p.text?.trim() || `Open Cowork finished (${p.taskId})`
    case 'error':
      return p.text?.trim() || 'Open Cowork error'
    default:
      return ''
  }
}

const MAX_PROGRESS_LINES = 40

export type CoworkProgressView = {
  progressLines: string[]
  progressLive: string | null
}

/** Merge a progress payload into ToolCallCard progress state. */
export function mergeCoworkProgress(
  prev: CoworkProgressView | undefined,
  payload: HermesCoworkProgressPayload,
): CoworkProgressView {
  const lines = [...(prev?.progressLines ?? [])]
  let live = prev?.progressLive ?? null

  if (payload.phase === 'delta') {
    const text = formatCoworkProgressLine(payload)
    return { progressLines: lines, progressLive: text || live }
  }

  // Commit any live delta, then append the new phase line.
  if (live) {
    lines.push(live)
    live = null
  }
  const line = formatCoworkProgressLine(payload)
  if (line) lines.push(line)
  const trimmed =
    lines.length > MAX_PROGRESS_LINES
      ? lines.slice(lines.length - MAX_PROGRESS_LINES)
      : lines
  return { progressLines: trimmed, progressLive: null }
}
