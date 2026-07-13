/**
 * Open Jarvis — Office panel.
 * (A) Briefing = Microsoft Graph SSO (email/calendar) — no Open Cowork.exe needed.
 * (B) Documents = optional Open Cowork desktop document jobs.
 */
import { useMemo, useState } from 'react'
import { useRouterState } from '@tanstack/react-router'
import { BriefingPanel } from '@app/components/panels/BriefingPanel'
import { OfficeDocumentsPanel } from '@app/components/panels/OfficeDocumentsPanel'

type OfficeTab = 'briefing' | 'documents'

function tabFromSearch(search: string): OfficeTab {
  const q = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search)
  return q.get('tab') === 'documents' ? 'documents' : 'briefing'
}

export function OfficePanel() {
  const search = useRouterState({ select: (s) => s.location.searchStr })
  const initial = useMemo(() => tabFromSearch(search), [search])
  const [tab, setTab] = useState<OfficeTab>(initial)

  return (
    <div className="space-y-4" data-testid="office-panel">
      <p className="px-1 text-[11px] leading-4 text-fg-muted">
        <span className="font-medium text-fg">Two separate things:</span> Briefing uses Sign in with
        Microsoft (browser SSO / Graph). Documents optionally use Open Cowork.exe for local file
        jobs — not required for email SSO.
      </p>
      <div className="flex gap-1 border-b border-border" role="tablist" aria-label="Office sections">
        {(
          [
            ['briefing', 'Briefing (Microsoft SSO)'],
            ['documents', 'Documents (Cowork)'],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            data-testid={`office-tab-${id}`}
            onClick={() => setTab(id)}
            className={`px-3 py-1.5 text-xs ${
              tab === id
                ? 'border-b-2 border-accent text-accent'
                : 'text-fg-muted hover:text-fg'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'briefing' ? <BriefingPanel /> : <OfficeDocumentsPanel />}
    </div>
  )
}
