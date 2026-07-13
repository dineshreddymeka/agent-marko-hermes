import { useState } from 'react'
import type { DocumentRequestDeliverableType } from '@hermes/shared'

interface DocumentRequestFormProps {
  deliverableType?: DocumentRequestDeliverableType | ''
  topic?: string
  audience?: string
  length?: string
  notes?: string
  style?: string
  onAction?: (action: string, data: unknown) => void
}

const DELIVERABLE_OPTIONS: ReadonlyArray<{
  value: DocumentRequestDeliverableType
  label: string
}> = [
  { value: 'markdown', label: 'Markdown draft' },
  { value: 'word', label: 'Word' },
  { value: 'pdf', label: 'PDF' },
  { value: 'presentation', label: 'PowerPoint' },
]

/**
 * A2UI document/PPT request widget — collects deliverable details in chat
 * (mirrors CronSchedulePicker). Submit posts create_document via actions.ts.
 */
export function DocumentRequestForm({
  deliverableType: initialType = '',
  topic: initialTopic = '',
  audience: initialAudience = '',
  length: initialLength = '',
  notes: initialNotes = '',
  style: initialStyle = '',
  onAction,
}: DocumentRequestFormProps) {
  const [deliverableType, setDeliverableType] = useState<DocumentRequestDeliverableType | ''>(
    initialType,
  )
  const [topic, setTopic] = useState(initialTopic)
  const [audience, setAudience] = useState(initialAudience)
  const [length, setLength] = useState(initialLength)
  const [style, setStyle] = useState(initialStyle)
  const [notes, setNotes] = useState(initialNotes)

  const canSubmit = Boolean(deliverableType && topic.trim())

  return (
    <div className="space-y-3" data-testid="a2ui-document-request">
      <p className="text-xs font-medium text-fg-muted">Document / presentation request</p>

      <label className="block space-y-1">
        <span className="text-xs text-fg-muted">Deliverable type</span>
        <select
          value={deliverableType}
          onChange={(e) =>
            setDeliverableType(e.target.value as DocumentRequestDeliverableType | '')
          }
          className="w-full rounded border border-border bg-canvas px-2 py-1 text-sm text-fg"
          data-testid="a2ui-doc-type"
        >
          <option value="">Select type…</option>
          {DELIVERABLE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </label>

      <input
        type="text"
        placeholder="Topic / title"
        value={topic}
        onChange={(e) => setTopic(e.target.value)}
        className="w-full rounded border border-border bg-canvas px-2 py-1 text-sm text-fg"
        data-testid="a2ui-doc-topic"
      />

      <input
        type="text"
        placeholder="Audience (e.g. execs, engineering)"
        value={audience}
        onChange={(e) => setAudience(e.target.value)}
        className="w-full rounded border border-border bg-canvas px-2 py-1 text-sm text-fg"
      />

      <input
        type="text"
        placeholder={
          deliverableType === 'presentation'
            ? 'Length / slides (e.g. 8 slides)'
            : 'Length (e.g. 1 page, short brief)'
        }
        value={length}
        onChange={(e) => setLength(e.target.value)}
        className="w-full rounded border border-border bg-canvas px-2 py-1 text-sm text-fg"
      />

      <input
        type="text"
        placeholder="Style (optional)"
        value={style}
        onChange={(e) => setStyle(e.target.value)}
        className="w-full rounded border border-border bg-canvas px-2 py-1 text-sm text-fg"
      />

      <textarea
        placeholder="Notes / extra context"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        rows={3}
        className="w-full rounded border border-border bg-canvas px-2 py-1 text-sm text-fg"
      />

      <button
        type="button"
        disabled={!canSubmit}
        onClick={() =>
          onAction?.('create_document', {
            deliverableType,
            topic: topic.trim(),
            audience: audience.trim(),
            length: length.trim(),
            style: style.trim(),
            notes: notes.trim(),
          })
        }
        className="rounded bg-accent px-3 py-1 text-xs text-accent-fg disabled:opacity-50"
        data-testid="a2ui-doc-submit"
      >
        Create deliverable
      </button>
    </div>
  )
}
