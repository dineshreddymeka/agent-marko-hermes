import { User, Bot } from 'lucide-react'
import { StreamingMarkdown } from '@app/components/chat/StreamingMarkdown'
import { ThinkingBlock } from '@app/components/chat/ThinkingBlock'
import { ToolCallCard } from '@app/components/chat/ToolCallCard'
import { A2UISurface } from '@app/components/a2ui/A2UISurface'
import { resolveA2uiSurfaceRef } from '@app/lib/a2ui/processor'
import type { ChatMessage } from '@app/stores/chat'
import { useChatStore } from '@app/stores/chat'
import { cn } from '@app/lib/utils'

interface MessageBubbleProps {
  message: ChatMessage
  /** Animate entrance for the newest streaming message. */
  animateEnter?: boolean
}

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  } catch {
    return ''
  }
}

function formatFullDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString()
  } catch {
    return iso
  }
}

export function MessageBubble({ message, animateEnter }: MessageBubbleProps) {
  const toolCalls = useChatStore((s) => s.toolCalls)
  const isUser = message.role === 'user'

  const relatedTools = Object.values(toolCalls).filter(
    (tc) => tc.messageId === message.id || message.toolName === tc.name,
  )
  const a2uiSurfaceId = resolveA2uiSurfaceRef(message.a2ui)

  if (message.role === 'tool' && relatedTools.length > 0) {
    return null
  }

  return (
    <div
      className={cn(
        'mb-5 flex gap-3',
        isUser ? 'flex-row-reverse' : 'flex-row',
        animateEnter && 'motion-safe:message-enter',
      )}
    >
      <div
        className={cn(
          'flex h-8 w-8 shrink-0 items-center justify-center rounded-full border',
          isUser
            ? 'border-user-bubble-border bg-user-bubble text-user-bubble-fg'
            : 'border-border-muted bg-canvas-subtle text-fg-muted',
        )}
      >
        {isUser ? <User size={15} /> : <Bot size={15} />}
      </div>
      <div className={cn('min-w-0 flex-1', isUser ? 'flex flex-col items-end' : '')}>
        <div
          className={cn(
            'mb-1.5 text-[11px] text-fg-muted',
            isUser ? 'text-right' : 'text-left',
          )}
          title={formatFullDate(message.createdAt)}
        >
          {formatTime(message.createdAt)}
        </div>
        {message.thinking?.trim() && (
          <div className="w-full max-w-[92%]">
            <ThinkingBlock content={message.thinking} streaming={message.streaming} />
          </div>
        )}
        {message.content && (
          <div
            className={cn(
              'inline-block max-w-[92%] rounded-2xl px-3.5 py-2.5 text-left text-sm',
              isUser
                ? 'border border-user-bubble-border bg-user-bubble text-user-bubble-fg shadow-sm'
                : 'border border-assistant-bubble-border bg-assistant-bubble text-fg shadow-sm',
            )}
          >
            {isUser ? (
              <p className="whitespace-pre-wrap leading-relaxed">{message.content}</p>
            ) : (
              <StreamingMarkdown content={message.content} streaming={message.streaming} />
            )}
          </div>
        )}
        {relatedTools.map((tc) => (
          <div key={tc.id} className="mt-1 w-full max-w-[92%]">
            <ToolCallCard toolCall={tc} />
          </div>
        ))}
        {a2uiSurfaceId && (
          <div className="mt-2 w-full max-w-[92%]">
            <A2UISurface surfaceId={a2uiSurfaceId} />
          </div>
        )}
      </div>
    </div>
  )
}
