import { describe, expect, test } from 'vitest'
import { mapFsListToTree, mapGitStatusToDto } from '../src/lib/workspace-api'

describe('workspace-api adapters', () => {
  test('mapFsListToTree converts Hermes list entries', () => {
    const tree = mapFsListToTree('/workspace', {
      entries: [
        { name: 'src', path: '/workspace/src', isDirectory: true },
        { name: 'README.md', path: '/workspace/README.md', isDirectory: false },
      ],
    })

    expect(tree.path).toBe('/workspace')
    expect(tree.entries).toEqual([
      { name: 'src', path: '/workspace/src', type: 'dir' },
      { name: 'README.md', path: '/workspace/README.md', type: 'file' },
    ])
  })

  test('mapFsListToTree throws on structured list errors', () => {
    expect(() => mapFsListToTree('/workspace', { entries: [], error: 'ENOENT' })).toThrow('ENOENT')
  })

  test('mapGitStatusToDto handles non-repo and dirty repo', () => {
    expect(mapGitStatusToDto(null, '/workspace')).toEqual({
      isRepo: false,
      dirty: false,
      files: [],
    })

    expect(
      mapGitStatusToDto(
        {
          branch: 'main',
          changed: 2,
          files: [{ path: 'a.txt' }, { path: 'src/b.ts' }],
        },
        '/workspace',
      ),
    ).toEqual({
      isRepo: true,
      dirty: true,
      files: ['/workspace/a.txt', '/workspace/src/b.ts'],
    })
  })
})
