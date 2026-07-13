import { useEffect } from 'react'
import { useUiStore } from '@app/stores/ui'
import { useChatStore } from '@app/stores/chat'
import { cancelRun } from '@app/lib/agui/client'

/**
 * Global shortcuts. Reads store via getState() so the listener stays stable
 * and never misses Ctrl/Cmd+K due to a stale open flag.
 */
export function useKeyboardShortcuts() {
  const toggleSidebar = useUiStore((s) => s.toggleSidebar)
  const toggleRightPanel = useUiStore((s) => s.toggleRightPanel)

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const mod = e.ctrlKey || e.metaKey
      const { commandPaletteOpen, setCommandPaletteOpen } = useUiStore.getState()

      if (mod && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        e.stopPropagation()
        setCommandPaletteOpen(!commandPaletteOpen)
        return
      }

      if (e.key === 'Escape') {
        if (commandPaletteOpen) {
          setCommandPaletteOpen(false)
          return
        }
        if (useChatStore.getState().runStatus === 'running') {
          cancelRun()
        }
        return
      }

      if (!mod) return

      if (e.key.toLowerCase() === 'n' && !e.altKey && !e.shiftKey) {
        e.preventDefault()
        window.dispatchEvent(new CustomEvent('open-jarvis:new-session'))
        return
      }

      if (e.key === 'b' && !e.altKey) {
        const path = window.location.pathname
        if (path === '/' || path.startsWith('/session/')) {
          e.preventDefault()
          toggleSidebar()
        }
        return
      }

      if (e.key === 'b' && e.altKey) {
        e.preventDefault()
        toggleRightPanel()
      }
    }

    // Capture phase: beat Chromium/page handlers that may swallow Ctrl+K.
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [toggleSidebar, toggleRightPanel])
}
