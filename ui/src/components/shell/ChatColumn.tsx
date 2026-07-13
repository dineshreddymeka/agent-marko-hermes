import { useEffect, useState } from 'react'
import { MessageSquare } from 'lucide-react'
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

interface ChatColumnProps {
  sessionId?: string
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
    void (async () => {
      try {
        await loadSessionMessages(sessionId, { signal: ac.signal })
        if (ac.signal.aborted) return
        const live = await checkLiveRun(sessionId)
        if (!ac.signal.aborted && live) {
          stopPoll = startLiveMessagePoll(sessionId)
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
    <main className="flex min-w-0 flex-1 flex-col bg-canvas">
      <header className="flex h-12 shrink-0 items-center border-b border-border px-4">
        <ShellSidebarToggle />
        <h1 className="min-w-0 truncate text-sm font-medium text-fg">
          {activeSession?.title ?? (sessionId ? 'Chat' : 'New chat')}
        </h1>
      </header>

      <StageStrip />
      <ErrorBanner />

      <div className="relative min-h-0 flex-1">
        {messages.length > 0 ? (
          <MessageList messages={messages} />
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
          <EmptyState
            icon={<MessageSquare size={22} strokeWidth={1.5} />}
            title="How can I help you today?"
            description="Send a message to start a conversation with Open Jarvis."
            className="h-full"
          />
        ) : null}
      </div>

      {pendingApproval ? <ApprovalCard approval={pendingApproval} /> : null}

      <Composer sessionId={sessionId ?? null} />
    </main>
  )
}
