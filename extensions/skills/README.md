# Skills

Provides a skills menu in the composer and documents Pi slash commands in the Info tab.

## Composer Menu

Type `/` in the composer to open every available skill, then keep typing to filter by name or description. Arrow keys choose a result; Enter or Tab replaces the slash token with `/skill:name `. The book button opens the same complete list with a search field.

Skills are discovered from:

- Clone `skills/`
- `~/.pi/agent/skills` (Pi's personal skills)
- `~/.ultimate/skills` (Ultimate-specific personal skills; overrides same-named Pi skills)
- `.pi/skills` (project)
- `.agents/skills` and `.ultimate/skills` (project, if trusted)

Pi's canonical personal path is `~/.pi/agent/skills` (singular `agent`). It may itself be a symlink to a shared Agent Skills folder.
