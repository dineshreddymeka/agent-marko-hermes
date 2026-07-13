interface SkillCardProps {
  skillId?: string
  name: string
  description?: string
  source?: string
  usageCount?: number
  onAction?: (action: string, data: unknown) => void
}

export function SkillCard({
  skillId,
  name,
  description,
  source,
  usageCount,
  onAction,
}: SkillCardProps) {
  return (
    <div className="rounded-lg border border-border bg-canvas-subtle p-3" data-testid="a2ui-skill-card">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h4 className="text-sm font-medium text-fg">{name}</h4>
          {description && <p className="mt-1 text-xs text-fg-muted">{description}</p>}
          {source && (
            <p className="mt-1 text-[10px] uppercase tracking-wide text-fg-muted">{source}</p>
          )}
        </div>
        {usageCount != null && (
          <span className="rounded bg-accent-muted px-1.5 py-0.5 text-xs text-accent">
            {usageCount} uses
          </span>
        )}
      </div>
      <button
        type="button"
        onClick={() => onAction?.('use_skill', { skillId, name, source })}
        className="mt-2 text-xs text-accent hover:underline"
      >
        Use skill
      </button>
    </div>
  )
}
