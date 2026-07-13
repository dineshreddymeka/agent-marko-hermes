import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

describe('ToolCallCard security (Sonar/Snyk XSS class)', () => {
  test('does not inject HTML via dangerouslySetInnerHTML', () => {
    const src = readFileSync(
      join(import.meta.dir, '../src/components/chat/ToolCallCard.tsx'),
      'utf8',
    )
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')
    expect(code).not.toContain('dangerouslySetInnerHTML')
  })
})
