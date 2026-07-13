import { describe, expect, test } from 'bun:test'
import { isHubInstalledSkill, skillLinkId } from '../src/lib/hermes-skills'

describe('hermes-skills helpers', () => {
  test('isHubInstalledSkill', () => {
    expect(isHubInstalledSkill({ source: 'git:hub' })).toBe(true)
    expect(isHubInstalledSkill({ source: 'builtin' })).toBe(false)
  })

  test('skillLinkId returns stable DB id for MCP/cron', () => {
    expect(skillLinkId({ id: '550e8400-e29b-41d4-a716-446655440000' })).toBe(
      '550e8400-e29b-41d4-a716-446655440000',
    )
  })
})
