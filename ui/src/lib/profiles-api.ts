/**
 * Hermes profile REST adapters for Agent-Marko UI.
 * Maps hermes_cli.profiles web_server endpoints → shared Profile DTOs.
 */
import type { Profile } from '@hermes/shared'
import { apiClient } from '@app/lib/api'

export type HermesProfileInfo = {
  name: string
  path: string
  is_default: boolean
  model: string | null
  provider: string | null
  has_env: boolean
  skill_count: number
  gateway_running: boolean
  description: string
  description_auto: boolean
}

type HermesProfilesList = { profiles: HermesProfileInfo[] }
type HermesActiveProfile = { active: string; current: string }
type HermesSoul = { content: string; exists: boolean }

const DEFAULT_TEMPERATURE = 0.7
const DEFAULT_SYSTEM_PROMPT = 'You are Open Jarvis, a helpful AI assistant.'

function toMarkoProvider(provider: string | null | undefined): Profile['provider'] {
  const p = (provider ?? '').toLowerCase()
  if (p === 'native') return 'native'
  if (p === 'agui-remote') return 'agui-remote'
  return 'hermes-python'
}

/** Hermes profiles are keyed by name; Marko Profile.id mirrors that. */
export function hermesProfileInfoToDto(
  info: HermesProfileInfo,
  opts?: { soul?: string; activeName?: string | null },
): Profile {
  const soul = opts?.soul?.trim()
  const description = (info.description ?? '').trim()
  return {
    id: info.name,
    name: info.name,
    systemPrompt: soul || description || DEFAULT_SYSTEM_PROMPT,
    model: info.model ?? 'composer-2.5',
    temperature: DEFAULT_TEMPERATURE,
    provider: toMarkoProvider(info.provider),
    providerConfig: info.provider ? { hermesProvider: info.provider } : null,
    settings: {
      isDefault: info.is_default,
      gatewayRunning: info.gateway_running,
      skillCount: info.skill_count,
      hasEnv: info.has_env,
      isActive: opts?.activeName === info.name,
    },
  }
}

export async function fetchHermesProfiles(): Promise<Profile[]> {
  const [list, active] = await Promise.all([
    apiClient.get<HermesProfilesList>('/api/profiles'),
    apiClient.get<HermesActiveProfile>('/api/profiles/active').catch(() => ({
      active: 'default',
      current: 'default',
    })),
  ])
  const activeName = active.active ?? 'default'
  return (list.profiles ?? []).map((p) =>
    hermesProfileInfoToDto(p, { activeName }),
  )
}

export async function fetchHermesProfileSoul(name: string): Promise<string> {
  const res = await apiClient.get<HermesSoul>(
    `/api/profiles/${encodeURIComponent(name)}/soul`,
  )
  return res.content ?? ''
}

export type HermesProfileInput = {
  name: string
  systemPrompt: string
  model: string
  temperature: number
  provider: Profile['provider']
}

function resolveHermesProvider(
  provider: Profile['provider'],
  providerConfig: Profile['providerConfig'],
): string | undefined {
  const fromConfig = providerConfig?.hermesProvider
  if (typeof fromConfig === 'string' && fromConfig.trim()) return fromConfig.trim()
  if (provider === 'hermes-python') return undefined
  return provider
}

export async function createHermesProfile(input: HermesProfileInput): Promise<Profile> {
  const name = input.name.trim()
  await apiClient.post('/api/profiles', { name })
  await apiClient.put(`/api/profiles/${encodeURIComponent(name)}/soul`, {
    content: input.systemPrompt.trim() || DEFAULT_SYSTEM_PROMPT,
  })
  const hermesProvider = resolveHermesProvider(input.provider, null)
  if (input.model.trim()) {
    await apiClient.put(`/api/profiles/${encodeURIComponent(name)}/model`, {
      provider: hermesProvider ?? 'openrouter',
      model: input.model.trim(),
    })
  }
  const [profiles] = await Promise.all([fetchHermesProfiles()])
  return (
    profiles.find((p) => p.id === name) ??
    hermesProfileInfoToDto(
      {
        name,
        path: '',
        is_default: false,
        model: input.model,
        provider: hermesProvider ?? null,
        has_env: false,
        skill_count: 0,
        gateway_running: false,
        description: '',
        description_auto: false,
      },
      { soul: input.systemPrompt },
    )
  )
}

export async function updateHermesProfile(
  id: string,
  input: HermesProfileInput,
  existing?: Profile,
): Promise<Profile> {
  const prevName = id
  const nextName = input.name.trim()
  if (nextName !== prevName) {
    await apiClient.patch(`/api/profiles/${encodeURIComponent(prevName)}`, {
      new_name: nextName,
    })
  }
  const target = nextName
  await apiClient.put(`/api/profiles/${encodeURIComponent(target)}/soul`, {
    content: input.systemPrompt.trim() || DEFAULT_SYSTEM_PROMPT,
  })
  const hermesProvider =
    resolveHermesProvider(input.provider, existing?.providerConfig ?? null) ??
    'openrouter'
  if (input.model.trim()) {
    await apiClient.put(`/api/profiles/${encodeURIComponent(target)}/model`, {
      provider: hermesProvider,
      model: input.model.trim(),
    })
  }
  const profiles = await fetchHermesProfiles()
  return profiles.find((p) => p.id === target) ?? profiles[0]!
}

export async function setDefaultHermesProfile(profile: Profile): Promise<void> {
  await apiClient.post('/api/profiles/active', { name: profile.id })
}

export async function deleteHermesProfile(id: string): Promise<void> {
  await apiClient.delete(`/api/profiles/${encodeURIComponent(id)}`)
}

export async function fetchActiveHermesProfileName(): Promise<string> {
  const active = await apiClient.get<HermesActiveProfile>('/api/profiles/active')
  return active.active ?? 'default'
}
