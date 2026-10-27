import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it, vi } from 'vitest'
import type { Project } from '../../extensions/project-switcher/refs.ts'
import { ProjectList } from '../../extensions/project-switcher/ui.tsx'

vi.mock('@/sdk', () => ({
  cn: (...names: unknown[]) => names.filter(Boolean).join(' '),
}))

it('offers open and stop only for another running backend and start for a stopped project', () => {
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
      onStop: vi.fn<(project: Project) => void>(),
    }),
  )

  expect(html).toContain('aria-label="Open running"')
  expect(html).toContain('aria-label="Stop running"')
  expect(html).toContain('title="PID 200"')
  expect(html).toContain('aria-label="Start stopped"')
  expect(html).not.toContain('aria-label="Stop current"')
  expect(html).not.toContain('aria-label="Start current"')
})
