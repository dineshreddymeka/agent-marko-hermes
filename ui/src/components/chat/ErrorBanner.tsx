import { AlertCircle, RotateCcw, X } from 'lucide-react'
import { retryLastRun } from '@app/lib/agui/client'
import { useChatStore } from '@app/stores/chat'
import { useSessionsStore } from '@app/stores/sessions'

export function ErrorBanner() {
  const error = useChatStore((s) => s.error)
  const setError = useChatStore((s) => s.setError)
  const setRunStatus = useChatStore((s) => s.setRunStatus)
  const activeSessionId = useSessionsStore((s) => s.activeSessionId)

  if (!error) return null

  const dismiss = () => {
    setError(null)
    setRunStatus('idle')
  }

  const retry = () => {
    const sid = activeSessionId
    if (!sid) {
      dismiss()
      return
    }
    void retryLastRun(sid)
  }

  return (
    <div className="flex items-center gap-2 border-t border-danger/30 bg-danger/10 px-4 py-2 text-sm text-danger">
      <AlertCircle size={16} className="shrink-0" />
      <span className="min-w-0 flex-1 truncate">{error}</span>
      <button
        type="button"
        onClick={retry}
        className="flex shrink-0 items-center gap-1 rounded px-2 py-0.5 text-xs hover:bg-danger/20"
        title="Retry last message"
      >
        <RotateCcw size={12} /> Retry
      </button>
      <button
        type="button"
        onClick={dismiss}
        className="flex shrink-0 items-center gap-1 rounded px-2 py-0.5 text-xs hover:bg-danger/20"
        title="Dismiss"
      >
        <X size={12} />
      </button>
    </div>
  )
}
