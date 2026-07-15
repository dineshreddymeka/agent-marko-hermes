import type { ReactNode } from 'react'
import type { A2UIComponent } from '@app/lib/a2ui/processor'
import type {
  DocumentRequestDeliverableType,
  HermesCatalogComponentId,
} from '@hermes/shared'
import { SkillCard } from '@app/components/a2ui/hermes-widgets/SkillCard'
import { MemoryEntryEditor } from '@app/components/a2ui/hermes-widgets/MemoryEntryEditor'
import { CronSchedulePicker } from '@app/components/a2ui/hermes-widgets/CronSchedulePicker'
import { DocumentRequestForm } from '@app/components/a2ui/hermes-widgets/DocumentRequestForm'
import { FormRequestForm } from '@app/components/a2ui/hermes-widgets/FormRequestForm'
import { DynamicForm } from '@app/components/a2ui/hermes-widgets/DynamicForm'
import { FileDiff } from '@app/components/a2ui/hermes-widgets/FileDiff'

/** SoT Phase 5 standard catalog component types (plus Hermes custom widgets). */
export const STANDARD_CATALOG_TYPES = [
  'Text',
  'Image',
  'Button',
  'TextField',
  'Select',
  'Radio',
  'Checkbox',
  'DateTime',
  'Slider',
  'List',
  'Table',
  'Card',
  'Tabs',
  'Divider',
  'ProgressBar',
  'Video',
  'Audio',
] as const

export const HERMES_WIDGET_TYPES: HermesCatalogComponentId[] = [
  'hermes:SkillCard',
  'hermes:MemoryEntryEditor',
  'hermes:CronSchedulePicker',
  'hermes:FileDiff',
  'hermes:DocumentRequestForm',
  'hermes:FormRequestForm',
  'hermes:DynamicForm',
]

const fieldClass =
  'w-full rounded-md border border-border bg-canvas px-3 py-1.5 text-sm text-fg'

export function renderCatalogComponent(
  component: A2UIComponent,
  data: Record<string, unknown>,
  onAction: (action: string, data: unknown) => void,
): ReactNode {
  const props = { ...component.props, ...resolveBindings(component.props, data) }
  const options = normalizeOptions(props.options)

  switch (component.type) {
    case 'Text':
      return <p className="text-sm text-fg">{String(props.text ?? props.value ?? '')}</p>

    case 'Image':
      return (
        <img
          src={String(props.src ?? props.url ?? '')}
          alt={String(props.alt ?? '')}
          className="max-h-64 max-w-full rounded-md border border-border object-contain"
        />
      )

    case 'Button':
      return (
        <button
          type="button"
          onClick={() => onAction(String(props.action ?? 'click'), props)}
          className="rounded-md bg-accent px-3 py-1.5 text-sm text-accent-fg hover:bg-accent-emphasis"
        >
          {String(props.label ?? 'Button')}
        </button>
      )

    case 'TextField':
      return (
        <input
          type="text"
          placeholder={String(props.placeholder ?? '')}
          defaultValue={String(props.value ?? '')}
          className={fieldClass}
          onChange={(e) => onAction('change', { ...props, value: e.target.value })}
        />
      )

    case 'Select':
      return (
        <select
          defaultValue={String(props.value ?? options[0]?.value ?? '')}
          className={fieldClass}
          onChange={(e) => onAction('change', { ...props, value: e.target.value })}
        >
          {options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      )

    case 'Radio':
      return (
        <fieldset className="space-y-1">
          {options.map((opt) => (
            <label key={opt.value} className="flex items-center gap-2 text-sm text-fg">
              <input
                type="radio"
                name={String(props.name ?? component.id)}
                value={opt.value}
                defaultChecked={String(props.value ?? '') === opt.value}
                onChange={() => onAction('change', { ...props, value: opt.value })}
              />
              {opt.label}
            </label>
          ))}
        </fieldset>
      )

    case 'Checkbox':
      return (
        <label className="flex items-center gap-2 text-sm text-fg">
          <input
            type="checkbox"
            defaultChecked={Boolean(props.checked ?? props.value)}
            onChange={(e) => onAction('change', { ...props, checked: e.target.checked })}
          />
          {String(props.label ?? props.text ?? 'Checkbox')}
        </label>
      )

    case 'DateTime':
      return (
        <input
          type={props.includeTime === false ? 'date' : 'datetime-local'}
          defaultValue={String(props.value ?? '')}
          className={fieldClass}
          onChange={(e) => onAction('change', { ...props, value: e.target.value })}
        />
      )

    case 'Slider':
      return (
        <div className="space-y-1">
          <input
            type="range"
            min={Number(props.min ?? 0)}
            max={Number(props.max ?? 100)}
            step={Number(props.step ?? 1)}
            defaultValue={Number(props.value ?? 0)}
            className="w-full"
            onChange={(e) => onAction('change', { ...props, value: Number(e.target.value) })}
          />
          <p className="text-xs text-fg-muted">{String(props.label ?? 'Value')}: {String(props.value ?? 0)}</p>
        </div>
      )

    case 'List': {
      const items = Array.isArray(props.items) ? props.items : options.map((o) => o.label)
      return (
        <ul className="list-inside list-disc space-y-1 text-sm text-fg">
          {items.map((item, i) => (
            <li key={i}>{typeof item === 'string' ? item : String((item as { label?: string }).label ?? item)}</li>
          ))}
        </ul>
      )
    }

    case 'Table': {
      const columns = Array.isArray(props.columns)
        ? (props.columns as string[])
        : ['Column']
      const rows = Array.isArray(props.rows) ? (props.rows as unknown[][]) : []
      return (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-sm text-fg">
            <thead>
              <tr className="border-b border-border">
                {columns.map((col) => (
                  <th key={col} className="px-2 py-1 font-medium text-fg-muted">
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, ri) => (
                <tr key={ri} className="border-b border-border/60">
                  {(Array.isArray(row) ? row : [row]).map((cell, ci) => (
                    <td key={ci} className="px-2 py-1">
                      {String(cell ?? '')}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )
    }

    case 'Card':
      return (
        <div className="rounded-lg border border-border p-3">
          {props.title != null && (
            <h4 className="mb-2 text-sm font-medium text-fg">{String(props.title)}</h4>
          )}
          {props.children != null && (
            <div className="text-sm text-fg-muted">{String(props.children)}</div>
          )}
        </div>
      )

    case 'Tabs': {
      const tabs = Array.isArray(props.tabs)
        ? (props.tabs as Array<{ id?: string; label: string; content?: string }>)
        : options.map((o) => ({ id: o.value, label: o.label, content: o.label }))
      const active = String(props.value ?? tabs[0]?.id ?? tabs[0]?.label ?? '')
      const activeTab = tabs.find((t) => (t.id ?? t.label) === active) ?? tabs[0]
      return (
        <div className="space-y-2">
          <div className="flex gap-1 border-b border-border">
            {tabs.map((tab) => {
              const id = tab.id ?? tab.label
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => onAction('change', { ...props, value: id })}
                  className={[
                    'px-2 py-1 text-xs',
                    id === active ? 'border-b-2 border-accent text-fg' : 'text-fg-muted',
                  ].join(' ')}
                >
                  {tab.label}
                </button>
              )
            })}
          </div>
          <div className="text-sm text-fg">{activeTab?.content ?? ''}</div>
        </div>
      )
    }

    case 'Divider':
      return <hr className="my-2 border-border" />

    case 'ProgressBar':
      return (
        <div className="h-2 w-full overflow-hidden rounded-full bg-canvas-inset">
          <div
            className="h-full bg-accent transition-all"
            style={{ width: `${Number(props.value ?? 0)}%` }}
          />
        </div>
      )

    case 'Video':
      return (
        <video
          controls
          src={String(props.src ?? props.url ?? '')}
          className="max-h-64 w-full rounded-md border border-border"
        >
          <track kind="captions" />
        </video>
      )

    case 'Audio':
      return (
        <audio controls src={String(props.src ?? props.url ?? '')} className="w-full">
          <track kind="captions" />
        </audio>
      )

    case 'hermes:SkillCard':
      return (
        <SkillCard
          skillId={props.skillId != null ? String(props.skillId) : undefined}
          name={String(props.name ?? '')}
          description={props.description != null ? String(props.description) : undefined}
          source={props.source != null ? String(props.source) : undefined}
          usageCount={props.usageCount != null ? Number(props.usageCount) : undefined}
          onAction={onAction}
        />
      )

    case 'hermes:MemoryEntryEditor':
      return (
        <MemoryEntryEditor
          entryId={props.entryId != null ? String(props.entryId) : undefined}
          kind={(props.kind as 'semantic' | 'episodic' | 'preference') ?? 'semantic'}
          content={String(props.content ?? '')}
          importance={props.importance != null ? Number(props.importance) : undefined}
          onAction={onAction}
        />
      )

    case 'hermes:CronSchedulePicker':
      return (
        <CronSchedulePicker
          name={props.name != null ? String(props.name) : undefined}
          schedule={props.schedule != null ? String(props.schedule) : undefined}
          prompt={props.prompt != null ? String(props.prompt) : undefined}
          timezone={props.timezone != null ? String(props.timezone) : undefined}
          mcpServerIds={
            Array.isArray(props.mcpServerIds) ? props.mcpServerIds.map(String) : undefined
          }
          skillIds={Array.isArray(props.skillIds) ? props.skillIds.map(String) : undefined}
          onAction={onAction}
        />
      )

    case 'hermes:DocumentRequestForm': {
      const rawType = props.deliverableType != null ? String(props.deliverableType) : ''
      const deliverableType =
        rawType === 'markdown' ||
        rawType === 'word' ||
        rawType === 'pdf' ||
        rawType === 'presentation'
          ? (rawType as DocumentRequestDeliverableType)
          : ''
      return (
        <DocumentRequestForm
          deliverableType={deliverableType}
          topic={props.topic != null ? String(props.topic) : undefined}
          audience={props.audience != null ? String(props.audience) : undefined}
          length={props.length != null ? String(props.length) : undefined}
          notes={props.notes != null ? String(props.notes) : undefined}
          style={props.style != null ? String(props.style) : undefined}
          onAction={onAction}
        />
      )
    }

    case 'hermes:FormRequestForm':
      return (
        <FormRequestForm
          purpose={props.purpose != null ? String(props.purpose) : undefined}
          fields={props.fields != null ? String(props.fields) : undefined}
          submitAction={props.submitAction != null ? String(props.submitAction) : undefined}
          storageTarget={
            props.storageTarget != null ? String(props.storageTarget) : undefined
          }
          onAction={onAction}
        />
      )

    case 'hermes:DynamicForm':
      return (
        <DynamicForm
          title={props.title != null ? String(props.title) : undefined}
          description={
            props.description != null ? String(props.description) : undefined
          }
          fields={
            Array.isArray(props.fields)
              ? (props.fields as import('@app/components/a2ui/hermes-widgets/DynamicForm').DynamicFormField[])
              : props.fields != null
                ? String(props.fields)
                : undefined
          }
          submitLabel={
            props.submitLabel != null ? String(props.submitLabel) : undefined
          }
          onAction={onAction}
        />
      )

    case 'hermes:FileDiff':
      return (
        <FileDiff
          path={String(props.path ?? '')}
          before={String(props.before ?? '')}
          after={String(props.after ?? '')}
        />
      )

    default:
      return (
        <div className="rounded border border-dashed border-border p-2 text-xs text-fg-muted">
          Unknown component: {component.type}
        </div>
      )
  }
}

function normalizeOptions(
  raw: unknown,
): Array<{ value: string; label: string }> {
  if (!Array.isArray(raw)) return []
  return raw.map((item, i) => {
    if (typeof item === 'string') return { value: item, label: item }
    if (item && typeof item === 'object') {
      const obj = item as { value?: unknown; label?: unknown; id?: unknown }
      const value = String(obj.value ?? obj.id ?? obj.label ?? i)
      const label = String(obj.label ?? obj.value ?? value)
      return { value, label }
    }
    return { value: String(i), label: String(item) }
  })
}

function resolveBindings(
  props: Record<string, unknown>,
  data: Record<string, unknown>,
): Record<string, unknown> {
  const resolved: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(props)) {
    if (typeof value === 'string' && value.startsWith('{{') && value.endsWith('}}')) {
      const path = value.slice(2, -2).trim()
      resolved[key] = data[path]
    } else {
      resolved[key] = value
    }
  }
  return resolved
}
