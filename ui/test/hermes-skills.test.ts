import { describe, expect, test } from 'bun:test'
import {
  hermesProvenanceToSource,
  hermesSkillToDto,
  isHubInstalledSkill,
} from '../src/lib/hermes-skills'

describe('hermes-skills adapters', () => {
  test('hermesProvenanceToSource maps Hermes provenance', () => {
    expect(hermesProvenanceToSource('bundled')).toBe('builtin')
    expect(hermesProvenanceToSource('hub')).toBe('git:hub')
    expect(hermesProvenanceToSource('agent')).toBe('user-folder')
    expect(hermesProvenanceToSource(undefined)).toBe('user-folder')
  })

  test('hermesSkillToDto uses name as id and maps usage', () => {
    const dto = hermesSkillToDto({
      name: 'demo-skill',
      description: 'Does things',
      category: 'devops',
      enabled: true,
      usage: 3,
      provenance: 'hub',
    })
    expect(dto.id).toBe('demo-skill')
    expect(dto.slug).toBe('demo-skill')
    expect(dto.source).toBe('git:hub')
    expect(dto.usageCount).toBe(3)
    expect(dto.enabled).toBe(true)
  })

  test('hermesSkillToDto attaches loaded content and path', () => {
    const dto = hermesSkillToDto(
      { name: 'x', description: '', enabled: false, provenance: 'agent' },
      { content: '# Body', path: '/home/.hermes/skills/x/SKILL.md' },
    )
    expect(dto.bodyMd).toBe('# Body')
    expect(dto.path).toBe('/home/.hermes/skills/x/SKILL.md')
    expect(dto.source).toBe('user-folder')
  })

  test('isHubInstalledSkill', () => {
    expect(isHubInstalledSkill({ source: 'git:hub' })).toBe(true)
    expect(isHubInstalledSkill({ source: 'builtin' })).toBe(false)
  })
})
