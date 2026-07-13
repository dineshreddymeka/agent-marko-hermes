import { useState } from 'react'

interface FormRequestFormProps {
  purpose?: string
  fields?: string
  submitAction?: string
  storageTarget?: string
  onAction?: (action: string, data: unknown) => void
}

const STORAGE_OPTIONS = [
  { value: 'chat', label: 'Reply in chat' },
  { value: 'workspace', label: 'Save to workspace' },
  { value: 'memory', label: 'Save to memory' },
  { value: 'other', label: 'Other / custom' },
] as const

/**
 * A2UI generic form-request widget — collects purpose, fields, submit action,
 * and storage target (mirrors CronSchedulePicker / DocumentRequestForm).
 */
export function FormRequestForm({
  purpose: initialPurpose = '',
  fields: initialFields = '',
  submitAction: initialSubmit = '',
  storageTarget: initialStorage = 'chat',
  onAction,
}: FormRequestFormProps) {
  const [purpose, setPurpose] = useState(initialPurpose)
  const [fields, setFields] = useState(initialFields)
  const [submitAction, setSubmitAction] = useState(initialSubmit)
  const [storageTarget, setStorageTarget] = useState(initialStorage)

  const canSubmit = Boolean(purpose.trim() && fields.trim())

  return (
    <div className="space-y-3" data-testid="a2ui-form-request">
      <p className="text-xs font-medium text-fg-muted">Form request</p>

      <input
        type="text"
        placeholder="Form purpose (e.g. feedback survey, intake)"
        value={purpose}
        onChange={(e) => setPurpose(e.target.value)}
        className="w-full rounded border border-border bg-canvas px-2 py-1 text-sm text-fg"
        data-testid="a2ui-form-purpose"
      />

      <textarea
        placeholder="Fields (one per line or comma-separated)"
        value={fields}
        onChange={(e) => setFields(e.target.value)}
        rows={3}
        className="w-full rounded border border-border bg-canvas px-2 py-1 text-sm text-fg"
        data-testid="a2ui-form-fields"
      />

      <input
        type="text"
        placeholder="Submit action (e.g. email team, save row)"
        value={submitAction}
        onChange={(e) => setSubmitAction(e.target.value)}
        className="w-full rounded border border-border bg-canvas px-2 py-1 text-sm text-fg"
        data-testid="a2ui-form-submit-action"
      />

      <label className="block space-y-1">
        <span className="text-xs text-fg-muted">Storage target</span>
        <select
          value={storageTarget}
          onChange={(e) => setStorageTarget(e.target.value)}
          className="w-full rounded border border-border bg-canvas px-2 py-1 text-sm text-fg"
          data-testid="a2ui-form-storage"
        >
          {STORAGE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </label>

      <button
        type="button"
        disabled={!canSubmit}
        onClick={() =>
          onAction?.('specify_form', {
            purpose: purpose.trim(),
            fields: fields.trim(),
            submitAction: submitAction.trim(),
            storageTarget,
          })
        }
        className="rounded bg-accent px-3 py-1 text-xs text-accent-fg disabled:opacity-50"
        data-testid="a2ui-form-submit"
      >
        Build form
      </button>
    </div>
  )
}
