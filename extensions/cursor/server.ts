import type { Model, SimpleStreamOptions } from '@earendil-works/pi-ai'
import { streamSimple as openAIStreamSimple } from '@earendil-works/pi-ai/api/openai-completions'
import cursorProvider, {
  processModels,
  supportsReasoningModelId,
} from 'pi-cursor-provider/index.ts'
import { getCursorModels, stopProxy, type CursorModel } from 'pi-cursor-provider/proxy.ts'
import type { ExtensionHost } from '../../server/extensions.ts'

type ProviderConfig = Parameters<ExtensionHost['modelRuntime']['registerProvider']>[1]
type ProviderModel = NonNullable<ProviderConfig['models']>[number]
type LegacyModel = ProviderModel & {
  compat?: Record<string, unknown> & {
    reasoningEffortMap?: Model<'openai-completions'>['thinkingLevelMap']
  }
}
type CursorApi = {
  on(event: string, handler: (...args: never[]) => unknown): void
  registerProvider(provider: string, config: ProviderConfig): void
}
type ProcessedCursorModel = CursorModel & {
  supportsEffort: boolean
  effortMap?: Model<'openai-completions'>['thinkingLevelMap']
}

function models(config: ProviderConfig): ProviderConfig['models'] {
  return config.models?.map((model) => {
    const legacy = model as LegacyModel
    const map = legacy.compat?.reasoningEffortMap
    if (!map || model.type === 'image' || model.type === 'classifier') return model
    return { ...model, thinkingLevelMap: model.thinkingLevelMap ?? map }
  })
}

function cost(config: ProviderConfig, id: string): ProviderModel['cost'] {
  const configured = config.models ?? []
  const exact = configured.find((model) => model.id === id)?.cost
  if (exact) return exact
  const family = id.includes('opus')
    ? 'opus'
    : id.includes('haiku')
      ? 'haiku'
      : id.includes('sonnet')
        ? 'sonnet'
        : id.includes('mini')
          ? 'mini'
          : id.split('-')[0]
  return (
    configured.find((model) => model.id.includes(family))?.cost ?? {
      input: 3,
      output: 15,
      cacheRead: 0.3,
      cacheWrite: 0,
    }
  )
}

function discoveredModels(config: ProviderConfig, raw: CursorModel[]): ProviderModel[] {
  return (processModels(raw) as ProcessedCursorModel[]).map((model) => ({
    id: model.id,
    name: model.name,
    reasoning: supportsReasoningModelId(model.id),
    input: ['text'],
    cost: cost(config, model.id),
    contextWindow: model.contextWindow,
    maxTokens: model.maxTokens,
    thinkingLevelMap: model.effortMap,
    compat: {
      supportsDeveloperRole: false,
      supportsReasoningEffort: model.supportsEffort,
      maxTokensField: 'max_tokens',
    },
  }))
}

/** Valid provider-model rows restored from Pi's provider-scoped model catalog. */
export function restoreCursorModels(stored: { models?: readonly unknown[] } | undefined) {
  const restored = (stored?.models ?? []).filter((value): value is ProviderModel => {
    if (!value || typeof value !== 'object') return false
    const model = value as Record<string, unknown>
    return (
      (model.type === undefined || model.type === 'chat') &&
      typeof model.id === 'string' &&
      typeof model.name === 'string' &&
      typeof model.reasoning === 'boolean' &&
      Array.isArray(model.input) &&
      !!model.cost &&
      typeof model.contextWindow === 'number' &&
      typeof model.maxTokens === 'number'
    )
  })
  return models({ models: restored }) ?? []
}

/** Add Pi Durable's stable per-conversation identity to Cursor's proxy payload. */
export function cursorStreamOptions(options?: SimpleStreamOptions): SimpleStreamOptions {
  return {
    ...options,
    onPayload: async (payload, model) => {
      const transformed = await options?.onPayload?.(payload, model)
      const next = transformed === undefined ? payload : transformed
      if (!next || typeof next !== 'object' || !options?.sessionId) return next
      return { ...next, pi_session_id: options.sessionId }
    },
  }
}

function adapt(
  config: ProviderConfig,
  track: (stream: ReturnType<typeof openAIStreamSimple>) => ReturnType<typeof openAIStreamSimple>,
): ProviderConfig {
  return {
    ...config,
    models: models(config),
    async refreshModels(context) {
      // Pi's provider-scoped catalog may come from a newer independently installed plugin. Do not replace or
      // combine it with this package's older bundled catalog, which can reintroduce retired models.
      const cached = restoreCursorModels(context.stored)
      if (cached.length) return cached

      const configured = models(config) ?? []
      if (!context.allowNetwork || context.credential?.type !== 'oauth') return configured
      const discovered = await getCursorModels(context.credential.access)
      if (!discovered.length) return configured
      const refreshed = discoveredModels(config, discovered)
      await context.publish({
        persist: { models: refreshed as never, checkedAt: Date.now() },
      })
      return refreshed
    },
    streamSimple: (model, context, options) =>
      track(
        openAIStreamSimple(
          model as Model<'openai-completions'>,
          context,
          cursorStreamOptions(options),
        ),
      ),
    ...(config.oauth ? { oauth: { ...config.oauth, isSubscription: true } } : {}),
  }
}

export default async function cursor(host: ExtensionHost) {
  const shared = host.resource('cursor.provider', () => ({
    active: new Set<Promise<unknown>>(),
    facets: new Set<symbol>(),
  }))
  const facet = Symbol('cursor')
  let closing = false
  const track = (stream: ReturnType<typeof openAIStreamSimple>) => {
    if (closing) throw new Error('Cursor provider is closing')
    const settled = stream.result()
    shared.active.add(settled)
    void settled.then(
      () => shared.active.delete(settled),
      // Stream consumer receives failure; tracking must not create another rejection.
      () => shared.active.delete(settled),
    )
    return stream
  }
  const api: CursorApi = {
    // Ultimate supplies durable conversation lifecycle and payload identity itself.
    on: () => {},
    registerProvider(provider, config) {
      if (closing) throw new Error('Cursor provider is closing')
      host.modelRuntime.registerProvider(provider, adapt(config, track))
    },
  }

  await cursorProvider(api)
  await host.modelRuntime.refresh({ allowNetwork: true, providers: ['cursor'] })
  shared.facets.add(facet)
  host.onClose(async () => {
    closing = true
    shared.facets.delete(facet)
    if (shared.facets.size) return
    host.modelRuntime.unregisterProvider('cursor')
    if (shared.active.size)
      void Promise.allSettled(shared.active).then(
        () => {
          if (!shared.facets.size) stopProxy()
        },
        (error: unknown) => host.notice(`Closing Cursor provider failed: ${String(error)}`),
      )
    else stopProxy()
  })
  return { name: 'cursor' }
}
