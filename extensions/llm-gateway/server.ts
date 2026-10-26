import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import type { ExtensionHost } from '../../server/extensions.ts'

const PROVIDER = 'llm-gateway'
export type GatewayProviderConfig = Parameters<ExtensionHost['modelRuntime']['registerProvider']>[1]
export type LlmGatewayApi = {
  registerProvider(name: string, config: GatewayProviderConfig): void
  unregisterProvider(name: string): void
}
type LlmGatewayExtension = (api: LlmGatewayApi) => void | Promise<void>

export function configuredTokenPath(saved: unknown, current?: string) {
  if (current) return current
  if (!saved || typeof saved !== 'object') return undefined
  const tokenPath = (saved as { tokenPath?: unknown }).tokenPath
  return typeof tokenPath === 'string' && /^\/[\w./-]+$/u.test(tokenPath) ? tokenPath : undefined
}

async function restoreGatewayEnvironment(userHome: string) {
  if (process.env.DECLAWD_LLM_GATEWAY_TOKEN_PATH) return
  const path = join(userHome, '.ultimate/llm-gateway.json')
  let saved: unknown
  try {
    saved = JSON.parse(await readFile(path, 'utf8'))
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
  }
  const tokenPath = configuredTokenPath(saved)
  if (tokenPath) process.env.DECLAWD_LLM_GATEWAY_TOKEN_PATH = tokenPath
}

/** Capture only the gateway provider; its Pi extension also disables providers that Ultimate keeps available. */
export async function llmGatewayConfig(extension: LlmGatewayExtension) {
  let config: GatewayProviderConfig | undefined
  await extension({
    registerProvider: (name, candidate) => {
      if (name === PROVIDER) config = candidate
    },
    unregisterProvider: () => {},
  })
  return config
}

export default async function llmGateway(host: ExtensionHost) {
  await restoreGatewayEnvironment(host.userHome)
  if (!process.env.DECLAWD_LLM_GATEWAY_TOKEN_PATH)
    throw new Error(
      'DECLAWD_LLM_GATEWAY_TOKEN_PATH is not set and ~/.ultimate/llm-gateway.json has no tokenPath',
    )
  const directory =
    process.env.DECLAWD_PI_EXTENSIONS_DIR ?? join(host.userHome, '.pi/agent/extensions')
  const source = join(directory, 'llm-gateway-provider.ts')
  const loaded = (await import(/* @vite-ignore */ pathToFileURL(source).href)) as {
    default?: unknown
  }
  if (typeof loaded.default !== 'function')
    throw new Error(`${source} does not export an LLM gateway provider`)
  const config = await llmGatewayConfig(loaded.default as LlmGatewayExtension)
  if (!config) throw new Error(`${source} did not register ${PROVIDER}`)

  const shared = host.resource('llm-gateway.provider', () => ({ facets: new Set<symbol>() }))
  const facet = Symbol(PROVIDER)
  host.modelRuntime.registerProvider(PROVIDER, config)
  shared.facets.add(facet)
  host.onClose(async () => {
    shared.facets.delete(facet)
    if (!shared.facets.size) host.modelRuntime.unregisterProvider(PROVIDER)
  })
  return { name: PROVIDER }
}
