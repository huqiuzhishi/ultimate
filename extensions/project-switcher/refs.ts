/** Local project switching: known projects and explicit backend start/stop controls. Browser-safe. */
import { actionRef } from '../../shared/extension-api.ts'

export type Project = {
  root?: string
  name: string
  current: boolean
  running?: { pid: number; url: string }
}

/** No arguments → the local projects known to this Ultimate installation. */
export const ListAction = actionRef<null, Project[]>('project-switcher', 'list')
/** `{ root }` → launch a separate Ultimate supervisor for that existing host directory. */
export const StartAction = actionRef<{ root: string }, { root: string }>(
  'project-switcher',
  'start',
)
/** `{ root, pid }` → SIGTERM the revalidated non-current Ultimate supervisor. */
export const StopAction = actionRef<{ root: string; pid: number }, { root: string }>(
  'project-switcher',
  'stop',
)
