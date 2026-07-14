import { useSyncExternalStore } from 'react'
import { Sparkles } from 'lucide-react'
import {
  getSurface,
  subscribeA2UI,
  type A2UIComponent,
} from '@app/lib/a2ui/processor'
import { sendA2UIAction } from '@app/lib/a2ui/actions'
import { renderCatalogComponent } from '@app/components/a2ui/catalog'
import { Skeleton } from '@app/components/common/Skeleton'
import { cn } from '@app/lib/utils'

interface A2UISurfaceProps {
  surfaceId: string
}

export function A2UISurface({ surfaceId }: A2UISurfaceProps) {
  useSyncExternalStore(subscribeA2UI, () => getSurface(surfaceId)?.complete ?? false)
  const surface = getSurface(surfaceId)

  if (!surface) {
    return (
      <div className="a2ui-artifact my-2 space-y-2 rounded-xl border border-border-muted bg-canvas-subtle p-4">
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-8 w-full" />
      </div>
    )
  }

  return (
    <div
      className={cn(
        'a2ui-artifact my-2 overflow-hidden rounded-2xl border border-border bg-canvas-subtle/90',
      )}
    >
      <div className="flex items-center gap-2 border-b border-border-muted bg-canvas-inset/40 px-3 py-2.5">
        <Sparkles size={14} className="text-accent" />
        <span className="text-xs font-medium text-fg">Interactive form</span>
        {!surface.complete && (
          <span className="ml-auto text-[11px] text-fg-muted">Loading…</span>
        )}
      </div>
      <div className="space-y-3 p-4">
        {surface.components.map((component) => (
          <CatalogNode
            key={component.id}
            component={component}
            data={surface.data}
            onAction={(action, data) =>
              sendA2UIAction(surfaceId, action, data, surface.sessionId)
            }
          />
        ))}
        {!surface.complete && <Skeleton className="h-6 w-1/2" />}
      </div>
    </div>
  )
}

function CatalogNode({
  component,
  data,
  onAction,
}: {
  component: A2UIComponent
  data: Record<string, unknown>
  onAction: (action: string, data: unknown) => void
}) {
  return renderCatalogComponent(component, data, onAction)
}
