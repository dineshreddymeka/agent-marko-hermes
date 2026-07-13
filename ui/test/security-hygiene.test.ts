/**
 * Security hygiene unit tests — regressions enterprise scanners often flag.
 * Local only; not wired into GitHub Actions security jobs.
 */
import { describe, expect, test, mock, beforeEach, afterEach } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { useSessionsStore } from '../src/stores/sessions'
import { useUiStore } from '../src/stores/ui'

const appRoot = join(import.meta.dir, '..')
const repoRoot = join(appRoot, '..')

describe('ToolCallCard XSS hygiene', () => {
  test('source does not call dangerouslySetInnerHTML', () => {
    const src = readFileSync(
      join(appRoot, 'src/components/chat/ToolCallCard.tsx'),
      'utf8',
    )
    const withoutComments = src
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/[^\n]*/g, '')
    expect(withoutComments).not.toContain('dangerouslySetInnerHTML')
  })
})

describe('CommandPalette persisted session', () => {
  const originalFetch = globalThis.fetch
  let calls: Array<{ url: string; init?: RequestInit }>

  beforeEach(() => {
    calls = []
    useSessionsStore.setState({ sessions: [], activeSessionId: null })
    useUiStore.setState({ toasts: [] })
    // apiClient builds URLs with window.location.origin
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      writable: true,
      value: { location: { origin: 'http://localhost' } },
    })
    globalThis.fetch = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
      calls.push({ url, init })
      return new Response(
        JSON.stringify({
          id: 'persisted-1',
          title: 'New chat',
          groupName: null,
          profileId: null,
          pinned: false,
          archived: false,
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        }),
        { status: 201 },
      )
    }) as typeof fetch
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
    // @ts-expect-error test cleanup
    delete globalThis.window
  })

  test('CommandPalette imports createPersistedSession for New session', () => {
    const src = readFileSync(
      join(appRoot, 'src/components/common/CommandPalette.tsx'),
      'utf8',
    )
    expect(src).toContain("from '@app/lib/sessions-api'")
    expect(src).toContain('createPersistedSession')
    expect(src).toMatch(/createPersistedSession\(['"]New chat['"]\)/)
  })

  test('createPersistedSession POSTs /api/sessions then activates id', async () => {
    const { createPersistedSession } = await import('../src/lib/sessions-api')
    const session = await createPersistedSession('New chat')

    expect(
      calls.some((c) => c.url.includes('/api/sessions') && (c.init?.method ?? 'POST') === 'POST'),
    ).toBe(true)
    expect(session.id).toBe('persisted-1')
    expect(useSessionsStore.getState().activeSessionId).toBe('persisted-1')
    expect(useSessionsStore.getState().sessions.some((s) => s.id === 'persisted-1')).toBe(true)
  })
})

describe('repo path jail source still present', () => {
  test('cowork task exports resolveAllowedSourcePath', () => {
    const src = readFileSync(join(repoRoot, 'server/src/cowork/task.ts'), 'utf8')
    expect(src).toContain('export function resolveAllowedSourcePath')
  })
})
