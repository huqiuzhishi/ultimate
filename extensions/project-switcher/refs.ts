/** Local project switching: known projects and explicit backend launch controls. Browser-safe. */
import { actionRef } from '../../shared/extension-api.ts'

export type Project = {
  root?: string
  name: string
  current: boolean
  running?: { pid: number; url: string }
}

/** No arguments → the local projects known to this Ultimate installation. */
export const ListAction = actionRef<null, Project[]>('project-switcher', 'list')
/** `{ root }` → the ready URL of that canonical project's own Ultimate supervisor. */
export const StartAction = actionRef<{ root: string }, { root: string; url: string }>(
  'project-switcher',
  'start',
)
