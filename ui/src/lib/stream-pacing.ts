/**
 * Typewriter pacing for streamed message text.
 *
 * The server coalesces LLM tokens into ~16 ms frames, so chunks arrive in
 * bursts; this controls how fast buffered text is committed to the store
 * (one commit per animation frame). Pacing exists purely for feel — it must
 * never become the bottleneck: at 60 fps, CHARS_PER_FRAME=24 ≈ 1.4k chars/s,
 * faster than any LLM streams, so the visible text stays glued to the wire
 * while still sweeping in smoothly rather than teleporting.
 */
const CHARS_PER_FRAME = 24
const BACKLOG_THRESHOLD = 240

export function streamReleaseAmount(bufferLength: number, reducedMotion: boolean): number {
  if (bufferLength <= 0) return 0
  if (reducedMotion) return bufferLength
  // Backlog (tab was hidden, burst arrival, model faster than pacing):
  // drain proportionally so catch-up takes at most ~4 frames.
  if (bufferLength > BACKLOG_THRESHOLD) return Math.ceil(bufferLength / 4)
  return Math.min(CHARS_PER_FRAME, bufferLength)
}

export function isThinkingBufferKey(key: string): boolean {
  return key.startsWith('thinking:')
}

export function thinkingMessageId(key: string): string {
  return key.slice('thinking:'.length)
}

export function thinkingBufferKey(messageId: string): string {
  return `thinking:${messageId}`
}
