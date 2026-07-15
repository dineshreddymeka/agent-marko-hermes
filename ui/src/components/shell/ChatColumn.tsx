import { useEffect, useState } from 'react'
import { MessageSquare, Sparkles } from 'lucide-react'
import { Composer } from '@app/components/chat/Composer'
import { MessageList } from '@app/components/chat/MessageList'
import { StageStrip } from '@app/components/chat/RunProgress'
import { ErrorBanner } from '@app/components/chat/ErrorBanner'
import { ApprovalCard } from '@app/components/chat/ApprovalCard'
import { EmptyState } from '@app/components/common/EmptyState'
import { MessageSkeletonList } from '@app/components/common/Skeleton'
import { checkLiveRun, loadSessionMessages, startLiveMessagePoll } from '@app/lib/agui/client'
import { useChatStore } from '@app/stores/chat'
import { useSessionsStore } from '@app/stores/sessions'

import type { ChatMessage } from '@app/stores/chat'
import { ShellSidebarToggle } from '@app/components/shell/ShellSidebarToggle'

const EMPTY_MESSAGES: ChatMessage[] = []

const SUGGESTIONS = [
  'Summarize what we can do in this workspace',
  'Draft a short status update',
  'Help me plan a weekly review',
] as const

interface ChatColumnProps {
  sessionId?: string
}

function fillComposer(text: string) {
  window.dispatchEvent(
    new CustomEvent('open-jarvis:composer-slash', { detail: { text } }),
  )
}

export function ChatColumn({ sessionId }: ChatColumnProps) {
  const pendingApproval = useChatStore((s) => s.pendingApproval)
  const messages = useChatStore((s) =>
    sessionId ? (s.messagesBySession[sessionId] ?? EMPTY_MESSAGES) : EMPTY_MESSAGES,
  )
  const sessions = useSessionsStore((s) => s.sessions)
  const activeSession = sessionId ? sessions.find((s) => s.id === sessionId) : null
  const [loading, setLoading] = useState(Boolean(sessionId))
  const [loadError, setLoadError] = useState<string | null>(null)

  useEffect(() => {
    if (!sessionId) {
      setLoading(false)
      setLoadError(null)
      return
    }
    const ac = new AbortController()
    let stopPoll: (() => void) | undefined
    setLoading(true)
    setLoadError(null)

    // Drop stale working/done UI from another session when opening history.
    // checkLiveRun below will restore status only if this session is live.
    useChatStore.getState().clearStreamingState()
    useChatStore.getState().resetRun()

    void (async () => {
      try {
        await loadSessionMessages(sessionId, { signal: ac.signal, stripStreaming: true })
        if (ac.signal.aborted) return
        const live = await checkLiveRun(sessionId)
        if (ac.signal.aborted) return
        if (live) {
          stopPoll = startLiveMessagePoll(sessionId)
        } else {
          // Ensure historical transcripts never keep a working/done bubble.
          const chat = useChatStore.getState()
          chat.clearStreamingState()
          chat.resetRun()
        }
      } catch (err) {
        if (ac.signal.aborted) return
        if (err instanceof DOMException && err.name === 'AbortError') return
        setLoadError(err instanceof Error ? err.message : 'Failed to load messages')
      } finally {
        if (!ac.signal.aborted) setLoading(false)
      }
    })()
    return () => {
      ac.abort()
      stopPoll?.()
    }
  }, [sessionId])

  const showEmpty = !loading && !loadError && messages.length === 0
  const showLoading = loading && messages.length === 0

  return (
    <main className="relative flex min-w-0 flex-1 flex-col bg-canvas">
      <header className="header-surface sticky top-0 z-10 flex h-14 shrink-0 items-center gap-2 border-b border-border-muted px-4">
        <ShellSidebarToggle />
        <div className="min-w-0">
          <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-fg-subtle">
            Open Jarvis
          </p>
          <h1 className="min-w-0 truncate text-sm font-semibold text-fg">
            {activeSession?.title ?? (sessionId ? 'Chat' : 'New chat')}
          </h1>
        </div>
      </header>

      <StageStrip sessionId={sessionId} />
      <ErrorBanner />

      <div className="relative min-h-0 flex-1">
        {messages.length > 0 ? (
          <MessageList messages={messages} sessionId={sessionId} />
        ) : showLoading ? (
          <MessageSkeletonList />
        ) : loadError ? (
          <EmptyState
            icon={<MessageSquare size={22} strokeWidth={1.5} />}
            title="Couldn’t load chat"
            description={loadError}
            className="h-full"
          />
        ) : showEmpty ? (
          <div className="welcome-glow absolute inset-0 flex flex-col items-center justify-center px-6">
            <EmptyState
              icon={
                <div className="accent-chip mb-1 flex h-12 w-12 items-center justify-center rounded-2xl text-white shadow-sm">
                  <Sparkles size={22} strokeWidth={1.75} />
                </div>
              }
              title="How can I help you today?"
              description="Ask anything — tools, docs, schedules, and interactive forms live in this chat."
              className="motion-safe:message-enter !py-6"
              action={
                <div className="mt-2 flex max-w-lg flex-wrap justify-center gap-2">
                  {SUGGESTIONS.map((prompt) => (
                    <button
                      key={prompt}
                      type="button"
                      onClick={() => fillComposer(prompt)}
                      className="rounded-full border border-border bg-canvas-subtle/80 px-3.5 py-1.5 text-left text-xs text-fg transition-shell hover:border-accent/40 hover:bg-accent-muted"
                    >
                      {prompt}
                    </button>
                  ))}
                </div>
              }
            />
          </div>
        ) : null}
      </div>

      {pendingApproval ? <ApprovalCard approval={pendingApproval} /> : null}

      <Composer sessionId={sessionId ?? null} />
    </main>
  )
}
