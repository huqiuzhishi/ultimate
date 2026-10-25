# Skills

Provides a skills menu in the composer and documents Pi slash commands in the Info tab.

## Composer Menu

Type `/` in the composer to open every available skill, then keep typing to filter by name or description. Arrow keys choose a result; Enter or Tab replaces the slash token with `/skill:name `. The book button opens the same complete list with a search field.

Skills are discovered from:

- Clone `skills/`
- `~/.ultimate/skills` (user personal skills)
- `.pi/skills` (project)
- `.agents/skills` and `.ultimate/skills` (project, if trusted)

Note: `~/.pi/agent/skills` (Pi terminal agent's personal skills) are not loaded here; personal skills for Ultimate live in `~/.ultimate/skills`.
