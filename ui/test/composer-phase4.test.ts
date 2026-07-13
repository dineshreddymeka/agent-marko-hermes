import { describe, expect, test } from 'vitest'
import {
  filterSlashCommands,
  listSlashCommands,
  matchSlashCommand,
  registerSlashCommand,
  syncCapabilitySlashCommands,
} from '../src/lib/slash-commands'
import { formatAttachmentLine } from '../src/lib/workspace-upload'
import { isFrontendTool, getFrontendTools } from '../src/lib/agui/frontend-tools'

describe('slash command registry', () => {
  test('lists planned Phase 4 commands', () => {
    const cmds = listSlashCommands().map((c) => c.cmd)
    for (const required of ['/new', '/clear', '/model', '/skill', '/memory', '/connections', '/office', '/cowork', '/cron', '/tasks', '/scheduled', '/theme']) {
      expect(cmds).toContain(required)
    }
  })

  test('filters by prefix', () => {
    const hits = filterSlashCommands('/mo')
    expect(hits.map((c) => c.cmd)).toEqual(['/model'])
  })

  test('matches command with args', () => {
    const match = matchSlashCommand('/model gpt-4o')
    expect(match?.command.cmd).toBe('/model')
    expect(match?.args).toBe('gpt-4o')
  })

  test('registerSlashCommand is extensible', () => {
    registerSlashCommand({ cmd: '/test-ext', desc: 'ext' })
    expect(filterSlashCommands('/test-ext').some((c) => c.cmd === '/test-ext')).toBe(true)
  })

  test('syncCapabilitySlashCommands registers MCP prompts', () => {
    syncCapabilitySlashCommands([
      { name: 'summarize', description: 'Summarize selection', server: 'demo' },
      { name: '/translate', description: 'Translate text', server: 'demo' },
    ])
    const cmds = listSlashCommands().map((c) => c.cmd)
    expect(cmds).toContain('/summarize')
    expect(cmds).toContain('/translate')
    expect(filterSlashCommands('/summarize')[0]?.desc).toBe('Summarize selection')
  })
})

describe('workspace attachment helper', () => {
  test('formats attachment line for message body', () => {
    expect(
      formatAttachmentLine({
        id: '1',
        name: 'a.txt',
        path: 'uploads/1-a.txt',
        size: 3,
      }),
    ).toBe('[Attached: uploads/1-a.txt]')
  })
})

describe('frontend tools registry', () => {
  test('exposes Phase 4 tools', () => {
    const names = getFrontendTools().map((t) => t.name)
    expect(names).toContain('open_file_preview')
    expect(names).toContain('switch_panel')
    expect(names).toContain('render_chart')
    expect(names).toContain('set_theme')
    expect(isFrontendTool('set_theme')).toBe(true)
    expect(isFrontendTool('run_shell')).toBe(false)
  })
})
