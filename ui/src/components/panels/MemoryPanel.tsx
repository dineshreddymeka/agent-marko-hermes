import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Pencil, Search, Trash2 } from 'lucide-react'
import { apiClient } from '@app/lib/api'
import { useUiStore } from '@app/stores/ui'
import { sortMemoriesByImportance } from '@app/lib/panels'
import type { MemoryEntry, SearchResult } from '@hermes/shared'
import { EmptyState } from '@app/components/common/EmptyState'
import { Skeleton } from '@app/components/common/Skeleton'
import { memoryKindLabel } from '@app/lib/labels'

export function MemoryPanel() {
  const addToast = useUiStore((s) => s.addToast)
  const queryClient = useQueryClient()
  const [kind, setKind] = useState<string>('all')
  const [query, setQuery] = useState('')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const [editing, setEditing] = useState<MemoryEntry | null>(null)
  const [editContent, setEditContent] = useState('')
  const [editImportance, setEditImportance] = useState(0.5)

  const { data: entries, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['memory', kind],
    queryFn: () =>
      apiClient.get<MemoryEntry[]>('/api/memory', kind !== 'all' ? { kind } : undefined),
    retry: false,
  })

  const { data: searchPayload, isFetching: searching } = useQuery({
    queryKey: ['memory-search', query],
    queryFn: () =>
      apiClient.get<{ results: SearchResult[] }>('/api/search', { q: query, type: 'memory' }),
    enabled: query.length > 2,
    retry: false,
  })

  const list = useMemo(() => {
    if (query.length > 2 && searchPayload?.results) {
      const byId = new Map((entries ?? []).map((e) => [e.id, e]))
      const fromSearch: MemoryEntry[] = searchPayload.results.map((r) => {
        const existing = byId.get(r.id)
        if (existing) return existing
        return {
          id: r.id,
          kind: 'semantic',
          content: r.snippet,
          sourceSession: null,
          importance: r.score ?? 0.5,
          createdAt: new Date().toISOString(),
          lastAccessed: new Date().toISOString(),
        }
      })
      return sortMemoriesByImportance(fromSearch, sortDir)
    }
    return sortMemoriesByImportance(entries ?? [], sortDir)
  }, [entries, query, searchPayload, sortDir])

  const save = useMutation({
    mutationFn: () =>
      apiClient.patch<MemoryEntry>(`/api/memory/${editing!.id}`, {
        content: editContent,
        importance: editImportance,
      }),
    onSuccess: () => {
      addToast({ title: 'Memory updated', variant: 'success' })
      setEditing(null)
      void queryClient.invalidateQueries({ queryKey: ['memory'] })
    },
    onError: () => addToast({ title: 'Update failed', variant: 'danger' }),
  })

  const remove = useMutation({
    mutationFn: (id: string) => apiClient.delete(`/api/memory/${id}`),
    onSuccess: () => {
      addToast({ title: 'Memory deleted', variant: 'success' })
      void queryClient.invalidateQueries({ queryKey: ['memory'] })
    },
    onError: () => addToast({ title: 'Delete failed', variant: 'danger' }),
  })

  return (
    <div className="p-4">
      <h2 className="mb-4 text-sm font-medium text-fg">Memory</h2>
      <div className="mb-4 flex flex-wrap gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search size={14} className="absolute left-2 top-2.5 text-fg-muted" />
          <input
            type="text"
            placeholder="What does Open Jarvis know about…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full rounded border border-border bg-canvas py-1.5 pl-7 pr-2 text-sm text-fg"
          />
        </div>
        <select
          value={kind}
          onChange={(e) => setKind(e.target.value)}
          className="rounded border border-border bg-canvas px-2 text-sm text-fg"
        >
          <option value="all">All kinds</option>
          <option value="semantic">Semantic</option>
          <option value="episodic">Episodic</option>
          <option value="preference">Preference</option>
        </select>
        <select
          value={sortDir}
          onChange={(e) => setSortDir(e.target.value as 'asc' | 'desc')}
          className="rounded border border-border bg-canvas px-2 text-sm text-fg"
        >
          <option value="desc">Importance ↓</option>
          <option value="asc">Importance ↑</option>
        </select>
      </div>

      {editing && (
        <div className="mb-4 space-y-2 rounded-lg border border-border p-3">
          <textarea
            value={editContent}
            onChange={(e) => setEditContent(e.target.value)}
            rows={4}
            className="w-full rounded border border-border bg-canvas p-2 text-sm text-fg"
          />
          <label className="flex items-center gap-2 text-xs text-fg-muted">
            Importance
            <input
              type="range"
              min={0}
              max={1}
              step={0.1}
              value={editImportance}
              onChange={(e) => setEditImportance(Number(e.target.value))}
            />
            {editImportance.toFixed(1)}
          </label>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => save.mutate()}
              className="rounded bg-accent px-3 py-1 text-xs text-white"
            >
              Save
            </button>
            <button type="button" onClick={() => setEditing(null)} className="text-xs text-fg-muted">
              Cancel
            </button>
          </div>
        </div>
      )}

      {isLoading ? (
        <Skeleton className="h-20 w-full" />
      ) : isError ? (
        <EmptyState
          title="Could not load memory"
          description={error instanceof Error ? error.message : 'Server unreachable.'}
          action={
            <button type="button" onClick={() => void refetch()} className="text-xs text-accent">
              Retry
            </button>
          }
        />
      ) : !list.length ? (
        <EmptyState
          title={query.length > 2 ? 'No matches' : 'No memories'}
          description={
            query.length > 2
              ? 'Open Jarvis found nothing for that query.'
              : "Open Jarvis hasn't stored any memories yet."
          }
        />
      ) : (
        <ul className="space-y-2">
          {searching && query.length > 2 && (
            <li className="text-xs text-fg-muted">Searching…</li>
          )}
          {list.map((entry) => (
            <li key={entry.id} className="rounded-lg border border-border p-3 text-sm">
              <div className="mb-1 flex items-center gap-2">
                <span
                  className="rounded bg-accent-muted px-1.5 py-0.5 text-[10px] text-accent"
                  title={entry.kind}
                >
                  {memoryKindLabel(entry.kind)}
                </span>
                <span className="text-xs text-fg-muted">
                  importance: {entry.importance.toFixed(1)}
                </span>
                <button
                  type="button"
                  className="ml-auto rounded p-1 text-fg-muted hover:bg-canvas-subtle"
                  onClick={() => {
                    setEditing(entry)
                    setEditContent(entry.content)
                    setEditImportance(entry.importance)
                  }}
                >
                  <Pencil size={12} />
                </button>
                <button
                  type="button"
                  className="rounded p-1 text-fg-muted hover:text-danger"
                  onClick={() => {
                    if (confirm('Delete this memory?')) remove.mutate(entry.id)
                  }}
                >
                  <Trash2 size={12} />
                </button>
              </div>
              <p className="text-fg">{entry.content}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
