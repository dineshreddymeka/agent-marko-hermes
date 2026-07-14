import { describe, expect, test } from 'vitest'
import {
  defaultString,
  getNestedValue,
  isCoworkApiMissing,
  readEnvDisplayValue,
  resolveProviderApiKeyEnv,
  resolveProviderBaseUrlEnv,
  setNestedValue,
} from '../src/lib/panels/settings-hermes'
import { ApiError } from '../src/lib/api'

describe('settings-hermes helpers', () => {
  test('nested config get/set', () => {
    const cfg = { terminal: { cwd: '/tmp/ws' }, model: 'gpt-4o' }
    expect(getNestedValue(cfg, 'terminal.cwd')).toBe('/tmp/ws')
    const next = setNestedValue(cfg, 'terminal.cwd', '/new')
    expect(getNestedValue(next, 'terminal.cwd')).toBe('/new')
    expect(getNestedValue(cfg, 'terminal.cwd')).toBe('/tmp/ws')
  })

  test('resolve provider env keys from /api/env metadata', () => {
    const env = {
      OPENAI_API_KEY: {
        is_set: true,
        redacted_value: 'sk-••••',
        description: '',
        url: null,
        category: 'provider',
        is_password: true,
        provider: 'openai-api',
      },
      OPENAI_BASE_URL: {
        is_set: true,
        redacted_value: 'https://api.openai.com/v1',
        description: '',
        url: null,
        category: 'provider',
        is_password: false,
        provider: 'openai-api',
      },
    }

    expect(resolveProviderApiKeyEnv(env, 'openai-api')).toBe('OPENAI_API_KEY')
    expect(resolveProviderBaseUrlEnv(env, 'openai-api')).toBe('OPENAI_BASE_URL')
    expect(readEnvDisplayValue(env, 'OPENAI_API_KEY')).toBe('sk-••••')
  })

  test('defaultString reads schema defaults', () => {
    const defaults = { terminal: { cwd: '.' }, model: 'hermes' }
    expect(defaultString(defaults, 'terminal.cwd')).toBe('.')
    expect(defaultString(defaults, 'model')).toBe('hermes')
  })

  test('isCoworkApiMissing detects 404', () => {
    expect(isCoworkApiMissing(new ApiError('missing', 404))).toBe(true)
    expect(isCoworkApiMissing(new ApiError('bad', 500))).toBe(false)
    expect(isCoworkApiMissing(new Error('nope'))).toBe(false)
  })
})
