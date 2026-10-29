import { implementAction } from '../../lib/actions.ts'
import { matchingFiles } from './match.ts'
import { SearchFilesAction } from './refs.ts'

export default { name: 'files' }

/** Escape user text inside Git's glob pathspec. */
const globLiteral = (text: string) =>
  text
    .replaceAll('\\', '\\\\')
    .replaceAll('*', '\\*')
    .replaceAll('?', '\\?')
    .replaceAll('[', '\\[')
    .replaceAll(']', '\\]')

/** Narrow Git's output before the action's one-MiB process-output limit. */
function pathspecs(query: string) {
  const parts = query
    .split('/')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => `*${globLiteral(part)}*`)
  const pattern = parts.join('/**/')
  return [`:(icase,glob)${pattern}`, `:(icase,glob)**/${pattern}`]
}

export const actions = {
  search: implementAction(SearchFilesAction, async (args, context) => {
    const query = args && typeof args === 'object' && !Array.isArray(args) ? args.query : undefined
    if (typeof query !== 'string' || query.length > 200)
      throw new Error('Expected a short file query')
    if (!query.trim()) return []
    let output: string
    try {
      output = (
        await context.exec('git', [
          'ls-files',
          '-z',
          '--cached',
          '--others',
          '--exclude-standard',
          '--',
          ...pathspecs(query),
        ])
      ).stdout
    } catch {
      // A folder without a Git repository still gets file completion; rg applies its ignore files and skips .git.
      output = (
        await context.exec('rg', [
          '--files',
          '--hidden',
          '--glob',
          '!.git',
          '--glob',
          '!node_modules',
        ])
      ).stdout
    }
    return matchingFiles(output.split(output.includes('\0') ? '\0' : '\n').filter(Boolean), query)
  }),
}
