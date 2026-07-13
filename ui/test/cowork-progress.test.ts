import { describe, expect, test } from 'vitest'
import {
  formatCoworkProgressLine,
  mergeCoworkProgress,
} from '../src/lib/cowork-progress'

describe('cowork-progress helpers', () => {
  test('formats phases', () => {
    expect(formatCoworkProgressLine({ taskId: 't-1', phase: 'started' })).toContain(
      'started',
    )
    expect(
      formatCoworkProgressLine({ taskId: 't-1', phase: 'delta', text: ' hi ' }),
    ).toBe('hi')
  })

  test('merges deltas into live then commits on tool phase', () => {
    let state = mergeCoworkProgress(undefined, {
      taskId: 't-1',
      phase: 'started',
    })
    expect(state.progressLines).toHaveLength(1)
    state = mergeCoworkProgress(state, {
      taskId: 't-1',
      phase: 'delta',
      text: 'a',
    })
    expect(state.progressLive).toBe('a')
    state = mergeCoworkProgress(state, {
      taskId: 't-1',
      phase: 'delta',
      text: 'ab',
    })
    expect(state.progressLive).toBe('ab')
    state = mergeCoworkProgress(state, {
      taskId: 't-1',
      phase: 'tool',
      tool: 'bash',
    })
    expect(state.progressLive).toBeNull()
    expect(state.progressLines.at(-2)).toBe('ab')
    expect(state.progressLines.at(-1)).toContain('bash')
  })
})
