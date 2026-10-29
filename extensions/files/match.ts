export type FileTrigger = { start: number; end: number; query: string }

/** An `@query` token at the cursor, beginning the input or following whitespace. */
export function fileTrigger(text: string, cursor: number): FileTrigger | undefined {
  const before = text.slice(0, cursor)
  const match = before.match(/(?:^|\s)(@\S*)$/)
  if (!match) return undefined
  const token = match[1]
  return { start: cursor - token.length, end: cursor, query: token.slice(1) }
}

/** Best path matches first: exact, path prefix, basename prefix, then shorter paths. */
export function matchingFiles(paths: readonly string[], query: string, limit = 20): string[] {
  const needle = query.trim().toLowerCase()
  if (!needle) return []
  const parts = needle.split('/').filter(Boolean)
  const includes = (path: string) => {
    const lower = path.toLowerCase()
    let from = 0
    return parts.every((part) => {
      const at = lower.indexOf(part, from)
      if (at < 0) return false
      from = at + part.length
      return true
    })
  }
  const score = (path: string) => {
    const lower = path.toLowerCase()
    const name = lower.split('/').at(-1) ?? lower
    const last = parts.at(-1) ?? needle
    if (lower === needle || name === needle) return 0
    if (lower.startsWith(needle)) return 1
    if (name.startsWith(last)) return 2
    return 3
  }
  return [...new Set(paths)]
    .filter(includes)
    .toSorted(
      (left, right) =>
        score(left) - score(right) ||
        left.split('/').length - right.split('/').length ||
        left.localeCompare(right),
    )
    .slice(0, limit)
}
