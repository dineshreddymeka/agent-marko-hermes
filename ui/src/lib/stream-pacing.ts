const CHARS_PER_FRAME = 3
const BACKLOG_THRESHOLD = 400

export function streamReleaseAmount(bufferLength: number, reducedMotion: boolean): number {
  if (bufferLength <= 0) return 0
  if (reducedMotion) return bufferLength
  if (bufferLength > BACKLOG_THRESHOLD) return Math.ceil(bufferLength / 8)
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
