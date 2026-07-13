import { describe, expect, test } from 'vitest'
import {
  HERMES_WIDGET_TYPES,
  STANDARD_CATALOG_TYPES,
  renderCatalogComponent,
} from '../src/components/a2ui/catalog'

describe('A2UI standard catalog (SoT Phase 5)', () => {
  test('exports all SoT standard component types', () => {
    for (const type of [
      'Text',
      'Image',
      'Button',
      'TextField',
      'Select',
      'Radio',
      'Checkbox',
      'DateTime',
      'Slider',
      'List',
      'Table',
      'Card',
      'Tabs',
      'Divider',
      'ProgressBar',
      'Video',
      'Audio',
    ]) {
      expect(STANDARD_CATALOG_TYPES).toContain(type as (typeof STANDARD_CATALOG_TYPES)[number])
    }
    expect(STANDARD_CATALOG_TYPES).toHaveLength(17)
  })

  test('exports six Hermes widgets', () => {
    expect(HERMES_WIDGET_TYPES).toEqual([
      'hermes:SkillCard',
      'hermes:MemoryEntryEditor',
      'hermes:CronSchedulePicker',
      'hermes:FileDiff',
      'hermes:DocumentRequestForm',
      'hermes:FormRequestForm',
    ])
  })

  test('renders every standard type without Unknown placeholder', () => {
    const actions: string[] = []
    const onAction = (a: string) => actions.push(a)

    for (const type of STANDARD_CATALOG_TYPES) {
      const node = renderCatalogComponent(
        {
          id: `c-${type}`,
          type,
          props: {
            text: 'hi',
            label: 'L',
            src: 'https://example.com/x',
            value: '1',
            options: [{ value: 'a', label: 'A' }],
            items: ['one'],
            columns: ['A'],
            rows: [['1']],
            tabs: [{ id: 't1', label: 'Tab', content: 'body' }],
            title: 'Card',
            children: 'body',
          },
        },
        {},
        onAction,
      )
      const serialized = JSON.stringify(node)
      expect(serialized).not.toContain('Unknown component')
      expect(node).toBeTruthy()
    }
  })

  test('Button click emits action', () => {
    const seen: Array<{ action: string; data: unknown }> = []
    const node = renderCatalogComponent(
      {
        id: 'btn',
        type: 'Button',
        props: { label: 'Go', action: 'submit_form' },
      },
      {},
      (action, data) => seen.push({ action, data }),
    ) as { props: { onClick: () => void } }

    node.props.onClick()
    expect(seen[0]?.action).toBe('submit_form')
  })
})
