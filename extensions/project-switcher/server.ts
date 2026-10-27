import { spawn } from 'node:child_process'
import { constants } from 'node:fs'
import { access, realpath, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { defineExtension } from '@earendil-works/pi-durable'
import { implementAction } from '../../lib/actions.ts'
import type { ExtensionHost } from '../../server/extensions.ts'
import { ListAction, StartAction } from './refs.ts'

export default defineExtension({ name: 'project-switcher' })

const inheritedSupervisorVariables = new Set([
  'ULTIMATE_GENERATION',
  'ULTIMATE_HOME',
  'ULTIMATE_INSTANCE_OWNER',
  'ULTIMATE_NO_OPEN',
  'ULTIMATE_PORT',
  'ULTIMATE_PREVIOUS_BUILD',
  'ULTIMATE_PROJECT',
  'ULTIMATE_PUBLIC_URL',
  'ULTIMATE_SUPERVISED',
])

function launchEnvironment(parent: NodeJS.ProcessEnv) {
  return Object.fromEntries(
    Object.entries(parent).filter(([key]) => !inheritedSupervisorVariables.has(key)),
  )
}

async function directory(path: string) {
  if (typeof path !== 'string' || !path.trim()) throw new Error('Expected a project path')
  const root = await realpath(path).catch((error: NodeJS.ErrnoException) => {
    throw new Error(`Cannot open project ${path}: ${error.code ?? error.message}`, { cause: error })
  })
  if (!(await stat(root)).isDirectory()) throw new Error(`Project path is not a directory: ${path}`)
  await access(root, constants.R_OK | constants.X_OK).catch((error: NodeJS.ErrnoException) => {
    throw new Error(`Cannot access project ${path}: ${error.code ?? error.message}`, {
      cause: error,
    })
  })
  return root
}

/** Launch the exact Ultimate supervisor entrypoint for a canonical host directory. */
export async function launchProject(
  host: Pick<ExtensionHost, 'projectRoot' | 'ultimateRoot' | 'userHome'>,
  path: string,
) {
  const root = await directory(path)
  const child = spawn(process.execPath, [join(host.ultimateRoot, 'bin/ultimate.ts'), root], {
    cwd: root,
    detached: true,
    env: launchEnvironment(process.env),
    stdio: 'ignore',
  })
  child.unref()
  return { root }
}

function rootArgument(args: Record<string, unknown>) {
  if (typeof args.root !== 'string') throw new Error('Expected a project root')
  return args.root
}

export const userActions = ['start']
export const localActions = ['start']
export const actions = {
  list: implementAction(ListAction, async (_args, { host }) =>
    (await host.projects()).map(({ root, name, current, running }) => ({
      root,
      name,
      current,
      running,
    })),
  ),
  start: implementAction(StartAction, (args, { host }) => {
    if (typeof args !== 'object' || args === null || Array.isArray(args))
      throw new Error('Expected { root }')
    return launchProject(host, rootArgument(args))
  }),
}
