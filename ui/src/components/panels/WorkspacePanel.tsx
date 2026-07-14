import { useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ChevronDown,
  ChevronRight,
  Download,
  File,
  FileText,
  Folder,
  FolderOpen,
  GitBranch,
  Loader2,
  Pencil,
  Save,
  Search,
  Upload,
  X,
} from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { useUiStore } from '@app/stores/ui'
import { isImagePath, isMarkdownPath, langFromPath } from '@app/lib/panels'
import { highlightCode } from '@app/lib/markdown/shiki-client'
import { uploadWorkspaceFile } from '@app/lib/workspace-upload'
import {
  fetchWorkspaceDefaultCwd,
  fetchWorkspaceFile,
  fetchWorkspaceGitStatus,
  fetchWorkspaceTree,
  writeWorkspaceFile,
} from '@app/lib/workspace-api'
import type { WorkspaceTreeResponse } from '@hermes/shared'
import { EmptyState } from '@app/components/common/EmptyState'
import { Skeleton } from '@app/components/common/Skeleton'
import { cn } from '@app/lib/utils'

const btnGhost =
  'inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium text-fg transition-colors hover:bg-canvas-subtle disabled:opacity-50'
const btnPrimary =
  'inline-flex items-center gap-1.5 rounded-md bg-accent px-2.5 py-1.5 text-xs font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50'

function workspaceDisplayName(cwd: string): string {
  const parts = cwd.split(/[/\\]/).filter(Boolean)
  return parts[parts.length - 1] || cwd
}

function relativePath(root: string, full: string): string {
  const normRoot = root.replace(/[/\\]+$/, '')
  if (full === normRoot) return '.'
  if (full.startsWith(normRoot + '/') || full.startsWith(normRoot + '\\')) {
    return full.slice(normRoot.length + 1)
  }
  return full
}

function fileName(path: string): string {
  return path.split(/[/\\]/).pop() || path
}

function filterEntries(
  entries: WorkspaceTreeResponse['entries'],
  q: string,
): WorkspaceTreeResponse['entries'] {
  const needle = q.trim().toLowerCase()
  if (!needle) return entries
  return entries.filter((e) => e.name.toLowerCase().includes(needle))
}

export function WorkspacePanel() {
  const addToast = useUiStore((s) => s.addToast)
  const workspacePreviewPath = useUiStore((s) => s.workspacePreviewPath)
  const setWorkspacePreviewPath = useUiStore((s) => s.setWorkspacePreviewPath)
  const queryClient = useQueryClient()
  const [selectedPath, setSelectedPath] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [children, setChildren] = useState<Record<string, WorkspaceTreeResponse['entries']>>({})
  const [loadingDirs, setLoadingDirs] = useState<Set<string>>(new Set())
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [html, setHtml] = useState<string | null>(null)
  const [highlighting, setHighlighting] = useState(false)
  const [treeQuery, setTreeQuery] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!workspacePreviewPath) return
    setSelectedPath(workspacePreviewPath)
    setWorkspacePreviewPath(null)
  }, [workspacePreviewPath, setWorkspacePreviewPath])

  const {
    data: cwdInfo,
    isLoading: cwdLoading,
    isError: cwdError,
    error: cwdLoadError,
    refetch: refetchCwd,
  } = useQuery({
    queryKey: ['workspace-cwd'],
    queryFn: fetchWorkspaceDefaultCwd,
    retry: false,
  })

  const rootPath = cwdInfo?.cwd

  useEffect(() => {
    if (!rootPath) return
    setExpanded((current) => (current.size ? current : new Set([rootPath])))
  }, [rootPath])

  const {
    data: root,
    isLoading: treeLoading,
    isError: treeError,
    error: treeLoadError,
    refetch: refetchTree,
  } = useQuery({
    queryKey: ['workspace-tree', rootPath],
    queryFn: () => fetchWorkspaceTree(rootPath!),
    enabled: !!rootPath,
    retry: false,
  })

  const { data: git } = useQuery({
    queryKey: ['workspace-git', rootPath],
    queryFn: () => fetchWorkspaceGitStatus(rootPath!),
    enabled: !!rootPath,
    retry: false,
    refetchInterval: 30_000,
  })

  useEffect(() => {
    if (root && rootPath) setChildren((current) => ({ ...current, [rootPath]: root.entries }))
  }, [root, rootPath])

  const loadDir = async (path: string) => {
    setLoadingDirs((s) => new Set(s).add(path))
    try {
      const data = await fetchWorkspaceTree(path)
      setChildren((current) => ({ ...current, [path]: data.entries }))
    } finally {
      setLoadingDirs((s) => {
        const next = new Set(s)
        next.delete(path)
        return next
      })
    }
  }

  const {
    data: fileContent,
    isLoading: fileLoading,
    isError: fileError,
    refetch: refetchFile,
  } = useQuery({
    queryKey: ['workspace-file', selectedPath],
    queryFn: () => fetchWorkspaceFile(selectedPath!),
    enabled: !!selectedPath,
    retry: false,
  })

  useEffect(() => {
    setEditing(false)
    setDraft(fileContent?.content ?? '')
    setHtml(null)
    if (!fileContent?.content || !selectedPath) return
    if (isMarkdownPath(selectedPath) || isImagePath(selectedPath)) return
    const lang = langFromPath(selectedPath)
    let cancelled = false
    setHighlighting(true)
    void highlightCode(fileContent.content, lang).then((out) => {
      if (!cancelled) {
        setHtml(out)
        setHighlighting(false)
      }
    })
    return () => {
      cancelled = true
    }
  }, [fileContent, selectedPath])

  const dirty = editing && draft !== (fileContent?.content ?? '')

  const save = useMutation({
    mutationFn: () => writeWorkspaceFile(selectedPath!, draft),
    onSuccess: () => {
      addToast({ title: 'File saved', variant: 'success' })
      setEditing(false)
      void queryClient.invalidateQueries({ queryKey: ['workspace-file', selectedPath] })
      void queryClient.invalidateQueries({ queryKey: ['workspace-git', rootPath] })
    },
    onError: (err) =>
      addToast({
        title: 'Save failed',
        description: err instanceof Error ? err.message : undefined,
        variant: 'danger',
      }),
  })

  const upload = useMutation({
    mutationFn: (file: File) => uploadWorkspaceFile(file),
    onSuccess: (res) => {
      addToast({ title: 'Upload complete', variant: 'success' })
      void refetchTree()
      void queryClient.invalidateQueries({ queryKey: ['workspace-git', rootPath] })
      const path = (res as { path?: string } | undefined)?.path
      if (typeof path === 'string' && path) setSelectedPath(path)
    },
    onError: (err) =>
      addToast({
        title: 'Upload failed',
        description: err instanceof Error ? err.message : undefined,
        variant: 'danger',
      }),
  })

  const download = () => {
    if (!selectedPath || !fileContent) return
    const blob = fileContent.contentBase64
      ? new Blob([Uint8Array.from(atob(fileContent.contentBase64), (c) => c.charCodeAt(0))])
      : new Blob([fileContent.content ?? ''], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = fileName(selectedPath)
    a.click()
    URL.revokeObjectURL(url)
  }

  const dirtySet = useMemo(() => new Set(git?.files ?? []), [git])
  const rootEntries = useMemo(
    () => filterEntries(children[rootPath ?? ''] ?? [], treeQuery),
    [children, rootPath, treeQuery],
  )

  const isLoading = cwdLoading || (!!rootPath && treeLoading)
  const isError = cwdError || treeError || !rootPath || !root
  const error = cwdLoadError ?? treeLoadError

  if (isLoading) {
    return (
      <div className="flex h-full flex-col gap-3 p-5">
        <Skeleton className="h-8 w-64" />
        <div className="flex min-h-0 flex-1 gap-3">
          <Skeleton className="h-full w-72" />
          <Skeleton className="h-full flex-1" />
        </div>
      </div>
    )
  }

  if (isError || !root || !rootPath) {
    return (
      <EmptyState
        icon={<FolderOpen size={28} strokeWidth={1.5} />}
        title="Workspace unavailable"
        description={
          error instanceof Error
            ? error.message
            : 'Hermes could not browse the workspace root.'
        }
        action={
          <button
            type="button"
            onClick={() => {
              void refetchCwd()
              void refetchTree()
            }}
            className={btnPrimary}
          >
            Retry
          </button>
        }
      />
    )
  }

  const displayRoot = workspaceDisplayName(rootPath)
  const branch = cwdInfo.branch?.trim() || undefined

  return (
    <div className="flex h-full min-h-0 flex-col bg-canvas">
      {/* Context strip */}
      <div className="flex shrink-0 flex-wrap items-center gap-3 border-b border-border-muted px-4 py-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <div className="accent-chip flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-white shadow-sm">
              <FolderOpen size={15} strokeWidth={2} />
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-fg" title={rootPath}>
                {displayRoot}
              </p>
              <p className="truncate font-mono text-[11px] text-fg-subtle" title={rootPath}>
                {rootPath}
              </p>
            </div>
          </div>
        </div>

        {git?.isRepo ? (
          <span
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium',
              git.dirty
                ? 'bg-[color-mix(in_srgb,var(--color-attention)_16%,transparent)] text-attention'
                : 'bg-[color-mix(in_srgb,var(--color-success)_16%,transparent)] text-success',
            )}
            title={branch ? `Branch ${branch}` : undefined}
          >
            <span
              className={cn('h-1.5 w-1.5 rounded-full', git.dirty ? 'bg-attention' : 'bg-success')}
            />
            <GitBranch size={12} />
            {branch ? <span className="max-w-[8rem] truncate">{branch}</span> : null}
            <span className="text-fg-muted">·</span>
            {git.dirty ? `${git.files.length} changed` : 'Clean'}
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-canvas-subtle px-2.5 py-1 text-[11px] text-fg-muted">
            <GitBranch size={12} />
            Not a git repo
          </span>
        )}

        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={upload.isPending}
          className={btnGhost}
        >
          {upload.isPending ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
          Upload
        </button>
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) upload.mutate(f)
            e.target.value = ''
          }}
        />
      </div>

      {/* Master–detail */}
      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        {/* Tree */}
        <aside className="flex max-h-[42vh] w-full shrink-0 flex-col border-b border-border-muted bg-canvas-subtle/40 md:max-h-none md:w-80 md:border-b-0 md:border-r">
          <div className="shrink-0 space-y-2 border-b border-border-muted px-3 py-2.5">
            <div className="flex items-center justify-between">
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-fg-subtle">
                Files
              </p>
              <span className="tabular-nums text-[10px] text-fg-muted">
                {(children[rootPath] ?? []).length}
              </span>
            </div>
            <div className="relative">
              <Search
                size={13}
                className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-fg-subtle"
              />
              <input
                value={treeQuery}
                onChange={(e) => setTreeQuery(e.target.value)}
                placeholder="Filter files…"
                className="w-full rounded-md border border-border bg-canvas py-1.5 pl-8 pr-2 text-xs text-fg placeholder:text-fg-subtle focus:border-accent focus:outline-none"
              />
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-1.5 py-2">
            <div className="mb-1 flex items-center gap-1.5 px-2 py-1 text-[11px] font-medium text-fg-muted">
              <Folder size={13} className="text-accent" />
              <span className="truncate">{displayRoot}</span>
            </div>
            {rootEntries.length === 0 ? (
              <p className="px-3 py-6 text-center text-xs text-fg-muted">
                {treeQuery.trim() ? 'No matching files' : 'This folder is empty'}
              </p>
            ) : (
              <TreeBranch
                path={rootPath}
                name={displayRoot}
                entries={rootEntries}
                expanded={expanded}
                childrenMap={children}
                loadingDirs={loadingDirs}
                dirtySet={dirtySet}
                selected={selectedPath}
                filter={treeQuery}
                onToggle={async (path) => {
                  const next = new Set(expanded)
                  if (next.has(path)) next.delete(path)
                  else {
                    next.add(path)
                    if (!children[path]) await loadDir(path)
                  }
                  setExpanded(next)
                }}
                onSelect={(path) => {
                  if (editing && dirty) {
                    const ok = window.confirm('Discard unsaved changes?')
                    if (!ok) return
                  }
                  setSelectedPath(path)
                }}
              />
            )}
          </div>
        </aside>

        {/* Preview */}
        <section className="flex min-h-0 min-w-0 flex-1 flex-col bg-canvas">
          {selectedPath ? (
            <>
              <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border-muted px-4 py-2.5">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <FileText size={14} className="shrink-0 text-fg-muted" />
                    <p className="truncate text-sm font-semibold text-fg">{fileName(selectedPath)}</p>
                    {dirty && (
                      <span className="rounded-full bg-attention/15 px-2 py-0.5 text-[10px] font-medium text-attention">
                        Unsaved
                      </span>
                    )}
                  </div>
                  <p
                    className="mt-0.5 truncate font-mono text-[11px] text-fg-subtle"
                    title={selectedPath}
                  >
                    {relativePath(rootPath, selectedPath)}
                    {!isImagePath(selectedPath) && (
                      <>
                        <span className="mx-1.5 text-fg-muted">·</span>
                        {langFromPath(selectedPath)}
                      </>
                    )}
                  </p>
                </div>

                {!isImagePath(selectedPath) && (
                  <>
                    {editing ? (
                      <>
                        <button
                          type="button"
                          onClick={() => {
                            setEditing(false)
                            setDraft(fileContent?.content ?? '')
                          }}
                          className={btnGhost}
                        >
                          <X size={13} /> Cancel
                        </button>
                        <button
                          type="button"
                          onClick={() => save.mutate()}
                          disabled={save.isPending || !dirty}
                          className={btnPrimary}
                        >
                          {save.isPending ? (
                            <Loader2 size={13} className="animate-spin" />
                          ) : (
                            <Save size={13} />
                          )}
                          Save
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          setEditing(true)
                          setDraft(fileContent?.content ?? '')
                        }}
                        className={btnGhost}
                      >
                        <Pencil size={13} /> Edit
                      </button>
                    )}
                  </>
                )}
                <button type="button" onClick={download} className={btnGhost} title="Download">
                  <Download size={13} /> Download
                </button>
              </div>

              <div className="min-h-0 flex-1 overflow-auto">
                {fileLoading ? (
                  <div className="space-y-2 p-5">
                    <Skeleton className="h-4 w-2/3" />
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-5/6" />
                    <Skeleton className="h-40 w-full" />
                  </div>
                ) : fileError ? (
                  <EmptyState
                    icon={<File size={24} strokeWidth={1.5} />}
                    title="Could not open file"
                    description="Check permissions or path."
                    action={
                      <button type="button" onClick={() => void refetchFile()} className={btnGhost}>
                        Retry
                      </button>
                    }
                  />
                ) : editing ? (
                  <textarea
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    spellCheck={false}
                    className="h-full min-h-full w-full resize-none border-0 bg-canvas-inset p-4 font-mono text-[13px] leading-relaxed text-fg focus:outline-none"
                  />
                ) : isImagePath(selectedPath) && fileContent?.contentBase64 ? (
                  <div className="flex h-full items-center justify-center bg-[radial-gradient(ellipse_at_center,var(--color-canvas-subtle),var(--color-canvas))] p-6">
                    <img
                      src={`data:${fileContent.mime};base64,${fileContent.contentBase64}`}
                      alt={fileName(selectedPath)}
                      className="max-h-full max-w-full rounded-lg border border-border-muted shadow-sm"
                    />
                  </div>
                ) : selectedPath && isMarkdownPath(selectedPath) ? (
                  <div className="markdown-body mx-auto max-w-3xl px-6 py-5 text-sm">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {fileContent?.content ?? ''}
                    </ReactMarkdown>
                  </div>
                ) : highlighting && !html ? (
                  <div className="space-y-2 p-5">
                    <Skeleton className="h-4 w-1/2" />
                    <Skeleton className="h-48 w-full" />
                  </div>
                ) : html ? (
                  <div className="m-4 overflow-hidden rounded-lg border border-border-muted bg-canvas-inset">
                    <div className="flex items-center justify-between border-b border-border-muted px-3 py-1.5">
                      <span className="text-[10px] font-medium uppercase tracking-wide text-fg-subtle">
                        {langFromPath(selectedPath)}
                      </span>
                    </div>
                    <div
                      className="overflow-auto p-3 text-[13px] leading-relaxed [&_pre]:m-0 [&_pre]:bg-transparent [&_code]:font-mono"
                      dangerouslySetInnerHTML={{ __html: html }}
                    />
                  </div>
                ) : (
                  <pre className="m-4 overflow-auto rounded-lg border border-border-muted bg-canvas-inset p-4 font-mono text-[13px] leading-relaxed text-fg whitespace-pre-wrap">
                    {fileContent?.content || 'Empty file'}
                  </pre>
                )}
              </div>
            </>
          ) : (
            <EmptyState
              icon={
                <div className="accent-chip mb-1 flex h-12 w-12 items-center justify-center rounded-2xl text-white shadow-sm">
                  <FolderOpen size={22} strokeWidth={1.75} />
                </div>
              }
              title="Select a file"
              description="Browse the tree to preview, edit, or download workspace files."
              className="h-full"
            />
          )}
        </section>
      </div>
    </div>
  )
}

function TreeBranch({
  path,
  name,
  entries,
  expanded,
  childrenMap,
  loadingDirs,
  dirtySet,
  selected,
  filter,
  onToggle,
  onSelect,
  depth = 0,
}: {
  path: string
  name: string
  entries: WorkspaceTreeResponse['entries']
  expanded: Set<string>
  childrenMap: Record<string, WorkspaceTreeResponse['entries']>
  loadingDirs: Set<string>
  dirtySet: Set<string>
  selected: string | null
  filter: string
  onToggle: (path: string) => void
  onSelect: (path: string) => void
  depth?: number
}) {
  const isOpen = expanded.has(path)
  const visible = filterEntries(entries, depth === 0 ? '' : filter)

  return (
    <div>
      {depth > 0 && (
        <button
          type="button"
          onClick={() => onToggle(path)}
          aria-expanded={isOpen}
          style={{ paddingLeft: 8 + depth * 12 }}
          className="flex w-full items-center gap-1.5 rounded-md py-1 pr-2 text-left text-xs text-fg transition-colors hover:bg-canvas-inset"
        >
          {loadingDirs.has(path) ? (
            <Loader2 size={12} className="shrink-0 animate-spin text-fg-muted" />
          ) : isOpen ? (
            <ChevronDown size={12} className="shrink-0 text-fg-muted" />
          ) : (
            <ChevronRight size={12} className="shrink-0 text-fg-muted" />
          )}
          <Folder size={13} className="shrink-0 text-fg-muted" />
          <span className="truncate">{name}</span>
        </button>
      )}
      {(depth === 0 || isOpen) &&
        visible.map((entry) =>
          entry.type === 'dir' ? (
            <TreeBranch
              key={entry.path}
              path={entry.path}
              name={entry.name}
              entries={childrenMap[entry.path] ?? []}
              expanded={expanded}
              childrenMap={childrenMap}
              loadingDirs={loadingDirs}
              dirtySet={dirtySet}
              selected={selected}
              filter={filter}
              onToggle={onToggle}
              onSelect={onSelect}
              depth={depth + 1}
            />
          ) : (
            <button
              key={entry.path}
              type="button"
              onClick={() => onSelect(entry.path)}
              aria-selected={selected === entry.path}
              style={{ paddingLeft: 8 + (depth + 1) * 12 }}
              className={cn(
                'flex w-full items-center gap-1.5 rounded-md border-l-2 py-1 pr-2 text-left text-xs transition-colors',
                selected === entry.path
                  ? 'border-accent bg-accent-muted text-accent'
                  : 'border-transparent text-fg hover:bg-canvas-inset',
              )}
            >
              <File size={13} className="shrink-0 opacity-70" />
              <span className="min-w-0 flex-1 truncate">{entry.name}</span>
              {dirtySet.has(entry.path) && (
                <span
                  className="h-1.5 w-1.5 shrink-0 rounded-full bg-attention"
                  title="Modified"
                />
              )}
            </button>
          ),
        )}
    </div>
  )
}
