# Project switcher

The project path at the top of the sidebar becomes a menu on loopback hosts. It lists the projects known to this
Ultimate installation, opens another running project, and starts a stopped project. Remote browsers keep the existing
read-only project path.

Starting launches the repository's `bin/ultimate.ts` supervisor in the canonical project directory. It preserves
ordinary environment configuration while removing the parent host's project and supervisor identity. The launcher
opens a separate app window when that project is already running and otherwise starts its own backend before opening.

The `list` action is read-only. `start` is a user action admitted only from an unproxied loopback browser.
