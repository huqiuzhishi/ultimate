import { mkdir, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { expect, it } from 'vitest'
import type { WorkspaceInfo } from '../extensions/workspaces/types.ts'
import { git } from '../lib/git.ts'
import { fauxServer, post, removeTemp, temp, until } from './helpers.ts'

async function repository(path: string, file: string) {
  await mkdir(path, { recursive: true })
  await git(path, 'init', '-b', 'main')
  await git(path, 'config', 'user.email', 'test@example.com')
  await git(path, 'config', 'user.name', 'Test')
  await writeFile(join(path, file), 'base\n')
  await git(path, 'add', '.')
  await git(path, 'commit', '-m', 'base')
}

it('lists every ready workspace by immutable range and reviews it in its own repository', async () => {
  const home = await temp('ultimate-review-ranges-')
  const project = join(home, 'project')
  const other = join(home, 'other')
  await repository(project, 'project.txt')
  await repository(other, 'other.txt')
  await mkdir(join(project, '.ultimate'))
  await writeFile(join(project, '.ultimate/settings.json'), '{}')
  const server = await fauxServer({
    ultimateRoot: resolve('.'),
    projectRoot: project,
    userHome: home,
    home: join(home, 'state'),
    localSetup: false,
  })
  try {
    const create = async (cwd: string, title: string) => {
      const response = await post(server, '/api/extensions/workspaces/actions/create', {
        args: { cwd, title },
      })
      expect(response.status).toBe(200)
      const id = response.data.result.id as number
      let workspace: WorkspaceInfo | undefined
      await until(async () => {
        const info = await post(server, '/api/extensions/workspaces/actions/info', { args: { id } })
        workspace = info.data.result as WorkspaceInfo
        return workspace.state === 'ready'
      })
      return { id, workspace: workspace! }
    }
    const first = await create(project, 'Same title')
    const second = await create(other, 'Same title')

    await writeFile(join(first.workspace.path, 'project-change.txt'), 'project\n')
    await git(first.workspace.path, 'add', '.')
    await git(first.workspace.path, 'commit', '-m', 'project change')
    await writeFile(join(second.workspace.path, 'other-change.txt'), 'other\n')
    await git(second.workspace.path, 'add', '.')
    await git(second.workspace.path, 'commit', '-m', 'other change')
    await git(second.workspace.path, 'branch', '-m', 'renamed-outside-ultimate')
    await git(second.workspace.path, 'switch', '--detach')

    const response = await post(server, '/api/extensions/review/actions/ranges', { args: null })
    expect(response.status).toBe(200)
    const branches = response.data.result.filter(
      (range: { group: string }) => range.group === 'Branches',
    )
    expect(branches).toHaveLength(2)
    for (const { id, workspace } of [first, second]) {
      const head = await git(workspace.path, 'rev-parse', 'HEAD')
      const base = await git(workspace.path, 'merge-base', workspace.target, head)
      expect(branches).toContainEqual({
        spec: `${base}...${head}`,
        group: 'Branches',
        label: 'Same title',
        detail: expect.stringContaining(`#${id}`),
        conversation: id,
        workspace: id,
      })
    }

    const selected = branches.find(
      (range: { conversation?: number }) => range.conversation === second.id,
    )
    const diff = await post(server, '/api/extensions/review/actions/diff', {
      args: { spec: selected.spec, conversation: second.id },
    })
    expect(diff.status).toBe(200)
    expect(diff.data.result).toMatchObject({
      spec: selected.spec,
      cwd: second.workspace.path,
      files: [{ path: 'other-change.txt' }],
    })

    expect(
      (
        await post(server, '/api/extensions/workspaces/actions/discard', {
          args: { id: second.id },
        })
      ).status,
    ).toBe(200)
    const removed = await post(server, '/api/extensions/review/actions/diff', {
      args: { spec: selected.spec, conversation: second.id },
    })
    expect(removed.status).not.toBe(200)
    expect(JSON.stringify(removed.data)).toContain(`Workspace #${second.id} is not ready`)
  } finally {
    await server.close()
    await removeTemp(home)
  }
})
