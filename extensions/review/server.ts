import type { Context } from '@earendil-works/chord'
import { BACKGROUND_CONTEXT as context } from '@earendil-works/chord/context'
import { defineEntry, ROOT_CONVERSATION_ID } from '@earendil-works/pi-durable'
import type { ConversationId } from '@earendil-works/pi-durable'
import { implementAction } from '../../lib/actions.ts'
import { formatAgo } from '../../lib/ago.ts'
import { UserInputEvent } from '../../shared/events.ts'
import { git, isolatable } from '../../lib/git.ts'
import type { ExtensionHost } from '../../server/extensions.ts'
import { SubagentsApi } from '../subagents/api.ts'
import { SubmissionLanded, WorkspacesApi } from '../workspaces/api.ts'
import { checkReview, reviewText } from './comments.ts'
import type { ReviewComments } from './comments.ts'
import { reviewDiff } from './diff.ts'
import { DiffAction, RangesAction, RecipientAction, SendAction } from './refs.ts'
import type { ReviewRange } from './refs.ts'

/** A review the user sent: the input its recipient reads as `reviewText`; card.tsx renders it. */
export const ReviewCommentsEntry = defineEntry<ReviewComments>('review.comments')

const index = (host: ExtensionHost, ctx: Context) =>
  host.harness().snapshot(host.need(WorkspacesApi).doc, ROOT_CONVERSATION_ID, ctx)

/** Conversation `id`'s ready checkout, or the project checkout when no conversation was requested. */
async function reviewCheckout(host: ExtensionHost, id: unknown) {
  if (id === undefined) return { path: host.projectRoot }
  if (typeof id !== 'number' || !Number.isSafeInteger(id) || id < 1)
    throw new Error('conversation must be a conversation id')
  const workspace = (await index(host, context))?.items[String(id)]
  if (workspace?.state !== 'ready') throw new Error(`Workspace #${id} is not ready`)
  return { path: workspace.path, target: workspace.target }
}

/** The branch `branch` lands on: its worktree's target, else the project checkout's branch. */
async function target(host: ExtensionHost, branch: string) {
  const items = Object.values((await index(host, context))?.items ?? {})
  const owned = items.find((item) => item.branch === branch)
  if (owned) return owned.target
  const checkout = await isolatable(host.projectRoot)
  if ('reason' in checkout) throw new Error(checkout.reason)
  return checkout.target
}

/** A git or landing time in seconds, as the range list shows it. */
const ago = (seconds: number) => formatAgo(seconds * 1000)

async function ranges(host: ExtensionHost): Promise<ReviewRange[]> {
  const cwd = host.projectRoot
  const items = Object.entries((await index(host, context))?.items ?? {})
  const titles = new Map(host.conversations().map((item) => [item.id, item.title]))
  const [branches, commits, landings] = await Promise.all([
    Promise.all(
      items
        .filter(([, item]) => item.state === 'ready')
        .map(async ([key, item]): Promise<ReviewRange[]> => {
          const id = Number(key)
          const head = await git(item.path, 'rev-parse', '--verify', 'HEAD^{commit}')
          const targetSha = await git(item.path, 'rev-parse', '--verify', `${item.target}^{commit}`)
          const [base, at] = await Promise.all([
            git(item.path, 'merge-base', targetSha, head),
            git(item.path, 'show', '-s', '--format=%ct', head),
          ])
          const branch: ReviewRange = {
            spec: `${base}...${head}`,
            group: 'Branches',
            label: titles.get(id) ?? `#${id}`,
            detail: `#${id} · ${head.slice(0, 7)} · ${ago(Number(at))}`,
            conversation: id,
            workspace: id,
          }
          const branchCommits = await git(
            item.path,
            'log',
            '--format=%H%x09%ct%x09%s',
            `${base}..${head}`,
          )
          return [
            branch,
            ...branchCommits
              .split('\n')
              .filter(Boolean)
              .map((line): ReviewRange => {
                const [sha, committed, subject] = line.split('\t') as [string, string, string]
                return {
                  spec: sha,
                  group: 'Branches',
                  label: subject,
                  detail: `${sha.slice(0, 7)} · ${ago(Number(committed))}`,
                  conversation: id,
                  workspace: id,
                  nested: true,
                }
              }),
          ]
        }),
    ),
    git(cwd, 'log', '-n', '15', '--format=%H%x09%ct%x09%s').catch(
      // No commit yet: nothing to list.
      () => '',
    ),
    host.eventLog.recent({ events: [SubmissionLanded], limit: 10 }),
  ])
  const list: ReviewRange[] = [
    { spec: 'uncommitted', group: 'Working tree', label: 'Uncommitted changes' },
    ...branches.flat(),
  ]
  for (const { data, at } of landings)
    list.push({
      spec: `${data.base}...${data.sha}`,
      group: 'Landings',
      label: data.feature ? `${data.feature} · ${data.title}` : data.title || data.sha.slice(0, 7),
      detail: `${data.sha.slice(0, 7)} · ${data.commitCount} commit${data.commitCount === 1 ? '' : 's'} · ${ago(Date.parse(at) / 1000)}`,
      conversation: data.conversationId,
    })
  for (const line of commits.split('\n').filter(Boolean)) {
    const [sha, at, subject] = line.split('\t') as [string, string, string]
    list.push({
      spec: sha,
      group: 'Commits',
      label: subject,
      detail: `${sha.slice(0, 7)} · ${ago(Number(at))}`,
    })
  }
  return list
}

/** The conversation of an `uncommitted:<id>` spec, else undefined. */
const worktreeOf = (spec: string) => {
  const id = /^uncommitted:([1-9]\d*)$/.exec(spec.trim())?.[1]
  return id === undefined ? undefined : Number(id)
}

const known = (host: ExtensionHost, id: number) =>
  host.conversations().some((conversation) => conversation.id === id)

/** Who a review of `spec` goes to unless the user picks another: see `RecipientAction`. */
async function recipient(host: ExtensionHost, spec: string): Promise<number> {
  const owner = async () => {
    const worktree = worktreeOf(spec)
    if (worktree !== undefined) return worktree
    if (spec.startsWith('branch:')) {
      const branch = spec.slice('branch:'.length)
      const items = Object.entries((await index(host, context))?.items ?? {})
      return Number(items.find(([, item]) => item.branch === branch)?.[0]) || undefined
    }
    const range = /^[^.]+\.\.\.([^.]+)$/.exec(spec)
    if (range) {
      const landings = await host.eventLog.recent({ events: [SubmissionLanded], limit: 200 })
      const sha = await git(
        host.projectRoot,
        'rev-parse',
        '--verify',
        '--quiet',
        '--end-of-options',
        `${range[1]}^{commit}`,
      )
      return landings.find(({ data }) => data.sha === sha)?.data.conversationId
    }
    if (spec === 'uncommitted' || spec.startsWith('-')) return undefined
    const trailer = await git(
      host.projectRoot,
      'log',
      '-1',
      '--format=%(trailers:key=Ultimate-Conversation,valueonly)',
      '--end-of-options',
      spec,
    )
    return Number(trailer.split('\n')[0]) || undefined
  }
  const found = await owner().catch(
    // An unknown ref or a missing repository has no owner: the review goes to the primary agent.
    () => undefined,
  )
  if (found !== undefined && known(host, found)) return found
  return host.need(SubagentsApi).standing('ultimate', context)
}

export const userActions = ['send']

export const actions = {
  diff: implementAction(DiffAction, async (args, { host, signal }) => {
    const input = args && typeof args === 'object' && !Array.isArray(args) ? args : {}
    if (typeof input.spec !== 'string') throw new Error('Expected { spec }')
    // `uncommitted:<id>` names a worktree's uncommitted changes: the same diff, run in that checkout.
    const worktree = worktreeOf(input.spec)
    const selected = await reviewCheckout(host, worktree ?? input.conversation)
    const diff = await reviewDiff(
      selected.path,
      worktree === undefined ? input.spec : 'uncommitted',
      { target: async (branch) => selected.target ?? target(host, branch), signal },
    )
    return worktree === undefined
      ? diff
      : { ...diff, spec: input.spec, title: `Uncommitted changes in #${worktree}` }
  }),
  ranges: implementAction(RangesAction, (_args, { host }) => ranges(host)),
  recipient: implementAction(RecipientAction, async (args, { host }) => {
    const spec = args && typeof args === 'object' && !Array.isArray(args) ? args.spec : undefined
    if (typeof spec !== 'string') throw new Error('Expected { spec }')
    return { conversation: await recipient(host, spec) }
  }),
  send: implementAction(SendAction, async (args, { host, device }) => {
    const id =
      args && typeof args === 'object' && !Array.isArray(args) ? args.conversation : undefined
    if (typeof id !== 'number' || !Number.isSafeInteger(id) || !known(host, id))
      throw new Error('conversation must be an existing conversation id')
    const review = checkReview(args)
    const conversation = await host.harness().conversation(id as ConversationId, context)
    if (!conversation) throw new Error(`No conversation #${id}`)
    const content = reviewText(review)
    const submission = await conversation.submit(
      {
        type: 'input',
        content,
        entry: { kind: ReviewCommentsEntry.kind, data: review },
        // A review is the user's input: it steers a busy recipient as a message typed into it would.
        whenBusy: 'steer',
      },
      context,
    )
    // In a commit of its own right after the input's, which Pi admits with no hook: a crash in between loses it.
    const admitted = await submission.status(context)
    await host.harness().commit(
      (tx) =>
        host.emit(tx, UserInputEvent, {
          conversation: id,
          kind: 'review',
          ...(admitted.entry === undefined
            ? { submission: submission.id }
            : { entry: admitted.entry }),
          length: content.length,
          ...device,
        }),
      context,
    )
    return { conversation: id }
  }),
}

export default { name: 'review' }
