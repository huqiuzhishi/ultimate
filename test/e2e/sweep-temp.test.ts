import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it, vi } from 'vitest'
import { groupAlive, spawnGroup, stopGroup } from '../../lib/process-group.ts'
import sweep, { testTempPrefix } from '../sweep-temp.ts'
import { until } from '../helpers.ts'

const staleHome = async () => {
  const exited = spawn('/usr/bin/true')
  await once(exited, 'exit')
  return mkdtemp(join(tmpdir(), `${testTempPrefix}${exited.pid}-`))
}

it('reaps identity-recorded groups from a dead test worker without touching an unrelated group', async () => {
  const stale = await staleHome()
  const pidFile = join(stale, 'nested', 'check.pid')
  await mkdir(join(stale, 'nested'))
  const recorded = spawnGroup('sleep', ['60'], { pidFile })
  const unrelated = spawn('sleep', ['60'], { detached: true, stdio: 'ignore' })
  const unrelatedRecord = join(stale, 'unrelated.pid')
  await writeFile(unrelatedRecord, `${unrelated.pid}\n`)
  await writeFile(`${unrelatedRecord}.start`, 'wrong-process-identity\n')
  try {
    await sweep()
    await until(() => !groupAlive(recorded.child.pid))
    expect(groupAlive(unrelated.pid)).toBe(true)
  } finally {
    if (groupAlive(recorded.child.pid))
      await stopGroup(recorded.child.pid!, { leader: recorded, grace: 100 })
    if (groupAlive(unrelated.pid)) process.kill(-unrelated.pid!, 'SIGKILL')
    await rm(stale, { recursive: true, force: true })
  }
})

it('continues reaping owned groups when another stale record is invalid, and keeps that home', async () => {
  const stale = await staleHome()
  const valid = join(stale, 'valid', 'check.pid')
  const invalid = join(stale, 'invalid.pid')
  await mkdir(join(stale, 'valid'))
  await writeFile(invalid, 'not-a-pid\n')
  await writeFile(`${invalid}.start`, 'not-an-identity\n')
  const recorded = spawnGroup('sleep', ['60'], { pidFile: valid })
  const warning = vi.spyOn(console, 'warn').mockImplementation(() => {})
  try {
    await sweep()
    await until(() => !groupAlive(recorded.child.pid))
    expect(existsSync(stale)).toBe(true)
    expect(warning).toHaveBeenCalledOnce()
  } finally {
    warning.mockRestore()
    if (groupAlive(recorded.child.pid))
      await stopGroup(recorded.child.pid!, { leader: recorded, grace: 100 })
    await rm(stale, { recursive: true, force: true })
  }
})
