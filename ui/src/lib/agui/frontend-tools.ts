import { useSettingsStore } from '@app/stores/settings'
import { useUiStore, type PanelName } from '@app/stores/ui'

export interface FrontendTool {
  name: string
  description: string
  parameters: Record<string, unknown>
}

const registry: Record<
  string,
  (args: Record<string, unknown>) => Promise<unknown>
> = {
  open_file_preview: async (args) => {
    const path = String(args.path ?? '')
    const ui = useUiStore.getState()
    ui.setWorkspacePreviewPath(path || null)
    ui.setActivePanel('workspace')
    ui.setRightPanelOpen(true)
    return { opened: path }
  },
  switch_panel: async (args) => {
    const panel = args.panel as PanelName
    const ui = useUiStore.getState()
    ui.setActivePanel(panel)
    ui.setRightPanelOpen(true)
    return { panel }
  },
  render_chart: async (args) => {
    const data = (args.data as number[]) ?? []
    if (!data.length) return { svg: '', data: [] }
    const max = Math.max(...data, 1)
    const svg = `<svg width="${Math.max(200, data.length * 12)}" height="40" role="img" aria-label="chart">${data
      .map((v, i) => {
        const h = Math.max(2, (v / max) * 36)
        return `<rect x="${i * 12}" y="${40 - h}" width="10" height="${h}" fill="var(--color-accent)"/>`
      })
      .join('')}</svg>`
    return { svg, data }
  },
  set_theme: async (args) => {
    const theme = args.theme as 'dark' | 'dim' | 'light'
    useSettingsStore.getState().setTheme(theme)
    return { theme }
  },
}

export function isFrontendTool(name: string): boolean {
  return name in registry
}

export function getFrontendTools(): FrontendTool[] {
  return [
    {
      name: 'open_file_preview',
      description: 'Open a workspace file in the preview panel',
      parameters: {
        type: 'object',
        properties: { path: { type: 'string' } },
        required: ['path'],
      },
    },
    {
      name: 'switch_panel',
      description: 'Switch the right-hand panel',
      parameters: {
        type: 'object',
        properties: {
          panel: {
            type: 'string',
            enum: ['sessions', 'workspace', 'skills', 'memory', 'connections', 'office', 'briefing', 'cron', 'profiles', 'settings'],
          },
        },
        required: ['panel'],
      },
    },
    {
      name: 'render_chart',
      description: 'Render a lightweight SVG bar chart from numeric data',
      parameters: {
        type: 'object',
        properties: { data: { type: 'array', items: { type: 'number' } } },
        required: ['data'],
      },
    },
    {
      name: 'set_theme',
      description: 'Set UI theme to dark, dim, or light',
      parameters: {
        type: 'object',
        properties: { theme: { type: 'string', enum: ['dark', 'dim', 'light'] } },
        required: ['theme'],
      },
    },
  ]
}

export async function executeFrontendTool(
  name: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  const handler = registry[name]
  if (!handler) throw new Error(`Unknown frontend tool: ${name}`)
  return handler(args)
}
