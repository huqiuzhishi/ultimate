import { spawn } from 'node:child_process'
import { constants } from 'node:fs'
import { access, realpath, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { defineExtension } from '@earendil-works/pi-durable'
import { implementAction } from '../../lib/actions.ts'
import type { ExtensionHost } from '../../server/extensions.ts'
// Opening another backend must validate the same supervisor sidecar and PID semantics as project discovery.
// oxlint-disable-next-line no-restricted-imports
import { alive, pause, readOwner } from '../../server/lock.ts'
// The canonical project home is the only safe place to discover a first-start supervisor before project.json exists.
// oxlint-disable-next-line no-restricted-imports
import { projectHome } from '../../server/project.ts'
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

async function directory(path: string, userHome: string) {
  if (typeof path !== 'string' || !path.trim()) throw new Error('Expected a project path')
  const expanded =
    path === '~' ? userHome : path.startsWith('~/') ? join(userHome, path.slice(2)) : path
  const root = await realpath(expanded).catch((error: NodeJS.ErrnoException) => {
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

const startupTimeout = 60_000
const readinessProbeTimeout = 500

async function runningProject(root: string, userHome: string) {
  const owner = await readOwner(join(projectHome(root, userHome), 'ultimate.lock'))
  if (
    owner?.project !== root ||
    !Number.isInteger(owner.port) ||
    (owner.port ?? 0) < 1 ||
    (owner.port ?? 0) > 65_535 ||
    !alive(owner.pid)
  )
    return undefined
  return {
    pid: owner.pid,
    url: `http://127.0.0.1:${owner.port}`,
  }
}

class ProjectUnavailable extends Error {}
class ProjectMismatch extends Error {}

async function verifyReady(root: string, url: string, signal?: AbortSignal) {
  const controller = new AbortController()
  const timeout = AbortSignal.timeout(readinessProbeTimeout)
  const requestSignal = AbortSignal.any(
    signal ? [signal, timeout, controller.signal] : [timeout, controller.signal],
  )
  try {
    const response = await fetch(`${url}/api/events`, {
      redirect: 'manual',
      signal: requestSignal,
    }).catch((error) => {
      throw new ProjectUnavailable(`Ultimate is not reachable at ${url}`, { cause: error })
    })
    if (!response.ok || !response.body)
      throw new Error(`Ultimate did not become ready at ${url} (${response.status})`)
    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffered = ''
    for (;;) {
      const chunk = await reader.read()
      buffered += decoder.decode(chunk.value, { stream: !chunk.done })
      if (buffered.length > 1024 * 1024)
        throw new Error(`Ultimate returned too much readiness data at ${url}`)
      for (;;) {
        const boundary = buffered.indexOf('\n\n')
        if (boundary < 0) break
        const block = buffered.slice(0, boundary)
        buffered = buffered.slice(boundary + 2)
        if (!block.split('\n').includes('event: system')) continue
        const data = block
          .split('\n')
          .filter((line) => line.startsWith('data: '))
          .map((line) => line.slice(6))
          .join('\n')
        const system = JSON.parse(data) as { project?: { root?: unknown } }
        if (system.project?.root !== root)
          throw new ProjectMismatch(`Ultimate at ${url} serves another project`)
        return
      }
      if (chunk.done) throw new Error(`Ultimate returned no system identity at ${url}`)
    }
  } finally {
    controller.abort()
  }
}

async function waitForProject(
  root: string,
  userHome: string,
  child: ReturnType<typeof spawn> | undefined,
  signal?: AbortSignal,
) {
  const deadline = Date.now() + startupTimeout
  let launchError: Error | undefined
  child?.once('error', (error) => {
    launchError = error
  })
  for (;;) {
    if (signal?.aborted) throw signal.reason
    const running = await runningProject(root, userHome)
    if (running) {
      try {
        await verifyReady(root, running.url, signal)
        return running
      } catch {
        if (signal?.aborted) throw signal.reason
      }
    }
    if (launchError) throw launchError
    if (Date.now() >= deadline) throw new Error(`Ultimate did not start ${root} within 60 seconds`)
    await pause(50)
  }
}

/** Return the selected canonical project's ready URL, starting its own supervisor when needed. */
export async function launchProject(
  host: Pick<ExtensionHost, 'projectRoot' | 'ultimateRoot' | 'userHome'>,
  path: string,
  signal?: AbortSignal,
) {
  const root = await directory(path, host.userHome)
  const existing = await runningProject(root, host.userHome)
  if (existing) {
    const running = await waitForProject(root, host.userHome, undefined, signal)
    return { root, url: running.url }
  }
  const child = spawn(
    process.execPath,
    [join(host.ultimateRoot, 'bin/ultimate.ts'), root, '--no-open'],
    {
      cwd: root,
      detached: true,
      env: launchEnvironment(process.env),
      stdio: 'ignore',
    },
  )
  child.unref()
  try {
    const running = await waitForProject(root, host.userHome, child, signal)
    return { root, url: running.url }
  } catch (error) {
    if (child.exitCode === null) child.kill('SIGTERM')
    throw error
  }
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
  start: implementAction(StartAction, (args, { host, signal }) => {
    if (typeof args !== 'object' || args === null || Array.isArray(args))
      throw new Error('Expected { root }')
    return launchProject(host, rootArgument(args), signal)
  }),
}
