import { useQuery } from '@tanstack/react-query'
import { apiClient, ApiError } from '@app/lib/api'
import type { CapabilitiesRefreshResponse, CapabilitiesResponse } from '@hermes/shared'

export const CAPABILITIES_QUERY_KEY = ['capabilities'] as const

/** Fetch manifest; returns null when the endpoint is not deployed yet (404). */
export async function fetchCapabilities(): Promise<CapabilitiesResponse | null> {
  try {
    return await apiClient.get<CapabilitiesResponse>('/api/capabilities')
  } catch (e) {
    // Hermes-direct build: OJ capabilities endpoint is absent — treat as unavailable.
    if (e instanceof ApiError && (e.status === 404 || e.status === 401 || e.status === 501)) {
      return null
    }
    return null
  }
}

/** Reconnect MCP + rebuild manifest + probe agent LLM (staging/ops warm path). */
export async function warmCapabilities(): Promise<CapabilitiesRefreshResponse> {
  return await apiClient.post<CapabilitiesRefreshResponse>('/api/capabilities/warm')
}

export function useCapabilities() {
  return useQuery({
    queryKey: CAPABILITIES_QUERY_KEY,
    queryFn: fetchCapabilities,
    staleTime: 30_000,
    retry: false,
  })
}

export function isCapabilitiesManifestUnavailable(
  data: CapabilitiesResponse | null | undefined,
  isFetched: boolean,
  isError: boolean,
): boolean {
  return isFetched && !isError && data === null
}

/** True when agent tools are likely unavailable (degraded LLM route). */
export function isAgentLlmDegraded(agentLlm: CapabilitiesResponse['agentLlm']): boolean {
  if (typeof agentLlm.degraded === 'boolean') {
    return agentLlm.degraded
  }
  if (agentLlm.circuitState === 'open') return true
  if (agentLlm.lastHealthCheckAt && !agentLlm.lastHealthOk) return true
  return agentLlm.routing === 'capabilities' && !agentLlm.preferredAgentBaseUrl
}

/** Staging gate: slash commands from the manifest are ready to sync into the composer. */
export function isSlashSyncReady(
  data: CapabilitiesResponse | null | undefined,
): boolean {
  return Array.isArray(data?.slashCommands)
}
