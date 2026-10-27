import { spawn } from 'node:child_process'
import { readFile, realpath, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { defineExtension } from '@earendil-works/pi-durable'
import { implementAction } from '../../lib/actions.ts'
import type { ExtensionHost } from '../../server/extensions.ts'
import { ListAction, StartAction, StopAction } from './refs.ts'

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
  return root
}

function alive(pid: number) {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    return (error as NodeJS.ErrnoException).code !== 'ESRCH'
  }
}

async function lockOwner(path: string) {
  try {
    const owner = JSON.parse(await readFile(path, 'utf8')) as {
      pid?: unknown
      project?: unknown
    }
    if (!Number.isSafeInteger(owner.pid) || (owner.pid as number) < 1)
      throw new Error('Invalid pid')
    return { pid: owner.pid as number, project: owner.project }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined
    throw new Error(`Cannot parse Ultimate lock ${path}`, { cause: error })
  }
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

/** Stop only the live PID still named by the requested non-current project's supervisor lock. */
export async function stopProject(
  host: Pick<ExtensionHost, 'projectRoot' | 'projects'>,
  requested: { root: string; pid: number },
) {
  const root = await directory(requested.root)
  const current = await realpath(host.projectRoot)
  if (root === current) throw new Error('Cannot stop the current project')
  if (!Number.isSafeInteger(requested.pid) || requested.pid < 1)
    throw new Error('Expected a positive project pid')
  const project = (await host.projects()).find((candidate) => candidate.root === root)
  if (!project) throw new Error('Project is no longer known')
  const owner = await lockOwner(join(project.home, 'ultimate.lock'))
  if (!owner) throw new Error('Project is no longer running')
  if (owner.pid !== requested.pid) throw new Error('Project process changed; refresh and try again')
  if (owner.project !== root) throw new Error('Project lock does not match the requested project')
  if (!alive(owner.pid)) throw new Error('Project process is no longer running')
  process.kill(owner.pid, 'SIGTERM')
  return { root }
}

function rootArgument(args: Record<string, unknown>) {
  if (typeof args.root !== 'string') throw new Error('Expected a project root')
  return args.root
}

export const userActions = ['start', 'stop']
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
  stop: implementAction(StopAction, (args, { host }) => {
    if (typeof args !== 'object' || args === null || Array.isArray(args))
      throw new Error('Expected { root, pid }')
    return stopProject(host, {
      root: rootArgument(args),
      pid: typeof args.pid === 'number' ? args.pid : Number.NaN,
    })
  }),
}
