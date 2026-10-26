import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it, vi } from 'vitest'
import type { ToolCallView } from '../../web/src/sdk/types.ts'

let providedOpen: (() => void) | undefined

vi.mock('@/sdk', async () => ({
  api: { action: () => new Promise(() => {}) },
  cn: (...names: unknown[]) => names.filter(Boolean).join(' '),
  definePoint: (point: string) => ({ point }),
  defineWebExtension: (extension: unknown) => extension,
  events: { emit: () => {} },
  formatBytes: (bytes: number) => `${bytes} B`,
  Provided: ({ children }: { children: (value: (() => void) | undefined) => unknown }) =>
    children(providedOpen),
  shortenPath: (path: string) => path,
  useConversation: () => undefined,
  useStore: () => undefined,
  useToolDuration: () => undefined,
  useTranscript: () => [],
  useUltimate: () => ({ surface: 'agent' }),
}))

const { firstChangedLine, parsePatch } = await import('../../extensions/coding-tools/diff.tsx')
const { default: codingTools } = await import('../../extensions/coding-tools/web.tsx')
const tools = codingTools.tools as Record<string, (props: { call: ToolCallView }) => unknown>

const render = (name: string, args: ToolCallView['args'], status: ToolCallView['status']) =>
  renderToStaticMarkup(
    createElement(tools[name] as never, {
      call: { id: 'c1', name, args, status, output: '', images: [], diagnostics: [] },
    }),
  )
const rows = (html: string) => html.match(/text-diff-(add|del)/g)?.length ?? 0

it('renders a streaming edit with no text yet as a caret, without placeholder rows or counts', () => {
  const empty: ToolCallView['args'][] = [
    {},
    { path: 'a.ts', edits: [{ oldText: '', newText: '' }] },
  ]
  for (const args of empty) {
    const html = render('edit', args, 'streaming')
    expect(rows(html)).toBe(0)
    expect(html).not.toMatch(/\+\d|−\d/)
    expect(html).toContain('animate-pulse-dot')
  }
  expect(render('edit', {}, 'streaming')).toContain('editing…')
})

it('streams only the text that arrived and counts changes once the call is written', () => {
  const args = { path: 'a.ts', edits: [{ oldText: 'one\ntwo', newText: 'uno' }] }
  const streaming = render('edit', args, 'streaming')
  expect(streaming).toContain('uno')
  expect(streaming).not.toContain('−2')
  expect(render('edit', args, 'pending')).toContain('−2')
})

it('renders the nvim button on completed file tools when terminal provides OpenInTerminal', () => {
  const patch =
    '--- a/src/app.ts\n+++ b/src/app.ts\n@@ -10,2 +10,3 @@\n context\n+added line\n more'
  expect(firstChangedLine(parsePatch(patch))).toBe(11)

  providedOpen = undefined
  expect(render('write', { path: 'src/app.ts', content: 'hi' }, 'done')).not.toContain(
    'data-open-nvim',
  )

  providedOpen = () => {}
  const html = render('write', { path: 'src/app.ts', content: 'hi' }, 'done')
  expect(html).toContain('data-open-nvim="src/app.ts"')
  expect(html).toContain('Open app.ts in nvim')
  providedOpen = undefined
})
