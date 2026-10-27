# Cursor

Cursor models from `pi-cursor-provider`, adapted to Ultimate's durable conversations. This built-in ships off because it starts a local proxy and requires a Cursor subscription. Enable **Cursor** in the Extensions panel or add `cursor` to `extensions.enable`.

Open the model picker, choose **Log in to Cursor**, and finish browser OAuth. Ultimate stores the login in Pi's shared `~/.pi/agent/auth.json`, so an existing Pi Cursor login is available here too. The provider discovers Cursor's model catalog after login and uses its local OpenAI-compatible proxy for requests.

Ultimate passes each durable conversation's provider identity to the proxy. Retries and tool continuations keep one Cursor conversation; forks get a new identity. Facet reloads retain the proxy while a replacement loads. Disable or server shutdown unregisters the provider and stops the proxy after active streams settle.

This adapter does not load arbitrary Pi extensions. Pi and Ultimate use different extension lifecycle APIs. Cursor's Pi-only `/max-mode`, footer status, and automatic response to Cursor server-side summaries are not exposed in Ultimate.

`patches/pi-cursor-provider@0.1.11.patch` fixes three proxy faults seen through Cursor's agent API. The system prompt goes in `RequestContext.cloudRule`, since Cursor ignores the root prompt blob the proxy sent. Cursor models call their native read, write and shell tools even when MCP tools are offered: the proxy now redirects those calls to Ultimate's `read`, `write` and `bash` and answers with the typed native result. Before, it rejected them, and the model ended its turn as if it had done the work. An exec type the proto does not know now fails the turn with an error naming it; before, Cursor waited forever for an answer while heartbeats held the stream open. `test/cursor-native-tools.test.ts` covers the patch.

The dependency is pinned to `pi-cursor-provider@0.1.11`. Its obsolete `@mariozechner/*` type-only peers are marked optional because Ultimate uses `@earendil-works/*`. Verification: `pnpm check` and focused Cursor tests.
