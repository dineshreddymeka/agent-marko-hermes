import { useEffect, useRef, useState } from 'react'
import { ChevronDown, ChevronRight, Wrench, Loader2, CheckCircle, XCircle } from 'lucide-react'
import type { ToolCallState } from '@app/stores/chat'
import { cn } from '@app/lib/utils'
import { labelTitle } from '@app/lib/display-names'
import { toolCallStatusLabel, toolLabel } from '@app/lib/labels'

interface ToolCallCardProps {
  toolCall: ToolCallState
}

const statusIcons = {
  pending: Loader2,
  'streaming-args': Loader2,
  executing: Loader2,
  done: CheckCircle,
  error: XCircle,
}

function formatResult(result: unknown): { kind: 'json' | 'diff' | 'plain' | 'svg'; text: string } {
  if (result == null) return { kind: 'plain', text: '' }
  if (typeof result === 'object' && result !== null && 'svg' in result) {
    const svg = String((result as { svg: unknown }).svg ?? '')
    if (svg.includes('<svg')) return { kind: 'svg', text: svg }
  }
  if (typeof result === 'string') {
    const trimmed = result.trim()
    if (trimmed.includes('<svg')) return { kind: 'svg', text: trimmed }
    if (trimmed.startsWith('diff ') || trimmed.startsWith('---') || trimmed.includes('\n+++')) {
      return { kind: 'diff', text: result }
    }
    try {
      const parsed: unknown = JSON.parse(result)
      if (parsed && typeof parsed === 'object' && 'svg' in (parsed as object)) {
        const svg = String((parsed as { svg: unknown }).svg ?? '')
        if (svg.includes('<svg')) return { kind: 'svg', text: svg }
      }
      return { kind: 'json', text: JSON.stringify(parsed, null, 2) }
    } catch {
      return { kind: 'plain', text: result }
    }
  }
  return { kind: 'json', text: JSON.stringify(result, null, 2) }
}

function formatArgs(args: string): string {
  try {
    return JSON.stringify(JSON.parse(args || '{}'), null, 2)
  } catch {
    return args
  }
}

export function ToolCallCard({ toolCall }: ToolCallCardProps) {
  const [open, setOpen] = useState(toolCall.status !== 'done')
  const prevLenRef = useRef(0)
  const Icon = statusIcons[toolCall.status]
  const spinning = ['pending', 'streaming-args', 'executing'].includes(toolCall.status)
  const formatted = toolCall.result != null ? formatResult(toolCall.result) : null
  const toolDisplay = toolLabel(toolCall.name)
  const statusDisplay = toolCallStatusLabel(toolCall.status)
  const isStreamingArgs = toolCall.status === 'streaming-args'

  useEffect(() => {
    if (toolCall.status === 'streaming-args' || toolCall.status === 'executing') {
      setOpen(true)
    }
  }, [toolCall.status])

  useEffect(() => {
    if (!isStreamingArgs) prevLenRef.current = toolCall.args.length
  }, [isStreamingArgs, toolCall.args.length])

  const argsCommitted = isStreamingArgs ? toolCall.args.slice(0, prevLenRef.current) : toolCall.args
  const argsTail = isStreamingArgs ? toolCall.args.slice(prevLenRef.current) : ''

  useEffect(() => {
    if (isStreamingArgs) prevLenRef.current = toolCall.args.length
  }, [toolCall.args, isStreamingArgs])

  return (
    <div className="overflow-hidden rounded-xl border border-border-muted bg-canvas-subtle text-sm shadow-sm">
      {spinning && (
        <div className="motion-safe:stage-sweep-bar h-0.5 w-full opacity-50" aria-hidden />
      )}
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-2 px-3 py-2.5 text-left hover:bg-canvas-inset/50"
      >
        {open ? <ChevronDown size={14} className="text-fg-muted" /> : <ChevronRight size={14} className="text-fg-muted" />}
        <Wrench size={14} className="text-fg-muted" />
        <span className="font-medium text-fg" title={labelTitle(toolCall.name, toolDisplay)}>
          {toolDisplay}
        </span>
        <span className="text-[11px] text-fg-muted">{statusDisplay}</span>
        <Icon
          size={14}
          className={cn(
            'ml-auto motion-safe:transition-transform',
            toolCall.status === 'done' && 'text-success motion-safe:scale-110',
            toolCall.status === 'error' && 'text-danger',
            spinning && 'animate-spin text-fg-muted',
          )}
        />
      </button>
      {open && (
        <div className="border-t border-border-muted px-3 py-2">
          {toolCall.args && (
            <div className="mb-2">
              <p className="mb-1 text-xs text-fg-muted">Arguments</p>
              <pre className="overflow-x-auto rounded-lg border border-border-muted bg-canvas-inset p-2 font-mono text-xs text-fg">
                {formatArgs(argsCommitted)}
                {argsTail && (
                  <span className="motion-safe:stream-tail-reveal">{argsTail}</span>
                )}
                {isStreamingArgs && <span className="streaming-caret" aria-hidden />}
              </pre>
            </div>
          )}
          {((toolCall.progressLines && toolCall.progressLines.length > 0) ||
            toolCall.progressLive) && (
            <div className="mb-2">
              <p className="mb-1 text-xs text-fg-muted">Open Cowork progress</p>
              <div
                className="max-h-40 space-y-1 overflow-auto rounded-lg border border-border-muted bg-canvas-inset p-2 font-mono text-xs text-fg"
                aria-live="polite"
              >
                {(toolCall.progressLines ?? []).map((line, i) => (
                  <p key={`${i}-${line.slice(0, 24)}`} className="whitespace-pre-wrap break-words">
                    {line}
                  </p>
                ))}
                {toolCall.progressLive ? (
                  <p className="whitespace-pre-wrap break-words text-fg-muted">
                    {toolCall.progressLive}
                    {spinning && <span className="streaming-caret" aria-hidden />}
                  </p>
                ) : null}
              </div>
            </div>
          )}
          {formatted && (
            <div>
              <p className="mb-1 text-xs text-fg-muted">
                Result{formatted.kind !== 'plain' ? ` (${formatted.kind})` : ''}
              </p>
              <pre
                className={cn(
                  'max-h-48 overflow-auto rounded-lg border border-border-muted bg-canvas-inset p-2 font-mono text-xs text-fg',
                  formatted.kind === 'diff' && 'text-attention',
                )}
              >
                {formatted.text}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
