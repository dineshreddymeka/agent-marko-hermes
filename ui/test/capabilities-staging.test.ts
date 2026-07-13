import { describe, expect, test } from 'vitest'
import {
  isAgentLlmDegraded,
  isCapabilitiesManifestUnavailable,
  isSlashSyncReady,
} from '../src/hooks/useCapabilities'
import type { AgentLlmHealthSnapshot, CapabilitiesResponse } from '@hermes/shared'

function baseAgentLlm(
  overrides: Partial<AgentLlmHealthSnapshot> = {},
): AgentLlmHealthSnapshot {
  return {
    preferredAgentBaseUrl: 'https://api.openai.com/v1',
    bridgeFallbackBaseUrl: 'http://127.0.0.1:3456/v1',
    circuitState: 'closed',
    consecutiveFailures: 0,
    lastFailure: null,
    lastSuccessAt: null,
    lastHealthCheckAt: null,
    lastHealthOk: true,
    routing: 'capabilities',
    timeoutMs: 5000,
    degraded: false,
    toolsEnabled: true,
    ...overrides,
  }
}

describe('capabilities staging readiness helpers', () => {
  test('isAgentLlmDegraded trusts explicit degraded flag', () => {
    expect(isAgentLlmDegraded(baseAgentLlm({ degraded: true, toolsEnabled: false }))).toBe(true)
    expect(isAgentLlmDegraded(baseAgentLlm({ degraded: false }))).toBe(false)
  })

  test('isAgentLlmDegraded falls back to circuit / missing preferred URL', () => {
    expect(
      isAgentLlmDegraded(
        baseAgentLlm({
          degraded: undefined as unknown as boolean,
          circuitState: 'open',
        }),
      ),
    ).toBe(true)
    expect(
      isAgentLlmDegraded(
        baseAgentLlm({
          degraded: undefined as unknown as boolean,
          preferredAgentBaseUrl: null,
          routing: 'capabilities',
        }),
      ),
    ).toBe(true)
  })

  test('isCapabilitiesManifestUnavailable only when 404-null fetched', () => {
    expect(isCapabilitiesManifestUnavailable(null, true, false)).toBe(true)
    expect(isCapabilitiesManifestUnavailable(null, false, false)).toBe(false)
    expect(isCapabilitiesManifestUnavailable(null, true, true)).toBe(false)
  })

  test('isSlashSyncReady when slashCommands array is present', () => {
    const ready = {
      slashCommands: [{ name: '/demo', server: 'demo', description: 'd' }],
    } as CapabilitiesResponse
    expect(isSlashSyncReady(ready)).toBe(true)
    expect(isSlashSyncReady(null)).toBe(false)
    expect(isSlashSyncReady(undefined)).toBe(false)
  })
})
