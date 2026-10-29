import { execFileSync } from 'node:child_process'

/** Whether process `pid` still runs; a killed orphan may stay a zombie until init reaps it. */
export function processRunning(pid: number) {
  try {
    const state = execFileSync('ps', ['-o', 'stat=', '-p', String(pid)], {
      encoding: 'utf8',
    }).trim()
    return state !== '' && !state.startsWith('Z')
  } catch (error) {
    if ((error as { status?: number }).status === 1) return false
    throw error
  }
}
