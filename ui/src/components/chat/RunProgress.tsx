import { Brain, Check, Loader2, PenLine, Wrench, X } from 'lucide-react'
import { useChatStore, type RunStageKind } from '@app/stores/chat'
import { cancelRun } from '@app/lib/agui/client'
import { useNow } from '@app/hooks/useNow'
import { toolLabel } from '@app/lib/labels'
import { cn } from '@app/lib/utils'

const STAGE_ORDER: RunStageKind[] = ['starting', 'thinking', 'tool', 'writing', 'done']

const STAGE_META: Record<
  RunStageKind,
  { label: string; icon: typeof Brain; mobileLabel?: string }
> = {
  starting: { label: 'Starting', icon: Loader2, mobileLabel: 'Starting…' },
  thinking: { label: 'Thinking', icon: Brain, mobileLabel: 'Thinking…' },
  tool: { label: 'Calling tool', icon: Wrench, mobileLabel: 'Tool…' },
  writing: { label: 'Writing', icon: PenLine, mobileLabel: 'Writing…' },
  done: { label: 'Done', icon: Check, mobileLabel: 'Done' },
  error: { label: 'Error', icon: X, mobileLabel: 'Error' },
}

function formatElapsed(ms: number): string {
  const sec = Math.max(0, Math.round(ms / 1000))
  if (sec < 60) return `${sec}s`
  return `${Math.floor(sec / 60)}m ${sec % 60}s`
}

function stageLabel(kind: RunStageKind, toolName?: string): string {
  if (kind === 'tool' && toolName) return `Calling ${toolLabel(toolName)}`
  return STAGE_META[kind].label
}

/** Compact run-stage timeline — replaces bare "Agent running…" strip. */
export function StageStrip() {
  const runStatus = useChatStore((s) => s.runStatus)
  const runStage = useChatStore((s) => s.runStage)
  const runSteps = useChatStore((s) => s.runSteps)
  const now = useNow(250)

  if (!runStage) return null
  if (runStatus !== 'running' && runStage.kind !== 'done' && runStage.kind !== 'error') return null

  const elapsed = formatElapsed(now - runStage.startedAt)
  const currentIdx = STAGE_ORDER.indexOf(runStage.kind)

  return (
    <div className="relative border-t border-border bg-canvas-subtle/80">
      <div className="motion-safe:stage-sweep-bar absolute inset-x-0 top-0 h-px opacity-60" aria-hidden />
      <div className="flex items-center gap-2 px-3 py-2 text-xs text-fg-muted md:px-4">
        <div className="hidden items-center gap-1.5 md:flex">
          {STAGE_ORDER.slice(0, -1).map((kind, idx) => {
            const meta = STAGE_META[kind]
            const Icon = meta.icon
            const isPast = currentIdx > idx
            const isCurrent = runStage.kind === kind
            return (
              <div key={kind} className="flex items-center gap-1.5">
                {idx > 0 && <span className="text-fg-subtle">→</span>}
                <span
                  className={cn(
                    'inline-flex items-center gap-1 rounded-full px-2 py-0.5',
                    isCurrent && 'bg-accent-muted text-accent',
                    isPast && 'text-success',
                    !isCurrent && !isPast && 'text-fg-subtle',
                  )}
                >
                  {isPast ? <Check size={12} /> : (
                    <Icon
                      size={12}
                      className={cn(
                        isCurrent && (kind === 'starting' || kind === 'tool') && 'motion-safe:animate-spin',
                      )}
                    />
                  )}
                  {kind === 'tool' && isCurrent && runStage.toolName
                    ? toolLabel(runStage.toolName)
                    : meta.label}
                </span>
              </div>
            )
          })}
        </div>
        <div className="flex min-w-0 flex-1 items-center gap-2 md:hidden">
          {(() => {
            const Icon = STAGE_META[runStage.kind].icon
            return (
              <>
                <Icon
                  size={14}
                  className={cn(
                    'shrink-0 text-accent',
                    (runStage.kind === 'starting' || runStage.kind === 'tool') && 'motion-safe:animate-spin',
                  )}
                />
                <span className="truncate font-medium text-fg">
                  {stageLabel(runStage.kind, runStage.toolName)}
                </span>
              </>
            )
          })()}
        </div>
        <span className="hidden tabular-nums text-fg-muted md:inline">{elapsed}</span>
        <span className="tabular-nums text-fg-muted md:hidden">{elapsed}</span>
        {runSteps.length > 0 && (
          <div className="hidden items-center gap-1 lg:flex">
            {runSteps.map((step) => (
              <span
                key={step.id}
                className={cn(
                  'rounded px-1.5 py-0.5',
                  step.status === 'done'
                    ? 'bg-success/15 text-success'
                    : 'bg-accent-muted text-accent',
                )}
              >
                {step.name}
              </span>
            ))}
          </div>
        )}
        {runStatus === 'running' && (
          <button
            type="button"
            onClick={cancelRun}
            className="ml-auto flex shrink-0 items-center gap-1 rounded-md px-2 py-1 hover:bg-canvas-inset"
            title="Cancel (Esc)"
          >
            <X size={12} /> Cancel
          </button>
        )}
      </div>
    </div>
  )
}

/** @deprecated Use StageStrip — kept for existing imports. */
export const RunProgress = StageStrip
