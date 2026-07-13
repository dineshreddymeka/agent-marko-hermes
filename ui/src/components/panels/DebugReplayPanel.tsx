import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { Play, RefreshCw, Activity } from 'lucide-react'
import {
  fetchDebugHealth,
  fetchRecentRuns,
  replayRunEvents,
  type DebugHealth,
  type RecentRun,
} from '@app/lib/agui/replay'
import { useChatStore } from '@app/stores/chat'
import { Skeleton } from '@app/components/common/Skeleton'
import { EmptyState } from '@app/components/common/EmptyState'

export function DebugReplayPanel() {
  const navigate = useNavigate()
  const lastRunId = useChatStore((s) => s.runId)
  const recentEvents = useChatStore((s) => s.recentEvents)

  const [health, setHealth] = useState<DebugHealth | null>(null)
  const [runs, setRuns] = useState<RecentRun[]>([])
  const [runId, setRunId] = useState(lastRunId ?? '')
  const [loading, setLoading] = useState(true)
  const [replaying, setReplaying] = useState(false)
  const [lastReplayCount, setLastReplayCount] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [h, r] = await Promise.all([fetchDebugHealth(), fetchRecentRuns()])
      setHealth(h)
      setRuns(r)
      setRunId((current) => current || r[0]?.runId || '')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Debug API unavailable')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    if (lastRunId) setRunId(lastRunId)
  }, [lastRunId])

  const replay = async (targetRunId: string, sessionId?: string | null) => {
    setReplaying(true)
    setError(null)
    try {
      const count = await replayRunEvents(targetRunId, { sessionId, delayMs: 0 })
      setLastReplayCount(count)
      if (sessionId) {
        void navigate({ to: '/session/$id', params: { id: sessionId } })
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Replay failed')
    } finally {
      setReplaying(false)
    }
  }

  if (loading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-3/4" />
      </div>
    )
  }

  return (
    <div className="space-y-4 text-sm">
      {error ? (
        <p className="rounded border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">
          {error}
        </p>
      ) : null}

      <section className="rounded-lg border border-border p-3">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="flex items-center gap-1 text-xs font-medium uppercase tracking-wide text-fg-muted">
            <Activity size={14} /> Server diagnostics
          </h3>
          <button
            type="button"
            onClick={() => void load()}
            className="text-fg-muted hover:text-fg"
            title="Refresh"
          >
            <RefreshCw size={14} />
          </button>
        </div>
        {health ? (
          <dl className="grid grid-cols-2 gap-x-4 gap-y-1 font-mono text-xs text-fg-muted">
            <dt>Status</dt>
            <dd className="text-fg">{health.status}</dd>
            <dt>Database</dt>
            <dd className="text-fg">{health.database}</dd>
            <dt>Active runs</dt>
            <dd className="text-fg">{health.activeRuns}</dd>
            <dt>Embed queue</dt>
            <dd className="text-fg">{health.embeddingQueue}</dd>
            <dt>Uptime</dt>
            <dd className="text-fg">{Math.round(health.uptime)}s</dd>
          </dl>
        ) : (
          <p className="text-xs text-fg-muted">Diagnostics unavailable</p>
        )}
      </section>

      <section>
        <label className="mb-1 block text-xs text-fg-muted">Run ID to replay</label>
        <div className="flex gap-2">
          <input
            type="text"
            value={runId}
            onChange={(e) => setRunId(e.target.value)}
            placeholder="00000000-0000-4000-8000-..."
            className="min-w-0 flex-1 rounded border border-border bg-canvas px-2 py-1.5 font-mono text-xs text-fg"
          />
          <button
            type="button"
            disabled={!runId.trim() || replaying}
            onClick={() => void replay(runId.trim())}
            className="flex shrink-0 items-center gap-1 rounded bg-accent px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
          >
            <Play size={12} /> Replay
          </button>
        </div>
        {lastReplayCount !== null ? (
          <p className="mt-1 text-xs text-success">Replayed {lastReplayCount} events into the UI.</p>
        ) : null}
      </section>

      <section>
        <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-fg-muted">
          Recent recorded runs
        </h3>
        {runs.length === 0 ? (
          <EmptyState
            title="No recorded runs"
            description="Complete an AG-UI run with Postgres running to record events."
            className="py-6"
          />
        ) : (
          <ul className="max-h-48 space-y-1 overflow-y-auto">
            {runs.map((run) => (
              <li key={run.runId}>
                <button
                  type="button"
                  disabled={replaying}
                  onClick={() => void replay(run.runId, run.sessionId)}
                  className="flex w-full items-center justify-between rounded border border-border px-2 py-1.5 text-left font-mono text-[11px] hover:bg-canvas-subtle"
                >
                  <span className="truncate text-fg">{run.runId.slice(0, 8)}…</span>
                  <span className="shrink-0 text-fg-muted">{run.eventCount} evt</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-fg-muted">
          Client event buffer ({recentEvents.length})
        </h3>
        <pre className="max-h-40 overflow-auto rounded border border-border bg-canvas-inset p-2 font-mono text-[10px] text-fg-muted">
          {recentEvents.slice(-10).join('\n') || 'No events captured yet.'}
        </pre>
      </section>
    </div>
  )
}
