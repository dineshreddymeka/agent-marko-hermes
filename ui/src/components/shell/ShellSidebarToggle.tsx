import { PanelLeftOpen } from 'lucide-react'
import { useUiStore } from '@app/stores/ui'

/** Opens the sessions sidebar when collapsed; lives in column headers (not absolute overlay). */
export function ShellSidebarToggle() {
  const sidebarOpen = useUiStore((s) => s.sidebarOpen)
  const setSidebarOpen = useUiStore((s) => s.setSidebarOpen)

  if (sidebarOpen) return null

  return (
    <button
      type="button"
      title="Show sidebar (Ctrl+B)"
      aria-label="Show sidebar"
      onClick={() => setSidebarOpen(true)}
      className="mr-2 flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-fg-muted hover:bg-canvas-subtle hover:text-fg"
    >
      <PanelLeftOpen size={16} />
    </button>
  )
}
