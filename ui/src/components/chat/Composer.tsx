import { useCallback, useEffect, useRef, useState } from 'react'
import { Send, Square, Paperclip, X, Loader2 } from 'lucide-react'
import { useNavigate } from '@tanstack/react-router'
import {
  runAgent,
  cancelRun,
  hasInFlightRun,
  recoverStaleRunIfNeeded,
} from '@app/lib/agui/client'
import {
  filterSlashCommands,
  matchSlashCommand,
  type SlashCommand,
} from '@app/lib/slash-commands'
import {
  formatAttachmentLine,
  uploadWorkspaceFile,
  type UploadedAttachment,
} from '@app/lib/workspace-upload'
import { createPersistedSession } from '@app/lib/sessions-api'
import { cn } from '@app/lib/utils'
import { useChatStore } from '@app/stores/chat'
import { useSessionsStore } from '@app/stores/sessions'
import { useSettingsStore } from '@app/stores/settings'
import { useUiStore, type PanelName } from '@app/stores/ui'
import { modelLabel } from '@app/lib/display-names'

interface ComposerProps {
  sessionId?: string | null
}

export function Composer({ sessionId }: ComposerProps) {
  const [text, setText] = useState('')
  const [slashOpen, setSlashOpen] = useState(false)
  const [slashIndex, setSlashIndex] = useState(0)
  const [attachments, setAttachments] = useState<UploadedAttachment[]>([])
  const [uploading, setUploading] = useState(false)
  const [creatingSession, setCreatingSession] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const runStatus = useChatStore((s) => s.runStatus)
  const runId = useChatStore((s) => s.runId)
  const setTheme = useSettingsStore((s) => s.setTheme)
  const setModel = useSettingsStore((s) => s.setModel)
  const setActivePanel = useUiStore((s) => s.setActivePanel)
  const addToast = useUiStore((s) => s.addToast)
  const navigate = useNavigate()
  const isRunning = runStatus === 'running' && hasInFlightRun() && Boolean(runId)

  const filteredSlash = filterSlashCommands(text)
  const showSlash = slashOpen && filteredSlash.length > 0

  const ensureSession = useCallback(async (): Promise<string> => {
    if (sessionId) return sessionId
    setCreatingSession(true)
    try {
      const session = await createPersistedSession('New chat')
      // Await navigation so ChatColumn mounts with sessionId before runAgent
      // adds the optimistic user message (otherwise `/` keeps EMPTY_MESSAGES).
      await navigate({ to: '/session/$id', params: { id: session.id } })
      return session.id
    } finally {
      setCreatingSession(false)
    }
  }, [sessionId, navigate])

  const openPanel = useCallback(
    (panel: PanelName) => {
      setActivePanel(panel)
      void navigate({ to: '/panel/$name', params: { name: panel } })
    },
    [navigate, setActivePanel],
  )

  const autoGrow = useCallback(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`
  }, [])

  useEffect(() => {
    autoGrow()
  }, [text, autoGrow])

  useEffect(() => {
    setSlashIndex(0)
  }, [text])

  useEffect(() => {
    const onComposerSlash = (e: Event) => {
      const detail = (e as CustomEvent<{ text?: string }>).detail
      const next = detail?.text ?? ''
      if (!next) return
      setText(next)
      setSlashOpen(true)
      textareaRef.current?.focus()
    }
    window.addEventListener('open-jarvis:composer-slash', onComposerSlash)
    return () => window.removeEventListener('open-jarvis:composer-slash', onComposerSlash)
  }, [])

  useEffect(() => {
    if (runStatus === 'running' && !runId) {
      recoverStaleRunIfNeeded()
    }
  }, [runStatus, runId])

  const runSlash = useCallback(
    async (command: SlashCommand, args: string) => {
      setSlashOpen(false)
      setText('')
      if (textareaRef.current) textareaRef.current.style.height = 'auto'

      switch (command.cmd) {
        case '/new': {
          const session = await createPersistedSession('New chat')
          void navigate({ to: '/session/$id', params: { id: session.id } })
          break
        }
        case '/clear': {
          const sid = sessionId ?? useSessionsStore.getState().activeSessionId
          if (sid) useChatStore.getState().setMessages(sid, [])
          break
        }
        case '/model': {
          if (args.trim()) {
            const next = args.trim()
            setModel(next)
            addToast({
              title: 'Model updated',
              description: modelLabel(next),
              variant: 'success',
            })
          } else {
            openPanel('profiles')
          }
          break
        }
        case '/skill':
          openPanel('skills')
          break
        case '/memory':
          openPanel('memory')
          break
        case '/connections':
        case '/mcp':
          openPanel('connections')
          break
        case '/office':
        case '/briefing':
        case '/briefly':
          openPanel('office')
          break
        case '/cowork': {
          const goal = args.trim()
          setText(
            goal
              ? `Create this with Open Cowork (use delegate_to_cowork): ${goal}`
              : 'Create a presentation with Open Cowork about ',
          )
          addToast({
            title: 'Cowork via chat',
            description: 'Describe the deliverable, then send — Jarvis will call Open Cowork.',
            variant: 'default',
          })
          requestAnimationFrame(() => textareaRef.current?.focus())
          break
        }
        case '/cron':
        case '/tasks':
        case '/scheduled':
          openPanel('cron')
          break
        case '/theme': {
          const themes = ['dark', 'dim', 'light'] as const
          const current = useSettingsStore.getState().theme
          const next = themes[(themes.indexOf(current) + 1) % themes.length]!
          setTheme(next)
          addToast({ title: `Theme: ${next}`, variant: 'default' })
          break
        }
        default:
          break
      }
    },
    [navigate, sessionId, setModel, addToast, openPanel, setTheme],
  )

  const submit = async () => {
    recoverStaleRunIfNeeded()
    if (isRunning || creatingSession) return

    const trimmed = text.trim()
    if (showSlash && filteredSlash[slashIndex]) {
      const cmd = filteredSlash[slashIndex]!
      const rest = trimmed.startsWith(cmd.cmd)
        ? trimmed.slice(cmd.cmd.length).trim()
        : ''
      await runSlash(cmd, rest)
      return
    }

    const matched = matchSlashCommand(trimmed)
    if (matched) {
      await runSlash(matched.command, matched.args)
      return
    }

    if (!trimmed && attachments.length === 0) return

    const sid = await ensureSession()
    const attachmentBlock = attachments.map(formatAttachmentLine).join('\n')
    const content = [trimmed, attachmentBlock].filter(Boolean).join('\n\n')
    setText('')
    setAttachments([])
    setSlashOpen(false)
    if (textareaRef.current) textareaRef.current.style.height = 'auto'
    const session = useSessionsStore.getState().sessions.find((s) => s.id === sid)
    await runAgent({
      sessionId: sid,
      content,
      profileId: session?.profileId ?? null,
    })
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (showSlash) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSlashIndex((i) => Math.min(i + 1, filteredSlash.length - 1))
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSlashIndex((i) => Math.max(i - 1, 0))
        return
      }
      if (e.key === 'Tab' || (e.key === 'Enter' && !e.shiftKey)) {
        e.preventDefault()
        const cmd = filteredSlash[slashIndex]
        if (cmd) {
          const trimmed = text.trim()
          const rest = trimmed.startsWith(cmd.cmd)
            ? trimmed.slice(cmd.cmd.length).trim()
            : ''
          void runSlash(cmd, rest)
        }
        return
      }
      if (e.key === 'Escape') {
        e.preventDefault()
        setSlashOpen(false)
        return
      }
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      void submit()
    }
  }

  const onPickFiles = async (files: FileList | null) => {
    if (!files?.length) return
    setUploading(true)
    try {
      const uploaded: UploadedAttachment[] = []
      for (const file of Array.from(files)) {
        const att = await uploadWorkspaceFile(file)
        uploaded.push(att)
      }
      setAttachments((prev) => [...prev, ...uploaded])
      addToast({
        title: uploaded.length === 1 ? 'File attached' : `${uploaded.length} files attached`,
        description: uploaded.map((a) => a.name).join(', '),
        variant: 'success',
      })
    } catch (err) {
      addToast({
        title: 'Upload failed',
        description: err instanceof Error ? err.message : 'Could not upload file',
        variant: 'danger',
      })
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const canSend =
    Boolean(text.trim() || attachments.length > 0) && !uploading && !creatingSession

  return (
    <div className="relative px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
      {showSlash && (
        <div
          className="absolute bottom-full left-4 right-4 z-20 mb-1 max-h-56 overflow-y-auto rounded-lg border border-border bg-canvas-subtle py-1 shadow-lg"
          role="listbox"
          aria-label="Slash commands"
        >
          {filteredSlash.map((c, i) => (
            <button
              key={c.cmd}
              type="button"
              role="option"
              aria-selected={i === slashIndex}
              className={cn(
                'flex w-full items-center gap-3 px-3 py-1.5 text-left text-sm',
                i === slashIndex ? 'bg-accent-muted' : 'hover:bg-canvas-inset',
              )}
              onMouseEnter={() => setSlashIndex(i)}
              onClick={() => {
                const trimmed = text.trim()
                const rest = trimmed.startsWith(c.cmd)
                  ? trimmed.slice(c.cmd.length).trim()
                  : ''
                void runSlash(c, rest)
              }}
            >
              <span className="font-mono text-accent">
                {c.cmd}
                {c.argHint ? ` ${c.argHint}` : ''}
              </span>
              <span className="text-fg-muted">{c.desc}</span>
            </button>
          ))}
        </div>
      )}

      {attachments.length > 0 && (
        <div className="mx-auto mb-2 flex max-w-3xl flex-wrap gap-2">
          {attachments.map((att) => (
            <span
              key={att.id}
              className="inline-flex items-center gap-1.5 rounded-md border border-border bg-canvas-inset px-2 py-1 text-xs text-fg"
            >
              <Paperclip size={12} className="text-fg-muted" />
              <span className="max-w-[10rem] truncate" title={att.path}>
                {att.name}
              </span>
              <button
                type="button"
                className="rounded p-0.5 text-fg-muted hover:bg-canvas-subtle hover:text-fg"
                title="Remove attachment"
                onClick={() => setAttachments((prev) => prev.filter((a) => a.id !== att.id))}
              >
                <X size={12} />
              </button>
            </span>
          ))}
        </div>
      )}

      <div className="mx-auto flex max-w-3xl items-end gap-2 rounded-xl border border-border bg-canvas-subtle p-2 shadow-sm">
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => void onPickFiles(e.target.files)}
        />
        <button
          type="button"
          disabled={isRunning || uploading}
          className="shrink-0 rounded p-2 text-fg-muted hover:bg-canvas-inset hover:text-fg disabled:opacity-40"
          title="Attach file"
          onClick={() => fileInputRef.current?.click()}
        >
          {uploading ? <Loader2 size={18} className="animate-spin" /> : <Paperclip size={18} />}
        </button>
        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => {
            const next = e.target.value
            setText(next)
            setSlashOpen(next.startsWith('/'))
          }}
          onKeyDown={onKeyDown}
          placeholder="Message Open Jarvis… (/ for commands)"
          rows={1}
          disabled={isRunning}
          className="max-h-40 min-h-[24px] flex-1 resize-none bg-transparent text-sm text-fg outline-none placeholder:text-fg-muted disabled:opacity-60"
        />
        {isRunning ? (
          <button
            type="button"
            onClick={cancelRun}
            className="shrink-0 rounded-md bg-danger/20 p-2 text-danger hover:bg-danger/30"
            title="Stop (Esc)"
          >
            <Square size={18} fill="currentColor" />
          </button>
        ) : (
          <button
            type="button"
            onClick={() => void submit()}
            disabled={!canSend}
            className={cn(
              'shrink-0 rounded-md p-2 transition-colors',
              canSend ? 'bg-accent text-accent-fg hover:bg-accent-emphasis' : 'text-fg-muted',
            )}
            title="Send"
          >
            {creatingSession ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
          </button>
        )}
      </div>
    </div>
  )
}
