# Skills

Provides a skills menu in the composer and documents Pi slash commands in the Info tab.

## Composer Menu

A dropdown in the composer toolbar listing available skills (clone, user, and project scopes). Click a skill to insert `/skill:name ` at the cursor, then type your request and send.

Skills are discovered from:

- Clone `skills/`
- `~/.ultimate/skills` (user personal skills)
- `.pi/skills` (project)
- `.agents/skills` and `.ultimate/skills` (project, if trusted)

Note: `~/.pi/agent/skills` (Pi terminal agent's personal skills) are not loaded here; personal skills for Ultimate live in `~/.ultimate/skills`.
