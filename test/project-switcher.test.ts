import { chmod, mkdir, realpath, symlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import type { ExtensionHost } from '../server/extensions.ts'
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
  const host = {
    projectRoot: '/current',
    ultimateRoot: '/ultimate',
    userHome: parent,
  } as ExtensionHost

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
