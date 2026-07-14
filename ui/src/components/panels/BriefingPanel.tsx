import {
  ArrowRight,
  Bot,
  Building2,
  CalendarCheck,
  CalendarDays,
  ClipboardList,
  FileText,
  LockKeyhole,
  RefreshCw,
  Sparkles,
  Timer,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ApiError, apiClient } from '@app/lib/api'
import { useUiStore } from '@app/stores/ui'
import { EmptyState } from '@app/components/common/EmptyState'
import { Skeleton } from '@app/components/common/Skeleton'

type OfficeStatus = {
  configured: boolean
  connected: boolean
  missingEnv?: string[]
  account: {
    displayName?: string | null
    email?: string | null
    connectedAt?: string
    expiresAt?: string | null
  } | null
  scopes: string[]
  artifactScopes?: string[]
  redirectUri: string
  azurePlatform?: string
  flow?: string
  autoSso?: boolean
  purpose?: string
}

type BriefingMeeting = {
  id: string
  title: string
  start: string
  end: string
  timeLabel: string
  status: 'Done' | 'In progress' | 'Upcoming' | 'Cancelled'
  meta: string
  isOnlineMeeting: boolean
  joinUrl: string | null
  attendeeCount: number
  durationMinutes: number
}

type OfficeBriefing = {
  live: boolean
  connected: boolean
  configured?: boolean
  account: OfficeStatus['account']
  syncedAt?: string
  stats: {
    meetingTime: string
    meetingTimeMinutes: number
    meetingCount: number
    onlineMeetingCount: number
    focusBlocks: number
    upcomingCount: number
    doneCount: number
  } | null
  agenda: BriefingMeeting[]
  insights: string[]
  actions: string[]
  note?: string
  message?: string
  error?: string
}

const FALLBACK_SCOPES = ['Calendars.Read', 'OnlineMeetings.Read']

function localDayBounds(): { start: string; end: string; tz: string } {
  const now = new Date()
  const start = new Date(now)
  start.setHours(0, 0, 0, 0)
  const end = new Date(now)
  end.setHours(23, 59, 59, 999)
  return {
    start: start.toISOString(),
    end: end.toISOString(),
    tz: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
  }
}

function statusTone(status: BriefingMeeting['status']): string {
  if (status === 'In progress') return 'border-accent/40 text-accent'
  if (status === 'Done') return 'border-success/40 text-success'
  if (status === 'Cancelled') return 'border-danger/40 text-danger'
  return 'border-border text-fg-muted'
}

function errorMessage(err: unknown, fallback: string): string {
  if (err instanceof ApiError) return err.message || fallback
  if (err instanceof Error) return err.message || fallback
  return fallback
}

/** Microsoft Graph calendar briefing — used by Office → Briefing tab. */
export function BriefingPanel() {
  const addToast = useUiStore((s) => s.addToast)
  const queryClient = useQueryClient()
  const [connecting, setConnecting] = useState(false)
  const day = useMemo(() => localDayBounds(), [])

  const {
    data: status,
    isLoading: statusLoading,
    isError: statusError,
    refetch: refetchStatus,
  } = useQuery({
    queryKey: ['office-status'],
    queryFn: () => apiClient.get<OfficeStatus>('/api/office/status'),
    retry: false,
  })

  const {
    data: briefing,
    isLoading: briefingLoading,
    isFetching: briefingFetching,
    isError: briefingError,
    error: briefingErr,
    refetch: refetchBriefing,
  } = useQuery({
    queryKey: ['office-briefing', day.start, day.end, day.tz],
    queryFn: () =>
      apiClient.get<OfficeBriefing>('/api/office/briefing', {
        start: day.start,
        end: day.end,
        tz: day.tz,
      }),
    enabled: Boolean(status?.connected),
    retry: false,
    refetchInterval: status?.connected ? 60_000 : false,
  })

  useEffect(() => {
    const url = new URL(window.location.href)
    const result = url.searchParams.get('office')
    if (result !== 'connected' && result !== 'error') return

    const message = url.searchParams.get('message')
    addToast({
      title: result === 'connected' ? 'Microsoft connected' : 'Microsoft connect failed',
      description: message ?? undefined,
      variant: result === 'connected' ? 'success' : 'danger',
    })
    if (result === 'error') {
      sessionStorage.setItem('office-sso-skip', '1')
    } else {
      sessionStorage.removeItem('office-sso-skip')
      sessionStorage.removeItem('office-sso-auto')
    }
    url.searchParams.delete('office')
    url.searchParams.delete('message')
    window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`)
    void refetchStatus().then(() => refetchBriefing())
  }, [addToast, refetchBriefing, refetchStatus])

  const missingEnvLabel = (status?.missingEnv?.length
    ? status.missingEnv
    : ['MICROSOFT_CLIENT_ID', 'MICROSOFT_CLIENT_SECRET']
  ).join(' + ')

  const connectMicrosoft = async () => {
    // Prefer same-tab GET /api/office/sso so Chrome reuses the work-account cookie jar.
    if (statusLoading) return
    if (!status?.configured) {
      addToast({
        title: 'Microsoft SSO not set up yet',
        description: `Set ${missingEnvLabel} in the server .env, Azure Web redirect must be ${status?.redirectUri || 'http://127.0.0.1:9119/api/office/callback'}, restart Hermes, then retry. Open Cowork.exe is not required.`,
        variant: 'attention',
      })
      return
    }
    setConnecting(true)
    // Direct SSO entry: 302 → login.microsoftonline.com (prompt=select_account).
    const returnTo = encodeURIComponent(`${window.location.origin}/panel/office`)
    window.location.assign(`/api/office/sso?returnTo=${returnTo}`)
  }

  // Auto SSO: when configured and not connected, redirect to Microsoft once per visit.
  useEffect(() => {
    if (statusLoading || connecting) return
    if (!status?.configured || status.connected) return
    if (status.autoSso === false) return
    if (sessionStorage.getItem('office-sso-skip') === '1') return
    if (sessionStorage.getItem('office-sso-auto') === '1') return
    sessionStorage.setItem('office-sso-auto', '1')
    void connectMicrosoft()
  }, [status, statusLoading, connecting])

  const disconnectMicrosoft = async () => {
    try {
      await apiClient.post('/api/office/disconnect')
      addToast({ title: 'Microsoft disconnected', variant: 'success' })
      await queryClient.invalidateQueries({ queryKey: ['office-status'] })
      await queryClient.invalidateQueries({ queryKey: ['office-briefing'] })
    } catch (error) {
      addToast({
        title: 'Disconnect failed',
        description: errorMessage(error, 'Could not disconnect Microsoft.'),
        variant: 'danger',
      })
    }
  }

  const connected = Boolean(status?.connected)
  const configured = Boolean(status?.configured)
  const live = Boolean(briefing?.live && briefing.stats)
  const stats = live && briefing?.stats
    ? [
        {
          label: 'Meeting time',
          value: briefing.stats.meetingTime,
          detail: `${briefing.stats.meetingCount} calendar meeting${briefing.stats.meetingCount === 1 ? '' : 's'} today`,
          accent: 'text-accent',
        },
        {
          label: 'Focus blocks',
          value: String(briefing.stats.focusBlocks),
          detail: 'Open 30m+ gaps left today',
          accent: 'text-success',
        },
        {
          label: 'Upcoming',
          value: String(briefing.stats.upcomingCount),
          detail: `${briefing.stats.onlineMeetingCount} Teams · ${briefing.stats.doneCount} done`,
          accent: 'text-attention',
        },
      ]
    : null

  const scopes =
    status?.scopes?.filter((s) => s !== 'offline_access' && s !== 'User.Read') ?? FALLBACK_SCOPES

  return (
    <div className="space-y-5 p-4">
      <section className="relative overflow-hidden rounded-2xl border border-border bg-canvas-subtle">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(99,102,241,0.22),transparent_36%),radial-gradient(circle_at_top_left,rgba(14,165,233,0.16),transparent_28%)]" />
        <div className="relative p-5 md:p-6">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-accent/30 bg-accent-muted px-3 py-1 text-xs font-medium text-accent">
                <Sparkles size={14} />
                Briefly for Office
                {live ? (
                  <span className="rounded-full bg-success/15 px-2 py-0.5 text-[10px] text-success">
                    Live Graph
                  </span>
                ) : null}
              </div>
              <h2 className="text-2xl font-semibold tracking-tight text-fg md:text-3xl">
                Your Microsoft workday, summarized before it gets noisy.
              </h2>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-fg-muted">
                Live Outlook calendar from Microsoft Graph. Attendance and transcripts load after
                Teams meetings end when permissions allow — never sample data.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {connected ? (
                <button
                  type="button"
                  onClick={() => void refetchBriefing()}
                  disabled={briefingFetching}
                  className="inline-flex items-center justify-center gap-2 rounded-full border border-border bg-canvas px-4 py-2.5 text-sm font-medium text-fg hover:bg-canvas-subtle disabled:opacity-60"
                >
                  <RefreshCw size={15} className={briefingFetching ? 'animate-spin' : undefined} />
                  Refresh
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => void connectMicrosoft()}
                disabled={connecting || statusLoading}
                className="inline-flex items-center justify-center gap-2 rounded-full bg-accent px-5 py-2.5 text-sm font-medium text-white shadow-sm shadow-accent/20 hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Building2 size={16} />
                {connecting
                  ? 'Opening Microsoft…'
                  : connected
                    ? 'Reconnect Microsoft'
                    : 'Sign in with Microsoft'}
                <ArrowRight size={15} />
              </button>
            </div>
          </div>

          {!statusLoading && status && !status.configured ? (
            <div
              className="mt-4 rounded-xl border border-danger/40 bg-danger/10 p-4 text-sm text-fg"
              data-testid="office-sso-missing-env"
            >
              <p className="font-medium text-danger">Microsoft SSO will not open until env is set</p>
              <p className="mt-1 text-xs leading-5 text-fg-muted">
                Chrome already having your work account signed in is not enough — Open Jarvis needs
                an Entra app registration. Missing:{' '}
                <code className="font-mono text-fg">{missingEnvLabel}</code>. Redirect URI:{' '}
                <code className="font-mono text-fg">
                  {status.redirectUri || 'http://127.0.0.1:9119/api/office/callback'}
                </code>
                . Set those env vars, restart Hermes, then click Sign in with Microsoft (same Chrome profile → account
                picker). This is separate from Open Cowork desktop document jobs.
              </p>
            </div>
          ) : null}

          {stats ? (
            <div className="mt-6 grid gap-3 md:grid-cols-3">
              {stats.map((card) => (
                <article
                  key={card.label}
                  className="rounded-xl border border-border/80 bg-canvas/80 p-4 shadow-sm backdrop-blur"
                >
                  <p className="text-xs font-medium text-fg-muted">{card.label}</p>
                  <div className="mt-2 flex items-end justify-between gap-3">
                    <p className={`text-2xl font-semibold ${card.accent}`}>{card.value}</p>
                    <Timer size={16} className="text-fg-muted" />
                  </div>
                  <p className="mt-2 text-xs text-fg-muted">{card.detail}</p>
                </article>
              ))}
            </div>
          ) : (
            <div className="mt-6 rounded-xl border border-dashed border-border bg-canvas/60 p-4 text-sm text-fg-muted">
              {statusLoading
                ? 'Checking Microsoft connection…'
                : statusError
                  ? 'Could not reach Office status API. Check that the server is running.'
                  : !configured
                    ? `Microsoft OAuth not configured — set ${missingEnvLabel} in .env and restart Hermes.`
                    : !connected
                      ? 'No live briefing yet. Sign in with Microsoft to pull today’s calendar from Graph.'
                      : briefingLoading
                        ? 'Loading live calendar from Microsoft Graph…'
                        : briefingError
                          ? errorMessage(briefingErr, 'Graph sync failed.')
                          : briefing?.message ?? 'Waiting for Graph sync.'}
            </div>
          )}

          <div className="mt-4 flex flex-wrap items-center gap-2 text-xs">
            <span
              className={[
                'rounded-full border px-3 py-1',
                connected
                  ? 'border-success/30 bg-success/10 text-success'
                  : configured
                    ? 'border-attention/30 bg-attention/10 text-attention'
                    : 'border-danger/30 bg-danger/10 text-danger',
              ].join(' ')}
            >
              {statusLoading
                ? 'Checking Microsoft status...'
                : connected
                  ? `Connected${status?.account?.email ? ` as ${status.account.email}` : ''}`
                  : configured
                    ? 'Ready — Sign in with Microsoft'
                    : `Missing ${missingEnvLabel}`}
            </span>
            {connected ? (
              <button
                type="button"
                onClick={() => void disconnectMicrosoft()}
                className="rounded-full border border-border px-3 py-1 text-fg-muted hover:text-fg"
              >
                Disconnect
              </button>
            ) : null}
            <span className="text-fg-muted">
              {configured && status?.autoSso !== false
                ? 'Auto SSO is on — opens login.microsoftonline.com account picker when not connected.'
                : configured
                  ? 'Microsoft will ask which account to use when more than one is signed in.'
                  : 'SSO does not use Open Cowork.exe — only MICROSOFT_* env + Azure Web redirect.'}
            </span>
            {briefing?.syncedAt ? (
              <span className="text-fg-muted">
                Synced {new Date(briefing.syncedAt).toLocaleTimeString()}
              </span>
            ) : null}
          </div>
        </div>
      </section>

      <div className="grid gap-5 xl:grid-cols-[1.25fr_0.75fr]">
        <section className="rounded-2xl border border-border bg-canvas-subtle p-4">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <CalendarDays size={16} className="text-accent" />
                <h3 className="text-sm font-medium text-fg">Today at a glance</h3>
              </div>
              <p className="mt-1 text-xs text-fg-muted">
                Live Outlook calendarView from Microsoft Graph.
              </p>
            </div>
            <span
              className={[
                'rounded-full px-2.5 py-1 text-xs font-medium',
                live ? 'bg-success/10 text-success' : 'bg-canvas text-fg-muted',
              ].join(' ')}
            >
              {live ? 'Live' : 'Not synced'}
            </span>
          </div>

          {!connected ? (
            <EmptyState
              title="Sign in with Microsoft"
              description="Agenda stays empty until Graph auth succeeds — no placeholder meetings. Open Cowork is not required for calendar SSO."
              action={
                <button
                  type="button"
                  onClick={() => void connectMicrosoft()}
                  disabled={connecting || statusLoading}
                  className="rounded-md bg-accent px-3 py-1.5 text-xs text-white disabled:opacity-60"
                >
                  Sign in with Microsoft
                </button>
              }
            />
          ) : briefingLoading ? (
            <Skeleton className="h-28 w-full" />
          ) : briefingError ? (
            <EmptyState
              title="Could not load calendar"
              description={errorMessage(briefingErr, briefing?.error ?? 'Graph request failed.')}
              action={
                <button
                  type="button"
                  onClick={() => void refetchBriefing()}
                  className="text-xs text-accent"
                >
                  Retry
                </button>
              }
            />
          ) : !briefing?.agenda?.length ? (
            <EmptyState
              title="No meetings today"
              description="Microsoft Graph returned no calendar events for today."
            />
          ) : (
            <div className="space-y-3">
              {briefing.agenda.map((item) => (
                <article
                  key={item.id}
                  className="group rounded-xl border border-border bg-canvas p-3 transition-shell hover:border-accent/40"
                >
                  <div className="flex items-start gap-3">
                    <div className="min-w-16 rounded-lg bg-accent-muted px-2.5 py-2 text-center text-xs font-medium text-accent">
                      {item.timeLabel}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h4 className="text-sm font-medium text-fg">{item.title}</h4>
                        <span
                          className={`rounded-full border px-2 py-0.5 text-[10px] ${statusTone(item.status)}`}
                        >
                          {item.status}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-fg-muted">{item.meta}</p>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        <section className="rounded-2xl border border-border bg-canvas-subtle p-4">
          <div className="mb-4 flex items-center gap-2">
            <Bot size={16} className="text-accent" />
            <h3 className="text-sm font-medium text-fg">Briefing summary</h3>
          </div>
          {!connected || !briefing?.insights?.length ? (
            <p className="rounded-xl border border-dashed border-border bg-canvas p-3 text-sm text-fg-muted">
              {connected
                ? 'No summary yet — waiting on live calendar data.'
                : 'Summary is generated from your live calendar after connect.'}
            </p>
          ) : (
            <div className="space-y-3">
              {briefing.insights.map((insight) => (
                <p
                  key={insight}
                  className="rounded-xl border border-border bg-canvas p-3 text-sm leading-6 text-fg"
                >
                  {insight}
                </p>
              ))}
              {briefing.note ? (
                <p className="text-xs leading-5 text-fg-muted">{briefing.note}</p>
              ) : null}
            </div>
          )}
        </section>
      </div>

      <div className="grid gap-5 xl:grid-cols-[0.85fr_1.15fr]">
        <section className="rounded-2xl border border-border bg-canvas-subtle p-4">
          <div className="mb-4 flex items-center gap-2">
            <ClipboardList size={16} className="text-accent" />
            <h3 className="text-sm font-medium text-fg">Next actions</h3>
          </div>
          {!connected || !briefing?.actions?.length ? (
            <p className="rounded-xl border border-dashed border-border bg-canvas p-3 text-sm text-fg-muted">
              Actions appear from upcoming and completed Teams meetings once Graph syncs.
            </p>
          ) : (
            <div className="space-y-2">
              {briefing.actions.map((item) => (
                <label
                  key={item}
                  className="flex cursor-pointer items-start gap-3 rounded-xl border border-border bg-canvas p-3 text-sm text-fg"
                >
                  <input type="checkbox" className="mt-1" />
                  <span>{item}</span>
                </label>
              ))}
            </div>
          )}
        </section>

        <section className="rounded-2xl border border-border bg-canvas-subtle p-4">
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <LockKeyhole size={16} className="text-accent" />
                <h3 className="text-sm font-medium text-fg">Secure Microsoft Graph setup</h3>
              </div>
              <p className="mt-1 text-xs leading-5 text-fg-muted">
                Confidential Web app + auth code + PKCE (Microsoft identity platform). Tokens stay
                encrypted server-side. Never scrape browser cookies.
              </p>
              {status?.redirectUri ? (
                <p className="mt-2 rounded-lg border border-border bg-canvas px-3 py-2 font-mono text-[11px] text-fg-muted">
                  Azure Web redirect URI: {status.redirectUri}
                </p>
              ) : null}
              {status?.flow ? (
                <p className="mt-1 text-[11px] text-fg-muted">
                  Flow: {status.flow}
                  {status.azurePlatform ? ` · Platform: ${status.azurePlatform}` : ''}
                </p>
              ) : null}
            </div>
            <CalendarCheck size={18} className="shrink-0 text-fg-muted" />
          </div>

          <div className="grid gap-2 md:grid-cols-2">
            {scopes.map((scope) => (
              <div key={scope} className="rounded-lg border border-border bg-canvas px-3 py-2">
                <p className="font-mono text-xs text-fg">{scope}</p>
              </div>
            ))}
          </div>

          <div className="mt-3 flex items-start gap-2 rounded-xl border border-attention/30 bg-attention/10 p-3 text-xs leading-5 text-attention">
            <FileText size={15} className="mt-0.5 shrink-0" />
            <p>
              Permanent setup: Entra app registration → Authentication → <strong>Web</strong>{' '}
              platform → redirect URI above. Set both{' '}
              <code className="font-mono">MICROSOFT_CLIENT_ID</code> and{' '}
              <code className="font-mono">MICROSOFT_CLIENT_SECRET</code>, restart server, then Connect
              Microsoft. Transcript scopes are optional and need admin consent later.
            </p>
          </div>
        </section>
      </div>
    </div>
  )
}
