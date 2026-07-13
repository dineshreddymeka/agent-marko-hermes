import { useEffect, useState } from 'react'
import type { McpServer, Skill } from '@hermes/shared'

interface CronSchedulePickerProps {
  name?: string
  schedule?: string
  prompt?: string
  timezone?: string
  mcpServerIds?: string[]
  skillIds?: string[]
  onAction?: (action: string, data: unknown) => void
}

/**
 * A2UI cron widget — posts the same workflow DTO as the Cron panel wizard so
 * chat-created jobs carry MCP/skill bindings too. Options load live from REST.
 */
export function CronSchedulePicker({
  name: initialName = '',
  schedule: initialSchedule = '0 9 * * *',
  prompt: initialPrompt = '',
  timezone: initialTimezone = 'UTC',
  mcpServerIds: initialMcpServerIds = [],
  skillIds: initialSkillIds = [],
  onAction,
}: CronSchedulePickerProps) {
  const [name, setName] = useState(initialName)
  const [schedule, setSchedule] = useState(initialSchedule)
  const [prompt, setPrompt] = useState(initialPrompt)
  const [timezone, setTimezone] = useState(initialTimezone)
  const [mcpServerIds, setMcpServerIds] = useState<string[]>(initialMcpServerIds)
  const [skillIds, setSkillIds] = useState<string[]>(initialSkillIds)
  const [mcpServers, setMcpServers] = useState<McpServer[]>([])
  const [skills, setSkills] = useState<Skill[]>([])

  useEffect(() => {
    let cancelled = false
    void fetch('/api/mcp', { credentials: 'include' })
      .then((r) => (r.ok ? (r.json() as Promise<{ servers: McpServer[] }>) : null))
      .then((data) => {
        if (!cancelled && data?.servers) setMcpServers(data.servers)
      })
      .catch(() => undefined)
    void fetch('/api/skills', { credentials: 'include' })
      .then((r) => (r.ok ? (r.json() as Promise<Skill[]>) : null))
      .then((data) => {
        if (!cancelled && Array.isArray(data)) setSkills(data)
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [])

  const toggle = (list: string[], id: string) =>
    list.includes(id) ? list.filter((x) => x !== id) : [...list, id]

  return (
    <div className="space-y-3" data-testid="a2ui-cron-picker">
      <input
        type="text"
        placeholder="Task name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="w-full rounded border border-border bg-canvas px-2 py-1 text-sm text-fg"
      />
      <input
        type="text"
        placeholder="Schedule (e.g. 0 9 * * *)"
        value={schedule}
        onChange={(e) => setSchedule(e.target.value)}
        className="w-full rounded border border-border bg-canvas px-2 py-1 font-mono text-sm text-fg"
      />
      <p className="text-xs text-fg-muted">e.g. 0 9 * * * = daily at 9am</p>
      <input
        type="text"
        placeholder="Timezone (e.g. UTC)"
        value={timezone}
        onChange={(e) => setTimezone(e.target.value)}
        className="w-full rounded border border-border bg-canvas px-2 py-1 text-sm text-fg"
      />
      <textarea
        placeholder="Agent prompt"
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        rows={3}
        className="w-full rounded border border-border bg-canvas px-2 py-1 text-sm text-fg"
      />

      {mcpServers.length > 0 && (
        <div>
          <p className="mb-1 text-xs font-medium text-fg-muted">MCP servers (empty = no MCP)</p>
          <ul className="max-h-24 space-y-0.5 overflow-y-auto" data-testid="a2ui-cron-mcp">
            {mcpServers.map((server) => (
              <li key={server.id}>
                <label className="flex cursor-pointer items-center gap-2 text-xs text-fg">
                  <input
                    type="checkbox"
                    checked={mcpServerIds.includes(server.id)}
                    onChange={() => setMcpServerIds((ids) => toggle(ids, server.id))}
                  />
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${
                      server.enabled && server.lastStatus === 'connected'
                        ? 'bg-success'
                        : 'bg-danger'
                    }`}
                  />
                  {server.name}
                </label>
              </li>
            ))}
          </ul>
        </div>
      )}

      {skills.length > 0 && (
        <div>
          <p className="mb-1 text-xs font-medium text-fg-muted">Forced skills</p>
          <ul className="max-h-24 space-y-0.5 overflow-y-auto" data-testid="a2ui-cron-skills">
            {skills.map((skill) => (
              <li key={skill.id}>
                <label className="flex cursor-pointer items-center gap-2 text-xs text-fg">
                  <input
                    type="checkbox"
                    checked={skillIds.includes(skill.id)}
                    onChange={() => setSkillIds((ids) => toggle(ids, skill.id))}
                  />
                  {skill.name}
                </label>
              </li>
            ))}
          </ul>
        </div>
      )}

      <button
        type="button"
        onClick={() =>
          onAction?.('create_cron', { name, schedule, prompt, timezone, mcpServerIds, skillIds })
        }
        className="rounded bg-accent px-3 py-1 text-xs text-accent-fg"
      >
        Create scheduled task
      </button>
    </div>
  )
}
