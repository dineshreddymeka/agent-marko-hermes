import { useEffect, useState } from 'react'
import { useChatStore } from '@app/stores/chat'
import { useSettingsStore } from '@app/stores/settings'
import { hermesAuthHeaders } from '@app/lib/api'
import { labelTitle, modelLabel } from '@app/lib/display-names'

interface ContextRingProps {
  used?: number
  max?: number
}

export function ContextRing({ used = 0, max = 128_000 }: ContextRingProps) {
  const pct = max > 0 ? Math.min(used / max, 1) : 0
  const radius = 7
  const circumference = 2 * Math.PI * radius
  const offset = circumference * (1 - pct)

  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 18 18"
      aria-label={`Context usage ${Math.round(pct * 100)}%`}
      role="img"
    >
      <circle
        cx="9"
        cy="9"
        r={radius}
        fill="none"
        stroke="var(--color-border)"
        strokeWidth="2"
      />
      <circle
        cx="9"
        cy="9"
        r={radius}
        fill="none"
        stroke="var(--color-accent)"
        strokeWidth="2"
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        transform="rotate(-90 9 9)"
      />
    </svg>
  )
}

type HealthLlm = {
  mode: 'mock' | 'live'
  mock: boolean
  model: string | null
}

export function StatusFooter() {
  const contextUsage = useChatStore((s) => s.contextUsage)
  const settingsModel = useSettingsStore((s) => s.model)
  const [llm, setLlm] = useState<HealthLlm | null>(null)

  useEffect(() => {
    let cancelled = false
    const tick = async () => {
      // No health polling from hidden tabs.
      if (document.visibilityState !== 'visible') return
      try {
        const res = await fetch('/api/health', {
          credentials: 'include',
          headers: hermesAuthHeaders(),
        })
        if (!res.ok) return
        const data = (await res.json()) as { llm?: HealthLlm }
        if (!cancelled && data.llm) setLlm(data.llm)
      } catch {
        /* ignore */
      }
    }
    void tick()
    const id = window.setInterval(() => void tick(), 15_000)
    const onVisibility = () => {
      if (document.visibilityState === 'visible') void tick()
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      cancelled = true
      window.clearInterval(id)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [])

  const tokensUsed = contextUsage?.used ?? 0
  const tokensMax = contextUsage?.limit ?? 128_000
  const rawModel =
    llm?.mock ? 'mock' : (llm?.model ?? settingsModel)
  const modelDisplay = modelLabel(rawModel)
  const modeHint = llm?.mock
    ? 'Mock LLM (HERMES_MOCK_LLM)'
    : llm
      ? 'Live LLM'
      : undefined

  return (
    <footer className="flex h-8 shrink-0 items-center justify-between border-t border-border bg-canvas-subtle px-3 text-xs text-fg-muted">
      <span title={modeHint ?? labelTitle(rawModel, modelDisplay)}>
        {llm?.mock ? 'Mock LLM' : modelDisplay}
        {llm && !llm.mock ? (
          <span className="ml-1 text-fg-muted/70">· live</span>
        ) : null}
      </span>
      <div className="flex items-center gap-2">
        <ContextRing used={tokensUsed} max={tokensMax} />
        <span>
          {tokensUsed.toLocaleString()} / {tokensMax.toLocaleString()} tokens
        </span>
      </div>
    </footer>
  )
}
