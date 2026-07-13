/** Custom A2UI catalog component ids and prop schemas (Phase 5+) */

export type HermesCatalogComponentId =
  | 'hermes:SkillCard'
  | 'hermes:MemoryEntryEditor'
  | 'hermes:CronSchedulePicker'
  | 'hermes:FileDiff'
  | 'hermes:DocumentRequestForm'
  | 'hermes:FormRequestForm'

export interface SkillCardProps {
  skillId: string
  name: string
  description: string
  source: string
}

export interface MemoryEntryEditorProps {
  entryId?: string
  kind: 'semantic' | 'episodic' | 'preference'
  content: string
  importance: number
}

export interface CronSchedulePickerProps {
  schedule: string
  timezone?: string
  name?: string
  prompt?: string
  /** Pre-selected MCP server bindings (same DTO as the Cron panel wizard). */
  mcpServerIds?: string[]
  /** Pre-selected forced skill bindings (same DTO as the Cron panel wizard). */
  skillIds?: string[]
}

export interface FileDiffProps {
  path: string
  before: string
  after: string
}

/** Chat form for vague document / PPT / Office requests (mirrors CronSchedulePicker). */
export type DocumentRequestDeliverableType =
  | 'markdown'
  | 'word'
  | 'pdf'
  | 'presentation'

export interface DocumentRequestFormProps {
  /** Prefill: markdown | word | pdf | presentation */
  deliverableType?: DocumentRequestDeliverableType | ''
  topic?: string
  audience?: string
  /** Length hint or slide count (e.g. "1 page", "8 slides"). */
  length?: string
  notes?: string
  style?: string
}

/** Chat form for vague generic form-builder requests (not cron / doc / PPT). */
export interface FormRequestFormProps {
  purpose?: string
  /** Field names — newline or comma separated. */
  fields?: string
  submitAction?: string
  /** chat | workspace | memory | other */
  storageTarget?: string
}

export type HermesCatalogProps =
  | SkillCardProps
  | MemoryEntryEditorProps
  | CronSchedulePickerProps
  | FileDiffProps
  | DocumentRequestFormProps
  | FormRequestFormProps

export const HERMES_CATALOG_IDS: HermesCatalogComponentId[] = [
  'hermes:SkillCard',
  'hermes:MemoryEntryEditor',
  'hermes:CronSchedulePicker',
  'hermes:FileDiff',
  'hermes:DocumentRequestForm',
  'hermes:FormRequestForm',
]
