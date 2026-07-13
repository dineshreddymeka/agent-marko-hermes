import { Moon, Sun, SunDim } from 'lucide-react'
import { useEffect } from 'react'
import { Outlet, useRouterState } from '@tanstack/react-router'
import { IconRail } from '@app/components/shell/IconRail'
import { Sidebar } from '@app/components/shell/Sidebar'
import { RightPanel } from '@app/components/shell/RightPanel'
import { MobileNav } from '@app/components/shell/MobileNav'
import { StatusFooter } from '@app/components/shell/StatusFooter'
import { AgentStatePanel } from '@app/components/state/AgentStatePanel'
import { CommandPalette } from '@app/components/common/CommandPalette'
import { Toasts } from '@app/components/common/Toasts'
import { ErrorBoundary } from '@app/components/common/ErrorBoundary'
import { useKeyboardShortcuts } from '@app/hooks/useKeyboardShortcuts'
import { useUiStore, type Theme } from '@app/stores/ui'
import { CapabilitiesBootstrap } from '@app/components/CapabilitiesBootstrap'
import { hermesAuthHeaders } from '@app/lib/api'

const themeIcons: Record<Theme, typeof Moon> = {
  dark: Moon,
  dim: SunDim,
  light: Sun,
}

function isChatRoute(pathname: string): boolean {
  return pathname === '/' || pathname.startsWith('/session/')
}

export function AppShell() {
  useKeyboardShortcuts()

  const theme = useUiStore((s) => s.theme)
  const cycleTheme = useUiStore((s) => s.cycleTheme)
  const sidebarOpen = useUiStore((s) => s.sidebarOpen)
  const setSidebarOpen = useUiStore((s) => s.setSidebarOpen)
  const rightPanelOpen = useUiStore((s) => s.rightPanelOpen)
  const setRightPanelOpen = useUiStore((s) => s.setRightPanelOpen)
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const showSessionsSidebar = isChatRoute(pathname)

  useEffect(() => {
    if (pathname === '/login') return
    void (async () => {
      try {
        const healthRes = await fetch('/api/health', {
          credentials: 'include',
          headers: hermesAuthHeaders(),
        })
        if (!healthRes.ok) return
        const health = (await healthRes.json()) as {
          authRequired?: boolean
        }
        if (!health.authRequired) return
        const session = await fetch('/api/auth/get-session', {
          credentials: 'include',
          headers: hermesAuthHeaders(),
        }).then((r) => r.json())
        if (!session?.user) {
          window.location.href = '/login'
        }
      } catch {
        /* health unavailable — stay on page */
      }
    })()
  }, [pathname])

  useEffect(() => {
    if (!showSessionsSidebar) {
      setSidebarOpen(false)
    } else if (window.matchMedia('(max-width: 767px)').matches) {
      setSidebarOpen(false)
    }
  }, [showSessionsSidebar, setSidebarOpen])

  const ThemeIcon = themeIcons[theme]

  return (
    <ErrorBoundary>
      <CapabilitiesBootstrap />
      <div className="flex h-full flex-col pb-14 md:pb-0">
        <div className="relative flex min-h-0 flex-1">
          <IconRail />

          {showSessionsSidebar && sidebarOpen ? (
            <button
              type="button"
              aria-label="Close sidebar"
              className="fixed inset-0 z-30 bg-black/40 md:hidden"
              onClick={() => setSidebarOpen(false)}
            />
          ) : null}

          {showSessionsSidebar ? <Sidebar /> : null}

          <Outlet />

          {rightPanelOpen ? (
            <button
              type="button"
              aria-label="Close right panel"
              className="fixed inset-0 z-30 bg-black/40 md:hidden"
              onClick={() => setRightPanelOpen(false)}
            />
          ) : null}

          <RightPanel title="Agent state">
            <AgentStatePanel />
          </RightPanel>
        </div>

        <div className="relative">
          <StatusFooter />
          <button
            type="button"
            title={`Theme: ${theme} (click to cycle)`}
            aria-label={`Current theme: ${theme}. Click to cycle.`}
            onClick={cycleTheme}
            className="absolute right-3 flex h-6 w-6 items-center justify-center rounded text-fg-muted hover:bg-canvas hover:text-fg"
          >
            <ThemeIcon size={14} />
          </button>
        </div>

        <MobileNav />
        <CommandPalette />
        <Toasts />
      </div>
    </ErrorBoundary>
  )
}
