import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import {
  Archive,
  ChevronDown,
  ChevronRight,
  Pin,
  Search,
  Trash2,
  Pencil,
} from 'lucide-react'
import { apiClient } from '@app/lib/api'
import { fetchHermesProfiles, fetchHermesSessions } from '@app/lib/hermes-adapters'
import { useSessionsStore } from '@app/stores/sessions'
import { useUiStore } from '@app/stores/ui'
import { formatRelativeTime } from '@app/lib/utils'
import { groupSessions, mergeSessionSearch } from '@app/lib/panels'
import type { Profile, SearchResult, Session } from '@hermes/shared'
import { EmptyState } from '@app/components/common/EmptyState'
import { Skeleton } from '@app/components/common/Skeleton'

interface SessionsPanelProps {
  compact?: boolean
}

export function SessionsPanel({ compact }: SessionsPanelProps) {
  const sessions = useSessionsStore((s) => s.sessions)
  const setSessions = useSessionsStore((s) => s.setSessions)
  const activeId = useSessionsStore((s) => s.activeSessionId)
  const setActiveSessionId = useSessionsStore((s) => s.setActiveSessionId)
  const updateSession = useSessionsStore((s) => s.updateSession)
  const removeSession = useSessionsStore((s) => s.removeSession)
  const addToast = useUiStore((s) => s.addToast)
  const queryClient = useQueryClient()

  const [query, setQuery] = useState('')
  const [showArchived, setShowArchived] = useState(false)
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editTitle, setEditTitle] = useState('')

  const { isLoading, isError, error, refetch } = useQuery({
    queryKey: ['sessions'],
    queryFn: async () => {
      const data = await fetchHermesSessions()
      // Only replace the store on a successful fetch so a transient DB outage
      // (or previously persisted empty cache) cannot wipe the sidebar.
      setSessions(data)
      return data
    },
    retry: 1,
    // Prefer network over IndexedDB-restored empty lists after pool recovery.
    staleTime: 5_000,
  })

  const { data: profiles } = useQuery({
    queryKey: ['profiles'],
    queryFn: fetchHermesProfiles,
    retry: false,
  })

  const { data: searchPayload } = useQuery({
    queryKey: ['session-search', query],
    queryFn: () =>
      apiClient.get<{ query: string; results: SearchResult[] }>('/api/search', { q: query }),
    enabled: query.trim().length > 1,
    retry: false,
  })

  const patchSession = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<Session> }) =>
      apiClient.patch<Session>(`/api/sessions/${id}`, patch),
    onMutate: async ({ id, patch }) => {
      updateSession(id, patch)
    },
    onError: (_err, { id }, _ctx) => {
      addToast({ title: 'Failed to update session', variant: 'danger' })
      void refetch()
      void id
    },
    onSuccess: (session) => {
      updateSession(session.id, session)
      void queryClient.invalidateQueries({ queryKey: ['sessions'] })
    },
  })

  const deleteSession = useMutation({
    mutationFn: (id: string) => apiClient.delete(`/api/sessions/${id}`),
    onMutate: (id) => {
      removeSession(id)
    },
    onError: () => {
      addToast({ title: 'Failed to delete session', variant: 'danger' })
      void refetch()
    },
    onSuccess: () => {
      addToast({ title: 'Session deleted', variant: 'success' })
      void queryClient.invalidateQueries({ queryKey: ['sessions'] })
    },
  })

  const visible = useMemo(() => {
    const base = showArchived ? sessions : sessions.filter((s) => !s.archived)
    const { sessions: merged, previews } = mergeSessionSearch(
      base,
      searchPayload?.results,
      query,
    )
    return { list: merged, previews }
  }, [sessions, showArchived, query, searchPayload])

  const groups = useMemo(() => groupSessions(visible.list), [visible.list])

  if (isLoading && sessions.length === 0) {
    return (
      <div className="space-y-2 p-3">
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-3/4" />
      </div>
    )
  }

  if (isError && sessions.length === 0) {
    return (
      <EmptyState
        title="Could not load sessions"
        description={error instanceof Error ? error.message : 'Open Jarvis could not reach the server.'}
        className="py-8"
        action={
          <button
            type="button"
            onClick={() => void refetch()}
            className="rounded border border-border px-3 py-1 text-xs text-accent"
          >
            Retry
          </button>
        }
      />
    )
  }

  return (
    <div className="flex h-full flex-col">
      {!compact && (
        <div className="space-y-2 border-b border-border p-3">
          <div className="relative">
            <Search size={14} className="absolute left-2 top-2.5 text-fg-muted" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search sessions…"
              className="w-full rounded border border-border bg-canvas py-1.5 pl-7 pr-2 text-sm text-fg"
            />
          </div>
          <label className="flex items-center gap-2 text-xs text-fg-muted">
            <input
              type="checkbox"
              checked={showArchived}
              onChange={(e) => setShowArchived(e.target.checked)}
            />
            Show archived
          </label>
        </div>
      )}
      {compact && (
        <div className="border-b border-border p-2">
          <div className="relative">
            <Search size={12} className="absolute left-2 top-2 text-fg-muted" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search…"
              className="w-full rounded border border-border bg-canvas py-1 pl-6 pr-2 text-xs text-fg"
            />
          </div>
        </div>
      )}

      {groups.length === 0 ? (
        <EmptyState
          title="No sessions"
          description="Start a new chat to create one in Open Jarvis."
          className="py-8"
        />
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto">
          {groups.map((group) => {
            const isCollapsed = collapsed.has(group.key)
            return (
              <div key={group.key} className="border-b border-border/60">
                <button
                  type="button"
                  onClick={() => {
                    const next = new Set(collapsed)
                    if (next.has(group.key)) next.delete(group.key)
                    else next.add(group.key)
                    setCollapsed(next)
                  }}
                  className="flex w-full items-center gap-1 px-3 py-1.5 text-[11px] font-medium uppercase tracking-wide text-fg-muted hover:bg-canvas-inset"
                >
                  {isCollapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
                  {group.label}
                  <span className="ml-auto tabular-nums">{group.sessions.length}</span>
                </button>
                {!isCollapsed &&
                  group.sessions.map((session) => (
                    <SessionRow
                      key={session.id}
                      session={session}
                      active={activeId === session.id}
                      compact={!!compact}
                      preview={visible.previews.get(session.id)}
                      profiles={profiles ?? []}
                      editing={editingId === session.id}
                      editTitle={editTitle}
                      onSelect={() => setActiveSessionId(session.id)}
                      onStartEdit={() => {
                        setEditingId(session.id)
                        setEditTitle(session.title)
                      }}
                      onEditTitle={setEditTitle}
                      onCommitEdit={() => {
                        const title = editTitle.trim() || 'New chat'
                        setEditingId(null)
                        patchSession.mutate({ id: session.id, patch: { title } })
                      }}
                      onPin={() =>
                        patchSession.mutate({
                          id: session.id,
                          patch: { pinned: !session.pinned },
                        })
                      }
                      onArchive={() =>
                        patchSession.mutate({
                          id: session.id,
                          patch: { archived: !session.archived },
                        })
                      }
                      onDelete={() => {
                        if (!confirm(`Delete “${session.title}”? This cannot be undone.`)) return
                        deleteSession.mutate(session.id)
                      }}
                      onProfile={(profileId) =>
                        patchSession.mutate({ id: session.id, patch: { profileId } })
                      }
                      onGroup={(groupName) =>
                        patchSession.mutate({ id: session.id, patch: { groupName } })
                      }
                    />
                  ))}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function SessionRow({
  session,
  active,
  compact,
  preview,
  profiles,
  editing,
  editTitle,
  onSelect,
  onStartEdit,
  onEditTitle,
  onCommitEdit,
  onPin,
  onArchive,
  onDelete,
  onProfile,
  onGroup,
}: {
  session: Session
  active: boolean
  compact: boolean
  preview?: string
  profiles: Profile[]
  editing: boolean
  editTitle: string
  onSelect: () => void
  onStartEdit: () => void
  onEditTitle: (v: string) => void
  onCommitEdit: () => void
  onPin: () => void
  onArchive: () => void
  onDelete: () => void
  onProfile: (id: string | null) => void
  onGroup: (name: string | null) => void
}) {
  return (
    <div className={active ? 'bg-accent-muted' : undefined}>
      <div className="flex items-center gap-1 px-2 py-1">
        {editing && !compact ? (
          <input
            autoFocus
            value={editTitle}
            onChange={(e) => onEditTitle(e.target.value)}
            onBlur={onCommitEdit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') onCommitEdit()
              if (e.key === 'Escape') onCommitEdit()
            }}
            className="min-w-0 flex-1 rounded border border-border bg-canvas px-2 py-1 text-sm text-fg"
          />
        ) : (
          <Link
            to="/session/$id"
            params={{ id: session.id }}
            onClick={onSelect}
            className={`min-w-0 flex-1 truncate px-1 py-1 text-sm ${
              active ? 'text-accent' : 'text-fg'
            }`}
          >
            {session.title}
          </Link>
        )}
        {session.pinned && <Pin size={12} className="shrink-0 text-fg-muted" />}
        {!compact && (
          <span className="shrink-0 text-[10px] text-fg-muted">
            {formatRelativeTime(session.updatedAt)}
          </span>
        )}
      </div>
      {preview && !compact && (
        <p className="truncate px-3 pb-1 text-[11px] text-fg-subtle">{preview}</p>
      )}
      {!compact && (
        <div className="flex flex-wrap items-center gap-1 px-2 pb-2">
          <button type="button" title="Rename" onClick={onStartEdit} className="rounded p-1 text-fg-muted hover:bg-canvas-subtle">
            <Pencil size={12} />
          </button>
          <button type="button" title={session.pinned ? 'Unpin' : 'Pin'} onClick={onPin} className="rounded p-1 text-fg-muted hover:bg-canvas-subtle">
            <Pin size={12} />
          </button>
          <button type="button" title={session.archived ? 'Unarchive' : 'Archive'} onClick={onArchive} className="rounded p-1 text-fg-muted hover:bg-canvas-subtle">
            <Archive size={12} />
          </button>
          <button type="button" title="Delete" onClick={onDelete} className="rounded p-1 text-fg-muted hover:text-danger">
            <Trash2 size={12} />
          </button>
          <select
            value={session.profileId ?? ''}
            onChange={(e) => onProfile(e.target.value || null)}
            className="ml-auto max-w-[110px] rounded border border-border bg-canvas px-1 text-[10px] text-fg"
            title="Profile"
          >
            <option value="">No profile</option>
            {profiles.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <input
            type="text"
            defaultValue={session.groupName ?? ''}
            placeholder="Group"
            onBlur={(e) => {
              const v = e.target.value.trim()
              const next = v || null
              if (next !== session.groupName) onGroup(next)
            }}
            className="w-20 rounded border border-border bg-canvas px-1 text-[10px] text-fg"
          />
        </div>
      )}
    </div>
  )
}
