import { describe, expect, test } from 'bun:test'
import { hermesProfileInfoToDto } from '../src/lib/profiles-api'

describe('hermesProfileInfoToDto', () => {
  test('maps Hermes profile name to Marko id and active flag', () => {
    const dto = hermesProfileInfoToDto(
      {
        name: 'coder',
        path: '/home/user/.hermes/profiles/coder',
        is_default: false,
        model: 'claude-sonnet-4',
        provider: 'anthropic',
        has_env: true,
        skill_count: 12,
        gateway_running: true,
        description: 'Backend specialist',
        description_auto: false,
      },
      { activeName: 'coder', soul: 'You are a coding agent.' },
    )
    expect(dto.id).toBe('coder')
    expect(dto.name).toBe('coder')
    expect(dto.systemPrompt).toBe('You are a coding agent.')
    expect(dto.model).toBe('claude-sonnet-4')
    expect(dto.provider).toBe('hermes-python')
    expect(dto.providerConfig).toEqual({ hermesProvider: 'anthropic' })
    expect(dto.settings?.isActive).toBe(true)
    expect(dto.settings?.skillCount).toBe(12)
  })

  test('falls back to description when soul is absent', () => {
    const dto = hermesProfileInfoToDto({
      name: 'default',
      path: '/home/user/.hermes',
      is_default: true,
      model: null,
      provider: null,
      has_env: false,
      skill_count: 0,
      gateway_running: false,
      description: 'Primary profile',
      description_auto: true,
    })
    expect(dto.systemPrompt).toBe('Primary profile')
    expect(dto.model).toBe('composer-2.5')
  })
})
