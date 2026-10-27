# Project switcher

The project path at the top of the sidebar becomes a menu on loopback hosts. It lists the projects known to this
Ultimate installation, opens another running project, starts a stopped project, and stops a non-current project.
Remote browsers keep the existing read-only project path.

Starting launches the repository's `bin/ultimate.ts` supervisor in the canonical project directory. It preserves
ordinary environment configuration while removing the parent host's project and supervisor identity. Stopping
requires the canonical non-current project, the PID shown by the inventory, and that same live PID in the project's
supervisor lock immediately before `SIGTERM`.

The `list` action is read-only. `start` and `stop` are user actions.
