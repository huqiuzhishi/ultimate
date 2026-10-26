# LLM Gateway

Registers the `llm-gateway` provider from Declawd's generated Pi extension, so Ultimate uses the same model catalog, endpoint, request headers and rotating token command as Pi and Durable Pi.

The adapter loads `$DECLAWD_PI_EXTENSIONS_DIR/llm-gateway-provider.ts`, falling back to `~/.pi/agent/extensions/llm-gateway-provider.ts`. It accepts only that extension's `llm-gateway` registration. Pi-specific calls that remove built-in providers or replace GitHub Copilot are ignored, so Ultimate's other providers remain available. Credentials are not read or copied by this extension; Pi's provider configuration resolves the generated token command for each request.

A supervisor started outside Declawd does not inherit `DECLAWD_LLM_GATEWAY_TOKEN_PATH`. In that case the adapter restores the non-secret token file path from `~/.ultimate/llm-gateway.json` (`{ "tokenPath": "/absolute/path" }`). Declawd still owns and refreshes the token file.

This built-in is off by default because it requires Declawd's generated provider file and token file. Enable `llm-gateway` in `extensions.enable`.
