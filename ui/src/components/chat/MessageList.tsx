import { useEffect, useRef } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { AgentWorkingBubble } from '@app/components/chat/AgentWorkingBubble'
import { MessageBubble } from '@app/components/chat/MessageBubble'
import type { ChatMessage } from '@app/stores/chat'
import { useChatStore } from '@app/stores/chat'

interface MessageListProps {
  messages: ChatMessage[]
  sessionId?: string
}

export function MessageList({ messages, sessionId }: MessageListProps) {
  const parentRef = useRef<HTMLDivElement>(null)
  const runStatus = useChatStore((s) => s.runStatus)
  const runStage = useChatStore((s) => s.runStage)
  const runSessionId = useChatStore((s) => s.runSessionId)
  const toolCalls = useChatStore((s) => s.toolCalls)
  const stickToBottom = useRef(true)
  const runAppliesToView = runSessionId != null && runSessionId === sessionId

  // Hide empty assistant placeholders (tool-only turns / empty thinking shells).
  const visible = messages.filter((m) => {
    if (m.role === 'user' || m.role === 'system') return true
    if (m.streaming) return true
    if (m.content?.trim()) return true
    if (m.thinking?.trim()) return true
    if (m.a2ui != null) return true
    if (m.role === 'tool') {
      return Object.values(toolCalls).some((tc) => tc.name === m.toolName)
    }
    return Object.values(toolCalls).some((tc) => tc.messageId === m.id)
  })

  const lastVisible = visible[visible.length - 1]
  const hasLiveAssistant =
    Boolean(lastVisible?.streaming) ||
    Object.values(toolCalls).some((tc) =>
      ['pending', 'streaming-args', 'executing'].includes(tc.status),
    )
  const showWorkingBubble =
    runAppliesToView &&
    runStatus === 'running' &&
    Boolean(runStage) &&
    runStage?.kind !== 'done' &&
    runStage?.kind !== 'error' &&
    !hasLiveAssistant

  const rowCount = visible.length + (showWorkingBubble ? 1 : 0)

  const virtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 120,
    overscan: 5,
  })

  useEffect(() => {
    const el = parentRef.current
    if (!el) return
    const onScroll = () => {
      const distance = el.scrollHeight - el.scrollTop - el.clientHeight
      stickToBottom.current = distance < 96
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => el.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => {
    if (!stickToBottom.current) return
    if (runStatus !== 'running' && !showWorkingBubble) return
    const id = requestAnimationFrame(() => {
      const el = parentRef.current
      if (!el) return
      el.scrollTop = el.scrollHeight
    })
    return () => cancelAnimationFrame(id)
  }, [rowCount, runStatus, runStage?.kind, messages, showWorkingBubble])

  const lastMessageIndex = visible.length - 1

  return (
    <div ref={parentRef} className="absolute inset-0 overflow-y-auto px-4 pb-28 pt-6">
      <div
        className="mx-auto max-w-3xl"
        style={{ height: `${virtualizer.getTotalSize()}px`, position: 'relative' }}
      >
        {virtualizer.getVirtualItems().map((item) => {
          const isWorkingRow = showWorkingBubble && item.index === visible.length
          if (isWorkingRow) {
            return (
              <div
                key="agent-working"
                data-index={item.index}
                ref={virtualizer.measureElement}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  transform: `translateY(${item.start}px)`,
                }}
              >
                <AgentWorkingBubble force />
              </div>
            )
          }

          const message = visible[item.index]
          if (!message) return null
          const animateEnter =
            item.index === lastMessageIndex &&
            runAppliesToView &&
            runStatus === 'running' &&
            Boolean(message.streaming)
          return (
            <div
              key={message.id}
              data-index={item.index}
              ref={virtualizer.measureElement}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                transform: `translateY(${item.start}px)`,
              }}
            >
              <MessageBubble message={message} animateEnter={animateEnter} />
            </div>
          )
        })}
      </div>
    </div>
  )
}
