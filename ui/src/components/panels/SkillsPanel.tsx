/**
 * Open Jarvis — Skills panel (enterprise library UX).
 * Author: Dinesh Reddy Meka
 *
 * Density pattern: Connections / Scheduled Tasks — header → meta → toolbar →
 * list/cards → detail editor. Register writes SKILL.md under SKILLS_DIR + DB +
 * embedding; Sync rescans disk and auto-recreates missing DB rows.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Download,
  FileWarning,
  FolderSync,
  HelpCircle,
  Loader2,
  Plus,
  Power,
  RefreshCw,
  Search,
  Trash2,
  X,
} from 'lucide-react'
import { apiClient } from '@app/lib/api'
import { useUiStore } from '@app/stores/ui'
import type { Skill, SkillsMeta, SkillsSyncResult } from '@hermes/shared'
import { EmptyState } from '@app/components/common/EmptyState'
import { Skeleton } from '@app/components/common/Skeleton'
import { copyToClipboard, formatRelativeTime } from '@app/lib/utils'
import { skillSourceLabel, skillStatusLabel } from '@app/lib/labels'
import {
  defaultSkillBody,
  filterSkills,
  skillStatusKind,
  type SkillSourceFilter,
  type SkillStatusFilter,
} from '@app/lib/panels/skills-helpers'

const inputClass = 'w-full rounded border border-border bg-canvas px-2 py-1.5 text-sm text-fg'
const btnGhost =
  'inline-flex items-center gap-1 rounded border border-border px-2 py-1 text-xs text-fg hover:bg-canvas-subtle disabled:opacity-50'
const btnPrimary =
  'inline-flex items-center gap-1 rounded bg-accent px-2.5 py-1 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50'

type SourceFilter = SkillSourceFilter
type StatusFilter = SkillStatusFilter

function StatusBadge({ skill }: { skill: Skill }) {
  const kind = skillStatusKind(skill)
  const styles =
    kind === 'ready'
      ? 'bg-[color-mix(in_srgb,var(--hermes-success)_18%,transparent)] text-success'
      : kind === 'missing'
        ? 'bg-[color-mix(in_srgb,var(--hermes-attention)_18%,transparent)] text-attention'
        : 'bg-canvas-subtle text-fg-muted'
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${styles}`}>
      <span
        className={`h-1.5 w-1.5 rounded-full ${
          kind === 'ready' ? 'bg-success' : kind === 'missing' ? 'bg-attention' : 'bg-fg-subtle'
        }`}
      />
      {skillStatusLabel(kind)}
    </span>
  )
}

function SourceBadge({ source }: { source: string }) {
  return (
    <span
      className="rounded bg-canvas-inset px-1.5 py-0.5 text-[10px] text-fg-muted"
      title={source}
    >
      {skillSourceLabel(source)}
    </span>
  )
}

export function SkillsPanel() {
  const addToast = useUiStore((s) => s.addToast)
  const queryClient = useQueryClient()
  const [query, setQuery] = useState('')
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>('all')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [gitUrl, setGitUrl] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [showHelp, setShowHelp] = useState(false)
  const [newName, setNewName] = useState('')
  const [newDescription, setNewDescription] = useState('')
  const [newBody, setNewBody] = useState(defaultSkillBody())

  const { data: skills, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['skills'],
    queryFn: () => apiClient.get<Skill[]>('/api/skills'),
    retry: false,
  })

  const { data: meta, refetch: refetchMeta } = useQuery({
    queryKey: ['skills-meta'],
    queryFn: () => apiClient.get<SkillsMeta>('/api/skills/meta'),
    retry: false,
  })

  const { data: sources } = useQuery({
    queryKey: ['skill-sources'],
    queryFn: () => apiClient.get<{ sources: string[] }>('/api/skills/sources'),
    retry: false,
  })

  const sync = useMutation({
    mutationFn: async (_opts?: { quiet?: boolean }) =>
      apiClient.post<SkillsSyncResult>('/api/skills/sync'),
    onSuccess: (res, vars) => {
      if (!vars?.quiet) {
        addToast({
          title: `Synced ${res.synced} skills`,
          description: `${res.created} new · ${res.updated} updated · ${res.missing} missing`,
          variant: 'success',
        })
      }
      void queryClient.invalidateQueries({ queryKey: ['skills'] })
      void queryClient.invalidateQueries({ queryKey: ['skills-meta'] })
    },
    onError: () => addToast({ title: 'Sync failed', variant: 'danger' }),
  })

  // Auto-sync on panel open when never synced or stale (>1h)
  const autoSyncedRef = useRef(false)
  useEffect(() => {
    if (autoSyncedRef.current || meta === undefined) return
    const last = meta?.lastSyncedAt ? Date.parse(meta.lastSyncedAt) : 0
    const stale = !last || Date.now() - last > 60 * 60 * 1000
    if (stale) {
      autoSyncedRef.current = true
      sync.mutate({ quiet: true })
    }
  }, [meta, sync])

  const selected = skills?.find((s) => s.id === selectedId) ?? null

  const list = useMemo(
    () =>
      filterSkills(skills ?? [], {
        query,
        source: sourceFilter,
        status: statusFilter,
      }),
    [skills, query, sourceFilter, statusFilter],
  )

  const save = useMutation({
    mutationFn: () => apiClient.patch<Skill>(`/api/skills/${selectedId}`, { bodyMd: draft }),
    onSuccess: (skill) => {
      addToast({ title: 'Skill saved', variant: 'success' })
      setDraft(skill.bodyMd)
      void queryClient.invalidateQueries({ queryKey: ['skills'] })
    },
    onError: () => addToast({ title: 'Save failed', variant: 'danger' }),
  })

  const create = useMutation({
    mutationFn: () =>
      apiClient.post<Skill>('/api/skills', {
        name: newName.trim(),
        description: newDescription.trim() || null,
        bodyMd: newBody.replace(/^---\nname:.*$/m, `---\nname: ${newName.trim()}`),
        source: 'user-folder',
      }),
    onSuccess: (skill) => {
      addToast({ title: 'Skill registered', description: 'Written to SKILLS_DIR + indexed', variant: 'success' })
      setShowCreate(false)
      setNewName('')
      setNewDescription('')
      setNewBody(defaultSkillBody())
      setSelectedId(skill.id)
      setDraft(skill.bodyMd)
      void queryClient.invalidateQueries({ queryKey: ['skills'] })
      void queryClient.invalidateQueries({ queryKey: ['skills-meta'] })
    },
    onError: () => addToast({ title: 'Create failed', variant: 'danger' }),
  })

  const remove = useMutation({
    mutationFn: (id: string) => apiClient.delete(`/api/skills/${id}`),
    onSuccess: () => {
      addToast({ title: 'Skill deleted', variant: 'success' })
      setSelectedId(null)
      void queryClient.invalidateQueries({ queryKey: ['skills'] })
      void refetchMeta()
    },
    onError: () => addToast({ title: 'Delete failed', variant: 'danger' }),
  })

  const toggleEnabled = useMutation({
    mutationFn: (skill: Skill) =>
      apiClient.patch<Skill>(`/api/skills/${skill.id}`, { enabled: !skill.enabled }),
    onSuccess: (skill) => {
      addToast({
        title: skill.enabled ? 'Skill enabled' : 'Skill disabled',
        variant: 'success',
      })
      void queryClient.invalidateQueries({ queryKey: ['skills'] })
    },
    onError: () => addToast({ title: 'Update failed', variant: 'danger' }),
  })

  const recreate = useMutation({
    mutationFn: (id: string) =>
      apiClient.post<{ skill: Skill; path: string }>(`/api/skills/${id}/recreate`),
    onSuccess: (res) => {
      addToast({ title: 'Recreated on disk', description: res.path, variant: 'success' })
      if (res.skill) {
        setSelectedId(res.skill.id)
        setDraft(res.skill.bodyMd)
      }
      void queryClient.invalidateQueries({ queryKey: ['skills'] })
    },
    onError: () => addToast({ title: 'Recreate failed', variant: 'danger' }),
  })

  const addSource = useMutation({
    mutationFn: () => apiClient.post('/api/skills/sources', { url: gitUrl }),
    onSuccess: () => {
      setGitUrl('')
      addToast({ title: 'Git source added', variant: 'success' })
      void queryClient.invalidateQueries({ queryKey: ['skill-sources'] })
    },
    onError: () => addToast({ title: 'Could not add source', variant: 'danger' }),
  })

  if (isLoading) {
    return (
      <div className="space-y-2 p-4">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
      </div>
    )
  }

  if (isError) {
    return (
      <EmptyState
        title="Could not load skills"
        description={error instanceof Error ? error.message : 'Server unreachable.'}
        action={
          <button type="button" onClick={() => void refetch()} className="text-xs text-accent">
            Retry
          </button>
        }
      />
    )
  }

  const dirty = selected ? draft !== selected.bodyMd : false

  return (
    <div className="flex h-full flex-col gap-3 p-4">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-sm font-medium text-fg">Skills</h2>
          <p className="mt-0.5 text-xs text-fg-muted">
            SKILL.md library — register writes disk + DB; sync auto-recreates missing rows.
            {meta?.lastSyncedAt ? (
              <>
                {' '}
                Last sync {formatRelativeTime(meta.lastSyncedAt)}
                {meta.missing > 0 ? ` · ${meta.missing} missing on disk` : ''}
              </>
            ) : null}
          </p>
        </div>
        <div className="flex flex-wrap gap-1">
          <button type="button" className={btnGhost} onClick={() => setShowHelp((v) => !v)} title="Help">
            <HelpCircle size={12} /> Help
          </button>
          <button
            type="button"
            className={btnGhost}
            onClick={() => setShowCreate(true)}
            data-testid="skills-create"
          >
            <Plus size={12} /> Create skill
          </button>
          <button
            type="button"
            className={btnGhost}
            disabled={sync.isPending}
            onClick={() => sync.mutate({})}
            data-testid="skills-sync"
          >
            {sync.isPending ? <Loader2 size={12} className="animate-spin" /> : <FolderSync size={12} />}
            Sync from folder
          </button>
        </div>
      </div>

      {showHelp && (
        <div className="rounded-lg border border-border bg-canvas-subtle p-3 text-xs text-fg-muted">
          <div className="mb-1 flex items-center justify-between">
            <p className="font-medium text-fg">Register &amp; sync</p>
            <button type="button" onClick={() => setShowHelp(false)} className="text-fg-subtle">
              <X size={12} />
            </button>
          </div>
          <ul className="list-inside list-disc space-y-1">
            <li>
              <strong className="text-fg">Create</strong> registers a skill: writes{' '}
              <code className="text-[10px]">SKILLS_DIR/&lt;slug&gt;/SKILL.md</code>, upserts the DB
              row, and queues an embedding for retrieval.
            </li>
            <li>
              <strong className="text-fg">Sync from folder</strong> scans{' '}
              <code className="text-[10px]">{meta?.skillsDir ?? 'SKILLS_DIR'}</code>, upserts by
              path/slug, re-embeds when content changes, and marks orphans missing.
            </li>
            <li>
              Boot auto-sync recreates DB rows for disk-only skills. Use{' '}
              <strong className="text-fg">Recreate on disk</strong> when a DB row has no file.
            </li>
            <li>
              Point at legacy Hermes skills:{' '}
              <code className="text-[10px]">SKILLS_DIR=%LOCALAPPDATA%/hermes/skills</code> in{' '}
              <code className="text-[10px]">.env</code>, then Sync.
            </li>
          </ul>
        </div>
      )}

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[12rem] flex-1">
          <Search size={14} className="absolute left-2 top-2.5 text-fg-muted" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name, description, slug…"
            className={`${inputClass} pl-7`}
            data-testid="skills-search"
          />
        </div>
        <select
          value={sourceFilter}
          onChange={(e) => setSourceFilter(e.target.value as SourceFilter)}
          className="rounded border border-border bg-canvas px-2 py-1.5 text-xs text-fg"
          aria-label="Filter by source"
        >
          <option value="all">All sources</option>
          <option value="builtin">Built-in</option>
          <option value="user-folder">User folder</option>
          <option value="git">Git</option>
          <option value="learned">Learned</option>
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
          className="rounded border border-border bg-canvas px-2 py-1.5 text-xs text-fg"
          aria-label="Filter by status"
        >
          <option value="all">All statuses</option>
          <option value="enabled">Ready</option>
          <option value="disabled">Disabled</option>
          <option value="missing">Missing on disk</option>
        </select>
      </div>

      {/* Git sources (compact) */}
      <div className="flex flex-wrap items-center gap-2 rounded border border-border px-2 py-1.5">
        <span className="text-[10px] font-medium uppercase text-fg-muted">Git sources</span>
        <input
          value={gitUrl}
          onChange={(e) => setGitUrl(e.target.value)}
          placeholder="https://github.com/…/skills"
          className="min-w-0 flex-1 rounded border border-border bg-canvas px-2 py-1 text-xs"
        />
        <button type="button" className={btnGhost} onClick={() => addSource.mutate()} disabled={!gitUrl.trim()}>
          Add
        </button>
        {(sources?.sources ?? []).map((url) => (
          <span key={url} className="truncate font-mono text-[10px] text-fg-subtle" title={url}>
            {url}
          </span>
        ))}
      </div>

      {showCreate && (
        <div className="space-y-2 rounded-lg border border-accent/40 bg-accent-muted/30 p-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-fg">Create skill</p>
            <button type="button" onClick={() => setShowCreate(false)}>
              <X size={14} className="text-fg-muted" />
            </button>
          </div>
          <input
            value={newName}
            onChange={(e) => {
              setNewName(e.target.value)
              setNewBody((b) => b.replace(/^---\nname:.*$/m, `---\nname: ${e.target.value || 'my-skill'}`))
            }}
            placeholder="Skill name (becomes folder slug)"
            className={inputClass}
          />
          <input
            value={newDescription}
            onChange={(e) => setNewDescription(e.target.value)}
            placeholder="Short description"
            className={inputClass}
          />
          <textarea
            value={newBody}
            onChange={(e) => setNewBody(e.target.value)}
            rows={6}
            className={`${inputClass} font-mono text-xs`}
          />
          <button
            type="button"
            disabled={!newName.trim() || create.isPending}
            onClick={() => create.mutate()}
            className={btnPrimary}
          >
            {create.isPending ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}
            Register skill
          </button>
        </div>
      )}

      <div className="flex min-h-0 flex-1 flex-col gap-3 md:flex-row">
        {/* List */}
        <div className="flex w-full flex-col md:w-96">
          {!list.length ? (
            <EmptyState
              title="No skills yet"
              description="Create a skill, drop SKILL.md folders into SKILLS_DIR, or sync from disk."
              className="py-8"
              action={
                <div className="flex gap-2">
                  <button type="button" className={btnPrimary} onClick={() => setShowCreate(true)}>
                    Create skill
                  </button>
                  <button type="button" className={btnGhost} onClick={() => sync.mutate({})}>
                    Sync from folder
                  </button>
                </div>
              }
            />
          ) : (
            <ul className="min-h-0 flex-1 space-y-2 overflow-y-auto" data-testid="skills-list">
              {list.map((skill) => (
                <li key={skill.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedId(skill.id)
                      setDraft(skill.bodyMd)
                    }}
                    className={`w-full rounded-lg border p-3 text-left transition-colors ${
                      selectedId === skill.id
                        ? 'border-accent bg-accent-muted'
                        : skill.missingOnDisk
                          ? 'border-attention/40 bg-attention/5'
                          : skill.source === 'learned'
                            ? 'border-attention/30 bg-attention/5'
                            : 'border-border hover:bg-canvas-subtle'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <h3 className="truncate text-sm font-medium text-fg">{skill.name}</h3>
                        <p className="mt-0.5 line-clamp-2 text-xs text-fg-muted">
                          {skill.description || 'No description'}
                        </p>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1">
                        <SourceBadge source={skill.source} />
                        <StatusBadge skill={skill} />
                      </div>
                    </div>
                    <p className="mt-2 text-[11px] text-fg-subtle">
                      {skill.lastSyncedAt
                        ? `Synced ${formatRelativeTime(skill.lastSyncedAt)}`
                        : `Updated ${formatRelativeTime(skill.updatedAt)}`}
                      {skill.usageCount > 0 ? ` · ${skill.usageCount} uses` : ''}
                    </p>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Detail */}
        <div className="min-h-0 flex-1 rounded-lg border border-border p-3">
          {selected ? (
            <>
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <div className="min-w-0 flex-1">
                  <h3 className="truncate text-sm font-medium text-fg">{selected.name}</h3>
                  <p className="truncate font-mono text-[10px] text-fg-subtle" title={selected.path ?? undefined}>
                    {selected.slug}
                    {selected.path ? ` · ${selected.path}` : ''}
                  </p>
                </div>
                <StatusBadge skill={selected} />
                <SourceBadge source={selected.source} />
                {selected.missingOnDisk && (
                  <button
                    type="button"
                    className={btnGhost}
                    onClick={() => recreate.mutate(selected.id)}
                    disabled={recreate.isPending}
                  >
                    <FileWarning size={12} /> Recreate on disk
                  </button>
                )}
                <button
                  type="button"
                  className={btnGhost}
                  title={selected.enabled ? 'Disable' : 'Enable'}
                  onClick={() => toggleEnabled.mutate(selected)}
                >
                  <Power size={12} />
                  {selected.enabled ? 'Disable' : 'Enable'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    void copyToClipboard(draft)
                    addToast({ title: 'Copied to clipboard', variant: 'success' })
                  }}
                  className={btnGhost}
                  title="Export"
                >
                  <Download size={12} />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (confirm(`Delete skill “${selected.name}”?`)) remove.mutate(selected.id)
                  }}
                  className="rounded p-1 text-fg-muted hover:text-danger"
                >
                  <Trash2 size={14} />
                </button>
                <button
                  type="button"
                  disabled={!dirty || save.isPending}
                  onClick={() => save.mutate()}
                  className={btnPrimary}
                >
                  {save.isPending ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
                  Save
                </button>
              </div>
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                className="h-[min(60vh,520px)] w-full rounded border border-border bg-canvas p-2 font-mono text-xs text-fg"
                spellCheck={false}
              />
            </>
          ) : (
            <EmptyState
              title="Select a skill"
              description="Edit SKILL.md body here. Saves write back to disk and re-queue embeddings."
            />
          )}
        </div>
      </div>
    </div>
  )
}
