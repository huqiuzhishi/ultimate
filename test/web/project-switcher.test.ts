import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it, vi } from 'vitest'
import type { Project } from '../../extensions/project-switcher/refs.ts'
import { ProjectList } from '../../extensions/project-switcher/ui.tsx'

vi.mock('@/sdk', () => ({
  cn: (...names: unknown[]) => names.filter(Boolean).join(' '),
}))

it('offers a separate-window launch for every non-current project', () => {
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
