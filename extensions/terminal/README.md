# Terminal

Terminal adds a real local PTY to the Agent conversation: toggle it from the header or command palette, then use the shown conversation's cwd and worktree in a resizable xterm drawer above the composer.

Each project and conversation gets its own `tmux` session. Hiding the drawer, closing the tab, reloading, or restarting Ultimate detaches only that browser PTY; commands and full-screen programs continue and reappear when it reconnects. `exit` ends the shell, while **Restart shell** deliberately kills that tmux session and starts a fresh one. Two tabs on the same conversation mirror the same session and can both type into it.

The endpoint is deliberately local-only even when Tailscale is enabled: it requires an exact loopback Host, a matching loopback Origin, and no forwarding headers in addition to Ultimate's normal request admission. It is not a sandbox—the shell has the same filesystem and process privileges as Ultimate—and it is not a PuTTY SSH/Telnet profile manager; run `ssh` inside it normally.

Runtime requirements are `node-pty` (a native PTY binding) and `tmux` on `PATH`. `@xterm/xterm` renders the browser terminal, `@xterm/addon-fit` follows drawer size, and `ws` bridges the PTY through the extension's reload-scoped upgrade route. A native `node-pty` build may require the platform compiler toolchain when no prebuild is available.
