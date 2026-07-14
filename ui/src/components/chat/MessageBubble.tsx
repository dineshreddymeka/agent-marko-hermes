import { User, Sparkles } from 'lucide-react'
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
        'mb-7 flex gap-3',
        isUser ? 'flex-row-reverse' : 'flex-row',
        animateEnter && 'motion-safe:message-enter',
      )}
    >
      <div
        className={cn(
          'mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full',
          isUser
            ? 'border border-user-bubble-border bg-user-bubble text-user-bubble-fg'
            : 'accent-chip text-white shadow-sm',
        )}
      >
        {isUser ? <User size={14} strokeWidth={2} /> : <Sparkles size={14} strokeWidth={2} />}
      </div>
      <div className={cn('min-w-0 flex-1', isUser ? 'flex flex-col items-end' : '')}>
        <div
          className={cn(
            'mb-1.5 text-[11px] font-medium tracking-wide text-fg-muted',
            isUser ? 'text-right' : 'text-left',
          )}
          title={formatFullDate(message.createdAt)}
        >
          {isUser ? 'You' : 'Assistant'} · {formatTime(message.createdAt)}
        </div>
        {message.thinking?.trim() && (
          <div className={cn('w-full', isUser ? 'max-w-[min(92%,36rem)]' : 'max-w-3xl')}>
            <ThinkingBlock content={message.thinking} streaming={message.streaming} />
          </div>
        )}
        {message.content && (
          <div
            className={cn(
              'text-left text-[0.9375rem] leading-relaxed',
              isUser
                ? 'inline-block max-w-[min(92%,36rem)] rounded-2xl rounded-tr-md border border-user-bubble-border bg-user-bubble px-4 py-2.5 text-user-bubble-fg shadow-sm'
                : 'w-full max-w-3xl text-fg',
            )}
          >
            {isUser ? (
              <p className="whitespace-pre-wrap">{message.content}</p>
            ) : (
              <StreamingMarkdown content={message.content} streaming={message.streaming} />
            )}
          </div>
        )}
        {relatedTools.map((tc) => (
          <div key={tc.id} className="mt-2 w-full max-w-3xl">
            <ToolCallCard toolCall={tc} />
          </div>
        ))}
        {a2uiSurfaceId && (
          <div className="mt-3 w-full max-w-3xl">
            <A2UISurface surfaceId={a2uiSurfaceId} />
          </div>
        )}
      </div>
    </div>
  )
}
