import { useEffect, useRef, useState } from 'react'
import { Brain, ChevronDown, ChevronRight } from 'lucide-react'
import { useNow } from '@app/hooks/useNow'
import { cn } from '@app/lib/utils'

interface ThinkingBlockProps {
  content: string
  /** When true, duration ticks while the block is streaming. */
  streaming?: boolean
}

function formatDuration(ms: number): string {
  const sec = Math.max(0, Math.round(ms / 1000))
  if (sec < 60) return `${sec}s`
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return `${m}m ${s}s`
}

export function ThinkingBlock({ content, streaming }: ThinkingBlockProps) {
  const [open, setOpen] = useState(false)
  const startedAt = useRef(Date.now())
  const frozenMs = useRef<number | null>(null)
  const now = useNow(250)

  const elapsedMs =
    streaming || frozenMs.current == null
      ? now - startedAt.current
      : frozenMs.current

  useEffect(() => {
    if (!streaming) {
      if (frozenMs.current == null) {
        frozenMs.current = Date.now() - startedAt.current
      }
      return
    }
    frozenMs.current = null
    startedAt.current = Date.now()
  }, [streaming])

  if (!content.trim()) return null

  const tailPreview = content.replace(/\s+/g, ' ').trim().slice(-72)

  return (
    <div className="mb-2 overflow-hidden rounded-xl border border-border-muted bg-canvas-inset text-sm shadow-sm">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-fg-muted hover:bg-canvas-subtle/60 hover:text-fg"
      >
        <Brain
          size={14}
          className={cn(
            streaming && 'motion-safe:text-accent motion-safe:drop-shadow-[0_0_6px_var(--color-accent-muted)]',
          )}
        />
        <span className={cn('text-xs font-medium', streaming && 'motion-safe:text-shimmer')}>
          Thinking{streaming ? '…' : ''}
        </span>
        <span className="text-[11px] tabular-nums text-fg-muted/80">
          {formatDuration(elapsedMs)}
        </span>
        {open ? <ChevronDown size={12} className="ml-auto" /> : <ChevronRight size={12} className="ml-auto" />}
      </button>
      {!open && streaming && tailPreview && (
        <div className="thinking-tail-mask border-t border-border-muted/60 px-3 py-1.5 font-mono text-[11px] leading-snug text-fg-muted">
          {tailPreview}
        </div>
      )}
      {open && (
        <div className="border-t border-border-muted px-3 py-2 font-mono text-xs leading-relaxed text-fg-muted whitespace-pre-wrap">
          {content}
          {streaming && <span className="streaming-caret" aria-hidden />}
        </div>
      )}
    </div>
  )
}
