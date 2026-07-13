import { createFileRoute, notFound } from '@tanstack/react-router'
import type { ComponentType } from 'react'
import { SessionsPanel } from '@app/components/panels/SessionsPanel'
import { WorkspacePanel } from '@app/components/panels/WorkspacePanel'
import { SkillsPanel } from '@app/components/panels/SkillsPanel'
import { DescopedPanel } from '@app/components/panels/DescopedPanel'
import { ConnectionsPanel } from '@app/components/panels/ConnectionsPanel'
import { CronPanel } from '@app/components/panels/CronPanel'
import { KanbanPanel } from '@app/components/panels/KanbanPanel'
import { ProfilesPanel } from '@app/components/panels/ProfilesPanel'
import { SettingsPanel } from '@app/components/panels/SettingsPanel'
import { panelLabel, resolvePanelRoute } from '@app/lib/labels'
import type { PanelName } from '@app/stores/ui'

function MemoryDescoped() {
  return <DescopedPanel feature="Memory (pgvector)" />
}
function OfficeDescoped() {
  return <DescopedPanel feature="Office / Cowork" />
}

const panelComponents: Record<PanelName, ComponentType> = {
  sessions: SessionsPanel,
  workspace: WorkspacePanel,
  skills: SkillsPanel,
  memory: MemoryDescoped,
  connections: ConnectionsPanel,
  office: OfficeDescoped,
  briefing: OfficeDescoped,
  cron: CronPanel,
  kanban: KanbanPanel,
  profiles: ProfilesPanel,
  settings: SettingsPanel,
}

export const Route = createFileRoute('/panel/$name')({
  component: PanelRoute,
})

function PanelRoute() {
  const { name } = Route.useParams()
  const panelName = resolvePanelRoute(name)
  if (!panelName) {
    throw notFound()
  }
  const title = panelLabel(panelName)
  const Panel = panelComponents[panelName]

  return (
    <main className="flex min-w-0 flex-1 flex-col bg-canvas">
      <header className="flex h-12 shrink-0 items-center border-b border-border px-4">
        <h1 className="min-w-0 truncate text-sm font-medium text-fg">{title}</h1>
      </header>
      <div className="min-h-0 flex-1 overflow-auto p-4">
        <Panel />
      </div>
    </main>
  )
}
