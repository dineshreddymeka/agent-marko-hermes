export interface AgentState {
  todos?: Array<{ id: string; text: string; done: boolean }>
  plan?: string
  workspaceContext?: Record<string, unknown>
}

export interface McpServer {
  id: string
  name: string
  transport: 'stdio' | 'http'
  command: string | null
  url: string | null
  env: Record<string, string> | null
  headers: Record<string, string> | null
  enabled: boolean
  toolWhitelist: string[] | null
  createdAt: string
}
