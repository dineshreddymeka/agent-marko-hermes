import { describe, expect, test } from 'vitest'
import { splitStableMarkdown } from '../src/components/chat/StreamingMarkdown'
import { streamReleaseAmount } from '../src/lib/stream-pacing'

describe('splitStableMarkdown', () => {
  test('no blank line → everything is tail', () => {
    const { stable, tail } = splitStableMarkdown('one long paragraph still streaming')
    expect(stable).toBe('')
    expect(tail).toBe('one long paragraph still streaming')
  })

  test('splits at the last blank-line block boundary', () => {
    const content = 'para one\n\npara two\n\npara three still stre'
    const { stable, tail } = splitStableMarkdown(content)
    expect(stable).toBe('para one\n\npara two\n\n')
    expect(tail).toBe('para three still stre')
    expect(stable + tail).toBe(content)
  })

  test('blank lines inside an open code fence are not boundaries', () => {
    const content = 'intro\n\n```py\ncode\n\nmore code'
    const { stable, tail } = splitStableMarkdown(content)
    expect(stable).toBe('intro\n\n')
    expect(tail).toBe('```py\ncode\n\nmore code')
  })

  test('closed fence allows boundaries after it', () => {
    const content = 'intro\n\n```py\ncode\n```\n\ntail text'
    const { stable, tail } = splitStableMarkdown(content)
    expect(stable).toBe('intro\n\n```py\ncode\n```\n\n')
    expect(tail).toBe('tail text')
  })

  test('stable prefix is monotonic as content grows', () => {
    const full = 'a\n\nb\n\nc\n\nfinal words here'
    let prevStableLen = 0
    for (let i = 1; i <= full.length; i++) {
      const { stable, tail } = splitStableMarkdown(full.slice(0, i))
      expect(stable.length).toBeGreaterThanOrEqual(prevStableLen)
      expect(stable + tail).toBe(full.slice(0, i))
      prevStableLen = stable.length
    }
  })
})

describe('streamReleaseAmount pacing', () => {
  test('keeps up with fast streams (>=1.2k chars/s at 60fps)', () => {
    // 24 chars/frame × 60 fps = 1440 chars/s baseline throughput.
    expect(streamReleaseAmount(24, false) * 60).toBeGreaterThanOrEqual(1200)
  })

  test('drains backlog proportionally', () => {
    expect(streamReleaseAmount(1000, false)).toBeGreaterThanOrEqual(250)
  })

  test('reduced motion releases everything at once', () => {
    expect(streamReleaseAmount(5000, true)).toBe(5000)
  })
})
