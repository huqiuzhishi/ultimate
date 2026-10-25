export type SkillSearchItem = { name: string; description: string }
export type SkillTrigger = { start: number; end: number; query: string }

/** A slash token at the cursor: `/query` or the explicit `/skill:query` form. */
export function skillTrigger(text: string, cursor: number): SkillTrigger | undefined {
  const before = text.slice(0, cursor)
  const match = before.match(/(?:^|\s)(\/\S*)$/)
  if (!match) return undefined
  const token = match[1]
  if (token.includes(':') && !token.startsWith('/skill:')) return undefined
  const query = token.startsWith('/skill:') ? token.slice('/skill:'.length) : token.slice(1)
  return { start: cursor - token.length, end: cursor, query }
}

export function matchingSkills<T extends SkillSearchItem>(
  skills: readonly T[],
  query: string,
): T[] {
  const needle = query.trim().toLowerCase()
  if (!needle) return [...skills]
  return skills
    .filter(
      (skill) =>
        skill.name.toLowerCase().includes(needle) ||
        skill.description.toLowerCase().includes(needle),
    )
    .toSorted((left, right) => {
      const leftStarts = left.name.toLowerCase().startsWith(needle)
      const rightStarts = right.name.toLowerCase().startsWith(needle)
      return Number(rightStarts) - Number(leftStarts)
    })
}
