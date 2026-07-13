import { describe, expect, test } from 'bun:test'
import { HERMES_CATALOG_IDS } from '../src/a2ui-catalog'
import type { HermesCustomEventName } from '../src/agui-events'

describe('@hermes/shared', () => {
  test('exports catalog component ids', () => {
    expect(HERMES_CATALOG_IDS).toHaveLength(6)
    expect(HERMES_CATALOG_IDS).toContain('hermes:SkillCard')
  })

  test('agui event names are typed', () => {
    const name: HermesCustomEventName = 'hermes.context'
    expect(name).toBe('hermes.context')
  })
})
