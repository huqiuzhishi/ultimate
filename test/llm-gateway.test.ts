import { expect, it, vi } from 'vitest'
import {
  configuredTokenPath,
  llmGatewayConfig,
  type GatewayProviderConfig,
  type LlmGatewayApi,
} from '../extensions/llm-gateway/server.ts'

it('restores only a safe absolute token path when the launch environment lacks one', () => {
  expect(configuredTokenPath({ tokenPath: '/tmp/declawd-token' })).toBe('/tmp/declawd-token')
  expect(configuredTokenPath({ tokenPath: '/tmp/token; command' })).toBeUndefined()
  expect(configuredTokenPath({}, '/runtime/token')).toBe('/runtime/token')
})

const config: GatewayProviderConfig = {
  name: 'LLM Gateway',
  baseUrl: 'https://gateway.example',
  apiKey: '!token-command',
  api: 'anthropic-messages',
  models: [],
}

it('keeps the generated gateway registration without applying its Pi-only provider removals', async () => {
  const extension = vi.fn<(api: LlmGatewayApi) => void>((api) => {
    api.registerProvider('llm-gateway', config)
    api.unregisterProvider('google')
    api.registerProvider('github-copilot', { ...config, name: 'disabled' })
  })

  await expect(llmGatewayConfig(extension)).resolves.toBe(config)
  expect(extension).toHaveBeenCalledOnce()
})
