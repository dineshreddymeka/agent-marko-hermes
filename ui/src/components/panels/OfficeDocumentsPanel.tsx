/**
 * Open Jarvis — Office document-type gallery (Cowork work requests).
 */
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import {
  FileDown,
  FileText,
  Presentation,
  Sparkles,
  Table,
  type LucideIcon,
} from 'lucide-react'
import { apiClient } from '@app/lib/api'
import { useUiStore } from '@app/stores/ui'
import {
  COWORK_OFFICE_TYPES,
  COWORK_OFFICE_TEMPLATES,
  coworkStatusPillClass,
  deliverableLabel,
  truncateGoalTitle,
  type CoworkDeliverableType,
  type CoworkTask,
} from '@app/lib/panels/cowork-work'
import { coworkTaskStatusLabel } from '@app/lib/labels'
import type { CoworkSetupResponse, CoworkTaskListResponse } from '@hermes/shared'
import { formatRelativeTime } from '@app/lib/utils'

const TYPE_ICONS: Record<CoworkDeliverableType, LucideIcon> = {
  presentation: Presentation,
  word: FileText,
  spreadsheet: Table,
  pdf: FileDown,
  other: Sparkles,
}

export function OfficeDocumentsPanel() {
  const navigate = useNavigate()
  const setActivePanel = useUiStore((s) => s.setActivePanel)

  const { data: tasks } = useQuery({
    queryKey: ['cowork-tasks'],
    queryFn: async () => {
      const res = await apiClient.get<CoworkTaskListResponse>('/api/cowork/tasks')
      return res.tasks
    },
    retry: false,
  })

  const { data: setup } = useQuery({
    queryKey: ['cowork-setup'],
    queryFn: () => apiClient.get<CoworkSetupResponse>('/api/cowork/setup'),
    retry: false,
    staleTime: 30_000,
  })

  const openWorkRequest = (opts: {
    deliverableType: CoworkDeliverableType
    goalStub?: string
  }) => {
    useUiStore.getState().setCoworkFormPrefill({
      deliverableType: opts.deliverableType,
      goalSeed: opts.goalStub,
    })
    setActivePanel('cron')
    void navigate({
      to: '/panel/$name',
      params: { name: 'cowork' },
    })
  }

  const recent = (tasks ?? []).slice(0, 3)

  return (
    <div className="space-y-6">
      <div
        className="rounded-lg border border-border bg-canvas-subtle px-3 py-2 text-xs text-fg-muted"
        data-testid="office-docs-sso-note"
      >
        <p className="font-medium text-fg">(A) Microsoft SSO vs (B) Open Cowork</p>
        <p className="mt-1">
          Email / calendar sign-in is on the <span className="text-fg">Briefing</span> tab (Sign in
          with Microsoft → login.microsoftonline.com). This Documents tab is only for optional local
          document jobs via Open Cowork.exe — it does not perform Microsoft SSO.
        </p>
      </div>

      {setup && !setup.configured ? (
        <div
          className="rounded-lg border border-border bg-canvas-subtle px-3 py-2 text-xs text-fg-muted"
          data-testid="office-cowork-setup-banner"
        >
          {setup.exeExists && setup.headlessSupported === false ? (
            <>
              <p className="font-medium text-fg">(B) Open Cowork is GUI-only</p>
              <p className="mt-1">
                {setup.hint ??
                  'This installed build cannot run headless document jobs. Prior requests still show from the database.'}
              </p>
            </>
          ) : (
            <>
              <p className="font-medium text-fg">(B) Open Cowork not configured</p>
              <p className="mt-1">
                Document jobs need the Open Cowork desktop app.{' '}
                <a
                  href={
                    setup.downloadUrl ??
                    'https://github.com/OpenCoworkAI/open-cowork/releases/download/v3.3.1/Open.Cowork-3.3.1-win-x64.exe'
                  }
                  target="_blank"
                  rel="noreferrer"
                  className="text-accent hover:underline"
                >
                  Download installer
                </a>
                , then paste the exe path under Cowork → Setup (or set{' '}
                <code className="text-fg">OPEN_COWORK_EXE</code> in{' '}
                <code className="text-fg">.env</code> and restart the API). Not required for Microsoft
                email SSO.
              </p>
            </>
          )}
        </div>
      ) : null}

      <div>
        <h2 className="text-sm font-medium text-fg">Document templates</h2>
        <p className="mt-1 text-xs text-fg-muted">
          Pick a deliverable type or template to start a Cowork work request.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {COWORK_OFFICE_TYPES.map((card) => {
          const Icon = TYPE_ICONS[card.id]
          const templates = COWORK_OFFICE_TEMPLATES[card.id] ?? []
          return (
            <article
              key={card.id}
              className="rounded-lg border border-border bg-canvas-subtle p-3 transition-shell hover:border-accent/40"
              data-testid={`office-type-${card.id}`}
            >
              <button
                type="button"
                onClick={() => openWorkRequest({ deliverableType: card.id })}
                className="flex w-full items-start gap-3 text-left"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-accent-muted text-accent">
                  <Icon size={18} strokeWidth={1.75} />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-fg">{card.label}</span>
                  <span className="mt-0.5 block text-xs text-fg-muted">{card.blurb}</span>
                </span>
              </button>

              {templates.length > 0 ? (
                <ul className="mt-3 space-y-1 border-t border-border pt-2">
                  {templates.map((t) => (
                    <li key={t.id}>
                      <button
                        type="button"
                        onClick={() =>
                          openWorkRequest({
                            deliverableType: card.id,
                            goalStub: t.goalStub,
                          })
                        }
                        className="w-full rounded px-1.5 py-1 text-left text-xs text-fg-muted hover:bg-canvas hover:text-accent"
                        data-testid={`office-template-${t.id}`}
                      >
                        {t.label}
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </article>
          )
        })}
      </div>

      <section>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-medium text-fg">Recent</h3>
          <button
            type="button"
            onClick={() => {
              setActivePanel('cron')
              void navigate({ to: '/panel/$name', params: { name: 'cowork' } })
            }}
            className="text-xs text-accent hover:underline"
          >
            View all
          </button>
        </div>
        {!recent.length ? (
          <p className="rounded-lg border border-dashed border-border px-3 py-4 text-xs text-fg-muted">
            No work requests yet. Pick a template above to start one.
          </p>
        ) : (
          <ul className="space-y-2">
            {recent.map((task: CoworkTask) => (
              <li
                key={task.taskId}
                className="flex items-center justify-between gap-2 rounded-lg border border-border px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm text-fg">{truncateGoalTitle(task.goal)}</p>
                  <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[10px] text-fg-subtle">
                    <span
                      className={`rounded-full border px-1.5 py-0.5 ${coworkStatusPillClass(task.status)}`}
                    >
                      {coworkTaskStatusLabel(task.status)}
                    </span>
                    <span>{deliverableLabel(task.deliverableType)}</span>
                    <span>{formatRelativeTime(task.createdAt)}</span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setActivePanel('cron')
                    void navigate({ to: '/panel/$name', params: { name: 'cowork' } })
                  }}
                  className="shrink-0 text-xs text-accent hover:underline"
                >
                  Open
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
