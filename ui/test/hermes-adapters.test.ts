import { describe, expect, test, beforeEach, afterEach } from 'bun:test'
import {
  createHermesSession,
  hermesSearchHitToSearchResult,
  hermesSessionToDto,
  patchHermesSession,
} from '../src/lib/hermes-adapters'

describe('hermes session adapters', () => {
  const originalFetch = globalThis.fetch

  beforeEach(() => {
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      writable: true,
      value: { location: { origin: 'http://localhost' } },
    })
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
    // @ts-expect-error test cleanup
    delete globalThis.window
  })
  test('hermesSessionToDto maps Hermes list rows', () => {
    const dto = hermesSessionToDto({
      id: 'sess-1',
      title: 'My chat',
      archived: 1,
      started_at: 1_700_000_000,
      last_active: 1_700_000_100,
      profile: 'default',
    })
    expect(dto.id).toBe('sess-1')
    expect(dto.title).toBe('My chat')
    expect(dto.archived).toBe(true)
    expect(dto.profileId).toBe('default')
  })

  test('hermesSearchHitToSearchResult maps FTS hits for mergeSessionSearch', () => {
    const result = hermesSearchHitToSearchResult({
      session_id: 'sess-2',
      snippet: 'hello from fts',
    })
    expect(result.kind).toBe('message')
    expect(result.sessionId).toBe('sess-2')
    expect(result.snippet).toBe('hello from fts')
  })

  test('createHermesSession accepts Marko POST shape', async () => {
    globalThis.fetch = async () =>
      new Response(
        JSON.stringify({
          id: 'new-1',
          title: 'New chat',
          groupName: null,
          profileId: null,
          pinned: false,
          archived: false,
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        }),
        { status: 201, headers: { 'Content-Type': 'application/json' } },
      )

    const session = await createHermesSession('New chat')
    expect(session.id).toBe('new-1')
    expect(session.title).toBe('New chat')
  })

  test('patchHermesSession merges dashboard PATCH response', async () => {
    globalThis.fetch = async () =>
      new Response(JSON.stringify({ ok: true, title: 'Renamed', archived: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })

    const session = await patchHermesSession(
      'sess-3',
      { title: 'Renamed', archived: true },
      {
        id: 'sess-3',
        title: 'Old',
        groupName: null,
        profileId: null,
        pinned: false,
        archived: false,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    )
    expect(session.title).toBe('Renamed')
    expect(session.archived).toBe(true)
  })

  test('patchHermesSession skips API for local-only fields', async () => {
    let called = false
    globalThis.fetch = async () => {
      called = true
      return new Response('{}', { status: 500 })
    }

    const session = await patchHermesSession(
      'sess-4',
      { pinned: true },
      {
        id: 'sess-4',
        title: 'Chat',
        groupName: null,
        profileId: null,
        pinned: false,
        archived: false,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    )
    expect(called).toBe(false)
    expect(session.pinned).toBe(true)
  })
})
