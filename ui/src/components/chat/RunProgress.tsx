import { Check, Loader2, X } from 'lucide-react'
import { useChatStore, type RunStageKind } from '@app/stores/chat'
import { cancelRun } from '@app/lib/agui/client'
import { useNow } from '@app/hooks/useNow'
import { toolLabel } from '@app/lib/labels'
import { cn } from '@app/lib/utils'

function formatElapsed(ms: number): string {
  const sec = Math.max(0, Math.round(ms / 1000))
  if (sec < 60) return `${sec}s`
  return `${Math.floor(sec / 60)}m ${sec % 60}s`
}

/** Cursor-style single status line for the live agent run. */
function statusCopy(kind: RunStageKind, toolName?: string): string {
  switch (kind) {
    case 'starting':
      return 'Working'
    case 'thinking':
      return 'Thinking'
    case 'tool':
      return toolName ? `Calling ${toolLabel(toolName)}` : 'Running tool'
    case 'writing':
      return 'Writing'
    case 'done':
      return 'Done'
    case 'error':
      return 'Something went wrong'
    default:
      return 'Working'
  }
}

/** Compact Cursor-like run status — shimmer while active, settle when done. */
export function StageStrip() {
  const runStatus = useChatStore((s) => s.runStatus)
  const runStage = useChatStore((s) => s.runStage)
  const runSteps = useChatStore((s) => s.runSteps)
  const now = useNow(250)

  if (!runStage) return null
  if (runStatus !== 'running' && runStage.kind !== 'done' && runStage.kind !== 'error') return null

  const elapsed = formatElapsed(now - runStage.startedAt)
  const active = runStatus === 'running'
  const done = runStage.kind === 'done'
  const errored = runStage.kind === 'error'
  const label = statusCopy(runStage.kind, runStage.toolName)
  const recentSteps = runSteps.slice(-4)

  return (
    <div
      className={cn(
        'relative border-t border-border bg-canvas-subtle/80 motion-safe:transition-shell',
        done && 'motion-safe:agent-status-settle',
      )}
      role="status"
      aria-live="polite"
    >
      {active && (
        <div className="motion-safe:stage-sweep-bar absolute inset-x-0 top-0 h-px opacity-70" aria-hidden />
      )}
      <div className="flex items-center gap-2.5 px-3 py-2 text-xs md:px-4">
        {done ? (
          <Check size={14} className="shrink-0 text-success" aria-hidden />
        ) : errored ? (
          <X size={14} className="shrink-0 text-danger" aria-hidden />
        ) : (
          <Loader2
            size={14}
            className="shrink-0 animate-spin text-accent"
            aria-hidden
          />
        )}

        <span
          className={cn(
            'min-w-0 truncate font-medium',
            active && 'motion-safe:text-shimmer',
            done && 'text-success',
            errored && 'text-danger',
            !active && !done && !errored && 'text-fg',
          )}
        >
          {label}
          {active ? '…' : ''}
        </span>

        <span className="shrink-0 tabular-nums text-fg-muted">{elapsed}</span>

        {recentSteps.length > 0 && (
          <div className="hidden min-w-0 flex-1 items-center gap-1 overflow-hidden sm:flex">
            {recentSteps.map((step) => (
              <span
                key={step.id}
                className={cn(
                  'max-w-[9rem] truncate rounded-md px-1.5 py-0.5 text-[11px]',
                  step.status === 'done'
                    ? 'bg-success/12 text-success'
                    : 'bg-accent-muted text-accent motion-safe:agent-chip-pulse',
                )}
                title={step.name}
              >
                {step.name}
              </span>
            ))}
          </div>
        )}

        {active && (
          <button
            type="button"
            onClick={cancelRun}
            className="ml-auto flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-fg-muted hover:bg-canvas-inset hover:text-fg"
            title="Cancel (Esc)"
          >
            <X size={12} /> Stop
          </button>
        )}
      </div>
    </div>
  )
}

/** @deprecated Use StageStrip — kept for existing imports. */
export const RunProgress = StageStrip
