import { describe, expect, test, mock, beforeEach, afterEach } from 'bun:test'
import { useUiStore } from '../src/stores/ui'

describe('A2UI action round-trips', () => {
  const originalFetch = globalThis.fetch
  let calls: Array<{ url: string; init?: RequestInit }>

  beforeEach(() => {
    calls = []
    useUiStore.setState({ toasts: [] })
    globalThis.fetch = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
      calls.push({ url, init })
      return new Response(JSON.stringify({ ok: true, id: 'job-1' }), { status: 201 })
    }) as typeof fetch
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  test('create_cron posts workflow DTO to /api/cron then AG-UI follow-up', async () => {
    const { sendA2UIAction } = await import('../src/lib/a2ui/actions')
    await sendA2UIAction('surf-1', 'create_cron', {
      name: 'Daily',
      schedule: '0 9 * * *',
      prompt: 'ping',
      timezone: 'UTC',
      mcpServerIds: [],
      skillIds: [],
    })
    const cronCall = calls.find((c) => c.url.includes('/api/cron') && c.init?.method === 'POST')
    expect(cronCall).toBeTruthy()
    const body = JSON.parse(String(cronCall!.init?.body ?? '{}')) as {
      name: string
      workflow: { version: number; mcpServerIds: string[]; skillIds: string[]; timezone: string }
    }
    expect(body.name).toBe('Daily')
    expect(body.workflow.version).toBe(1)
    expect(body.workflow.timezone).toBe('UTC')
    expect(Array.isArray(body.workflow.mcpServerIds)).toBe(true)
    expect(Array.isArray(body.workflow.skillIds)).toBe(true)
    expect(calls.some((c) => c.url.includes('/agui') && c.init?.method === 'POST')).toBe(true)
    expect(useUiStore.getState().toasts.some((t) => t.title === 'Scheduled task created')).toBe(true)
  })

  test('create_document markdown writes workspace draft', async () => {
    const { sendA2UIAction } = await import('../src/lib/a2ui/actions')
    await sendA2UIAction('surf-doc', 'create_document', {
      deliverableType: 'markdown',
      topic: 'jnj',
      audience: 'execs',
      length: '1 page',
      notes: 'Q3',
    })
    const put = calls.find(
      (c) => c.url.includes('/api/workspace/file') && c.init?.method === 'PUT',
    )
    expect(put).toBeTruthy()
    const body = JSON.parse(String(put!.init?.body ?? '{}')) as { path: string; content: string }
    expect(body.path).toBe('drafts/jnj-draft.md')
    expect(body.content).toContain('# Draft: jnj')
    expect(useUiStore.getState().toasts.some((t) => t.title === 'Draft created')).toBe(true)
  })

  test('create_document presentation posts cowork task', async () => {
    const { sendA2UIAction } = await import('../src/lib/a2ui/actions')
    await sendA2UIAction('surf-ppt', 'create_document', {
      deliverableType: 'presentation',
      topic: 'jnj',
      audience: 'board',
      length: '8 slides',
    })
    const post = calls.find(
      (c) => c.url.includes('/api/cowork/tasks') && c.init?.method === 'POST',
    )
    expect(post).toBeTruthy()
    const body = JSON.parse(String(post!.init?.body ?? '{}')) as {
      goal: string
      deliverableType: string
    }
    expect(body.deliverableType).toBe('presentation')
    expect(body.goal).toContain('jnj')
    expect(useUiStore.getState().toasts.some((t) => t.title === 'Work request started')).toBe(
      true,
    )
  })

  test('specify_form toasts and posts AG-UI follow-up', async () => {
    const { sendA2UIAction } = await import('../src/lib/a2ui/actions')
    await sendA2UIAction('surf-form', 'specify_form', {
      purpose: 'Feedback survey',
      fields: 'name, rating',
      submitAction: 'email team',
      storageTarget: 'chat',
    })
    expect(useUiStore.getState().toasts.some((t) => t.title === 'Form spec received')).toBe(true)
    expect(calls.some((c) => c.url.includes('/agui') && c.init?.method === 'POST')).toBe(true)
  })

  test('save memory posts /api/memory/entries', async () => {
    const { sendA2UIAction } = await import('../src/lib/a2ui/actions')
    await sendA2UIAction('surf-2', 'save', {
      kind: 'semantic',
      content: 'prefers dark mode',
      importance: 0.8,
    })
    expect(calls.some((c) => c.url.includes('/api/memory/entries') && c.init?.method === 'POST')).toBe(true)
  })

  test('save memory with entryId patches existing row', async () => {
    const { sendA2UIAction } = await import('../src/lib/a2ui/actions')
    await sendA2UIAction('surf-2b', 'save', {
      entryId: 'mem-42',
      kind: 'semantic',
      content: 'updated preference',
      importance: 0.9,
    })
    const patch = calls.find(
      (c) => c.url.includes('/api/memory/entries/mem-42') && c.init?.method === 'PATCH',
    )
    expect(patch).toBeTruthy()
    expect(calls.some((c) => c.url === '/api/memory/entries' && c.init?.method === 'POST')).toBe(false)
  })
})
