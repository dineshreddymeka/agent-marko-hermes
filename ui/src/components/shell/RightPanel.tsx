import { PanelRightClose, PanelRightOpen } from 'lucide-react'
import { useUiStore } from '@app/stores/ui'

interface RightPanelProps {
  title?: string
  children?: React.ReactNode
}

export function RightPanel({ title = 'Panel', children }: RightPanelProps) {
  const rightPanelOpen = useUiStore((s) => s.rightPanelOpen)
  const toggleRightPanel = useUiStore((s) => s.toggleRightPanel)

  return (
    <aside
      aria-label="Right panel"
      className={[
        'flex shrink-0 flex-col border-l border-border bg-canvas-subtle transition-shell overflow-hidden',
        'max-md:fixed max-md:inset-y-0 max-md:right-0 max-md:z-40 max-md:shadow-xl max-md:pb-14',
        rightPanelOpen ? 'w-80 opacity-100' : 'w-0 opacity-0 max-md:pointer-events-none border-l-0',
      ].join(' ')}
    >
      <div className="flex h-12 items-center justify-between border-b border-border px-3">
        <span className="text-sm font-medium text-fg">{title}</span>
        <button
          type="button"
          title="Toggle right panel (Ctrl+Alt+B)"
          aria-label="Toggle right panel"
          onClick={toggleRightPanel}
          className="flex h-7 w-7 items-center justify-center rounded-md text-fg-muted hover:bg-canvas hover:text-fg"
        >
          {rightPanelOpen ? <PanelRightClose size={16} /> : <PanelRightOpen size={16} />}
        </button>
      </div>

      <div className="flex-1 overflow-auto p-4">
        {children ?? (
          <p className="text-sm text-fg-muted">
            Agent state and context details will appear here in Phase 4.
          </p>
        )}
      </div>
    </aside>
  )
}
