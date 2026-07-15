import { useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ChevronDown,
  ChevronRight,
  Download,
  File,
  Folder,
  GitBranch,
  Pencil,
  Save,
  Upload,
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

function workspaceDisplayName(cwd: string): string {
  const parts = cwd.split(/[/\\]/).filter(Boolean)
  return parts[parts.length - 1] || cwd
}

export function WorkspacePanel() {
  const addToast = useUiStore((s) => s.addToast)
  const workspacePreviewPath = useUiStore((s) => s.workspacePreviewPath)
  const setWorkspacePreviewPath = useUiStore((s) => s.setWorkspacePreviewPath)
  const queryClient = useQueryClient()
  const [selectedPath, setSelectedPath] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [children, setChildren] = useState<Record<string, WorkspaceTreeResponse['entries']>>({})
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [html, setHtml] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Chat frontend tool `open_file_preview` → select path here
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
    const data = await fetchWorkspaceTree(path)
    setChildren((current) => ({ ...current, [path]: data.entries }))
  }

  const {
    data: fileContent,
    isLoading: fileLoading,
    isError: fileError,
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
    void highlightCode(fileContent.content, lang).then(setHtml)
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
    const blob =
      fileContent.contentBase64
        ? new Blob([Uint8Array.from(atob(fileContent.contentBase64), (c) => c.charCodeAt(0))])
        : new Blob([fileContent.content ?? ''], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = selectedPath.split(/[/\\]/).pop() ?? 'file'
    a.click()
    URL.revokeObjectURL(url)
  }

  const dirtySet = useMemo(() => new Set(git?.files ?? []), [git])

  const isLoading = cwdLoading || (!!rootPath && treeLoading)
  const isError = cwdError || treeError || !rootPath || !root
  const error = cwdLoadError ?? treeLoadError

  if (isLoading) {
    return (
      <div className="space-y-2 p-4">
        <Skeleton className="h-6 w-full" />
        <Skeleton className="h-6 w-3/4" />
      </div>
    )
  }

  if (isError || !root || !rootPath) {
    return (
      <EmptyState
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
            className="text-xs text-accent"
          >
            Retry
          </button>
        }
      />
    )
  }

  const branch = cwdInfo?.branch?.trim() || undefined

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-2 text-xs">
        <span
          className="max-w-[min(100%,28rem)] truncate font-mono text-[10px] text-fg-muted"
          title={rootPath}
        >
          {rootPath}
        </span>
        {git?.isRepo ? (
          <span
            className={`inline-flex items-center gap-1 rounded px-2 py-0.5 ${
              git.dirty ? 'bg-attention/15 text-attention' : 'bg-success/15 text-success'
            }`}
          >
            <GitBranch size={12} />
            {branch ? <span className="max-w-[8rem] truncate">{branch}</span> : null}
            {branch ? <span className="text-fg-muted">·</span> : null}
            {git.dirty ? `${git.files.length} changed` : 'Clean'}
          </span>
        ) : (
          <span className="text-fg-muted">Not a git repo</span>
        )}
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={upload.isPending}
          className="ml-auto inline-flex items-center gap-1 rounded border border-border px-2 py-1 text-fg hover:bg-canvas-subtle disabled:opacity-50"
        >
          <Upload size={12} /> Upload
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

      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        <div className="w-full shrink-0 overflow-y-auto border-b border-border p-2 md:w-64 md:border-b-0 md:border-r">
          <TreeBranch
            path={rootPath}
            name={workspaceDisplayName(rootPath)}
            entries={children[rootPath] ?? []}
            expanded={expanded}
            childrenMap={children}
            dirtySet={dirtySet}
            selected={selectedPath}
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
              if (dirty) {
                const ok = window.confirm('Discard unsaved changes?')
                if (!ok) return
              }
              setSelectedPath(path)
            }}
          />
        </div>

        <div className="flex min-h-0 flex-1 flex-col">
          {selectedPath ? (
            <>
              <div className="flex items-center gap-2 border-b border-border px-3 py-2">
                <span className="min-w-0 flex-1 truncate font-mono text-xs text-fg">{selectedPath}</span>
                {!isImagePath(selectedPath) && (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        setEditing((value) => !value)
                        setDraft(fileContent?.content ?? '')
                      }}
                      className="rounded p-1 text-fg-muted hover:bg-canvas-subtle"
                      title="Edit"
                    >
                      <Pencil size={14} />
                    </button>
                    {editing && (
                      <button
                        type="button"
                        onClick={() => save.mutate()}
                        disabled={save.isPending || !dirty}
                        className="inline-flex items-center gap-1 rounded bg-accent px-2 py-1 text-xs text-white disabled:opacity-50"
                      >
                        <Save size={12} /> Save
                      </button>
                    )}
                  </>
                )}
                <button
                  type="button"
                  onClick={download}
                  className="rounded p-1 text-fg-muted hover:bg-canvas-subtle"
                  title="Download"
                >
                  <Download size={14} />
                </button>
              </div>
              <div className="min-h-0 flex-1 overflow-auto p-4">
                {fileLoading ? (
                  <Skeleton className="h-40 w-full" />
                ) : fileError ? (
                  <EmptyState title="Could not open file" description="Check permissions or path." />
                ) : editing ? (
                  <textarea
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    className="h-full min-h-[240px] w-full rounded border border-border bg-canvas p-3 font-mono text-xs text-fg"
                  />
                ) : isImagePath(selectedPath) && fileContent?.contentBase64 ? (
                  <img
                    src={`data:${fileContent.mime};base64,${fileContent.contentBase64}`}
                    alt={selectedPath}
                    className="max-h-full max-w-full"
                  />
                ) : selectedPath && isMarkdownPath(selectedPath) ? (
                  <div className="prose prose-invert max-w-none text-sm">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {fileContent?.content ?? ''}
                    </ReactMarkdown>
                  </div>
                ) : html ? (
                  <div
                    className="overflow-auto text-xs [&_pre]:m-0 [&_pre]:bg-transparent"
                    dangerouslySetInnerHTML={{ __html: html }}
                  />
                ) : (
                  <pre className="whitespace-pre-wrap font-mono text-xs text-fg">
                    {fileContent?.content ?? 'Empty file'}
                  </pre>
                )}
              </div>
            </>
          ) : (
            <EmptyState
              title="Select a file"
              description="Choose a file from the tree to preview or edit."
            />
          )}
        </div>
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
  dirtySet,
  selected,
  onToggle,
  onSelect,
  depth = 0,
}: {
  path: string
  name: string
  entries: WorkspaceTreeResponse['entries']
  expanded: Set<string>
  childrenMap: Record<string, WorkspaceTreeResponse['entries']>
  dirtySet: Set<string>
  selected: string | null
  onToggle: (path: string) => void
  onSelect: (path: string) => void
  depth?: number
}) {
  const isOpen = expanded.has(path)
  return (
    <div>
      {depth > 0 && (
        <button
          type="button"
          onClick={() => onToggle(path)}
          style={{ paddingLeft: depth * 12 }}
          className="flex w-full items-center gap-1 rounded px-1 py-0.5 text-left text-xs text-fg hover:bg-canvas-inset"
        >
          {isOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          <Folder size={12} />
          <span className="truncate">{name}</span>
        </button>
      )}
      {(depth === 0 || isOpen) &&
        entries.map((entry) =>
          entry.type === 'dir' ? (
            <TreeBranch
              key={entry.path}
              path={entry.path}
              name={entry.name}
              entries={childrenMap[entry.path] ?? []}
              expanded={expanded}
              childrenMap={childrenMap}
              dirtySet={dirtySet}
              selected={selected}
              onToggle={onToggle}
              onSelect={onSelect}
              depth={depth + 1}
            />
          ) : (
            <button
              key={entry.path}
              type="button"
              onClick={() => onSelect(entry.path)}
              style={{ paddingLeft: (depth + 1) * 12 }}
              className={`flex w-full items-center gap-1 rounded px-1 py-0.5 text-left text-xs hover:bg-canvas-inset ${
                selected === entry.path ? 'bg-accent-muted text-accent' : 'text-fg'
              }`}
            >
              <span className="w-3" />
              <File size={12} />
              <span className="truncate">{entry.name}</span>
              {dirtySet.has(entry.path) && (
                <span className="ml-auto text-[10px] text-attention">M</span>
              )}
            </button>
          ),
        )}
    </div>
  )
}
