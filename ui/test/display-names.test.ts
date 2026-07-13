import { describe, expect, test } from 'vitest'
import { modelLabel, prettifyIdentifier, resolveNameOrId, shortenId } from '@app/lib/display-names'
import {
  connectionStatusLabel,
  memoryKindLabel,
  toolCallStatusLabel,
  toolLabel,
} from '@app/lib/labels'

describe('display-names', () => {
  test('modelLabel maps known ids', () => {
    expect(modelLabel('gpt-4o')).toBe('GPT-4o')
    expect(modelLabel('gpt-5.4-nano-medium')).toBe('GPT-5.4 Nano — fast & low cost')
    expect(modelLabel('composer-2.5')).toBe('Composer 2.5')
    expect(modelLabel('composer-2.5-fast')).toBe('Composer 2.5 — fast')
  })

  test('modelLabel prettifies unknown ids', () => {
    expect(modelLabel('some-new-model-v2')).toBe('Some NEW Model V2')
  })

  test('shortenId truncates long ids', () => {
    expect(shortenId('abcdef1234567890')).toBe('abcd…')
  })

  test('resolveNameOrId prefers names', () => {
    const map = new Map([['id-1', 'Filesystem']])
    expect(resolveNameOrId('id-1', map)).toBe('Filesystem')
    expect(resolveNameOrId('missing-id-xyz', map)).toBe('miss…')
  })

  test('prettifyIdentifier strips vendor prefix', () => {
    expect(prettifyIdentifier('openai/gpt-4o-mini')).toBe('GPT 4o Mini')
  })
})

describe('labels', () => {
  test('toolLabel maps built-in tools', () => {
    expect(toolLabel('run_shell')).toBe('Run shell command')
    expect(toolLabel('memory_save')).toBe('Save memory')
  })

  test('toolLabel formats mcp tools', () => {
    expect(toolLabel('mcp:filesystem/read_file')).toBe('Filesystem: Read File')
  })

  test('toolCallStatusLabel is plain English', () => {
    expect(toolCallStatusLabel('streaming-args')).toBe('Preparing')
    expect(toolCallStatusLabel('executing')).toBe('Running')
  })

  test('connectionStatusLabel handles empty status', () => {
    expect(connectionStatusLabel(null)).toBe('Never connected')
  })

  test('memoryKindLabel capitalizes kinds', () => {
    expect(memoryKindLabel('semantic')).toBe('Semantic')
  })
})
