import { cn } from '@app/lib/utils'

interface EmptyStateProps {
  icon?: React.ReactNode
  title: string
  description?: string
  action?: React.ReactNode
  className?: string
}

export function EmptyState({ icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-3 px-6 py-12 text-center',
        className,
      )}
    >
      {icon && <div className="text-fg-muted">{icon}</div>}
      <h3 className="font-display text-2xl font-medium text-fg">{title}</h3>
      {description && <p className="max-w-md text-sm leading-relaxed text-fg-muted">{description}</p>}
      {action}
    </div>
  )
}
