import { mkdir, realpath, symlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import type { ExtensionHost } from '../server/extensions.ts'
import { launchProject, stopProject } from '../extensions/project-switcher/server.ts'
import { temp } from './helpers.ts'

const spawn = vi.hoisted(() =>
  vi.fn<
    (
      command: string,
      args: readonly string[],
      options: { env?: NodeJS.ProcessEnv; [key: string]: unknown },
    ) => { unref(): void }
  >(),
)
vi.mock('node:child_process', async (original) => ({
  ...(await original<typeof import('node:child_process')>()),
  spawn,
}))

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
  spawn.mockReset()
})

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
  const unref = vi.fn<() => void>()
  spawn.mockReturnValue({ unref })
  const host = {
    projectRoot: '/current',
    ultimateRoot: '/ultimate',
    userHome: directory,
  } as ExtensionHost

  await expect(launchProject(host, link)).resolves.toEqual({ root: canonical })

  expect(spawn).toHaveBeenCalledWith(process.execPath, ['/ultimate/bin/ultimate.ts', canonical], {
    cwd: canonical,
    detached: true,
    env: expect.objectContaining({ ULTIMATE_MODEL: 'kept/model' }),
    stdio: 'ignore',
  })
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
  expect(unref).toHaveBeenCalledOnce()
})

it('signals only the revalidated live lock owner for a non-current project', async () => {
  const userHome = await temp('ultimate-project-switcher-stop-')
  const requested = join(userHome, 'other')
  await mkdir(requested)
  const root = await realpath(requested)
  const home = join(userHome, 'other-home')
  await mkdir(home)
  const lock = join(home, 'ultimate.lock')
  const current = join(userHome, 'current')
  await mkdir(current)
  const kill = vi.spyOn(process, 'kill').mockImplementation((pid, signal) => {
    if (signal === 0 && pid === 4321) return true
    return true
  })
  const host: Pick<ExtensionHost, 'projectRoot' | 'projects'> = {
    projectRoot: current,
    projects: async () => [
      {
        root,
        name: 'other',
        home,
        current: false,
        conversations: [],
      },
    ],
  }

  await writeFile(lock, JSON.stringify({ pid: 4321, port: 4748, project: root }))
  await expect(stopProject(host, { root, pid: 4321 })).resolves.toEqual({ root })
  expect(kill.mock.calls).toEqual([
    [4321, 0],
    [4321, 'SIGTERM'],
  ])

  kill.mockClear()
  await expect(stopProject({ ...host, projectRoot: root }, { root, pid: 4321 })).rejects.toThrow(
    'current project',
  )
  await writeFile(lock, JSON.stringify({ pid: 9999, port: 4748, project: root }))
  await expect(stopProject(host, { root, pid: 4321 })).rejects.toThrow('changed')
  await writeFile(lock, JSON.stringify({ pid: 4321, port: 4748, project: '/different' }))
  await expect(stopProject(host, { root, pid: 4321 })).rejects.toThrow('does not match')
  expect(kill).not.toHaveBeenCalledWith(expect.any(Number), 'SIGTERM')

  kill.mockImplementation((_pid, signal) => {
    if (signal === 0) throw Object.assign(new Error('gone'), { code: 'ESRCH' })
    return true
  })
  await writeFile(lock, JSON.stringify({ pid: 4321, port: 4748, project: root }))
  await expect(stopProject(host, { root, pid: 4321 })).rejects.toThrow('no longer running')
  expect(kill).not.toHaveBeenCalledWith(expect.any(Number), 'SIGTERM')
})
