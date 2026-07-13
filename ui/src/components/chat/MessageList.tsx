import { useRef } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { MessageBubble } from '@app/components/chat/MessageBubble'
import type { ChatMessage } from '@app/stores/chat'
import { useChatStore } from '@app/stores/chat'

interface MessageListProps {
  messages: ChatMessage[]
}

export function MessageList({ messages }: MessageListProps) {
  const parentRef = useRef<HTMLDivElement>(null)
  const runStatus = useChatStore((s) => s.runStatus)
  const toolCalls = useChatStore((s) => s.toolCalls)

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

  const virtualizer = useVirtualizer({
    count: visible.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 120,
    overscan: 5,
  })

  const lastIndex = visible.length - 1

  return (
    <div ref={parentRef} className="absolute inset-0 overflow-y-auto px-4 py-4">
      <div
        className="mx-auto max-w-3xl"
        style={{ height: `${virtualizer.getTotalSize()}px`, position: 'relative' }}
      >
        {virtualizer.getVirtualItems().map((item) => {
          const message = visible[item.index]
          if (!message) return null
          const animateEnter =
            item.index === lastIndex &&
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
