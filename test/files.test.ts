import { describe, expect, it, vi } from 'vitest'
import type { ActionContext } from '../server/actions.ts'
import { fileTrigger, matchingFiles } from '../extensions/files/match.ts'
import { actions } from '../extensions/files/server.ts'

describe('file autocomplete', () => {
  it('finds an @ token only at a word boundary and replaces exactly that token', () => {
    expect(fileTrigger('read @web/com', 13)).toEqual({ start: 5, end: 13, query: 'web/com' })
    expect(fileTrigger('@src', 4)).toEqual({ start: 0, end: 4, query: 'src' })
    expect(fileTrigger('mail@example.com', 16)).toBeUndefined()
    expect(fileTrigger('read @src later', 15)).toBeUndefined()
  })

  it('ranks exact and basename-prefix matches and supports path fragments', () => {
    const paths = [
      'web/src/app/composer.tsx',
      'test/web/composer.test.ts',
      'docs/composer.md',
      'composer',
      'web/src/app/model.ts',
    ]
    expect(matchingFiles(paths, 'composer')).toEqual([
      'composer',
      'docs/composer.md',
      'test/web/composer.test.ts',
      'web/src/app/composer.tsx',
    ])
    expect(matchingFiles(paths, 'web/com')).toEqual([
      'test/web/composer.test.ts',
      'web/src/app/composer.tsx',
    ])
  })

  it('searches tracked and unignored files in the conversation checkout', async () => {
    const exec = vi.fn<() => Promise<{ stdout: string; stderr: string }>>(async () => ({
      stdout: 'web/src/app/composer.tsx\0docs/composer.md\0',
      stderr: '',
    }))
    await expect(
      actions.search({ query: 'composer' }, {
        exec,
        signal: new AbortController().signal,
      } as unknown as ActionContext),
    ).resolves.toEqual(['docs/composer.md', 'web/src/app/composer.tsx'])
    expect(exec).toHaveBeenCalledWith(
      'git',
      expect.arrayContaining(['ls-files', '--exclude-standard']),
    )
  })
})
