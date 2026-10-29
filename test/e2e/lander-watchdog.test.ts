import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { runLanderCheck } from '../../extensions/workspaces/lander.ts'
import { context } from '../../server/harness.ts'
import { removeTemp, temp } from '../helpers.ts'
import { processRunning } from './process.ts'

it('kills a silent process group on stall and a printing process on the total cap', async () => {
  const directory = await temp('ultimate-lander-watchdog-')
  try {
    for (const printing of [false, true]) {
      const pidFile = join(directory, 'pid')
      const childFile = join(directory, 'child')
      // Builtin output avoids an external sleep or runtime startup exceeding the deliberately tiny stall limit.
      const command = `echo $$ > '${pidFile}'; sleep 10 & echo $! > '${childFile}'; ${printing ? 'while true; do echo progress; done' : 'wait'}`
      const pids = join(directory, 'pids')
      const tmp = join(directory, 'tmp')
      const result = await runLanderCheck(directory, command, context, pids, tmp, {
        stall: 0.2,
        total: 0.5,
      })
      expect(await readdir(pids)).toEqual([])
      expect(await readdir(tmp)).toEqual([])
      expect(result.failure).toContain(printing ? 'Timed out after' : 'Stalled: no output for')
      expect(result.failure?.includes('progress')).toBe(printing)
      const pid = Number(await readFile(pidFile, 'utf8'))
      expect(() => process.kill(pid, 0)).toThrow('ESRCH')
      const child = Number(await readFile(childFile, 'utf8'))
      expect(processRunning(child)).toBe(false)
    }
  } finally {
    await removeTemp(directory)
  }
})
