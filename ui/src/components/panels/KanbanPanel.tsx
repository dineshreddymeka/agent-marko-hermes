/**
 * Kanban board panel — columns by task status, backed by /api/kanban.
 * Layout follows Skills / Profiles density: header → toolbar → board.
 */
import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Archive, ChevronLeft, ChevronRight, Loader2, Plus, Trash2 } from 'lucide-react'
import { apiClient } from '@app/lib/api'
import { useUiStore } from '@app/stores/ui'
import { formatRelativeTime } from '@app/lib/utils'
import type {
  KanbanListResponse,
  KanbanStatusCounts,
  KanbanTask,
  KanbanTaskStatus,
} from '@hermes/shared'
import { EmptyState } from '@app/components/common/EmptyState'
import { Skeleton } from '@app/components/common/Skeleton'
import { kanbanTaskStatusLabel } from '@app/lib/labels'

const BOARD_COLUMNS: { status: KanbanTaskStatus; label: string }[] = [
  { status: 'triage', label: 'Triage' },
  { status: 'todo', label: 'Todo' },
  { status: 'ready', label: 'Ready' },
  { status: 'running', label: 'Running' },
  { status: 'blocked', label: 'Blocked' },
  { status: 'done', label: 'Done' },
]

const inputClass = 'w-full rounded border border-border bg-canvas px-2 py-1.5 text-sm text-fg'
const labelClass = 'block text-xs font-medium text-fg-muted'
const btnGhost =
  'inline-flex items-center gap-1 rounded border border-border px-2 py-1 text-xs text-fg hover:bg-canvas-subtle disabled:opacity-50'
const btnPrimary =
  'inline-flex items-center gap-1 rounded bg-accent px-2.5 py-1 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50'

/** Subtle Primer-style status accents (no purple / glow). */
function statusDotClass(status: KanbanTaskStatus): string {
  switch (status) {
    case 'running':
    case 'done':
      return 'bg-success'
    case 'blocked':
      return 'bg-attention'
    case 'ready':
    case 'todo':
      return 'bg-accent'
    case 'archived':
      return 'bg-fg-subtle'
    default:
      return 'bg-fg-muted'
  }
}

function adjacentStatus(
  status: KanbanTaskStatus,
  direction: -1 | 1,
  columns: { status: KanbanTaskStatus }[],
): KanbanTaskStatus | null {
  const idx = columns.findIndex((c) => c.status === status)
  if (idx < 0) return null
  const next = columns[idx + direction]
  return next?.status ?? null
}

export function KanbanPanel() {
  const addToast = useUiStore((s) => s.addToast)
  const queryClient = useQueryClient()
  const [showForm, setShowForm] = useState(false)
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [includeArchived, setIncludeArchived] = useState(false)

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['kanban-tasks', includeArchived],
    queryFn: () =>
      apiClient.get<KanbanListResponse>('/api/kanban/tasks', {
        includeArchived: includeArchived || undefined,
        limit: 200,
      }),
    retry: false,
  })

  const { data: counts } = useQuery({
    queryKey: ['kanban-status-counts'],
    queryFn: () => apiClient.get<KanbanStatusCounts>('/api/kanban/status-counts'),
    retry: false,
  })

  const invalidateBoard = () => {
    void queryClient.invalidateQueries({ queryKey: ['kanban-tasks'] })
    void queryClient.invalidateQueries({ queryKey: ['kanban-status-counts'] })
  }

  const create = useMutation({
    mutationFn: () =>
      apiClient.post<KanbanTask>('/api/kanban/tasks', {
        title: title.trim(),
        body: body.trim() || null,
        status: 'todo',
      }),
    onSuccess: () => {
      addToast({ title: 'Task created', variant: 'success' })
      setTitle('')
      setBody('')
      setShowForm(false)
      invalidateBoard()
    },
    onError: () => addToast({ title: 'Create failed', variant: 'danger' }),
  })

  const move = useMutation({
    mutationFn: ({ id, status }: { id: string; status: KanbanTaskStatus }) =>
      apiClient.post<KanbanTask>(`/api/kanban/tasks/${id}/move`, { status }),
    onSuccess: () => invalidateBoard(),
    onError: () => addToast({ title: 'Move failed', variant: 'danger' }),
  })

  const remove = useMutation({
    mutationFn: (id: string) => apiClient.delete(`/api/kanban/tasks/${id}`),
    onSuccess: () => {
      addToast({ title: 'Task deleted', variant: 'success' })
      invalidateBoard()
    },
    onError: () => addToast({ title: 'Delete failed', variant: 'danger' }),
  })

  const columns = useMemo(
    () =>
      includeArchived
        ? [...BOARD_COLUMNS, { status: 'archived' as const, label: 'Archived' }]
        : BOARD_COLUMNS,
    [includeArchived],
  )

  const tasksByStatus = useMemo(() => {
    const map = new Map<KanbanTaskStatus, KanbanTask[]>()
    for (const col of columns) map.set(col.status, [])
    for (const task of data?.tasks ?? []) {
      const list = map.get(task.status)
      if (list) list.push(task)
    }
    return map
  }, [data?.tasks, columns])

  const total = data?.total ?? 0
  const hasTasks = (data?.tasks.length ?? 0) > 0

  if (isLoading) {
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-7 w-24" />
        </div>
        <div className="flex gap-3 overflow-hidden">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-56 w-56 shrink-0 rounded-lg" />
          ))}
        </div>
      </div>
    )
  }

  if (isError) {
    return (
      <EmptyState
        title="Could not load board"
        description={error instanceof Error ? error.message : 'Server unreachable.'}
        action={
          <button type="button" onClick={() => void refetch()} className="text-xs text-accent">
            Retry
          </button>
        }
      />
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-sm font-medium text-fg">Board</h2>
          <p className="mt-0.5 text-xs text-fg-muted">
            Track work across triage → done.
            {total > 0 ? (
              <>
                {' '}
                {total.toLocaleString()} task{total === 1 ? '' : 's'}
              </>
            ) : null}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="inline-flex cursor-pointer items-center gap-1.5 text-xs text-fg-muted">
            <input
              type="checkbox"
              checked={includeArchived}
              onChange={(e) => setIncludeArchived(e.target.checked)}
              className="rounded border-border"
            />
            Show archived
          </label>
          <button
            type="button"
            onClick={() => setShowForm((v) => !v)}
            className={btnGhost}
            data-testid="kanban-new-task"
          >
            <Plus size={12} /> New task
          </button>
        </div>
      </div>

      {showForm && (
        <div className="space-y-2 rounded-lg border border-border bg-canvas-subtle p-3">
          <label className={labelClass}>
            Title
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="What needs doing?"
              className={`mt-1 ${inputClass}`}
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter' && title.trim() && !create.isPending) create.mutate()
                if (e.key === 'Escape') {
                  setShowForm(false)
                  setTitle('')
                  setBody('')
                }
              }}
            />
          </label>
          <label className={labelClass}>
            Notes
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={2}
              placeholder="Optional details"
              className={`mt-1 ${inputClass}`}
            />
          </label>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={!title.trim() || create.isPending}
              onClick={() => create.mutate()}
              className={btnPrimary}
            >
              {create.isPending ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}
              {create.isPending ? 'Creating…' : 'Create'}
            </button>
            <button
              type="button"
              onClick={() => {
                setShowForm(false)
                setTitle('')
                setBody('')
              }}
              className={btnGhost}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {!hasTasks && !showForm ? (
        <div
          className="flex items-start gap-2 rounded-md border border-border bg-canvas-subtle px-3 py-2.5"
          role="status"
        >
          <p className="flex-1 text-xs text-fg-muted">
            No tasks yet — create one to start tracking work across triage → done.
          </p>
          <button type="button" onClick={() => setShowForm(true)} className={btnPrimary}>
            <Plus size={12} /> New task
          </button>
        </div>
      ) : null}

      <div className="-mx-1 flex min-h-0 flex-1 gap-2.5 overflow-x-auto px-1 pb-1">
        {columns.map((col) => {
          const tasks = tasksByStatus.get(col.status) ?? []
          const count = counts?.[col.status] ?? tasks.length
          return (
            <section
              key={col.status}
              className="flex max-h-[calc(100vh-14rem)] w-[15.5rem] shrink-0 flex-col rounded-lg border border-border bg-canvas-subtle"
              aria-label={`${col.label} column`}
            >
              <header className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
                <div className="flex min-w-0 items-center gap-1.5">
                  <span
                    className={`h-1.5 w-1.5 shrink-0 rounded-full ${statusDotClass(col.status)}`}
                    aria-hidden
                  />
                  <h3 className="truncate text-xs font-medium text-fg">{col.label}</h3>
                </div>
                <span className="rounded bg-canvas-inset px-1.5 py-0.5 text-[10px] tabular-nums text-fg-muted">
                  {count}
                </span>
              </header>

              <ul className="flex min-h-[7rem] flex-1 flex-col gap-2 overflow-y-auto p-2">
                {tasks.length === 0 ? (
                  <li className="flex flex-1 items-center justify-center rounded border border-dashed border-border-muted px-2 py-6 text-[11px] text-fg-subtle">
                    No cards
                  </li>
                ) : (
                  tasks.map((task) => {
                    const prev = adjacentStatus(task.status, -1, columns)
                    const next = adjacentStatus(task.status, 1, columns)
                    const movingThis = move.isPending && move.variables?.id === task.id
                    return (
                      <li
                        key={task.id}
                        className="group rounded-md border border-border bg-canvas p-2.5 shadow-[var(--hermes-card-shadow)]"
                      >
                        <div className="mb-1.5 flex items-start justify-between gap-2">
                          <p className="min-w-0 flex-1 text-xs font-medium leading-snug text-fg">
                            {task.title}
                          </p>
                          <button
                            type="button"
                            title="Delete"
                            onClick={() => {
                              if (confirm(`Delete “${task.title}”?`)) remove.mutate(task.id)
                            }}
                            className="shrink-0 rounded p-0.5 text-fg-subtle opacity-0 transition-opacity hover:text-danger group-hover:opacity-100 focus:opacity-100"
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>

                        {task.body ? (
                          <p className="mb-2 line-clamp-2 text-[11px] leading-relaxed text-fg-muted">
                            {task.body}
                          </p>
                        ) : null}

                        {task.blockReason ? (
                          <p className="mb-2 rounded bg-[color-mix(in_srgb,var(--hermes-attention)_12%,transparent)] px-1.5 py-1 text-[10px] text-attention">
                            {task.blockReason}
                          </p>
                        ) : null}

                        {task.summary && task.status === 'done' ? (
                          <p className="mb-2 line-clamp-2 text-[11px] text-fg-subtle">{task.summary}</p>
                        ) : null}

                        <div className="flex items-center justify-between gap-1 border-t border-border-muted pt-1.5">
                          <div className="flex min-w-0 items-center gap-0.5">
                            <button
                              type="button"
                              title={prev ? `Move to ${kanbanTaskStatusLabel(prev)}` : undefined}
                              disabled={!prev || move.isPending}
                              onClick={() => prev && move.mutate({ id: task.id, status: prev })}
                              className="rounded p-0.5 text-fg-muted hover:bg-canvas-inset hover:text-fg disabled:opacity-30"
                            >
                              <ChevronLeft size={14} />
                            </button>
                            <select
                              value={task.status}
                              onChange={(e) =>
                                move.mutate({
                                  id: task.id,
                                  status: e.target.value as KanbanTaskStatus,
                                })
                              }
                              disabled={move.isPending}
                              className="max-w-[5.75rem] cursor-pointer truncate rounded border-0 bg-canvas-inset px-1.5 py-0.5 text-[10px] font-medium text-fg-muted outline-none hover:text-fg focus:ring-1 focus:ring-accent"
                              aria-label={`Move ${task.title}`}
                              title={kanbanTaskStatusLabel(task.status)}
                            >
                              {(
                                [
                                  'triage',
                                  'todo',
                                  'ready',
                                  'running',
                                  'blocked',
                                  'done',
                                  'archived',
                                ] as KanbanTaskStatus[]
                              ).map((s) => (
                                <option key={s} value={s}>
                                  {kanbanTaskStatusLabel(s)}
                                </option>
                              ))}
                            </select>
                            <button
                              type="button"
                              title={next ? `Move to ${kanbanTaskStatusLabel(next)}` : undefined}
                              disabled={!next || move.isPending}
                              onClick={() => next && move.mutate({ id: task.id, status: next })}
                              className="rounded p-0.5 text-fg-muted hover:bg-canvas-inset hover:text-fg disabled:opacity-30"
                            >
                              <ChevronRight size={14} />
                            </button>
                            {task.status !== 'archived' ? (
                              <button
                                type="button"
                                title="Archive"
                                disabled={move.isPending}
                                onClick={() => move.mutate({ id: task.id, status: 'archived' })}
                                className="ml-0.5 rounded p-0.5 text-fg-subtle opacity-0 hover:text-fg group-hover:opacity-100 focus:opacity-100"
                              >
                                <Archive size={12} />
                              </button>
                            ) : null}
                            {movingThis ? (
                              <Loader2 size={12} className="ml-0.5 animate-spin text-fg-muted" />
                            ) : null}
                          </div>
                          <span className="shrink-0 text-[10px] text-fg-subtle">
                            {formatRelativeTime(task.updatedAt)}
                          </span>
                        </div>
                      </li>
                    )
                  })
                )}
              </ul>
            </section>
          )
        })}
      </div>
    </div>
  )
}
