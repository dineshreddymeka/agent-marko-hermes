import { useState } from 'react'

interface MemoryEntryEditorProps {
  entryId?: string
  kind?: 'semantic' | 'episodic' | 'preference'
  content?: string
  importance?: number
  onAction?: (action: string, data: unknown) => void
}

export function MemoryEntryEditor({
  entryId,
  kind: initialKind = 'semantic',
  content: initialContent = '',
  importance: initialImportance = 0.5,
  onAction,
}: MemoryEntryEditorProps) {
  const [kind, setKind] = useState(initialKind)
  const [content, setContent] = useState(initialContent)
  const [importance, setImportance] = useState(initialImportance)

  return (
    <div className="space-y-2 rounded-lg border border-border p-3" data-testid="a2ui-memory-editor">
      <div className="flex flex-wrap gap-2">
        <select
          value={kind}
          className="rounded border border-border bg-canvas px-2 py-1 text-xs text-fg"
          onChange={(e) => setKind(e.target.value as typeof kind)}
        >
          <option value="semantic">Semantic</option>
          <option value="episodic">Episodic</option>
          <option value="preference">Preference</option>
        </select>
        <label className="flex items-center gap-1 text-xs text-fg-muted">
          Importance
          <input
            type="number"
            min={0}
            max={1}
            step={0.1}
            value={importance}
            onChange={(e) => setImportance(Number(e.target.value))}
            className="w-16 rounded border border-border bg-canvas px-1 py-0.5 text-fg"
          />
        </label>
        {entryId && <span className="text-xs text-fg-muted">ID: {entryId.slice(0, 8)}…</span>}
      </div>
      <textarea
        value={content}
        rows={4}
        className="w-full rounded border border-border bg-canvas px-2 py-1 text-sm text-fg"
        onChange={(e) => setContent(e.target.value)}
      />
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => onAction?.('delete', { entryId, kind, content, importance })}
          className="rounded border border-danger/40 px-3 py-1 text-xs text-danger hover:bg-danger/10"
        >
          Delete
        </button>
        <button
          type="button"
          onClick={() => onAction?.('save', { entryId, kind, content, importance })}
          className="rounded bg-accent px-3 py-1 text-xs text-white"
        >
          Save memory
        </button>
      </div>
    </div>
  )
}
