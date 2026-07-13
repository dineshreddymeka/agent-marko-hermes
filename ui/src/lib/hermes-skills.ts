/**
 * Hermes skills API — DB-backed registry (state.db skills_registry table).
 * GET /api/skills returns complete camelCase rows after disk sync.
 */
import type { Skill, SkillsMeta, SkillsSyncResult } from '@hermes/shared'
import { apiClient } from '@app/lib/api'

export type HermesSkillContent = {
  name: string
  content: string
  path: string
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

/** DB row from GET /api/skills — already matches shared Skill DTO. */
export async function fetchHermesSkills(): Promise<Skill[]> {
  return apiClient.get<Skill[]>('/api/skills')
}

export async function fetchHermesSkillsMeta(): Promise<SkillsMeta> {
  return apiClient.get<SkillsMeta>('/api/skills/meta')
}

export async function syncHermesSkills(): Promise<SkillsSyncResult> {
  return apiClient.post<SkillsSyncResult>('/api/skills/sync')
}

export async function fetchHermesSkillContent(name: string): Promise<HermesSkillContent> {
  return apiClient.get<HermesSkillContent>('/api/skills/content', { name })
}

export async function toggleHermesSkill(name: string, enabled: boolean): Promise<void> {
  await apiClient.put('/api/skills/toggle', { name, enabled })
}

export async function saveHermesSkillContent(name: string, content: string): Promise<Skill> {
  return apiClient.put<Skill>('/api/skills/content', { name, content })
}

export async function createHermesSkill(
  name: string,
  content: string,
  category?: string,
): Promise<Skill> {
  return apiClient.post<Skill>('/api/skills', {
    name,
    content,
    category: category || undefined,
  })
}

export async function deleteHermesSkill(id: string): Promise<void> {
  await apiClient.delete(`/api/skills/${encodeURIComponent(id)}`)
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

/** Map DB skill id for MCP/cron skillIds arrays (stable UUID). */
export function skillLinkId(skill: Pick<Skill, 'id'>): string {
  return skill.id
}
