import { describe, expect, test } from 'bun:test'
import { useUiStore } from '../src/stores/ui'

describe('ui store', () => {
  test('defaults to dark theme and open sidebar', () => {
    const state = useUiStore.getState()
    expect(state.theme).toBe('dark')
    expect(state.sidebarOpen).toBe(true)
    expect(state.rightPanelOpen).toBe(false)
  })

  test('toggles sidebar', () => {
    useUiStore.getState().setSidebarOpen(true)
    useUiStore.getState().toggleSidebar()
    expect(useUiStore.getState().sidebarOpen).toBe(false)
  })

  test('cycles themes', () => {
    useUiStore.getState().setTheme('dark')
    useUiStore.getState().cycleTheme()
    expect(useUiStore.getState().theme).toBe('dim')
    useUiStore.getState().cycleTheme()
    expect(useUiStore.getState().theme).toBe('light')
  })
})
