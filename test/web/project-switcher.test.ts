import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it, vi } from 'vitest'
import type { Project } from '../../extensions/project-switcher/refs.ts'
import { openProjectTab, ProjectList } from '../../extensions/project-switcher/ui.tsx'

vi.mock('@/sdk', () => ({
  cn: (...names: unknown[]) => names.filter(Boolean).join(' '),
}))

it('offers a new-tab launch for every non-current project', () => {
  const projects: Project[] = [
    {
      root: '/current',
      name: 'current',
      current: true,
      running: { pid: 100, url: 'http://127.0.0.1:4747' },
    },
    {
      root: '/running',
      name: 'running',
      current: false,
      running: { pid: 200, url: 'http://127.0.0.1:4748' },
    },
    { root: '/stopped', name: 'stopped', current: false },
  ]
  const html = renderToStaticMarkup(
    createElement(ProjectList, {
      projects,
      pending: undefined,
      onStart: vi.fn<(project: Project) => void>(),
    }),
  )

  expect(html).toContain('aria-label="Open running"')
  expect(html).toContain('title="PID 200"')
  expect(html).toContain('aria-label="Start stopped"')
  expect(html).not.toContain('href=')
  expect(html).not.toContain('aria-label="Stop')
  expect(html).not.toContain('aria-label="Start current"')
})

it('opens a placeholder synchronously, clears its opener, and navigates it to the ready URL', async () => {
  const replace = vi.fn<(url: string) => void>()
  const tab = {
    close: vi.fn<() => void>(),
    location: { replace },
    opener: {},
  }
  let launched = false
  const launch = vi.fn<({ root }: { root: string }) => Promise<{ root: string; url: string }>>(
    async () => {
      launched = true
      return { root: '/other', url: 'http://127.0.0.1:4748' }
    },
  )
  const open = vi.fn<(url: string, target: string) => typeof tab>(() => tab)

  const opening = openProjectTab('/other', launch, open)

  expect(open).toHaveBeenCalledWith('', '_blank')
  expect(tab.opener).toBeNull()
  expect(launched).toBe(true)
  await opening
  expect(replace).toHaveBeenCalledWith('http://127.0.0.1:4748')
  expect(tab.close).not.toHaveBeenCalled()
})

it('does not launch when the browser blocks the placeholder', async () => {
  const launch = vi.fn<({ root }: { root: string }) => Promise<{ root: string; url: string }>>()

  await expect(openProjectTab('/other', launch, () => null)).rejects.toThrow(
    'browser blocked the new tab',
  )

  expect(launch).not.toHaveBeenCalled()
})

it('closes the placeholder when launching fails', async () => {
  const tab = {
    close: vi.fn<() => void>(),
    location: { replace: vi.fn<(url: string) => void>() },
    opener: {},
  }

  await expect(
    openProjectTab(
      '/other',
      async () => {
        throw new Error('Backend failed')
      },
      () => tab,
    ),
  ).rejects.toThrow('Backend failed')

  expect(tab.close).toHaveBeenCalledOnce()
  expect(tab.location.replace).not.toHaveBeenCalled()
})
