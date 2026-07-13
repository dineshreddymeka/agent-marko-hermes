/**
 * Open Jarvis — Skills panel (enterprise library UX).
 * Author: Dinesh Reddy Meka
 *
 * Wired to Hermes FastAPI: GET /api/skills, PUT /api/skills/toggle,
 * GET/PUT /api/skills/content, POST /api/skills, and hub routes.
 */
import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Download,
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
import { useUiStore } from '@app/stores/ui'
import type { Skill } from '@hermes/shared'
import { EmptyState } from '@app/components/common/EmptyState'
import { Skeleton } from '@app/components/common/Skeleton'
import { copyToClipboard, formatRelativeTime } from '@app/lib/utils'
import { skillSourceLabel, skillStatusLabel } from '@app/lib/labels'
import {
  createHermesSkill,
  deleteHermesSkill,
  fetchHermesSkillContent,
  fetchHermesSkills,
  fetchHermesSkillsMeta,
  getHermesSkillHubSources,
  installHermesSkillFromHub,
  isHubInstalledSkill,
  saveHermesSkillContent,
  searchHermesSkillsHub,
  syncHermesSkills,
  toggleHermesSkill,
  uninstallHermesHubSkill,
  updateHermesSkillsHub,
  type HermesSkillHubResult,
} from '@app/lib/hermes-skills'
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
  const [savedDraft, setSavedDraft] = useState('')
  const [contentLoading, setContentLoading] = useState(false)
  const [showCreate, setShowCreate] = useState(false)
  const [showHelp, setShowHelp] = useState(false)
  const [showHub, setShowHub] = useState(false)
  const [newName, setNewName] = useState('')
  const [newDescription, setNewDescription] = useState('')
  const [newBody, setNewBody] = useState(defaultSkillBody())
  const [hubQuery, setHubQuery] = useState('')
  const [hubSource, setHubSource] = useState('all')
  const [hubResults, setHubResults] = useState<HermesSkillHubResult[]>([])

  const { data: skills, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['skills'],
    queryFn: fetchHermesSkills,
    retry: false,
  })

  const { data: meta, refetch: refetchMeta } = useQuery({
    queryKey: ['skills-meta'],
    queryFn: fetchHermesSkillsMeta,
    retry: false,
  })

  const sync = useMutation({
    mutationFn: async (_opts?: { quiet?: boolean }) => syncHermesSkills(),
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

  const { data: hubSources } = useQuery({
    queryKey: ['skill-hub-sources'],
    queryFn: getHermesSkillHubSources,
    retry: false,
    enabled: showHub,
  })

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

  const enabledCount = skills?.filter((s) => s.enabled).length ?? 0

  useEffect(() => {
    if (!selected) {
      setDraft('')
      setSavedDraft('')
      return
    }
    let cancelled = false
    setContentLoading(true)
    fetchHermesSkillContent(selected.name)
      .then((res) => {
        if (cancelled) return
        setDraft(res.content)
        setSavedDraft(res.content)
      })
      .catch(() => {
        if (!cancelled) addToast({ title: 'Could not load SKILL.md', variant: 'danger' })
      })
      .finally(() => {
        if (!cancelled) setContentLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [selected, addToast])

  const save = useMutation({
    mutationFn: () => saveHermesSkillContent(selected!.name, draft),
    onSuccess: (skill) => {
      addToast({ title: 'Skill saved', variant: 'success' })
      setSavedDraft(skill.bodyMd)
      void queryClient.invalidateQueries({ queryKey: ['skills'] })
    },
    onError: () => addToast({ title: 'Save failed', variant: 'danger' }),
  })

  const create = useMutation({
    mutationFn: () => {
      const name = newName.trim()
      const content = newBody.replace(/^---\nname:.*$/m, `---\nname: ${name}`)
      if (newDescription.trim()) {
        const withDesc = content.replace(
          /^---\nname:.*\ndescription:.*$/m,
          `---\nname: ${name}\ndescription: ${newDescription.trim()}`,
        )
        return createHermesSkill(name, withDesc)
      }
      return createHermesSkill(name, content)
    },
    onSuccess: (skill) => {
      addToast({ title: 'Skill created', description: skill.name, variant: 'success' })
      setShowCreate(false)
      setNewName('')
      setNewDescription('')
      setNewBody(defaultSkillBody())
      setSelectedId(skill.id)
      void queryClient.invalidateQueries({ queryKey: ['skills'] })
      void queryClient.invalidateQueries({ queryKey: ['skills-meta'] })
    },
    onError: () => addToast({ title: 'Create failed', variant: 'danger' }),
  })

  const remove = useMutation({
    mutationFn: (skill: Skill) =>
      isHubInstalledSkill(skill)
        ? uninstallHermesHubSkill(skill.name)
        : deleteHermesSkill(skill.id),
    onSuccess: () => {
      addToast({ title: 'Skill removed', variant: 'success' })
      setSelectedId(null)
      void queryClient.invalidateQueries({ queryKey: ['skills'] })
      void refetchMeta()
    },
    onError: () => addToast({ title: 'Delete failed', variant: 'danger' }),
  })

  const toggleEnabled = useMutation({
    mutationFn: (skill: Skill) => toggleHermesSkill(skill.name, !skill.enabled),
    onSuccess: (_res, skill) => {
      addToast({
        title: skill.enabled ? 'Skill disabled' : 'Skill enabled',
        variant: 'success',
      })
      void queryClient.invalidateQueries({ queryKey: ['skills'] })
    },
    onError: () => addToast({ title: 'Update failed', variant: 'danger' }),
  })

  const hubSearch = useMutation({
    mutationFn: () => searchHermesSkillsHub(hubQuery.trim(), hubSource),
    onSuccess: (res) => setHubResults(res.results),
    onError: () => addToast({ title: 'Hub search failed', variant: 'danger' }),
  })

  const hubInstall = useMutation({
    mutationFn: (identifier: string) => installHermesSkillFromHub(identifier),
    onSuccess: (res) => {
      addToast({
        title: 'Installing skill',
        description: res.name,
        variant: 'success',
      })
      void queryClient.invalidateQueries({ queryKey: ['skills'] })
    },
    onError: () => addToast({ title: 'Install failed', variant: 'danger' }),
  })

  const hubUpdate = useMutation({
    mutationFn: () => updateHermesSkillsHub(),
    onSuccess: (res) => {
      addToast({ title: 'Updating hub skills', description: res.name, variant: 'success' })
      void queryClient.invalidateQueries({ queryKey: ['skills'] })
    },
    onError: () => addToast({ title: 'Update failed', variant: 'danger' }),
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

  const dirty = selected ? draft !== savedDraft && !contentLoading : false

  return (
    <div className="flex h-full flex-col gap-3 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-sm font-medium text-fg">Skills</h2>
          <p className="mt-0.5 text-xs text-fg-muted">
            DB-backed SKILL.md registry — {enabledCount} of {skills?.length ?? 0} enabled.
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
            onClick={() => setShowHub((v) => !v)}
            data-testid="skills-hub"
          >
            <Search size={12} /> Browse hub
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
            Sync to DB
          </button>
          <button
            type="button"
            className={btnGhost}
            disabled={hubUpdate.isPending}
            onClick={() => hubUpdate.mutate()}
            data-testid="skills-hub-update"
          >
            {hubUpdate.isPending ? <Loader2 size={12} className="animate-spin" /> : <FolderSync size={12} />}
            Update hub
          </button>
        </div>
      </div>

      {showHelp && (
        <div className="rounded-lg border border-border bg-canvas-subtle p-3 text-xs text-fg-muted">
          <div className="mb-1 flex items-center justify-between">
            <p className="font-medium text-fg">Hermes skills</p>
            <button type="button" onClick={() => setShowHelp(false)} className="text-fg-subtle">
              <X size={12} />
            </button>
          </div>
          <ul className="list-inside list-disc space-y-1">
            <li>
              <strong className="text-fg">Create</strong> writes a new SKILL.md under your Hermes
              profile via <code className="text-[10px]">POST /api/skills</code>.
            </li>
            <li>
              <strong className="text-fg">Enable/disable</strong> toggles config via{' '}
              <code className="text-[10px]">PUT /api/skills/toggle</code>.
            </li>
            <li>
              <strong className="text-fg">Browse hub</strong> searches and installs from the skills
              hub (<code className="text-[10px]">/api/skills/hub/*</code>).
            </li>
            <li>Built-in skills ship with Hermes; hub skills can be uninstalled from the panel.</li>
          </ul>
        </div>
      )}

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
          <option value="git">Hub / Git</option>
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

      {showHub && (
        <div className="space-y-2 rounded-lg border border-border p-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[10px] font-medium uppercase text-fg-muted">Skills hub</span>
            <input
              value={hubQuery}
              onChange={(e) => setHubQuery(e.target.value)}
              placeholder="Search hub…"
              className="min-w-0 flex-1 rounded border border-border bg-canvas px-2 py-1 text-xs"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && hubQuery.trim()) hubSearch.mutate()
              }}
            />
            <select
              value={hubSource}
              onChange={(e) => setHubSource(e.target.value)}
              className="rounded border border-border bg-canvas px-2 py-1 text-xs text-fg"
            >
              <option value="all">All sources</option>
              {(hubSources?.sources ?? []).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
            <button
              type="button"
              className={btnGhost}
              disabled={!hubQuery.trim() || hubSearch.isPending}
              onClick={() => hubSearch.mutate()}
            >
              {hubSearch.isPending ? <Loader2 size={12} className="animate-spin" /> : <Search size={12} />}
              Search
            </button>
          </div>
          {hubResults.length > 0 && (
            <ul className="max-h-40 space-y-1 overflow-y-auto">
              {hubResults.map((hit) => (
                <li
                  key={hit.identifier}
                  className="flex items-start justify-between gap-2 rounded border border-border px-2 py-1.5"
                >
                  <div className="min-w-0">
                    <p className="truncate text-xs font-medium text-fg">{hit.name}</p>
                    <p className="line-clamp-2 text-[10px] text-fg-muted">{hit.description}</p>
                    <p className="truncate font-mono text-[10px] text-fg-subtle">{hit.identifier}</p>
                  </div>
                  <button
                    type="button"
                    className={btnPrimary}
                    disabled={hubInstall.isPending}
                    onClick={() => hubInstall.mutate(hit.identifier)}
                  >
                    Install
                  </button>
                </li>
              ))}
            </ul>
          )}
          {(hubSources?.featured ?? []).length > 0 && hubResults.length === 0 && (
            <div>
              <p className="mb-1 text-[10px] font-medium uppercase text-fg-muted">Featured</p>
              <ul className="flex flex-wrap gap-1">
                {hubSources!.featured.slice(0, 6).map((hit) => (
                  <button
                    key={hit.identifier}
                    type="button"
                    className={btnGhost}
                    disabled={hubInstall.isPending}
                    onClick={() => hubInstall.mutate(hit.identifier)}
                    title={hit.description}
                  >
                    {hit.name}
                  </button>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

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
            Create skill
          </button>
        </div>
      )}

      <div className="flex min-h-0 flex-1 flex-col gap-3 md:flex-row">
        <div className="flex w-full flex-col md:w-96">
          {!list.length ? (
            <EmptyState
              title="No skills yet"
              description="Create a skill or install from the skills hub."
              className="py-8"
              action={
                <div className="flex gap-2">
                  <button type="button" className={btnPrimary} onClick={() => setShowCreate(true)}>
                    Create skill
                  </button>
                  <button type="button" className={btnGhost} onClick={() => setShowHub(true)}>
                    Browse hub
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
                    onClick={() => setSelectedId(skill.id)}
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
                {selected.missingOnDisk ? (
                  <button
                    type="button"
                    className={btnGhost}
                    onClick={() => sync.mutate({})}
                    disabled={sync.isPending}
                  >
                    <FolderSync size={12} /> Resync from disk
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => {
                    if (confirm(`Remove skill “${selected.name}”?`)) remove.mutate(selected)
                  }}
                  className="rounded p-1 text-fg-muted hover:text-danger"
                >
                  <Trash2 size={14} />
                </button>
                <button
                  type="button"
                  disabled={!dirty || save.isPending || contentLoading}
                  onClick={() => save.mutate()}
                  className={btnPrimary}
                >
                  {save.isPending ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
                  Save
                </button>
              </div>
              {contentLoading ? (
                <div className="flex h-[min(60vh,520px)] items-center justify-center">
                  <Loader2 size={20} className="animate-spin text-fg-muted" />
                </div>
              ) : (
                <textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  className="h-[min(60vh,520px)] w-full rounded border border-border bg-canvas p-2 font-mono text-xs text-fg"
                  spellCheck={false}
                />
              )}
            </>
          ) : (
            <EmptyState
              title="Select a skill"
              description="Edit SKILL.md body here. Content loads from GET /api/skills/content on select."
            />
          )}
        </div>
      </div>
    </div>
  )
}
