import {
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
import { isPanelRouteActive, panelNavLabel } from '@app/lib/labels'

/** Primary mobile nav — same order as IconRail primary. */
const items: {
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

export function MobileNav() {
  const pathname = useRouterState({ select: (s) => s.location.pathname })

  return (
    <nav
      aria-label="Mobile navigation"
      className="fixed inset-x-0 bottom-0 z-50 flex border-t border-border bg-rail pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      {items.map(({ id, icon: Icon, label, to }) => {
        const active =
          id === 'chat'
            ? pathname === '/' || pathname.startsWith('/session/')
            : isPanelRouteActive(id as PanelName, pathname)

        return (
          <Link
            key={id}
            to={to}
            aria-label={label}
            className={[
              'flex flex-1 flex-col items-center justify-center gap-0.5 py-2 text-[10px]',
              active ? 'text-accent' : 'text-fg-muted',
            ].join(' ')}
          >
            <Icon size={20} strokeWidth={1.75} />
            <span>{label}</span>
          </Link>
        )
      })}
    </nav>
  )
}
