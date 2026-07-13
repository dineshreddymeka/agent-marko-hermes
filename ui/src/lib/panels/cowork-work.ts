/**
 * Helpers for the Cowork Work requests UI (deliverable presets, payloads, path checks).
 */
import type {
  CoworkDeliverableType,
  CoworkTask,
  CoworkTaskDetail,
  CoworkTaskStatus,
  CreateCoworkTaskBody,
  CreateCoworkTaskResponse,
} from '@hermes/shared'

export type {
  CoworkDeliverableType,
  CoworkTask,
  CoworkTaskDetail,
  CoworkTaskStatus,
  CreateCoworkTaskBody,
  CreateCoworkTaskResponse,
}

/** @deprecated Prefer CoworkTask from shared — kept for call sites during merge. */
export type CoworkTaskSummary = CoworkTask
/** @deprecated Prefer CreateCoworkTaskBody */
export type CoworkTaskCreateRequest = CreateCoworkTaskBody
/** @deprecated Prefer CreateCoworkTaskResponse */
export type CoworkTaskCreateResponse = CreateCoworkTaskResponse

export const COWORK_DELIVERABLE_PRESETS: ReadonlyArray<{
  id: CoworkDeliverableType
  label: string
}> = [
  { id: 'presentation', label: 'Presentation' },
  { id: 'word', label: 'Word doc' },
  { id: 'spreadsheet', label: 'Spreadsheet' },
  { id: 'pdf', label: 'PDF' },
  { id: 'other', label: 'Other' },
]

/** Office gallery cards (document types). */
export const COWORK_OFFICE_TYPES: ReadonlyArray<{
  id: CoworkDeliverableType
  label: string
  blurb: string
}> = [
  { id: 'presentation', label: 'Presentation', blurb: 'PPTX decks for status, sales, and execs' },
  { id: 'word', label: 'Word doc', blurb: 'DOCX reports, minutes, and proposals' },
  { id: 'spreadsheet', label: 'Spreadsheet', blurb: 'XLSX summaries, budgets, and matrices' },
  { id: 'pdf', label: 'PDF', blurb: 'Printable briefs and checklists' },
  { id: 'other', label: 'Other', blurb: 'Free-form deliverable' },
]

export type CoworkOfficeTemplate = {
  id: string
  label: string
  goalStub: string
}

/** Template starters keyed by deliverable type (Office panel). */
export const COWORK_OFFICE_TEMPLATES: Readonly<
  Record<CoworkDeliverableType, readonly CoworkOfficeTemplate[]>
> = {
  presentation: [
    {
      id: 'exec-summary',
      label: 'Executive summary deck',
      goalStub: 'Create a 6-slide executive summary deck about ___ for ___.',
    },
    {
      id: 'project-status',
      label: 'Project status deck',
      goalStub: 'Create a project status deck covering progress, risks, and next steps for ___.',
    },
    {
      id: 'sales-qbr',
      label: 'Sales/QBR deck',
      goalStub: 'Create a sales/QBR deck summarizing pipeline and wins for ___ this quarter.',
    },
  ],
  word: [
    {
      id: 'report-notes',
      label: 'Report from notes',
      goalStub: 'Write a clear report from these notes about ___ for ___.',
    },
    {
      id: 'meeting-minutes',
      label: 'Meeting minutes',
      goalStub: 'Draft meeting minutes for ___ including decisions and action items.',
    },
    {
      id: 'proposal-draft',
      label: 'Proposal draft',
      goalStub: 'Draft a proposal for ___ aimed at ___.',
    },
  ],
  spreadsheet: [
    {
      id: 'data-summary',
      label: 'Data summary workbook',
      goalStub: 'Build a spreadsheet summarizing ___ with totals and key breakdowns.',
    },
    {
      id: 'budget-tracker',
      label: 'Budget tracker',
      goalStub: 'Create a budget tracker spreadsheet for ___ with categories and remaining balance.',
    },
    {
      id: 'comparison-matrix',
      label: 'Comparison matrix',
      goalStub: 'Create a comparison matrix spreadsheet evaluating ___ across clear criteria.',
    },
  ],
  pdf: [
    {
      id: 'one-page-brief',
      label: 'One-page brief',
      goalStub: 'Create a one-page PDF brief about ___ for ___.',
    },
    {
      id: 'printable-checklist',
      label: 'Printable checklist',
      goalStub: 'Create a printable PDF checklist for ___.',
    },
  ],
  other: [],
}

/** Client-side path jail: workspace-relative paths only (no abs / ..). */
export function isSafeWorkspaceRelativePath(path: string): boolean {
  const trimmed = path.trim()
  if (!trimmed || trimmed.includes('\0')) return false
  if (/^[a-zA-Z]:[\\/]/.test(trimmed)) return false
  if (trimmed.startsWith('/') || trimmed.startsWith('\\')) return false
  const parts = trimmed.replace(/\\/g, '/').split('/')
  if (parts.some((p) => p === '..' || p === '')) return false
  return true
}

export function truncateGoalTitle(goal: string | null | undefined, max = 72): string {
  const oneLine = (goal ?? '').trim().replace(/\s+/g, ' ')
  if (!oneLine) return 'Untitled request'
  if (oneLine.length <= max) return oneLine
  return `${oneLine.slice(0, max - 1)}…`
}

export function buildCoworkCreatePayload(draft: {
  goal: string
  deliverableType: CoworkDeliverableType
  files: string[]
  autoApprove: boolean
}): CreateCoworkTaskBody | { error: string } {
  const goal = draft.goal.trim()
  if (!goal) return { error: 'Describe what should be produced.' }

  const files: string[] = []
  for (const raw of draft.files) {
    const path = raw.trim()
    if (!path) continue
    if (!isSafeWorkspaceRelativePath(path)) {
      return {
        error: `File path must stay inside the workspace (relative, no ..): ${path}`,
      }
    }
    files.push(path)
  }

  return {
    goal,
    deliverableType: draft.deliverableType,
    ...(files.length > 0 ? { files } : {}),
    autoApprove: draft.autoApprove,
  }
}

export function coworkStatusPillClass(status: string): string {
  switch (status) {
    case 'queued':
      return 'border-border bg-canvas text-fg-muted'
    case 'running':
      return 'border-attention bg-canvas text-attention'
    case 'done':
      return 'border-success bg-canvas text-success'
    case 'failed':
      return 'border-danger bg-canvas text-danger'
    case 'aborted':
      return 'border-border bg-canvas text-fg-muted'
    default:
      return 'border-border bg-canvas text-fg-muted'
  }
}

export function shouldPollCoworkTasks(tasks: CoworkTask[] | undefined): boolean {
  return (tasks ?? []).some((t) => t.status === 'queued' || t.status === 'running')
}

/** Detail/Results panel: poll while the open task is still in flight. */
export function shouldPollCoworkTaskDetail(
  status: CoworkTaskStatus | string | undefined,
): boolean {
  return status === 'queued' || status === 'running'
}

/** Queued/running rows show Stop. */
export function isCoworkTaskAbortable(status: CoworkTaskStatus | string): boolean {
  return status === 'queued' || status === 'running'
}

/**
 * Retry must use persisted inputFiles, never outbox output `files`.
 * Legacy tasks (inputFiles null) retry without attachments.
 */
export function coworkRetryFiles(task: Pick<CoworkTask, 'inputFiles' | 'files'>): {
  files: string[]
  legacyMissingInputs: boolean
} {
  if (task.inputFiles != null) {
    return { files: task.inputFiles, legacyMissingInputs: false }
  }
  return {
    files: [],
    legacyMissingInputs: (task.files?.length ?? 0) > 0,
  }
}

export function deliverableLabel(type: string | null | undefined): string {
  if (!type) return 'Deliverable'
  return COWORK_DELIVERABLE_PRESETS.find((p) => p.id === type)?.label ?? type
}
