import { cn } from '@app/lib/utils'

export function Kbd({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <kbd
      className={cn(
        'inline-flex items-center rounded border border-border bg-canvas-subtle px-1.5 py-0.5 font-mono text-[11px] text-fg-muted',
        className,
      )}
    >
      {children}
    </kbd>
  )
}
