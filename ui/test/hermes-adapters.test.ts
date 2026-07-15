import { describe, expect, test, beforeEach, afterEach } from 'vitest'
import {
  createHermesSession,
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

  test('placeholder titles fall back to preview, else New chat (never Untitled)', () => {
    expect(
      hermesSessionToDto({
        id: 'a',
        title: null,
        preview: 'How do I deploy Hermes on port 9119?',
      }).title,
    ).toBe('How do I deploy Hermes on port 9119?')

    expect(
      hermesSessionToDto({
        id: 'b',
        title: 'New chat',
        preview: '  fix the sidebar titles  ',
      }).title,
    ).toBe('fix the sidebar titles')

    expect(
      hermesSessionToDto({
        id: 'c',
        title: 'Untitled',
        preview: null,
      }).title,
    ).toBe('New chat')

    expect(hermesSessionToDto({ id: 'd', title: '' }).title).toBe('New chat')
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
      new Response(
        JSON.stringify({
          id: 'sess-3',
          title: 'Renamed',
          archived: true,
          started_at: 1_700_000_000,
          last_active: 1_700_000_200,
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        },
      )

    const session = await patchHermesSession('sess-3', {
      title: 'Renamed',
      archived: true,
    })
    expect(session.id).toBe('sess-3')
    expect(session.title).toBe('Renamed')
    expect(session.archived).toBe(true)
  })
})
