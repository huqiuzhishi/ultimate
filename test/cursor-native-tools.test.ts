import { create, fromBinary, toBinary } from '@bufbuild/protobuf'
import { afterEach, beforeAll, expect, it } from 'vitest'
import { until } from './helpers.ts'
import {
  AgentClientMessageSchema,
  AgentServerMessageSchema,
  ExecServerMessageSchema,
  InteractionUpdateSchema,
  ReadArgsSchema,
  RequestContextArgsSchema,
  TextDeltaUpdateSchema,
  type AgentClientMessage,
  type AgentServerMessage,
} from 'pi-cursor-provider/proto/agent_pb.ts'
import {
  cleanupAllSessionState,
  setBridgeFactoryForTests,
  startProxy,
  type BridgeFactory,
} from 'pi-cursor-provider/proxy.ts'

// Pi upstream: pi-cursor-provider@0.1.11 proxy.ts — Cursor models call native tools (read, write, shell) instead of
// the MCP tools offered; the proxy rejected them, so the model gave up ("DONE") without doing the work, and an exec
// case its proto lacks got no answer, so heartbeats kept the turn open for ten minutes. The pnpm patch redirects
// native read/write/shell to the client's tools, fails an unknown exec at once and passes the system prompt as
// RequestContext.cloudRule. Drop with the patch when upstream does this.

type Bridge = ReturnType<BridgeFactory> & {
  sent: AgentClientMessage[]
  push(message: AgentServerMessage['message']): void
  pushRaw(bytes: Uint8Array): void
  finish(): void
}

const frame = (bytes: Uint8Array, flags = 0) => {
  const out = Buffer.alloc(5 + bytes.length)
  out[0] = flags
  out.writeUInt32BE(bytes.length, 1)
  out.set(bytes, 5)
  return out
}

let bridges: Bridge[] = []
const fakeBridge: BridgeFactory = () => {
  let onData: ((chunk: Buffer) => void) | undefined
  let onClose: ((code: number) => void) | undefined
  let alive = true
  const bridge: Bridge = {
    proc: { kill: () => true },
    get alive() {
      return alive
    },
    sent: [],
    write: (data) => bridge.sent.push(fromBinary(AgentClientMessageSchema, data.subarray(5))),
    end: () => bridge.finish(),
    onData: (cb) => (onData = cb),
    onClose: (cb) => (onClose = cb),
    push: (message) =>
      bridge.pushRaw(
        toBinary(AgentServerMessageSchema, create(AgentServerMessageSchema, { message })),
      ),
    pushRaw: (bytes) => onData?.(frame(bytes)),
    finish() {
      if (!alive) return
      alive = false
      onData?.(frame(new TextEncoder().encode('{}'), 2))
      onClose?.(0)
    },
  }
  bridges.push(bridge)
  return bridge
}

let url = ''
beforeAll(async () => {
  setBridgeFactoryForTests(fakeBridge)
  url = `http://127.0.0.1:${await startProxy(async () => 'test-token')}/v1/chat/completions`
  return () => setBridgeFactoryForTests(undefined)
})
afterEach(() => {
  cleanupAllSessionState()
  bridges = []
})

const readTool = {
  type: 'function',
  function: {
    name: 'read',
    description: 'Read a file',
    parameters: { type: 'object', properties: { path: { type: 'string' } } },
  },
}

async function events(response: Response) {
  const body = await response.text()
  return body
    .split('\n\n')
    .filter((line) => line.startsWith('data: {'))
    .map(
      (line) =>
        JSON.parse(line.slice(6)) as { choices: { delta: any; finish_reason: string | null }[] },
    )
}

const firstBridge = async () => {
  await until(() => bridges.length > 0)
  return bridges[0]
}

const exec = (id: number, message: object) =>
  ({
    case: 'execServerMessage',
    value: create(ExecServerMessageSchema, { id, execId: `exec-${id}`, message: message as never }),
  }) as const

it('redirects a native read to the client read tool and answers it with a typed result', async () => {
  const system = 'You are Ultimate.'
  const first = fetch(url, {
    method: 'POST',
    body: JSON.stringify({
      model: 'gpt-5.6-sol',
      stream: true,
      pi_session_id: 'conversation-a',
      tools: [readTool],
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: 'Read README.md' },
      ],
    }),
  })
  const bridge = await firstBridge()
  bridge.push(exec(1, { case: 'requestContextArgs', value: create(RequestContextArgsSchema, {}) }))
  bridge.push(
    exec(2, {
      case: 'readArgs',
      value: create(ReadArgsSchema, { path: 'README.md', toolCallId: 'call-1' }),
    }),
  )
  const paused = await events(await first)
  const context = bridge.sent.find((message) => message.message.case === 'execClientMessage')
  expect(context?.message.value).toMatchObject({
    message: {
      case: 'requestContextResult',
      value: { result: { value: { requestContext: { cloudRule: system } } } },
    },
  })
  expect(paused.flatMap((event) => event.choices[0]?.delta.tool_calls ?? [])).toEqual([
    {
      index: 0,
      id: 'call-1',
      type: 'function',
      function: { name: 'read', arguments: JSON.stringify({ path: 'README.md' }) },
    },
  ])
  expect(paused.at(-1)?.choices[0]?.finish_reason).toBe('tool_calls')

  const resumed = fetch(url, {
    method: 'POST',
    body: JSON.stringify({
      model: 'gpt-5.6-sol',
      stream: true,
      pi_session_id: 'conversation-a',
      tools: [readTool],
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: 'Read README.md' },
        {
          role: 'assistant',
          content: null,
          tool_calls: [
            { id: 'call-1', type: 'function', function: { name: 'read', arguments: '{}' } },
          ],
        },
        { role: 'tool', tool_call_id: 'call-1', content: '# Ultimate' },
      ],
    }),
  })
  await until(() =>
    bridge.sent.some((message) => (message.message.value as any)?.message?.case === 'readResult'),
  )
  expect(bridges).toHaveLength(1)
  const answer = bridge.sent.find(
    (message) => (message.message.value as any)?.message?.case === 'readResult',
  )
  expect(answer?.message.value).toMatchObject({
    id: 2,
    execId: 'exec-2',
    message: {
      value: {
        result: { case: 'success', value: { path: 'README.md', output: { value: '# Ultimate' } } },
      },
    },
  })
  bridge.push({
    case: 'interactionUpdate',
    value: create(InteractionUpdateSchema, {
      message: {
        case: 'textDelta',
        value: create(TextDeltaUpdateSchema, { text: 'It says Ultimate.' }),
      },
    }),
  })
  bridge.finish()
  const final = await events(await resumed)
  expect(final.map((event) => event.choices[0]?.delta.content ?? '').join('')).toBe(
    'It says Ultimate.',
  )
  expect(final.find((event) => event.choices[0]?.finish_reason)?.choices[0]?.finish_reason).toBe(
    'stop',
  )
})

it('fails the turn at once when Cursor asks for an exec this proxy cannot answer', async () => {
  const response = fetch(url, {
    method: 'POST',
    body: JSON.stringify({
      model: 'gpt-5.6-sol',
      stream: true,
      pi_session_id: 'conversation-b',
      tools: [readTool],
      messages: [{ role: 'user', content: 'Do it' }],
    }),
  })
  const bridge = await firstBridge()
  // ExecServerMessage { id: 3, exec_id: "exec-3", field 36 (an exec newer than this proto): {} }
  const unknownExec = Buffer.concat([
    toBinary(ExecServerMessageSchema, create(ExecServerMessageSchema, { id: 3, execId: 'exec-3' })),
    Buffer.from([0xa2, 0x02, 0x00]),
  ])
  bridge.pushRaw(Buffer.concat([Buffer.from([0x12, unknownExec.length]), unknownExec]))
  const result = await events(await response)
  expect(result.find((event) => event.choices[0]?.finish_reason)?.choices[0]).toMatchObject({
    finish_reason: 'error',
    delta: { content: expect.stringContaining('unknown field 36') },
  })
  expect(bridge.alive).toBe(false)
  expect(bridge.sent.at(-1)?.message.value).toMatchObject({ action: { case: 'cancelAction' } })
})
