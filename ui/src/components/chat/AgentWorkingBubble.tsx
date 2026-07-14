import { Loader2, Sparkles } from 'lucide-react'
import { useChatStore } from '@app/stores/chat'
import { toolLabel } from '@app/lib/labels'
import { cn } from '@app/lib/utils'

function workingLabel(kind: string | undefined, toolName?: string): string {
  switch (kind) {
    case 'thinking':
      return 'Thinking'
    case 'tool':
      return toolName ? `Calling ${toolLabel(toolName)}` : 'Running tool'
    case 'writing':
      return 'Writing a response'
    case 'starting':
    default:
      return 'Working'
  }
}

/**
 * In-thread Cursor-like activity row while the agent is running but the
 * newest assistant shell is empty (pre-first-token / tool-only gap).
 */
export function AgentWorkingBubble({ force }: { force?: boolean }) {
  const runStatus = useChatStore((s) => s.runStatus)
  const runStage = useChatStore((s) => s.runStage)

  if (!force && runStatus !== 'running') return null
  if (!runStage || runStage.kind === 'done' || runStage.kind === 'error') return null

  const label = workingLabel(runStage.kind, runStage.toolName)

  return (
    <div
      className="mb-7 flex gap-3 motion-safe:message-enter"
      role="status"
      aria-live="polite"
      aria-label={label}
    >
      <div className="accent-chip mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white shadow-sm">
        <Sparkles size={14} strokeWidth={2} className="motion-safe:agent-sparkle" />
      </div>
      <div className="min-w-0 flex-1 pt-1.5">
        <div className="mb-2 flex items-center gap-2 text-[11px] font-medium tracking-wide text-fg-muted">
          <span>Assistant</span>
          <span className="text-fg-subtle">·</span>
          <Loader2 size={11} className="animate-spin text-accent" aria-hidden />
        </div>
        <div className="flex max-w-3xl flex-col gap-2">
          <p className={cn('text-sm font-medium', 'motion-safe:text-shimmer')}>
            {label}
            <span className="motion-safe:working-dots" aria-hidden />
          </p>
          <div className="flex flex-col gap-1.5" aria-hidden>
            <div className="h-2.5 w-[min(18rem,70%)] rounded-full skeleton-shimmer opacity-70" />
            <div className="h-2.5 w-[min(12rem,45%)] rounded-full skeleton-shimmer opacity-50" />
          </div>
        </div>
      </div>
    </div>
  )
}
