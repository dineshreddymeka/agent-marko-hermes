import { useEffect, useMemo, useState } from 'react'
import { Command } from 'cmdk'
import { useNavigate } from '@tanstack/react-router'
import { useUiStore, type PanelName } from '@app/stores/ui'
import { useSettingsStore } from '@app/stores/settings'
import { useSessionsStore } from '@app/stores/sessions'
import { createPersistedSession } from '@app/lib/sessions-api'
import { apiClient } from '@app/lib/api'
import { panelLabel } from '@app/lib/labels'
import { listSlashCommands } from '@app/lib/slash-commands'
import { useCapabilities } from '@app/hooks/useCapabilities'
import { Kbd } from '@app/components/common/Kbd'
import type { Session } from '@hermes/shared'

const panels: { id: PanelName; label: string }[] = [
  { id: 'workspace', label: panelLabel('workspace') },
  { id: 'office', label: panelLabel('office') },
  { id: 'cron', label: panelLabel('cron') },
  { id: 'connections', label: panelLabel('connections') },
  { id: 'skills', label: panelLabel('skills') },
  { id: 'settings', label: panelLabel('settings') },
  { id: 'sessions', label: panelLabel('sessions') },
  { id: 'memory', label: panelLabel('memory') },
  { id: 'briefing', label: panelLabel('briefing') },
  { id: 'profiles', label: panelLabel('profiles') },
]

export function CommandPalette() {
  const open = useUiStore((s) => s.commandPaletteOpen)
  const setOpen = useUiStore((s) => s.setCommandPaletteOpen)
  const setActivePanel = useUiStore((s) => s.setActivePanel)
  const setTheme = useSettingsStore((s) => s.setTheme)
  const addSession = useSessionsStore((s) => s.addSession)
  const setActiveSessionId = useSessionsStore((s) => s.setActiveSessionId)
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const { data: capabilities } = useCapabilities()
  const slashCommands = useMemo(
    () => listSlashCommands(),
    [capabilities?.slashCommands?.length],
  )

  const newSession = async (profileId: string | null = null) => {
    setOpen(false)
    try {
      let session: Session
      if (profileId) {
        session = await apiClient.post<Session>('/api/sessions', {
          title: 'New chat (profile)',
          profileId,
        })
        addSession(session)
        setActiveSessionId(session.id)
      } else {
        session = await createPersistedSession('New chat')
      }
      void navigate({ to: '/session/$id', params: { id: session.id } })
    } catch {
      useUiStore.getState().addToast({
        title: 'Could not create session',
        variant: 'danger',
      })
    }
  }

  useEffect(() => {
    if (!open) setQuery('')
  }, [open])

  useEffect(() => {
    const onNew = () => {
      void newSession(null)
    }
    window.addEventListener('open-jarvis:new-session', onNew)
    return () => window.removeEventListener('open-jarvis:new-session', onNew)
  }, [])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 pt-[15vh]"
      role="dialog"
      aria-label="Command palette"
      data-testid="command-palette"
    >
      <Command
        className="w-full max-w-lg overflow-hidden rounded-lg border border-border bg-canvas-subtle shadow-2xl"
        shouldFilter
        label="Command palette"
      >
        <Command.Input
          value={query}
          onValueChange={setQuery}
          placeholder="Type a command or search…"
          data-testid="command-palette-input"
          autoFocus
          className="w-full border-b border-border bg-transparent px-4 py-3 text-sm text-fg outline-none placeholder:text-fg-muted"
        />
        <Command.List className="max-h-80 overflow-y-auto p-2">
          <Command.Empty className="px-2 py-6 text-center text-sm text-fg-muted">
            No results found.
          </Command.Empty>

          <Command.Group heading="Actions" className="text-xs text-fg-muted">
            <Command.Item
              onSelect={() => void newSession(null)}
              className="cursor-pointer rounded-md px-2 py-1.5 text-sm text-fg aria-selected:bg-accent-muted"
            >
              New session
            </Command.Item>
            <Command.Item
              onSelect={() => {
                setOpen(false)
                setActivePanel('profiles')
                void navigate({ to: '/panel/$name', params: { name: 'profiles' } })
              }}
              className="cursor-pointer rounded-md px-2 py-1.5 text-sm text-fg aria-selected:bg-accent-muted"
            >
              New session with profile…
            </Command.Item>
          </Command.Group>

          <Command.Group heading="Panels" className="text-xs text-fg-muted">
            {panels.map((p) => (
              <Command.Item
                key={p.id}
                onSelect={() => {
                  setActivePanel(p.id)
                  setOpen(false)
                  void navigate({ to: '/panel/$name', params: { name: p.id } })
                }}
                className="cursor-pointer rounded-md px-2 py-1.5 text-sm text-fg aria-selected:bg-accent-muted"
              >
                Open {p.label}
              </Command.Item>
            ))}
          </Command.Group>

          {slashCommands.length > 0 ? (
            <Command.Group heading="Slash commands" className="text-xs text-fg-muted">
              {slashCommands.map((cmd) => (
                <Command.Item
                  key={cmd.cmd}
                  value={`${cmd.cmd} ${cmd.desc}`}
                  onSelect={() => {
                    setOpen(false)
                    const activeId = useSessionsStore.getState().activeSessionId
                    if (activeId) {
                      void navigate({ to: '/session/$id', params: { id: activeId } })
                    } else {
                      void navigate({ to: '/' })
                    }
                    window.dispatchEvent(
                      new CustomEvent('open-jarvis:composer-slash', {
                        detail: { text: `${cmd.cmd} ` },
                      }),
                    )
                  }}
                  className="cursor-pointer rounded-md px-2 py-1.5 text-sm text-fg aria-selected:bg-accent-muted"
                >
                  <span className="font-mono text-xs">{cmd.cmd}</span>
                  <span className="ml-2 text-fg-muted">{cmd.desc}</span>
                </Command.Item>
              ))}
            </Command.Group>
          ) : null}

          <Command.Group heading="Theme" className="text-xs text-fg-muted">
            {(['dark', 'dim', 'light'] as const).map((t) => (
              <Command.Item
                key={t}
                onSelect={() => {
                  setTheme(t)
                  setOpen(false)
                }}
                className="cursor-pointer rounded-md px-2 py-1.5 text-sm capitalize text-fg aria-selected:bg-accent-muted"
              >
                {t} theme
              </Command.Item>
            ))}
          </Command.Group>

          <Command.Group heading="Keyboard shortcuts" className="text-xs text-fg-muted">
            <Command.Item disabled className="rounded-md px-2 py-1.5 text-sm text-fg-muted">
              <span className="flex items-center gap-2">
                Command palette <Kbd>Ctrl</Kbd>+<Kbd>K</Kbd>
              </span>
            </Command.Item>
            <Command.Item disabled className="rounded-md px-2 py-1.5 text-sm text-fg-muted">
              <span className="flex items-center gap-2">
                New session <Kbd>Ctrl</Kbd>+<Kbd>N</Kbd>
              </span>
            </Command.Item>
            <Command.Item disabled className="rounded-md px-2 py-1.5 text-sm text-fg-muted">
              <span className="flex items-center gap-2">
                Toggle sidebar <Kbd>Ctrl</Kbd>+<Kbd>B</Kbd>
              </span>
            </Command.Item>
            <Command.Item disabled className="rounded-md px-2 py-1.5 text-sm text-fg-muted">
              <span className="flex items-center gap-2">
                Toggle right panel <Kbd>Ctrl</Kbd>+<Kbd>Alt</Kbd>+<Kbd>B</Kbd>
              </span>
            </Command.Item>
            <Command.Item disabled className="rounded-md px-2 py-1.5 text-sm text-fg-muted">
              <span className="flex items-center gap-2">
                Cancel run / close <Kbd>Esc</Kbd>
              </span>
            </Command.Item>
          </Command.Group>
        </Command.List>
      </Command>
      <button
        type="button"
        className="fixed inset-0 -z-10"
        aria-label="Close palette"
        onClick={() => setOpen(false)}
      />
    </div>
  )
}
