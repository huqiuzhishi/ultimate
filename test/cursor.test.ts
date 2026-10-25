import type { SimpleStreamOptions } from '@earendil-works/pi-ai'
import { describe, expect, it, vi } from 'vitest'
import { cursorStreamOptions, restoreCursorModels } from '../extensions/cursor/server.ts'

type OnPayload = NonNullable<SimpleStreamOptions['onPayload']>

describe('Cursor stream payload', () => {
  it('adds the durable conversation identity after existing payload transforms', async () => {
    const transform = vi.fn<OnPayload>(async () => ({ transformed: true }))
    const options = cursorStreamOptions({ sessionId: 'conversation-a', onPayload: transform })

    await expect(options.onPayload?.({ original: true }, undefined as never)).resolves.toEqual({
      transformed: true,
      pi_session_id: 'conversation-a',
    })
    expect(transform).toHaveBeenCalledWith({ original: true }, undefined)
  })

  it('keeps separate conversations separate and leaves one-shot calls anonymous', async () => {
    const payload = { messages: [] }
    const first = cursorStreamOptions({ sessionId: 'conversation-a' })
    const second = cursorStreamOptions({ sessionId: 'conversation-b' })
    const anonymous = cursorStreamOptions()

    await expect(first.onPayload?.(payload, undefined as never)).resolves.toMatchObject({
      pi_session_id: 'conversation-a',
    })
    await expect(second.onPayload?.(payload, undefined as never)).resolves.toMatchObject({
      pi_session_id: 'conversation-b',
    })
    await expect(anonymous.onPayload?.(payload, undefined as never)).resolves.toBe(payload)
  })
})

describe('Cursor model catalog', () => {
  const model = (id: string, name = id) => ({
    id,
    name,
    reasoning: true,
    input: ['text'] as ('text' | 'image')[],
    cost: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 200_000,
    maxTokens: 64_000,
  })

  it('restores newer models persisted by the independently installed Pi plugin', () => {
    expect(
      restoreCursorModels({ models: [model('gpt-5.6-sol'), { id: 'invalid' }] }).map(
        (entry) => entry.id,
      ),
    ).toEqual(['gpt-5.6-sol'])
  })
})
