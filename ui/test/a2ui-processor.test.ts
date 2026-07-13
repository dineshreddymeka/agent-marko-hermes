import { describe, expect, test, beforeEach } from 'bun:test'
import {
  extractA2uiSurfaceId,
  getSurface,
  getSurfaces,
  hydrateA2uiFromRef,
  isHydratableA2uiRef,
  processA2UIMessage,
  resolveA2uiSurfaceRef,
} from '../src/lib/a2ui/processor'

describe('A2UI processor', () => {
  beforeEach(() => {
    getSurfaces().clear()
  })

  test('processes cron picker surface', () => {
    processA2UIMessage(
      {
        surfaceId: 'test-cron',
        component: {
          id: 'c1',
          type: 'hermes:CronSchedulePicker',
          props: { name: 'Daily', schedule: '0 9 * * *' },
        },
        complete: true,
      },
      'session-1',
    )
    const surface = getSurface('test-cron')
    expect(surface?.complete).toBe(true)
    expect(surface?.components[0]?.type).toBe('hermes:CronSchedulePicker')
  })

  test('extracts surface id from payload and persisted refs', () => {
    expect(extractA2uiSurfaceId({ surfaceId: 'doc-1' })).toBe('doc-1')
    expect(resolveA2uiSurfaceRef('doc-2')).toBe('doc-2')
    expect(resolveA2uiSurfaceRef({ surfaceId: 'doc-3' })).toBe('doc-3')
    expect(resolveA2uiSurfaceRef(null)).toBeNull()
  })

  test('processes memory editor surface', () => {
    processA2UIMessage(
      {
        surfaceId: 'test-mem',
        component: {
          id: 'm1',
          type: 'hermes:MemoryEntryEditor',
          props: { kind: 'semantic', content: 'Test memory' },
        },
        complete: true,
      },
      null,
    )
    expect(getSurface('test-mem')?.components[0]?.type).toBe('hermes:MemoryEntryEditor')
  })

  test('hydrates persisted surface payload on load', () => {
    const payload = {
      surfaceId: 'persisted-doc',
      component: {
        id: 'document-request',
        type: 'hermes:DocumentRequestForm',
        props: { deliverableType: 'pdf', topic: 'Q1 report' },
      },
      complete: true,
    }
    hydrateA2uiFromRef(payload, 'session-2')
    const surface = getSurface('persisted-doc')
    expect(surface?.complete).toBe(true)
    expect(surface?.components[0]?.type).toBe('hermes:DocumentRequestForm')
    expect(isHydratableA2uiRef(payload)).toBe(true)
    expect(isHydratableA2uiRef({ surfaceId: 'x' })).toBe(false)
  })
})
