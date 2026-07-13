/**
 * Client-side helpers for the Skills panel.
 * Author: Dinesh Reddy Meka
 */
import type { Skill } from '@hermes/shared'

export type SkillSourceFilter = 'all' | 'builtin' | 'user-folder' | 'git' | 'learned'
export type SkillStatusFilter = 'all' | 'enabled' | 'disabled' | 'missing'

export function skillSourceBucket(source: string): Exclude<SkillSourceFilter, 'all'> {
  if (source === 'learned') return 'learned'
  if (source === 'builtin') return 'builtin'
  if (source.startsWith('git:')) return 'git'
  return 'user-folder'
}

export function filterSkills(
  skills: Skill[],
  opts: {
    query?: string
    source?: SkillSourceFilter
    status?: SkillStatusFilter
  },
): Skill[] {
  const q = opts.query?.trim().toLowerCase() ?? ''
  const source = opts.source ?? 'all'
  const status = opts.status ?? 'all'

  return skills.filter((s) => {
    if (source !== 'all' && skillSourceBucket(s.source) !== source) return false
    if (status === 'enabled' && (!s.enabled || s.missingOnDisk)) return false
    if (status === 'disabled' && s.enabled) return false
    if (status === 'missing' && !s.missingOnDisk) return false
    if (!q) return true
    return (
      s.name.toLowerCase().includes(q) ||
      s.description.toLowerCase().includes(q) ||
      s.slug.toLowerCase().includes(q) ||
      s.source.toLowerCase().includes(q)
    )
  })
}

export function defaultSkillBody(name = 'my-skill'): string {
  return `---\nname: ${name}\ndescription: \n---\n\n# ${name}\n\nInstructions for the agent go here.\n`
}

export function skillStatusKind(
  skill: Pick<Skill, 'enabled' | 'missingOnDisk'>,
): 'ready' | 'disabled' | 'missing' {
  if (skill.missingOnDisk) return 'missing'
  if (!skill.enabled) return 'disabled'
  return 'ready'
}
