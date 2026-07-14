import {
  Brain,
  Briefcase,
  Building2,
  FolderOpen,
  Kanban,
  MessageSquare,
  Plug,
  Settings,
  Sparkles,
} from 'lucide-react'
import { Link, useRouterState } from '@tanstack/react-router'
import type { PanelName } from '@app/stores/ui'
import { useUiStore } from '@app/stores/ui'
import { isPanelRouteActive, panelLabel, panelNavLabel } from '@app/lib/labels'
import { isHermesFeatureEnabled, useCapabilities } from '@app/hooks/useCapabilities'

/** Optional Hermes OpenAPI feature flag that must be true to show this rail item. */
const featureGate: Partial<Record<PanelName | 'chat', string>> = {
  office: 'office',
  cron: 'cron',
  connections: 'mcp',
  skills: 'skills',
  memory: 'memory',
  workspace: 'workspace',
  kanban: 'kanban',
}

/** Primary rail: Chat, Workspace, Office (Briefly), Cowork, MCP, Skills, Settings. */
const primaryItems: {
  id: PanelName | 'chat'
  icon: typeof MessageSquare
  label: string
  to: string
}[] = [
  { id: 'chat', icon: MessageSquare, label: 'Chat', to: '/' },
  { id: 'workspace', icon: FolderOpen, label: 'Workspace', to: '/panel/workspace' },
  { id: 'office', icon: Building2, label: 'Office', to: '/panel/office' },
  { id: 'cron', icon: Briefcase, label: panelNavLabel('cron'), to: '/panel/cowork' },
  { id: 'kanban', icon: Kanban, label: 'Kanban', to: '/panel/kanban' },
  { id: 'connections', icon: Plug, label: panelNavLabel('connections'), to: '/panel/connections' },
  { id: 'skills', icon: Sparkles, label: 'Skills', to: '/panel/skills' },
  { id: 'settings', icon: Settings, label: 'Settings', to: '/panel/settings' },
]

/** Secondary rail items after Settings. */
const secondaryItems: {
  id: PanelName
  icon: typeof MessageSquare
  label: string
  to: string
}[] = [{ id: 'memory', icon: Brain, label: 'Memory', to: '/panel/memory' }]

const items = [...primaryItems, ...secondaryItems]

export function IconRail() {
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const setActivePanel = useUiStore((s) => s.setActivePanel)
  const { data: capabilities } = useCapabilities()

  const visibleItems = items.filter(({ id }) => {
    const gate = featureGate[id]
    if (!gate) return true
    return isHermesFeatureEnabled(capabilities, gate)
  })

  return (
    <nav
      aria-label="Main navigation"
      className="flex w-12 shrink-0 flex-col items-center gap-1 border-r border-border bg-rail py-2 max-md:hidden"
    >
      {visibleItems.map(({ id, icon: Icon, label, to }) => {
        const active =
          id === 'chat'
            ? pathname === '/' || pathname.startsWith('/session/')
            : isPanelRouteActive(id as PanelName, pathname)

        const tooltip = id === 'chat' ? label : panelLabel(id as PanelName)

        return (
          <Link
            key={id}
            to={to}
            title={tooltip}
            aria-label={tooltip}
            onClick={() => setActivePanel(id === 'chat' ? null : id)}
            className={[
              'flex h-10 w-10 items-center justify-center rounded-md transition-shell',
              active
                ? 'bg-accent-muted text-accent'
                : 'text-fg-muted hover:bg-canvas-subtle hover:text-fg',
            ].join(' ')}
          >
            <Icon size={18} strokeWidth={1.75} />
          </Link>
        )
      })}
    </nav>
  )
}
