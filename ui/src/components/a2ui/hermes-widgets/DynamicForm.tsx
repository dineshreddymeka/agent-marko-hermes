import { useMemo, useState } from 'react'

export type DynamicFormField = {
  name: string
  label?: string
  type?: 'text' | 'email' | 'textarea' | 'select' | 'checkbox' | 'number'
  required?: boolean
  placeholder?: string
  options?: Array<string | { value: string; label: string }>
}

interface DynamicFormProps {
  title?: string
  description?: string
  fields?: DynamicFormField[] | string
  submitLabel?: string
  onAction?: (action: string, data: unknown) => void
}

function normalizeFields(raw: DynamicFormField[] | string | undefined): DynamicFormField[] {
  if (Array.isArray(raw)) {
    return raw
      .map((f, i) => {
        if (!f || typeof f !== 'object') return null
        const name = String(f.name || f.label || `field_${i}`).trim()
        if (!name) return null
        return {
          name,
          label: f.label != null ? String(f.label) : name,
          type: f.type ?? 'text',
          required: Boolean(f.required),
          placeholder: f.placeholder != null ? String(f.placeholder) : undefined,
          options: f.options,
        } satisfies DynamicFormField
      })
      .filter((f): f is DynamicFormField => f != null)
  }
  if (typeof raw === 'string' && raw.trim()) {
    return raw
      .split(/[\n,]+/)
      .map((part) => part.trim())
      .filter(Boolean)
      .map((name) => ({ name, label: name, type: 'text' as const }))
  }
  return []
}

function optionPairs(
  options: DynamicFormField['options'],
): Array<{ value: string; label: string }> {
  if (!Array.isArray(options)) return []
  return options.map((opt, i) => {
    if (typeof opt === 'string') return { value: opt, label: opt }
    if (opt && typeof opt === 'object') {
      const value = String(opt.value ?? opt.label ?? i)
      const label = String(opt.label ?? opt.value ?? value)
      return { value, label }
    }
    return { value: String(i), label: String(opt) }
  })
}

/**
 * Interactive chat form — renders real inputs the user can fill and submit.
 * Used when the agent calls a2ui_render with hermes:DynamicForm.
 */
export function DynamicForm({
  title = 'Form',
  description,
  fields: rawFields,
  submitLabel = 'Submit',
  onAction,
}: DynamicFormProps) {
  const fields = useMemo(() => normalizeFields(rawFields), [rawFields])
  const [values, setValues] = useState<Record<string, string | boolean>>({})
  const [submitted, setSubmitted] = useState(false)

  const setValue = (name: string, value: string | boolean) => {
    setValues((prev) => ({ ...prev, [name]: value }))
  }

  const canSubmit =
    fields.length > 0 &&
    fields.every((f) => {
      if (!f.required) return true
      const v = values[f.name]
      if (f.type === 'checkbox') return Boolean(v)
      return String(v ?? '').trim().length > 0
    })

  const onSubmit = () => {
    if (!canSubmit) return
    setSubmitted(true)
    onAction?.('submit_form', {
      title,
      values,
      fields: fields.map((f) => f.name),
    })
  }

  if (fields.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-border p-3 text-xs text-fg-muted">
        No form fields provided.
      </div>
    )
  }

  return (
    <div className="space-y-3" data-testid="a2ui-dynamic-form">
      <div>
        <p className="text-sm font-semibold text-fg">{title}</p>
        {description ? (
          <p className="mt-0.5 text-xs text-fg-muted">{description}</p>
        ) : null}
      </div>

      {fields.map((field) => {
        const label = field.label || field.name
        const options = optionPairs(field.options)
        if (field.type === 'checkbox') {
          return (
            <label
              key={field.name}
              className="flex items-start gap-2 text-sm text-fg"
            >
              <input
                type="checkbox"
                checked={Boolean(values[field.name])}
                onChange={(e) => setValue(field.name, e.target.checked)}
                className="mt-0.5"
                data-testid={`a2ui-field-${field.name}`}
              />
              <span>
                {label}
                {field.required ? <span className="text-danger"> *</span> : null}
              </span>
            </label>
          )
        }
        if (field.type === 'textarea') {
          return (
            <label key={field.name} className="block space-y-1">
              <span className="text-xs font-medium text-fg-muted">
                {label}
                {field.required ? <span className="text-danger"> *</span> : null}
              </span>
              <textarea
                rows={4}
                placeholder={field.placeholder}
                value={String(values[field.name] ?? '')}
                onChange={(e) => setValue(field.name, e.target.value)}
                className="w-full rounded-md border border-border bg-canvas px-3 py-2 text-sm text-fg"
                data-testid={`a2ui-field-${field.name}`}
              />
            </label>
          )
        }
        if (field.type === 'select') {
          return (
            <label key={field.name} className="block space-y-1">
              <span className="text-xs font-medium text-fg-muted">
                {label}
                {field.required ? <span className="text-danger"> *</span> : null}
              </span>
              <select
                value={String(values[field.name] ?? '')}
                onChange={(e) => setValue(field.name, e.target.value)}
                className="w-full rounded-md border border-border bg-canvas px-3 py-2 text-sm text-fg"
                data-testid={`a2ui-field-${field.name}`}
              >
                <option value="">Select…</option>
                {options.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </label>
          )
        }
        return (
          <label key={field.name} className="block space-y-1">
            <span className="text-xs font-medium text-fg-muted">
              {label}
              {field.required ? <span className="text-danger"> *</span> : null}
            </span>
            <input
              type={field.type === 'email' ? 'email' : field.type === 'number' ? 'number' : 'text'}
              placeholder={field.placeholder}
              value={String(values[field.name] ?? '')}
              onChange={(e) => setValue(field.name, e.target.value)}
              className="w-full rounded-md border border-border bg-canvas px-3 py-2 text-sm text-fg"
              data-testid={`a2ui-field-${field.name}`}
            />
          </label>
        )
      })}

      <button
        type="button"
        disabled={!canSubmit || submitted}
        onClick={onSubmit}
        className="w-full rounded-md bg-accent px-3 py-2 text-sm font-medium text-accent-fg hover:bg-accent-emphasis disabled:opacity-50"
        data-testid="a2ui-form-submit"
      >
        {submitted ? 'Submitted' : submitLabel}
      </button>
    </div>
  )
}
