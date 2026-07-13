/**
 * Hermes skills API adapters — maps FastAPI skill shapes to Marko shared DTOs.
 */
import type { Skill } from '@hermes/shared'
import { apiClient } from '@app/lib/api'

export type HermesSkillRow = {
  name: string
  description: string
  category?: string
  enabled: boolean
  usage?: number
  provenance?: 'hub' | 'bundled' | 'agent' | string
}

export type HermesSkillContent = {
  name: string
  content: string
  path: string
}

export type HermesSkillWriteResult = {
  success: boolean
  message?: string
  path?: string
  error?: string
}

export type HermesActionResponse = {
  ok: boolean
  name: string
  pid: number | null
  error?: string
  message?: string
}

export type HermesSkillHubResult = {
  name: string
  description: string
  source: string
  identifier: string
  trust_level: string
  repo: string | null
  tags: string[]
}

export type HermesSkillHubInstalledEntry = {
  name: string | null
  trust_level: string | null
  scan_verdict: string | null
}

export type HermesSkillHubSearchResponse = {
  results: HermesSkillHubResult[]
  source_counts: Record<string, number>
  timed_out: string[]
  installed: Record<string, HermesSkillHubInstalledEntry>
}

export type HermesSkillHubSource = {
  id: string
  label: string
  rate_limited?: boolean
  available?: boolean
}

export type HermesSkillHubSourcesResponse = {
  sources: HermesSkillHubSource[]
  index_available: boolean
  featured: HermesSkillHubResult[]
  installed: Record<string, HermesSkillHubInstalledEntry>
}

const ISO_NOW = () => new Date().toISOString()

export function hermesProvenanceToSource(
  provenance: string | undefined,
): Skill['source'] {
  switch (provenance) {
    case 'bundled':
      return 'builtin'
    case 'hub':
      return 'git:hub'
    default:
      return 'user-folder'
  }
}

export function hermesSkillToDto(
  row: HermesSkillRow,
  opts?: { content?: string; path?: string | null },
): Skill {
  const name = row.name
  return {
    id: name,
    name,
    slug: name,
    description: row.description ?? '',
    bodyMd: opts?.content ?? '',
    source: hermesProvenanceToSource(row.provenance),
    path: opts?.path ?? null,
    contentHash: null,
    triggers: null,
    enabled: row.enabled,
    lastSyncedAt: null,
    missingOnDisk: false,
    usageCount: row.usage ?? 0,
    successCount: 0,
    createdAt: ISO_NOW(),
    updatedAt: ISO_NOW(),
  }
}

export async function fetchHermesSkills(): Promise<Skill[]> {
  const rows = await apiClient.get<HermesSkillRow[]>('/api/skills')
  return rows.map((row) => hermesSkillToDto(row))
}

export async function fetchHermesSkillContent(name: string): Promise<HermesSkillContent> {
  return apiClient.get<HermesSkillContent>('/api/skills/content', { name })
}

export async function toggleHermesSkill(name: string, enabled: boolean): Promise<void> {
  await apiClient.put('/api/skills/toggle', { name, enabled })
}

export async function saveHermesSkillContent(name: string, content: string): Promise<void> {
  await apiClient.put<HermesSkillWriteResult>('/api/skills/content', { name, content })
}

export async function createHermesSkill(
  name: string,
  content: string,
  category?: string,
): Promise<void> {
  await apiClient.post<HermesSkillWriteResult>('/api/skills', {
    name,
    content,
    category: category || undefined,
  })
}

export async function uninstallHermesHubSkill(name: string): Promise<HermesActionResponse> {
  return apiClient.post<HermesActionResponse>('/api/skills/hub/uninstall', { name })
}

export async function updateHermesSkillsHub(): Promise<HermesActionResponse> {
  return apiClient.post<HermesActionResponse>('/api/skills/hub/update', {})
}

export async function searchHermesSkillsHub(
  q: string,
  source = 'all',
  limit = 20,
): Promise<HermesSkillHubSearchResponse> {
  return apiClient.get<HermesSkillHubSearchResponse>('/api/skills/hub/search', {
    q,
    source,
    limit,
  })
}

export async function getHermesSkillHubSources(): Promise<HermesSkillHubSourcesResponse> {
  return apiClient.get<HermesSkillHubSourcesResponse>('/api/skills/hub/sources')
}

export async function installHermesSkillFromHub(
  identifier: string,
): Promise<HermesActionResponse> {
  return apiClient.post<HermesActionResponse>('/api/skills/hub/install', { identifier })
}

export function isHubInstalledSkill(skill: Pick<Skill, 'source'>): boolean {
  return skill.source === 'git:hub'
}
