import type { SimpleStreamOptions } from '@earendil-works/pi-ai'
import { describe, expect, it, vi } from 'vitest'
import { cursorStreamOptions } from '../extensions/cursor/server.ts'

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
