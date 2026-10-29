# Project switcher

The project path at the top of the sidebar becomes a menu on loopback hosts. It lists the projects known to this
Ultimate installation, opens another running project, and starts a stopped project. Remote browsers keep the existing
read-only project path.

Starting launches the repository's `bin/ultimate.ts` supervisor in the canonical project directory. It preserves
ordinary environment configuration while removing the parent host's project and supervisor identity. Each project
keeps its own backend, state and port. An already-running selected project reuses only that project's backend;
otherwise the launcher starts one with `--no-open`, waits for its validated loopback URL to become ready, and returns
that URL to the browser.

The click first claims a blank tab in the browser showing Ultimate, so Arc stays in Arc and no browser-specific
launcher runs. The tab drops its opener before navigating and closes if startup fails. A blocked tab starts nothing
and reports the error in the project menu or path dialog.

The `list` action is read-only. `start` is a user action admitted only from an unproxied loopback browser.
