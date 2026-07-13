import { useEffect } from 'react'
import { useUiStore } from '@app/stores/ui'
import { X } from 'lucide-react'
import { cn } from '@app/lib/utils'

export function Toasts() {
  const toasts = useUiStore((s) => s.toasts)
  const removeToast = useUiStore((s) => s.removeToast)

  useEffect(() => {
    if (toasts.length === 0) return
    const timers = toasts.map((t) =>
      setTimeout(() => removeToast(t.id), 5000),
    )
    return () => timers.forEach(clearTimeout)
  }, [toasts, removeToast])

  if (toasts.length === 0) return null

  return (
    <div className="fixed bottom-12 right-4 z-50 flex flex-col gap-2">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={cn(
            'flex min-w-[240px] max-w-sm items-start gap-2 rounded-lg border px-3 py-2 shadow-lg',
            toast.variant === 'success' && 'border-success/30 bg-canvas-subtle',
            toast.variant === 'danger' && 'border-danger/30 bg-canvas-subtle',
            toast.variant === 'attention' && 'border-attention/30 bg-canvas-subtle',
            (!toast.variant || toast.variant === 'default') && 'border-border bg-canvas-subtle',
          )}
        >
          <div className="flex-1">
            <p className="text-sm font-medium text-fg">{toast.title}</p>
            {toast.description && (
              <p className="text-xs text-fg-muted">{toast.description}</p>
            )}
          </div>
          <button
            type="button"
            onClick={() => removeToast(toast.id)}
            className="text-fg-muted hover:text-fg"
            aria-label="Dismiss"
          >
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  )
}
