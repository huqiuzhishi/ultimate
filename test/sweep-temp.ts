import { readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { readPidFile, stopGroup } from '../lib/process-group.ts'
import { alive } from '../server/lock.ts'

/** Each test file's temporary directory, named after the worker that owns it so a later run can tell it is stale. */
export const testTempPrefix = 'ultimate-test-temp-'

function recordedGroups(directory: string): string[] {
  const files: string[] = []
  let entries
  try {
    entries = readdirSync(directory, { withFileTypes: true })
  } catch (error) {
    // Another test run may have swept the same stale home first.
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return files
    throw error
  }
  for (const entry of entries) {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) files.push(...recordedGroups(path))
    else if (entry.isFile() && entry.name.endsWith('.pid.start')) files.push(path.slice(0, -6))
  }
  return files
}

/**
 * Remove the temporary directories of test workers that are gone: a run that was interrupted (Ctrl-C, a killed
 * lander check, a teardown timeout) never reaches its `afterAll`, and the leftovers filled the machine's `/tmp`.
 */
export default async function sweep() {
  for (const name of readdirSync(tmpdir())) {
    const owner = Number(/^ultimate-test-temp-(\d+)-/.exec(name)?.[1])
    if (!owner || alive(owner)) continue
    const directory = join(tmpdir(), name)
    try {
      let cleaned = true
      for (const pidFile of recordedGroups(directory)) {
        try {
          const pid = await readPidFile(pidFile)
          if (pid) await stopGroup(pid, { pidFile })
        } catch (error) {
          cleaned = false
          console.warn(`Cannot sweep stale test process ${pidFile}; keeping ${directory}`, error)
        }
      }
      if (cleaned) rmSync(directory, { recursive: true, force: true })
    } catch (error) {
      console.warn(`Cannot sweep stale test home ${directory}; keeping it`, error)
    }
  }
}
