import { useEffect, useSyncExternalStore } from 'react'
import { useExtensionUiState, useUltimate } from '@/sdk'

/** The spec on screen, in durable UI state: it survives reloads and follows every tab, as the surface does. */
export const useSpec = () => useExtensionUiState<string>('spec', 'uncommitted')
/** The ready workspace that resolves the selected spec, or null for the project checkout. */
export const useReviewWorkspace = () => useExtensionUiState<number | null>('workspace', null)

/** A line to scroll to and mark: `line` of `file`, on the new side unless `side` says old. */
export type ReviewTarget = { file: string; line: number; side?: 'old' | 'new' }

type Request = { spec: string; workspace?: number; at?: ReviewTarget }

const listeners = new Set<() => void>()
const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
const notify = () => {
  for (const listener of listeners) listener()
}

function fromAddress(): Request | undefined {
  const params = new URL(location.href).searchParams
  const spec = params.get('review')
  if (!spec) return undefined
  const file = params.get('file')
  const line = Number(params.get('line'))
  const side = params.get('side') === 'old' ? 'old' : undefined
  const workspace = Number(params.get('workspace'))
  return {
    spec,
    ...(Number.isSafeInteger(workspace) && workspace > 0 ? { workspace } : {}),
    ...(file && Number.isSafeInteger(line) && line > 0
      ? { at: { file, line, ...(side && { side }) } }
      : {}),
  }
}

// A review someone asked for and the link has not shown yet: the page's `?review=` first, then `openReview` calls.
let requested = fromAddress()
// The line the surface should scroll to, until it has.
let target: ReviewTarget | undefined

/** Show the Review surface at `spec` (see `ReviewKind` in refs.ts), scrolled to `at` when given. */
export function openReview(spec: string, at?: ReviewTarget) {
  requested = { spec, ...(at && { at }) }
  notify()
}

/** The line the surface was asked to show, until `reachedTarget`. */
export const useTarget = () => useSyncExternalStore(subscribe, () => target)

/** The surface scrolled to the target line, or found it cannot. */
export function reachedTarget() {
  target = undefined
  notify()
}

/**
 * Mounted at the root: shows a requested review, and keeps `?review=<spec>` in the address while Review is on screen,
 * so the address can be shared. It replaces the history entry: switching surfaces adds none.
 */
export function ReviewLink() {
  const wanted = useSyncExternalStore(subscribe, () => requested)
  const [spec, setSpec] = useSpec()
  const [workspace, setWorkspace] = useReviewWorkspace()
  const { surface, showSurface } = useUltimate()
  useEffect(() => {
    if (wanted === undefined) return
    requested = undefined
    target = wanted.at
    setSpec(wanted.spec)
    setWorkspace(wanted.workspace ?? null)
    showSurface('review')
    notify()
  }, [wanted, setSpec, setWorkspace, showSurface])
  useEffect(() => {
    if (requested !== undefined) return
    const url = new URL(location.href)
    const shown = surface === 'review' ? spec : null
    const shownWorkspace = surface === 'review' ? workspace : null
    if (
      url.searchParams.get('review') === shown &&
      url.searchParams.get('workspace') === (shownWorkspace?.toString() ?? null)
    )
      return
    if (shown === null) url.searchParams.delete('review')
    else url.searchParams.set('review', shown)
    if (shownWorkspace === null) url.searchParams.delete('workspace')
    else url.searchParams.set('workspace', String(shownWorkspace))
    // A line belongs to the review it was asked with: a new spec or another surface drops it.
    for (const name of ['file', 'line', 'side']) url.searchParams.delete(name)
    history.replaceState(history.state, '', url)
  }, [surface, spec, workspace])
  return null
}
