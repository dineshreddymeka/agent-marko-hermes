import { describe, expect, test } from 'bun:test'
import {
  filterSessionsByQuery,
  groupSessions,
  mergeSessionSearch,
  previewCronSchedule,
  sortMemoriesByImportance,
  langFromPath,
  isImagePath,
  isMarkdownPath,
} from '../src/lib/panels'
import { shouldPersistQueryKey } from '../src/lib/query-persist'
import type { Session, SearchResult } from '@hermes/shared'

function session(partial: Partial<Session> & Pick<Session, 'id' | 'title'>): Session {
  return {
    groupName: null,
    profileId: null,
    pinned: false,
    archived: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...partial,
  }
}

describe('panel helpers', () => {
  test('groupSessions puts pinned first and buckets by date', () => {
    const now = Date.now()
    const sessions = [
      session({ id: '1', title: 'A', pinned: true }),
      session({
        id: '2',
        title: 'B',
        groupName: 'Work',
        updatedAt: new Date(now).toISOString(),
      }),
      session({
        id: '3',
        title: 'C',
        updatedAt: new Date(now).toISOString(),
      }),
    ]
    const groups = groupSessions(sessions)
    expect(groups[0]?.key).toBe('__pinned')
    expect(groups.some((g) => g.key === 'group:Work')).toBe(true)
    expect(groups.some((g) => g.key === 'today')).toBe(true)
  })

  test('filterSessionsByQuery matches title and group', () => {
    const sessions = [
      session({ id: '1', title: 'Open Jarvis tips', groupName: 'docs' }),
      session({ id: '2', title: 'Other' }),
    ]
    expect(filterSessionsByQuery(sessions, 'jarvis')).toHaveLength(1)
    expect(filterSessionsByQuery(sessions, 'docs')).toHaveLength(1)
  })

  test('mergeSessionSearch attaches message previews', () => {
    const sessions = [session({ id: 's1', title: 'Chat' })]
    const results: SearchResult[] = [
      { kind: 'message', id: 'm1', snippet: 'hello world', sessionId: 's1' },
    ]
    const merged = mergeSessionSearch(sessions, results, 'hello')
    expect(merged.sessions).toHaveLength(1)
    expect(merged.previews.get('s1')).toBe('hello world')
  })

  test('previewCronSchedule validates field count', () => {
    expect(previewCronSchedule('0 * * * *').valid).toBe(true)
    expect(previewCronSchedule('bad').valid).toBe(false)
  })

  test('sortMemoriesByImportance', () => {
    const sorted = sortMemoriesByImportance([
      { importance: 0.2 },
      { importance: 0.9 },
      { importance: 0.5 },
    ])
    expect(sorted[0]?.importance).toBe(0.9)
  })

  test('path helpers', () => {
    expect(langFromPath('a.ts')).toBe('typescript')
    expect(isImagePath('x.png')).toBe(true)
    expect(isMarkdownPath('README.md')).toBe(true)
  })

  test('filterSkills by source and status', async () => {
    const { filterSkills, skillStatusKind } = await import('../src/lib/panels/skills-helpers')
    const skills = [
      {
        id: '1',
        name: 'Alpha',
        slug: 'alpha',
        description: 'first',
        bodyMd: '',
        source: 'user-folder' as const,
        path: null,
        contentHash: null,
        triggers: null,
        enabled: true,
        lastSyncedAt: null,
        missingOnDisk: false,
        usageCount: 0,
        successCount: 0,
        createdAt: '',
        updatedAt: '',
      },
      {
        id: '2',
        name: 'Beta',
        slug: 'beta',
        description: 'learned one',
        bodyMd: '',
        source: 'learned' as const,
        path: null,
        contentHash: null,
        triggers: null,
        enabled: false,
        lastSyncedAt: null,
        missingOnDisk: true,
        usageCount: 0,
        successCount: 0,
        createdAt: '',
        updatedAt: '',
      },
    ]
    expect(filterSkills(skills, { source: 'learned' })).toHaveLength(1)
    expect(filterSkills(skills, { status: 'missing' })).toHaveLength(1)
    expect(filterSkills(skills, { query: 'first' })).toHaveLength(1)
    expect(skillStatusKind(skills[1]!)).toBe('missing')
  })

  test('shouldPersistQueryKey', () => {
    expect(shouldPersistQueryKey(['sessions'])).toBe(true)
    expect(shouldPersistQueryKey(['workspace-file', 'a.ts'])).toBe(false)
  })

  test('office templates cover deliverable types', async () => {
    const {
      COWORK_OFFICE_TYPES,
      COWORK_OFFICE_TEMPLATES,
    } = await import('../src/lib/panels/cowork-work')
    expect(COWORK_OFFICE_TYPES.map((t) => t.id)).toEqual([
      'presentation',
      'word',
      'spreadsheet',
      'pdf',
      'other',
    ])
    expect(COWORK_OFFICE_TEMPLATES.presentation.length).toBeGreaterThan(0)
    expect(COWORK_OFFICE_TEMPLATES.other).toEqual([])
  })

  test('primary panel labels and aliases', async () => {
    const { panelLabel, panelNavLabel, resolvePanelRoute, PANEL_ROUTE_ALIASES } = await import(
      '../src/lib/labels'
    )
    expect(panelLabel('office')).toBe('Office')
    expect(panelLabel('cron')).toBe('Cowork')
    expect(panelNavLabel('connections')).toBe('MCP')
    expect(resolvePanelRoute('cowork')).toBe('cron')
    expect(resolvePanelRoute('tasks')).toBe('cron')
    expect(resolvePanelRoute('mcp')).toBe('connections')
    expect(PANEL_ROUTE_ALIASES.tasks).toBe('cron')
  })
})
