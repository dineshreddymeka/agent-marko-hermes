export interface SlashCommand {
  cmd: string
  desc: string
  /** Optional argument hint shown in autocomplete */
  argHint?: string
}

/** Extensible slash-command registry for the composer. */
const registry: SlashCommand[] = [
  { cmd: '/new', desc: 'New session' },
  { cmd: '/clear', desc: 'Clear messages' },
  { cmd: '/model', desc: 'Switch model', argHint: '[name]' },
  { cmd: '/skill', desc: 'Open skills panel' },
  { cmd: '/memory', desc: 'Open memory panel' },
  { cmd: '/connections', desc: 'Open MCP connections panel' },
  { cmd: '/mcp', desc: 'Open MCP connections panel' },
  { cmd: '/office', desc: 'Open Office Briefly (Microsoft calendar + documents)' },
  { cmd: '/briefing', desc: 'Open Office Briefly briefing' },
  {
    cmd: '/cowork',
    desc: 'Ask chat to run Open Cowork (documents)',
    argHint: '[goal]',
  },
  { cmd: '/cron', desc: 'Open Cowork panel' },
  { cmd: '/tasks', desc: 'Open Cowork panel' },
  { cmd: '/scheduled', desc: 'Open Cowork panel' },
  { cmd: '/theme', desc: 'Cycle theme' },
]

export function listSlashCommands(): readonly SlashCommand[] {
  return registry
}

/** Register an additional slash command (extensible registry). */
export function registerSlashCommand(command: SlashCommand): void {
  const existing = registry.findIndex((c) => c.cmd === command.cmd)
  if (existing >= 0) {
    registry[existing] = command
  } else {
    registry.push(command)
  }
}

/** Sync MCP slash commands from GET /api/capabilities manifest. */
export function syncCapabilitySlashCommands(
  cmds: ReadonlyArray<{ name: string; description: string }>,
): void {
  for (const entry of cmds) {
    const cmd = entry.name.startsWith('/') ? entry.name : `/${entry.name}`
    registerSlashCommand({
      cmd,
      desc: entry.description || `MCP prompt ${cmd}`,
    })
  }
}

/** Filter commands by the current composer token (e.g. `/mo` → `/model`). */
export function filterSlashCommands(input: string): SlashCommand[] {
  const token = (input.split(/\s/)[0] ?? '').toLowerCase()
  if (!token.startsWith('/')) return []
  return registry.filter((c) => c.cmd.startsWith(token))
}

export function matchSlashCommand(
  input: string,
): { command: SlashCommand; args: string } | null {
  const trimmed = input.trim()
  if (!trimmed.startsWith('/')) return null
  const space = trimmed.indexOf(' ')
  const cmdToken = space === -1 ? trimmed : trimmed.slice(0, space)
  const args = space === -1 ? '' : trimmed.slice(space + 1).trim()
  const exact = registry.find((c) => c.cmd === cmdToken)
  if (!exact) return null
  return { command: exact, args }
}
