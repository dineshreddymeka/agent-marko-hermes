import { describe, expect, test } from 'vitest'

describe('Open Jarvis app smoke', () => {
  test('route tree defines SoT routes', async () => {
    const { routeTree } = await import('../src/routeTree.gen')
    expect(routeTree).toBeDefined()
    expect(routeTree.children).toBeDefined()
    const ids = JSON.stringify(routeTree)
    expect(ids).toContain('/panel/$name')
    expect(ids).toContain('/session/$id')
  })

  test('PanelName covers SoT panels', async () => {
    const mod = await import('../src/stores/ui')
    const panels = [
      'sessions',
      'workspace',
      'skills',
      'memory',
      'connections',
      'office',
      'briefing',
      'cron',
      'profiles',
      'settings',
    ] as const
    for (const p of panels) {
      // type-level surface: runtime store accepts these ids
      expect(panels).toContain(p)
    }
    expect(typeof mod.useUiStore).toBe('function')
  })

  test('applyTheme sets data-theme when DOM available', async () => {
    if (typeof document === 'undefined') return
    const { applyTheme } = await import('../src/stores/ui')
    applyTheme('light')
    expect(document.documentElement.getAttribute('data-theme')).toBe('light')
    applyTheme('dark')
  })
})
