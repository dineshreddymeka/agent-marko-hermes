import { describe, expect, test } from 'bun:test'
import {
  hermesMcpCreateBody,
  hermesMcpNextToolWhitelist,
  hermesMcpServerToDto,
  type HermesMcpServerSummary,
} from '../src/lib/hermes-adapters'

function summary(partial: Partial<HermesMcpServerSummary> & Pick<HermesMcpServerSummary, 'name'>): HermesMcpServerSummary {
  return {
    transport: 'stdio',
    url: null,
    command: 'npx mcp',
    args: [],
    env: {},
    auth: null,
    enabled: true,
    tools: null,
    ...partial,
  }
}

describe('hermes MCP adapters', () => {
  test('hermesMcpServerToDto uses name as id', () => {
    const dto = hermesMcpServerToDto(summary({ name: 'filesystem' }))
    expect(dto.id).toBe('filesystem')
    expect(dto.name).toBe('filesystem')
    expect(dto.transport).toBe('stdio')
    expect(dto.toolWhitelist).toBeNull()
  })

  test('hermesMcpServerToDto maps http transport and tools allowlist', () => {
    const dto = hermesMcpServerToDto(
      summary({
        name: 'remote',
        transport: 'http',
        command: null,
        url: 'http://127.0.0.1:3921/mcp',
        tools: ['search', 'fetch'],
      }),
    )
    expect(dto.transport).toBe('http')
    expect(dto.url).toBe('http://127.0.0.1:3921/mcp')
    expect(dto.toolWhitelist).toEqual(['search', 'fetch'])
  })

  test('hermesMcpCreateBody strips Jarvis-only fields', () => {
    expect(
      hermesMcpCreateBody({
        name: 'memory',
        transport: 'stdio',
        command: 'npx -y @modelcontextprotocol/server-memory',
      }),
    ).toEqual({
      name: 'memory',
      command: 'npx -y @modelcontextprotocol/server-memory',
    })
    expect(
      hermesMcpCreateBody({
        name: 'remote',
        transport: 'http',
        url: 'http://127.0.0.1:3921/mcp',
      }),
    ).toEqual({
      name: 'remote',
      url: 'http://127.0.0.1:3921/mcp',
    })
  })

  test('hermesMcpNextToolWhitelist blocks from all-tools and restores all', () => {
    const all = ['a', 'b', 'c']
    expect(hermesMcpNextToolWhitelist(null, 'b', all)).toEqual(['a', 'c'])
    expect(hermesMcpNextToolWhitelist(['a', 'c'], 'b', all)).toBeNull()
    expect(hermesMcpNextToolWhitelist(['a'], 'a', all)).toEqual([])
  })
})
