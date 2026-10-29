import { mkdirSync, writeFileSync } from 'node:fs'
import { chmod, mkdir, realpath, symlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import type { ExtensionHost } from '../server/extensions.ts'
import { projectHome, projects } from '../server/project.ts'
import {
  actions,
  launchProject,
  localActions,
  userActions,
} from '../extensions/project-switcher/server.ts'
import { temp } from './helpers.ts'

const spawn = vi.hoisted(() =>
  vi.fn<
    (
      command: string,
      args: readonly string[],
      options: { env?: NodeJS.ProcessEnv; [key: string]: unknown },
    ) => {
      exitCode: number | null
      kill(signal?: NodeJS.Signals): boolean
      once(event: string, listener: (error: Error) => void): unknown
      pid: number
      unref(): void
    }
  >(),
)
vi.mock('node:child_process', async (original) => ({
  ...(await original<typeof import('node:child_process')>()),
  spawn,
}))

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  spawn.mockReset()
})

function supervisor(pid = 4321) {
  return {
    exitCode: null,
    kill: vi.fn<(signal?: NodeJS.Signals) => boolean>(() => true),
    once: vi.fn<(event: string, listener: (error: Error) => void) => unknown>(),
    pid,
    unref: vi.fn<() => void>(),
  }
}

function lock(userHome: string, root: string, pid: number, port: number) {
  const home = projectHome(root, userHome)
  mkdirSync(home, { recursive: true })
  writeFileSync(join(home, 'project.json'), JSON.stringify({ root, name: root, openedAt: 1 }))
  writeFileSync(join(home, 'ultimate.lock'), JSON.stringify({ pid, port, project: root }))
}

function extensionHost(userHome: string, projectRoot = '/current') {
  return {
    projectRoot,
    projects: () => projects(userHome, projectHome(projectRoot, userHome)),
    ultimateRoot: '/ultimate',
    userHome,
  } as ExtensionHost
}

function alive() {
  return vi.spyOn(process, 'kill').mockImplementation(() => true)
}

function ready(root: string | ((url: string) => string)) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => system(typeof root === 'string' ? root : root(url))),
  )
}

function system(root: string) {
  return new Response(`event: system\ndata: ${JSON.stringify({ project: { root } })}\n\n`, {
    headers: { 'content-type': 'text/event-stream' },
    status: 200,
  })
}

it('launches the canonical project with the Ultimate entrypoint and no inherited supervisor identity', async () => {
  const directory = await temp('ultimate-project-switcher-')
  const root = join(directory, 'project')
  const link = join(directory, 'link')
  await mkdir(root)
  await symlink(root, link)
  const canonical = await realpath(root)
  vi.stubEnv('ULTIMATE_PROJECT', '/parent/project')
  vi.stubEnv('ULTIMATE_HOME', '/parent/home')
  vi.stubEnv('ULTIMATE_PORT', '9123')
  vi.stubEnv('ULTIMATE_SUPERVISED', '1')
  vi.stubEnv('ULTIMATE_GENERATION', '7')
  vi.stubEnv('ULTIMATE_PREVIOUS_BUILD', '{"commit":"parent"}')
  vi.stubEnv('ULTIMATE_PUBLIC_URL', 'https://parent.example')
  vi.stubEnv('ULTIMATE_INSTANCE_OWNER', '123')
  vi.stubEnv('ULTIMATE_NO_OPEN', '1')
  vi.stubEnv('ULTIMATE_MODEL', 'kept/model')
  const child = supervisor()
  alive()
  ready(canonical)
  spawn.mockImplementation(() => {
    lock(directory, canonical, child.pid, 4748)
    return child
  })
  const host = extensionHost(directory)

  await expect(launchProject(host, link)).resolves.toEqual({
    root: canonical,
    url: 'http://127.0.0.1:4748',
  })

  expect(spawn).toHaveBeenCalledWith(
    process.execPath,
    ['/ultimate/bin/ultimate.ts', canonical, '--no-open'],
    {
      cwd: canonical,
      detached: true,
      env: expect.objectContaining({ ULTIMATE_MODEL: 'kept/model' }),
      stdio: 'ignore',
    },
  )
  const env = spawn.mock.calls[0][2].env
  for (const key of [
    'ULTIMATE_PROJECT',
    'ULTIMATE_HOME',
    'ULTIMATE_PORT',
    'ULTIMATE_SUPERVISED',
    'ULTIMATE_GENERATION',
    'ULTIMATE_PREVIOUS_BUILD',
    'ULTIMATE_PUBLIC_URL',
    'ULTIMATE_INSTANCE_OWNER',
    'ULTIMATE_NO_OPEN',
  ])
    expect(env).not.toHaveProperty(key)
  expect(child.unref).toHaveBeenCalledOnce()
})

it('expands home-relative project paths before launching canonical directories', async () => {
  const userHome = await temp('ultimate-project-switcher-home-')
  const child = join(userHome, 'child')
  await mkdir(child)
  const canonicalHome = await realpath(userHome)
  const canonicalChild = await realpath(child)
  const children = [supervisor(4321), supervisor(4322)]
  let launched = 0
  alive()
  ready((url) => (url.includes(':4749') ? canonicalChild : canonicalHome))
  spawn.mockImplementation((_command, args) => {
    const spawned = children[launched++]
    lock(userHome, args[1], spawned.pid, 4748 + launched)
    return spawned
  })
  const host = extensionHost(userHome)

  await expect(launchProject(host, '~/child')).resolves.toEqual({
    root: canonicalChild,
    url: 'http://127.0.0.1:4749',
  })
  await expect(launchProject(host, '~')).resolves.toEqual({
    root: canonicalHome,
    url: 'http://127.0.0.1:4750',
  })

  expect(spawn).toHaveBeenNthCalledWith(
    1,
    process.execPath,
    ['/ultimate/bin/ultimate.ts', canonicalChild, '--no-open'],
    expect.objectContaining({ cwd: canonicalChild }),
  )
  expect(spawn).toHaveBeenNthCalledWith(
    2,
    process.execPath,
    ['/ultimate/bin/ultimate.ts', canonicalHome, '--no-open'],
    expect.objectContaining({ cwd: canonicalHome }),
  )
  expect(children[0].unref).toHaveBeenCalledOnce()
  expect(children[1].unref).toHaveBeenCalledOnce()
})

it("reuses only the selected canonical project's ready backend", async () => {
  const userHome = await temp('ultimate-project-switcher-reuse-')
  const current = join(userHome, 'current')
  const selected = join(userHome, 'selected')
  await mkdir(current)
  await mkdir(selected)
  const canonicalCurrent = await realpath(current)
  const canonicalSelected = await realpath(selected)
  lock(userHome, canonicalCurrent, 4100, 4747)
  lock(userHome, canonicalSelected, 4200, 4748)
  alive()
  ready(canonicalSelected)

  await expect(
    launchProject(extensionHost(userHome, canonicalCurrent), canonicalSelected),
  ).resolves.toEqual({
    root: canonicalSelected,
    url: 'http://127.0.0.1:4748',
  })

  expect(spawn).not.toHaveBeenCalled()
  expect(fetch).toHaveBeenCalledWith(
    'http://127.0.0.1:4748/api/events',
    expect.objectContaining({ redirect: 'manual' }),
  )
})

it('starts a distinct project separately and duplicate requests converge on its URL', async () => {
  const userHome = await temp('ultimate-project-switcher-distinct-')
  const current = join(userHome, 'current')
  const selected = join(userHome, 'selected')
  await mkdir(current)
  await mkdir(selected)
  const canonicalCurrent = await realpath(current)
  const canonicalSelected = await realpath(selected)
  lock(userHome, canonicalCurrent, 4100, 4747)
  const child = supervisor(4200)
  alive()
  ready(canonicalSelected)
  spawn.mockImplementation(() => {
    lock(userHome, canonicalSelected, child.pid, 4748)
    return child
  })
  const host = extensionHost(userHome, canonicalCurrent)

  const [first, second] = await Promise.all([
    launchProject(host, canonicalSelected),
    launchProject(host, canonicalSelected),
  ])

  expect(first).toEqual({ root: canonicalSelected, url: 'http://127.0.0.1:4748' })
  expect(second).toEqual(first)
  expect(fetch).toHaveBeenCalledWith(
    'http://127.0.0.1:4748/api/events',
    expect.objectContaining({ redirect: 'manual' }),
  )
  expect(spawn).toHaveBeenCalledWith(
    process.execPath,
    ['/ultimate/bin/ultimate.ts', canonicalSelected, '--no-open'],
    expect.objectContaining({ cwd: canonicalSelected }),
  )
})

it("waits past a pre-bind port collision for the selected project's own backend", async () => {
  const userHome = await temp('ultimate-project-switcher-port-collision-')
  const current = join(userHome, 'current')
  const selected = join(userHome, 'selected')
  await mkdir(current)
  await mkdir(selected)
  const canonicalCurrent = await realpath(current)
  const canonicalSelected = await realpath(selected)
  const child = { ...supervisor(4200), exitCode: 1 }
  alive()
  spawn.mockImplementation(() => {
    lock(userHome, canonicalSelected, child.pid, 4747)
    return child
  })
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (url.startsWith('http://127.0.0.1:4747')) {
        lock(userHome, canonicalSelected, child.pid, 4748)
        return new Response('', { status: 503 })
      }
      return system(canonicalSelected)
    }),
  )

  await expect(
    launchProject(extensionHost(userHome, canonicalCurrent), canonicalSelected),
  ).resolves.toEqual({
    root: canonicalSelected,
    url: 'http://127.0.0.1:4748',
  })
})

it('waits for the winning owner after a duplicate launcher exits first', async () => {
  const userHome = await temp('ultimate-project-switcher-duplicate-race-')
  const selected = join(userHome, 'selected')
  await mkdir(selected)
  const canonicalSelected = await realpath(selected)
  const child = { ...supervisor(4200), exitCode: 1 }
  alive()
  ready(canonicalSelected)
  spawn.mockImplementation(() => {
    setImmediate(() => lock(userHome, canonicalSelected, 4300, 4748))
    return child
  })

  await expect(launchProject(extensionHost(userHome), canonicalSelected)).resolves.toEqual({
    root: canonicalSelected,
    url: 'http://127.0.0.1:4748',
  })
})

it('stops only the supervisor it started when readiness fails', async () => {
  const userHome = await temp('ultimate-project-switcher-cleanup-')
  const selected = join(userHome, 'selected')
  await mkdir(selected)
  const canonicalSelected = await realpath(selected)
  const child = supervisor(4321)
  const cancelled = new AbortController()
  alive()
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => {
      cancelled.abort(new Error('User cancelled'))
      throw new Error('Cancelled')
    }),
  )
  spawn.mockImplementation(() => {
    lock(userHome, canonicalSelected, child.pid, 4748)
    return child
  })

  await expect(
    launchProject(extensionHost(userHome), canonicalSelected, cancelled.signal),
  ).rejects.toThrow('User cancelled')

  expect(child.kill).toHaveBeenCalledWith('SIGTERM')
})

it('exposes launch but no backend termination action', () => {
  expect(userActions).toEqual(['start'])
  expect(localActions).toEqual(['start'])
  expect(Object.keys(actions)).toEqual(['list', 'start'])
})

it('rejects missing, non-directory, and inaccessible project paths before spawning', async () => {
  const parent = await temp('ultimate-project-switcher-invalid-')
  const file = join(parent, 'file')
  const denied = join(parent, 'denied')
  await writeFile(file, '')
  await mkdir(denied)
  await chmod(denied, 0)
  const host = extensionHost(parent)

  try {
    await expect(launchProject(host, join(parent, 'missing'))).rejects.toThrow(
      'Cannot open project',
    )
    await expect(launchProject(host, file)).rejects.toThrow('not a directory')
    await expect(launchProject(host, denied)).rejects.toThrow('Cannot access project')
    expect(spawn).not.toHaveBeenCalled()
  } finally {
    await chmod(denied, 0o700)
  }
})
