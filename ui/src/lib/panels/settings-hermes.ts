/**
 * Hermes config/env/settings helpers for the Marko Settings panel.
 * Loads /api/config, /api/config/schema, /api/config/defaults, /api/env,
 * and /api/model/* for the general settings form.
 */
import { ApiError } from '@app/lib/api'
import { apiClient } from '@app/lib/api'

export interface HermesEnvVarInfo {
  is_set: boolean
  redacted_value: string | null
  description: string
  url: string | null
  category: string
  is_password: boolean
  provider?: string
  provider_label?: string
  channel_managed?: boolean
  custom?: boolean
}

export interface HermesConfigSchemaField {
  type: string
  description: string
  category: string
  options?: string[]
}

export interface HermesConfigSchemaResponse {
  fields: Record<string, HermesConfigSchemaField>
  category_order: string[]
}

export interface HermesModelInfo {
  model: string
  provider: string
}

export interface HermesAuxiliaryModels {
  main: { provider: string; model: string }
}

export interface HermesSettingsSnapshot {
  config: Record<string, unknown>
  schema: Record<string, HermesConfigSchemaField>
  defaults: Record<string, unknown>
  env: Record<string, HermesEnvVarInfo>
  model: string
  provider: string
  baseUrl: string
  apiKeyEnv: string | null
  baseUrlEnv: string | null
  apiKeyMasked: string
  workspaceCwd: string
}

export interface SaveHermesGeneralSettingsInput {
  config: Record<string, unknown>
  provider: string
  model: string
  baseUrl: string
  workspaceCwd: string
  apiKeyEnv: string | null
  baseUrlEnv: string | null
  /** Plaintext key; omit or empty to leave unchanged. */
  apiKeyDraft?: string
}

export function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  const parts = path.split('.')
  let cur: unknown = obj
  for (const p of parts) {
    if (cur == null || typeof cur !== 'object') return undefined
    cur = (cur as Record<string, unknown>)[p]
  }
  return cur
}

export function setNestedValue(
  obj: Record<string, unknown>,
  path: string,
  value: unknown,
): Record<string, unknown> {
  const clone = structuredClone(obj)
  const parts = path.split('.')
  let cur: Record<string, unknown> = clone
  for (let i = 0; i < parts.length - 1; i++) {
    const key = parts[i]!
    if (cur[key] == null || typeof cur[key] !== 'object') {
      cur[key] = {}
    }
    cur = cur[key] as Record<string, unknown>
  }
  cur[parts[parts.length - 1]!] = value
  return clone
}

function normalizeProvider(value: string): string {
  return value.trim().toLowerCase()
}

function envEntries(env: Record<string, HermesEnvVarInfo>): Array<[string, HermesEnvVarInfo]> {
  return Object.entries(env)
}

function providerEnvRows(
  env: Record<string, HermesEnvVarInfo>,
  provider: string,
): Array<[string, HermesEnvVarInfo]> {
  const slug = normalizeProvider(provider)
  if (!slug) return []
  return envEntries(env).filter(
    ([, info]) => normalizeProvider(info.provider ?? '') === slug && !info.channel_managed,
  )
}

/** Primary API-key env var for the active provider (catalog-backed /api/env rows). */
export function resolveProviderApiKeyEnv(
  env: Record<string, HermesEnvVarInfo>,
  provider: string,
): string | null {
  const rows = providerEnvRows(env, provider).filter(([, info]) => info.is_password)
  if (!rows.length) return null
  const set = rows.find(([key]) => env[key]?.is_set)
  return (set ?? rows[0])![0]
}

/** Base-URL env var for the active provider, if catalog exposes one. */
export function resolveProviderBaseUrlEnv(
  env: Record<string, HermesEnvVarInfo>,
  provider: string,
): string | null {
  const rows = providerEnvRows(env, provider).filter(
    ([key]) => key.endsWith('_BASE_URL') || key.endsWith('_URL'),
  )
  if (rows.length) return rows[0]![0]
  const fallback = ['OPENAI_BASE_URL', 'ANTHROPIC_BASE_URL', 'OPENROUTER_BASE_URL']
  for (const key of fallback) {
    if (env[key]) return key
  }
  return null
}

export function readEnvDisplayValue(
  env: Record<string, HermesEnvVarInfo>,
  key: string | null,
): string {
  if (!key) return ''
  const row = env[key]
  if (!row?.is_set) return ''
  return row.redacted_value ?? '••••set'
}

export function schemaDescription(
  schema: Record<string, HermesConfigSchemaField>,
  key: string,
): string | undefined {
  return schema[key]?.description
}

export function defaultString(
  defaults: Record<string, unknown>,
  path: string,
): string {
  const value = getNestedValue(defaults, path)
  return typeof value === 'string' ? value : value == null ? '' : String(value)
}

export function isCoworkApiMissing(err: unknown): boolean {
  if (!(err instanceof ApiError)) return false
  return err.status === 404
}

export async function loadHermesSettings(): Promise<HermesSettingsSnapshot> {
  const [config, schemaResp, defaults, env, modelInfo, auxModels] = await Promise.all([
    apiClient.get<Record<string, unknown>>('/api/config'),
    apiClient.get<HermesConfigSchemaResponse>('/api/config/schema'),
    apiClient.get<Record<string, unknown>>('/api/config/defaults'),
    apiClient.get<Record<string, HermesEnvVarInfo>>('/api/env'),
    apiClient.get<HermesModelInfo>('/api/model/info'),
    apiClient.get<HermesAuxiliaryModels>('/api/model/auxiliary'),
  ])

  const provider = modelInfo.provider || auxModels.main.provider || ''
  const model =
    (typeof config.model === 'string' && config.model) ||
    auxModels.main.model ||
    modelInfo.model ||
    ''

  const apiKeyEnv = resolveProviderApiKeyEnv(env, provider)
  const baseUrlEnv = resolveProviderBaseUrlEnv(env, provider)
  const baseUrl = readEnvDisplayValue(env, baseUrlEnv)
  const apiKeyMasked = readEnvDisplayValue(env, apiKeyEnv)

  const cwdRaw = getNestedValue(config, 'terminal.cwd')
  const workspaceCwd = typeof cwdRaw === 'string' ? cwdRaw : defaultString(defaults, 'terminal.cwd')

  return {
    config,
    schema: schemaResp.fields,
    defaults,
    env,
    model,
    provider,
    baseUrl: baseUrl === '••••set' ? '' : baseUrl,
    apiKeyEnv,
    baseUrlEnv,
    apiKeyMasked,
    workspaceCwd,
  }
}

function isMaskedSecret(value: string): boolean {
  return value.startsWith('••••')
}

export async function saveHermesGeneralSettings(
  input: SaveHermesGeneralSettingsInput,
): Promise<void> {
  const nextConfig = setNestedValue(input.config, 'terminal.cwd', input.workspaceCwd)
  if (typeof nextConfig.model === 'string' || input.model) {
    nextConfig.model = input.model
  }

  await apiClient.put('/api/config', { config: nextConfig })

  const provider = input.provider.trim()
  const model = input.model.trim()
  const baseUrl = input.baseUrl.trim()
  const apiKeyDraft = input.apiKeyDraft?.trim() ?? ''
  const apiKeyChanged = apiKeyDraft.length > 0 && !isMaskedSecret(apiKeyDraft)

  if (provider && model) {
    await apiClient.post('/api/model/set', {
      scope: 'main',
      provider,
      model,
      ...(input.baseUrlEnv ? {} : { base_url: baseUrl }),
      ...(apiKeyChanged && !input.apiKeyEnv ? { api_key: apiKeyDraft } : {}),
    })
  }

  if (apiKeyChanged && input.apiKeyEnv) {
    await apiClient.put('/api/env', { key: input.apiKeyEnv, value: apiKeyDraft })
  }

  if (baseUrl && input.baseUrlEnv) {
    await apiClient.put('/api/env', { key: input.baseUrlEnv, value: baseUrl })
  }
}
